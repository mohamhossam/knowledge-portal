/**
 * The layered architecture poster: TAM domains as layer bands on ONE column
 * grid, systems as component boxes in those columns, integrations routed
 * through the gutters between them. The grid follows the width it is given,
 * so the poster always fits its column. One geometry serves the whole
 * landscape and a product's journey footprint.
 */
import { type CatalogueData, journeyView } from "../../architecture/adapter";
import type { Integration, JourneyView, System } from "../../architecture/model";

/** Seven columns: six for the layer stack, one for the side layers. */
export const GRID = { cols: 7, main: 6, minPitch: 120, maxPitch: 176, gap: 8, pad: 8, header: 30, boxH: 58, rowGap: 8 };

/** Which domains share a row of the stack, top to bottom; any other domain gets a row of its own below. */
const ROWS: string[][] = [["market-sales", "product"], ["customer"], ["integration"], ["service", "resource"]];
const SIDE = ["engaged-party", "enterprise"];

export type Box = { system: System; x: number; y: number; w: number; h: number; col: number };
export type Band = { id: string; name: string; count: number; x: number; y: number; w: number; h: number; spine: boolean };
export type PosterLayout = { bands: Band[]; boxes: Map<string, Box>; width: number; height: number; pitch: number };

/** Whole columns per domain in a row, in proportion to their systems, at least one each. */
function split(counts: number[], columns: number): number[] {
  if (counts.length === 1) return [columns];
  const total = counts.reduce((sum, n) => sum + n, 0) || 1;
  const raw = counts.map((n) => (n / total) * columns);
  const spans = raw.map((value) => Math.max(1, Math.floor(value)));
  let left = columns - spans.reduce((sum, n) => sum + n, 0);
  const order = raw.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) break;
    spans[index] = (spans[index] ?? 1) + 1;
    left -= 1;
  }
  while (left < 0) {
    const widest = spans.indexOf(Math.max(...spans));
    spans[widest] = (spans[widest] ?? 2) - 1;
    left += 1;
  }
  return spans;
}

export function layoutPoster(data: CatalogueData, width: number): PosterLayout {
  const pitch = Math.min(GRID.maxPitch, Math.max(GRID.minPitch, Math.floor((width + GRID.gap) / GRID.cols)));
  const boxW = pitch - GRID.gap - 2 * GRID.pad;
  const bySystem = new Map<string, System[]>();
  for (const system of data.systems) bySystem.set(system.domain, [...(bySystem.get(system.domain) ?? []), system]);
  const named = new Set([...ROWS.flat(), ...SIDE]);
  const rows = [
    ...ROWS.map((row) => row.filter((id) => bySystem.has(id))),
    ...data.domains.filter((domain) => !named.has(domain.id) && bySystem.has(domain.id)).map((domain) => [domain.id]),
  ].filter((row) => row.length);
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? id;
  const bands: Band[] = [];
  const boxes = new Map<string, Box>();
  const rowStep = GRID.boxH + GRID.rowGap;

  /** Lays a domain's systems into its columns; returns the band's natural height. */
  const place = (id: string, col: number, span: number, y: number, spine: boolean): number => {
    const systems = bySystem.get(id) ?? [];
    const first = spine ? col + 1 : col;
    const capacity = Math.max(1, spine ? span - 1 : span);
    const top = spine ? y + GRID.pad : y + GRID.header;
    systems.forEach((system, index) => {
      const c = first + (index % capacity);
      boxes.set(system.id, { system, x: c * pitch + GRID.pad, y: top + Math.floor(index / capacity) * rowStep, w: boxW, h: GRID.boxH, col: c });
    });
    const lines = Math.max(1, Math.ceil(systems.length / capacity));
    return (spine ? GRID.pad : GRID.header) + lines * rowStep - GRID.rowGap + GRID.pad + 4;
  };

  let y = 0;
  for (const row of rows) {
    const spans = split(row.map((id) => bySystem.get(id)?.length ?? 0), GRID.main);
    let col = 0;
    const placed: Band[] = [];
    row.forEach((id, index) => {
      const span = spans[index] ?? 1;
      const spine = id === "integration";
      const h = place(id, col, span, y, spine);
      placed.push({ id, name: domainName(id), count: bySystem.get(id)?.length ?? 0, x: col * pitch, y, w: span * pitch - GRID.gap, h, spine });
      col += span;
    });
    const height = Math.max(...placed.map((band) => band.h));
    for (const band of placed) band.h = height;
    bands.push(...placed);
    y += height + GRID.gap;
  }
  const mainHeight = y - GRID.gap;

  let sideY = 0;
  const sides = SIDE.filter((id) => bySystem.has(id));
  sides.forEach((id, index) => {
    const natural = place(id, GRID.main, 1, sideY, false);
    const h = index === sides.length - 1 ? Math.max(natural, mainHeight - sideY) : natural;
    bands.push({ id, name: domainName(id), count: bySystem.get(id)?.length ?? 0, x: GRID.main * pitch, y: sideY, w: pitch - GRID.gap, h, spine: false });
    sideY += h + GRID.gap;
  });
  return { bands, boxes, width: GRID.cols * pitch - GRID.gap, height: Math.max(mainHeight, sideY - GRID.gap), pitch };
}

