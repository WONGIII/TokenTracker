/**
 * InsForge Edge：接收本地 CLI 上传的用量数据，写入 tokentracker_hourly。
 * 用 device token（SHA-256 hash）验证身份，用 service role key 写 DB。
 */
import { createClient } from "npm:@insforge/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-tokentracker-device-token-hash",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isLeaderboardBlockedUser(userId: string): boolean {
  return (Deno.env.get("LEADERBOARD_BLOCKED_USER_IDS") ?? "")
    .split(",")
    .some((candidate) => candidate.trim() === userId);
}

async function isUsageBlocked(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  if (isLeaderboardBlockedUser(userId)) return true;
  const { data, error } = await client.database
    .from("tokentracker_leaderboard_anomaly_flags")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "auto_excluded")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ingest] anomaly guard failed:", error.message);
    return false;
  }
  return Boolean(data);
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const deviceToken = authHeader?.replace(/^Bearer\s+/i, "");
  if (!deviceToken) return json({ error: "Missing bearer token" }, 401);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "Invalid JSON body" }, 400);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const serviceRoleKey = Deno.env.get("INSFORGE_SERVICE_ROLE_KEY");
  const incomingApiKey =
    req.headers.get("apikey") ?? req.headers.get("Apikey") ?? req.headers.get("x-api-key") ?? undefined;
  const anonKey =
    Deno.env.get("INSFORGE_ANON_KEY") ?? Deno.env.get("ANON_KEY") ?? incomingApiKey ?? undefined;
  if (!serviceRoleKey) return json({ error: "server misconfigured" }, 500);

  const client = createClient({
    baseUrl,
    edgeFunctionToken: serviceRoleKey,
    anonKey,
    ...(anonKey ? { headers: { apikey: anonKey } } : {}),
  });

  const tokenHash = await sha256Hex(deviceToken);

  const { data: tokenRow, error: tokenErr } = await client.database
    .from("tokentracker_device_tokens")
    .select("user_id, device_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (tokenErr) return json({ error: tokenErr.message }, 500);
  if (!tokenRow) return json({ error: "Unauthorized" }, 401);

  const userId = (tokenRow as { user_id: string }).user_id;
  const deviceId = (tokenRow as { device_id: string }).device_id;

  // Revoking known tokens is not sufficient when another issuance request is
  // already in flight. The blocklist is the final write-path authorization.
  if (await isUsageBlocked(client, userId)) {
    return json({ error: "Account blocked" }, 403);
  }

  const buckets = Array.isArray(body.buckets)
    ? body.buckets
    : Array.isArray(body.hourly)
      ? body.hourly
      : [];

  // Account session states (kind: "account_session_state" queue records)
  // are canonical observations of one provider-side session (trae-cn):
  // identity is (user, source, session_id) - device_id is NOT identity, so
  // every device of the account converges onto the same row via the LWW
  // upsert rpc. Downward / model / bucket corrections are one whole-row
  // replace; absence never deletes (contract NOT PROVEN). A states-only
  // batch is a meaningful upload and must not fall into the no-buckets
  // reject.
  const rawStates = Array.isArray(body.account_session_states) ? body.account_session_states : [];
  if (rawStates.length > 500) {
    return json({ error: "Too many account session states (max 500)" }, 400);
  }
  const TOKEN_KEYS = [
    "input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "cache_creation_input_tokens",
    "reasoning_output_tokens",
    "total_tokens",
  ] as const;
  const states: Record<string, unknown>[] = [];
  for (const r of rawStates) {
    const source = typeof r?.source === "string" ? r.source.trim().toLowerCase() : "";
    const sessionId = typeof r?.session_id === "string" ? r.session_id.trim() : "";
    const model = typeof r?.model === "string" ? r.model.trim() : "";
    const bucketStart = Date.parse(String(r?.bucket_start ?? ""));
    const verifiedAt = Date.parse(String(r?.snapshot_verified_at ?? ""));
    const tokens: Record<string, number> = {};
    let tokensOk = true;
    for (const k of TOKEN_KEYS) {
      const v = Number(r?.[k]);
      if (!Number.isSafeInteger(v) || v < 0) tokensOk = false;
      else tokens[k] = v;
    }
    // Fail closed on a malformed state record: a bogus canonical session row
    // would corrupt the account's cross-device truth. The parser guarantees
    // total = input + cached + cacheCreation + output; enforce it here too.
    if (
      source !== "trae-cn" ||
      !sessionId ||
      sessionId.length > 256 ||
      !model ||
      model.length > 200 ||
      !Number.isFinite(bucketStart) ||
      !Number.isFinite(verifiedAt) ||
      !tokensOk ||
      tokens.total_tokens !==
        tokens.input_tokens + tokens.cached_input_tokens + tokens.cache_creation_input_tokens + tokens.output_tokens
    ) {
      return json({ error: "Invalid account session state" }, 400);
    }
    states.push({
      source,
      session_id: sessionId,
      model,
      bucket_start: new Date(bucketStart).toISOString(),
      snapshot_verified_at: new Date(verifiedAt).toISOString(),
      ...tokens,
    });
  }
  // Same-session collisions inside one batch would make the LWW upsert's
  // ON CONFLICT affect a row twice (Postgres error). Keep the LAST record:
  // the append-only CLI queue writes later records with newer stamps.
  const stateMap = new Map<string, Record<string, unknown>>();
  for (const r of states) stateMap.set(r.source + "|" + r.session_id, r);
  const stateRows = Array.from(stateMap.values());

  // An empty batch is a legitimate request: the client sends one to ask which account
  // its device token writes as, without storing anything. That probe runs whenever a
  // sync had nothing to upload, and rejecting it with 400 meant the answer never
  // arrived — so a re-login onto a different account went unnoticed and the endpoint
  // logged a 400 on every idle sync.
  if (Array.isArray(buckets) && buckets.length > 0 && stateRows.length === 0) {
    // fall through: real rows to write
  }
  if (!Array.isArray(buckets)) {
    return json({ error: "Invalid hourly payload" }, 400);
  }
  if (buckets.length > 500) {
    return json({ error: "Too many buckets (max 500)" }, 400);
  }

  const mappedRows = buckets.map((b: Record<string, unknown>) => ({
    user_id: userId,
    device_id: deviceId,
    hour_start: b.hour_start,
    source: b.source || "unknown",
    model: b.model || "unknown",
    input_tokens: b.input_tokens || 0,
    cached_input_tokens: b.cached_input_tokens || 0,
    cache_creation_input_tokens: b.cache_creation_input_tokens || 0,
    output_tokens: b.output_tokens || 0,
    reasoning_output_tokens: b.reasoning_output_tokens || 0,
    total_tokens: b.total_tokens || 0,
    billable_total_tokens: b.billable_total_tokens || 0,
    total_cost_usd: Number(b.total_cost_usd) || 0,
    // The CLI queue rows name this field `conversation_count`; older upload
    // paths sent `conversations`. Reading only `conversations` zeroed the
    // column for every CLI upload since 2026-04-18 — accept both.
    conversations: b.conversation_count ?? b.conversations ?? 0,
  }));

  // Dedupe within the batch by (hour_start, source, model), keeping the row
  // with the largest total_tokens. The CLI's queue.jsonl is append-only and
  // re-emits the same logical bucket multiple times as a session fills out
  // (each emission carries the cumulative running total, so MAX wins). Two
  // rows sharing the conflict key in one upsert make Postgres throw
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" and
  // reject the entire batch — which stalled all clients until this dedupe.
  const dedupedMap = new Map<string, typeof mappedRows[number]>();
  for (const r of mappedRows) {
    const key = `${r.hour_start}|${r.source}|${r.model}`;
    const prev = dedupedMap.get(key);
    if (!prev || (Number(r.total_tokens) || 0) > (Number(prev.total_tokens) || 0)) {
      dedupedMap.set(key, r);
    }
  }
  const rows = Array.from(dedupedMap.values());

  const { error: upsertErr } = await client.database
    .from("tokentracker_hourly")
    .upsert(rows, {
      onConflict: "user_id,device_id,hour_start,source,model",
    });

  if (upsertErr) return json({ error: upsertErr.message }, 500);

  if (stateRows.length > 0) {
    // Write AFTER the bucket rows of the same upload landed, so canonical
    // session state never advances for an upload whose device-level rows
    // failed. The rpc applies a STRICTLY-newer LWW guard
    // (EXCLUDED.snapshot_verified_at > stored): replays are idempotent and
    // a transport retry of an older observation can never displace a newer
    // one. Equal-stamp conflicts keep the first-applied row (stable under
    // retries).
    const { error: stateErr } = await client.database.rpc(
      "tokentracker_upsert_account_session_states",
      { p_user_id: userId, p_states: stateRows },
    );
    if (stateErr) return json({ error: stateErr.message }, 500);
  }

  // Late history. A first sync uploads a back-catalogue whose dates sit below the rollup
  // watermark, and the incremental rollup never looks back — so that account's leaderboard
  // entry would read ~0 until a scheduled repair came around. When a batch actually
  // reaches back past the watermark, rebuild here instead: the write completes with the
  // rollup already correct, so the very next read of the leaderboard is complete.
  // Ordinary incremental syncs are entirely above the watermark and never trip this.
  try {
    const oldest = mappedRows.reduce<string | null>(
      (min, row) => {
        const at = typeof row.hour_start === "string" ? row.hour_start : null;
        if (!at) return min;
        return !min || at < min ? at : min;
      },
      null,
    );
    if (oldest) {
      const { data: metaRows } = await client.database
        .from("tokentracker_leaderboard_rollup_meta_v2")
        .select("through")
        .eq("id", 1)
        .limit(1);
      const through = Array.isArray(metaRows) && typeof metaRows[0]?.through === "string"
        ? (metaRows[0].through as string)
        : null;
      if (through && oldest < through) {
        const { error: repairErr } = await client.database.rpc(
          "leaderboard_rollup_repair_if_needed",
        );
        if (repairErr) {
          console.error("[ingest] rollup repair failed:", repairErr.message);
        }
      }
    }
  } catch (error) {
    // Never fail an upload over this: the data is already stored and the scheduled
    // refresh repairs it regardless.
    console.error(
      "[ingest] rollup repair skipped:",
      error instanceof Error ? error.message : String(error),
    );
  }

  // The client needs to know WHICH account this device token writes as. A token
  // re-issued after a re-login can belong to a different user, and a client that
  // keeps assuming the old identity files fresh history under the wrong account
  // (this happened: a test login hijacked the relayed session and 6e9 tokens were
  // attributed to it). Returning the id lets the client notice and re-send its
  // whole queue under the correct owner.
  return json({ ok: true, inserted: rows.length, skipped: 0, user_id: userId });
}
