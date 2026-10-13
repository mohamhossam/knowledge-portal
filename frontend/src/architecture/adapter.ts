/**
 * A catalogue version from the API, mapped once into the view model. Journeys are
 * kept as the catalogue holds them (ADR-0096: numbered activities on tracks, the
 * flow the service derives, integrations) and seen one channel at a time: the
 * steps of other channels drop out, the flow is the one the service derived for
 * that view (`channel_edges`, `shared_edges`, `edges`), and BPMN gateways and
 * events are placed where the flow branches, splits and joins. The model carries
 * kinds, never English: the lab's words.ts names them.
 */
import type { Release } from "../api/client";
import { BAND_DOMAINS, parseDrop, parseProposition, parseQuestion } from "./conventions";
import {
  type Activity,
  type ActivityStep,
  type ActivityCall,
  type Catalogue,
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
  ROLE_WORDS,
  type Source,
  type Step,
  type StepRole,
} from "./model";

type ApiJourney = NonNullable<Release["journeys"]>[number];
type ApiOrderType = NonNullable<Release["products"]>[number]["order_types"][number];
type ApiEdge = ApiJourney["edges"][number];

/** Evidence from a fact's confidence and its source line ("SDD v2.3 · §P1 · a note"). */
export function parseEvidence(confidence: string | null | undefined, source: string | null | undefined, sources: Source[]): Evidence {
  const status = confidence === "confirmed" || confidence === "inferred" || confidence === "gap" ? confidence : "inferred";
  if (!source) return { status };
  const parts = source.split(" · ");
  const named = sources.find((item) => item.short === parts[0] || item.id === parts[0]);
  if (!named) return { status, where: source };
  const [, where, ...rest] = parts;
  return { status, source: named.id, ...(where ? { where } : {}), ...(rest.length ? { note: rest.join(" · ") } : {}) };
}

/** An order type's delivery drop and the rest of its description; read from the prose for a version saved before the service sent the drop. */
function delivery(type: ApiOrderType): { drop?: string; note: string } {
  return type.delivery_drop ? { drop: type.delivery_drop, note: type.description ?? "" } : parseDrop(type.description);
}

function role(code: string | null | undefined): StepRole | undefined {
  const value = code?.toLowerCase().replace(/_/g, "-");
  return value && value in ROLE_WORDS ? (value as StepRole) : undefined;
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
function journeyOf(journey: ApiJourney, channels: string[], evidence: (item: { confidence?: string | null; source?: string | null }) => Evidence): Journey {
  const activities: Activity[] = journey.activities.map((item) => ({
    number: item.number,
    name: item.name,
    performer: performer(item),
    channels: item.channels,
    mainTrack: item.main_track,
    role: role(item.role),
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
      byChannel: Object.fromEntries(journey.channel_edges.map((item) => [item.channel_id, flowEdges(item.edges)])),
      shared: flowEdges(journey.shared_edges),
    },
    calls,
  };
}

export function fromRelease(release: Release): Catalogue {
  const sources: Source[] = (release.sources ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    short: item.short ?? item.id,
    version: item.version ?? undefined,
    level: item.level,
    owner: item.authority ?? undefined,
    file: item.file ?? undefined,
    scope: item.scope ?? undefined,
  }));
  const evidence = (item: { confidence?: string | null; source?: string | null }) => parseEvidence(item.confidence, item.source, sources);

  const landscape = release.landscape_domains ?? [];
  const tops = landscape.filter((item) => !item.parent_id);
  // A version saved before the service marked cross-cutting domains marks none: then they are known by id.
  const marked = landscape.some((item) => item.cross_cutting);
  const domains = tops.map((top) => ({
    id: top.id,
    name: top.name,
    scope: top.description ?? "",
    groups: landscape.filter((item) => item.parent_id === top.id).map((item) => ({ id: item.id, name: item.name })),
    band: marked ? top.cross_cutting : BAND_DOMAINS.includes(top.id),
  }));
  const place = (id: string | null | undefined) => {
    const node = landscape.find((item) => item.id === id);
    if (!node) return { domain: "", group: "" };
    return node.parent_id ? { domain: node.parent_id, group: node.id } : { domain: node.id, group: "" };
  };

  const systems = release.systems.map((system) => ({
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

  const channels = (release.channels ?? []).map((channel) => ({ id: channel.id, name: channel.name, systemId: channel.entry_system_id ?? "", kind: channel.kind ?? "" }));

  const products = release.products ?? [];
  const offerings: Offering[] = products.map((product) => {
    const { summary, purpose } = parseProposition(product.proposition);
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
      summary,
      purpose,
      values: product.values.map(point),
      eligibility: product.audiences.map(point),
      plans: product.plans.map((plan) => ({ name: plan.name, characteristics: plan.characteristics, evidence: evidence(plan) })),
      rules: product.business_rules.map((rule) => ({ id: rule.id, kind: rule.kind ?? undefined, statement: rule.statement, evidence: evidence(rule) })),
      components: product.components.map((part) => ({
        id: part.id,
        name: part.name,
        offerCode: part.code ?? undefined,
        specCode: part.technical_spec ?? undefined,
        mandatory: part.mandatory ?? null,
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
  });

  const orderTypes = products
    .flatMap((product) => product.order_types)
    .filter((type, index, all) => all.findIndex((other) => other.code === type.code) === index)
    .map((type) => ({ code: type.code, name: type.name, description: delivery(type).note }));

  const journeys: Journey[] = (release.journeys ?? []).map((journey) => {
    const offering = offerings.find((item) => item.id === journey.product_id);
    const support = offering?.orderTypes.find((type) => type.code === journey.order_type_code);
    return journeyOf(journey, support?.channels ?? [], evidence);
  });

  const findings: Finding[] = [
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
        const { title, detail } = parseQuestion(question.text);
        return { id: question.id, kind: "gap" as const, title, detail, sources: [evidence(question)] };
      }),
    ),
  ];

  return {
    releaseId: release.id,
    revision: release.revision,
    status: release.status,
    name: release.name ?? release.id,
    sources,
    domains,
    systems,
    portfolio: (release.portfolio ?? []).map((node) => ({ id: node.id, level: node.level, name: node.name, parentId: node.parent_id ?? null, description: node.description ?? undefined })),
    channels,
    orderTypes,
    offerings,
    journeys,
    findings,
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

  const present = new Set(activities.map((item) => item.number));
  const integrations: Integration[] = calls
    .filter((call) => present.has(call.fromActivity))
    .map(({ fromActivity, toActivity, fromSystem, toSystem, ...call }) => ({
      ...call,
      step: fromActivity,
      from: fromSystem !== undefined ? { kind: "system", systemId: fromSystem } : laneOf(all.get(fromActivity)),
      to: toSystem !== undefined ? { kind: "system", systemId: toSystem } : laneOf(all.get(toActivity !== fromActivity ? toActivity : fromActivity)),
    }));

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