/** Every journey seen through every channel it serves. */
export function allViews(data: CatalogueData): JourneyView[] {
  return data.journeys.flatMap((journey) =>
    (journey.channels.length ? journey.channels : [null]).map((channel) => journeyView(data, journey.id, channel)).filter((view): view is JourneyView => view !== null),
  );
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

/** How each system takes part in the calls: makes them, receives them, or carries them between others. */
export type Degree = { made: number; received: number; carried: number; total: number };

export function degrees(integrations: Integration[]): Map<string, Degree> {
  const result = new Map<string, Degree>();
  const of = (id: string) => {
    let found = result.get(id);
    if (!found) {
      found = { made: 0, received: 0, carried: 0, total: 0 };
      result.set(id, found);
    }
    return found;
  };
  for (const call of integrations) {
    of(call.from).made += 1;
    of(call.to).received += 1;
    if (call.via) of(call.via).carried += 1;
    for (const id of new Set([call.from, call.to, call.via])) if (id) of(id).total += 1;
  }
  return result;
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

export type Point = [number, number];

/**
 * Routes connectors through the gutters: out of the source's bottom (or top)
 * into the gap under its row, along the column gap beside the target, then
 * into the target's edge, so the arrow lands on the box. Lines that share a
 * gutter are spread 3px apart so each can be followed.
 */
export function makeRouter(layout: PosterLayout) {
  const usage = new Map<string, number>();
  const offset = (key: string) => {
    const n = usage.get(key) ?? 0;
    usage.set(key, n + 1);
    return (n % 2 === 0 ? 1 : -1) * Math.ceil(n / 2) * 3;
  };
  const half = GRID.rowGap / 2;
  return (from: Box, to: Box): Point[] => {
    const fx = from.x + from.w / 2;
    const tx = to.x + to.w / 2;
    if (Math.abs(from.y - to.y) < 2) {
      const gy = from.y + from.h + half + offset(`h${Math.round(from.y)}`);
      return [[fx, from.y + from.h], [fx, gy], [tx, gy], [tx, to.y + to.h]];
    }
    const down = to.y > from.y;
    const sy = down ? from.y + from.h : from.y;
    const ty = down ? to.y : to.y + to.h;
    const rowGutter = (down ? sy + half : sy - half) + offset(`h${Math.round(sy)}`);
    // The centre of the gap beside the target's column (between two boxes, or between two bands).
    const boundary = (tx >= fx ? to.col : to.col + 1) * layout.pitch - GRID.gap / 2;
    const column = boundary + offset(`v${Math.round(boundary)}`);
    const targetGutter = (down ? ty - half : ty + half) + offset(`h${Math.round(ty)}t`);
    return [[fx, sy], [fx, rowGutter], [column, rowGutter], [column, targetGutter], [tx, targetGutter], [tx, ty]];
  };
}

export function toPath(points: Point[]): string {
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join("");
}

/** Where a numbered marker sits on a route: the middle of its longest segment. */
export function midpoint(points: Point[]): Point {
  let best: [Point, Point] = [points[0] ?? [0, 0], points[1] ?? points[0] ?? [0, 0]];
  let length = -1;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const l = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (l > length) {
      length = l;
      best = [a, b];
    }
  }
  return [(best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2];
}
