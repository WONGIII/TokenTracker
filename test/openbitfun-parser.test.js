"use strict";

// OpenBitFun (github.com/GCWing/OpenBitFun) adapter tests.
//
// The fixture mirrors the verified v2 per-turn layout:
//   <home>/.openbitfun/projects/<project-key>/sessions/<session-id>/
//     metadata.json          session name/model/counts (no transcript)
//     turns/turn-NNNN.json   one file per turn, carrying tokenUsage
// Both are written from scratch so a schema drift in the adapter (a renamed
// counter, a different nesting for the model, a move away from per-turn files)
// fails here instead of silently reporting zero tokens.
//
// The turn fixtures deliberately contain a prompt, assistant text, thinking
// blocks and tool arguments: the adapter must never project or persist any of
// them, and the privacy assertions below fail the moment one leaks.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  resolveOpenBitFunHomes,
  listOpenBitFunSessions,
  resolveOpenBitFunTurnFiles,
  extractOpenBitFunTurnMetadata,
  openBitFunTurnTotals,
  parseOpenBitFunIncremental,
} = require("../src/lib/rollout");
const { scanOpenBitFunSession, buildSessionAnalytics } = require("../src/lib/session-analytics");

// The real install's own three consecutive turns of one session, used verbatim
// because they are the proof that the per-turn counters are incremental rather
// than cumulative: the third turn (764504 input) is larger than the second
// (20873), so a cumulative reading would be nonsense here.
const TURN_1_MS = 1789790350645; // 2026-09-19T03:59:10.645Z
const TURN_2_MS = 1789790676211; // 2026-09-19T04:04:36.211Z
const TURN_3_MS = 1789790869561; // 2026-09-19T04:07:49.561Z
const FIRST_BUCKET = "2026-09-19T03:30:00.000Z";
const SECOND_BUCKET = "2026-09-19T04:00:00.000Z";
const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";
const WORKSPACE_PATH = "D:\\opencode\\tokentracker";

const SECRET_PROMPT = "PRIVATE PROMPT BODY";
const SECRET_ASSISTANT = "PRIVATE ASSISTANT TEXT";
const SECRET_THINKING = "PRIVATE THINKING BLOCK";
const SECRET_TOOL_ARG = "PRIVATE TOOL ARGUMENT";

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tt-openbitfun-"));
}

function openBitFunRoot(home) {
  return path.join(home, ".openbitfun");
}

function sessionDir(home, projectKey, sessionId) {
  return path.join(openBitFunRoot(home), "projects", projectKey, "sessions", sessionId);
}

function writeMetadata(home, options) {
  const dir = sessionDir(home, options.projectKey, options.sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({
      schema_version: 2,
      sessionId: options.sessionId,
      sessionName: options.sessionName === undefined ? "Fixture session" : options.sessionName,
      agentType: "Ultimate",
      sessionKind: "standard",
      modelName: options.modelName === undefined ? DEFAULT_MODEL : options.modelName,
      createdAt: options.createdAt === undefined ? TURN_1_MS - 1000 : options.createdAt,
      lastActiveAt: options.lastActiveAt === undefined ? TURN_1_MS + 1000 : options.lastActiveAt,
      lastFinishedAt: options.lastFinishedAt === undefined ? TURN_1_MS + 1000 : options.lastFinishedAt,
      turnCount: options.turnCount === undefined ? 1 : options.turnCount,
      messageCount: 4,
      toolCallCount: 7,
      status: "active",
      workspacePath: options.workspacePath === undefined ? WORKSPACE_PATH : options.workspacePath,
      projectWorkspacePath:
        options.workspacePath === undefined ? WORKSPACE_PATH : options.workspacePath,
    }) + "\n",
  );
  return dir;
}

