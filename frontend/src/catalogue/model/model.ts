/**
 * The architecture catalogue's view model, generic for any telecom product,
 * drawn by the catalogue's landscape, offering and journey views. The adapter builds it
 * from a catalogue version read from the API; every view is a lens on it: the
 * TAM landscape, the portfolio, each offering, its journeys per channel, their
 * integrations and the order-tracking flow. Impact is computed from journeys,
 * never drawn by hand.
 *
 * Every fact carries its evidence: confirmed by a named source and section,
 * inferred from one, or a gap. A gap is shown as a gap, never filled in.
 */

export type Evidence = {
  status: "confirmed" | "inferred" | "gap";
  /** A registered source's id, when the evidence names one. */
  source?: string;
  /** Section or table in the source, e.g. "§3.1 step 4". */
  where?: string;
  note?: string;
};

export type Source = {
  id: string;
  title: string;
  short: string;
  version?: string;
  level: string;
  owner?: string;
  file?: string;
  scope?: string;
};

export type TamDomain = {
  id: string;
  name: string;
  /** What belongs here, in TAM's terms. */
  scope: string;
  /** Functional groups inside the domain, in reading order. */
  groups: { id: string; name: string }[];
  /** Drawn as a band beneath the domain columns (cross-cutting). */
  band?: boolean;
  /**
   * Where the map draws it apart from the order of layers: the bus, the layer the bus runs
   * under, or a side layer drawn last (review recommendation 10).
   */
  layout?: "bus" | "above_bus" | "side";
};

export type System = {
  id: string;
  name: string;
  aliases: string[];
  domain: string;
  group: string;
  owner?: string;
  function: string;
  external?: boolean;
  roadmap?: string;
  evidence: Evidence;
  /** Where a source placed it, when this catalogue proposes another domain. */
  proposedMove?: { from: string; reason: string };
};

/** A level of the portfolio is data, so any depth and any names fit. */
export type PortfolioNode = {
  id: string;
  level: string;
  name: string;
  parentId: string | null;
  description?: string;
};

export type Channel = {
  id: string;
  name: string;
  systemId: string;
  kind: string;
};

export type OrderType = { code: string; name: string; description: string };

export type Point = { title: string; detail: string; evidence: Evidence };

/** A plan as its sources describe it: named characteristics, so any product's plans fit. */
export type Plan = {
  name: string;
  characteristics: { name: string; value: string }[];
  evidence: Evidence;
};

export type Rule = { id: string; kind?: string; statement: string; evidence: Evidence };

export type Component = {
  id: string;
  name: string;
  /** Commercial offer code (PO / RP), as the source names it. */
  offerCode?: string;
  /** Customer-facing service specification (CFSS / PRS). */
  specCode?: string;
  mandatory: boolean | null;
  /** The device the bundle is built on, when the version says so. */
  hub?: boolean;
  description: string;
  systems: { systemId: string; responsibility: string }[];
  evidence: Evidence;
};

/** One order type an offering supports, and through which channels. */
export type OfferingOrderType = {
  code: string;
  name: string;
  channels: string[];
  /** The delivery drop it comes in, when its source says (e.g. "P2 / P3"). */
  priority?: string;
  note?: string;
  /** Where it sits in the customer's life (join, change, support, leave), when the version says so. */
  stage?: string;
  evidence: Evidence;
};

export type Offering = {
  id: string;
  nodeId: string | null;
  name: string;
  shortName?: string;
  /** The id of the source its facts come from first (a `Source` of the version). */
  primarySource?: string;
  summary: string;
  purpose: string;
  values: Point[];
  eligibility: Point[];
  plans: Plan[];
  rules: Rule[];
  components: Component[];
  orderTypes: OfferingOrderType[];
  tracking: TrackingFacts | null;
  evidence: Evidence;
};

/**
 * What a step does for the order, as a role code ("orchestrate", "customer-data"): it
 * decides the system's role in the impact lens. Any code the source writes is kept; the
 * catalogue's vocabulary (roleTerms) and the lab's words name it.
 */
export type StepRole = string;

/**
 * A lane of a journey's flow: a catalogued system, a team or party that performs a step
 * (the customer, the MSS team), or the ordering channel when the source names no performer.
 */
export type Lane = { kind: "system"; systemId: string } | { kind: "team"; name: string } | { kind: "channel" };

/** A lane's key, one per lane of a journey: the system's id, "team:<name>", or "channel". */
export function laneKey(lane: Lane): string {
  switch (lane.kind) {
    case "system":
      return lane.systemId;
    case "team":
      return `team:${lane.name}`;
    case "channel":
      return "channel";
  }
}

/** The system a lane stands for, when it is one. */
export function systemOf(lane: Lane): string | undefined {
  return lane.kind === "system" ? lane.systemId : undefined;
}

type StepBase = {
  id: string;
  lane: Lane;
  /** Where the flow goes on; `loop` marks a way back to an earlier step. */
  next: { to: string; label?: string; loop?: boolean }[];
  evidence: Evidence;
};

/** An activity, as its source names it. */
export type ActivityStep = StepBase & {
  kind: "task";
  name: string;
  role?: StepRole;
  /** eTOM process this step belongs to (process area · process). */
  etom?: string;
  detail?: string;
  /** Point of no return: once passed, the order can no longer be cancelled. */
  ponr?: string;
};

/** A decision between the ways on; `question` is what is decided, when the source states it. */
export type DecisionStep = StepBase & { kind: "exclusive"; question?: string };

