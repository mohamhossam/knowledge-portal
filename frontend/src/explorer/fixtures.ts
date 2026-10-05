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
  products: [
    {
      id: "bpp",
      name: "Business Pro Plus",
      proposition: "Premium internet for small businesses.",
      rules: [],
      values: [],
      audiences: [],
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
