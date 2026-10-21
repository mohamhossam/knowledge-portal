/**
 * The catalogue's diagrams as nodes and edges (UX rebuild plan, phases 3 and 4):
 * how systems connect, one system in context, the capability map, an
 * offering's structure and the versions on a timeline. Pure functions over the
 * release payload; the screens lay them out with the diagram kit.
 */
import type { CatalogueSystem, Journey, LandscapeDomain, Offering, RelationshipKind, Release } from "../../api/client";
import type { DiagramEdge, DiagramNode } from "../../design/diagram";
import { formatDay } from "../../home/format";
import { domainPath, roleLabel } from "../catalogue";
import { type Linked, type SystemLink, linksOf } from "../links";

/** What a release or an explorer release has that these diagrams read. */
export type Landscape = Linked & {
  systems: CatalogueSystem[];
  landscape_domains?: LandscapeDomain[] | null;
};

/** Where a node opens, as an app path, or nothing when the screen shows no links. */
export type Href = (id: string) => string | undefined;

/** A connection on its line, short: the line's direction says who does it. */
export const KIND_WORD: Record<RelationshipKind, string> = {
  calls_api: "calls API",
  publishes_events_to: "sends events",
  transfers_data_to: "sends data",
  orchestrates: "orchestrates",
  unspecified: "kind not known",
};

/** Past this many lines, labels crowd each other: the lines go unlabelled and the table names each. */
export const CROWDED_LINES = 20;

const edgeOf = (relationship: SystemLink, from: string, to: string, labelled = true): DiagramEdge => ({
  from,
  to,
  ...(labelled ? { label: KIND_WORD[relationship.kind] } : {}),
  // Only a link whose kind its source left unsaid is drawn weaker; the label says so too.
  dashed: relationship.kind === "unspecified",
});

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** The outermost landscape domain a system sits in: the second line under its name. */
function where(landscape: Landscape, system: CatalogueSystem): string | undefined {
  const domains = new Map((landscape.landscape_domains ?? []).map((domain) => [domain.id, domain]));
  return domainPath(domains, system.landscape_domain_id)[0];
}

/**
 * Every connection, left to right from the system that depends to the one it
 * depends on. `highlight` marks the systems a screen is about (an order in the
 * explorer) and keeps them in even when they connect to nothing.
 */
export function connectionsFlow(landscape: Landscape, options: { href?: Href; highlight?: Set<string> } = {}) {
  const { href, highlight } = options;
  const links = linksOf(landscape);
  const linked = new Set(links.flatMap((item) => [item.source_system_id, item.target_system_id]));
  const nodes: DiagramNode[] = landscape.systems
    .filter((system) => linked.has(system.id) || highlight?.has(system.id))
    .sort(byName)
    .map((system) => ({
      id: system.id,
      label: system.name,
      detail: where(landscape, system),
      href: href?.(system.id),
      ...(highlight?.has(system.id) ? { tone: "subject" as const, status: "In this order" } : {}),
    }));
  const known = new Set(nodes.map((node) => node.id));
  const drawn = links.filter((item) => known.has(item.source_system_id) && known.has(item.target_system_id));
  const crowded = drawn.length > CROWDED_LINES;
  const edges = drawn.map((item) => edgeOf(item, item.source_system_id, item.target_system_id, !crowded));
  const unconnected = landscape.systems.length - landscape.systems.filter((system) => linked.has(system.id)).length;
  return { nodes, edges, unconnected, crowded };
}

export const CONTEXT_LANES = [
  { id: "callers", label: "Depend on it" },
  { id: "system", label: "This system" },
  { id: "called", label: "It depends on" },
];

/**
 * One system in context: the systems that depend on it on the left, the ones it
 * depends on on the right. A system on both sides is drawn on both. `owned`,
 * when known, marks a neighbour no squad runs as a gap.
 */
export function systemContext(landscape: Landscape, systemId: string, options: { href?: Href; owned?: Set<string> } = {}) {
  const { href, owned } = options;
  const systems = new Map(landscape.systems.map((system) => [system.id, system]));
  const subject = systems.get(systemId);
  const node = (id: string, lane: string, key: string): DiagramNode => {
    const system = systems.get(id);
    const gap = owned !== undefined && !owned.has(id);
    return {
      id: key,
      label: system?.name ?? id,
      detail: system ? where(landscape, system) : undefined,
      lane,
      href: href?.(id),
      ...(gap ? { tone: "gap" as const, status: "No squad" } : {}),
    };
  };
  const nodes: DiagramNode[] = [
    { ...node(systemId, "system", systemId), tone: "subject", status: undefined, href: undefined, label: subject?.name ?? systemId },
  ];
  const edges: DiagramEdge[] = [];
  const name = (id: string) => systems.get(id)?.name ?? id;
  const links = linksOf(landscape);
  const sorted = (rows: SystemLink[], other: (row: SystemLink) => string) => [...rows].sort((a, b) => name(other(a)).localeCompare(name(other(b))));
  for (const row of sorted(links.filter((item) => item.target_system_id === systemId && item.source_system_id !== systemId), (row) => row.source_system_id)) {
    const key = `in:${row.source_system_id}`;
    if (!nodes.some((item) => item.id === key)) nodes.push(node(row.source_system_id, "callers", key));
    edges.push(edgeOf(row, key, systemId));
  }
  for (const row of sorted(links.filter((item) => item.source_system_id === systemId && item.target_system_id !== systemId), (row) => row.target_system_id)) {
    const key = `out:${row.target_system_id}`;
    if (!nodes.some((item) => item.id === key)) nodes.push(node(row.target_system_id, "called", key));
    edges.push(edgeOf(row, systemId, key));
  }
  // An empty side says so, rather than leave a blank column to puzzle over.
  if (edges.length && !nodes.some((item) => item.lane === "callers")) nodes.push({ id: "none:callers", label: "Nothing depends on it", lane: "callers", tone: "muted" });
  if (edges.length && !nodes.some((item) => item.lane === "called")) nodes.push({ id: "none:called", label: "It depends on nothing", lane: "called", tone: "muted" });
  return { nodes, edges };
}

