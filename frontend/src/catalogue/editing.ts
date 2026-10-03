/** What an edit sends, and why it cannot be sent yet: shared by the catalogue's editors. */
import type { Journey, Offering } from "../api/client";

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
