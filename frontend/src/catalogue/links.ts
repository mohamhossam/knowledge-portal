/**
 * How systems connect, read from everything a version says about it: the
 * connections a curator stated, the interfaces systems expose to their
 * consumers, and the calls journey steps make to each other. One line per
 * pair of systems, in the direction of the dependency, whatever it is known
 * from; a stated connection keeps its own kind and words.
 */
import type { Journey, Relationship, RelationshipKind, ServedLink, SystemInterface } from "../api/client";

/** What a version holds that its links are read from; the service sends them worked out. */
export type Linked = {
  relationships: Relationship[];
  connections?: ServedLink[] | null;
  interfaces?: SystemInterface[] | null;
  journeys?: Journey[] | null;
};

/** One line between two systems, with what it is known from. */
export type SystemLink = Relationship & {
  /** The connection a curator stated for this pair, if any: only these are edited. */
  stated: Relationship | null;
  /** The interfaces it is known from, with the system that exposes each. */
  interfaces: { id: string; name: string; systemId: string }[];
  journeys: { id: string; name: string; steps: number }[];
};

/** The kind a journey step's call style reads as; anything else stays unspecified. */
export function styleKind(style: string | null | undefined): RelationshipKind {
  const said = (style ?? "").toLowerCase();
  if (/event|message/.test(said)) return "publishes_events_to";
  if (/api|xml|callback|rest|soap|request/.test(said)) return "calls_api";
  if (/database|file|batch/.test(said)) return "transfers_data_to";
  return "unspecified";
}

// Of several kinds on one pair, the first said here names the line.
const PRECEDENCE: RelationshipKind[] = ["calls_api", "publishes_events_to", "transfers_data_to", "orchestrates", "unspecified"];

type Draft = { source: string; target: string; stated: Relationship[]; kinds: Set<RelationshipKind>; interfaces: Map<string, { name: string; systemId: string }>; journeys: Map<string, { name: string; steps: number }>; said: Set<string>; purposes: string[] };

/** Said when nothing names what a link carries (as the service says it). */
export const UNNAMED = "Known from its interfaces and journeys";

/** A few names in full, the rest counted: "A, B, C and 4 more". */
function named(names: string[]): string {
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
}

/** Every link between systems in a version, stated ones first in their own order, then the rest as found. */
export function systemLinks(version: Linked): SystemLink[] {
  const pairs = new Map<string, Draft>();
  const pair = (source: string, target: string): Draft | undefined => {
    if (!source || !target || source === target) return undefined;
    const key = `${source}>${target}`;
    let found = pairs.get(key);
    if (!found) {
      found = { source, target, stated: [], kinds: new Set(), interfaces: new Map(), journeys: new Map(), said: new Set(), purposes: [] };
      pairs.set(key, found);
    }
    return found;
  };

  for (const relationship of version.relationships) {
    const found = pair(relationship.source_system_id, relationship.target_system_id);
    if (found) found.stated.push(relationship);
  }

  for (const item of version.interfaces ?? []) {
    for (const consumer of item.consumer_ids) {
      // A consumer calls an API and reads a file; events and files go out from the system that exposes them.
      const outward = item.style === "event" || item.style === "file";
      const found = outward ? pair(item.system_id, consumer) : pair(consumer, item.system_id);
      if (!found) continue;
      found.kinds.add({ api: "calls_api", event: "publishes_events_to", file: "transfers_data_to", unspecified: "unspecified" }[item.style] as RelationshipKind);
      found.interfaces.set(item.id, { name: item.name, systemId: item.system_id });
      found.said.add(item.name);
    }
  }

  for (const journey of version.journeys ?? []) {
    const performer = new Map(journey.activities.map((step) => [step.number, step.performing_system_id ?? undefined]));
    for (const call of journey.integrations) {
      const from = call.from_system_id ?? performer.get(call.from_activity);
      const to = call.to_system_id ?? performer.get(call.to_activity);
      const found = from && to ? pair(from, to) : undefined;
      if (!found) continue;
      found.kinds.add(styleKind(call.style));
      const seen = found.journeys.get(journey.id);
      found.journeys.set(journey.id, { name: journey.name, steps: (seen?.steps ?? 0) + 1 });
      if (call.interface) found.said.add(call.interface);
      if (call.purpose) found.purposes.push(call.purpose);
    }
  }

  return [...pairs.values()].flatMap((found): SystemLink[] => {
    const derived = PRECEDENCE.find((item) => found.kinds.has(item)) ?? "unspecified";
    const interfaces = [...found.interfaces].map(([id, item]) => ({ id, ...item }));
    const journeys = [...found.journeys].map(([id, seen]) => ({ id, ...seen }));
    if (found.stated.length) {
      // Each stated connection keeps its own words; the first is also what the interfaces and
      // journeys add to, and takes their kind when it left its own unsaid.
      return found.stated.map((stated, at) => ({
        source_system_id: found.source,
        target_system_id: found.target,
        kind: at === 0 && stated.kind === "unspecified" ? derived : stated.kind,
        description: stated.description,
        stated,
        interfaces: at === 0 ? interfaces : [],
        journeys: at === 0 ? journeys : [],
      }));
    }
    return [{
      source_system_id: found.source,
      target_system_id: found.target,
      kind: derived,
      description: named([...found.said]) || found.purposes[0] || UNNAMED,
      stated: null,
      interfaces,
      journeys,
    }];
  });
}

/** A link's key: a pair can hold several stated connections, told apart by their words. */
export const linkKey = (link: SystemLink) => `${link.source_system_id}>${link.target_system_id}>${link.description}`;

/**
 * A version's links: as the service works them out (domain.architecture.links), or, for a
 * version that came without them, worked out here the same way.
 */
export function linksOf(version: Linked): SystemLink[] {
  if (!version.connections) return systemLinks(version);
  return version.connections.map((link) => ({
    source_system_id: link.source_system_id,
    target_system_id: link.target_system_id,
    kind: link.kind,
    description: link.description,
    stated: link.stated
      ? version.relationships.find(
          (item) => item.source_system_id === link.source_system_id && item.target_system_id === link.target_system_id && item.description === link.description,
        ) ?? null
      : null,
    interfaces: link.interfaces.map((item) => ({ id: item.id, name: item.name, systemId: item.system_id })),
    journeys: link.journeys.map((item) => ({ ...item })),
  }));
}
