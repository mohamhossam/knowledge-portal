/** What an edit sends, and why it cannot be sent yet: shared by the catalogue's editors. */
import type { CatalogueSystem, Journey, Offering, Release } from "../api/client";

/** Trims a lines field's value at submit: no blank items. */
export const lines = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

/** An id for a new item, from its name: "Order API" becomes "order-api". */
export function slug(name: string): string {
  return name.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "item";
}

/** What the service is sent: trimmed lists, and an id for every new part. */
export function finishedOffering(value: Offering): Offering {
  return {
    ...value,
    rules: lines(value.rules),
    components: value.components.map((part) => ({ ...part, id: part.id || slug(part.name) })),
  };
}

/** Why the offering cannot be accepted yet, if anything. */
export function offeringProblem(value: Offering): string | null {
  if (!value.name.trim()) return "Give the offering a name.";
  if (value.order_types.some((type) => !type.name.trim() || !type.code.trim())) return "Every order type needs a name and a code.";
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
  const qualities = (value.nfrs ?? []).map((item) => item.quality.trim().toLocaleLowerCase());
  if (qualities.some((quality) => !quality)) return "Every non-functional requirement needs a quality.";
  if (new Set(qualities).size !== qualities.length) return "Each quality is stated once.";
  return null;
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
  const fold = (text: string) => text.trim().toLocaleLowerCase();
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
