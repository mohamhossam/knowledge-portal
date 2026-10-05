/** What an edit sends, and why it cannot be sent yet: shared by the catalogue's editors. */
import type { CatalogueSystem, Journey, Offering, Release } from "../api/client";

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
  return { ...value, id, aliases: lines(value.aliases), constraints: lines(value.constraints), components, capabilities };
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
  if (value.components.some((item) => !item.name.trim())) return "Every component needs a name.";
  return null;
}
