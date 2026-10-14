/**
 * The catalogue lab's business rules, each in one place for every page that needs it:
 * which part is a bundle's hub, what a channel kind is called, which question an
 * eligibility point answers, a product's contract periods, when a system is core to a
 * product, and whether plans state a price. Agreed with Shady (phase 11, 2026-10-14).
 */
import type { Catalogue, Offering } from "../../architecture/model";

/** The device a bundle is built on: a device or router, else a part named CPE (as a word); none when nothing is. */
export function hubOf(offering: Offering): Offering["components"][number] | undefined {
  return offering.components.find((item) => /device|router/i.test(item.name)) ?? offering.components.find((item) => /\bcpe\b/i.test(item.name));
}

/** A channel kind's name: the version's vocabulary label, else the kind as written. */
export function channelKindName(data: Pick<Catalogue, "channelKindTerms">, kind: string): string {
  return data.channelKindTerms[kind] ?? kind;
}

/** The kinds through which people buy: a product is "sold through" these, not through system-to-system channels. */
export const SELLING_KINDS = ["assisted", "self-service"] as const;

export type EligibilityGroup = "who" | "where" | "terms" | "how" | "other";

/** Which question an eligibility point answers, by its title: who may buy, where, on what terms, through which route. */
export function eligibilityGroup(title: string): EligibilityGroup {
  if (/segment|customer|audience|business/i.test(title)) return "who";
  if (/location|area|site|coverage/i.test(title)) return "where";
  if (/commitment|contract|term|portal|account/i.test(title)) return "terms";
  if (/activation|migration|port|channel|order/i.test(title)) return "how";
  return "other";
}

/** The contract periods a customer can choose: the commitment point's headline, one period each. */
export function contractPeriods(offering: Offering, headline: (text: string) => string): string[] {
  const commitment = offering.eligibility.find((point) => /commitment|contract|term/i.test(point.title));
  return commitment ? headline(commitment.detail).split(/\s*,\s*|\s+or\s+/).filter(Boolean) : [];
}

/** A system is core to a product when at least half its journeys reach it, and never fewer than two. */
export function coreThreshold(journeys: number): number {
  return Math.max(2, Math.ceil(journeys / 2));
}

/** Whether the plans state a price: a characteristic named as one (price, fee, AED). Otherwise the price is a gap. */
export function isPriced(offering: Offering): boolean {
  return offering.plans.some((plan) => plan.characteristics.some((item) => /price|fee|aed/i.test(item.name)));
}
