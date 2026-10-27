/**
 * A catalogue version from the API, mapped once into the view model. Journeys are
 * kept as the catalogue holds them (ADR-0096: numbered activities on tracks, the
 * flow the service derives, integrations) and seen one channel at a time: the
 * steps of other channels drop out, the flow is the one the service derived for
 * that view (`channel_edges`, `shared_edges`, `edges`), and BPMN gateways and
 * events are placed where the flow branches, splits and joins. The model carries
 * kinds, never English: the lab's words.ts names them.
 */
import type { Release, SourceReference } from "../../api/client";
import { ABOVE_BUS_DOMAIN, BAND_DOMAINS, BUS_DOMAIN, parseDrop, parseProposition, parseQuestion, SIDE_DOMAINS } from "./conventions";
import {
  type Activity,
  type ActivityCall,
  type ActivityStep,
  type Catalogue,
  type Channel,
  type Evidence,
  type Finding,
  type FlowEdge,
  type Integration,
  type IntegrationMode,
  type Journey,
  type JourneyView,
  type Lane,
  type Offering,
  type Performer,
  type Point,
  type Source,
  type Step,
  type TamDomain,
} from "./model";
import { channelKindTerms, roleRank, roleTerms, stepRoleIn } from "./vocabulary";

type ApiJourney = NonNullable<Release["journeys"]>[number];
type ApiOrderType = NonNullable<Release["products"]>[number]["order_types"][number];
type ApiEdge = ApiJourney["edges"][number];

/**
 * Evidence from a fact's confidence and its source line ("SDD v2.3 · §P1 · a note"), as the
 * service read the line against the register (review recommendation 5): its source, then
 * where in it and any note. A line the service names no source for is all "where".
 */
export function parseEvidence(confidence: string | null | undefined, source: string | null | undefined, lines: ReadonlyMap<string, SourceReference>): Evidence {
  const status = confidence === "confirmed" || confidence === "inferred" || confidence === "gap" ? confidence : "inferred";
  if (!source) return { status };
  const line = lines.get(source.trim());
  if (!line?.source_id) return { status, where: source };
  const [where, ...rest] = (line.where ?? "").split(" · ").filter(Boolean);
  return { status, source: line.source_id, ...(where ? { where } : {}), ...(rest.length ? { note: rest.join(" · ") } : {}) };
}

/** An order type's delivery drop and the rest of its description; read from the prose for a version saved before the service sent the drop. */
function delivery(type: ApiOrderType): { drop?: string; note: string } {
  return type.delivery_drop ? { drop: type.delivery_drop, note: type.description ?? "" } : parseDrop(type.description);
}

/** Whether a call waits for its answer, as the source's timing says (any case). */
export function modeOf(timing: string | null | undefined): IntegrationMode {
  const value = timing?.toLowerCase();
  return value === "sync" || value === "async" ? value : "not-stated";
}

function flowEdges(edges: ApiEdge[]): FlowEdge[] {
  return edges.map((edge) => ({ from: edge.from_activity, to: edge.to_activity, kind: edge.kind, ...(edge.label ? { label: edge.label } : {}) }));
}

function performer(activity: ApiJourney["activities"][number]): Performer {
  if (activity.performing_system_id) return { kind: "system", systemId: activity.performing_system_id };
  if (activity.channel_entry) return { kind: "entry" };
  if (activity.performer) return { kind: "team", name: activity.performer };
  return { kind: "channel" };
}

