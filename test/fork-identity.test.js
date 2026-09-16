const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

// Fork identity guard.
//
// Every release of this fork shipped pointing at the ORIGINAL project's backend
// for a while, because the build workflows injected upstream's InsForge URL and
// anon key as VITE_ env vars — and `getInsforgeAnonKey()` prefers env over the
// compiled-in constants, so editing the constants changed nothing. Login failed
// with "Invalid token" and the leaderboard showed upstream's data.
//
// Nothing in this repository may reintroduce upstream's endpoints, keys or
// identity, so these run against the files that actually ship.

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "EmbeddedServer", "target", "pricing - 副本"]);
const SOURCE_EXT = /.(js|jsx|ts|tsx|yml|yaml|json|cs|swift|ps1|sh|iss|toml|html|cjs|mjs|plist)$/;

// Files allowed to name upstream on purpose.
const ALLOWED = [
  // Migrates installs OFF the old hosts — it has to name them.
  "src/lib/runtime-config.js",
  // Documents the migration.
  "MODIFICATIONS.md",
  // Regression tests for that migration.
  "test/legacy-baseurl-migration.test.js",
  "test/runtime-config.test.js",
  // This guard.
  "test/fork-identity.test.js",
];

const FORBIDDEN = [
  {
    what: "upstream's hosted InsForge project",
    pattern: /srctyff5\.us-east\.insforge\.app/,
    allow: ALLOWED,
  },
  {
    what: "the retired upstream InsForge project",
    pattern: /b46ug8xu\.us-east\.insforge\.app/,
    allow: ALLOWED,
  },
  {
    what: "upstream's anon key",
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJzdWIiOiIxMjM0NTY3OC\//,
    allow: [],
  },
  {
    what: "upstream's PostHog project key",
    pattern: /phc_nXhUfFbyrW9gNvp8iBL83eWPUhAuAYJgcgqUJxwUbBgj/,
    allow: ALLOWED,
  },
  {
    what: "upstream's deep-link scheme",
    pattern: /tokentracker:\/\//,
    allow: ALLOWED,
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
      continue;
    }
    if (SOURCE_EXT.test(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}

const FILES = walk(ROOT).map((file) => ({ file, rel: path.relative(ROOT, file).split(path.sep).join("/") }));

/**
 * Source lines with comments removed. Comments are allowed to name upstream (they
 * explain the migration); only code that could actually run is a regression.
 * Deliberately line-based: a naive `//` strip would truncate every https:// URL.
 */
function codeLines(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !(trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*"));
    })
    .join("\n");
}

test("no shipped file names upstream's backend, keys or scheme", () => {
  const offences = [];
  for (const { file, rel } of FILES) {
    let source;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const code = codeLines(source);
    for (const rule of FORBIDDEN) {
      if (rule.allow.includes(rel)) continue;
      if (rule.pattern.test(code)) offences.push(`${rel} names ${rule.what}`);
    }
  }
  assert.deepEqual(offences, []);
});

test("every workflow that builds the dashboard points it at our backend", () => {
  const dir = path.join(ROOT, ".github");
  const workflows = fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true }).filter((name) => /\.ya?ml$/.test(name))
    : [];
  assert.ok(workflows.length > 0, "workflows exist");

  const offences = [];
  for (const name of workflows) {
    const source = fs.readFileSync(path.join(dir, name), "utf8");
    if (!source.includes("VITE_INSFORGE_BASE_URL")) continue;
    const values = [...source.matchAll(/VITE_INSFORGE_BASE_URL:\s*(\S+)/g)].map((match) => match[1]);
    for (const value of values) {
      if (value !== "https://tt.977744.xyz") offences.push(`${name} injects ${value}`);
    }
    const keys = [...source.matchAll(/VITE_INSFORGE_ANON_KEY:\s*(\S+)/g)].map((match) => match[1]);
    for (const key of keys) {
      if (key !== "anon_8b315a83487de79bc4d17a5089d81d02b55184ab") offences.push(`${name} injects a foreign anon key`);
    }
  }
  assert.deepEqual(offences, []);
});

test("the Windows app keeps its state in its own AppData folder", () => {
  const dir = path.join(ROOT, "TokenTrackerWin");
  if (!fs.existsSync(dir)) return;
  const offenders = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".cs")) continue;
    // Comments legitimately name the old folder; only code matters.
    const code = codeLines(fs.readFileSync(path.join(dir, name), "utf8"));
    // A bare "TokenTracker" path segment means app state shared with upstream.
    if (/"TokenTracker"/.test(code)) offenders.push("TokenTrackerWin/" + name);
  }
  assert.deepEqual(offenders, []);
});
