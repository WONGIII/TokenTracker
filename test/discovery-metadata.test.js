"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

// Canonical inventory: the CLI onboarding list every other public surface must
// stay in parity with. The expected count is derived from it once — do not
// scatter literal counts through the assertions below.
const SUPPORTED_PROVIDERS = (() => {
  const source = read("src/commands/init.js");
  const block = source.match(/const SUPPORTED_PROVIDERS = \[([\s\S]*?)\];/);
  assert.ok(block, "init defines SUPPORTED_PROVIDERS");
  return [...block[1].matchAll(/^\s*"([^"]+)",?$/gm)].map((match) => match[1]);
})();
const TOOL_COUNT = SUPPORTED_PROVIDERS.length;

// FORK: every README was rewritten (see MODIFICATIONS.md) — they are fork notes
// now, not upstream's marketing inventory, so the comparison tables, provider
// roll-call and env-var docs these assertions used to require are gone by design.
// What still has to stay in lockstep is the provider COUNT each edition quotes
// and the fact that all five editions exist and link to one another.
const README_EXPECTATIONS = [
  ["README.md", new RegExp(`${TOOL_COUNT} 款 AI 编码工具`)],
  ["README.en.md", new RegExp(`${TOOL_COUNT} AI coding tools`)],
  ["README.ja.md", new RegExp(`${TOOL_COUNT} 種類の AI コーディングツール`)],
  ["README.ko.md", new RegExp(`${TOOL_COUNT}종의 AI 코딩 도구`)],
  ["README.de.md", new RegExp(`${TOOL_COUNT} AI-Coding-Tools`)],
];

test("public discovery surfaces describe every supported tool", () => {
  // Devin CLI is the 38th integration — a token-statistics source, not a
  // quota-only badge — so every public inventory must carry it explicitly.
  assert.ok(SUPPORTED_PROVIDERS.includes("Devin CLI"), "init advertises Devin CLI");

  for (const [file, countPattern] of README_EXPECTATIONS) {
    const source = read(file);
    assert.match(source, countPattern, `${file} carries the current provider count`);
    assert.match(source, /xiufengsun\/TokenTracker/, `${file} credits upstream`);
    for (const [other] of README_EXPECTATIONS) {
      if (other === file) continue;
      const link = new RegExp(`\\(\\./${other.replace(/\./g, "\\.")}\\)`);
      assert.match(source, link, `${file} links ${other}`);
    }
  }

  const index = read("dashboard/index.html");
  assert.doesNotMatch(index, /13 AI coding/);
  assert.match(index, new RegExp(`Supported AI coding tools \\(${TOOL_COUNT}\\)`));
  assert.match(index, /TRAE Work CN/);
  assert.match(index, /AStudio/);
  assert.doesNotMatch(index, /\bAcode\b/);
  assert.match(index, /Devin CLI/);
  assert.match(index, /Desktop pet/);
  assert.match(index, /Four desktop widgets/);
  assert.match(index, /Achievements/);
  assert.match(index, /Service Status page/);
  assert.match(index, /__TOKENTRACKER_DISCOVERY_TRACKED_USAGE__/);
  assert.match(read("dashboard/src/content/copy.csv"), /landing\.discovery\.tracked_usage,.*usage limits for 17 providers/i);

  const llms = read("dashboard/public/llms.txt");
  assert.match(llms, new RegExp(`Supported AI coding tools \\(${TOOL_COUNT}\\)`));
  assert.match(llms, /TRAE Work CN/);
  assert.match(llms, /AStudio/);
  assert.doesNotMatch(llms, /\bAcode\b/);
  assert.match(llms, /Devin CLI/);
  assert.match(llms, /desktop pet/i);
  assert.match(llms, /four desktop widgets/i);
  assert.match(llms, /achievements/i);

  // FORK: the READMEs no longer document the per-provider directory overrides.
  // Those env vars are still supported and documented in MODIFICATIONS.md and in
  // the CLI's own --help; the READMEs are fork notes now, not a provider manual.
});

