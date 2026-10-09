/**
 * The architecture catalogue's model, generic for any telecom product
 * (docs/redesign/plans/03-architecture-catalogue.md). Every view is a lens on
 * this one model: the TAM landscape, the portfolio, each offering, its
 * journeys, their integrations and the order-tracking flow. Impact is computed
 * from journeys, never drawn by hand.
 *
 * Every fact carries its evidence: confirmed by a named source and section,
 * inferred from one, or a gap. A gap is shown as a gap, never filled in.
 */

/** The two sources this catalogue is built from (the user's brief, 2026-10-09). */
export type SourceId = "sdd" | "ref";

export type Evidence = {
  status: "confirmed" | "inferred" | "gap";
  source?: SourceId;
  /** Section or table in the source, e.g. "§3.1 step 4". */
  where?: string;
  note?: string;
};

export type Source = {
  id: SourceId;
  title: string;
  version: string;
  date?: string;
  owner?: string;
  kind: string;
  file: string;
};

/** TM Forum TAM domains, in the order the TAM poster lays them out. */
export type TamDomainId =
  | "market-sales"
  | "product"
  | "customer"
  | "service"
  | "resource"
  | "engaged-party"
  | "enterprise"
  | "integration";

export type TamDomain = {
  id: TamDomainId;
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
  domain: TamDomainId;
  group: string;
  owner?: string;
  function: string;
  /** Outside the operator: a government body, a vendor platform, a clearing house. */
  external?: boolean;
  /** A planned change, e.g. "Replaces BCRM over time". */
  roadmap?: string;
  evidence: Evidence;
  /** Where the SMB reference placed it, when this catalogue proposes another domain. */
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

export type ChannelKind = "self-service" | "assisted" | "system";

export type Channel = {
  id: string;
  name: string;
  systemId: string;
  kind: ChannelKind;
};

export type OrderTypeFamily = "acquire" | "change" | "move" | "cease" | "care" | "billing";

export type OrderType = {
  code: string;
  name: string;
  family: OrderTypeFamily;
  description: string;
};

export type Point = { title: string; detail: string; evidence: Evidence };

export type Plan = {
  name: string;
  download: string;
  upload: string;
  cpe: string;
  accessPoint: string;
  backupOffer: string;
  price?: string;
  evidence: Evidence;
};

export type Rule = {
  id: string;
  kind: "composition" | "eligibility" | "dependency" | "lifecycle" | "fulfilment" | "billing";
  statement: string;
  evidence: Evidence;
};

export type Component = {
  id: string;
  name: string;
  /** Commercial offer code (PO / RP), as the SDD names it. */
  offerCode?: string;
  /** Customer-facing service specification (CFSS / PRS). */
  specCode?: string;
  mandatory: boolean;
  description: string;
  systems: { systemId: string; responsibility: string }[];
  evidence: Evidence;
};

/** One order type an offering supports, through which channels, in which delivery drop. */
export type OfferingOrderType = {
  code: string;
  channels: string[];
  priority?: string;
  note?: string;
  evidence: Evidence;
};

export type Offering = {
  id: string;
  nodeId: string;
  name: string;
  shortName: string;
  summary: string;
  purpose: string;
  values: Point[];
  eligibility: Point[];
  plans: Plan[];
  rules: Rule[];
  components: Component[];
  orderTypes: OfferingOrderType[];
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

export type Step = {
  id: string;
  kind: StepKind;
  name: string;
  /** The lane: the system (or team) that performs the step. */
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

export type IntegrationStyle = "API" | "XML request" | "Event / message" | "Callback" | "SAML 2.0 SSO" | "Database" | "Ticket" | "Not stated";
export type IntegrationMode = "sync" | "async" | "not stated";

export type Integration = {
  id: string;
  /** The step that makes the call. */
  step: string;
  from: string;
  to: string;
  /** Through the integration layer, when the call goes via it (e.g. TIBCO). */
  via?: string;
  operation: string;
  purpose: string;
  style: IntegrationStyle;
  mode: IntegrationMode;
  payload?: string;
  /** TM Forum Open API that does the same job. A hypothesis until the integration team confirms. */
  tmf?: string;
  evidence: Evidence;
};

/** A lane that is a team, not a system (e.g. MSS). Teams appear in flows, never on the landscape. */
export type Team = { id: string; name: string; detail: string; evidence: Evidence };

export type Journey = {
  id: string;
  offeringId: string;
  orderType: string;
  channels: string[];
  name: string;
  summary: string;
  steps: Step[];
  integrations: Integration[];
  /** Notes that hold for the whole journey (amendment, cancellation, known gaps). */
  notes: Point[];
  trackingId?: string;
  /** A lane's label when one lane stands for several channels (e.g. "B2B Web / SMB App"). */
  laneLabels?: Record<string, string>;
};

export type Milestone = { name: string; producer: string; detail: string; evidence: Evidence };

export type TrackingFlow = {
  id: string;
  name: string;
  summary: string;
  participants: string[];
  messages: Integration[];
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
