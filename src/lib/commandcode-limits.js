// CommandCode subscription usage limits.
//
// Data source (authoritative, mirrors the CLI's own `/usage` overlay in
// command-code 1.49.1):
//
//   GET https://api.commandcode.ai/alpha/whoami?limits=1
//   GET https://api.commandcode.ai/alpha/billing/credits[?orgId=...]
//   GET https://api.commandcode.ai/alpha/billing/subscriptions[?orgId=...]
//
// with `Authorization: Bearer <apiKey>`. The credits payload carries
// `windowLimits: { limited, fiveHour: { used, cap, resetAt }, weekly: {...} }`
// (resetAt is epoch milliseconds) plus a `credits` balance object; the
// subscription payload carries `{ data: { planId, status, ... } }`.
//
// Auth resolution mirrors the CLI: `COMMAND_CODE_API_KEY` wins, otherwise the
// `apiKey` field of `~/.commandcode/auth.json` (prod; written 0600 by
// `cmd login`, never edited by hand). No key -> `{ configured: false }` so the
// Limits panel hides the section instead of erroring.
//
// The API exposes 5h + weekly rolling caps; extra pay-as-you-go credits
// bypass the caps server-side, so the reported used/cap needs no adjustment.

const fs = require("node:fs");
const path = require("node:path");

const COMMANDCODE_API_BASE_URL = "https://api.commandcode.ai";
const COMMANDCODE_API_KEY_ENV = "COMMAND_CODE_API_KEY";
const COMMANDCODE_AUTH_DIRNAME = ".commandcode";
const COMMANDCODE_AUTH_FILENAME = "auth.json";

// Request timeouts are enforced by the caller: usage-limits.js passes a
// withFetchTimeout-wrapped fetchImpl (per-request AbortSignal timeout), so this
// module takes no timeout of its own.

// Rolling window lengths are plan-independent and documented
// (https://commandcode.ai/docs/resources/usage-limits): 5h + 7d.
const COMMANDCODE_SESSION_WINDOW_SECONDS = 5 * 60 * 60;
const COMMANDCODE_WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Explicit `home`/env HOME only — never os.homedir() — so a synthetic test env
// (no home, no HOME) discovers nothing and tests stay isolated from the
// developer's real ~/.commandcode (cf. resolveOpencodeDataDir).
function resolveCommandcodeHome({ home, env = process.env } = {}) {
  if (isNonEmptyString(home)) return home.trim();
  const envHome = env && typeof env === "object" ? env.HOME : null;
  if (isNonEmptyString(envHome)) return envHome.trim();
  return null;
}

function resolveCommandcodeAuthPath({ home, env = process.env } = {}) {
  const dir = resolveCommandcodeHome({ home, env });
  if (!dir) return null;
  return path.join(dir, COMMANDCODE_AUTH_DIRNAME, COMMANDCODE_AUTH_FILENAME);
}

