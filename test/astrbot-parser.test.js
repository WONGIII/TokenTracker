"use strict";

// AstrBot (github.com/AstrBotDevs/AstrBot) adapter tests.
//
// The fixture mirrors the verified v4 schema: provider_stats holds one row per
// LLM request with token counters and Unix-SECONDS float timestamps, and
// conversations holds the session metadata the browser reads. Both tables are
// created from scratch so a schema drift in the adapter (a column rename, a
// switch to provider_id) fails here instead of silently reporting zero tokens.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");

let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (_e) { }

const sqliteCliProbe = typeof DatabaseSync === "function"
  ? null
  : cp.spawnSync("sqlite3", ["-version"], { windowsHide: true, encoding: "utf8" });
const sqliteTest = typeof DatabaseSync === "function" || sqliteCliProbe?.status === 0
  ? test
  : test.skip;

const {
  resolveAstrBotDbPaths,
  readAstrBotUsageRows,
  readAstrBotConversations,
  buildAstrBotUsageEvents,
  parseAstrBotIncremental,
} = require("../src/lib/rollout");
const { scanAstrBotSession, buildSessionAnalytics } = require("../src/lib/session-analytics");

// The half-hour UTC buckets the fixture rows below fall into, and their
// Unix-seconds start times.
const HOUR_START = "2026-09-18T16:00:00.000Z";
const NEXT_HOUR_START = "2026-09-18T16:30:00.000Z";
const START_1 = 1789748221.5; // 2026-09-18T16:17:01.500Z
const START_2 = 1789749000.25; // 2026-09-18T16:30:00.250Z

function executeSql(dbPath, sql) {
  if (typeof DatabaseSync === "function") {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(sql);
    } finally {
      db.close();
    }
    return;
  }
  cp.execFileSync("sqlite3", [dbPath, sql]);
}

function quote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function createAstrBotDb(dir) {
  const root = dir || fs.mkdtempSync(path.join(os.tmpdir(), "tt-astrbot-"));
  const dbPath = path.join(root, "data_v4.db");
  executeSql(dbPath, [
    "CREATE TABLE conversations (",
    "  created_at DATETIME NOT NULL,",
    "  updated_at DATETIME NOT NULL,",
    "  inner_conversation_id INTEGER NOT NULL,",
    "  conversation_id VARCHAR(36) NOT NULL,",
    "  platform_id VARCHAR NOT NULL,",
    "  user_id VARCHAR NOT NULL,",
    "  content JSON,",
    "  title VARCHAR(255),",
    "  persona_id VARCHAR,",
    "  token_usage INTEGER NOT NULL,",
    "  PRIMARY KEY (inner_conversation_id),",
    "  UNIQUE (conversation_id)",
    ");",
    "CREATE TABLE provider_stats (",
    "  created_at DATETIME NOT NULL,",
    "  updated_at DATETIME NOT NULL,",
    "  id INTEGER NOT NULL,",
    "  agent_type VARCHAR NOT NULL,",
    "  status VARCHAR NOT NULL,",
    "  umo VARCHAR NOT NULL,",
    "  conversation_id VARCHAR,",
    "  provider_id VARCHAR NOT NULL,",
    "  provider_model VARCHAR,",
    "  token_input_other INTEGER NOT NULL,",
    "  token_input_cached INTEGER NOT NULL,",
    "  token_output INTEGER NOT NULL,",
    "  start_time FLOAT NOT NULL,",
    "  end_time FLOAT NOT NULL,",
    "  time_to_first_token FLOAT NOT NULL,",
    "  PRIMARY KEY (id)",
    ");",
    "CREATE TABLE platform_message_history (id INTEGER PRIMARY KEY, content TEXT);",
  ].join("\n"));
  return { dir: root, dbPath };
}