test("marketing logo wall includes the same supported product integrations", () => {
  const source = read("dashboard/src/ui/marketing/agent-logos.js");
  const providers = [...source.matchAll(/provider:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(providers.length, TOOL_COUNT);
  assert.equal(new Set(providers).size, TOOL_COUNT);

  for (const provider of ["every-code", "acode", "reasonix", "kilocode", "roocode", "zed", "goose", "droid", "qoder", "anythingllm", "dsh", "prime-agent", "trae-cn", "dots", "lmstudio", "unsloth", "devin"]) {
    assert.ok(providers.includes(provider), `logo wall includes ${provider}`);
  }
});

test("CLI onboarding advertises the same supported integrations", () => {
  assert.equal(new Set(SUPPORTED_PROVIDERS).size, TOOL_COUNT);
  for (const provider of SUPPORTED_PROVIDERS) {
    assert.ok(provider && !/^\s|\s$/.test(provider), `provider name is trimmed: ${provider}`);
  }
  assert.ok(SUPPORTED_PROVIDERS.includes("Droid"));
  assert.ok(SUPPORTED_PROVIDERS.includes("AnythingLLM Desktop"));
  assert.ok(SUPPORTED_PROVIDERS.includes("Qoder"));
  assert.ok(SUPPORTED_PROVIDERS.includes("Reasonix"));
  assert.ok(SUPPORTED_PROVIDERS.includes("DeepSeek Harness"));
  assert.ok(SUPPORTED_PROVIDERS.includes("Prime Agent"));
  assert.ok(SUPPORTED_PROVIDERS.includes("TRAE Work CN"));
  assert.ok(SUPPORTED_PROVIDERS.includes("Dots"));
  assert.ok(SUPPORTED_PROVIDERS.includes("AStudio"));
  assert.ok(SUPPORTED_PROVIDERS.includes("LM Studio"));
  assert.ok(SUPPORTED_PROVIDERS.includes("Unsloth Studio"));
  assert.ok(SUPPORTED_PROVIDERS.includes("Devin CLI"));
});

test("npm metadata carries the current product hook", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.description, new RegExp(`${TOOL_COUNT} tools`));
  assert.match(pkg.description, /desktop pet/);
  assert.ok(pkg.keywords.includes("desktop-widget"));
  assert.ok(pkg.keywords.includes("ai-coding-tools"));
});

test("dashboard JSON-LD scripts parse as valid JSON", () => {
  const index = read("dashboard/index.html");
  const blocks = [...index.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]);
  assert.ok(blocks.length > 0, "dashboard/index.html includes JSON-LD");

  const parsed = blocks.map((block, i) => {
    try {
      return JSON.parse(block);
    } catch (err) {
      assert.fail(`JSON-LD block ${i} failed to parse: ${err.message}`);
    }
  });

  const graph = parsed.flatMap((doc) => (Array.isArray(doc["@graph"]) ? doc["@graph"] : [doc]));

  const faq = graph.find((node) => node["@type"] === "FAQPage");
  assert.ok(faq, "JSON-LD includes an FAQPage");
  const supportedClis = (faq.mainEntity || []).find((entity) =>
    entity.name === "Which AI coding CLIs does Token Tracker support?",
  );
  assert.ok(supportedClis, "FAQ includes the supported-CLIs question");
  assert.equal(supportedClis["@type"], "Question");

  const tools = graph.find((node) => node["@type"] === "ItemList" && node.name === "Supported AI coding agent CLIs");
  assert.ok(tools, "JSON-LD includes the coding-tools ItemList");
  assert.ok(Array.isArray(tools.itemListElement), "coding-tools ItemList is an array");
  assert.equal(tools.itemListElement.length, TOOL_COUNT);
  assert.equal(new Set(tools.itemListElement.map((item) => item.name)).size, TOOL_COUNT);
  assert.ok(tools.itemListElement.some((item) => item.name === "AStudio"));
  assert.ok(tools.itemListElement.some((item) => item.name === "LM Studio"));
  assert.ok(tools.itemListElement.some((item) => item.name === "Unsloth Studio"));
  assert.ok(tools.itemListElement.some((item) => item.name === "Devin CLI"));
  assert.match(supportedClis.acceptedAnswer.text, new RegExp(`${TOOL_COUNT} AI coding tools`));
  assert.match(supportedClis.acceptedAnswer.text, /AStudio/);
  assert.match(supportedClis.acceptedAnswer.text, /Devin CLI/);
});