// One verified turn file. tokenUsage === null models a turn the app never
// billed (the openbitfun-control-* sessions); model === null models a turn that
// records no runtime_resolved_model_id, so metadata.json's modelName has to
// supply the model.
function writeTurn(home, options) {
  const dir = path.join(sessionDir(home, options.projectKey, options.sessionId), "turns");
  fs.mkdirSync(dir, { recursive: true });
  const index = Number(options.index || 0);
  const input = Number(options.input === undefined ? 100 : options.input);
  const output = Number(options.output === undefined ? 10 : options.output);
  const turn = {
    schema_version: 2,
    turnId: "dialog_" + options.timestampMs + "_abcdefghi",
    turnIndex: index,
    sessionId: options.sessionId,
    timestamp: options.timestampMs,
    kind: "user_dialog",
    agentType: "Ultimate",
    userMessage: {
      metadata:
        options.model === null
          ? { channel: "desktop" }
          : {
              runtime_resolved_model_id:
                options.model === undefined ? DEFAULT_MODEL : options.model,
              channel: "desktop",
            },
      content: SECRET_PROMPT,
    },
    modelRounds: [
      {
        id: "round-" + index,
        turnId: "dialog_" + options.timestampMs + "_abcdefghi",
        roundIndex: 0,
        timestamp: options.timestampMs + 5,
        textItems: [{ type: "text", text: SECRET_ASSISTANT }],
        toolItems: [{ name: "read_file", arguments: { path: SECRET_TOOL_ARG } }],
        thinkingItems: [{ type: "thinking", text: SECRET_THINKING }],
        startTime: options.timestampMs,
        endTime: options.timestampMs + 10,
        attemptCount: 1,
        status: "completed",
      },
    ],
    startTime: options.timestampMs,
    endTime: options.timestampMs + 10,
    finishReason: "complete",
    hasFinalResponse: true,
    status: "completed",
  };
  if (options.tokenUsage !== null) {
    turn.tokenUsage = options.tokenUsage || {
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      timestamp: options.timestampMs + 20,
    };
  }
  const filePath = path.join(
    dir,
    "turn-" + String(index).padStart(4, "0") + ".json",
  );
  fs.writeFileSync(filePath, JSON.stringify(turn, null, 2) + "\n");
  return filePath;
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

test("OpenBitFun resolver honours the overrides, the user home and deps.nativeHome", () => {
  const home = makeHome();
  const elsewhere = makeHome();
  try {
    const canonical = path.join(home, ".openbitfun");
    fs.mkdirSync(canonical, { recursive: true });
    const env = { HOME: home, USERPROFILE: home };
    assert.deepEqual(resolveOpenBitFunHomes(env), [canonical]);

    // TOKENTRACKER_OPENBITFUN_DIR names the data root itself.
    const explicit = path.join(elsewhere, "custom", ".openbitfun");
    fs.mkdirSync(explicit, { recursive: true });
    assert.deepEqual(
      resolveOpenBitFunHomes({ ...env, TOKENTRACKER_OPENBITFUN_DIR: explicit }),
      [canonical, explicit].sort(),
    );

    // The _HOME spellings name the user home that contains .openbitfun.
    const otherHome = path.join(elsewhere, "user-home");
    fs.mkdirSync(path.join(otherHome, ".openbitfun"), { recursive: true });
    assert.deepEqual(
      resolveOpenBitFunHomes({ ...env, OPENBITFUN_HOME: otherHome }),
      [canonical, path.join(otherHome, ".openbitfun")].sort(),
    );

    // A path that does not exist is never returned, whatever points at it.
    assert.deepEqual(
      resolveOpenBitFunHomes({
        ...env,
        TOKENTRACKER_OPENBITFUN_DIR: path.join(elsewhere, "nope"),
        TOKENTRACKER_OPENBITFUN_HOME: path.join(elsewhere, "ghost"),
      }),
      [canonical],
    );

    // The injected home is authoritative: an environment override must not be
    // able to drag the developer's real install into an isolated test.
    assert.deepEqual(
      resolveOpenBitFunHomes(
        { ...env, TOKENTRACKER_OPENBITFUN_DIR: explicit },
        { nativeHome: home },
      ),
      [canonical],
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("OpenBitFun resolver reads the Windows home through USERPROFILE", () => {
  const home = makeHome();
  const other = makeHome();
  try {
    const canonical = path.join(home, ".openbitfun");
    fs.mkdirSync(canonical, { recursive: true });
    assert.deepEqual(
      resolveOpenBitFunHomes({ HOME: other, USERPROFILE: home, APPDATA: undefined }, { platform: "win32" }),
      [canonical],
    );
    // The injected home (the session browser's own resolution) wins over the
    // environment, which is what keeps tests off the developer's real install.
    assert.deepEqual(
      resolveOpenBitFunHomes({ HOME: other, USERPROFILE: other }, { nativeHome: home }),
      [canonical],
    );
    // The Electron userData root is only an extra root when it really holds a
    // projects directory, so a plain userData directory is never mistaken for one.
    const appData = path.join(other, "AppData", "Roaming");
    fs.mkdirSync(path.join(appData, "openbitfun"), { recursive: true });
    assert.deepEqual(
      resolveOpenBitFunHomes(
        { HOME: home, USERPROFILE: home, APPDATA: appData },
        { platform: "win32" },
      ),
      [canonical],
    );
    fs.mkdirSync(path.join(appData, "openbitfun", "projects"), { recursive: true });
    assert.deepEqual(
      resolveOpenBitFunHomes(
        { HOME: home, USERPROFILE: home, APPDATA: appData },
        { platform: "win32" },
      ),
      [canonical, path.join(appData, "openbitfun")].sort(),
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("OpenBitFun turn projection reads counters, model and timestamp but no message content", () => {
  const home = makeHome();
  try {
    writeMetadata(home, { projectKey: "p", sessionId: "s" });
    const filePath = writeTurn(home, {
      projectKey: "p",
      sessionId: "s",
      timestampMs: TURN_1_MS,
      input: 40411,
      output: 571,
    });
    const raw = fs.readFileSync(filePath, "utf8");
    const turn = extractOpenBitFunTurnMetadata(raw);

    assert.equal(turn.sessionId, "s");
    assert.equal(turn.turnIndex, 0);
    assert.equal(turn.timestampMs, TURN_1_MS);
    assert.equal(turn.modelId, DEFAULT_MODEL);
    assert.equal(turn.usage.inputTokens, 40411);
    assert.equal(turn.usage.outputTokens, 571);
    assert.equal(turn.usage.totalTokens, 40982);

    // The projection is metadata only: none of the content the file carries may
    // appear in it (or in anything derived from it).
    const projected = JSON.stringify(turn);
    assert.doesNotMatch(projected, /PRIVATE PROMPT BODY|PRIVATE ASSISTANT TEXT|PRIVATE THINKING BLOCK|PRIVATE TOOL ARGUMENT/);

    const totals = openBitFunTurnTotals(turn);
    assert.equal(totals.input_tokens, 40411);
    assert.equal(totals.output_tokens, 571);
    assert.equal(totals.total_tokens, 40982);
    assert.equal(totals.cached_input_tokens, 0, "the format records no cache split");
    assert.equal(totals.cache_creation_input_tokens, 0);
    assert.equal(totals.reasoning_output_tokens, 0);
    assert.equal(totals.conversation_count, 1, "one turn is one conversation event");

    // A malformed or partial file degrades to nothing countable instead of
    // throwing, so one torn turn cannot fail the whole provider sync.
    assert.equal(openBitFunTurnTotals(extractOpenBitFunTurnMetadata("{")), null);
    assert.equal(openBitFunTurnTotals(extractOpenBitFunTurnMetadata("")), null);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("OpenBitFun parser buckets each turn into half-hour UTC rows and queues no content", async () => {
  const home = makeHome();
  const queuePath = path.join(home, "queue.jsonl");
  try {
    writeMetadata(home, {
      projectKey: "d--opencode-tokentracker",
      sessionId: "session-1",
      sessionName: "Fixture session",
      turnCount: 3,
    });
    writeTurn(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-1", index: 0, timestampMs: TURN_1_MS, input: 40411, output: 571 });
    writeTurn(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-1", index: 1, timestampMs: TURN_2_MS, input: 20873, output: 687 });
    writeTurn(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-1", index: 2, timestampMs: TURN_3_MS, input: 764504, output: 14527 });

    const cursors = {};
    const result = await parseOpenBitFunIncremental({ home, cursors, queuePath });
    assert.deepEqual(result, {
      recordsProcessed: 3,
      eventsAggregated: 3,
      bucketsQueued: 2,
      projectBucketsQueued: 0,
    });

    const buckets = latestBuckets(queuePath);
    assert.equal(buckets.size, 2);
    const first = buckets.get("openbitfun|" + DEFAULT_MODEL + "|" + FIRST_BUCKET);
    assert.equal(first.input_tokens, 40411);
    assert.equal(first.output_tokens, 571);
    assert.equal(first.total_tokens, 40982);
    assert.equal(first.cached_input_tokens, 0);
    assert.equal(first.cache_creation_input_tokens, 0);
    assert.equal(first.reasoning_output_tokens, 0);
    assert.equal(first.conversation_count, 1);
    const second = buckets.get("openbitfun|" + DEFAULT_MODEL + "|" + SECOND_BUCKET);
    assert.equal(second.input_tokens, 20873 + 764504, "per-turn counters are incremental, so they sum");
    assert.equal(second.output_tokens, 687 + 14527);
    assert.equal(second.total_tokens, 21560 + 779031);
    assert.equal(second.conversation_count, 2);

    // Nothing the turn files carried may reach the queue or the cursors.
    const persisted = fs.readFileSync(queuePath, "utf8") + JSON.stringify(cursors);
    assert.doesNotMatch(persisted, /PRIVATE PROMPT BODY|PRIVATE ASSISTANT TEXT|PRIVATE THINKING BLOCK|PRIVATE TOOL ARGUMENT/);
    assert.doesNotMatch(persisted, /dialog_/, "the turn id is not needed by any consumer");

    // Per-turn ledger keyed by the turn file's own path.
    const ledger = cursors.openbitfun.files;
    assert.equal(Object.keys(ledger).length, 3);
    const entry = ledger[Object.keys(ledger).sort()[0]];
    assert.equal(entry.sessionId, "session-1");
    assert.equal(entry.projectKey, "d--opencode-tokentracker");
    assert.equal(entry.model, DEFAULT_MODEL);
    assert.equal(entry.bucketStart, FIRST_BUCKET);
    assert.equal(entry.totals.total_tokens, 40982);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("OpenBitFun parser re-reads a rewritten turn instead of double counting it", async () => {
  const home = makeHome();
  const queuePath = path.join(home, "queue.jsonl");
  try {
    writeMetadata(home, { projectKey: "p", sessionId: "s" });
    const filePath = writeTurn(home, { projectKey: "p", sessionId: "s", timestampMs: TURN_1_MS, input: 100, output: 10 });

    const cursors = {};
    const first = await parseOpenBitFunIncremental({ home, cursors, queuePath });
    assert.equal(first.eventsAggregated, 1);

    // An unchanged tree is a no-op: no read, no queue row.
    const linesAfterFirst = readQueue(queuePath).length;
    const again = await parseOpenBitFunIncremental({ home, cursors, queuePath });
    assert.deepEqual(again, {
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      projectBucketsQueued: 0,
    });
    assert.equal(readQueue(queuePath).length, linesAfterFirst);

    // A turn file is rewritten in place while the turn runs: the new counters
    // must replace the old ones, not add to them.
    const original = fs.readFileSync(filePath, "utf8");
    fs.writeFileSync(filePath, original.replace('"inputTokens": 100', '"inputTokens": 400'));
    const rewritten = await parseOpenBitFunIncremental({ home, cursors, queuePath });
    assert.equal(rewritten.eventsAggregated, 1);
    const after = latestBuckets(queuePath).get("openbitfun|" + DEFAULT_MODEL + "|" + FIRST_BUCKET);
    assert.equal(after.input_tokens, 400, "100 must be replaced by 400, not added to it");
    assert.equal(after.output_tokens, 10);
    assert.equal(after.conversation_count, 1, "the turn still pays exactly one conversation");

    // A turn rewritten to a later half-hour moves its whole contribution.
    fs.writeFileSync(
      filePath,
      original
        .replace('"inputTokens": 100', '"inputTokens": 400')
        .replace('"timestamp": ' + TURN_1_MS, '"timestamp": ' + TURN_2_MS),
    );
    await parseOpenBitFunIncremental({ home, cursors, queuePath });
    const buckets = latestBuckets(queuePath);
    assert.equal(buckets.get("openbitfun|" + DEFAULT_MODEL + "|" + FIRST_BUCKET).input_tokens, 0);
    assert.equal(buckets.get("openbitfun|" + DEFAULT_MODEL + "|" + SECOND_BUCKET).input_tokens, 400);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("OpenBitFun parser skips turns without tokenUsage and falls back to metadata.json's model", async () => {
  const home = makeHome();
  const queuePath = path.join(home, "queue.jsonl");
  try {
    // The verified openbitfun-control-* shape: a turn with modelRounds but no
    // tokenUsage at all. It must count as a record (it is a real turn) and
    // contribute exactly zero tokens.
    writeMetadata(home, {
      projectKey: "c--control",
      sessionId: "openbitfun-control-2de91125",
      modelName: "primary",
      turnCount: 1,
    });
    writeTurn(home, {
      projectKey: "c--control",
      sessionId: "openbitfun-control-2de91125",
      timestampMs: TURN_1_MS,
      tokenUsage: null,
      model: null,
    });
    // A turn that records no runtime model id: metadata.json supplies the model.
    writeMetadata(home, { projectKey: "p", sessionId: "s", modelName: "meta/model-name" });
    writeTurn(home, { projectKey: "p", sessionId: "s", timestampMs: TURN_2_MS, model: null, input: 5, output: 5 });

    const cursors = {};
    const result = await parseOpenBitFunIncremental({ home, cursors, queuePath });
    assert.equal(result.recordsProcessed, 2, "the unbilled turn is read too");
    assert.equal(result.eventsAggregated, 1);
    assert.equal(result.bucketsQueued, 1);

    const buckets = latestBuckets(queuePath);
    assert.equal(buckets.size, 1);
    assert.equal(buckets.get("openbitfun|meta/model-name|" + SECOND_BUCKET).total_tokens, 10);

    // The unbilled turn keeps its fingerprint with a null contribution, so the
    // next sync neither re-reads it nor loses it if it is finalized later.
    const ledger = cursors.openbitfun.files;
    const unbilled = Object.values(ledger).find((entry) => entry.projectKey === "c--control");
    assert.ok(unbilled, "the unbilled turn is still ledgered");
    assert.equal(unbilled.totals, null);
    assert.equal(unbilled.model, null);
    assert.deepEqual(await parseOpenBitFunIncremental({ home, cursors, queuePath }), {
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      projectBucketsQueued: 0,
    });

    // Finalizing it later counts it exactly once.
    const controlTurn = path.join(
      sessionDir(home, "c--control", "openbitfun-control-2de91125"),
      "turns",
      "turn-0000.json",
    );
    const raw = JSON.parse(fs.readFileSync(controlTurn, "utf8"));
    raw.tokenUsage = { inputTokens: 7, outputTokens: 3, totalTokens: 10, timestamp: TURN_1_MS + 20 };
    fs.writeFileSync(controlTurn, JSON.stringify(raw, null, 2) + "\n");
    const finalized = await parseOpenBitFunIncremental({ home, cursors, queuePath });
    assert.equal(finalized.eventsAggregated, 1);
    const row = latestBuckets(queuePath).get("openbitfun|primary|" + FIRST_BUCKET);
    assert.equal(row.total_tokens, 10, "the finalized turn is counted once, not twice");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("OpenBitFun parser attributes usage to the project metadata.json names", async () => {
  const home = makeHome();
  const queuePath = path.join(home, "queue.jsonl");
  const projectQueuePath = path.join(home, "project.queue.jsonl");
  try {
    writeMetadata(home, {
      projectKey: "d--opencode-tokentracker",
      sessionId: "s-1",
      workspacePath: WORKSPACE_PATH,
    });
    writeTurn(home, { projectKey: "d--opencode-tokentracker", sessionId: "s-1", timestampMs: TURN_1_MS, input: 100, output: 10 });
    // A second project whose metadata.json is missing: the encoded directory
    // name would be its identity, but there is no path to show, and a project row
    // without a project_ref is refused by enqueueTouchedProjectBuckets. Its usage
    // still reaches the hourly buckets, it just gets no project panel row.
    writeTurn(home, { projectKey: "c--unreadable", sessionId: "s-2", timestampMs: TURN_1_MS, input: 1, output: 2 });

    const cursors = {};
    const result = await parseOpenBitFunIncremental({ home, cursors, queuePath, projectQueuePath });
    assert.equal(result.projectBucketsQueued, 1, "only the project with a recorded workspace path");

    const rows = readQueue(projectQueuePath);
    assert.equal(rows.length, 1);
    const byKey = new Map(rows.map((row) => [row.project_key, row]));
    assert.equal(byKey.get("d--opencode-tokentracker").project_ref, WORKSPACE_PATH);
    assert.equal(byKey.get("d--opencode-tokentracker").source, "openbitfun");
    assert.equal(byKey.get("d--opencode-tokentracker").input_tokens, 100);
    assert.equal(byKey.has("c--unreadable"), false);

    // Nothing was lost: the unreadable project's turn is in the hourly bucket.
    const hourly = latestBuckets(queuePath).get("openbitfun|" + DEFAULT_MODEL + "|" + FIRST_BUCKET);
    assert.equal(hourly.input_tokens, 101);
    assert.equal(hourly.output_tokens, 12);
    assert.equal(hourly.conversation_count, 2);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("scanOpenBitFunSession builds one session row per session directory", async () => {
  const home = makeHome();
  try {
    const projectKey = "d--opencode-tokentracker";
    const sessionId = "2dcea508-31fc-4d8e-a745-d16c45ba0be3";
    writeMetadata(home, {
      projectKey,
      sessionId,
      sessionName: "Fixture session",
      turnCount: 3,
      createdAt: TURN_1_MS - 1000,
      lastActiveAt: TURN_3_MS + 1000,
      lastFinishedAt: TURN_3_MS + 900,
    });
    writeTurn(home, { projectKey, sessionId, index: 0, timestampMs: TURN_1_MS, input: 40411, output: 571 });
    writeTurn(home, { projectKey, sessionId, index: 1, timestampMs: TURN_2_MS, input: 20873, output: 687 });
    writeTurn(home, { projectKey, sessionId, index: 2, timestampMs: TURN_3_MS, input: 764504, output: 14527 });

    const sessions = await listOpenBitFunSessions(openBitFunRoot(home));
    assert.equal(sessions.length, 1);
    const row = await scanOpenBitFunSession(sessions[0]);
    assert.equal(row.source, "openbitfun");
    assert.equal(row.session_id, sessionId);
    assert.equal(row.title, "Fixture session");
    assert.equal(row.model, DEFAULT_MODEL);
    assert.equal(row.turns, 3);
    assert.equal(row.usage_events, 3);
    assert.equal(row.tokens.input_tokens, 825788);
    assert.equal(row.tokens.output_tokens, 15785);
    assert.equal(row.tokens.cached_input_tokens, 0);
    assert.equal(row.tokens.total_tokens, 841573);
    assert.equal(row.started_at, new Date(TURN_1_MS - 1000).toISOString());
    assert.equal(row.ended_at, new Date(TURN_3_MS + 1000).toISOString());
    assert.equal(row.project_key, projectKey);
    assert.equal(row.project_ref, WORKSPACE_PATH);
    assert.equal(row.model_usage.length, 1);
    assert.equal(row.model_usage[0].total_tokens, 841573);
    assert.equal(row.tool_calls, 7);
    assert.equal(row.provenance.content_retained, false);
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE PROMPT BODY|PRIVATE ASSISTANT TEXT|PRIVATE THINKING BLOCK|PRIVATE TOOL ARGUMENT/);

    // A turn the app never billed is still a turn for the browser, it just does
    // not add tokens.
    const controlKey = "c--control";
    const controlId = "openbitfun-control-2de91125";
    writeMetadata(home, { projectKey: controlKey, sessionId: controlId, sessionName: "OpenBitFun", turnCount: 1 });
    writeTurn(home, { projectKey: controlKey, sessionId: controlId, timestampMs: TURN_1_MS, tokenUsage: null, model: null });
    const all = await listOpenBitFunSessions(openBitFunRoot(home));
    assert.equal(all.length, 2);
    const control = await scanOpenBitFunSession(all.find((entry) => entry.sessionId === controlId));
    assert.equal(control.turns, 1);
    assert.equal(control.usage_events, 0);
    assert.equal(control.tokens.total_tokens, 0);
    assert.equal(control.usage_precision, "unavailable");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("buildSessionAnalytics discovers OpenBitFun sessions from the injected home", async () => {
  const home = makeHome();
  const savedEnv = {};
  for (const key of ["TOKENTRACKER_OPENBITFUN_DIR", "TOKENTRACKER_OPENBITFUN_HOME", "OPENBITFUN_HOME"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  try {
    writeMetadata(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-tokens", sessionName: "First" });
    writeTurn(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-tokens", timestampMs: TURN_1_MS, input: 40411, output: 571 });
    // Two sessions in one project exercise the per-session cache key: a
    // project-level key would collapse them onto a single sidecar entry.
    writeMetadata(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-empty", sessionName: "Second", turnCount: 1 });
    writeTurn(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-empty", timestampMs: TURN_2_MS, tokenUsage: null });

    const rows = await buildSessionAnalytics({ home, force: true });
    const openbitfunRows = rows.filter((row) => row.source === "openbitfun");
    assert.equal(openbitfunRows.length, 2, "every session of every project is browsable");
    assert.deepEqual(
      openbitfunRows.map((row) => row.session_id).sort(),
      ["session-empty", "session-tokens"],
    );
    const byId = new Map(openbitfunRows.map((row) => [row.session_id, row]));
    assert.equal(byId.get("session-tokens").tokens.input_tokens, 40411);
    assert.equal(byId.get("session-tokens").title, "First");
    assert.equal(byId.get("session-empty").turns, 1);
    assert.equal(byId.get("session-empty").tokens.total_tokens, 0);

    // The sidecar is local-only, but it must still carry no transcript.
    const sidecar = fs.readFileSync(path.join(home, ".tokentracker", "tracker", "session.queue.jsonl"), "utf8");
    assert.doesNotMatch(sidecar, /PRIVATE PROMPT BODY|PRIVATE ASSISTANT TEXT|PRIVATE THINKING BLOCK|PRIVATE TOOL ARGUMENT/);

    // A rebuild with nothing changed reuses the cached rows.
    const again = await buildSessionAnalytics({ home, cacheTtlMs: 0 });
    assert.equal(again.filter((row) => row.source === "openbitfun").length, 2);

    // A new turn moves the session's stat key and rebuilds its row.
    writeTurn(home, { projectKey: "d--opencode-tokentracker", sessionId: "session-tokens", index: 1, timestampMs: TURN_3_MS, input: 1000, output: 100 });
    const refreshed = await buildSessionAnalytics({ home, cacheTtlMs: 0 });
    const refreshedById = new Map(
      refreshed.filter((row) => row.source === "openbitfun").map((row) => [row.session_id, row]),
    );
    assert.equal(refreshedById.get("session-tokens").turns, 2);
    assert.equal(refreshedById.get("session-tokens").tokens.input_tokens, 41411);
    assert.equal(refreshedById.get("session-tokens").tokens.total_tokens, 42082);
  } finally {
    for (const key of ["TOKENTRACKER_OPENBITFUN_DIR", "TOKENTRACKER_OPENBITFUN_HOME", "OPENBITFUN_HOME"]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("OpenBitFun resolver enumerates the turn files of every project", async () => {
  const home = makeHome();
  try {
    writeMetadata(home, { projectKey: "a--one", sessionId: "s-1" });
    writeTurn(home, { projectKey: "a--one", sessionId: "s-1", timestampMs: TURN_1_MS });
    writeMetadata(home, { projectKey: "b--two", sessionId: "s-2" });
    writeTurn(home, { projectKey: "b--two", sessionId: "s-2", index: 0, timestampMs: TURN_1_MS });
    writeTurn(home, { projectKey: "b--two", sessionId: "s-2", index: 1, timestampMs: TURN_2_MS });
    // Anything that is not turn-NNNN.json is ignored: the app also writes
    // snapshots/, tool-results/ and prompt-cache plumbing into the same tree.
    fs.writeFileSync(
      path.join(sessionDir(home, "b--two", "s-2"), "turns", "index.json"),
      "{}\n",
    );
    const files = await resolveOpenBitFunTurnFiles({}, { nativeHome: home });
    assert.equal(files.length, 3);
    assert.ok(files.every((filePath) => /turn-\d{4}\.json$/.test(filePath)));
    assert.deepEqual(files, [...files].sort());
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