/**
 * The capability map: one column per business area, each capability filed
 * under it with the system that has it. Capabilities filed nowhere get a last
 * column, so nothing is left off the map.
 */
export function capabilityMap(release: Pick<Release, "systems" | "capability_domains">, options: { href?: Href } = {}) {
  const areas = [...(release.capability_domains ?? [])];
  const ids = new Set(areas.map((area) => area.id));
  const names = new Map(areas.map((area) => [area.id, area.name]));
  // A nested area reads with its parent: "Billing › Rating".
  const label = (id: string): string => {
    const area = areas.find((item) => item.id === id);
    return area?.parent_id && ids.has(area.parent_id) ? `${label(area.parent_id)} › ${area.name}` : names.get(id) ?? id;
  };
  const nodes: DiagramNode[] = [];
  let unfiled = false;
  for (const system of [...release.systems].sort(byName)) {
    for (const capability of system.capabilities) {
      const lane = capability.domain_id && ids.has(capability.domain_id) ? capability.domain_id : "unfiled";
      if (lane === "unfiled") unfiled = true;
      nodes.push({ id: `${system.id}/${capability.id}`, label: capability.name, detail: system.name, lane, href: options.href?.(system.id) });
    }
  }
  nodes.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  const lanes = [
    ...areas.map((area) => ({ id: area.id, label: label(area.id) })),
    ...(unfiled ? [{ id: "unfiled", label: "In no business area" }] : []),
  ];
  return { nodes, edges: [] as DiagramEdge[], lanes };
}

export const OFFERING_LANES = [
  { id: "orders", label: "Order types" },
  { id: "offering", label: "Offering" },
  { id: "parts", label: "Made of" },
  { id: "systems", label: "Delivered by" },
];

/**
 * An offering's structure: its order types (each with the journey that
 * fulfils it, or a gap), the offering, its parts, and the systems responsible
 * for each part, the role on the line.
 */
export function offeringStructure(offering: Offering, journeys: Journey[], systemName: (id: string) => string, href: { system?: Href; journey?: Href } = {}) {
  const nodes: DiagramNode[] = [{ id: "offering", label: offering.name, detail: offering.family ?? "Offering", lane: "offering", tone: "subject" }];
  const edges: DiagramEdge[] = [];
  for (const order of offering.order_types) {
    const journey = journeys.find((item) => item.product_id === offering.id && item.order_type_code === order.code);
    const id = `order:${order.code}`;
    nodes.push(
      !order.enabled
        ? { id, label: order.name, detail: order.code, status: "Not offered", tone: "muted", lane: "orders" }
        : journey
          ? { id, label: order.name, detail: order.code, status: "Has a journey", lane: "orders", href: href.journey?.(journey.id) }
          : { id, label: order.name, detail: order.code, status: "No journey", tone: "gap", lane: "orders" },
    );
    edges.push({ from: id, to: "offering" });
  }
  for (const part of offering.components) {
    const id = `part:${part.id}`;
    nodes.push({
      id,
      label: part.name,
      detail: part.mandatory === false ? "Optional" : part.kind ?? undefined,
      lane: "parts",
      ...(part.responsibilities.length ? {} : { tone: "gap" as const, status: "No system named" }),
    });
    edges.push({ from: "offering", to: id });
    for (const responsibility of part.responsibilities) {
      const system = `system:${responsibility.system_id}`;
      if (!nodes.some((item) => item.id === system)) {
        nodes.push({ id: system, label: systemName(responsibility.system_id), detail: "System", lane: "systems", href: href.system?.(responsibility.system_id) });
      }
      edges.push({ from: id, to: system, label: roleLabel(responsibility.role).toLocaleLowerCase() });
    }
  }
  return { nodes, edges };
}

type VersionState = "in-service" | "draft" | "replaced";

const VERSION_STATE: Record<VersionState, { status: string; tone: DiagramNode["tone"] }> = {
  "in-service": { status: "In service", tone: "ready" },
  draft: { status: "In preparation", tone: "decide" },
  replaced: { status: "Replaced", tone: "muted" },
};

/**
 * Every version on one line, oldest first: the published ones by the day they
 * were published, then the drafts. Each points at the one after it.
 */
export function versionTimeline(releases: Release[], activeId: string | undefined, href?: Href) {
  const ordered = [...releases].sort((a, b) =>
    a.status === b.status
      ? (a.published_at ?? "").localeCompare(b.published_at ?? "") || (a.name ?? "").localeCompare(b.name ?? "")
      : a.status === "draft" ? 1 : -1,
  );
  const nodes: DiagramNode[] = ordered.map((release) => {
    const state: VersionState = release.status === "draft" ? "draft" : release.id === activeId ? "in-service" : "replaced";
    return {
      id: release.id,
      label: release.name || "Untitled version",
      detail: release.status === "draft" ? "Draft" : formatDay(release.published_at),
      ...VERSION_STATE[state],
      href: href?.(release.id),
    };
  });
  const edges: DiagramEdge[] = ordered.slice(1).map((release, at) => ({ from: ordered[at]!.id, to: release.id }));
  return { nodes, edges };
}
