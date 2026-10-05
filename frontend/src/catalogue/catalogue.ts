/**
 * Reading a catalogue version: where its systems sit, what they are called, how
 * they connect, and which offerings and journeys rely on them. Pure functions
 * over the release payload; nothing here calls the service.
 */
import { count } from "../home/format";
import type {
  CatalogueDiff, CatalogueSystem, Journey, JourneyActivity, LandscapeDomain, Offering, Relationship, RelationshipKind, Release,
  ReleaseAuditEvent, SourceConfidence,
} from "../api/client";

/** A connection on a sheet's "Depends on" side, the other system as its subject: "Gets data from CWOM". */
export function dependsHow(kind: RelationshipKind, sheet: string): string {
  return {
    calls_api: `API called by ${sheet}`,
    publishes_events_to: `Gets events from ${sheet}`,
    transfers_data_to: `Gets data from ${sheet}`,
    orchestrates: `Orchestrated by ${sheet}`,
    unspecified: `Depended on by ${sheet}`,
  }[kind];
}

/** The same on the "Used by" side: "Orchestrates CWOM". */
export function usedHow(kind: RelationshipKind, sheet: string): string {
  return {
    calls_api: `Calls the API of ${sheet}`,
    publishes_events_to: `Sends events to ${sheet}`,
    transfers_data_to: `Sends data to ${sheet}`,
    orchestrates: `Orchestrates ${sheet}`,
    unspecified: `Depends on ${sheet}`,
  }[kind];
}

/** A role as written, in sentence case when the source shouts it: "FULFILS" reads "Fulfils". */
export function sentenceCase(text: string): string {
  return text === text.toLocaleUpperCase() && /[A-Z]/.test(text)
    ? text.charAt(0) + text.slice(1).toLocaleLowerCase()
    : text;
}

/** A responsibility's role code in words: "PRIMARY_ORCHESTRATOR" reads "Primary orchestrator". */
export function roleLabel(role: string): string {
  return sentenceCase(role.replace(/_/g, " "));
}

/** The same, inside a sentence: "B2B Web calls the API of B2B BFF". */
export const LINK_VERB: Record<RelationshipKind, string> = {
  calls_api: "calls the API of",
  publishes_events_to: "sends events to",
  transfers_data_to: "sends data to",
  orchestrates: "orchestrates",
  unspecified: "depends on",
};

export const CONFIDENCE: Record<SourceConfidence, string> = {
  confirmed: "Confirmed in its source",
  inferred: "Inferred, not stated in its source",
  gap: "Its source leaves gaps",
};

/** How sure a source is, as a select's options; "Not stated" leaves it unsaid. */
export const CONFIDENCE_OPTIONS = [
  { value: "", label: "Not stated" },
  ...(Object.keys(CONFIDENCE) as SourceConfidence[]).map((value) => ({ value, label: CONFIDENCE[value] })),
];

export const AUDIT_ACTION: Record<string, string> = {
  create_draft: "Started",
  rename: "Renamed",
  edit_draft: "Edited",
  upload_document: "Added a document",
  select_documents: "Changed its documents",
  accept_suggestion: "Accepted a suggestion",
  build_index: "Built for matching",
  publish: "Published and put in service",
  activate: "Put back in service",
  discard_draft: "Removed",
};

