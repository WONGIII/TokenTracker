// Regenerates the README screenshots against a live local server:
//   node bin/tracker.js serve --port 17890 --no-sync --no-open   # in another shell
//   node scripts/capture-readme-shots.cjs
//
// Three things this has to get right, all learned the hard way:
//   * the pet page is /pet-settings (NOT /pet — an unknown route silently falls
//     back to the dashboard, so the "pet" shot was really the dashboard);
//   * the Limits page is seeded to show ONLY the adapter that has accounts
//     configured, otherwise a dozen "not connected" rows bury them;
//   * the Limits shot also opens the accounts popover, because that is where the
//     "several accounts per adapter" feature is actually edited.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.TT_URL || "http://127.0.0.1:17890";
const OUT = process.env.TT_OUT || path.resolve(__dirname, "..", "..", "docs", "screenshots");
const PAGES = [
  ["/dashboard", "zzh-dashboard"],
  ["/limits", "zzh-limits"],
  ["/sessions", "zzh-sessions"],
  ["/skills", "zzh-skills"],
  ["/achievements", "zzh-achievements"],
  ["/pet-settings", "zzh-pet"],
];
const PROVIDER_IDS = [
  "claude", "codex", "cursor", "gemini", "kimi", "kiro", "grok", "copilot", "antigravity",
  "zcode", "opencodeGo", "commandCode", "qoder", "qoderCn", "codingPlan", "agentPlan", "devin",
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1512, height: 997 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    locale: "en-US",
  });
  await ctx.addInitScript((ids) => {
    try {
      const visibility = {};
      for (const id of ids) visibility[id] = id === "commandCode";
      window.localStorage.setItem("tt.limits.providerVisibility", JSON.stringify(visibility));
      window.localStorage.setItem("tt.limits.updatedAt", new Date().toISOString());
    } catch {
      /* storage unavailable: the page falls back to showing every provider */
    }
  }, PROVIDER_IDS);

  const page = await ctx.newPage();
  for (const [route, name] of PAGES) {
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (error) {
      console.log(name + ": navigation warning " + error.message.split("\n")[0]);
    }
    let text = "";
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1800);
      text = await page.evaluate(() => document.body.innerText || "");
      if (text.length > 700) break;
    }
    if (route === "/limits") {
      // The accounts editor is the point of this page now, so it is part of the shot.
      await page.click('button[aria-label="Accounts"]');
      await page.waitForTimeout(1500);
      text = await page.evaluate(() => document.body.innerText || "");
    }
    await page.waitForTimeout(1200);
    const file = path.join(OUT, name + ".png");
    await page.screenshot({ path: file });
    console.log(name.padEnd(16) + " text=" + String(text.length).padStart(6) + "  " +
      Math.round(fs.statSync(file).size / 1024) + " KB  " + (text.includes("CommandCode") ? "[CommandCode visible]" : ""));
  }
  await browser.close();
})();
