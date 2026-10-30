/** What an edit sends, and why it cannot be sent yet: shared by the catalogue's editors. */
import type { CatalogueSystem, Journey, JourneyActivity, Offering, Relationship, RelationshipKind, Release } from "../api/client";

/** A name or code as compared: no case, no surrounding space. */
const fold = (text: string) => text.trim().toLocaleLowerCase();

/** Trims a lines field's value at submit: no blank items. */
export const lines = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

/** An id for a new item, from its name: "Order API" becomes "order-api". */
export function slug(name: string): string {
  return name.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "item";
}

/** What the service is sent: trimmed lists, and an id for every new part and note. */
/** An audience or a promise as the service is sent it: trimmed, and nothing said where a field was left empty. */
const finishedPoint = (point: Offering["values"][number]) => ({
  ...point,
  name: point.name.trim(),
  description: point.description?.trim() || null,
  source: point.source?.trim() || null,
});

export function finishedOffering(value: Offering): Offering {
  const noteIds = new Set((value.lifecycle_notes ?? []).map((note) => note.id).filter(Boolean));
  return {
    ...value,
    rules: lines(value.rules),
    order_types: value.order_types.map((type) => ({ ...type, delivery_drop: type.delivery_drop?.trim() || null, source: type.source?.trim() || null })),
    audiences: value.audiences.map(finishedPoint),
    values: value.values.map(finishedPoint),
    boundaries: lines(value.boundaries ?? []),
    not_used: lines(value.not_used ?? []),
    questions: numbered(value.questions ?? [], "OQ"),
    decisions: numbered(value.decisions ?? [], "AD"),
    components: value.components.map((part) => ({
      ...part,
      id: part.id || slug(part.name),
      // Linked to concepts, or saying why none fits: never both (concepts.check_link).
      capability_ids: part.unlinked_reason != null ? [] : part.capability_ids ?? [],
      unlinked_reason: part.unlinked_reason?.trim() ?? null,
    })),
    plans: (value.plans ?? []).map((plan) => ({
      ...plan,
      name: plan.name.trim(),
      description: plan.description?.trim() || null,
      source: plan.source?.trim() || null,
      // A row left empty goes; the service reads the amount and unit from the value.
      characteristics: plan.characteristics
        .map((item) => ({ ...item, name: item.name.trim(), value: item.value.trim() }))
        .filter((item) => item.name || item.value),
    })),
    business_rules: numbered(
      (value.business_rules ?? []).map((rule) => ({ ...rule, statement: rule.statement.trim(), kind: rule.kind?.trim() || null, source: rule.source?.trim() || null })),
      "BR",
    ),
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
/**
 * What stops an offering being saved, if anything: the message, and the field it is at as a path
 * ("plans.0.characteristics.1.value") with the words for that field, so the form can say it there.
 * A problem no single field holds (order tracking, lifecycle notes, sources) has no path.
 */
export type OfferingIssue = { message: string; at?: string; field?: string };

export function offeringIssue(value: Offering): OfferingIssue | null {
  const at = (path: string, field: string, message: string): OfferingIssue => ({ message, at: path, field });
  const say = (message: string): OfferingIssue => ({ message });
  if (!value.name.trim()) return at("name", "the offering's name", "Give the offering a name.");
  for (const [index, point] of value.audiences.entries()) {
    if (!point.name.trim()) return at(`audiences.${index}.name`, "an audience's name", "Every audience needs a name.");
  }
  for (const [index, point] of value.values.entries()) {
    if (!point.name.trim()) return at(`values.${index}.name`, "a promise's name", "Every promise needs a name.");
  }
  const codes: string[] = [];
  for (const [index, type] of value.order_types.entries()) {
    if (!type.name.trim()) return at(`order_types.${index}.name`, "an order type's name", "Every order type needs a name.");
    if (!type.code.trim()) return at(`order_types.${index}.code`, "an order type's code", "Every order type needs a code.");
    if (codes.includes(fold(type.code))) return at(`order_types.${index}.code`, "an order type's code", "Each order type needs its own code.");
    codes.push(fold(type.code));
  }
  const missing = orderTypeNamedElsewhere(value);
  if (missing) return say(`${missing.where} still names the order type ‘${missing.code}’, which the offering no longer has; change it there first.`);
  for (const [index, part] of value.components.entries()) {
    if (!part.name.trim()) return at(`components.${index}.name`, "a part's name", "Every part needs a name.");
    for (const [line, item] of part.responsibilities.entries()) {
      if (!item.system_id) return say(`${part.name}: every responsibility needs its system.`);
      if (!item.role.trim()) return at(`components.${index}.responsibilities.${line}.role`, "a responsibility's role", `${part.name}: every responsibility needs a role.`);
    }
    const keys: string[] = [];
    for (const [line, item] of (part.realisation ?? []).entries()) {
      if (!item.name.trim()) return at(`components.${index}.realisation.${line}.name`, "what a part is realised as", `${part.name}: everything it is realised as needs a name.`);
      const key = `${item.layer}:${item.name.trim().toLocaleLowerCase()}`;
      if (keys.includes(key)) return at(`components.${index}.realisation.${line}.name`, "what a part is realised as", `${part.name}: the same thing is named twice in one layer.`);
      keys.push(key);
    }
  }
  const tracking = value.tracking;
  if (tracking) {
    if (tracking.channels.some((item) => !item.channel_id)) return say("Order tracking: choose the channel of each channel's tracking.");
    const channels = tracking.channels.map((item) => item.channel_id);
    if (new Set(channels).size !== channels.length) return say("Order tracking: each channel is described once.");
    if (tracking.flows.some((item) => !item.label.trim() || !item.from_system_id || !item.to_system_id)) {
      return say("Order tracking: every flow needs its two systems and what it carries.");
    }
    for (const [items, what] of [[tracking.milestones, "milestone"], [tracking.statuses, "status"]] as const) {
      const labels = items.map((item) => item.label.trim().toLocaleLowerCase());
      if (labels.some((label) => !label)) return say(`Order tracking: every ${what} needs a name.`);
      if (new Set(labels).size !== labels.length) return say(`Order tracking: each ${what} is named once.`);
    }
    if (tracking.fallout.some((item) => !item.trigger.trim())) return say("Order tracking: every fallout case needs what makes it fall out.");
  }
  for (const note of value.lifecycle_notes ?? []) {
    const name = note.title.trim();
    if (!name) return say("Every lifecycle note needs a title.");
    if (!note.summary?.trim() && !note.blocks.length) return say(`${name}: a note needs a summary or what it says.`);
    for (const block of note.blocks) {
      if (block.kind === "text" && !block.text?.trim()) return say(`${name}: a paragraph needs its text.`);
      if (block.kind === "list" && !lines(block.items).length) return say(`${name}: a list needs at least one item.`);
      if (block.kind === "table") {
        const width = block.columns.filter((cell) => cell.trim()).length;
        if (!width) return say(`${name}: a table needs its column heads.`);
        if (block.rows.some((row) => row.length > block.columns.length)) return say(`${name}: a table row has more cells than the table has columns.`);
      }
    }
  }
  for (const [index, part] of value.components.entries()) {
    if (part.unlinked_reason != null && !part.unlinked_reason.trim()) {
      return at(`components.${index}.unlinked_reason`, "why no concept fits", "Say why no concept fits, so the gap is not taken for one nobody checked.");
    }
  }
  const planNames: string[] = [];
  for (const [index, plan] of (value.plans ?? []).entries()) {
    if (!plan.name.trim()) return at(`plans.${index}.name`, "a plan's name", "Every plan needs a name.");
    if (planNames.includes(fold(plan.name))) return at(`plans.${index}.name`, "a plan's name", "Each plan needs its own name.");
    planNames.push(fold(plan.name));
    const stated: string[] = [];
    for (const [line, item] of plan.characteristics.entries()) {
      if (!item.name.trim() && !item.value.trim()) continue;
      if (!item.name.trim()) return at(`plans.${index}.characteristics.${line}.name`, "a characteristic", `${plan.name.trim()}: every characteristic needs its name.`);
      if (!item.value.trim()) return at(`plans.${index}.characteristics.${line}.value`, "a characteristic's value", `${plan.name.trim()}: every characteristic needs its value.`);
      if (stated.includes(fold(item.name))) return at(`plans.${index}.characteristics.${line}.name`, "a characteristic", `${plan.name.trim()}: each characteristic is stated once.`);
      stated.push(fold(item.name));
    }
  }
  const ruleIds: string[] = [];
  for (const [index, rule] of (value.business_rules ?? []).entries()) {
    if (!rule.statement.trim()) return at(`business_rules.${index}.statement`, "what a business rule says", "Every business rule needs what it says.");
    if (rule.id.trim() && ruleIds.includes(fold(rule.id))) return at(`business_rules.${index}.id`, "a business rule's id", "Each business rule needs its own id.");
    if (rule.id.trim()) ruleIds.push(fold(rule.id));
  }
  if ((value.questions ?? []).some((item) => !item.text.trim())) return say("Every open question needs its question.");
  if ((value.decisions ?? []).some((item) => !item.title.trim())) return say("Every architecture decision needs what was decided.");
  for (const [items, what] of [[value.questions ?? [], "question"], [value.decisions ?? [], "decision"]] as const) {
    const ids = items.map((item) => fold(item.id)).filter(Boolean);
    if (new Set(ids).size !== ids.length) return say(`Each ${what} needs its own id.`);
  }
  if (value.primary_source && !(value.sources ?? []).includes(value.primary_source)) return say("Its primary source must be one of its sources.");
  const qualities: string[] = [];
  for (const [index, item] of (value.nfrs ?? []).entries()) {
    const quality = item.quality.trim().toLocaleLowerCase();
    if (!quality) return at(`nfrs.${index}.quality`, "a quality", "Every non-functional requirement needs a quality.");
    if (qualities.includes(quality)) return at(`nfrs.${index}.quality`, "a quality", "Each quality is stated once.");
    qualities.push(quality);
  }
  return null;
}

/** Why an offering cannot be saved yet, if anything. */
export const offeringProblem = (value: Offering): string | null => offeringIssue(value)?.message ?? null;

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
/** A value as edits compare it: keys in order, and nothing said (null or missing) the same as nothing. */
function settled(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(settled);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== null && item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, settled(item)]),
    );
  }
  return value;
}