function readCommandcodeApiKey({ home, env = process.env } = {}) {
  const fromEnv =
    env && typeof env === "object" ? env[COMMANDCODE_API_KEY_ENV] : null;
  if (isNonEmptyString(fromEnv)) return fromEnv.trim();
  const authPath = resolveCommandcodeAuthPath({ home, env });
  if (!authPath) return null;
  let raw;
  try {
    raw = fs.readFileSync(authPath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isNonEmptyString(parsed?.apiKey) ? parsed.apiKey.trim() : null;
}

function normalizeResetAt(value) {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value === "number" ||
    /^\d+(?:\.\d+)?$/.test(String(value).trim())
  ) {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const milliseconds = raw > 10_000_000_000 ? raw : raw * 1000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function clampPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

function buildWindow({ usedPercent, resetAt, windowSeconds = null }) {
  const pct = clampPercent(usedPercent);
  if (pct === null) return null;
  const window = {
    used_percent: pct,
    reset_at: typeof resetAt === "string" && resetAt ? resetAt : null,
  };
  if (Number.isFinite(windowSeconds) && windowSeconds > 0) {
    window.limit_window_seconds = windowSeconds;
  }
  return window;
}

// Upstream window rows are `{ used, cap, resetAt }` (epoch ms). Tolerate the
// snake_case spellings other providers use so a server rename stays a miss on
// one window, not a crash.
function normalizeCommandcodeWindow(raw, windowSeconds) {
  if (!raw || typeof raw !== "object") return null;
  // Missing or malformed usage is unknown, not an unused (0%) window.
  const numeric = (value) => typeof value === "number"
    || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
  if (!numeric(raw.used) || !numeric(raw.cap ?? raw.total ?? raw.limit)) return null;
  const used = Number(raw.used);
  const cap = Number(raw.cap ?? raw.total ?? raw.limit);
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0 || used < 0)
    return null;
  return buildWindow({
    usedPercent: (used / cap) * 100,
    resetAt: normalizeResetAt(raw.resetAt ?? raw.reset_at ?? raw.reset),
    windowSeconds,
  });
}

// Plan tiers (longest prefix first, mirroring the CLI's own getPlanInfo
// matching in command-code). Unknown ids -> null, so the Limits panel renders
// the bare "Command Code" brand (cf. Kimi/Grok — a raw id like
// `individual-pro-v1` reads as garbage).
const COMMANDCODE_PLAN_TIERS = [
  ["individual-pro-v1", "Pro"],
  ["individual-provider", "Provider"],
  ["individual-goat", "GOAT"],
  ["individual-go", "Go"],
  ["individual-pro", "Pro"],
  ["individual-max", "Max"],
  ["individual-ultra", "Ultra"],
  ["teams-pro", "Teams Pro"],
];

function deriveCommandcodePlanLabel(rawPlanId) {
  if (!isNonEmptyString(rawPlanId)) return null;
  const normalized = rawPlanId.trim().toLowerCase().replace(/_/g, "-");
  for (const [prefix, label] of COMMANDCODE_PLAN_TIERS) {
    if (normalized.startsWith(prefix)) return label;
  }
  return null;
}

function normalizeCommandcodeWindowLimits(windowLimits) {
  if (!windowLimits || typeof windowLimits !== "object") return null;
  const fiveHour = normalizeCommandcodeWindow(
    windowLimits.fiveHour ?? windowLimits.five_hour,
    COMMANDCODE_SESSION_WINDOW_SECONDS,
  );
  const weekly = normalizeCommandcodeWindow(
    windowLimits.weekly,
    COMMANDCODE_WEEKLY_WINDOW_SECONDS,
  );
  if (!fiveHour && !weekly) return null;

  return { fiveHour, weekly };
}

// The Bearer apiKey travels on every request, so the origin must be https.
// Plain http is accepted for loopback only (local staging/dev servers).
function resolveCommandcodeOrigin(baseUrl) {
  const origin = String(baseUrl || COMMANDCODE_API_BASE_URL).replace(
    /\/+$/,
    "",
  );
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("CommandCode API base URL is invalid.");
  }
  const loopback = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(
    parsed.hostname,
  );
  if (parsed.protocol !== "https:" && !loopback) {
    throw new Error(
      "CommandCode API base URL must use https (http is loopback-only).",
    );
  }
  return origin;
}

function commandcodeHeaders(apiKey) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

async function fetchCommandcodeJson({ url, apiKey, fetchImpl, label }) {
  let response;
  try {
    response = await fetchImpl(url, { headers: commandcodeHeaders(apiKey) });
  } catch (error) {
    throw new Error(
      `CommandCode ${label} request failed: ${error?.message || "network error"}`,
    );
  }
  if (response?.status === 401 || response?.status === 403) {
    const error = new Error(
      "CommandCode token expired — run `cmd login` (macOS/Linux) or `cmdc auth login` (Windows) to refresh.",
    );
    error.code = "AUTH_EXPIRED";
    throw error;
  }
  if (!response?.ok) {
    throw new Error(
      `CommandCode ${label} request failed (HTTP ${response?.status ?? "?"}).`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} response was not JSON.`);
  }
}

function withOrgParam(route, orgId) {
  if (orgId === null || orgId === undefined || String(orgId).trim() === "")
    return route;
  return `${route}?orgId=${encodeURIComponent(String(orgId).trim())}`;
}

// Returns `{ configured: false }` without credentials, or the normalized limits
// object on success. Auth expiry throws with `code: "AUTH_EXPIRED"` and every
// other transport/schema failure throws a readable Error — the aggregator in
// usage-limits.js converts both into the panel row.
async function fetchCommandcodeLimits({
  home,
  env = process.env,
  fetchImpl = fetch,
  baseUrl = COMMANDCODE_API_BASE_URL,
  // Multi-account support: an explicit key wins over the local auth.json.
  apiKey: apiKeyOverride,
} = {}) {
  const apiKey =
    (typeof apiKeyOverride === "string" && apiKeyOverride.trim()) || readCommandcodeApiKey({ home, env });
  if (!apiKey) return { configured: false };

  const origin = resolveCommandcodeOrigin(baseUrl);
  const whoami = await fetchCommandcodeJson({
    url: `${origin}/alpha/whoami?limits=1`,
    apiKey,
    fetchImpl,
    label: "account lookup",
  });
  const orgId = whoami?.data?.org?.id ?? whoami?.org?.id ?? null;

  const [creditsBody, subscriptionBody] = await Promise.all([
    fetchCommandcodeJson({
      url: `${origin}${withOrgParam("/alpha/billing/credits", orgId)}`,
      apiKey,
      fetchImpl,
      label: "credits lookup",
    }),
    fetchCommandcodeJson({
      url: `${origin}${withOrgParam("/alpha/billing/subscriptions", orgId)}`,
      apiKey,
      fetchImpl,
      label: "subscription lookup",
    }),
  ]);

  const windows = normalizeCommandcodeWindowLimits(creditsBody?.windowLimits);
  if (!windows) {
    throw new Error("CommandCode credits response is missing windowLimits.");
  }
  const subscription = subscriptionBody?.data ?? subscriptionBody ?? null;
  const planId = isNonEmptyString(subscription?.planId)
    ? subscription.planId.trim()
    : null;

  return {
    configured: true,
    error: null,
    plan_label: deriveCommandcodePlanLabel(planId),
    subscription_status: isNonEmptyString(subscription?.status)
      ? subscription.status.trim()
      : null,
    primary_window: windows.fiveHour,
    secondary_window: windows.weekly,
    stale: false,
    cached_at: new Date().toISOString(),
  };
}

module.exports = {
  COMMANDCODE_API_BASE_URL,
  COMMANDCODE_API_KEY_ENV,
  COMMANDCODE_SESSION_WINDOW_SECONDS,
  COMMANDCODE_WEEKLY_WINDOW_SECONDS,
  resolveCommandcodeHome,
  resolveCommandcodeAuthPath,
  readCommandcodeApiKey,
  deriveCommandcodePlanLabel,
  normalizeResetAt,
  normalizeCommandcodeWindow,
  normalizeCommandcodeWindowLimits,
  resolveCommandcodeOrigin,
  fetchCommandcodeLimits,
};
