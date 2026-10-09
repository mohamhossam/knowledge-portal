/**
 * A catalogue version from the API, as the views read it. Journeys are kept as
 * the catalogue holds them (ADR-0096: numbered activities on tracks, flow rules,
 * integrations) and seen one channel at a time: the steps of other channels
 * drop out, the flow is derived again for what remains (as the backend's
 * journey_edges does), and BPMN gateways and events are placed where the rules
 * branch, split and join.
 */
import type { Release } from "../api/client";
import {
  type Catalogue,
  type Evidence,
  type Finding,
  type Integration,
  type JourneyDef,
  type JourneyView,
  type Offering,
  type Point,
  ROLE_WORDS,
  type Source,
  type Step,
  type StepRole,
} from "./model";

type ApiJourney = NonNullable<Release["journeys"]>[number];
type ApiActivity = ApiJourney["activities"][number];
type ApiRule = ApiJourney["flow_rules"][number];
type ApiIntegration = ApiJourney["integrations"][number];

/** A catalogue version and the release it was read from (for journeys and saving). */
export type CatalogueData = Catalogue & { release: Release };

/** TAM draws the enterprise domain and the integration layer as bands under the domain columns. */
const BANDS = new Set(["enterprise", "integration"]);
const MAIN = "main";

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

function splitTitle(text: string): { title: string; detail: string } {
  const at = text.indexOf(": ");
  return at > 0 ? { title: text.slice(0, at), detail: text.slice(at + 2) } : { title: text, detail: "" };
}

function role(code: string | null | undefined): StepRole | undefined {
  const value = code?.toLowerCase().replace(/_/g, "-");
  return value && value in ROLE_WORDS ? (value as StepRole) : undefined;
}