function insertConversation(dbPath, options = {}) {
  const id = options.id;
  const title = options.title === undefined ? "Fixture conversation" : options.title;
  const platformId = options.platformId || "webchat";
  const createdAt = options.createdAt || "2026-09-18 16:17:00.961648";
  const updatedAt = options.updatedAt || "2026-09-18 16:17:20.095860";
  const userId = options.userId || "webchat:FriendMessage:someone";
  const innerId = Number(options.innerId || 1);
  const content = options.content === undefined ? null : options.content;
  executeSql(dbPath, [
    "INSERT INTO conversations (",
    "  created_at, updated_at, inner_conversation_id, conversation_id, platform_id,",
    "  user_id, content, title, persona_id, token_usage",
    ") VALUES (",
    "  " + quote(createdAt) + ", " + quote(updatedAt) + ", " + innerId + ",",
    "  " + quote(id) + ", " + quote(platformId) + ", " + quote(userId) + ",",
    "  " + (content === null ? "NULL" : quote(content)) + ",",
    "  " + (title === null ? "NULL" : quote(title)) + ", NULL, 0",
    ");",
  ].join("\n"));
}

function insertStat(dbPath, options = {}) {
  const id = Number(options.id);
  const conversationId = options.conversationId === undefined ? "conv-aaa" : options.conversationId;
  const model = options.model === undefined ? "deepseek/deepseek-v4.1-flash" : options.model;
  const umo = options.umo || "webchat:FriendMessage:someone";
  const input = Number(options.input || 0);
  const cached = Number(options.cached || 0);
  const output = Number(options.output || 0);
  const startTime = options.startTime === undefined ? START_1 : Number(options.startTime);
  const endTime = options.endTime === undefined ? startTime + 2 : Number(options.endTime);
  executeSql(dbPath, [
    "INSERT INTO provider_stats VALUES (",
    "  '2026-09-18 16:17:03.716995', '2026-09-18 16:17:03.716995', " + id + ",",
    "  'internal', 'completed', " + quote(umo) + ",",
    "  " + (conversationId === null ? "NULL" : quote(conversationId)) + ",",
    "  'p/one', " + quote(model) + ",",
    "  " + input + ", " + cached + ", " + output + ",",
    "  " + startTime + ", " + endTime + ", 1.25",
    ");",
  ].join("\n"));
}