export function auditLabel(event: ReleaseAuditEvent): string {
  const known = AUDIT_ACTION[event.action];
  if (known) return known;
  const words = event.action.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type Catalogue = {
  release: Release;
  systems: Map<string, CatalogueSystem>;
  landscape: Map<string, LandscapeDomain>;
};

export function catalogue(release: Release): Catalogue {
  return {
    release,
    systems: new Map(release.systems.map((system) => [system.id, system])),
    landscape: new Map((release.landscape_domains ?? []).map((domain) => [domain.id, domain])),
  };
}

export function systemName(book: Catalogue, systemId: string): string {
  return book.systems.get(systemId)?.name ?? systemId;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** The names of a landscape domain and its parents, outermost first. */
export function domainPath(landscape: Map<string, LandscapeDomain>, domainId: string | null | undefined): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  for (let id = domainId; id && !seen.has(id); id = landscape.get(id)?.parent_id) {
    seen.add(id);
    const domain = landscape.get(id);
    if (!domain) break;
    path.unshift(domain.name);
  }
  return path;
}

export type DomainRow<T extends { id: string; parent_id?: string | null }> = { domain: T; depth: number };

/** A domain tree in reading order: each domain, then its children, as the catalogue lists them. */
export function domainTree<T extends { id: string; parent_id?: string | null }>(domains: T[]): DomainRow<T>[] {
  const ids = new Set(domains.map((domain) => domain.id));
  const children = new Map<string | null, T[]>();
  for (const domain of domains) {
    const parent = domain.parent_id && ids.has(domain.parent_id) ? domain.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), domain]);
  }
  const rows: DomainRow<T>[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const domain of children.get(parent) ?? []) {
      rows.push({ domain, depth });
      visit(domain.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export type SystemGroup = { id: string; path: string[]; systems: CatalogueSystem[] };

export const UNPLACED = "unplaced";

/** The systems index: grouped under where each system sits, in the landscape's order; unplaced last. */
export function systemGroups(book: Catalogue): SystemGroup[] {
  const groups: SystemGroup[] = domainTree([...book.landscape.values()]).map(({ domain }) => ({
    id: domain.id,
    path: domainPath(book.landscape, domain.id),
    systems: [],
  }));
  const index = new Map(groups.map((group) => [group.id, group]));
  const unplaced: SystemGroup = { id: UNPLACED, path: [], systems: [] };
  for (const system of book.release.systems) {
    (index.get(system.landscape_domain_id ?? "") ?? unplaced).systems.push(system);
  }
  return [...groups, unplaced]
    .filter((group) => group.systems.length > 0)
    .map((group) => ({ ...group, systems: [...group.systems].sort(byName) }));
}

const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase().trim();

/**
 * Which systems a curator could mean: by name, Arabic name, alias, component,
 * capability or matching phrase. Each match says what matched, unless it was
 * the name itself.
 */
export function findSystems(book: Catalogue, query: string): Map<string, string | null> {
  const wanted = fold(query);
  const found = new Map<string, string | null>();
  if (!wanted) return found;
  const hit = (text: string | null | undefined) => !!text && fold(text).includes(wanted);
  for (const system of book.release.systems) {
    if (hit(system.name) || hit(system.name_ar)) {
      found.set(system.id, null);
      continue;
    }
    const alias = system.aliases.find(hit);
    const component = system.components.find((item) => hit(item.name) || hit(item.name_ar) || item.aliases.some(hit));
    const capability = system.capabilities.find((item) => hit(item.name));
    const phrase = system.capabilities.flatMap((item) => item.triggers).find(hit);
    const reason = alias !== undefined
      ? `Also called “${alias}”`
      : component
        ? `Component: ${component.name}`
        : capability
          ? `Does: ${capability.name}`
          : phrase !== undefined
            ? `Matched by “${phrase}”`
            : undefined;
    if (reason !== undefined) found.set(system.id, reason);
  }
  return found;
}

export function connections(book: Catalogue, systemId: string): { dependsOn: Relationship[]; usedBy: Relationship[] } {
  const named = (id: string) => systemName(book, id);
  const order = (key: (item: Relationship) => string) => (a: Relationship, b: Relationship) =>
    named(key(a)).localeCompare(named(key(b)), "en", { sensitivity: "base" });
  return {
    dependsOn: book.release.relationships.filter((item) => item.source_system_id === systemId).sort(order((item) => item.target_system_id)),
    usedBy: book.release.relationships.filter((item) => item.target_system_id === systemId).sort(order((item) => item.source_system_id)),
  };
}

/** Every connection, from the depending system's name, then the other's. */
export function allConnections(book: Catalogue): Relationship[] {
  const named = (id: string) => systemName(book, id);
  return [...book.release.relationships].sort(
    (a, b) =>
      named(a.source_system_id).localeCompare(named(b.source_system_id), "en", { sensitivity: "base" })
      || named(a.target_system_id).localeCompare(named(b.target_system_id), "en", { sensitivity: "base" }),
  );
}

export type OfferingRole = { offering: Offering; component: string; role: string; orderTypes: string[]; description: string };
export type JourneyRole = { journey: Journey; activity: JourneyActivity; performs: boolean };

/** Where a system plays a part: the offerings' components it is responsible for, and the journey steps it takes. */
export function systemRoles(book: Catalogue, systemId: string): { offerings: OfferingRole[]; journeys: JourneyRole[] } {
  const offerings: OfferingRole[] = [];
  for (const offering of book.release.products ?? []) {
    const orderTypes = new Map(offering.order_types.map((item) => [item.code, item.name]));
    for (const component of offering.components) {
      for (const responsibility of component.responsibilities) {
        if (responsibility.system_id !== systemId) continue;
        offerings.push({
          offering,
          component: component.name,
          role: responsibility.role,
          orderTypes: responsibility.order_types.map((code) => orderTypes.get(code) ?? code),
          description: responsibility.description,
        });
      }
    }
  }
  const journeys: JourneyRole[] = [];
  for (const journey of book.release.journeys ?? []) {
    for (const activity of orderedSteps(journey)) {
      if (activity.performing_system_id === systemId) journeys.push({ journey, activity, performs: true });
      else if (activity.supporting_system_ids.includes(systemId)) journeys.push({ journey, activity, performs: false });
    }
  }
  return { offerings, journeys };
}

/** Steps sort by number as a number ("75" before "100"), then as text, as the service orders them. */
export function stepOrder(number: string): [number, number, string] {
  const match = /^\d+(\.\d+)?/.exec(number);
  return match ? [0, Number(match[0]), number] : [1, 0, number];
}

export function orderedSteps(journey: Journey): JourneyActivity[] {
  return [...journey.activities].sort((a, b) => {
    const [x1, x2, x3] = stepOrder(a.number);
    const [y1, y2, y3] = stepOrder(b.number);
    return x1 - y1 || x2 - y2 || x3.localeCompare(y3);
  });
}

/**
 * Where a step goes next, in words, when it is not simply the step below it:
 * "Then 30 if Covered; 80 if Not covered".
 */
export function nextSteps(journey: Journey, number: string): string {
  const leaving = journey.edges.filter((edge) => edge.from_activity === number);
  if (!leaving.length) return "";
  const steps = orderedSteps(journey);
  const below = steps[steps.findIndex((step) => step.number === number) + 1]?.number;
  if (leaving.length === 1 && leaving[0]!.kind === "sequence" && leaving[0]!.to_activity === below) return "";
  const parts = leaving.map((edge) =>
    edge.kind === "rejoin"
      ? `rejoins at ${edge.to_activity}`
      : edge.kind === "parallel"
        ? `${edge.to_activity} alongside`
        : edge.label && edge.kind !== "sequence"
          ? `${edge.to_activity} if ${edge.label}`
          : edge.to_activity,
  );
  return `Then ${parts.join("; ")}`;
}

/** Consecutive steps of one phase, as a timetable groups its stops. */
export function phaseRuns(steps: JourneyActivity[]): { phase: string | null; steps: JourneyActivity[] }[] {
  const runs: { phase: string | null; steps: JourneyActivity[] }[] = [];
  for (const step of steps) {
    const phase = step.phase ?? null;
    const last = runs.at(-1);
    if (last && last.phase === phase) last.steps.push(step);
    else runs.push({ phase, steps: [step] });
  }
  return runs;
}

/** What a version holds, counted. */
export function contents(release: Release): { systems: number; connections: number; offerings: number; journeys: number } {
  return {
    systems: release.systems.length,
    connections: release.relationships.length,
    offerings: release.products?.length ?? 0,
    journeys: release.journeys?.length ?? 0,
  };
}

const ITEM: Record<CatalogueDiff["changes"][number]["item"], [string, string]> = {
  system: ["system", "systems"],
  capability: ["capability", "capabilities"],
  component: ["component", "components"],
  relationship: ["connection", "connections"],
  landscape_domain: ["landscape domain", "landscape domains"],
  domain: ["business area", "business areas"],
  product: ["offering", "offerings"],
  journey: ["journey", "journeys"],
  channel: ["channel", "channels"],
  source: ["source", "sources"],
  conflict: ["conflict between sources", "conflicts between sources"],
  document: ["document", "documents"],
};

/** What this version would change if it were in service, counted. */
export function changeSentence(diff: CatalogueDiff): string | null {
  const tally = new Map<string, number>();
  for (const change of diff.changes) {
    const key = `${change.change}:${change.item}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const phrase = (kind: "added" | "changed" | "removed") =>
    Object.keys(ITEM)
      .map((item) => {
        const n = tally.get(`${kind}:${item}`) ?? 0;
        const [one, many] = ITEM[item as keyof typeof ITEM];
        return n ? count(n, one, many) : null;
      })
      .filter((part): part is string => part !== null);
  const list = (parts: string[]) =>
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
  const clauses = [
    phrase("added").length ? `add ${list(phrase("added"))}` : null,
    phrase("changed").length ? `change ${list(phrase("changed"))}` : null,
    phrase("removed").length ? `remove ${list(phrase("removed"))}` : null,
  ].filter((part): part is string => part !== null);
  if (clauses.length < 2) return clauses[0] ?? null;
  // Each clause may hold its own "and", so the clauses take a serial comma.
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses.at(-1)}`;
}

type Layer = Offering["components"][number]["realisation"][number]["layer"];
type Coverage = Offering["nfrs"][number]["coverage"];

/** The realisation layers, in the order a part is realised: what is sold, what delivers it, what it runs on. */
export const LAYERS: { layer: Layer; short: string; long: string }[] = [
  { layer: "cfs", short: "CFS", long: "Customer-facing service" },
  { layer: "rfs", short: "RFS", long: "Resource-facing service" },
  { layer: "resource", short: "Resource", long: "Resource" },
];

export const COVERAGE: Record<Coverage, string> = {
  defined: "Defined",
  partial: "Partly defined",
  missing: "Not defined",
};

const sameCode = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/** Whether a note holds for an order type read through a channel; none named means every one. */
export function concerns(note: Offering["lifecycle_notes"][number], orderCode: string, channelId: string | null): boolean {
  const order = !note.order_types.length || note.order_types.some((code) => sameCode(code, orderCode));
  const channel = channelId === null || !note.channels.length || note.channels.includes(channelId);
  return order && channel;
}