/** Whether an edit would save an offering any differently: what its panel asks about before throwing the edit away. */
export function offeringChanged(before: Offering, after: Offering): boolean {
  return JSON.stringify(settled(finishedOffering(before))) !== JSON.stringify(settled(finishedOffering(after)));
}

/** A thing a part is realised as, linked to a record of another layer: it must be relinked or let go before saving. */
export function realisationProblem(value: Offering, release: Release): string | null {
  const records = new Map((release.realisations ?? []).map((record) => [record.id, record]));
  for (const part of value.components) {
    for (const item of part.realisation ?? []) {
      const record = item.record_id ? records.get(item.record_id) : undefined;
      if (record && record.layer !== item.layer) {
        return `${part.name || "A part"}: ${record.name} is a record of another layer; choose one of this layer, or none.`;
      }
    }
  }
  return null;
}

export function journeyOrderProblem(value: Offering, journeys: Journey[]): string | null {
  const known = new Set(value.order_types.map((type) => fold(type.code)));
  const journey = journeys.find((item) => item.product_id === value.id && item.order_type_code && !known.has(fold(item.order_type_code)));
  return journey ? `The journey ${journey.name} is for the order type ‘${journey.order_type_code}’; edit that journey first.` : null;
}

/** A step in words: "step 30", or by its name while it has no number. */
const stepWords = (step: JourneyActivity): string =>
  step.number.trim() ? `step ${step.number.trim()}` : step.name.trim() ? `the step ${step.name.trim()}` : "a new step";