/** A journey's activities, flow and calls, mapped once. A call's id is stable across the channels' views. */
function journeyOf(
  journey: ApiJourney,
  channels: string[],
  evidence: (item: { confidence?: string | null; source?: string | null }) => Evidence,
  roleOf: (role: string | null | undefined, roleId: string | null | undefined) => string | undefined,
): Journey {
  const activities: Activity[] = journey.activities.map((item) => ({
    number: item.number,
    name: item.name,
    performer: performer(item),
    channels: item.channels,
    mainTrack: item.main_track,
    role: roleOf(item.role, item.role_id),
    etom: item.etom ?? undefined,
    detail: item.description ?? undefined,
    ponr: item.point_of_no_return ?? undefined,
    output: item.output ?? undefined,
    evidence: evidence(item),
  }));
  const seen = new Map<string, number>();
  const calls: ActivityCall[] = journey.integrations.map((call) => {
    const operation = call.interface ?? call.interaction ?? undefined;
    const base = `${call.from_activity}>${call.to_activity}:${call.to_system_id ?? ""}:${operation ?? "handover"}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return {
      id: count > 1 ? `${base}#${count}` : base,
      fromActivity: call.from_activity,
      toActivity: call.to_activity,
      ...(call.from_system_id != null ? { fromSystem: call.from_system_id } : {}),
      ...(call.to_system_id != null ? { toSystem: call.to_system_id } : {}),
      ...(call.via_system_id ? { via: call.via_system_id } : {}),
      ...(operation !== undefined ? { operation } : {}),
      purpose: call.purpose ?? "",
      ...(call.style != null ? { style: call.style } : {}),
      mode: modeOf(call.timing),
      ...(call.payload ? { payload: call.payload } : {}),
      ...(call.tmf_equivalent ? { tmf: call.tmf_equivalent } : {}),
      evidence: evidence(call),
    };
  });
  return {
    id: journey.id,
    offeringId: journey.product_id ?? null,
    orderType: journey.order_type_code ?? null,
    name: journey.name,
    summary: journey.description ?? "",
    channels,
    activities,
    flow: {
      all: flowEdges(journey.edges),
      // The channels' own flows arrived after the whole one: a journey read before them has none.
      byChannel: Object.fromEntries((journey.channel_edges ?? []).map((item) => [item.channel_id, flowEdges(item.edges)])),
      shared: flowEdges(journey.shared_edges ?? []),
    },
    calls,
  };
}

type EvidenceOf = (item: { confidence?: string | null; source?: string | null }) => Evidence;

/** The version's sources, which every fact's evidence names. */
function sourcesOf(release: Release): Source[] {
  return (release.sources ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    short: item.short ?? item.id,
    version: item.version ?? undefined,
    level: item.level,
    owner: item.authority ?? undefined,
    file: item.file ?? undefined,
    scope: item.scope ?? undefined,
  }));
}

/** Where TAM draws a domain, by id, for a version whose domains name no layout. */
function conventionalLayout(id: string): TamDomain["layout"] {
  if (id === BUS_DOMAIN) return "bus";
  if (id === ABOVE_BUS_DOMAIN) return "above_bus";
  return SIDE_DOMAINS.includes(id) ? "side" : undefined;
}

/** The TAM domains, each with its groups, whether it is a cross-cutting band, and where the map draws it. */
function domainsOf(landscape: NonNullable<Release["landscape_domains"]>): Catalogue["domains"] {
  const tops = landscape.filter((item) => !item.parent_id);
  // A version saved before the service marked cross-cutting domains marks none: then they are known by id.
  const marked = landscape.some((item) => item.cross_cutting);
  // Likewise a version saved before domains named their place on the map (review recommendation 10).
  const placed = landscape.some((item) => item.layout);
  return tops.map((top) => {
    const layout = placed ? top.layout ?? undefined : conventionalLayout(top.id);
    return {
      id: top.id,
      name: top.name,
      scope: top.description ?? "",
      groups: landscape.filter((item) => item.parent_id === top.id).map((item) => ({ id: item.id, name: item.name })),
      band: marked ? top.cross_cutting : BAND_DOMAINS.includes(top.id),
      ...(layout ? { layout } : {}),
    };
  });
}

/** The systems, each placed in its domain and group. */
function systemsOf(release: Release, evidence: EvidenceOf): Catalogue["systems"] {
  const landscape = release.landscape_domains ?? [];
  const byId = new Map(landscape.map((item) => [item.id, item]));
  // A system placed deeper than a group sits in its top domain, in the group under it: the map draws two levels.
  const place = (id: string | null | undefined) => {
    let node = id ? byId.get(id) : undefined;
    if (!node) return { domain: "", group: "" };
    let group: typeof node | undefined;
    for (let hops = 0; node.parent_id && hops < 16; hops++) {
      const parent = byId.get(node.parent_id);
      if (!parent) break;
      group = node;
      node = parent;
    }
    return { domain: node.id, group: group?.id ?? "" };
  };
  return release.systems.map((system) => ({
    id: system.id,
    name: system.name,
    aliases: system.aliases,
    ...place(system.landscape_domain_id),
    owner: system.owner ?? undefined,
    function: system.description ?? "",
    external: system.external,
    roadmap: system.roadmap ?? undefined,
    evidence: evidence(system),
    ...(system.placement_from && system.placement_reason ? { proposedMove: { from: system.placement_from, reason: system.placement_reason } } : {}),
  }));
}

function channelsOf(release: Release): Channel[] {
  return (release.channels ?? []).map((channel) => ({ id: channel.id, name: channel.name, systemId: channel.entry_system_id ?? "", kind: channel.kind ?? "" }));
}

