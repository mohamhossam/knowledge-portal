/**
 * The layered architecture poster: TAM domains as notation-coloured layer bands,
 * systems as component boxes, integrations drawn as orthogonal lines. One
 * geometry serves the whole landscape (every call, faint) and a product's
 * journey (its systems lit, its calls numbered in order).
 */
import { type CatalogueData, journeyView } from "../../architecture/adapter";
import type { Integration, JourneyView, System } from "../../architecture/model";

const BOX = { w: 128, h: 42, gapX: 10, gapY: 8 };
const BAND = { padTop: 30, padSide: 12, padBottom: 12, gap: 10 };
const MAIN_W = 860;
const SIDE_W = 180;
export const POSTER_W = MAIN_W + BAND.gap + SIDE_W;

/** Which domains share a row of the poster, top to bottom; the rest fall in below. */
const ROWS: string[][] = [["market-sales", "product"], ["customer"], ["integration"], ["service"], ["resource"]];
const SIDE = ["engaged-party", "enterprise"];

export type Box = { system: System; x: number; y: number; w: number; h: number };
export type Band = { id: string; name: string; count: number; x: number; y: number; w: number; h: number };
export type PosterLayout = { bands: Band[]; boxes: Map<string, Box>; width: number; height: number };

function columnsFor(width: number): number {
  return Math.max(1, Math.floor((width - 2 * BAND.padSide + BOX.gapX) / (BOX.w + BOX.gapX)));
}

export function layoutPoster(data: CatalogueData): PosterLayout {
  const bySystem = new Map<string, System[]>();
  for (const system of data.systems) bySystem.set(system.domain, [...(bySystem.get(system.domain) ?? []), system]);
  const named = new Set([...ROWS.flat(), ...SIDE]);
  const rows = [...ROWS.map((row) => row.filter((id) => bySystem.has(id))), ...data.domains.filter((domain) => !named.has(domain.id) && bySystem.has(domain.id)).map((domain) => [domain.id])].filter((row) => row.length);
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? id;
  const bands: Band[] = [];
  const boxes = new Map<string, Box>();

  const place = (id: string, x: number, y: number, w: number, columns: number, spine: boolean): number => {
    const systems = bySystem.get(id) ?? [];
    const startX = spine ? x + 180 : x + BAND.padSide;
    const usable = spine ? Math.max(1, Math.floor((w - 180 - BAND.padSide + BOX.gapX) / (BOX.w + BOX.gapX))) : columns;
    const top = spine ? y + 8 : y + BAND.padTop;
    systems.forEach((system, index) => {
      const column = index % usable;
      const row = Math.floor(index / usable);
      const boxW = spine ? BOX.w + 40 : w === SIDE_W ? w - 2 * BAND.padSide : BOX.w;
      boxes.set(system.id, { system, x: startX + column * (boxW + BOX.gapX), y: top + row * (BOX.h + BOX.gapY), w: boxW, h: BOX.h });
    });
    const lines = Math.max(1, Math.ceil(systems.length / usable));
    return spine ? 8 + lines * (BOX.h + BOX.gapY) - BOX.gapY + 8 : BAND.padTop + lines * (BOX.h + BOX.gapY) - BOX.gapY + BAND.padBottom;
  };

  let y = 0;
  for (const row of rows) {
    const total = row.reduce((sum, id) => sum + (bySystem.get(id)?.length ?? 0), 0);
    let x = 0;
    let rowHeight = 0;
    const free = MAIN_W - BAND.gap * (row.length - 1);
    row.forEach((id, index) => {
      const share = row.length === 1 ? MAIN_W : index === row.length - 1 ? MAIN_W - x : Math.round((free * (bySystem.get(id)?.length ?? 0)) / total);
      const spine = data.domains.find((domain) => domain.id === id)?.band === true && id === "integration";
      const height = place(id, x, y, share, columnsFor(share), spine);
      bands.push({ id, name: domainName(id), count: bySystem.get(id)?.length ?? 0, x, y, w: share, h: height });
      rowHeight = Math.max(rowHeight, height);
      x += share + BAND.gap;
    });
    for (const band of bands.filter((item) => item.y === y)) band.h = rowHeight;
    y += rowHeight + BAND.gap;
  }
  const mainHeight = y - BAND.gap;

  let sideY = 0;
  const sides = SIDE.filter((id) => bySystem.has(id));
  sides.forEach((id, index) => {
    const height = place(id, MAIN_W + BAND.gap, sideY, SIDE_W, 1, false);
    const last = index === sides.length - 1;
    const h = last ? Math.max(height, mainHeight - sideY) : height;
    bands.push({ id, name: domainName(id), count: bySystem.get(id)?.length ?? 0, x: MAIN_W + BAND.gap, y: sideY, w: SIDE_W, h });
    sideY += h + BAND.gap;
  });
  return { bands, boxes, width: POSTER_W, height: Math.max(mainHeight, sideY - BAND.gap) };
}

/** Every journey seen through every channel it serves. */
export function allViews(data: CatalogueData): JourneyView[] {
  return data.journeys.flatMap((journey) => (journey.channels.length ? journey.channels : [null]).map((channel) => journeyView(data, journey.id, channel)).filter((view): view is JourneyView => view !== null));
}

/** Each integration once, whichever channel's view it was read from (each view numbers its own). */
export function allIntegrations(data: CatalogueData): Integration[] {
  const seen = new Map<string, Integration>();
  for (const view of allViews(data))
    for (const integration of view.integrations) {
      const key = [view.id, integration.from, integration.via ?? "", integration.to, integration.operation, integration.purpose].join("|");
      if (!seen.has(key)) seen.set(key, integration);
    }
  return [...seen.values()];
}

/** System-to-system links: a call through the integration layer counts as two hops. */
export function links(data: CatalogueData, integrations: Integration[]): Map<string, number> {
  const known = new Set(data.systems.map((system) => system.id));
  const counts = new Map<string, number>();
  const add = (a?: string, b?: string) => {
    if (!a || !b || a === b || !known.has(a) || !known.has(b)) return;
    const key = [a, b].sort().join("~");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const call of integrations) {
    if (call.via) {
      add(call.from, call.via);
      add(call.via, call.to);
    } else add(call.from, call.to);
  }
  return counts;
}

/** Integrations each system takes part in (calling, called or carrying). */
export function integrationCounts(integrations: Integration[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const call of integrations) for (const id of new Set([call.from, call.to, call.via])) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

export function partnersOf(systemId: string, linkCounts: Map<string, number>): { id: string; count: number }[] {
  const found: { id: string; count: number }[] = [];
  for (const [key, count] of linkCounts) {
    const [a = "", b = ""] = key.split("~");
    if (a === systemId) found.push({ id: b, count });
    else if (b === systemId) found.push({ id: a, count });
  }
  return found.sort((x, y) => y.count - x.count);
}

export function centre(box: Box): [number, number] {
  return [box.x + box.w / 2, box.y + box.h / 2];
}

/** An orthogonal connector between two boxes: out of the source, across the gutter, into the target. */
export function elbow(from: Box, to: Box): string {
  const [x1, y1] = centre(from);
  const [x2, y2] = centre(to);
  if (Math.abs(y1 - y2) < 2) return `M${x1} ${y1}H${x2}`;
  const down = y2 > y1;
  const sy = down ? from.y + from.h : from.y;
  const ty = down ? to.y : to.y + to.h;
  const mid = Math.round((sy + ty) / 2);
  return `M${x1} ${sy}V${mid}H${x2}V${ty}`;
}