export function fromRelease(release: Release): CatalogueData {
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
  const domains = tops.map((top) => ({
    id: top.id,
    name: top.name,
    scope: top.description ?? "",
    groups: landscape.filter((item) => item.parent_id === top.id).map((item) => ({ id: item.id, name: item.name })),
    band: BANDS.has(top.id),
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
    const [summary = "", ...purpose] = (product.proposition ?? "").split("\n\n");
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
      purpose: purpose.join("\n\n"),
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
        const drop = /Delivered in drop ([^.]+)\./.exec(type.description ?? "");
        return {
          code: type.code,
          name: type.name,
          channels: type.channels,
          priority: drop?.[1],
          note: (type.description ?? "").replace(/\s*Delivered in drop [^.]+\./, "") || undefined,
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
    .map((type) => ({ code: type.code, name: type.name, description: (type.description ?? "").replace(/\s*Delivered in drop [^.]+\./, "") }));

  const journeys: JourneyDef[] = (release.journeys ?? []).map((journey) => {
    const offering = offerings.find((item) => item.id === journey.product_id);
    const support = offering?.orderTypes.find((type) => type.code === journey.order_type_code);
    return {
      id: journey.id,
      offeringId: journey.product_id ?? null,
      orderType: journey.order_type_code ?? null,
      name: journey.name,
      summary: journey.description ?? "",
      channels: support?.channels ?? [],
    };
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
        const { title, detail } = splitTitle(question.text);
        return { id: question.id, kind: "gap" as const, title, detail, sources: [evidence(question)] };
      }),
    ),
  ];

  return {
    release,
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

/** A lane's name: a system, a team or party, the channel's entry system, or the ordering channel. */
export function laneName(data: Catalogue, lane: string): string {
  if (lane === "channel") return "Ordering channel";
  if (lane.startsWith("team:")) return lane.slice(5);
  return data.systems.find((system) => system.id === lane)?.name ?? lane;
}

function order(number: string): [number, number, string] {
  const match = /^\d+(\.\d+)?/.exec(number);
  return match ? [0, Number(match[0]), number] : [1, 0, number];
}

type Edge = { from: string; to: string; kind: string; label?: string };

/** The flow among the activities in view, as the backend's journey_edges derives it. */
function edgesOf(activities: ApiActivity[], rules: ApiRule[]): Edge[] {
  const present = new Set(activities.map((item) => item.number));
  const kept = rules.filter((rule) => present.has(rule.from_activity) && present.has(rule.to_activity));
  const sorted = [...activities].sort((a, b) => {
    const [x, y] = [order(a.number), order(b.number)];
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
  });
  const leaving = new Set(kept.map((rule) => rule.from_activity));
  const tracks = new Map<string, ApiActivity[]>();
  for (const item of sorted) {
    const track = (item.track ?? MAIN).toLowerCase();
    tracks.set(track, [...(tracks.get(track) ?? []), item]);
  }
  const lastOnTrack = new Map<string, string>();
  for (const steps of tracks.values()) for (const item of steps) lastOnTrack.set(item.number, steps[steps.length - 1]!.number);
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const add = (edge: Edge) => {
    const key = `${edge.from}>${edge.to}`;
    if (!seen.has(key)) {
      seen.add(key);
      edges.push(edge);
    }
  };
  for (const steps of tracks.values()) {
    steps.forEach((current, index) => {
      const following = steps[index + 1];
      if (following && !leaving.has(current.number)) add({ from: current.number, to: following.number, kind: "sequence" });
    });
  }
  for (const rule of kept) {
    add({ from: rule.from_activity, to: rule.to_activity, kind: rule.kind, label: rule.condition ?? rule.branch ?? undefined });
    if (rule.kind === "parallel" && rule.rejoin_at && present.has(rule.rejoin_at)) {
      const target = activities.find((item) => item.number === rule.to_activity);
      const main = !target?.track || target.track.toLowerCase() === MAIN;
      add({ from: main ? rule.to_activity : lastOnTrack.get(rule.to_activity) ?? rule.to_activity, to: rule.rejoin_at, kind: "rejoin" });
    }
  }
  return edges;
}

/** The activities a channel sees: its own and the shared ones (none named means every channel). */
function inView(activity: ApiActivity, channel: string | null): boolean {
  return !channel || activity.channels.length === 0 || activity.channels.includes(channel);
}

export function journeyView(data: CatalogueData, journeyId: string, channel: string | null): JourneyView | null {
  const def = data.journeys.find((item) => item.id === journeyId);
  const journey = (data.release.journeys ?? []).find((item) => item.id === journeyId);
  if (!def || !journey) return null;
  const chosen = channel && def.channels.includes(channel) ? channel : def.channels[0] ?? null;
  const entry = data.channels.find((item) => item.id === chosen)?.systemId;
  const sources = data.sources;
  const evidence = (item: { confidence?: string | null; source?: string | null }) => parseEvidence(item.confidence, item.source, sources);
  const all = new Map(journey.activities.map((item) => [item.number, item]));
  const laneOf = (activity: ApiActivity | undefined): string => {
    if (!activity) return "channel";
    if (activity.performing_system_id) return activity.performing_system_id;
    if (activity.channel_entry) return entry ?? "channel";
    if (activity.performer) return `team:${activity.performer}`;
    return "channel";
  };
  const activities = journey.activities.filter((item) => inView(item, chosen));
  const edges = edgesOf(activities, journey.flow_rules);
  const out = (number: string) => edges.filter((edge) => edge.from === number);
  const into = (number: string) => edges.filter((edge) => edge.to === number);

  const steps: Step[] = [];
  const nodes = new Map<string, Step>();
  for (const item of activities) {
    const terminal = out(item.number).length === 0;
    const step: Step = {
      id: item.number,
      kind: terminal && (item.track ?? "").toUpperCase() === "CORRECTION" ? "error-end" : "task",
      name: item.name,
      lane: laneOf(item),
      role: role(item.role),
      etom: item.etom ?? undefined,
      detail: item.description ?? undefined,
      ponr: item.point_of_no_return ?? undefined,
      next: [],
      evidence: evidence(item),
    };
    nodes.set(step.id, step);
    steps.push(step);
  }
  // Joins: a step several parallel tracks rejoin at is reached through one joining gateway.
  const joins = new Map<string, Step>();
  for (const item of activities) {
    const rejoining = into(item.number).filter((edge) => edge.kind === "rejoin");
    if (rejoining.length > 1) {
      const join: Step = { id: `${item.number}~join`, kind: "parallel", name: "All tracks done", lane: laneOf(item), next: [{ to: item.number }], evidence: { status: "inferred" } };
      joins.set(item.number, join);
      steps.push(join);
    }
  }
  const target = (to: string, kind: string) => (kind === "rejoin" && joins.has(to) ? joins.get(to)!.id : to);
  for (const item of activities) {
    const step = nodes.get(item.number)!;
    const leaving = out(item.number);
    const decisions = leaving.filter((edge) => edge.kind === "decision" && edge.label !== "rejoin");
    const parallels = leaving.filter((edge) => edge.kind === "parallel");
    const rest = leaving.filter((edge) => !decisions.includes(edge) && !parallels.includes(edge));
    if (decisions.length > 1) {
      const gateway: Step = {
        id: `${item.number}~decision`,
        kind: "exclusive",
        name: item.output ?? "Decision",
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
      const split: Step = { id: `${item.number}~split`, kind: "parallel", name: "In parallel", lane: step.lane, next: parallels.map((edge) => ({ to: edge.to })), evidence: { status: "inferred" } };
      steps.push(split);
      step.next.push({ to: split.id });
    }
    for (const edge of rest) step.next.push({ to: target(edge.to, edge.kind), ...(edge.label && edge.label !== "rejoin" && edge.kind !== "rejoin" ? { label: edge.label } : {}) });
  }
  // Events: the flow starts before the first step nothing leads to, and ends after each step that leads nowhere.
  const first = activities.filter((item) => into(item.number).length === 0 && (!item.track || item.track.toLowerCase() === MAIN));
  if (first.length) {
    steps.unshift({ id: "start", kind: "start", name: "Start", lane: laneOf(first[0]), next: first.map((item) => ({ to: item.number })), evidence: { status: "inferred" } });
  }
  for (const step of [...nodes.values()]) {
    if (step.kind === "task" && step.next.length === 0) {
      const end: Step = { id: `${step.id}~end`, kind: "end", name: "End", lane: step.lane, next: [], evidence: { status: "inferred" } };
      steps.push(end);
      step.next.push({ to: end.id });
    }
  }

  const present = new Set(activities.map((item) => item.number));
  const integrations: Integration[] = journey.integrations
    .filter((call) => present.has(call.from_activity))
    .map((call: ApiIntegration, index) => {
      const fromActivity = all.get(call.from_activity);
      const toActivity = all.get(call.to_activity);
      const from = call.from_system_id ?? laneOf(fromActivity);
      const to = call.to_system_id ?? laneOf(call.to_activity !== call.from_activity ? toActivity : fromActivity);
      return {
        id: `${call.from_activity}-${index}`,
        step: call.from_activity,
        from,
        to,
        ...(call.via_system_id ? { via: call.via_system_id } : {}),
        operation: call.interface ?? call.interaction ?? "Hand-over",
        purpose: call.purpose ?? "",
        style: call.style ?? "Not stated",
        mode: call.timing === "Sync" ? "sync" : call.timing === "Async" ? "async" : "not stated",
        ...(call.payload ? { payload: call.payload } : {}),
        ...(call.tmf_equivalent ? { tmf: call.tmf_equivalent } : {}),
        evidence: evidence(call),
      };
    });

  const channelName = data.channels.find((item) => item.id === chosen)?.name;
  return {
    ...def,
    name: channelName ? `${def.name} · ${channelName}` : def.name,
    channel: chosen,
    steps,
    integrations,
    laneLabels: entry && channelName ? { [entry]: laneName(data, entry) } : {},
  };
}

/** The journeys of an offering for an order type and channel: one view per channel it serves. */
export function journeyViews(data: CatalogueData, offeringId: string, orderType?: string | null, channel?: string | null): JourneyView[] {
  return data.journeys
    .filter((journey) => journey.offeringId === offeringId && (orderType ? journey.orderType === orderType : true))
    .flatMap((journey) => {
      const channels = channel ? (journey.channels.includes(channel) ? [channel] : journey.channels.length ? [] : [null]) : journey.channels.length ? journey.channels : [null];
      return channels.map((item) => journeyView(data, journey.id, item)).filter((view): view is JourneyView => view !== null);
    });
}