/** What stops a journey being saved, if anything: the message, and the field it is at ("activities.2.name") with its words. */
export function journeyIssue(value: Journey): OfferingIssue | null {
  const at = (path: string, field: string, message: string): OfferingIssue => ({ message, at: path, field });
  if (!value.name.trim()) return at("name", "the journey's name", "Give the journey a name.");
  const numbers: string[] = [];
  for (const [index, step] of value.activities.entries()) {
    const which = stepWords(step);
    const path = (field: string) => `activities.${index}.${field}`;
    if (!step.number.trim()) return at(path("number"), `the number of ${which}`, "Give the step a number.");
    if (numbers.includes(step.number.trim())) return at(path("number"), `the number of ${which}`, `Another step is numbered ${step.number.trim()}; step numbers must be different.`);
    numbers.push(step.number.trim());
    if (!step.name.trim()) return at(path("name"), `the name of ${which}`, "Give the step a name.");
    // A step is performed by a named system, the channel's entry system, or a team or party: one of them.
    const performers = [step.performing_system_id, step.channel_entry ? "entry" : null, step.performer?.trim() || null].filter(Boolean);
    if (performers.length > 1) return at(path("performer"), `who performs ${which}`, "A step is performed by one of a system, the channel's entry system, or a team or party.");
    // Chosen, and then left empty: said, rather than saved as not said.
    if (step.performing_system_id === "") return at(path("system"), `the system of ${which}`, "Choose the system that performs it, or choose Not said above.");
    if (step.performer != null && !step.performer.trim()) return at(path("team"), `the team of ${which}`, "Name the team or party that performs it, or choose Not said above.");
  }
  if (value.order_type_code && !value.product_id) return at("order_type_code", "the order type", "An order type needs its offering.");
  return null;
}

/** Why a journey cannot be saved yet, if anything. */
export const journeyProblem = (value: Journey): string | null => journeyIssue(value)?.message ?? null;

/** A domain as edited: a landscape domain also says whether it is cross-cutting and its place on the map. */
export type EditedDomain = {
  id: string;
  name: string;
  parent_id?: string | null;
  description?: string | null;
  cross_cutting?: boolean;
  layout?: "bus" | "above_bus" | "side" | null;
  /** The edit's own name for a row, kept through moves; a new domain has no id yet. Never sent. */
  key?: string;
};

/** A place on the map, in words. */
export const LAYOUT_WORDS = { bus: "the bus", above_bus: "the layer above the bus", side: "a side layer" } as const;

/** How deep the service lets domains nest (`MAX_DOMAIN_DEPTH`). */
export const MAX_DOMAIN_DEPTH = 3;

/** A row of the outline: the domain, where it is in the list, how deep it sits, and its parent's place. */
export type OutlineRow<T> = { item: T; index: number; depth: number; parent: number | null };

/** How a domain is named in the edit: its id, or a new one's row key until it is saved. */
export const domainRef = (item: EditedDomain): string => item.id || item.key || "";

/**
 * The domains as an outline: the top domains in their order, each one's sub-domains under it in
 * theirs. A domain whose parent is missing, or that would be inside itself, reads at the top.
 */
export function domainOutline<T extends EditedDomain>(items: T[]): OutlineRow<T>[] {
  const at = new Map<string, number>();
  items.forEach((item, index) => domainRef(item) && !at.has(domainRef(item)) && at.set(domainRef(item), index));
  const parentOf = (index: number): number | null => {
    const parent = items[index]!.parent_id;
    const found = parent ? at.get(parent) : undefined;
    if (found === undefined || found === index) return null;
    // Inside itself, further up: read at the top, where the problem is said.
    for (let seen = new Set([index]), up: number | undefined = found; up !== undefined; ) {
      if (seen.has(up)) return null;
      seen.add(up);
      const next: string | null | undefined = items[up]!.parent_id;
      up = next ? at.get(next) : undefined;
    }
    return found;
  };
  const parents = items.map((_, index) => parentOf(index));
  const rows: OutlineRow<T>[] = [];
  const visit = (index: number, depth: number) => {
    rows.push({ item: items[index]!, index, depth, parent: parents[index] ?? null });
    items.forEach((_, child) => parents[child] === index && visit(child, depth + 1));
  };
  items.forEach((_, index) => parents[index] === null && visit(index, 0));
  return rows;
}

/** The domains in the outline's order, so each one's sub-domains follow it. */
export const outlined = <T extends EditedDomain>(items: T[]): T[] => domainOutline(items).map((row) => row.item);

/** A domain with everything inside it: its row and the rows under it, as a run of the outline. */
function subtree<T>(rows: OutlineRow<T>[], at: number): [number, number] {
  let end = at + 1;
  while (end < rows.length && rows[end]!.depth > rows[at]!.depth) end += 1;
  return [at, end];
}

/** The rows that share a domain's parent, in their order. */
export const siblingsOf = <T>(rows: OutlineRow<T>[], at: number): number[] =>
  rows.flatMap((row, place) => (row.parent === rows[at]!.parent ? [place] : []));

/** A domain moved past its neighbour among its siblings, with everything inside it. */
export function moveDomain<T extends EditedDomain>(items: T[], index: number, by: -1 | 1): T[] {
  const rows = domainOutline(items);
  const at = rows.findIndex((row) => row.index === index);
  const siblings = siblingsOf(rows, at);
  const other = siblings[siblings.indexOf(at) + by];
  if (other === undefined) return outlined(items);
  const [first, second] = by < 0 ? [other, at] : [at, other];
  const [a0, a1] = subtree(rows, first);
  const [b0, b1] = subtree(rows, second);
  const order = [...rows.slice(0, a0), ...rows.slice(b0, b1), ...rows.slice(a0, a1), ...rows.slice(b1)];
  return order.map((row) => row.item);
}

/** A domain removed; what was inside it moves up to its parent, or to the top. */
export function removeDomain<T extends EditedDomain>(items: T[], index: number): T[] {
  const gone = items[index]!;
  return outlined(
    items
      .filter((_, at) => at !== index)
      .map((item) => (domainRef(gone) && item.parent_id === domainRef(gone) ? { ...item, parent_id: gone.parent_id ?? null } : item)),
  );
}

