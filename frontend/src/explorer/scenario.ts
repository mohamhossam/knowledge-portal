/**
 * The product architecture explorer's reading of a catalogue version: for one
 * offering and one of its order types, the journey that fulfils it, the systems
 * that take part, the parts and who is responsible for them, and what the
 * catalogue does not say yet. Pure functions over the version; nothing here
 * calls the service, and nothing is filled in that the version does not hold.
 */
import type { Channel, ExplorerRelease, Journey, Offering } from "../api/client";
import { orderedSteps } from "../catalogue/catalogue";
import { count } from "../home/format";

export type OrderType = Offering["order_types"][number];
export type Part = Offering["components"][number];
export type Responsibility = Part["responsibilities"][number];

export type Scenario = {
  offering: Offering;
  orderType: OrderType;
  /** The channels the order type can be ordered through; empty when the source does not say. */
  channels: Channel[];
  /** The channel being read; null when the order type names none, so every step is read. */
  channel: Channel | null;
  /**
   * The journey that fulfils this order type, when the version has one, cut to
   * the steps of the channel being read.
   */
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
  /** Whether it carries or shows this order's tracking. */
  tracks: boolean;
};

type Tracking = NonNullable<Offering["tracking"]>;
type TrackingFlow = Tracking["flows"][number];

