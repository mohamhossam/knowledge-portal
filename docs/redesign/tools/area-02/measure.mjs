import { chromium } from "@playwright/test";
const [url, w, h] = process.argv.slice(2);
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ viewport: { width: +w, height: +h } });
await ctx.addInitScript(() => sessionStorage.setItem("knowledge-portal.fake-actor", "fake-owner"));
const p = await ctx.newPage();
await p.goto(url); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
console.log(await p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { h: Math.round(b.height), pad: cs.padding }; };
  return JSON.stringify({ masthead: r(".ds-masthead"), thead: r(".lib-desk .ds-table thead"), th: r(".lib-desk .ds-table thead th"), foot: r(".lib-desk .ds-stickyfoot"), input: r(".lib-desk .ds-stickyfoot input"), button: r("#desk-approve"), density: document.querySelector(".lib-desk")?.dataset.density });
}));
await b.close();
