// Reproduces docs/redesign/before (and later "after") captures on the seeded fake stack.
// Run from a folder with playwright-core installed (it drives the installed Microsoft Edge;
// no browser download):  node capture-routes.mjs http://localhost:5184/knowledge <outDir>
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:5184/knowledge";
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const log = [];

async function ctxFor(actor, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  await ctx.addInitScript((a) => sessionStorage.setItem("knowledge-portal.fake-actor", a), actor);
  return ctx;
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

async function hrefs(page, re) {
  const all = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  return [...new Set(all.filter((h) => h && new RegExp(re).test(h)))];
}

// 1. Harvest ids.
const ctx = await ctxFor("fake-owner", 1280, 800);
const page = await ctx.newPage();
const go = async (p) => { await page.goto(base + p); await settle(page); };
await go("/library");
const docs = (await hrefs(page, "/library/[0-9a-f-]{36}$")).map((h) => h.replace(/^.*\/library\//, ""));
await go("/architecture");
const systems = await hrefs(page, "/architecture/systems/[^/]+$");
await go("/architecture/offerings");
const offerings = await hrefs(page, "/architecture/offerings/[^/]+$");
await go("/architecture/journeys");
const journeys = await hrefs(page, "/architecture/journeys/[^/]+$");
await go("/architecture/versions");
const versions = (await hrefs(page, "/architecture/versions/[^/]+$")).map((h) => h.replace(/^.*\/architecture\/versions\//, ""));
let evidence = [];
for (const v of versions) {
  await go(`/architecture/versions/${v}/sources`);
  evidence.push(...(await hrefs(page, "/evidence/")));
}
await go("/requirement-knowledge/historic");
const historic = await hrefs(page, "/requirement-knowledge/historic/[^/]+$");
const strip = (h) => h.replace(/^\/knowledge/, "");
log.push({ docs, systems, offerings, journeys, versions, evidence: evidence.slice(0, 3), historic });
await ctx.close();

// 2. Route list.
const admin = [
  ["home", "/"],
  ["library", "/library"],
  ["library-search", "/library/search"],
  ...docs.flatMap((d, i) => [
    [`library-doc${i + 1}-review`, `/library/${d}`],
    ...(i === 0 ? [
      [`library-doc1-versions`, `/library/${d}/versions`],
      [`library-doc1-citations`, `/library/${d}/citations`],
      [`library-doc1-ownership`, `/library/${d}/ownership`],
    ] : []),
  ]),
  ["reminders", "/reminders"],
  ["rk-overview", "/requirement-knowledge"],
  ["rk-requirements", "/requirement-knowledge/requirements"],
  ["rk-findings", "/requirement-knowledge/findings"],
  ["rk-historic", "/requirement-knowledge/historic"],
  ...historic.slice(0, 1).map((h) => ["rk-historic-record", strip(h)]),
  ["arch-systems", "/architecture"],
  ...systems.slice(0, 1).map((h) => ["arch-system-sheet", strip(h)]),
  ["arch-domains", "/architecture/domains"],
  ["arch-channels", "/architecture/channels"],
  ["arch-governance", "/architecture/governance"],
  ["arch-offerings", "/architecture/offerings"],
  ...offerings.slice(0, 1).map((h) => ["arch-offering", strip(h)]),
  ["arch-journeys", "/architecture/journeys"],
  ...journeys.slice(0, 1).map((h) => ["arch-journey", strip(h)]),
  ["arch-versions", "/architecture/versions"],
  ["arch-compare", "/architecture/compare"],
  ...versions.flatMap((v, i) => [
    [`arch-v${i + 1}-systems`, `/architecture/versions/${v}`],
    [`arch-v${i + 1}-sources`, `/architecture/versions/${v}/sources`],
    [`arch-v${i + 1}-changes`, `/architecture/versions/${v}/changes`],
    [`arch-v${i + 1}-check`, `/architecture/versions/${v}/check`],
    [`arch-v${i + 1}-publish`, `/architecture/versions/${v}/publish`],
  ]),
  ...evidence.slice(0, 1).map((h) => ["arch-evidence", strip(h)]),
  ["explorer-admin", "/explorer"],
  ["squads-products", "/squads"],
  ["squads-squads", "/squads/squads"],
  ["squads-people", "/squads/people"],
  ["squads-history", "/squads/history"],
  ["state-404", "/no-such-page"],
];
const reader = [
  ["reader-explorer", "/explorer"],
  ["reader-no-access", "/library"],
];

async function shoot(actor, routes, widths) {
  for (const [w, h] of widths) {
    const c = await ctxFor(actor, w, h);
    const p = await c.newPage();
    const errors = [];
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    for (const [name, route] of routes) {
      const t0 = Date.now();
      await p.goto(base + route);
      await settle(p);
      const file = path.join(out, `${name}@${w}.jpg`);
      await p.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 80 });
      const title = await p.title();
      const docH = await p.evaluate(() => document.documentElement.scrollHeight);
      log.push({ actor, name, route, width: w, title, pageHeight: docH, ms: Date.now() - t0, errors: errors.splice(0) });
    }
    await c.close();
  }
}

await shoot("fake-owner", admin, [[1280, 800], [1920, 1080]]);
await shoot("fake-observer", reader, [[1280, 800], [1920, 1080], [390, 844]]);
await browser.close();
fs.writeFileSync(path.join(out, "capture-log.json"), JSON.stringify(log, null, 2));
console.log(`captured ${fs.readdirSync(out).filter((f) => f.endsWith(".jpg")).length} screenshots`);
