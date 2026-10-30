/** What an edit sends, and why it cannot be sent yet: shared by the catalogue's editors. */
import type { CatalogueSystem, Journey, Offering, Relationship, RelationshipKind, Release } from "../api/client";

/** A name or code as compared: no case, no surrounding space. */
const fold = (text: string) => text.trim().toLocaleLowerCase();

/** Trims a lines field's value at submit: no blank items. */
export const lines = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

/** An id for a new item, from its name: "Order API" becomes "order-api". */
export function slug(name: string): string {
  return name.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "item";
}

/** What the service is sent: trimmed lists, and an id for every new part and note. */
export function finishedOffering(value: Offering): Offering {
  const noteIds = new Set((value.lifecycle_notes ?? []).map((note) => note.id).filter(Boolean));
  return {
    ...value,
    rules: lines(value.rules),
    boundaries: lines(value.boundaries ?? []),
    not_used: lines(value.not_used ?? []),
    questions: numbered(value.questions ?? [], "OQ"),
    decisions: numbered(value.decisions ?? [], "AD"),
    components: value.components.map((part) => ({ ...part, id: part.id || slug(part.name) })),
    lifecycle_notes: (value.lifecycle_notes ?? []).map((note) => ({
      ...note,
      id: note.id || freeId(note.title, noteIds),
      blocks: note.blocks.map((block) => ({
        ...block,
        items: block.kind === "list" ? lines(block.items) : [],
        columns: block.kind === "table" ? block.columns.map((cell) => cell.trim()) : [],
        rows:
          block.kind === "table"
            ? block.rows.map((row) => row.map((cell) => cell.trim())).filter((row) => row.some(Boolean))
            : [],
        text: block.kind === "text" ? block.text : null,
        caption: block.kind === "table" ? block.caption : null,
      })),
    })),
  };
}

/** Items with ids: the one each has, or the next "OQ-03" free. */
function numbered<T extends { id: string }>(items: T[], prefix: string): T[] {
  const taken = new Set(items.map((item) => fold(item.id)).filter(Boolean));
  let next = 1;
  return items.map((item) => {
    if (item.id.trim()) return { ...item, id: item.id.trim() };
    let id = `${prefix}-${String(next).padStart(2, "0")}`;
    while (taken.has(fold(id))) id = `${prefix}-${String(++next).padStart(2, "0")}`;
    taken.add(fold(id));
    return { ...item, id };
  });
}

/** Why the offering cannot be accepted yet, if anything. */
export function offeringProblem(value: Offering): string | null {
  if (!value.name.trim()) return "Give the offering a name.";
  if (value.order_types.some((type) => !type.name.trim() || !type.code.trim())) return "Every order type needs a name and a code.";
  const codes = value.order_types.map((type) => fold(type.code));
  if (new Set(codes).size !== codes.length) return "Each order type needs its own code.";
  const missing = orderTypeNamedElsewhere(value);
  if (missing) return `${missing.where} still names the order type ‘${missing.code}’, which the offering no longer has; change it there first.`;
  if (value.components.some((part) => !part.name.trim())) return "Every part needs a name.";
  if (value.components.some((part) => part.responsibilities.some((item) => !item.role.trim() || !item.system_id))) {
    return "Every responsibility needs a system and a role.";
  }
  for (const part of value.components) {
    const realised = part.realisation ?? [];
    if (realised.some((item) => !item.name.trim())) return `${part.name}: everything it is realised as needs a name.`;
    const keys = realised.map((item) => `${item.layer}:${item.name.trim().toLocaleLowerCase()}`);
    if (new Set(keys).size !== keys.length) return `${part.name}: the same thing is named twice in one layer.`;
  }
  const tracking = value.tracking;
  if (tracking) {
    if (tracking.channels.some((item) => !item.channel_id)) return "Order tracking: choose the channel of each channel's tracking.";
    const channels = tracking.channels.map((item) => item.channel_id);
    if (new Set(channels).size !== channels.length) return "Order tracking: each channel is described once.";
    if (tracking.flows.some((item) => !item.label.trim() || !item.from_system_id || !item.to_system_id)) {
      return "Order tracking: every flow needs its two systems and what it carries.";
    }
    for (const [items, what] of [[tracking.milestones, "milestone"], [tracking.statuses, "status"]] as const) {
      const labels = items.map((item) => item.label.trim().toLocaleLowerCase());
      if (labels.some((label) => !label)) return `Order tracking: every ${what} needs a name.`;
      if (new Set(labels).size !== labels.length) return `Order tracking: each ${what} is named once.`;
    }
    if (tracking.fallout.some((item) => !item.trigger.trim())) return "Order tracking: every fallout case needs what makes it fall out.";
  }
  for (const note of value.lifecycle_notes ?? []) {
    const name = note.title.trim();
    if (!name) return "Every lifecycle note needs a title.";
    if (!note.summary?.trim() && !note.blocks.length) return `${name}: a note needs a summary or what it says.`;
    for (const block of note.blocks) {
      if (block.kind === "text" && !block.text?.trim()) return `${name}: a paragraph needs its text.`;
      if (block.kind === "list" && !lines(block.items).length) return `${name}: a list needs at least one item.`;
      if (block.kind === "table") {
        const width = block.columns.filter((cell) => cell.trim()).length;
        if (!width) return `${name}: a table needs its column heads.`;
        if (block.rows.some((row) => row.length > block.columns.length)) return `${name}: a table row has more cells than the table has columns.`;
      }
    }
  }
  if ((value.questions ?? []).some((item) => !item.text.trim())) return "Every open question needs its question.";
  if ((value.decisions ?? []).some((item) => !item.title.trim())) return "Every architecture decision needs what was decided.";
  for (const [items, what] of [[value.questions ?? [], "question"], [value.decisions ?? [], "decision"]] as const) {
    const ids = items.map((item) => fold(item.id)).filter(Boolean);
    if (new Set(ids).size !== ids.length) return `Each ${what} needs its own id.`;
  }
  if (value.primary_source && !(value.sources ?? []).includes(value.primary_source)) return "Its primary source must be one of its sources.";
  const qualities = (value.nfrs ?? []).map((item) => item.quality.trim().toLocaleLowerCase());
  if (qualities.some((quality) => !quality)) return "Every non-functional requirement needs a quality.";
  if (new Set(qualities).size !== qualities.length) return "Each quality is stated once.";
  return null;
}