/** One product as an offering: its proposition, plans, rules, parts, order types and tracking. */
function offeringOf(product: NonNullable<Release["products"]>[number], channels: Channel[], evidence: EvidenceOf): Offering {
  // A version saved before offerings carried a purpose says it after the proposition's first paragraph.
  const { summary, purpose } = product.purpose
    ? { summary: product.proposition ?? "", purpose: product.purpose }
    : parseProposition(product.proposition);
  const point = (item: { name: string; description?: string | null; confidence?: string | null; source?: string | null }): Point => ({
    title: item.name,
    detail: item.description ?? "",
    evidence: evidence(item),
  });
  const tracking = product.tracking;
  return {
    id: product.id,
    nodeId: product.portfolio_node_id ?? null,
    name: product.name,
    shortName: product.code ?? undefined,
    primarySource: product.primary_source ?? undefined,
    summary,
    purpose,
    values: product.values.map(point),
    eligibility: product.audiences.map(point),
    // Plans and business rules arrived later than the rest: a release read before them has none.
    plans: (product.plans ?? []).map((plan) => ({ name: plan.name, characteristics: plan.characteristics, evidence: evidence(plan) })),
    rules: (product.business_rules ?? []).map((rule) => ({ id: rule.id, kind: rule.kind ?? undefined, statement: rule.statement, evidence: evidence(rule) })),
    components: product.components.map((part) => ({
      id: part.id,
      name: part.name,
      offerCode: part.code ?? undefined,
      specCode: part.technical_spec ?? undefined,
      mandatory: part.mandatory ?? null,
      ...(part.hub ? { hub: true } : {}),
      description: part.description ?? "",
      systems: part.responsibilities.map((duty) => ({ systemId: duty.system_id, responsibility: duty.description })),
      evidence: evidence(part),
    })),
    orderTypes: product.order_types.map((type) => {
      const { drop, note } = delivery(type);
      return {
        code: type.code,
        name: type.name,
        channels: type.channels,
        priority: drop,
        note: note || undefined,
        stage: type.stage ?? undefined,
        evidence: evidence(type),
      };
    }),
    tracking: tracking
      ? {
          summary: tracking.scope_note ?? "",
          milestones: tracking.milestones.map((item) => ({ name: item.label, producer: item.system_id ?? null, detail: item.detail ?? "", evidence: evidence(item) })),
          correlation: tracking.channels.map((item) => ({
            title: channels.find((channel) => channel.id === item.channel_id)?.name ?? item.channel_id,
            detail: [item.correlation_key, item.read_interface ? `read with ${item.read_interface}` : null].filter(Boolean).join("; "),
            evidence: evidence(item),
          })),
          knownIssues: tracking.fallout.map((item) => ({ title: item.trigger, detail: item.handling ?? "", evidence: evidence(item) })),
        }
      : null,
    evidence: evidence(product),
  };
}

/** Every order type the products name, once each. */
function orderTypesOf(products: NonNullable<Release["products"]>): Catalogue["orderTypes"] {
  return products
    .flatMap((product) => product.order_types)
    .filter((type, index, all) => all.findIndex((other) => other.code === type.code) === index)
    .map((type) => ({ code: type.code, name: type.name, description: delivery(type).note }));
}

/** The journeys, each seen through the channels its order type is sold through. */
function journeysOf(release: Release, offerings: Offering[], evidence: EvidenceOf): Journey[] {
  const roleOf = stepRoleIn(release);
  return (release.journeys ?? []).map((journey) => {
    const offering = offerings.find((item) => item.id === journey.product_id);
    const support = offering?.orderTypes.find((type) => type.code === journey.order_type_code);
    return journeyOf(journey, support?.channels ?? [], evidence, roleOf);
  });
}

/** What to look into: conflicts between sources, and the products' open questions. */
function findingsOf(release: Release, products: NonNullable<Release["products"]>, evidence: EvidenceOf): Finding[] {
  return [
    ...(release.conflicts ?? []).map((conflict) => ({
      id: conflict.id,
      kind: "conflict" as const,
      title: conflict.title,
      detail: conflict.difference ?? conflict.a.statement,
      sources: [conflict.a, conflict.b].map((side) => ({
        status: "confirmed" as const,
        source: side.source_id,
        ...(side.reference ? { where: side.reference } : {}),
      })),
    })),
    ...products.flatMap((product) =>
      product.questions.map((question) => {
        // A version saved before questions carried a title writes it as "title: detail".
        const { title, detail } = question.title ? { title: question.title, detail: question.text } : parseQuestion(question.text);
        return { id: question.id, kind: "gap" as const, title, detail, sources: [evidence(question)] };
      }),
    ),
  ];
}

