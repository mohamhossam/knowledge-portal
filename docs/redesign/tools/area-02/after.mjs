// node after.mjs <base> <outDir> <prefix> [only]
// Captures the library's states after area 2, viewport-sized (not full page) unless "full".
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [base, out, prefix = "after", only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const api = process.env.KP_API ?? "http://127.0.0.1:8110";
const docs = await (await fetch(`${api}/library/documents?offset=0&limit=100`, { headers: { "X-Fake-Actor-Id": "fake-owner" } })).json();
const id = (word) => docs.find((d) => d.title.includes(word))?.id;
const R = id("Product eligibility matrix"), X = id("XGPON coverage"), W = id("Legacy ADSL"), F = id("Site survey");

const shots = [
  { name: "library", path: "/library", full: true },
  { name: "library-upload", path: "/library", act: async (p) => { await p.getByRole("button", { name: "Upload documents" }).first().click(); } },
  { name: "search", path: "/library/search?q=coverage", full: true },
  { name: "review-desk", path: `/library/${R}`, sizes: [[1280, 800], [1440, 900], [1920, 1080]], act: async (p) => {
    await p.locator(".lib-desk [data-cell-focus]").nth(3).click();
    await p.keyboard.press("j");
  } },
  { name: "review-desk-excluded", path: `/library/${R}`, sizes: [[1440, 900]], act: async (p) => {
    await p.locator(".lib-desk [data-cell-focus]").nth(2).click();
    await p.keyboard.press("x");
    await p.keyboard.type("Duplicate of row 3");
    await p.keyboard.press("Enter");
    await p.keyboard.press("j");
    await p.keyboard.press(" ");
    await p.keyboard.press("Shift+ArrowDown");
    await p.keyboard.press("Shift+ArrowDown");
  } },
  { name: "review-desk-bulk", path: `/library/${R}`, sizes: [[1440, 900]], act: async (p) => {
    await p.locator(".lib-desk [data-cell-focus]").nth(2).click();
    await p.keyboard.press(" ");
    await p.keyboard.press("Shift+ArrowDown");
    await p.getByRole("button", { name: "Exclude 2 passages…" }).click();
  } },
  { name: "document-in-service", path: `/library/${X}`, full: true },
  { name: "withdraw-consequence", path: `/library/${X}`, act: async (p) => { await p.getByRole("button", { name: "Withdraw…" }).click(); await p.waitForTimeout(600); } },
  { name: "withdrawn-return", path: `/library/${W}`, act: async (p) => { await p.getByRole("button", { name: "Return to service…" }).click(); } },
  { name: "needs-attention", path: `/library/${F}`, full: true },
  { name: "versions", path: `/library/${X}/versions`, full: true },
  { name: "cited-by", path: `/library/${X}/cited-by`, full: true },
  { name: "ownership", path: `/library/${X}/ownership`, full: true },
  { name: "your-work", path: "/", full: true },
  { name: "jobs", path: "/library", act: async (p) => { await p.getByRole("button", { name: /^Jobs/ }).click(); } },
];

const browser = await chromium.launch({ channel: "msedge" });
for (const shot of shots) {
  if (only && !only.split(",").includes(shot.name)) continue;
  for (const theme of shot.themes ?? ["light", "dark"]) {
    for (const [width, height] of shot.sizes ?? [[1280, 800]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", colorScheme: theme });
      await ctx.addInitScript(() => sessionStorage.setItem("knowledge-portal.fake-actor", "fake-owner"));
      const page = await ctx.newPage();
      await page.goto(base + shot.path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(700);
      if (shot.act) await shot.act(page);
      await page.waitForTimeout(500);
      const file = path.join(out, `${prefix}-${theme}-${width}-${shot.name}.jpg`);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: file, type: "jpeg", quality: 80, fullPage: Boolean(shot.full), clip: shot.full && h > 4000 ? { x: 0, y: 0, width, height: 4000 } : undefined });
      console.log(file);
      await ctx.close();
    }
  }
}
await browser.close();