/**
 * What stops a domain tree being saved, field by field, as the service checks it: a name on every
 * domain, unique among its siblings; a parent that is not itself or inside it, three levels at most;
 * a place on the map only for a top domain; one bus and one layer above it at most, and that layer
 * only with a bus. Of two given the same place, the one left where it was keeps it, and else the
 * one placed before `latest` (the key of the domain placed last).
 */
export function domainsIssue(items: EditedDomain[], before: EditedDomain[] = [], latest?: string): OfferingIssue | null {
  const at = (path: string, field: string, message: string): OfferingIssue => ({ message, at: path, field });
  const words = (item: EditedDomain) => (item.name.trim() ? `the domain ${item.name.trim()}` : "a new domain");
  // A new domain is named by its row key until saved, so one may already sit inside it.
  const byId = new Map(items.filter((item) => domainRef(item)).map((item) => [domainRef(item), item]));
  const named = new Map<string, string>();
  for (const [index, item] of items.entries()) {
    if (!item.name.trim()) return at(`domains.${index}.name`, `the name of ${words(item)}`, "Give the domain a name.");
    const sibling = `${item.parent_id ?? ""}\u0000${fold(item.name)}`;
    if (named.has(sibling)) {
      const parent = item.parent_id ? byId.get(item.parent_id)?.name : null;
      return at(`domains.${index}.name`, `the name of ${words(item)}`, `Another domain ${parent ? `inside ${parent}` : "at the top"} is named ${item.name.trim()}.`);
    }
    named.set(sibling, item.name);
    let depth = 1;
    for (let seen = new Set([domainRef(item)]), up = item.parent_id; up; depth += 1) {
      const parent = byId.get(up);
      if (!parent) return at(`domains.${index}.parent`, `where ${words(item)} sits`, "Its parent is not in the list; choose another, or At the top.");
      if (seen.has(domainRef(parent)) || domainRef(parent) === domainRef(item)) return at(`domains.${index}.parent`, `where ${words(item)} sits`, "It would be inside itself; choose another parent.");
      seen.add(domainRef(parent));
      up = parent.parent_id;
    }
    if (depth > MAX_DOMAIN_DEPTH) {
      return at(`domains.${index}.parent`, `where ${words(item)} sits`, `Domains are at most ${MAX_DOMAIN_DEPTH} levels deep; put it, or what it is inside, higher.`);
    }
  }
  const was = new Map(before.map((item) => [item.id, item.layout ?? null]));
  const moved = (item: EditedDomain) => !item.id || was.get(item.id) !== (item.layout ?? null);
  for (const [index, item] of items.entries()) {
    const place = `domains.${index}.layout`;
    if (item.layout && item.parent_id) {
      return at(place, `the place of ${words(item)}`, "Only a top domain has a place on the map; choose Among the layers, or put it at the top.");
    }
    if (item.layout === "bus" || item.layout === "above_bus") {
      const same = items.filter((other) => other.layout === item.layout);
      const keeper = same.find((other) => !moved(other)) ?? same.find((other) => other.key !== latest) ?? same[0]!;
      if (same.length > 1 && keeper !== item) {
        return at(place, `the place of ${words(item)}`, `${keeper.name.trim()} is ${LAYOUT_WORDS[item.layout]} already; the map has one.`);
      }
    }
    if (item.layout === "above_bus" && !items.some((other) => other.layout === "bus")) {
      return at(place, `the place of ${words(item)}`, "The layer above the bus needs a domain that is the bus.");
    }
  }
  return null;
}

/** What an edit of a domain tree has changed, in words: each domain by name, those added and removed, and the order. */
export function domainsChanges(before: EditedDomain[], after: EditedDomain[]): string[] {
  const settle = (item: EditedDomain) => ({
    name: item.name.trim(),
    parent_id: item.parent_id || null,
    description: item.description?.trim() || null,
    cross_cutting: Boolean(item.cross_cutting),
    layout: item.layout ?? null,
  });
  const was = new Map(before.map((item) => [item.id, item]));
  const changed: string[] = [];
  for (const item of after) {
    const old = item.id ? was.get(item.id) : undefined;
    if (!old) changed.push(item.name.trim() ? `the new domain ${item.name.trim()}` : "a new domain");
    else if (!savedSame(settle(old), settle(item))) changed.push(item.name.trim() || old.name);
  }
  const kept = new Set(after.map((item) => item.id));
  for (const item of before) if (!kept.has(item.id)) changed.push(`the removed domain ${item.name}`);
  // The order that means something: each parent's own, of the domains kept where they were.
  const now = new Map(after.map((item) => [item.id, item]));
  const stayed = (id: string) => Boolean(id) && was.has(id) && now.has(id) && (was.get(id)!.parent_id ?? null) === (now.get(id)!.parent_id ?? null);
  const order = (items: EditedDomain[]) =>
    domainOutline(items)
      .filter((row) => stayed(row.item.id))
      .map((row) => `${row.item.parent_id ?? ""}>${row.item.id}`);
  const grouped = (rows: string[]) => [...new Set(rows.map((row) => row.split(">")[0]))].map((parent) => rows.filter((row) => row.startsWith(`${parent}>`)));
  if (!savedSame(grouped(order(before)).sort(), grouped(order(after)).sort())) changed.push("the order");
  return changed.length > 6 ? [...changed.slice(0, 5), `${changed.length - 5} more`] : changed;
}

/**
 * What an edit of a journey has changed, in words: its own facts, each step by its number (a step
 * renumbered reads as one added and one removed), the branches, and each hand-over by its steps.
 */