function portfolioOf(release: Release): Catalogue["portfolio"] {
  return (release.portfolio ?? []).map((node) => ({ id: node.id, level: node.level, name: node.name, parentId: node.parent_id ?? null, description: node.description ?? undefined }));
}

/** A catalogue version as the lab reads it, mapped once from the API's release. */
export function fromRelease(release: Release): Catalogue {
  const sources = sourcesOf(release);
  const lines = new Map((release.source_references ?? []).map((item) => [item.text, item]));
  const evidence: EvidenceOf = (item) => parseEvidence(item.confidence, item.source, lines);
  const channels = channelsOf(release);
  const products = release.products ?? [];
  const offerings = products.map((product) => offeringOf(product, channels, evidence));
  return {
    releaseId: release.id,
    revision: release.revision,
    status: release.status,
    name: release.name ?? release.id,
    sources,
    domains: domainsOf(release.landscape_domains ?? []),
    systems: systemsOf(release, evidence),
    portfolio: portfolioOf(release),
    channels,
    orderTypes: orderTypesOf(products),
    offerings,
    journeys: journeysOf(release, offerings, evidence),
    findings: findingsOf(release, products, evidence),
    roleTerms: roleTerms(release),
    channelKindTerms: channelKindTerms(release),
    roleRank: roleRank(release),
  };
}

/** The edges the chosen channel sees (journey_edges): every step with no channel chosen, that channel's flow when its steps name it, and otherwise the shared flow. */
export function edgesFor(journey: Journey, chosen: string | null): FlowEdge[] {
  return chosen === null ? journey.flow.all : (journey.flow.byChannel[chosen] ?? journey.flow.shared);
}

/** The activities a channel sees: its own and the shared ones (none named means every channel). */
function inView(activity: Activity, channel: string | null): boolean {
  return !channel || activity.channels.length === 0 || activity.channels.includes(channel);
}

/**
 * A journey seen through a channel. A journey offered through channels is always seen through
 * one: the one asked for, or else its first, and then `channelMissing` names the one asked for.
 * A shared journey (no channels of its own) is the same through every channel.
 */
/**
 * A view's BPMN steps from its activities and flow: a task per activity; a joining gateway where
 * several parallel tracks rejoin; a decision gateway where a step branches; a split where tracks
 * start; a start event before the first step nothing leads to, and an end after each that leads
 * nowhere.
 */
function stepsOf(activities: Activity[], edges: FlowEdge[], laneOf: (activity: Activity | undefined) => Lane): Step[] {
  const out = (number: string) => edges.filter((edge) => edge.from === number);
  const into = (number: string) => edges.filter((edge) => edge.to === number);
  const inferred: Evidence = { status: "inferred" };

  const steps: Step[] = [];
  const nodes = new Map<string, ActivityStep>();
  for (const item of activities) {
    const step: ActivityStep = {
      id: item.number,
      kind: "task",
      name: item.name,
      lane: laneOf(item),
      role: item.role,
      etom: item.etom,
      detail: item.detail,
      ponr: item.ponr,
      next: [],
      evidence: item.evidence,
    };
    nodes.set(step.id, step);
    steps.push(step);
  }
  // Joins: a step several parallel tracks rejoin at is reached through one joining gateway.
  const joins = new Map<string, Step>();
  for (const item of activities) {
    const rejoining = into(item.number).filter((edge) => edge.kind === "rejoin");
    if (rejoining.length > 1) {
      const join: Step = { id: `${item.number}~join`, kind: "parallel", gateway: "join", lane: laneOf(item), next: [{ to: item.number }], evidence: inferred };
      joins.set(item.number, join);
      steps.push(join);
    }
  }
  const target = (to: string, kind: string) => (kind === "rejoin" ? (joins.get(to)?.id ?? to) : to);
  for (const item of activities) {
    const step = nodes.get(item.number);
    if (!step) continue;
    const leaving = out(item.number);
    const decisions = leaving.filter((edge) => edge.kind === "decision" && edge.label !== "rejoin");
    const parallels = leaving.filter((edge) => edge.kind === "parallel");
    const rest = leaving.filter((edge) => !decisions.includes(edge) && !parallels.includes(edge));
    if (decisions.length > 1) {
      const gateway: Step = {
        id: `${item.number}~decision`,
        kind: "exclusive",
        ...(item.output !== undefined ? { question: item.output } : {}),
        lane: step.lane,
        next: decisions.map((edge) => ({ to: target(edge.to, edge.kind), label: edge.label })),
        evidence: step.evidence,
      };
      steps.push(gateway);
      step.next.push({ to: gateway.id });
    } else {
      rest.push(...decisions);
    }
    if (parallels.length) {
      const split: Step = { id: `${item.number}~split`, kind: "parallel", gateway: "split", lane: step.lane, next: parallels.map((edge) => ({ to: edge.to })), evidence: inferred };
      steps.push(split);
      step.next.push({ to: split.id });
    }
    for (const edge of rest) step.next.push({ to: target(edge.to, edge.kind), ...(edge.label && edge.label !== "rejoin" && edge.kind !== "rejoin" ? { label: edge.label } : {}), ...(edge.kind === "loop" ? { loop: true } : {}) });
  }
  // Events: the flow starts before the first step nothing leads to, and ends after each step that leads nowhere
  // (a plain end, whatever track it is on: an error end would need a subprocess to catch it).
  const first = activities.filter((item) => into(item.number).length === 0 && item.mainTrack);
  if (first.length) {
    steps.unshift({ id: "start", kind: "start", lane: laneOf(first[0]), next: first.map((item) => ({ to: item.number })), evidence: inferred });
  }
  for (const step of [...nodes.values()]) {
    if (step.kind === "task" && step.next.length === 0) {
      const end: Step = { id: `${step.id}~end`, kind: "end", lane: step.lane, next: [], evidence: inferred };
      steps.push(end);
      step.next.push({ to: end.id });
    }
  }
  return steps;
}

