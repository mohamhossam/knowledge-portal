/**
 * The solution overview a Solution Architecture document opens with
 * (requirement-portal ADR-0101, step 6): the journey's stages left to right,
 * each with the systems that perform its steps, and the order's tracking
 * beneath. Drawn as SVG from the scenario, then rasterised in the browser.
 */
import type { ExplorerRelease } from "../../api/client";
import { orderedSteps } from "../../catalogue/catalogue";
import { performer, trackingFor, type Scenario } from "../scenario";

export type Stage = { phase: string; systems: string[]; unnamed: number };

const NO_PHASE = "Not placed in a phase";

/** The journey's stages in the order its steps first reach them, each with its performing systems. */
export function stages(scenario: Scenario): Stage[] {
  const found = new Map<string, Stage>();
  for (const step of scenario.journey ? orderedSteps(scenario.journey) : []) {
    const phase = step.phase?.trim() || NO_PHASE;
    let stage = found.get(phase);
    if (!stage) {
      stage = { phase, systems: [], unnamed: 0 };
      found.set(phase, stage);
    }
    const systemId = performer(scenario, step);
    if (!systemId) stage.unnamed += 1;
    else if (!stage.systems.includes(systemId)) stage.systems.push(systemId);
  }
  return [...found.values()];
}

/** The systems the order's tracking runs through, in flow order; none when it does not apply. */
export function trackingChain(scenario: Scenario): string[] {
  const tracked = trackingFor(scenario);
  if (!tracked?.applies) return [];
  const chain: string[] = [];
  for (const flow of tracked.flows) {
    for (const systemId of [flow.from_system_id, flow.to_system_id]) if (!chain.includes(systemId)) chain.push(systemId);
  }
  return chain;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

/** A name on at most two lines of about `width` characters, cut with an ellipsis when longer. */
function lines(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line = `${line} ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  const kept = out.slice(0, 2).map((item) => (item.length > width ? `${item.slice(0, width - 1)}…` : item));
  if (out.length > 2) kept[1] = `${kept[1]!.slice(0, width - 1)}…`;
  return kept;
}

const INK = "#16181D";
const INK_2 = "#474C55";
const RULE = "#CFD2D6";
const BAND = "#F1F1EE";
const RED = "#B3122B";
const RED_WASH = "#FBEAEC";

/** The overview as an SVG of its own size. */
export function overviewSvg(scenario: Scenario, release: ExplorerRelease): { svg: string; w: number; h: number } {
  const names = new Map(release.systems.map((item) => [item.id, item.name]));
  const name = (systemId: string) => names.get(systemId) ?? systemId;
  const columns = stages(scenario);
  const tracking = trackingChain(scenario);
  const W = 1400;
  // Columns share the width, never wider than a box needs: two stages are not two banners.
  const colW = Math.min(220, Math.floor((W - 60) / Math.max(1, columns.length)));
  const boxW = colW - 26;
  const boxH = 50;
  const gap = 10;
  const top = 124;
  const tallest = Math.max(1, ...columns.map((column) => column.systems.length + (column.unnamed ? 1 : 0)));
  const bodyH = tallest * (boxH + gap);
  const H = top + bodyH + (tracking.length ? 170 : 40);
  const title = `${scenario.offering.name}: ${scenario.orderType.name}${scenario.channel ? `, through ${scenario.channel.name}` : ""}`;
  const box = (x: number, y: number, w: number, text: string, due: boolean) => {
    const label = lines(text, Math.max(8, Math.floor(w / 7.4)));
    const first = y + boxH / 2 + 5 - (label.length - 1) * 8;
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${boxH}" fill="${due ? RED_WASH : "#FFFFFF"}" stroke="${due ? RED : INK}" stroke-width="${due ? 1.5 : 1}"${due ? ' stroke-dasharray="5 4"' : ""}/>` +
      label
        .map(
          (line, index) =>
            `<text x="${x + w / 2}" y="${first + index * 16}" font-size="13.5" text-anchor="middle" fill="${due ? RED : INK}"${due ? ' font-weight="700"' : ""}>${escape(line)}</text>`,
        )
        .join("")
    );
  };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif"><rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
  svg += `<text x="30" y="44" font-size="26" font-weight="700" fill="${INK}">${escape(title)}</text>`;
  svg += `<line x1="30" y1="60" x2="${W - 30}" y2="60" stroke="${INK}" stroke-width="2"/>`;
  svg += `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${INK_2}"/></marker></defs>`;
  columns.forEach((column, index) => {
    const x = 30 + index * colW;
    // A stage's name on up to two lines, so "Order Orchestration" is never cut to "Order".
    svg += `<rect x="${x}" y="${top - 46}" width="${boxW}" height="38" fill="${BAND}"/>`;
    lines(column.phase.toUpperCase(), Math.floor(boxW / 7.6)).forEach((line, row) => {
      svg += `<text x="${x + 6}" y="${top - 30 + row * 15}" font-size="12" font-weight="700" fill="${INK}">${escape(line)}</text>`;
    });
    const items = [...column.systems.map((systemId) => ({ text: name(systemId), due: false })), ...(column.unnamed ? [{ text: `${column.unnamed} step${column.unnamed === 1 ? "" : "s"}: no system (gap)`, due: true }] : [])];
    items.forEach((item, row) => {
      svg += box(x, top + row * (boxH + gap), boxW, item.text, item.due);
    });
    if (index < columns.length - 1) svg += `<path d="M${x + boxW + 3} ${top + boxH / 2} H${x + colW - 5}" stroke="${INK_2}" stroke-width="1.6" marker-end="url(#arrow)"/>`;
  });
  if (!columns.length) svg += `<text x="30" y="${top + 20}" font-size="15" fill="${RED}" font-weight="700">No journey is recorded for this order type.</text>`;
  if (tracking.length) {
    const y = top + bodyH + 80;
    svg += `<line x1="30" y1="${y - 40}" x2="${W - 30}" y2="${y - 40}" stroke="${RULE}" stroke-width="1"/>`;
    svg += `<text x="30" y="${y - 14}" font-size="12" font-weight="700" fill="${INK}">ORDER TRACKING</text>`;
    const w = Math.min(190, Math.floor((W - 60) / tracking.length) - 26);
    tracking.forEach((systemId, index) => {
      const x = 30 + index * (w + 26);
      svg += box(x, y, w, name(systemId), false);
      if (index < tracking.length - 1) svg += `<path d="M${x + w + 2} ${y + boxH / 2} H${x + w + 24}" stroke="${INK_2}" stroke-width="1.4" marker-end="url(#arrow)"/>`;
    });
  }
  return { svg: `${svg}</svg>`, w: W, h: H };
}

/** The SVG as PNG bytes, drawn on a canvas at twice its size for print. Browser only. */
export async function rasterise({ svg, w, h }: { svg: string; w: number; h: number }): Promise<{ png: Uint8Array; w: number; h: number }> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the overview.");
  context.drawImage(image, 0, 0, w * 2, h * 2);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser cannot draw the overview.");
  return { png: new Uint8Array(await blob.arrayBuffer()), w, h };
}
