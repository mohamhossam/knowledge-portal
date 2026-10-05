/**
 * The product architecture explorer's reading of a catalogue version: for one
 * offering and one of its order types, the journey that fulfils it, the systems
 * that take part, the parts and who is responsible for them, and what the
 * catalogue does not say yet. Pure functions over the version; nothing here
 * calls the service, and nothing is filled in that the version does not hold.
 */
import type { ExplorerRelease, Journey, Offering } from "../api/client";
import { orderedSteps } from "../catalogue/catalogue";
import { count } from "../home/format";

export type OrderType = Offering["order_types"][number];
export type Part = Offering["components"][number];
export type Responsibility = Part["responsibilities"][number];

export type Scenario = {
  offering: Offering;
  orderType: OrderType;
  /** The journey that fulfils this order type, when the version has one. */
  journey: Journey | null;
};

/** What a system does in one scenario. */
export type Involvement = {
  systemId: string;
  /** The steps it performs, in order. */
  performs: string[];
  /** The steps it supports, in order. */
  supports: string[];
  /** The parts it is responsible for in this order type. */
  parts: { part: Part; responsibility: Responsibility }[];
};

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/** The journey for an offering's order type, if the version records one. */
export function journeyFor(release: ExplorerRelease, offeringId: string, orderCode: string): Journey | null {
  return (
    (release.journeys ?? []).find(
      (journey) => journey.product_id === offeringId && journey.order_type_code != null && same(journey.order_type_code, orderCode),
    ) ?? null
  );
}

/**
 * The scenario asked for, or the first one worth reading: the first offering's
 * first order type that has a journey, else its first order type. Null when the
 * version holds no offering with an order type.
 */
export function pickScenario(release: ExplorerRelease, offeringId?: string | null, orderCode?: string | null): Scenario | null {
  const offerings = (release.products ?? []).filter((item) => item.order_types.length > 0);
  const offering = offerings.find((item) => item.id === offeringId) ?? offerings[0];
  if (!offering) return null;
  const asked = orderCode ? offering.order_types.find((item) => same(item.code, orderCode)) : undefined;
  const orderType =
    asked ??
    offering.order_types.find((item) => item.enabled && journeyFor(release, offering.id, item.code)) ??
    offering.order_types[0]!;
  return { offering, orderType, journey: journeyFor(release, offering.id, orderType.code) };
}

/** Whether a responsibility holds for an order type: it names none (so every one), or names this one. */
export function appliesTo(responsibility: Responsibility, orderCode: string): boolean {
  return !responsibility.order_types.length || responsibility.order_types.some((code) => same(code, orderCode));
}

/** The parts of the offering with the responsibilities that hold for this order type. */
export function partsFor(scenario: Scenario): { part: Part; responsibilities: Responsibility[] }[] {
  return scenario.offering.components.map((part) => ({
    part,
    responsibilities: part.responsibilities.filter((item) => appliesTo(item, scenario.orderType.code)),
  }));
}

/**
 * Every system that takes part: first those the journey names, in the order its
 * steps first name them, then those named only for a part.
 */
export function involvement(scenario: Scenario): Involvement[] {
  const found = new Map<string, Involvement>();
  const entry = (systemId: string) => {
    let item = found.get(systemId);
    if (!item) {
      item = { systemId, performs: [], supports: [], parts: [] };
      found.set(systemId, item);
    }
    return item;
  };
  for (const step of scenario.journey ? orderedSteps(scenario.journey) : []) {
    if (step.performing_system_id) entry(step.performing_system_id).performs.push(step.number);
    for (const systemId of step.supporting_system_ids) entry(systemId).supports.push(step.number);
  }
  for (const { part, responsibilities } of partsFor(scenario)) {
    for (const responsibility of responsibilities) entry(responsibility.system_id).parts.push({ part, responsibility });
  }
  return [...found.values()];
}

/** "3", "3 and 5", "3, 5 and 9". */
export function listed(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] ?? "";
}

/** The facts of a scenario its sources leave as gaps. */
function gapFacts(scenario: Scenario): number {
  const { offering, orderType, journey } = scenario;
  const facts = [
    offering,
    orderType,
    ...offering.components,
    ...partsFor(scenario).flatMap((item) => item.responsibilities),
    ...(journey ? [journey, ...journey.activities, ...journey.integrations, ...journey.flow_rules] : []),
  ];
  return facts.filter((fact) => fact.confidence === "gap").length;
}

/** What the catalogue does not say about this scenario, each as a sentence. */
export function gaps(scenario: Scenario): string[] {
  const found: string[] = [];
  if (!scenario.journey) {
    found.push(`No journey is recorded for ${scenario.orderType.name}, so no step or hand-over can be shown.`);
  } else {
    const unnamed = orderedSteps(scenario.journey).filter((step) => !step.performing_system_id).map((step) => step.number);
    if (unnamed.length === 1) found.push(`Step ${unnamed[0]} names no system that performs it.`);
    else if (unnamed.length) found.push(`Steps ${listed(unnamed)} name no system that performs them.`);
  }
  const unowned = partsFor(scenario).filter((item) => !item.responsibilities.length).map((item) => item.part.name);
  if (unowned.length) {
    found.push(`No system is named as responsible for ${listed(unowned)} in ${scenario.orderType.name}.`);
  }
  const marked = gapFacts(scenario);
  if (marked) found.push(`${count(marked, "fact is", "facts are")} marked in ${marked === 1 ? "its source" : "their sources"} as a gap.`);
  return found;
}