function readQueue(queuePath) {
  if (!fs.existsSync(queuePath)) return [];
  return fs.readFileSync(queuePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

// Latest queue row per (source, model, hour_start) — readers take the last.
function latestBuckets(queuePath) {
  const out = new Map();
  for (const row of readQueue(queuePath)) {
    out.set(row.source + "|" + row.model + "|" + row.hour_start, row);
  }
  return out;
}

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tt-astrbot-home-"));
}

// The launcher layout: one UUID-named instance directory per install.
function writeInstanceDb(home, uuid) {
  const dir = path.join(home, ".astrbot_launcher", "instances", uuid, "core", "data");
  fs.mkdirSync(dir, { recursive: true });
  const { dbPath } = createAstrBotDb(dir);
  return dbPath;
}
test("AstrBot resolver enumerates launcher instances, the desktop root and the overrides", () => {
  const home = makeHome();
  try {
    const first = writeInstanceDb(home, "11111111-1111-1111-1111-111111111111");
    const second = writeInstanceDb(home, "22222222-2222-2222-2222-222222222222");
    // An instance directory without a database yet must not be reported.
    fs.mkdirSync(path.join(home, ".astrbot_launcher", "instances",
      "33333333-3333-3333-3333-333333333333", "core", "data"), { recursive: true });
    const desktop = path.join(home, ".astrbot", "data", "data_v4.db");
    fs.mkdirSync(path.dirname(desktop), { recursive: true });
    fs.copyFileSync(first, desktop);
    const discovered = [desktop, first, second].sort();

    const env = { HOME: home, USERPROFILE: home };
    assert.deepEqual(resolveAstrBotDbPaths(env), discovered);

    // $ASTRBOT_ROOT is AstrBot's own root override (get_astrbot_root).
    const rootDir = path.join(home, "custom-root");
    const rootDb = path.join(rootDir, "data", "data_v4.db");
    fs.mkdirSync(path.dirname(rootDb), { recursive: true });
    fs.copyFileSync(first, rootDb);
    assert.ok(resolveAstrBotDbPaths({ ...env, ASTRBOT_ROOT: rootDir }).includes(rootDb));

    // An exact-file override that names an already discovered database collapses
    // onto that one path instead of counting the same rows twice.
    assert.deepEqual(
      resolveAstrBotDbPaths({ ...env, TOKENTRACKER_ASTRBOT_DB: first }),
      discovered,
    );

    const homeOverride = path.join(home, "elsewhere");
    fs.mkdirSync(homeOverride, { recursive: true });
    const overridden = path.join(homeOverride, "data_v4.db");
    fs.copyFileSync(first, overridden);
    assert.deepEqual(
      resolveAstrBotDbPaths({ ...env, TOKENTRACKER_ASTRBOT_HOME: homeOverride }),
      [...discovered, overridden].sort(),
    );

    // A path that does not exist is never returned, whatever points at it.
    assert.deepEqual(
      resolveAstrBotDbPaths({
        ...env,
        TOKENTRACKER_ASTRBOT_DB: path.join(home, "nope.db"),
        ASTRBOT_ROOT: path.join(home, "ghost"),
        TOKENTRACKER_ASTRBOT_HOME: path.join(home, "ghost"),
      }),
      discovered,
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("AstrBot resolver reads the Windows home through USERPROFILE", () => {
  const home = makeHome();
  const other = makeHome();
  try {
    const dbPath = writeInstanceDb(home, "11111111-1111-1111-1111-111111111111");
    assert.deepEqual(
      resolveAstrBotDbPaths(
        { HOME: other, USERPROFILE: home },
        { platform: "win32" },
      ),
      [dbPath],
    );
    // The injected home (the session browser's own resolution) wins over the
    // environment, which is what keeps tests off the developer's real installs.
    assert.deepEqual(
      resolveAstrBotDbPaths({ HOME: other, USERPROFILE: other }, { nativeHome: home }),
      [dbPath],
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});
sqliteTest("AstrBot projection reads counters and identifiers but never message bodies", async () => {
  const { dir, dbPath } = createAstrBotDb();
  try {
    insertConversation(dbPath, { id: "conv-aaa", content: "PRIVATE TRANSCRIPT" });
    insertStat(dbPath, { id: 1, input: 100, cached: 20, output: 5 });
    executeSql(dbPath, "INSERT INTO platform_message_history VALUES (1, 'PRIVATE MESSAGE BODY');");

    const rows = await readAstrBotUsageRows(dbPath);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "conversation_id",
      "end_time",
      "id",
      "provider_model",
      "start_time",
      "token_input_cached",
      "token_input_other",
      "token_output",
      "umo",
    ]);
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE TRANSCRIPT|PRIVATE MESSAGE BODY/);

    const conversations = await readAstrBotConversations(dbPath);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].conversation_id, "conv-aaa");
    assert.doesNotMatch(JSON.stringify(conversations), /PRIVATE TRANSCRIPT/);

    // A missing database degrades to an empty read rather than throwing.
    assert.deepEqual(await readAstrBotUsageRows(path.join(dir, "missing.db")), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("AstrBot parser buckets provider_stats into half-hour UTC rows", async () => {
  const { dir, dbPath } = createAstrBotDb();
  const queuePath = path.join(dir, "queue.jsonl");
  try {
    insertConversation(dbPath, { id: "conv-aaa" });
    insertConversation(dbPath, { id: "conv-bbb", innerId: 2 });
    insertStat(dbPath, { id: 1, conversationId: "conv-aaa", input: 100, cached: 20, output: 5, startTime: START_1 });
    insertStat(dbPath, { id: 2, conversationId: "conv-aaa", input: 50, cached: 0, output: 7, startTime: START_1 + 10 });
    insertStat(dbPath, { id: 3, conversationId: "conv-bbb", input: 1, cached: 0, output: 2, startTime: START_2 });

    const cursors = {};
    const result = await parseAstrBotIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(result, {
      recordsProcessed: 3,
      eventsAggregated: 3,
      bucketsQueued: 2,
      projectBucketsQueued: 0,
    });

    const buckets = latestBuckets(queuePath);
    const first = buckets.get("astrbot|deepseek/deepseek-v4.1-flash|" + HOUR_START);
    assert.equal(first.input_tokens, 150);
    assert.equal(first.cached_input_tokens, 20);
    assert.equal(first.output_tokens, 12);
    assert.equal(first.cache_creation_input_tokens, 0);
    assert.equal(first.reasoning_output_tokens, 0);
    assert.equal(first.total_tokens, 182);
    assert.equal(first.conversation_count, 1, "a conversation pays its +1 once");
    const second = buckets.get("astrbot|deepseek/deepseek-v4.1-flash|" + NEXT_HOUR_START);
    assert.equal(second.total_tokens, 3);
    assert.equal(second.conversation_count, 1);

    // Per-row ledger keyed by provider_stats.id, under the database's own key.
    assert.deepEqual(Object.keys(cursors.astrbot.dbs), [path.resolve(dbPath)]);
    assert.deepEqual(
      Object.keys(cursors.astrbot.dbs[path.resolve(dbPath)].requests).sort(),
      ["1", "2", "3"],
    );

    // An unchanged database is a no-op: no SQL work, no new queue rows.
    const linesAfterFirst = readQueue(queuePath).length;
    const again = await parseAstrBotIncremental({ dbPath, cursors, queuePath });
    assert.deepEqual(again, {
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      projectBucketsQueued: 0,
    });
    assert.equal(readQueue(queuePath).length, linesAfterFirst);

    // A counter finalized after the first observation re-bases the row instead
    // of adding to it a second time.
    executeSql(dbPath, "UPDATE provider_stats SET token_output = 40 WHERE id = 1;");
    const rebased = await parseAstrBotIncremental({ dbPath, cursors, queuePath });
    assert.equal(rebased.eventsAggregated, 1);
    const afterUpdate = latestBuckets(queuePath)
      .get("astrbot|deepseek/deepseek-v4.1-flash|" + HOUR_START);
    assert.equal(afterUpdate.output_tokens, 47, "5 must be replaced by 40, not added to it");
    assert.equal(afterUpdate.total_tokens, 217);
    assert.equal(afterUpdate.conversation_count, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("AstrBot parser sums every discovered database and skips unfinalized rows", async () => {
  const home = makeHome();
  const queuePath = path.join(home, "queue.jsonl");
  const projectQueuePath = path.join(home, "project.queue.jsonl");
  try {
    const first = writeInstanceDb(home, "11111111-1111-1111-1111-111111111111");
    const second = writeInstanceDb(home, "22222222-2222-2222-2222-222222222222");
    const third = writeInstanceDb(home, "33333333-3333-3333-3333-333333333333");
    insertConversation(first, { id: "conv-aaa" });
    insertStat(first, { id: 1, conversationId: "conv-aaa", input: 10, output: 1, startTime: START_1 });
    insertConversation(second, { id: "conv-ccc" });
    insertStat(second, { id: 1, conversationId: "conv-ccc", input: 20, output: 2, startTime: START_1 });
    // Row ids are only unique inside one file: both installs use id 1 and both
    // contributions must survive.
    insertConversation(third, { id: "conv-ddd" });
    insertStat(third, { id: 2, conversationId: "conv-ddd", input: 0, cached: 0, output: 0, startTime: START_1 });

    const cursors = {};
    const result = await parseAstrBotIncremental({
      dbPaths: resolveAstrBotDbPaths({ HOME: home, USERPROFILE: home }),
      cursors,
      queuePath,
      projectQueuePath,
    });
    assert.equal(result.recordsProcessed, 3, "the unfinalized row is read, not counted");
    assert.equal(result.eventsAggregated, 2);
    assert.equal(result.projectBucketsQueued, 0);
    assert.equal(fs.existsSync(projectQueuePath), false, "AstrBot has no project attribution");

    const buckets = latestBuckets(queuePath);
    assert.equal(buckets.size, 1);
    const row = buckets.get("astrbot|deepseek/deepseek-v4.1-flash|" + HOUR_START);
    assert.equal(row.input_tokens, 30);
    assert.equal(row.output_tokens, 3);
    assert.equal(row.conversation_count, 2);

    // A conversation whose only request is still unfinalized pays nothing, and
    // pays its +1 once the counters land.
    executeSql(third, "UPDATE provider_stats SET token_output = 9 WHERE id = 2;");
    const finalized = await parseAstrBotIncremental({
      dbPaths: [first, second, third],
      cursors,
      queuePath,
      projectQueuePath,
    });
    assert.equal(finalized.eventsAggregated, 1);
    const updated = latestBuckets(queuePath)
      .get("astrbot|deepseek/deepseek-v4.1-flash|" + HOUR_START);
    assert.equal(updated.total_tokens, 42);
    assert.equal(updated.conversation_count, 3);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

sqliteTest("AstrBot parser falls back to the umo origin when a row has no conversation", async () => {
  const { dir, dbPath } = createAstrBotDb();
  const queuePath = path.join(dir, "queue.jsonl");
  try {
    insertStat(dbPath, { id: 1, conversationId: null, umo: "webchat:origin", input: 5, output: 5 });
    insertStat(dbPath, { id: 2, conversationId: null, umo: "webchat:origin", input: 5, output: 5, startTime: START_1 + 20 });
    const cursors = {};
    const result = await parseAstrBotIncremental({ dbPath, cursors, queuePath });
    assert.equal(result.eventsAggregated, 2);
    const row = latestBuckets(queuePath).get("astrbot|deepseek/deepseek-v4.1-flash|" + HOUR_START);
    assert.equal(row.total_tokens, 20);
    assert.equal(row.conversation_count, 1, "both rows share one origin key");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AstrBot usage events normalize model, semantics and timestamp precision", () => {
  const events = buildAstrBotUsageEvents([
    { id: 1, conversation_id: "c", umo: "u", provider_model: "   ", token_input_other: 1, token_input_cached: 2, token_output: 3, start_time: START_1, end_time: START_1 + 1 },
    { id: 2, conversation_id: "c", umo: "u", provider_model: "m", token_input_other: 0, token_input_cached: 0, token_output: 0, start_time: START_1, end_time: START_1 + 1 },
    { id: 3, conversation_id: "c", umo: "u", provider_model: "m", token_input_other: 1, token_input_cached: 0, token_output: 0, start_time: 0, end_time: 0 },
  ]);
  assert.equal(events.length, 1, "an all-zero counter set and a missing timestamp are not countable");
  assert.equal(events[0].model, "astrbot-unknown");
  assert.equal(events[0].totals.input_tokens, 1);
  assert.equal(events[0].totals.cached_input_tokens, 2);
  assert.equal(events[0].totals.total_tokens, 6);
  assert.equal(events[0].totals.cache_creation_input_tokens, 0);
  assert.equal(events[0].totals.reasoning_output_tokens, 0);
  assert.equal(events[0].tsMs, Math.round(START_1 * 1000));
});
sqliteTest("scanAstrBotSession builds one session row per conversation", async () => {
  const { dir, dbPath } = createAstrBotDb();
  try {
    insertConversation(dbPath, { id: "conv-aaa", title: "Fixture conversation", content: "PRIVATE TRANSCRIPT" });
    insertStat(dbPath, { id: 1, conversationId: "conv-aaa", input: 100, cached: 20, output: 5, startTime: START_1 });
    insertStat(dbPath, { id: 2, conversationId: "conv-aaa", input: 50, output: 7, startTime: START_1 + 10 });
    const conversations = await readAstrBotConversations(dbPath);
    const usageRows = await readAstrBotUsageRows(dbPath);

    const row = await scanAstrBotSession({
      dbPath,
      conversation: conversations[0],
      usageRows,
    });
    assert.equal(row.source, "astrbot");
    assert.equal(row.session_id, "conv-aaa");
    assert.equal(row.title, "Fixture conversation");
    assert.equal(row.model, "deepseek/deepseek-v4.1-flash");
    assert.equal(row.turns, 2);
    assert.equal(row.usage_events, 2);
    assert.equal(row.tokens.input_tokens, 150);
    assert.equal(row.tokens.cached_input_tokens, 20);
    assert.equal(row.tokens.output_tokens, 12);
    assert.equal(row.tokens.total_tokens, 182);
    assert.equal(row.started_at, "2026-09-18T16:17:00.961Z");
    assert.equal(row.ended_at, "2026-09-18T16:17:20.095Z");
    assert.equal(row.project_key, null, "an AstrBot conversation belongs to a chat platform");
    assert.equal(row.project_ref, null);
    assert.equal(row.model_usage.length, 1);
    assert.equal(row.model_usage[0].total_tokens, 182);
    assert.equal(row.provenance.content_retained, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

sqliteTest("buildSessionAnalytics discovers AstrBot conversations from the injected home", async () => {
  const home = makeHome();
  const savedEnv = {};
  for (const key of ["TOKENTRACKER_ASTRBOT_DB", "TOKENTRACKER_ASTRBOT_HOME", "ASTRBOT_ROOT"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  try {
    const first = writeInstanceDb(home, "11111111-1111-1111-1111-111111111111");
    const second = writeInstanceDb(home, "22222222-2222-2222-2222-222222222222");
    // Two conversations in one database exercise the per-conversation cache key:
    // a database-level key would collapse them onto a single sidecar entry.
    insertConversation(first, { id: "conv-aaa", title: "First", innerId: 1 });
    insertConversation(first, { id: "conv-bbb", title: "Second", innerId: 2 });
    insertStat(first, { id: 1, conversationId: "conv-aaa", input: 10, output: 1 });
    insertStat(first, { id: 2, conversationId: "conv-bbb", input: 20, output: 2 });
    insertConversation(second, { id: "conv-ccc", title: "Third", innerId: 1 });
    insertStat(second, { id: 1, conversationId: "conv-ccc", input: 30, output: 3 });

    const rows = await buildSessionAnalytics({ home, force: true });
    const astrbot = rows.filter((row) => row.source === "astrbot");
    assert.equal(astrbot.length, 3, "every conversation of every instance is browsable");
    assert.deepEqual(
      astrbot.map((row) => row.session_id).sort(),
      ["conv-aaa", "conv-bbb", "conv-ccc"],
    );
    const byId = new Map(astrbot.map((row) => [row.session_id, row]));
    assert.equal(byId.get("conv-aaa").tokens.input_tokens, 10);
    assert.equal(byId.get("conv-ccc").tokens.input_tokens, 30);
    assert.equal(byId.get("conv-ccc").title, "Third");

    // The sidecar is local-only, but it must still carry no transcript and no
    // platform-side account name.
    const sidecar = fs.readFileSync(path.join(home, ".tokentracker", "tracker", "session.queue.jsonl"), "utf8");
    assert.doesNotMatch(sidecar, /someone/);

    // A rebuild with an unchanged database reuses the cached rows.
    const again = await buildSessionAnalytics({ home, cacheTtlMs: 0 });
    assert.equal(again.filter((row) => row.source === "astrbot").length, 3);
  } finally {
    for (const key of ["TOKENTRACKER_ASTRBOT_DB", "TOKENTRACKER_ASTRBOT_HOME", "ASTRBOT_ROOT"]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
});