export function journeyChanges(before: Journey, after: Journey): string[] {
  const [was, is] = [finishedJourney(before), finishedJourney(after)];
  const changed: string[] = [];
  const own: [string, (journey: Journey) => unknown][] = [
    ["the name", (journey) => journey.name],
    ["the offering and order type", (journey) => [journey.product_id ?? null, journey.order_type_code ?? null]],
    ["the journey's source", (journey) => [journey.confidence ?? null, journey.source]],
    ["what the journey is", (journey) => journey.description],
  ];
  for (const [name, read] of own) if (!savedSame(read(was), read(is))) changed.push(name);
  const steps = new Map(was.activities.map((step) => [step.number, step]));
  for (const step of is.activities) {
    const before = steps.get(step.number);
    if (!before) changed.push(`the new step ${step.number}`);
    else if (!savedSame(before, step)) changed.push(`step ${step.number}`);
  }
  const kept = new Set(is.activities.map((step) => step.number));
  for (const step of was.activities) if (!kept.has(step.number)) changed.push(`the removed step ${step.number}`);
  if (!savedSame(was.flow_rules, is.flow_rules)) changed.push("the branches");
  // Hand-overs have no id: each is known by its steps, and by which of those it is when two share them.
  const keyed = (links: Journey["integrations"]) => {
    const seen = new Map<string, number>();
    return links.map((link) => {
      const pair = `${link.from_activity} to ${link.to_activity}`;
      const count = (seen.get(pair) ?? 0) + 1;
      seen.set(pair, count);
      return { key: `${pair}#${count}`, pair, link };
    });
  };
  const links = new Map(keyed(was.integrations).map((item) => [item.key, item.link]));
  const now = keyed(is.integrations);
  for (const { key, pair, link } of now) {
    const before = links.get(key);
    if (!before) changed.push(`the new hand-over ${pair}`);
    else if (!savedSame(before, link)) changed.push(`the hand-over ${pair}`);
  }
  const still = new Set(now.map((item) => item.key));
  for (const { key, pair } of keyed(was.integrations)) if (!still.has(key)) changed.push(`the removed hand-over ${pair}`);
  // Said in a line beside the verb: a long list ends in how many more.
  return changed.length > 6 ? [...changed.slice(0, 5), `${changed.length - 5} more`] : changed;
}

/** What the service is sent for a journey: an id when new, trimmed text, and nothing said where a choice was left empty. */
export function finishedJourney(value: Journey): Journey {
  const text = (item: string | null | undefined) => item?.trim() || null;
  return {
    ...value,
    id: value.id || slug(value.name),
    name: value.name.trim(),
    source: text(value.source),
    description: text(value.description),
    edges: [],
    activities: value.activities.map((step) => ({
      ...step,
      number: step.number.trim(),
      name: step.name.trim(),
      performing_system_id: step.performing_system_id || null,
      performer: text(step.performer),
      role: text(step.role),
      etom: text(step.etom),
      description: text(step.description),
      output: text(step.output),
      system_function: text(step.system_function),
      point_of_no_return: text(step.point_of_no_return),
      track: text(step.track),
      source: text(step.source),
    })),
    integrations: value.integrations.map((link) => ({
      ...link,
      from_system_id: link.from_system_id || null,
      to_system_id: link.to_system_id || null,
      via_system_id: link.via_system_id || null,
      purpose: text(link.purpose),
      style: text(link.style),
      tmf_equivalent: text(link.tmf_equivalent),
      source: text(link.source),
    })),
  };
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
  // A placement a source makes elsewhere names both where and why, as the service keeps it.
  if (Boolean(value.placement_from?.trim()) !== Boolean(value.placement_reason?.trim())) {
    return value.placement_from?.trim() ? "Say why it sits here rather than where a source places it." : "Say where a source places it, or leave why it sits here empty.";
  }
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
  ["Where a source places it", (system) => [system.placement_from?.trim() || null, system.placement_reason?.trim() || null]],
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
    JSON.stringify(
      items.map((item) => [
        item.id, item.name.trim(), item.style, item.consumer_ids, item.entity_ids, [...item.relays].sort(), [...item.open_api_ids].sort(),
        item.description?.trim() || null, item.confidence ?? null, item.source?.trim() || null,
      ]),
    );
  return [
    ...(read(was.exposed) !== read(exposed) ? ["what it exposes"] : []),
    ...(JSON.stringify([...was.used].sort()) !== JSON.stringify([...used].sort()) ? ["what it uses"] : []),
  ];
}

type Concept = NonNullable<Release["business_capabilities"]>[number];

/** How concept labels compare (skos.label_key): letters and digits alone, so "Wi-Fi" is "WiFi". */
const labelKey = (label: string) => label.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

/** Concepts are at most this many levels deep under a business area (concepts.MAX_CONCEPT_DEPTH). */
const MAX_CONCEPT_DEPTH = 3;

export const blankConcept = (): Concept => ({ id: "", pref_label: "", alt_labels: [], close_match: [], deprecated: false, accepted: [] });

/** A new concept's id from its label, as the service makes one: "Managed Wi-Fi" is "cap-managed-wi-fi". */
function conceptIdFor(label: string, taken: Set<string>): string {
  const words = label.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  const base = words.length ? `cap-${words.join("-")}` : "cap";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** What the service is sent for a concept: trimmed, an id when new, a business area only on a top concept. */
export function finishedConcept(value: Concept, release: Release): Concept {
  const taken = new Set((release.business_capabilities ?? []).map((item) => item.id));
  return {
    ...value,
    id: value.id || conceptIdFor(value.pref_label, taken),
    pref_label: value.pref_label.trim(),
    alt_labels: lines(value.alt_labels),
    close_match: lines(value.close_match),
    definition: value.definition?.trim() || null,
    exact_match: value.exact_match?.trim() || null,
    source: value.source?.trim() || null,
    broader_id: value.broader_id || null,
    domain_id: value.broader_id ? null : value.domain_id || null,
    replaced_by: value.deprecated ? value.replaced_by || null : null,
  };
}

/** The concepts once this one is saved in its place, or added. */
export function conceptsWith(release: Release, concept: Concept): Concept[] {
  const all = release.business_capabilities ?? [];
  return all.some((item) => item.id === concept.id) ? all.map((item) => (item.id === concept.id ? concept : item)) : [...all, concept];
}

/** A concept and every concept under it, by id. */
export function conceptAndNarrower(concepts: Concept[], id: string): Set<string> {
  const found = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of concepts) {
      if (item.broader_id && found.has(item.broader_id) && !found.has(item.id)) {
        found.add(item.id);
        grew = true;
      }
    }
  }
  return found;
}