/** The calls the view's steps make, each from and to a lane (or a system the source names). */
function callsInView(calls: Journey["calls"], activities: Activity[], all: Map<string, Activity>, laneOf: (activity: Activity | undefined) => Lane): Integration[] {
  const present = new Set(activities.map((item) => item.number));
  return calls
    .filter((call) => present.has(call.fromActivity))
    .map(({ fromActivity, toActivity, fromSystem, toSystem, ...call }) => ({
      ...call,
      step: fromActivity,
      from: fromSystem !== undefined ? { kind: "system", systemId: fromSystem } : laneOf(all.get(fromActivity)),
      to: toSystem !== undefined ? { kind: "system", systemId: toSystem } : laneOf(all.get(toActivity !== fromActivity ? toActivity : fromActivity)),
    }));
}

export function journeyView(data: Catalogue, journeyId: string, channel: string | null): JourneyView | null {
  const journey = data.journeys.find((item) => item.id === journeyId);
  if (!journey) return null;
  const { id, offeringId, orderType, name, summary, channels, activities: every, calls } = journey;
  const def = { id, offeringId, orderType, name, summary, channels };
  const chosen = channel && def.channels.includes(channel) ? channel : (def.channels[0] ?? null);
  const missing = channel && def.channels.length > 0 && !def.channels.includes(channel) ? channel : undefined;
  const entry = data.channels.find((item) => item.id === chosen)?.systemId || undefined;
  const all = new Map(every.map((item) => [item.number, item]));
  const laneOf = (activity: Activity | undefined): Lane => {
    const who: Performer = activity?.performer ?? { kind: "channel" };
    if (who.kind !== "entry") return who;
    return entry ? { kind: "system", systemId: entry } : { kind: "channel" };
  };
  const activities = every.filter((item) => inView(item, chosen));
  const edges = edgesFor(journey, chosen);
  const steps = stepsOf(activities, edges, laneOf);
  const integrations = callsInView(calls, activities, all, laneOf);

  return {
    ...def,
    channel: chosen,
    ...(missing ? { channelMissing: missing } : {}),
    ...(entry ? { entry } : {}),
    steps,
    integrations,
  };
}

/** The journeys of an offering for an order type and channel: one view per channel it serves. */
export function journeyViews(data: Catalogue, offeringId: string, orderType?: string | null, channel?: string | null): JourneyView[] {
  return data.journeys
    .filter((journey) => journey.offeringId === offeringId && (orderType ? journey.orderType === orderType : true))
    .flatMap((journey) => {
      const channels = channel ? (journey.channels.includes(channel) ? [channel] : journey.channels.length ? [] : [null]) : journey.channels.length ? journey.channels : [null];
      return channels.map((item) => journeyView(data, journey.id, item)).filter((view): view is JourneyView => view !== null);
    });
}
