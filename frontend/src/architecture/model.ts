/**
 * The architecture catalogue's view model, generic for any telecom product
 * (docs/redesign/plans/03-architecture-catalogue.md). The adapter builds it
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
  evidence: Evidence;
};

export type Offering = {
  id: string;
  nodeId: string | null;
  name: string;
  shortName?: string;
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

/** What a step does for the order: it decides the system's role in the impact lens. */
export type StepRole =
  | "capture"
  | "catalog"
  | "customer-data"
  | "orchestrate"
  | "validate"
  | "activate"
  | "field"
  | "logistics"
  | "track"
  | "notify"
  | "bill"
  | "record";

export type StepKind = "start" | "end" | "task" | "exclusive" | "parallel" | "error-end";

/** A node of a journey's BPMN view, derived from its activities and flow rules. */
export type Step = {
  id: string;
  kind: StepKind;
  name: string;
  /** The lane: a system id, "team:<name>" for a team or party, or "channel" for the ordering channel. */
  lane: string;
  role?: StepRole;
  /** eTOM process this step belongs to (process area · process). */
  etom?: string;
  detail?: string;
  /** Point of no return: once passed, the order can no longer be cancelled. */
  ponr?: string;
  next: { to: string; label?: string }[];
  evidence: Evidence;
};

export type IntegrationMode = "sync" | "async" | "not stated";

export type Integration = {
  id: string;
  /** The step that makes the call. */
  step: string;
  /** Lanes: a system id, "team:<name>" or "channel". */
  from: string;
  to: string;
  /** Through the integration layer, when the call goes via it (e.g. TIBCO). */
  via?: string;
  operation: string;
  purpose: string;
  /** How it is made, as the source says; "Not stated" when it doesn't. */
  style: string;
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

/** One journey seen through one channel: its BPMN steps and its calls, in order. */
export type JourneyView = JourneyDef & {
  channel: string | null;
  steps: Step[];
  integrations: Integration[];
  /** Lane labels where a lane stands for the channel's entry system. */
  laneLabels: Record<string, string>;
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
  journeys: JourneyDef[];
  findings: Finding[];
};

export const EVIDENCE_WORDS: Record<Evidence["status"], string> = {
  confirmed: "Confirmed",
  inferred: "Inferred",
  gap: "Gap",
};

export const ROLE_WORDS: Record<StepRole, string> = {
  capture: "Captures the order",
  catalog: "Catalogue",
  "customer-data": "Customer data",
  orchestrate: "Orchestrates",
  validate: "Validates",
  activate: "Activates",
  field: "Field work",
  logistics: "Logistics",
  track: "Tracks",
  notify: "Notifies",
  bill: "Bills",
  record: "Records",
};

/** When a system plays several roles, the impact lens names the strongest. */
export const ROLE_RANK: StepRole[] = [
  "orchestrate",
  "capture",
  "activate",
  "field",
  "validate",
  "customer-data",
  "catalog",
  "logistics",
  "bill",
  "track",
  "notify",
  "record",
];
