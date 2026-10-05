import type { CatalogPlans, ExplorerRelease } from "../api/client";

const system = (id: string, name: string) => ({ id, name, aliases: [], capabilities: [], components: [], constraints: [] });
const step = (number: string, name: string, extra: object = {}) => ({
  number, name, supporting_system_ids: [], component_ids: [], channels: [], channel_entry: false, ...extra,
});

/** A version in service with one offering, two order types and one journey. */
export const EXPLORED = {
  id: "live",
  name: "October",
  published_at: "2026-10-05T00:00:00Z",
  systems: [system("web", "B2B Web"), system("rtf", "RTF"), system("cwom", "CWOM"), system("wfm", "WFM"), system("bscs", "BSCS")],
  relationships: [],
  landscape_domains: [],
  channels: [
    { id: "online", name: "Online", kind: "Digital", entry_system_id: "web" },
    { id: "shop", name: "Shop", kind: "Assisted" },
  ],
  sources: [
    { id: "CANON", title: "SMB Value Stream — Architecture Reference", level: "L1", short: "SMB Ref", supplied: true, authority: "The canonical landscape." },
    { id: "SDD", title: "Business Pro Plus Solution Design", level: "L2", short: "BPP SDD", version: "2.3", supplied: true, authority: "Primary source for Business Pro Plus." },
    {
      id: "V82", title: "Explorer v8.2", level: "L3", short: "v8.2", supplied: false,
      authority: "Functional baseline.", boundary: "Workflow images are not machine-readable.",
    },
  ],
  conflicts: [
    {
      id: "CF-01",
      title: "Up / Downgrade channel scope",
      a: { source_id: "SDD", reference: "§11.1.3", statement: "Applicable channels are BCRM and the SMB App." },
      b: { source_id: "V82", reference: "OrderEvaluate", statement: "The request allows the B2B channel." },
      scope: [{ product_id: "bpp", order_types: ["NEW"], question_id: "OQ-01" }],
      difference: "Whether B2B Digital is an entry channel.",
      impact: "B2B Digital is disabled until resolved.",
      decision: "Product owner to confirm the B2B scope.",
      confidence: "confirmed",
    },
    {
      id: "CF-02",
      title: "Commitment model",
      a: { source_id: "SDD", statement: "24-month commitment." },
      b: { source_id: "CANON", statement: "12-month commitment." },
      scope: [{ product_id: "bpp", order_types: [] }],
      decision: "Commercial owner to choose one.",
    },
  ],
  products: [
    {
      id: "bpp",
      name: "Business Pro Plus",
      proposition: "Premium internet for small businesses.",
      rules: [],
      values: [],
      audiences: [],
      lifecycle_notes: [
        {
          id: "LC-UD",
          title: "Up / Downgrade matrix",
          kind: "Change",
          order_types: ["NEW"],
          channels: [],
          blocks: [
            { kind: "table", columns: ["From", "To"], rows: [["200Mbps", "300Mbps"]], items: [], caption: "Workflows are in the annexure." },
          ],
          confidence: "confirmed",
          source: "SDD §10",
        },
        {
          id: "LC-REN",
          title: "Renewal",
          kind: "Commercial",
          order_types: [],
          channels: ["shop"],
          summary: "What a renewal carries over.",
          blocks: [{ kind: "list", title: "v8.2 carry-over (re-verify)", items: ["Inherit tenure"], columns: [], rows: [], confidence: "inferred", to_verify: true }],
        },
        {
          id: "LC-CEASE",
          title: "Cessation",
          order_types: ["CEASE"],
          channels: [],
          blocks: [{ kind: "text", text: "Blocked while activating.", items: [], columns: [], rows: [] }],
        },
      ],
      tracking: {
        order_types: ["NEW"],
        not_applicable_note: "Tracking is not specified for a cease.",
        flows: [
          { from_system_id: "cwom", to_system_id: "rtf", label: "Sub-order milestones", interface: "notifyMilestone" },
          { from_system_id: "rtf", to_system_id: "rtf", label: "Timestamps" },
        ],
        channels: [
          {
            channel_id: "online",
            correlation_key: "Digital Order ID ↔ CWOM Order ID",
            ui_system_id: "web",
            story: "US#44387: track installation by customer",
            read_system_id: "rtf",
            read_interface: "getRealTimeOrderDetails",
          },
          { channel_id: "shop", ui_note: "The shop's tracking screen is not named.", confidence: "gap" },
        ],
        milestones: [
          { label: "Request received", system_id: "rtf", detail: "Email to the customer" },
          { label: "Installation done", confidence: "gap" },
        ],
        statuses: [{ label: "VALIDATED" }],
        fallout: [{ trigger: "Rejected by business rules", handling: "Back to the channel" }],
      },
      sources: ["SDD", "CANON"],
      primary_source: "SDD",
      questions: [
        { id: "OQ-01", text: "Is B2B Digital in scope for a new activation?", impact: "B2B shown as unsupported.", confidence: "confirmed", source: "BPP SDD §11.1.3" },
        { id: "OQ-02", text: "Which FPC_SITE value does the SSO pass?", order_types: ["NEW"] },
      ],
      decisions: [{ id: "AD-01", title: "Reuse Order to Delivery", text: "No new order flow.", confidence: "confirmed", source: "BPP SDD §11.2" }],
      boundaries: ["Runtime comes from the SDD."],
      not_used: ["Siebel CRM"],
      nfrs: [
        { quality: "Availability", coverage: "missing", confidence: "gap" },
        { quality: "Security", coverage: "partial", statement: "SAML SSO for the portal.", source: "SDD §11" },
      ],
      order_types: [
        { code: "NEW", name: "New Activation", enabled: true, channels: ["online", "shop"] },
        { code: "CEASE", name: "Cease", enabled: true, channels: [] },
      ],
      components: [
        {
          id: "bb",
          name: "Broadband",
          kind: "CONNECTIVITY",
          mandatory: true,
          responsibilities: [
            { system_id: "cwom", role: "FULFILMENT", description: "Orchestrates the sub-order", order_types: [] },
            { system_id: "wfm", role: "FULFILMENT", description: "Installs the line", order_types: ["NEW"] },
            { system_id: "bscs", role: "FULFILMENT", description: "Stops billing", order_types: ["CEASE"], confidence: "gap" },
          ],
          realisation: [
            { layer: "resource", name: "GPON line" },
            { layer: "cfs", name: "GPON internet CFS", confidence: "inferred" },
          ],
        },
        { id: "fw", name: "Firewall", mandatory: false, responsibilities: [], realisation: [] },
      ],
    },
  ],
  change_history: [
    {
      id: "CR-20261003-Business_Pro_Plus",
      title: "Microsoft 365 for Business Pro Plus",
      origin: "requirement-ai",
      product_id: "bpp",
      requester: "Layla Haddad",
      applied_at: "2026-10-04T10:00:00Z",
      trace: {
        requirement_id: "REQ-2026-0412",
        breakdown_revision: 3,
        approval_id: "APR-77",
        epic_id: "EP-1",
        epic_name: "Microsoft 365 for Business Pro Plus",
        approved_by: "Layla Haddad",
        approved_at: "2026-10-03T08:05:00Z",
        features: [{ id: "FT-1", name: "Offer Microsoft 365" }],
      },
      items: [{ kind: "question", summary: "Asks of Business Pro Plus: Offer Microsoft 365", status: "recorded", feature_id: "FT-1" }],
      gaps: [],
    },
  ],
  journeys: [
    {
      id: "bpp-new",
      name: "Business Pro Plus new activation",
      product_id: "bpp",
      order_type_code: "NEW",
      confidence: "confirmed",
      activities: [
        step("1", "Capture the order", { channel_entry: true, phase: "Capture", customer_visible: true }),
        step("2", "Submit the service request", { performing_system_id: "rtf", supporting_system_ids: ["web"], phase: "Capture" }),
        step("3", "Orchestrate", { performing_system_id: "cwom", phase: "Orchestrate" }),
        step("4", "Ticket the onboarding", { phase: "Orchestrate", confidence: "gap" }),
        step("5", "Book a shop visit", { performing_system_id: "bscs", phase: "Orchestrate", channels: ["shop"] }),
      ],
      flow_rules: [],
      integrations: [
        { from_activity: "2", to_activity: "3", interaction: "SR request", interface: "RTF SR", timing: "Sync" },
      ],
      edges: [
        { from_activity: "1", to_activity: "2", kind: "sequence" },
        { from_activity: "2", to_activity: "3", kind: "sequence" },
        { from_activity: "3", to_activity: "4", kind: "sequence" },
        { from_activity: "4", to_activity: "5", kind: "sequence" },
      ],
    },
  ],
} as unknown as ExplorerRelease;

/** Business Pro Plus as a sample product catalog states it: two speed tiers. */
export const PLANS: CatalogPlans = {
  status: "found",
  code: "BUSINESS_PRO_PLUS",
  catalog: "the sample product catalog",
  catalog_offering_id: "BUSINESS_PRO_PLUS",
  catalog_offering_name: "Business Pro Plus",
  read_at: "2026-10-05T09:30:00Z",
  terms: ["No contract", "24 months"],
  plans: [
    {
      id: "BPP-200",
      name: "Business Pro Plus 200Mbps (sample)",
      terms: [],
      prices: [
        { name: "Monthly, with a contract", kind: "recurring", amount: "2740", currency: "AED", period: "1 month" },
        { name: "Installation", kind: "one_time", amount: "0", currency: "AED" },
      ],
    },
    { id: "BPP-300", name: "Business Pro Plus 300Mbps (sample)", lifecycle: "Retired", terms: ["12 months"], prices: [] },
  ],
};