/** Where the flow splits into parallel tracks, or where the tracks join again. */
export type ParallelStep = StepBase & { kind: "parallel"; gateway: "split" | "join" };

/** Where the flow starts, or one of the places it ends. */
export type EventStep = StepBase & { kind: "start" | "end" };

/** A node of a journey's BPMN view, derived from its activities and flow rules. */
export type Step = ActivityStep | DecisionStep | ParallelStep | EventStep;

export type StepKind = Step["kind"];

/** Whether a call waits for its answer; "not-stated" when the source doesn't say. */
export type IntegrationMode = "sync" | "async" | "not-stated";

export type Integration = {
  /** Stable across the channels' views of a journey. */
  id: string;
  /** The step that makes the call. */
  step: string;
  from: Lane;
  to: Lane;
  /** Through the integration layer, when the call goes via it (e.g. TIBCO): a system id. */
  via?: string;
  /** The interface or interaction the source names; none means a hand-over. */
  operation?: string;
  purpose: string;
  /** How it is made, as the source says, when it does. */
  style?: string;
  mode: IntegrationMode;
  payload?: string;
  /** TM Forum Open API that does the same job. A hypothesis until the integration team confirms. */
  tmf?: string;
  evidence: Evidence;
};

/** A journey as the catalogue holds it: one per offering and order type, for all its channels. */
export type JourneyDef = {
  id: string;
  offeringId: string | null;
  orderType: string | null;
  name: string;
  summary: string;
  /** The channels it can be viewed for: its order type's channels, or none for a shared flow. */
  channels: string[];
};

/** Who performs an activity: a lane, or the entry system of whichever channel the order came through. */
export type Performer = Lane | { kind: "entry" };

/** A numbered activity of a journey (ADR-0096), for the channels it names (none means every channel). */
export type Activity = {
  number: string;
  name: string;
  performer: Performer;
  channels: string[];
  /** On the main track (where the flow starts), not a side track such as a correction or a rejection. */
  mainTrack: boolean;
  role?: StepRole;
  etom?: string;
  detail?: string;
  ponr?: string;
  /** What it yields, when the source says; it names the decision that follows it. */
  output?: string;
  evidence: Evidence;
};

/** One arrow of a journey's flow, as the service derives it from the order and the flow rules. */
export type FlowEdge = { from: string; to: string; kind: string; label?: string };

/**
 * A journey's flow as the service derives it: with every step (no channel chosen), for each
 * channel its steps name, and for the steps no channel is named for.
 */
export type Flow = { all: FlowEdge[]; byChannel: Record<string, FlowEdge[]>; shared: FlowEdge[] };

/** A call an activity makes; an end the source leaves open is its activity's performer. */
export type ActivityCall = Omit<Integration, "step" | "from" | "to"> & {
  fromActivity: string;
  toActivity: string;
  fromSystem?: string;
  toSystem?: string;
};

/** A journey with its activities, its flow and its calls, as the views derive each channel's view from. */
export type Journey = JourneyDef & { activities: Activity[]; flow: Flow; calls: ActivityCall[] };

/** One journey seen through one channel: its BPMN steps and its calls, in order. */
export type JourneyView = JourneyDef & {
  channel: string | null;
  /** The channel asked for, when the journey isn't offered through it; the view is then its first channel's. */
  channelMissing?: string;
  /** The channel's entry system, when a lane stands for it. */
  entry?: string;
  steps: Step[];
  integrations: Integration[];
};

export type Milestone = { name: string; producer: string | null; detail: string; evidence: Evidence };

/** An offering's order tracking: milestones, how each channel's order is matched and read, known failures. */
export type TrackingFacts = {
  summary: string;
  milestones: Milestone[];
  correlation: Point[];
  knownIssues: Point[];
};

export type Finding = {
  id: string;
  kind: "conflict" | "gap" | "placement" | "undefined";
  title: string;
  detail: string;
  sources: Evidence[];
};

/** A catalogue version as the views read it. */
export type Catalogue = {
  releaseId: string;
  revision: number;
  status: "draft" | "published";
  name: string;
  sources: Source[];
  domains: TamDomain[];
  systems: System[];
  portfolio: PortfolioNode[];
  channels: Channel[];
  orderTypes: OrderType[];
  offerings: Offering[];
  journeys: Journey[];
  findings: Finding[];
  /** The role terms of the version's vocabulary: each role's preferred label, by code. */
  roleTerms: Record<string, string>;
  /** The channel kind terms of the version's vocabulary: each kind's preferred label. */
  channelKindTerms: Record<string, string>;
  /** Roles from strongest to weakest, as the version's vocabulary ranks them. */
  roleRank: StepRole[];
};

export const EVIDENCE_WORDS: Record<Evidence["status"], string> = {
  confirmed: "Confirmed",
  inferred: "Inferred",
  gap: "Gap",
};

/**
 * Roles from strongest to weakest, as `order` ranks them (the version's own, `roleRank`):
 * when a system plays several roles, the impact lens names the strongest. A role the order
 * leaves out (one the source adds) ranks after the rest, by code.
 */
export function byRank(order: readonly StepRole[]): (a: StepRole, b: StepRole) => number {
  const rank = (role: StepRole) => (order.includes(role) ? order.indexOf(role) : order.length);
  return (a, b) => rank(a) - rank(b) || a.localeCompare(b);
}
