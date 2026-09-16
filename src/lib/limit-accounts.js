// Multi-account usage limits: ONE adapter, SEVERAL accounts, each with its own
// key/plan and its own card in the Limits page.
//
// Why this lives apart from usage-limits.js: that module owns the *single*
// built-in account per provider (the local CLI's own login). This one only
// knows how to turn a user-configured list into extra provider results, so the
// provider functions are injected rather than required — no require cycle, and
// the dispatch table below is the whole contract.
//
// Config shape (~/.tokentracker/tracker/config.json):
//
//   {
//     "limits": {
//       "accounts": [
//         { "id": "kimi-work", "provider": "kimi", "label": "Kimi 工作号",
//           "plan": "Moonshot 会员", "apiKey": "sk-..." },
//         { "id": "codex-alt", "provider": "codex", "label": "Codex 小号",
//           "home": "~/.codex-work" }
//       ]
//     }
//   }
//
// Two credential modes, because TokenTracker's adapters do not all work the
// same way:
//   * "key"  — the provider's quota API accepts an explicit API key
//              (kimi / opencodeGo / commandCode / zcode).
//   * "home" — the provider authenticates with the local CLI's session, so a
//              second account means a second CLI profile directory: log in
//              there (CLAUDE_CONFIG_DIR / CODEX_HOME / GEMINI_HOME / KIMI_HOME)
//              and point the account at it.
// Anything else reports `unsupported` instead of silently mirroring the
// built-in account's numbers under a second label.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_ACCOUNTS = 20;
const MAX_LABEL_LENGTH = 60;
const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

// provider -> credential modes it honours
// ZCode is deliberately absent: its quota endpoint and plan kind can only be
// derived from the local ZCode install (billing base URL, team context), so a
// bare key cannot address an account. Add it here once a key is enough.
const ACCOUNT_MODES = Object.freeze({
  kimi: { key: true, homeEnv: "KIMI_HOME" },
  opencodeGo: { key: true },
  commandCode: { key: true },
  claude: { homeEnv: "CLAUDE_CONFIG_DIR" },
  codex: { homeEnv: "CODEX_HOME" },
  gemini: { homeEnv: "GEMINI_HOME" },
});

function expandHome(value, home) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "~") return home;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) return path.join(home, raw.slice(2));
  return path.resolve(raw);
}

/**
 * Validate one raw entry. Returns null for anything unusable so a hand-edited
 * config can never crash the limits poll.
 */
function normalizeAccount(raw, { home }) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().toLowerCase();
  const provider = String(raw.provider || "").trim();
  if (!ID_RE.test(id)) return null;
  if (!ACCOUNT_MODES[provider]) return null;
  const label = String(raw.label || "").trim().slice(0, MAX_LABEL_LENGTH) || provider;
  const plan = String(raw.plan || "").trim().slice(0, MAX_LABEL_LENGTH);
  const apiKey = String(raw.apiKey || "").trim();
  const accountHome = raw.home ? expandHome(raw.home, home) : "";
  const modes = ACCOUNT_MODES[provider];
  if (!apiKey && !accountHome) return null;
  if (!apiKey && !modes.homeEnv) return null;
  if (apiKey && !modes.key) return null;
  return { id, provider, label, plan, apiKey, home: accountHome };
}

function readLimitAccounts({ home = os.homedir(), configPath } = {}) {
  try {
    // Same layout as resolveTrackerPaths() (which is async and therefore
    // unusable here): <home>/.tokentracker/tracker/config.json.
    const target = configPath || path.join(home, ".tokentracker", "tracker", "config.json");
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    const list = parsed?.limits?.accounts;
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of list.slice(0, MAX_ACCOUNTS)) {
      const account = normalizeAccount(raw, { home });
      if (!account || seen.has(account.id)) continue;
      seen.add(account.id);
      out.push(account);
    }
    return out;
  } catch (_error) {
    return [];
  }
}

/**
 * Run one account through its provider's fetcher.
 *
 * @param {object} account   normalized account (see normalizeAccount)
 * @param {object} deps      { fetchers: { kimi, opencodeGo, commandCode, zcode, claude, codex, gemini }, env, home, fetchImpl, nowMs }
 */
async function fetchAccountLimits(account, deps = {}) {
  const { fetchers = {}, env = process.env, home = os.homedir(), fetchImpl = fetch, nowMs = Date.now() } = deps;
  const modes = ACCOUNT_MODES[account.provider];
  const base = {
    id: account.id,
    provider: account.provider,
    label: account.label,
    ...(account.plan ? { plan_label: account.plan } : {}),
    account: true,
  };
  const fetcher = fetchers[account.provider];
  if (typeof fetcher !== "function") {
    return { ...base, configured: false, error: "unsupported" };
  }
  try {
    const accountEnv = account.home && modes.homeEnv
      ? { ...env, [modes.homeEnv]: account.home }
      : env;
    const result = await fetcher({
      home: account.home || home,
      env: accountEnv,
      fetchImpl,
      nowMs,
      ...(account.apiKey ? { apiKey: account.apiKey } : {}),
    });
    return { ...base, ...(result && typeof result === "object" ? result : { configured: false }) };
  } catch (error) {
    return { ...base, configured: true, error: error?.message || "Unknown error" };
  }
}

async function fetchAllAccountLimits(accounts, deps = {}) {
  if (!Array.isArray(accounts) || accounts.length === 0) return [];
  const results = await Promise.all(accounts.map((account) => fetchAccountLimits(account, deps)));
  // Drop entries that cannot possibly render: an unconfigured account with no
  // error would show an empty card with no explanation.
  return results.filter((entry) => entry.configured || entry.error);
}

module.exports = {
  ACCOUNT_MODES,
  normalizeAccount,
  readLimitAccounts,
  fetchAccountLimits,
  fetchAllAccountLimits,
};
