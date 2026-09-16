const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { cmdSync } = require("../src/commands/sync");

// NOTE: these tests drive cmdSync with a queue that lives in a temp home. Sync also
// re-derives the queue from the machine's CLI logs, so row counts here are not a
// stable contract — what is asserted is the OFFSET/id marker behaviour, which is
// what "sync everything, then keep up" depends on.

function queueLines(count) {
  const rows = [];
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < count; i += 1) {
    rows.push(JSON.stringify({
      hour_start: new Date(base + i * 30 * 60 * 1000).toISOString(),
      source: "claude",
      model: "claude-opus-4-6",
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      conversation_count: 1,
    }));
  }
  return rows.join("\n") + "\n";
}

async function withTempHome(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tt-full-resync-"));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, fetch: global.fetch };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    const trackerDir = path.join(home, ".tokentracker", "tracker");
    await fs.mkdir(trackerDir, { recursive: true });
    await fs.writeFile(path.join(trackerDir, "config.json"), JSON.stringify({
      baseUrl: "https://tt.977744.xyz",
      anonKey: "anon_test",
      deviceToken: "device-token",
      machineId: "machine-1",
    }, null, 2));
    await fn({ home, trackerDir });
  } finally {
    process.env.HOME = saved.HOME;
    process.env.USERPROFILE = saved.USERPROFILE;
    global.fetch = saved.fetch;
    await fs.rm(home, { recursive: true, force: true });
  }
}

test("a token that writes as a different account re-uploads the whole queue", async () => {
  await withTempHome(async ({ trackerDir }) => {
    const queuePath = path.join(trackerDir, "queue.jsonl");
    const statePath = path.join(trackerDir, "queue.state.json");
    await fs.writeFile(queuePath, queueLines(300));
    // The whole queue was already uploaded — by a DIFFERENT account.
    await fs.writeFile(statePath, JSON.stringify({
      offset: (await fs.stat(queuePath)).size,
      syncedUserId: "user-a",
      updatedAt: new Date().toISOString(),
    }));

    // Start the offset at the end: without the resync this run would upload nothing.
    let requests = 0;
    let rows = 0;
    global.fetch = async (url, init) => {
      if (String(url).endsWith("/functions/tokentracker-ingest")) {
        requests += 1;
        const body = JSON.parse(init.body);
        rows += (body.hourly || []).length;
        return new Response(JSON.stringify({ ok: true, inserted: (body.hourly || []).length, skipped: 0, user_id: "user-b" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    await cmdSync(["--auto"]);

    assert.ok(requests > 0, "an identity change must force an upload even though the offset sat at the end");
    assert.ok(rows > 0, "the queue must actually be re-sent");
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    assert.equal(state.syncedUserId, "user-b", "the identity that actually accepted the upload is remembered");
    assert.equal(
      state.offset,
      (await fs.stat(queuePath)).size,
      "the queue must end up fully consumed again",
    );
  });
});

test("the auto-upload caps no longer stop a multi-batch queue", () => {
  // The caps used to be 5/5 — 1000 queue lines — which is what made a device with
  // more history than that need several syncs to finish.
  const source = require("node:fs").readFileSync(
    path.join(__dirname, "..", "src", "commands", "sync.js"),
    "utf8",
  );
  assert.doesNotMatch(source, /maxBatchesSmall: 5,/);
  assert.doesNotMatch(source, /maxBatchesLarge: 5,/);
  assert.match(source, /maxBatchesLarge: 1000,/);
  assert.match(source, /maxBatches = 500,/);
});
