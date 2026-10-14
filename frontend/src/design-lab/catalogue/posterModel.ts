/**
 * What the architecture views are drawn from: every journey seen through every
 * channel, each integration once, the system-to-system links and how each
 * system takes part in the calls.
 */
import { journeyView } from "../../architecture/adapter";
import { ABOVE_BUS_DOMAIN, BUS_DOMAIN, SIDE_DOMAINS, WIDE_LAYER_GROUPS } from "../../architecture/conventions";
import { type Catalogue, type Integration, type JourneyView, laneKey, systemOf, type TamDomain } from "../../architecture/model";

/** Every journey seen through every channel it serves. */
export function allViews(data: Catalogue): JourneyView[] {
  return data.journeys.flatMap((journey) =>
    (journey.channels.length ? journey.channels : [null]).map((channel) => journeyView(data, journey.id, channel)).filter((view): view is JourneyView => view !== null),
  );
}

/** Each integration once, whichever channel's view it was read from (each view numbers its own). */
export function allIntegrations(data: Catalogue): Integration[] {
  const seen = new Map<string, Integration>();
  for (const view of allViews(data))
    for (const integration of view.integrations) {
      const key = [view.id, laneKey(integration.from), integration.via ?? "", laneKey(integration.to), integration.operation ?? "handover", integration.purpose].join("|");
      if (!seen.has(key)) seen.set(key, integration);
    }
  return [...seen.values()];
}

/**
 * Each interface once, whatever journey, channel or product makes the call:
 * the same caller, integration layer, callee and operation. This is the
 * product-neutral measure of how systems connect; counting calls instead
 * would grow with every journey that repeats one.
 */
export function distinctInterfaces(integrations: Integration[]): Integration[] {
  const seen = new Map<string, Integration>();
  for (const call of integrations) {
    const key = [laneKey(call.from), call.via ?? "", laneKey(call.to), (call.operation ?? "handover") || call.purpose].join("|");
    if (!seen.has(key)) seen.set(key, call);
  }
  return [...seen.values()];
}

/** Two linked systems, either way round: their ids in order, and how many hops link them. */
export type SystemLink = { a: string; b: string; count: number };

/** The key of the link between two systems, the same either way round. */
export function linkKey(a: string, b: string): string {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

/** System-to-system links, by `linkKey`: a call through the integration layer counts as two hops. */
export function links(data: Catalogue, integrations: Integration[]): Map<string, SystemLink> {
  const known = new Set(data.systems.map((system) => system.id));
  const found = new Map<string, SystemLink>();
  const add = (a?: string, b?: string) => {
    if (!a || !b || a === b || !known.has(a) || !known.has(b)) return;
    const key = linkKey(a, b);
    const link = found.get(key) ?? { a: a < b ? a : b, b: a < b ? b : a, count: 0 };
    link.count += 1;
    found.set(key, link);
  };
  for (const call of integrations) {
    const from = systemOf(call.from);
    const to = systemOf(call.to);
    if (call.via) {
      add(from, call.via);
      add(call.via, to);
    } else add(from, to);
  }
  return found;
}

export function partnersOf(systemId: string, systemLinks: Map<string, SystemLink>): { id: string; count: number }[] {
  const found: { id: string; count: number }[] = [];
  for (const { a, b, count } of systemLinks.values()) {
    if (a === systemId) found.push({ id: b, count });
    else if (b === systemId) found.push({ id: a, count });
  }
  return found.sort((x, y) => y.count - x.count);
}

/** The layers in the map's reading order: the version's own, with the bus moved under the last customer-facing layer. */
export function layerOrder(domains: Pick<TamDomain, "id">[]): string[] {
  const ids = domains.map((domain) => domain.id);
  if (!ids.includes(BUS_DOMAIN) || !ids.includes(ABOVE_BUS_DOMAIN)) return ids;
  const rest = ids.filter((id) => id !== BUS_DOMAIN);
  rest.splice(rest.indexOf(ABOVE_BUS_DOMAIN) + 1, 0, BUS_DOMAIN);
  return rest;
}

/** A layer's place in the reading order, for sorting; a domain the version doesn't list comes last. */
export function layerRank(domains: Pick<TamDomain, "id">[]): (id: string) => number {
  const order = layerOrder(domains);
  return (id) => (order.includes(id) ? order.indexOf(id) : order.length);
}

/**
 * The map's rows, top to bottom, of the layers that `has` systems: the bus alone, the side
 * layers together and last, a wide layer alone, and the others in pairs, never across the bus.
 */
export function mapRows(domains: Pick<TamDomain, "id" | "groups">[], has: (id: string) => boolean): string[][] {
  const groups = new Map(domains.map((domain) => [domain.id, domain.groups.length]));
  const rows: string[][] = [];
  let open: string[] = [];
  const close = () => {
    if (open.length) rows.push(open);
    open = [];
  };
  for (const id of layerOrder(domains).filter(has)) {
    if (SIDE_DOMAINS.includes(id)) continue;
    if (id === BUS_DOMAIN || (groups.get(id) ?? 0) >= WIDE_LAYER_GROUPS) {
      close();
      rows.push([id]);
    } else {
      open.push(id);
      if (open.length === 2) close();
    }
  }
  close();
  const side = SIDE_DOMAINS.filter((id) => groups.has(id) && has(id));
  return side.length ? [...rows, side] : rows;
}

/** For one offering: which of its journeys reach each system, by a step it performs or a call it takes part in. */
export function reachOf(data: Catalogue, offeringId: string): Map<string, Set<string>> {
  const known = new Set(data.systems.map((system) => system.id));
  const reach = new Map<string, Set<string>>();
  const add = (id: string | undefined, journey: string) => {
    if (!id || !known.has(id)) return;
    reach.set(id, (reach.get(id) ?? new Set()).add(journey));
  };
  for (const view of allViews(data)) {
    if (view.offeringId !== offeringId) continue;
    for (const step of view.steps) if (step.kind === "task") add(systemOf(step.lane), view.id);
    for (const call of view.integrations) for (const id of [systemOf(call.from), systemOf(call.to), call.via]) add(id, view.id);
  }
  return reach;
}
