const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const accounts = require("../src/lib/limit-accounts");

function writeConfig(home, limits) {
  const dir = path.join(home, ".tokentracker", "tracker");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ limits }, null, 2));
}

test("normalizeAccount accepts a key account and a profile account", () => {
  const home = os.homedir();
  const key = accounts.normalizeAccount(
    { id: "kimi-work", provider: "kimi", label: "Kimi 工作号", plan: "Pro", apiKey: " sk-1 " },
    { home },
  );
  assert.deepEqual(key, {
    id: "kimi-work",
    provider: "kimi",
    label: "Kimi 工作号",
    plan: "Pro",
    apiKey: "sk-1",
    home: "",
  });

  const profile = accounts.normalizeAccount(
    { id: "codex-alt", provider: "codex", home: "~/.codex-work" },
    { home: "/home/u" },
  );
  assert.equal(profile.home, path.join("/home/u", ".codex-work"));
  assert.equal(profile.label, "codex");
});

test("normalizeAccount rejects unusable entries instead of throwing", () => {
  const home = os.homedir();
  // unknown adapter
  assert.equal(accounts.normalizeAccount({ id: "x", provider: "nope", apiKey: "k" }, { home }), null);
  // bad slug
  assert.equal(accounts.normalizeAccount({ id: "Bad Id", provider: "kimi", apiKey: "k" }, { home }), null);
  // adapter that only takes a key, given only a home dir
  assert.equal(accounts.normalizeAccount({ id: "og", provider: "opencodeGo", home: "~/.x" }, { home }), null);
  // adapter that only takes a profile, given only a key
  assert.equal(accounts.normalizeAccount({ id: "cx", provider: "codex", apiKey: "k" }, { home }), null);
  // nothing to authenticate with
  assert.equal(accounts.normalizeAccount({ id: "k", provider: "kimi" }, { home }), null);
});

test("readLimitAccounts reads config.json, dedupes ids and tolerates garbage", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tt-limit-accounts-"));
  try {
    writeConfig(home, {
      accounts: [
        { id: "kimi-a", provider: "kimi", apiKey: "k1" },
        { id: "kimi-a", provider: "kimi", apiKey: "k2" }, // duplicate id, dropped
        { id: "kimi-b", provider: "kimi", apiKey: "k3" },
        { id: "bad", provider: "nope", apiKey: "k" }, // dropped
        "not-an-object",
      ],
    });
    assert.deepEqual(accounts.readLimitAccounts({ home }).map((a) => a.id), ["kimi-a", "kimi-b"]);

    fs.writeFileSync(path.join(home, ".tokentracker", "tracker", "config.json"), "{ not json");
    assert.deepEqual(accounts.readLimitAccounts({ home }), []);
    assert.deepEqual(accounts.readLimitAccounts({ home: fs.mkdtempSync(path.join(os.tmpdir(), "tt-empty-")) }), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("fetchAccountLimits passes the key through and tags the entry", async () => {
  const seen = [];
  const result = await accounts.fetchAccountLimits(
    { id: "kimi-work", provider: "kimi", label: "Work", plan: "Pro", apiKey: "sk-1", home: "" },
    {
      fetchers: { kimi: async (args) => { seen.push(args); return { configured: true, error: null }; } },
      env: { A: "1" },
      home: "/home/u",
      nowMs: 123,
    },
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].apiKey, "sk-1");
  assert.equal(seen[0].nowMs, 123);
  assert.equal(result.id, "kimi-work");
  assert.equal(result.account, true);
  assert.equal(result.plan_label, "Pro");
  assert.equal(result.configured, true);
});

test("fetchAccountLimits maps an unknown adapter to unsupported, and catches throws", async () => {
  const unsupported = await accounts.fetchAccountLimits(
    { id: "z1", provider: "zcode", label: "Z", plan: "", apiKey: "k", home: "" },
    { fetchers: {} },
  );
  assert.equal(unsupported.configured, false);
  assert.equal(unsupported.error, "unsupported");

  const thrown = await accounts.fetchAccountLimits(
    { id: "k1", provider: "kimi", label: "K", plan: "", apiKey: "k", home: "" },
    { fetchers: { kimi: async () => { throw new Error("boom"); } } },
  );
  assert.equal(thrown.configured, true);
  assert.equal(thrown.error, "boom");
});

test("profile accounts override the provider's config dir env var", async () => {
  let received = null;
  await accounts.fetchAccountLimits(
    { id: "codex-alt", provider: "codex", label: "Alt", plan: "", apiKey: "", home: "/home/u/.codex-work" },
    {
      fetchers: { codex: async (args) => { received = args; return { configured: true }; } },
      env: { CODEX_HOME: "/home/u/.codex", KEEP: "1" },
      home: "/home/u",
    },
  );
  assert.equal(received.env.CODEX_HOME, "/home/u/.codex-work");
  assert.equal(received.env.KEEP, "1");
  assert.equal(received.home, "/home/u/.codex-work");
});

test("fetchAllAccountLimits drops entries that could not render at all", async () => {
  const entries = await accounts.fetchAllAccountLimits(
    [
      { id: "a", provider: "kimi", label: "A", plan: "", apiKey: "k", home: "" },
      { id: "b", provider: "kimi", label: "B", plan: "", apiKey: "k", home: "" },
    ],
    { fetchers: { kimi: async (args) => (args.apiKey === "k" ? { configured: false } : {}) } },
  );
  assert.deepEqual(entries, []);
});
