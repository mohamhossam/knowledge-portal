/**
 * What the architecture views are drawn from: every journey seen through every
 * channel, each integration once, the system-to-system links and how each
 * system takes part in the calls.
 */
import { type CatalogueData, journeyView } from "../../architecture/adapter";
import type { Integration, JourneyView } from "../../architecture/model";

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
