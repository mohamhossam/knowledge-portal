/**
 * The catalogue lab's business rules, each in one place for every page that needs it.
 * Every fact comes from the version: which part is a bundle's hub, what a channel kind is
 * called, which question an eligibility point answers, a product's contract terms and
 * whether a plan states a price. The one rule kept here is when a system is core to a
 * product (agreed with Shady, phase 11, 2026-10-14).
 */
import type { Catalogue, Offering, Point } from "../../catalogue/model/model";

/** The device a bundle is built on: the part the version marks as its hub, if it marks one. */
export function hubOf(offering: Offering): Offering["components"][number] | undefined {
  return offering.components.find((item) => item.hub);
}

/** A channel kind's name: the version's vocabulary label, else the kind as written. */
export function channelKindName(data: Pick<Catalogue, "channelKindTerms">, kind: string): string {
  return data.channelKindTerms[kind] ?? kind;
}

export type EligibilityGroup = "who" | "where" | "terms" | "how" | "other";

/** Which question an eligibility point answers, as the version sorts it; "other" when it doesn't. */
export function eligibilityGroup(point: Pick<Point, "aspect">): EligibilityGroup {
  return point.aspect ?? "other";
}

/** A system is core to a product when at least half its journeys reach it, and never fewer than two. */
export function coreThreshold(journeys: number): number {
  return Math.max(2, Math.ceil(journeys / 2));
}

/** Every ISO 4217 currency code the runtime knows ("AED", "EUR", "USD"…). */
const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

/** Whether the plans state a price: a characteristic whose unit is a currency. Otherwise the price is a gap. */
export function isPriced(offering: Offering): boolean {
  return offering.plans.some((plan) => plan.characteristics.some((item) => !!item.unit && CURRENCIES.has(item.unit.trim().toUpperCase())));
}

/** A plan characteristic the version gives an amount, with that amount as a number. */
export type PlanFigure = { name: string; value: string; amount: number; unit?: string | null };

/** A plan's figures: the characteristics the version states an amount for, in its order; the first is the plan's headline. */
export function planFigures(plan: Offering["plans"][number]): PlanFigure[] {
  return plan.characteristics.flatMap((item) => {
    const amount = item.amount === null || item.amount === undefined ? NaN : Number(item.amount);
    return Number.isFinite(amount) ? [{ name: item.name, value: item.value, amount, unit: item.unit }] : [];
  });
}
