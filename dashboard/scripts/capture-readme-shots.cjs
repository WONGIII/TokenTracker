
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const OUT = 'D:/opencode/tokentracker/docs/screenshots';
const PAGES = [
  ['/dashboard', 'zzh-dashboard'],
  ['/sessions', 'zzh-sessions'],
  ['/skills', 'zzh-skills'],
  ['/achievements', 'zzh-achievements'],
  ['/pet', 'zzh-pet'],
];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1512, height: 997 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'en-US' });
  const page = await ctx.newPage();
  for (const [route, name] of PAGES) {
    try { await page.goto('http://127.0.0.1:17890' + route, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch (e) {}
    let len = 0;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1800);
      len = (await page.evaluate(() => document.body.innerText || '')).length;
      if (len > 700) break;
    }
    await page.waitForTimeout(1200);
    const file = path.join(OUT, name + '.png');
    await page.screenshot({ path: file });
    console.log(name.padEnd(16) + ' text=' + String(len).padStart(5) + '  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
  }
  await browser.close();
})();