/** Order tracking as one scenario reads it: none when the offering records no tracking. */
export type ScenarioTracking = {
  tracking: Tracking;
  /** Whether tracking is specified for this order type. */
  applies: boolean;
  /** The correlation of the channel being read, when tracking describes it. */
  entry: Tracking["channels"][number] | null;
  /** The shared flows, then the read path of the channel's tracking screen. */
  flows: (TrackingFlow & { readFor?: string })[];
  /** What tracking leaves undefined for this scenario, each as a sentence. */
  gaps: string[];
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

/** The steps of one channel: those it names and those every channel shares, with the arrows between them. */
export function forChannel(journey: Journey, channelId: string | null): Journey {
  if (channelId === null) return journey;
  const activities = journey.activities.filter((step) => !(step.channels ?? []).length || (step.channels ?? []).includes(channelId));
  const kept = new Set(activities.map((step) => step.number));
  const both = (from: string, to: string) => kept.has(from) && kept.has(to);
  return {
    ...journey,
    activities,
    edges: journey.edges.filter((edge) => both(edge.from_activity, edge.to_activity)),
    flow_rules: journey.flow_rules.filter((rule) => both(rule.from_activity, rule.to_activity)),
    integrations: journey.integrations.filter((link) => both(link.from_activity, link.to_activity)),
  };
}

/**
 * The scenario asked for, or the first one worth reading: the first offering's
 * first order type that has a journey, else its first order type; its channel
 * the one asked for, else its first. Null when the version holds no offering
 * with an order type.
 */
export function pickScenario(
  release: ExplorerRelease,
  offeringId?: string | null,
  orderCode?: string | null,
  channelId?: string | null,
): Scenario | null {
  const offerings = (release.products ?? []).filter((item) => item.order_types.length > 0);
  const offering = offerings.find((item) => item.id === offeringId) ?? offerings[0];
  if (!offering) return null;
  const asked = orderCode ? offering.order_types.find((item) => same(item.code, orderCode)) : undefined;
  const orderType =
    asked ??
    offering.order_types.find((item) => item.enabled && journeyFor(release, offering.id, item.code)) ??
    offering.order_types[0]!;
  const known = new Map((release.channels ?? []).map((item) => [item.id, item]));
  const channels = (orderType.channels ?? []).map((id) => known.get(id)).filter((item): item is Channel => item !== undefined);
  const channel = channels.find((item) => item.id === channelId) ?? channels[0] ?? null;
  const journey = journeyFor(release, offering.id, orderType.code);
  return { offering, orderType, channels, channel, journey: journey && forChannel(journey, channel?.id ?? null) };
}

/** Who performs a step in this scenario: its named system, else the channel's entry system. */
export function performer(scenario: Scenario, step: Journey["activities"][number]): string | null {
  if (step.performing_system_id) return step.performing_system_id;
  return step.channel_entry ? scenario.channel?.entry_system_id ?? null : null;
}

/**
 * How this scenario's order is tracked, as the original explorer's tracking
 * projection read it: specified for the order type or not, the chosen channel's
 * correlation and tracking screen, the shared flows plus that screen's read path,
 * and what is left undefined. Null when the offering records no tracking.
 */
export function trackingFor(scenario: Scenario): ScenarioTracking | null {
  const tracking = scenario.offering.tracking;
  if (!tracking) return null;
  const applies = !tracking.order_types.length || tracking.order_types.some((code) => same(code, scenario.orderType.code));
  const channel = scenario.channel;
  const entry = channel ? tracking.channels.find((item) => item.channel_id === channel.id) ?? null : null;
  const flows: ScenarioTracking["flows"] = [...tracking.flows];
  if (applies && entry?.ui_system_id && entry.read_system_id) {
    flows.push({
      from_system_id: entry.ui_system_id,
      to_system_id: entry.read_system_id,
      label: entry.read_interface ?? "Reads the order's progress",
      readFor: channel?.name,
      confidence: entry.confidence,
      source: entry.source,
    });
  }
  const gaps: string[] = [];
  if (applies) {
    if (channel && !entry) gaps.push(`Order tracking does not say how ${channel.name} tracks its orders.`);
    if (channel && entry && !entry.ui_system_id) gaps.push(`The screen ${channel.name} customers track their orders in is not named.`);
    if (channel && entry && !entry.correlation_key) gaps.push(`${channel.name} has no correlation key tying its order to the fulfilment order.`);
    const unclear = [...tracking.milestones.filter((item) => item.confidence === "gap").map((item) => item.label), ...tracking.fallout.filter((item) => item.confidence === "gap").map((item) => item.trigger)];
    if (unclear.length) gaps.push(`Tracking’s ${listed(unclear.map((item) => `‘${item}’`))} ${unclear.length === 1 ? "is" : "are"} marked in the sources as a gap.`);
  }
  return { tracking, applies, entry, flows: applies ? flows : [], gaps };
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
 * steps first name them, then those named only for a part, then those that only
 * carry or show the order's tracking.
 */
export function involvement(scenario: Scenario): Involvement[] {
  const found = new Map<string, Involvement>();
  const entry = (systemId: string) => {
    let item = found.get(systemId);
    if (!item) {
      item = { systemId, performs: [], supports: [], parts: [], tracks: false };
      found.set(systemId, item);
    }
    return item;
  };
  for (const step of scenario.journey ? orderedSteps(scenario.journey) : []) {
    const performing = performer(scenario, step);
    if (performing) entry(performing).performs.push(step.number);
    for (const systemId of step.supporting_system_ids) entry(systemId).supports.push(step.number);
  }
  for (const { part, responsibilities } of partsFor(scenario)) {
    for (const responsibility of responsibilities) entry(responsibility.system_id).parts.push({ part, responsibility });
  }
  const tracked = trackingFor(scenario);
  if (tracked?.applies) {
    const systems = [
      ...tracked.flows.flatMap((flow) => [flow.from_system_id, flow.to_system_id]),
      ...(tracked.entry ? [tracked.entry.ui_system_id, tracked.entry.read_system_id] : []),
      ...tracked.tracking.milestones.map((item) => item.system_id),
    ].filter((item): item is string => Boolean(item));
    for (const systemId of systems) entry(systemId).tracks = true;
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
    ...offering.components.flatMap((part) => part.realisation ?? []),
    ...partsFor(scenario).flatMap((item) => item.responsibilities),
    ...(journey ? [journey, ...journey.activities, ...journey.integrations, ...journey.flow_rules] : []),
  ];
  return facts.filter((fact) => fact.confidence === "gap").length;
}

/** What the catalogue does not say about this scenario, each as a sentence. */
export function gaps(scenario: Scenario): string[] {
  const found: string[] = [];
  if (!scenario.channels.length) {
    found.push(`No channel is recorded for ${scenario.orderType.name}, so the steps of every channel are shown together.`);
  }
  if (!scenario.journey) {
    found.push(`No journey is recorded for ${scenario.orderType.name}, so no step or hand-over can be shown.`);
  } else {
    const steps = orderedSteps(scenario.journey);
    const entry = steps.filter((step) => !step.performing_system_id && step.channel_entry).map((step) => step.number);
    const unnamed = steps.filter((step) => !step.performing_system_id && !step.channel_entry).map((step) => step.number);
    if (unnamed.length === 1) found.push(`Step ${unnamed[0]} names no system that performs it.`);
    else if (unnamed.length) found.push(`Steps ${listed(unnamed)} name no system that performs them.`);
    if (entry.length && !scenario.channel?.entry_system_id) {
      const who = scenario.channel ? `${scenario.channel.name} names no entry system` : "no channel is recorded";
      found.push(
        `${entry.length === 1 ? `Step ${entry[0]} is` : `Steps ${listed(entry)} are`} performed by the channel’s entry system, but ${who}.`,
      );
    }
  }
  const unowned = partsFor(scenario).filter((item) => !item.responsibilities.length).map((item) => item.part.name);
  if (unowned.length) {
    found.push(`No system is named as responsible for ${listed(unowned)} in ${scenario.orderType.name}.`);
  }
  const unrealised = scenario.offering.components.filter((part) => !(part.realisation ?? []).length).map((part) => part.name);
  if (unrealised.length) found.push(`How ${listed(unrealised)} ${unrealised.length === 1 ? "is" : "are"} realised is not recorded.`);
  const nfrs = scenario.offering.nfrs ?? [];
  const undefinedQualities = nfrs.filter((item) => item.coverage === "missing").map((item) => item.quality);
  if (!nfrs.length) found.push(`No non-functional requirement is recorded for ${scenario.offering.name}.`);
  else if (undefinedQualities.length) {
    found.push(`${listed(undefinedQualities)} ${undefinedQualities.length === 1 ? "is" : "are"} not defined by any source.`);
  }
  const tracked = trackingFor(scenario);
  if (!tracked) found.push(`No order tracking is recorded for ${scenario.offering.name}.`);
  else found.push(...tracked.gaps);
  const marked = gapFacts(scenario);
  if (marked) found.push(`${count(marked, "fact is", "facts are")} marked in ${marked === 1 ? "its source" : "their sources"} as a gap.`);
  return found;
}