/** The first part, tracking or note naming an order type the offering does not have. */
function orderTypeNamedElsewhere(value: Offering): { where: string; code: string } | null {
  const known = new Set(value.order_types.map((type) => fold(type.code)));
  const unknown = (codes: string[]) => codes.find((code) => !known.has(fold(code)));
  for (const part of value.components) {
    for (const item of part.responsibilities) {
      const code = unknown(item.order_types);
      if (code) return { where: `${part.name || "A part"}’s responsibility ${item.role || ""}`.trim(), code };
    }
  }
  const tracked = unknown(value.tracking?.order_types ?? []);
  if (tracked) return { where: "Order tracking", code: tracked };
  for (const note of value.lifecycle_notes ?? []) {
    const code = unknown(note.order_types);
    if (code) return { where: `The lifecycle note ${note.title || ""}`.trim(), code };
  }
  return null;
}

/** A journey of this offering whose order type the offering no longer has: it must change first. */
export function journeyOrderProblem(value: Offering, journeys: Journey[]): string | null {
  const known = new Set(value.order_types.map((type) => fold(type.code)));
  const journey = journeys.find((item) => item.product_id === value.id && item.order_type_code && !known.has(fold(item.order_type_code)));
  return journey ? `The journey ${journey.name} is for the order type ‘${journey.order_type_code}’; edit that journey first.` : null;
}

/** Why the journey cannot be accepted yet, if anything. */
export function journeyProblem(value: Journey): string | null {
  if (!value.name.trim()) return "Give the journey a name.";
  if (value.activities.some((step) => !step.number.trim() || !step.name.trim())) return "Every step needs a number and a name.";
  const numbers = value.activities.map((step) => step.number.trim());
  if (new Set(numbers).size !== numbers.length) return "Step numbers must be different.";
  if (value.order_type_code && !value.product_id) return "An order type needs its offering.";
  return null;
}

