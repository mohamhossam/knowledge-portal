import type { ExplorerRelease } from "../api/client";

const system = (id: string, name: string) => ({ id, name, aliases: [], capabilities: [], components: [], constraints: [] });
const step = (number: string, name: string, extra: object = {}) => ({
  number, name, supporting_system_ids: [], component_ids: [], ...extra,
});

/** A version in service with one offering, two order types and one journey. */
export const EXPLORED = {
  id: "live",
  name: "October",
  published_at: "2026-10-05T00:00:00Z",
  systems: [system("web", "B2B Web"), system("rtf", "RTF"), system("cwom", "CWOM"), system("wfm", "WFM"), system("bscs", "BSCS")],
  relationships: [],
  landscape_domains: [],
  products: [
    {
      id: "bpp",
      name: "Business Pro Plus",
      proposition: "Premium internet for small businesses.",
      rules: [],
      values: [],
      audiences: [],
      order_types: [
        { code: "NEW", name: "New Activation", enabled: true },
        { code: "CEASE", name: "Cease", enabled: true },
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
        },
        { id: "fw", name: "Firewall", mandatory: false, responsibilities: [] },
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
        step("1", "Capture the order", { performing_system_id: "web", phase: "Capture", customer_visible: true }),
        step("2", "Submit the service request", { performing_system_id: "rtf", supporting_system_ids: ["web"], phase: "Capture" }),
        step("3", "Orchestrate", { performing_system_id: "cwom", phase: "Orchestrate" }),
        step("4", "Ticket the onboarding", { phase: "Orchestrate", confidence: "gap" }),
      ],
      flow_rules: [],
      integrations: [
        { from_activity: "2", to_activity: "3", interaction: "SR request", interface: "RTF SR", timing: "Sync" },
      ],
      edges: [
        { from_activity: "1", to_activity: "2", kind: "sequence" },
        { from_activity: "2", to_activity: "3", kind: "sequence" },
        { from_activity: "3", to_activity: "4", kind: "sequence" },
      ],
    },
  ],
} as unknown as ExplorerRelease;