/** The business area a concept sits in among these concepts: its own as a top concept, else its top concept's. */
function domainAmong(concepts: Map<string, Concept>, id: string): string | null {
  const seen = new Set<string>();
  for (let item = concepts.get(id); item && !seen.has(item.id); item = item.broader_id ? concepts.get(item.broader_id) : undefined) {
    if (!item.broader_id) return item.domain_id ?? null;
    seen.add(item.id);
  }
  return null;
}

/** The concept form's fields a problem can belong to. */
export type ConceptField = "pref_label" | "alt_labels" | "broader_id" | "domain_id" | "close_match" | "replaced_by";

/** Why a concept cannot be saved yet, and the field it is at, if anything: the service's rules for concepts, and the capabilities linked to it. */
export function conceptIssue(value: Concept, release: Release): { field: ConceptField; message: string } | null {
  const concept = finishedConcept(value, release);
  const all = release.business_capabilities ?? [];
  const at = (field: ConceptField, message: string) => ({ field, message });
  if (!labelKey(concept.pref_label)) return at("pref_label", "Give the concept a preferred label, with a letter or digit.");
  if (concept.alt_labels.some((label) => !labelKey(label))) return at("alt_labels", "Every other label needs a letter or digit.");
  const own = [concept.pref_label, ...concept.alt_labels];
  const seen = new Set<string>();
  for (const label of own) {
    if (seen.has(labelKey(label))) return at("alt_labels", `“${label}” is listed twice; each of its labels differs from the rest.`);
    seen.add(labelKey(label));
  }
  for (const other of all.filter((item) => item.id !== concept.id)) {
    const clash = own.find((label) => [other.pref_label, ...other.alt_labels].some((theirs) => labelKey(theirs) === labelKey(label)));
    if (clash) {
      return at(labelKey(clash) === labelKey(concept.pref_label) ? "pref_label" : "alt_labels", `“${clash}” already names ${other.pref_label}; each label names one concept.`);
    }
  }
  const edited = conceptsWith(release, concept);
  const byId = new Map(edited.map((item) => [item.id, item]));
  const named = (id: string) => byId.get(id)?.pref_label ?? id;
  if (concept.broader_id) {
    if (conceptAndNarrower(edited, concept.id).has(concept.broader_id)) {
      return at("broader_id", `${named(concept.broader_id)} sits under this concept, so it cannot be its broader one.`);
    }
    const tooDeep = deepestUnder(edited, concept.id);
    if (tooDeep) return at("broader_id", `Concepts are at most ${MAX_CONCEPT_DEPTH} levels deep; under ${named(concept.broader_id)}, ${named(tooDeep)} would be deeper.`);
  }
  if (concept.exact_match && concept.close_match.includes(concept.exact_match)) {
    return at("close_match", `${concept.exact_match} is its outside match, so it is not also a near one.`);
  }
  if (new Set(concept.close_match).size !== concept.close_match.length) return at("close_match", "Each near match is named once.");
  if (concept.replaced_by) {
    const seenReplaced = new Set([concept.id]);
    for (let item = byId.get(concept.replaced_by); item?.replaced_by; item = byId.get(item.replaced_by)) {
      if (seenReplaced.has(item.replaced_by)) return at("replaced_by", `${named(concept.replaced_by)} is replaced, in turn, by this concept; choose another to replace it.`);
      seenReplaced.add(item.id);
    }
  }
  // A capability sits in its concept's capability domain: moving a concept must not leave one behind.
  const areas = new Map((release.capability_domains ?? []).map((item) => [item.id, item.name]));
  const moved = conceptAndNarrower(edited, concept.id);
  for (const system of release.systems) {
    for (const capability of system.capabilities) {
      if (!capability.concept_id || !moved.has(capability.concept_id) || !capability.domain_id) continue;
      const held = domainAmong(byId, capability.concept_id);
      if (held && held !== capability.domain_id) {
        const was = areas.get(capability.domain_id) ?? capability.domain_id;
        return at(
          concept.broader_id ? "broader_id" : "domain_id",
          `The capability ${capability.name} of ${system.name} sits in ${was}, and its concept would sit in ${areas.get(held) ?? held}; change that capability's domain first.`,
        );
      }
    }
  }
  return null;
}

/** Why a concept cannot be saved yet, if anything. */
export const conceptProblem = (value: Concept, release: Release): string | null => conceptIssue(value, release)?.message ?? null;

/** Levels from the top down to a concept, among these concepts; a loop stops counting past the limit. */
function levelOf(byId: Map<string, Concept>, id: string): number {
  let levels = 1;
  for (let item = byId.get(id); item?.broader_id && levels <= MAX_CONCEPT_DEPTH + 1; item = byId.get(item.broader_id)) levels += 1;
  return levels;
}

/** The first concept, this one or one under it, that would sit more than MAX_CONCEPT_DEPTH levels down, if any. */
function deepestUnder(concepts: Concept[], id: string): string | null {
  const byId = new Map(concepts.map((item) => [item.id, item]));
  return [...conceptAndNarrower(concepts, id)].find((item) => levelOf(byId, item) > MAX_CONCEPT_DEPTH) ?? null;
}

/** Whether a concept may sit under another without any concept going more than MAX_CONCEPT_DEPTH levels down. */
export function fitsUnder(release: Release, concept: Concept, broaderId: string): boolean {
  const edited = conceptsWith(release, { ...concept, id: concept.id || "*new", broader_id: broaderId });
  return deepestUnder(edited, concept.id || "*new") === null;
}

