/**
 * How systems connect, read from everything a version says about it: the
 * connections a curator stated, the interfaces systems expose to their
 * consumers, and the calls journey steps make to each other. One line per
 * pair of systems, in the direction of the dependency, whatever it is known
 * from; a stated connection keeps its own kind and words.
 */
import type { Journey, Relationship, RelationshipKind, SystemInterface } from "../api/client";

/** What a version holds that its links are read from. */
export type Linked = {
  relationships: Relationship[];
  interfaces?: SystemInterface[] | null;
  journeys?: Journey[] | null;
};

/** One line between two systems, with what it is known from. */
export type SystemLink = Relationship & {
  /** The connection a curator stated for this pair, if any: only these are edited. */
  stated: Relationship | null;
  interfaces: { id: string; name: string }[];
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

type Draft = { source: string; target: string; stated?: Relationship; kinds: Set<RelationshipKind>; interfaces: Map<string, string>; journeys: Map<string, { name: string; steps: number }>; said: Set<string>; purposes: string[] };

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
      found = { source, target, kinds: new Set(), interfaces: new Map(), journeys: new Map(), said: new Set(), purposes: [] };
      pairs.set(key, found);
    }
    return found;
  };

  for (const relationship of version.relationships) {
    const found = pair(relationship.source_system_id, relationship.target_system_id);
    if (found && !found.stated) found.stated = relationship;
  }

  for (const item of version.interfaces ?? []) {
    for (const consumer of item.consumer_ids) {
      // A consumer calls an API and reads a file; events and files go out from the system that exposes them.
      const outward = item.style === "event" || item.style === "file";
      const found = outward ? pair(item.system_id, consumer) : pair(consumer, item.system_id);
      if (!found) continue;
      found.kinds.add({ api: "calls_api", event: "publishes_events_to", file: "transfers_data_to", unspecified: "unspecified" }[item.style] as RelationshipKind);
      found.interfaces.set(item.id, item.name);
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

  return [...pairs.values()].map((found): SystemLink => {
    const derived = PRECEDENCE.find((item) => found.kinds.has(item)) ?? "unspecified";
    return {
      source_system_id: found.source,
      target_system_id: found.target,
      // A stated kind wins; a stated "unspecified" takes what the interfaces and journeys say.
      kind: found.stated && found.stated.kind !== "unspecified" ? found.stated.kind : derived,
      description: found.stated?.description || named([...found.said]) || found.purposes[0] || "",
      stated: found.stated ?? null,
      interfaces: [...found.interfaces].map(([id, name]) => ({ id, name })),
      journeys: [...found.journeys].map(([id, seen]) => ({ id, ...seen })),
    };
  });
}

/** Where a link is known from, in a few words: "Stated · 2 interfaces · 3 journeys". */
export function linkBasis(link: SystemLink): string {
  const parts: string[] = [];
  if (link.stated) parts.push("Stated");
  if (link.interfaces.length) parts.push(link.interfaces.length === 1 ? `Interface ${link.interfaces[0]!.name}` : `${link.interfaces.length} interfaces`);
  if (link.journeys.length) parts.push(link.journeys.length === 1 ? `Journey ${link.journeys[0]!.name}` : `${link.journeys.length} journeys`);
  return parts.join(" · ");
}
