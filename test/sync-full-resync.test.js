const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { cmdSync } = require("../src/commands/sync");

// The sync rebuilds the queue from the provider logs it can see, so a hand-written
// queue file is not enough: on a machine with no fixtures the queue is re-derived and
// ends up empty, which made this test depend on the developer's own logs. Each case
// writes a real (tiny) DeepSeek Harness session log and points TOKENTRACKER_DSH_HOME
// at it, so the fixture is the only source on any platform.

async function writeDshSession(dshHome, { createdAt = Date.UTC(2026, 8, 16, 9, 0, 0) } = {}) {
  const sessionId = "session-11111111-2222-3333-4444-555555555555";
  const sessionDir = path.join(dshHome, "sessions", "--D-demo--", sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const lines = [JSON.stringify({
    type: "session", version: 0, id: sessionId, createdAt, cwd: "/demo", delegationDepth: 0,
  })];
  for (let i = 0; i < 6; i += 1) {
    const at = createdAt + (i + 1) * 60_000;
    lines.push(JSON.stringify({ type: "turn/start", seq: i * 3 + 1, time: at, data: {} }));
    lines.push(JSON.stringify({
      type: "assistant/message",
      seq: i * 3 + 2,
      time: at + 1000,
      data: {
        usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, totalTokens: 120 },
        message: { source: { model: "deepseek/deepseek-v4.1-flash" } },
      },
    }));
    lines.push(JSON.stringify({ type: "turn/end", seq: i * 3 + 3, time: at + 2000, data: {} }));
  }
  await fs.writeFile(path.join(sessionDir, "session.jsonl"), lines.join("\n") + "\n");
}

async function withTempHome(fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "tt-full-resync-"));
  const saved = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    DSH_HOME: process.env.TOKENTRACKER_DSH_HOME,
    DEVICE_TOKEN: process.env.TOKENTRACKER_DEVICE_TOKEN,
    fetch: global.fetch,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.TOKENTRACKER_DSH_HOME = path.join(home, ".dsh");
  // Without this the sync reports "Uploaded: skipped (no device token)" on macOS.
  process.env.TOKENTRACKER_DEVICE_TOKEN = "test-device-token";
  try {
    const trackerDir = path.join(home, ".tokentracker", "tracker");
    await fs.mkdir(trackerDir, { recursive: true });
    await fs.writeFile(path.join(trackerDir, "config.json"), JSON.stringify({
      baseUrl: "https://tt.977744.xyz",
      anonKey: "anon_test",
      deviceToken: "test-device-token",
      machineId: "machine-1",
    }, null, 2));
    await fn({ home, trackerDir });
  } finally {
    process.env.HOME = saved.HOME;
    process.env.USERPROFILE = saved.USERPROFILE;
    if (saved.DSH_HOME === undefined) delete process.env.TOKENTRACKER_DSH_HOME;
    else process.env.TOKENTRACKER_DSH_HOME = saved.DSH_HOME;
    if (saved.DEVICE_TOKEN === undefined) delete process.env.TOKENTRACKER_DEVICE_TOKEN;
    else process.env.TOKENTRACKER_DEVICE_TOKEN = saved.DEVICE_TOKEN;
    global.fetch = saved.fetch;
    await fs.rm(home, { recursive: true, force: true });
  }
}

function stubFetch(onIngest, reportingUserId) {
  global.fetch = async (url, init) => {
    if (String(url).endsWith("/functions/tokentracker-ingest")) {
      const body = JSON.parse(init.body);
      onIngest((body.hourly || []).length);
      return new Response(JSON.stringify({
        ok: true,
        inserted: (body.hourly || []).length,
        skipped: 0,
        user_id: reportingUserId,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("a token that writes as a different account re-uploads the whole queue", async () => {
  await withTempHome(async ({ home, trackerDir }) => {
    await writeDshSession(path.join(home, ".dsh"));
    const queuePath = path.join(trackerDir, "queue.jsonl");
    const statePath = path.join(trackerDir, "queue.state.json");

    // First pass: let the sync discover the fixture and queue its usage.
    stubFetch(() => {}, "user-a");
    await cmdSync(["--auto"]);
    const size = (await fs.stat(queuePath)).size;
    assert.ok(size > 0, "the fixture should have produced queue rows");

    // Then pretend a PREVIOUS account already uploaded everything (the offset sits at
    // the end) and that the user has just logged in again: a re-login re-issues the
    // device token, which is the signal that the identity has to be re-checked. With
    // the old token this run would legitimately do nothing.
    await fs.writeFile(statePath, JSON.stringify({
      offset: size,
      syncedUserId: "user-a",
      syncedDeviceToken: "device-token-before-relogin",
      updatedAt: new Date().toISOString(),
    }));

    let requests = 0;
    let rows = 0;
    process.env.TOKENTRACKER_DEVICE_TOKEN = "device-token-after-relogin";
    await fs.writeFile(path.join(trackerDir, "config.json"), JSON.stringify({
      baseUrl: "https://tt.977744.xyz",
      anonKey: "anon_test",
      deviceToken: "device-token-after-relogin",
      machineId: "machine-1",
    }, null, 2));
    stubFetch((n) => { requests += 1; rows += n; }, "user-b");
    await cmdSync(["--auto"]);

    assert.ok(requests > 0, "an identity change must force an upload even though the offset sat at the end");
    // The offset reset IS the re-send: it makes the next drain walk the whole queue.
    assert.ok(rows > 0, "the queue must actually be re-sent");
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    assert.equal(state.syncedUserId, "user-b", "the identity that accepted the upload is remembered");
    assert.equal(state.offset, (await fs.stat(queuePath)).size, "the queue ends up fully consumed again");
  });
});

test("the background caps stay bounded while the full resync gets its own budget", () => {
  // A background publication must not spend an unbounded tick on a huge queue, while
  // the resync after an identity change is exactly the case that has to finish the
  // whole history in one call.
  const source = require("node:fs").readFileSync(
    path.join(__dirname, "..", "src", "commands", "sync.js"),
    "utf8",
  );
  assert.match(source, /maxBatchesSmall: 20,/);
  assert.match(source, /maxBatchesLarge: 20,/);
  assert.match(source, /const drainWithToken = \(deviceToken, budgetOverride\) =>/);
  assert.match(source, /drainWithToken\(successfulDeviceToken, 1000\)/);
});