/** A concept's parts as its form names them, each read the way it is saved. */
const CONCEPT_PARTS: [string, (concept: Concept) => unknown][] = [
  ["its labels", (concept) => [concept.pref_label, concept.alt_labels]],
  ["what it means", (concept) => concept.definition ?? null],
  ["where it sits", (concept) => [concept.broader_id ?? null, concept.domain_id ?? null]],
  ["its outside matches", (concept) => [concept.exact_match ?? null, concept.close_match]],
  ["its source", (concept) => [concept.confidence ?? null, concept.source ?? null]],
  ["whether it is retired", (concept) => [concept.deprecated, concept.replaced_by ?? null]],
];

/** Which parts of a concept an edit has changed, by the form's names for them. */
export function conceptChanges(before: Concept, after: Concept, release: Release): string[] {
  const [was, is] = [finishedConcept(before, release), finishedConcept(after, release)];
  return CONCEPT_PARTS.filter(([, read]) => JSON.stringify(read(was)) !== JSON.stringify(read(is))).map(([name]) => name);
}

/** What names a concept, each with the page it is on (under the catalogue's base): system capabilities, offering parts, narrower concepts and concepts it replaces. */
export function conceptUsers(release: Release, id: string): { text: string; path: string }[] {
  const concepts = release.business_capabilities ?? [];
  const at = (kind: string, target: string) => `${kind}/${encodeURIComponent(target)}`;
  return [
    ...release.systems.flatMap((system) =>
      system.capabilities.filter((item) => item.concept_id === id).map((item) => ({ text: `the capability ${item.name} of ${system.name}`, path: at("systems", system.id) })),
    ),
    ...(release.products ?? []).flatMap((offering) =>
      offering.components
        .filter((part) => (part.capability_ids ?? []).includes(id))
        .map((part) => ({ text: `the part ${part.name} of ${offering.name}`, path: at("offerings", offering.id) })),
    ),
    ...concepts.filter((item) => item.broader_id === id).map((item) => ({ text: `the narrower concept ${item.pref_label}`, path: at("concepts", item.id) })),
    ...concepts.filter((item) => item.replaced_by === id).map((item) => ({ text: `${item.pref_label}, which it replaces`, path: at("concepts", item.id) })),
  ];
}

/** What names a concept, in words. */
export const conceptUses = (release: Release, id: string): string[] => conceptUsers(release, id).map((user) => user.text);

type PortfolioNode = NonNullable<Release["portfolio"]>[number];
type RealisationRecord = NonNullable<Release["realisations"]>[number];

/** Whether two values would be saved the same: keys in order, nothing said the same as nothing. */
export const savedSame = (before: unknown, after: unknown): boolean => JSON.stringify(settled(before)) === JSON.stringify(settled(after));

/** What the service is sent for the portfolio: trimmed, an id for every new node, a successor only on a retired one. */
export function finishedPortfolio(items: PortfolioNode[], release: Release): PortfolioNode[] {
  const taken = new Set([...(release.portfolio ?? []), ...items].map((item) => item.id).filter(Boolean));
  return items.map((item) => ({
    ...item,
    id: item.id || freeId(item.name, taken),
    name: item.name.trim(),
    level: item.level.trim(),
    description: item.description?.trim() || null,
    parent_id: item.parent_id || null,
    replaced_by: item.deprecated ? item.replaced_by || null : null,
  }));
}

/** What stops a register (the portfolio, the realisation records) being saved: the message, and the row's field it is at ("2.name"). */
export type RowIssue = { message: string; at?: string; field?: string };

/** Why the portfolio cannot be saved yet, and where, if anything: the service's rules, and what still sits in a node taken away. */
export function portfolioIssue(items: PortfolioNode[], release: Release): RowIssue | null {
  const at = (path: string, field: string, message: string): RowIssue => ({ message, at: path, field });
  for (const [index, item] of items.entries()) {
    if (!item.name.trim()) return at(`${index}.name`, "a node's name", "Every portfolio node needs a name.");
    if (!item.level.trim()) return at(`${index}.level`, "a node's level", "Every portfolio node needs its level, such as business unit or family.");
  }
  const finished = finishedPortfolio(items, release);
  const byId = new Map(finished.map((item) => [item.id, item]));
  const siblings = new Set<string>();
  for (const [index, item] of finished.entries()) {
    const key = `${item.parent_id ?? ""}:${fold(item.name)}`;
    if (siblings.has(key)) return at(`${index}.name`, "a node's name", `Another node in the same place is called ${item.name}; give each its own name.`);
    siblings.add(key);
    const seen = new Set([item.id]);
    for (let parent = byId.get(item.parent_id ?? ""); parent; parent = byId.get(parent.parent_id ?? "")) {
      if (seen.has(parent.id)) return at(`${index}.parent_id`, "where a node sits", `${item.name} would sit inside itself; choose another place for it.`);
      seen.add(parent.id);
    }
  }
  const kept = new Set(finished.map((item) => item.id));
  for (const gone of (release.portfolio ?? []).filter((item) => !kept.has(item.id))) {
    const offering = (release.products ?? []).find((item) => item.portfolio_node_id === gone.id);
    if (offering) return { message: `${offering.name} still sits in ${gone.name}; move it first, or retire the node instead.` };
    const child = finished.find((item) => item.parent_id === gone.id);
    if (child) return { message: `${child.name} still sits inside ${gone.name}; move it first.` };
  }
  return null;
}

/** Why the portfolio cannot be saved yet, if anything. */
export const portfolioProblem = (items: PortfolioNode[], release: Release): string | null => portfolioIssue(items, release)?.message ?? null;

/** Why a portfolio node cannot be taken away: an offering sits in it, or another node does. Retiring it keeps it readable. */
export function portfolioRemoveReason(node: PortfolioNode, items: PortfolioNode[], release: Release): string | null {
  if (!node.id) return null;
  const offering = (release.products ?? []).find((item) => item.portfolio_node_id === node.id);
  if (offering) return `${offering.name} sits in it; retire it instead.`;
  const child = items.find((item) => item.parent_id === node.id);
  if (child) return `${child.name.trim() || "Another node"} sits inside it; move that first.`;
  return null;
}