/** An id not yet taken: "order-hub", then "order-hub-2". */
function freeId(name: string, taken: Set<string>): string {
  const base = slug(name);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** What the service is sent for a system: trimmed lists, and an id for everything new. */
export function finishedSystem(value: CatalogueSystem, release: Release): CatalogueSystem {
  const others = new Set(release.systems.filter((system) => system.id !== value.id).map((system) => system.id));
  const id = value.id || freeId(value.name, others);
  const componentIds = new Set(value.components.map((item) => item.id).filter(Boolean));
  const renamed = new Map<string, string>();
  const components = value.components.map((item) => {
    if (item.id) return { ...item, aliases: lines(item.aliases) };
    const next = freeId(item.name, componentIds);
    renamed.set(item.name, next);
    return { ...item, id: next, aliases: lines(item.aliases) };
  });
  const capabilityIds = new Set(value.capabilities.map((item) => item.id).filter(Boolean));
  const capabilities = value.capabilities.map((item) => ({
    ...item,
    id: item.id || freeId(item.name, capabilityIds),
    triggers: lines(item.triggers),
    // A component chosen before it was saved is named by its name until it has an id.
    component_id: item.component_id ? renamed.get(item.component_id) ?? item.component_id : null,
  }));
  // A note says its share of something it masters; an empty one, or one on data it no longer masters, goes.
  const mastery_notes = (value.mastery_notes ?? [])
    .map((item) => ({ ...item, note: item.note.trim() }))
    .filter((item) => item.note && (value.masters ?? []).includes(item.entity_id));
  return {
    ...value,
    id,
    aliases: lines(value.aliases),
    constraints: lines(value.constraints),
    components,
    capabilities: capabilities.map((item) => ({ ...item, unlinked_reason: item.unlinked_reason?.trim() ?? null })),
    mastery_notes,
  };
}

/** The business area a concept sits in: its own, or the nearest broader concept's. */
export function conceptDomain(release: Release, conceptId: string): string | null {
  const concepts = new Map((release.business_capabilities ?? []).map((concept) => [concept.id, concept]));
  const seen = new Set<string>();
  for (let concept = concepts.get(conceptId); concept && !seen.has(concept.id); concept = concept.broader_id ? concepts.get(concept.broader_id) : undefined) {
    if (concept.domain_id) return concept.domain_id;
    seen.add(concept.id);
  }
  return null;
}

/** Why a system cannot be saved yet, if anything. */
export function systemProblem(value: CatalogueSystem, release: Release): string | null {
  if (!value.name.trim()) return "Give the system a name.";
  const names = [value.name, ...lines(value.aliases)].map(fold);
  const clash = release.systems
    .filter((system) => system.id !== value.id)
    .find((system) => [system.name, ...system.aliases].some((name) => names.includes(fold(name))));
  if (clash) return `${clash.name} already goes by one of these names; every name and alias must be unique.`;
  if (value.capabilities.some((item) => !item.name.trim())) return "Every capability needs a name.";
  if (value.capabilities.some((item) => !lines(item.triggers).length)) return "Every capability needs at least one matching phrase.";
  const concepts = new Map((release.business_capabilities ?? []).map((concept) => [concept.id, concept]));
  for (const item of value.capabilities) {
    if (item.unlinked_reason != null && !item.unlinked_reason.trim()) return `${item.name}: say why no concept fits.`;
    if (!item.concept_id) continue;
    if (!concepts.has(item.concept_id)) return `${item.name}: its concept is not in this version; choose another.`;
    const held = conceptDomain(release, item.concept_id);
    if (item.domain_id && held && held !== item.domain_id) {
      const area = release.capability_domains?.find((domain) => domain.id === held)?.name ?? held;
      return `${item.name}: its concept sits in ${area}, so the capability does too; change its business area or its concept.`;
    }
  }
  const reads = value.reads ?? [];
  const both = (value.masters ?? []).find((entity) => reads.includes(entity));
  if (both) return "A system does not read information it masters; take it off one of the two.";
  if (value.components.some((item) => !item.name.trim())) return "Every component needs a name.";
  return null;
}

/** A system's parts as its form names them, each read the way it is saved. */
const SYSTEM_PARTS: [string, (system: CatalogueSystem) => unknown][] = [
  ["Name", (system) => system.name.trim()],
  ["Sits in", (system) => system.landscape_domain_id ?? null],
  ["Also called", (system) => system.aliases],
  ["What it is", (system) => system.description ?? null],
  ["Outside the operator", (system) => system.external],
  ["Owner in the source", (system) => system.owner ?? null],
  ["Its source", (system) => [system.confidence ?? null, system.source ?? null]],
  ["Roadmap", (system) => system.roadmap ?? null],
  ["Retired", (system) => [system.deprecated, system.replaced_by ?? null]],
  ["What it does", (system) => system.capabilities],
  ["Information", (system) => [system.masters ?? [], system.reads ?? [], system.mastery_notes ?? []]],
  ["Components", (system) => system.components],
  ["Constraints", (system) => system.constraints],
];

/** Which parts of a system an edit has changed, by the form's names for them; none when it would save the same. */
export function systemChanges(before: CatalogueSystem, after: CatalogueSystem, release: Release): string[] {
  const [was, is] = [finishedSystem(before, release), finishedSystem(after, release)];
  return SYSTEM_PARTS.filter(([, read]) => JSON.stringify(read(was)) !== JSON.stringify(read(is))).map(([name]) => name);
}

/**
 * One of a system's connections as its "In context" edit holds it: the system at the other
 * end, how, and what for. `original` is the connection it was read from; a new one has none.
 */
export type Link = { other: string; kind: RelationshipKind; description: string; original?: Relationship };

/** A system's connections as links, what it depends on and what depends on it, each in the map's order: by the other system's name. */
export function linksOf(release: Release, systemId: string): { dependsOn: Link[]; usedBy: Link[] } {
  const names = new Map(release.systems.map((item) => [item.id, item.name]));
  const link = (item: Relationship, other: string): Link => ({ other, kind: item.kind, description: item.description, original: item });
  const inOrder = (links: Link[]) => links.sort((a, b) => (names.get(a.other) ?? a.other).localeCompare(names.get(b.other) ?? b.other));
  return {
    dependsOn: inOrder(release.relationships.filter((item) => item.source_system_id === systemId && item.target_system_id !== systemId).map((item) => link(item, item.target_system_id))),
    usedBy: inOrder(release.relationships.filter((item) => item.target_system_id === systemId && item.source_system_id !== systemId).map((item) => link(item, item.source_system_id))),
  };
}

/**
 * The draft's connections once a system's links are saved: every other connection as it was,
 * each kept link in its old place, the new ones after. What a link was read from keeps its
 * provenance.
 */
export function relationshipsWith(release: Release, systemId: string, dependsOn: Link[], usedBy: Link[]): Relationship[] {
  const made = (link: Link, source: string, target: string): Relationship => ({
    ...link.original,
    source_system_id: source,
    target_system_id: target,
    kind: link.kind,
    description: link.description.trim(),
    accepted: link.original?.accepted ?? [],
  });
  const edited = new Map<Relationship, Relationship>();
  const added: Relationship[] = [];
  for (const link of dependsOn) {
    const next = made(link, systemId, link.other);
    if (link.original) edited.set(link.original, next);
    else added.push(next);
  }
  for (const link of usedBy) {
    const next = made(link, link.other, systemId);
    if (link.original) edited.set(link.original, next);
    else added.push(next);
  }
  const touches = (item: Relationship) => item.source_system_id === systemId || item.target_system_id === systemId;
  return [
    ...release.relationships.flatMap((item) => (touches(item) && item.source_system_id !== item.target_system_id ? (edited.has(item) ? [edited.get(item)!] : []) : [item])),
    ...added,
  ];
}

/** Why a system's links cannot be saved yet, if anything (ADR-0119: one dependency of each kind between two systems). */
export function linksProblem(release: Release, systemId: string, dependsOn: Link[], usedBy: Link[]): string | null {
  const name = (id: string) => release.systems.find((item) => item.id === id)?.name ?? id;
  if ([...dependsOn, ...usedBy].some((link) => !link.other)) return "Choose the system at the other end of every connection.";
  if ([...dependsOn, ...usedBy].some((link) => !link.description.trim())) return "Say what every connection is for.";
  for (const [links, side] of [[dependsOn, "It depends on"], [usedBy, "Depend on it"]] as const) {
    const seen = new Set<string>();
    for (const link of links) {
      const key = `${link.other}:${link.kind}`;
      if (seen.has(key)) return `${side}: ${name(link.other)} is listed twice the same way; keep one, or say another way.`;
      seen.add(key);
    }
  }
  return null;
}

/** Which sides of a system's links an edit has changed, by the panel's names for them. */
export function linksChanges(release: Release, systemId: string, dependsOn: Link[], usedBy: Link[]): string[] {
  const was = linksOf(release, systemId);
  const read = (links: Link[]) => JSON.stringify(links.map((link) => [link.other, link.kind, link.description.trim()]));
  return [
    // In the map's order, left to right.
    ...(read(was.usedBy) !== read(usedBy) ? ["what depends on it"] : []),
    ...(read(was.dependsOn) !== read(dependsOn) ? ["what it depends on"] : []),
  ];
}

type Interface = NonNullable<Release["interfaces"]>[number];

/** A name as interfaces compare them: no case, no spaces or punctuation ("CRM GW API" is "crm-gw api"). */
const nameKey = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** A system's interfaces as its record edits them: those it exposes, and the ids of those it uses. */
export function interfacesOfSystem(release: Release, systemId: string): { exposed: Interface[]; used: string[] } {
  const all = release.interfaces ?? [];
  return {
    exposed: all.filter((item) => item.system_id === systemId),
    used: all.filter((item) => item.system_id !== systemId && item.consumer_ids.includes(systemId)).map((item) => item.id),
  };
}

/**
 * The draft's interfaces once a system's are saved: those it exposes as edited (a new one gets an
 * id from its system and name), and every other system's with this one added to or taken off its
 * users. The rest stay as they were, in their places.
 */
export function interfacesWith(release: Release, systemId: string, exposed: Interface[], used: string[]): Interface[] {
  const all = release.interfaces ?? [];
  const taken = new Set(all.map((item) => item.id));
  const tidy = (item: Interface): Interface => ({
    ...item,
    name: item.name.trim(),
    description: item.description?.trim() || null,
    source: item.source?.trim() || null,
    system_id: systemId,
  });
  const edited = new Map(exposed.filter((item) => item.id).map((item) => [item.id, tidy(item)]));
  const kept = all.flatMap((item): Interface[] => {
    if (item.system_id === systemId) return edited.has(item.id) ? [edited.get(item.id)!] : [];
    const uses = used.includes(item.id);
    const listed = item.consumer_ids.includes(systemId);
    if (uses === listed) return [item];
    return [{ ...item, consumer_ids: uses ? [...item.consumer_ids, systemId] : item.consumer_ids.filter((id) => id !== systemId) }];
  });
  const added = exposed.filter((item) => !item.id).map((item) => ({ ...tidy(item), id: freeId(`${systemId}-${item.name}`, taken) }));
  return [...kept, ...added];
}

/** Why a system's interfaces cannot be saved yet, if anything: the service's rules, and what still goes through one removed. */
export function interfacesProblem(release: Release, systemId: string, exposed: Interface[], used: string[]): string | null {
  const all = release.interfaces ?? [];
  if (exposed.some((item) => !item.name.trim())) return "Every interface it exposes needs a name.";
  const names = new Set<string>();
  for (const item of exposed) {
    const key = nameKey(item.name);
    if (names.has(key)) return `Two interfaces it exposes are called ${item.name.trim()}; give each its own name.`;
    names.add(key);
  }
  // What goes through an interface it no longer exposes must let go of it first.
  const kept = new Set(exposed.map((item) => item.id).filter(Boolean));
  for (const gone of all.filter((item) => item.system_id === systemId && !kept.has(item.id))) {
    const journey = (release.journeys ?? []).find((item) => item.integrations.some((link) => link.interface_id === gone.id));
    if (journey) return `The journey ${journey.name} still goes through ${gone.name}; change its hand-over first.`;
    const tracked = (release.products ?? []).find((item) => (item.tracking?.flows ?? []).some((flow) => flow.interface_id === gone.id));
    if (tracked) return `The order tracking of ${tracked.name} still goes through ${gone.name}; change it first.`;
    const relay = all.find((item) => item.system_id !== systemId && item.relays.includes(gone.id));
    if (relay) return `${relay.name} still relays ${gone.name}; change that interface first.`;
  }
  // An interface it exposes that relays another needs it to use that one.
  for (const item of exposed) {
    const relayed = all.find((other) => item.relays.includes(other.id) && other.system_id !== systemId && !used.includes(other.id));
    if (relayed) return `${item.name.trim()} relays ${relayed.name}, so it keeps using ${relayed.name}.`;
  }
  return null;
}

/** Which of a system's interfaces an edit has changed, by the panel's names for them. */
export function interfacesChanges(release: Release, systemId: string, exposed: Interface[], used: string[]): string[] {
  const was = interfacesOfSystem(release, systemId);
  const read = (items: Interface[]) =>
    JSON.stringify(items.map((item) => [item.id, item.name.trim(), item.style, item.consumer_ids, item.entity_ids, item.description?.trim() || null, item.confidence ?? null, item.source?.trim() || null]));
  return [
    ...(read(was.exposed) !== read(exposed) ? ["what it exposes"] : []),
    ...(JSON.stringify([...was.used].sort()) !== JSON.stringify([...used].sort()) ? ["what it uses"] : []),
  ];
}