/** The layers that may realise each layer: those below it. */
export const BELOW: Record<RealisationRecord["layer"], RealisationRecord["layer"][]> = { cfs: ["rfs", "resource"], rfs: ["resource"], resource: [] };

/** What the service is sent for the realisation records: trimmed lists, an id from the layer and name for every new one. */
export function finishedRecords(items: RealisationRecord[], release: Release): RealisationRecord[] {
  const taken = new Set([...(release.realisations ?? []), ...items].map((item) => item.id).filter(Boolean));
  return items.map((item) => ({
    ...item,
    id: item.id || freeId(`${item.layer}-${item.name}`, taken),
    name: item.name.trim(),
    aliases: lines(item.aliases),
    description: item.description?.trim() || null,
    source: item.source?.trim() || null,
    // A resource is realised by nothing below it, and its rules belong to the services above.
    realised_by: item.layer === "resource" ? [] : item.realised_by,
    rules: item.layer === "resource" ? [] : lines(item.rules),
  }));
}

/** Why the realisation records cannot be saved yet, and where, if anything: the service's rules, and what still links a record. */
export function recordsIssue(items: RealisationRecord[], release: Release): RowIssue | null {
  const at = (path: string, field: string, message: string): RowIssue => ({ message, at: path, field });
  for (const [index, item] of items.entries()) {
    if (!item.name.trim()) return at(`${index}.name`, "a record's name", "Every realisation record needs a name.");
  }
  const finished = finishedRecords(items, release);
  const byId = new Map(finished.map((item) => [item.id, item]));
  const owners = new Map<string, RealisationRecord>();
  for (const [index, item] of finished.entries()) {
    const keys = [item.name, ...item.aliases].map(labelKey);
    if (new Set(keys).size !== keys.length) return at(`${index}.aliases`, "a record's other names", `${item.name}: each of its names differs from the rest.`);
    for (const label of [item.name, ...item.aliases]) {
      const owner = owners.get(`${item.layer}:${labelKey(label)}`);
      if (owner && owner !== item) {
        const where = labelKey(label) === labelKey(item.name) ? "name" : "aliases";
        return at(`${index}.${where}`, where === "name" ? "a record's name" : "a record's other names", `“${label}” already names ${owner.name} in the same layer; each name names one record.`);
      }
      owners.set(`${item.layer}:${labelKey(label)}`, item);
    }
    for (const below of item.realised_by.map((id) => byId.get(id))) {
      if (below && !BELOW[item.layer].includes(below.layer)) {
        return at(`${index}.realised_by`, "what realises a record", `${item.name} is realised only by the layers below it, not by ${below.name}.`);
      }
    }
    const rules = item.rules.map((rule) => rule.toLocaleLowerCase().split(/\s+/).join(" "));
    if (new Set(rules).size !== rules.length) return at(`${index}.rules`, "a record's specification rules", `${item.name} states a specification rule twice.`);
  }
  // What links a record must let go of it, or keep its layer, before it goes or moves.
  for (const was of release.realisations ?? []) {
    const now = byId.get(was.id);
    const index = finished.findIndex((item) => item.id === was.id);
    for (const offering of release.products ?? []) {
      for (const part of offering.components) {
        const link = (part.realisation ?? []).find((item) => item.record_id === was.id);
        if (!link) continue;
        if (!now) return { message: `The part ${part.name} of ${offering.name} is still realised as ${was.name}; change it there first.` };
        if (now.layer !== link.layer) {
          const layer = { cfs: "CFSS", rfs: "RFSS", resource: "resource" }[link.layer];
          return at(`${index}.layer`, "a record's layer", `The part ${part.name} of ${offering.name} is realised as it, as a ${layer}; keep its layer, or change the part first.`);
        }
      }
    }
    if (!now) {
      const above = finished.find((item) => item.realised_by.includes(was.id));
      if (above) return { message: `${above.name} is still realised by ${was.name}; take it off there first.` };
    }
  }
  return null;
}

/** Why the realisation records cannot be saved yet, if anything. */
export const recordsProblem = (items: RealisationRecord[], release: Release): string | null => recordsIssue(items, release)?.message ?? null;

/** Why a realisation record cannot be taken away: a part is realised as it, or another record is realised by it. */
export function recordRemoveReason(record: RealisationRecord, items: RealisationRecord[], release: Release): string | null {
  if (!record.id) return null;
  for (const offering of release.products ?? []) {
    const part = offering.components.find((item) => (item.realisation ?? []).some((line) => line.record_id === record.id));
    if (part) return `The part ${part.name} of ${offering.name} is realised as it; change that first.`;
  }
  const above = items.find((item) => item.realised_by.includes(record.id));
  if (above) return `${above.name.trim() || "Another record"} is realised by it; take it off there first.`;
  return null;
}

/**
 * The things an offering's parts are realised as that link to no record, but whose name is one a
 * record of the same layer goes by: each with where it is and the record it would link to.
 */
export function nameMatches(value: Offering, release: Release): { part: number; line: number; recordId: string }[] {
  const records = release.realisations ?? [];
  return value.components.flatMap((part, partIndex) =>
    (part.realisation ?? []).flatMap((item, line) => {
      if (item.record_id || !item.name.trim()) return [];
      const found = records.filter((record) => record.layer === item.layer && [record.name, ...record.aliases].some((name) => labelKey(name) === labelKey(item.name)));
      // Only one record may go by the name: two would be a guess.
      return found.length === 1 ? [{ part: partIndex, line, recordId: found[0]!.id }] : [];
    }),
  );
}

/** How many unlinked things parts are realised as go by a name two or more records of their layer share: those are not guessed at. */
export function ambiguousNameMatches(value: Offering, release: Release): number {
  const records = release.realisations ?? [];
  return value.components.reduce(
    (sum, part) =>
      sum +
      (part.realisation ?? []).filter(
        (item) =>
          !item.record_id &&
          item.name.trim() &&
          records.filter((record) => record.layer === item.layer && [record.name, ...record.aliases].some((name) => labelKey(name) === labelKey(item.name))).length > 1,
      ).length,
    0,
  );
}
