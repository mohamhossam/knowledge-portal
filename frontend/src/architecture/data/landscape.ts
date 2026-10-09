/**
 * The SMB TAM landscape, built only from the SMB reference (Ref, v1.0) and the
 * Business Pro Plus SDD (SDD, v2.3). Systems the SDD uses that the reference
 * lacks are added with the SDD as their source. Where this catalogue places a
 * system in another TAM domain than the reference, `proposedMove` records the
 * reference's placement and the reason; an architect accepts or rejects each
 * in Governance.
 */
import type { Source, System, TamDomain, Team } from "../model";

export const SOURCES: Source[] = [
  {
    id: "sdd",
    title: "Business Pro Plus - Non-MVP, Solution Design Document (ADO 109131)",
    version: "2.3",
    date: "11/09/2026",
    owner: "CIT/E2E Solution Architecture",
    kind: "Solution design (Word)",
    file: "SDD_Epic109131_Business Pro Plus - Non-MVP_V2.3.docx",
  },
  {
    id: "ref",
    title: "SMB Value Stream — Architecture Reference (AI Context Document)",
    version: "1.0",
    owner: "Technical Value Stream Lead, SMB",
    kind: "Architecture reference (Markdown)",
    file: "SMB_Architecture_AI_Reference2.md",
  },
];

export const DOMAINS: TamDomain[] = [
  {
    id: "market-sales",
    name: "Market & Sales",
    scope: "Leads, opportunities, quotes, discounts and sales recommendations.",
    groups: [
      { id: "sales", name: "Sales management" },
      { id: "recommendation", name: "Recommendation" },
    ],
  },
  {
    id: "product",
    name: "Product",
    scope: "Product catalogues, offer design and catalogue automation.",
    groups: [
      { id: "catalogue", name: "Product catalogues" },
      { id: "design", name: "Offer design & automation" },
    ],
  },
  {
    id: "customer",
    name: "Customer",
    scope: "Engagement channels, customer data, customer orders, order tracking, problems and bills.",
    groups: [
      { id: "self-service", name: "Self-service channels" },
      { id: "assisted", name: "Assisted channels" },
      { id: "customer-data", name: "Customer information" },
      { id: "order", name: "Customer order management" },
      { id: "problem", name: "Customer problems" },
      { id: "bill", name: "Billing" },
    ],
  },
  {
    id: "service",
    name: "Service",
    scope: "Service order management, service activation and service quality.",
    groups: [
      { id: "order", name: "Service order management" },
      { id: "activation", name: "Service activation" },
      { id: "quality", name: "Service quality & SLA" },
    ],
  },
  {
    id: "resource",
    name: "Resource",
    scope: "Network activation, inventory, numbers, feasibility and field work.",
    groups: [
      { id: "activation", name: "Resource activation" },
      { id: "inventory", name: "Inventory & numbers" },
      { id: "field", name: "Workforce & trouble" },
    ],
  },
  {
    id: "engaged-party",
    name: "Engaged Party",
    scope: "Government bodies, identity and document services, partners and vendors.",
    groups: [
      { id: "government", name: "Government & identity" },
      { id: "partner", name: "Partners & vendors" },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    scope: "Cross-cutting: notification, documents, IT service management, single sign-on.",
    groups: [{ id: "common", name: "Common services" }],
    band: true,
  },
  {
    id: "integration",
    name: "Integration layer",
    scope: "The bus and gateways every domain talks through.",
    groups: [{ id: "bus", name: "Integration" }],
    band: true,
  },
];

const ref = (where: string) => ({ status: "confirmed" as const, source: "ref" as const, where });
const sdd = (where: string) => ({ status: "confirmed" as const, source: "sdd" as const, where });

export const SYSTEMS: System[] = [
  // Market & Sales
  { id: "bcrm", name: "BCRM", aliases: [], domain: "market-sales", group: "sales", owner: "Sales", function: "MS Dynamics sales CRM: leads, opportunities, quotes and discount approvals. Captures assisted SMB orders.", roadmap: "Replaced by Netcracker CSRD over time", evidence: ref("§1 System Directory") },
  { id: "nc-csrd", name: "Netcracker CSRD", aliases: ["CSRD"], domain: "market-sales", group: "sales", owner: "Netcracker", function: "New sales and CRM screens replacing BCRM, including AI Studio.", roadmap: "Replaces BCRM", evidence: ref("§1 System Directory") },
  { id: "pega", name: "PEGA", aliases: [], domain: "market-sales", group: "recommendation", function: "Recommendation engine; can trigger opportunities.", evidence: ref("§1 System Directory") },
  { id: "sonic", name: "SONIC", aliases: [], domain: "market-sales", group: "recommendation", function: "In-house AI model for B2B discount recommendations.", evidence: ref("§1 System Directory") },

  // Product
  { id: "bcc", name: "Digital Catalog (BCC)", aliases: ["Oracle ATG/BCC", "BCC"], domain: "product", group: "catalogue", owner: "Digital", function: "Digital product catalogue; offers uploaded by the business from Excel. Configured to accept the new Business Pro Plus POs.", evidence: ref("§1 System Directory") },
  { id: "psm", name: "PSM", aliases: ["Product & Service Management"], domain: "product", group: "catalogue", owner: "CBCM team", function: "Enterprise catalogue module: eligibility rules, pricing, GL mapping. The master reference for package codes.", evidence: ref("§1 System Directory") },
  { id: "ecm", name: "ECM", aliases: ["Ericsson Catalog Manager"], domain: "product", group: "catalogue", owner: "Ericsson / CWOM", function: "CWOM's catalogue: CFS, allowances and prices for fixed products and bundles. Answers the CPE and access-point model inquiry by bandwidth.", evidence: ref("§1 System Directory; §6 ECM = system") },
  { id: "rtf-catalog", name: "RTF Catalog", aliases: [], domain: "product", group: "catalogue", owner: "RTF team", function: "RTF's own catalogue of customer-facing services, for mobile fulfilment.", evidence: ref("§1 System Directory") },
  { id: "caf", name: "Catalog Automation Framework", aliases: ["BFM", "Bundle Framework", "Bespoke", "Automation Portal"], domain: "product", group: "design", owner: "Enterprise Catalog (ECM) team", function: "Designs, approves and configures new products across IN, BCRM, BSCS, ECM, PSM, BCC and CPP. Its Automation Portal holds the bundle building blocks (SD-WAN/FortiPortal, Firewall, Static IP, Proactive Monitoring).", evidence: { status: "inferred", source: "sdd", where: "§P1 Bundle Definition", note: "The SDD's \"Automation Portal for BFM\" is read as this framework's portal (Ref §6: BFM is its SMB name)." } },

  // Customer
  { id: "b2b-web", name: "B2B Web", aliases: ["B2B", "B2B Portal"], domain: "customer", group: "self-service", owner: "Digital", function: "Angular web channel for SMB sales and customer management; catalogue from BCC. Opens FortiPortal by SAML single sign-on.", evidence: ref("§1 System Directory") },
  { id: "smb-app", name: "SMB App", aliases: [], domain: "customer", group: "self-service", owner: "Digital", function: "iOS and Android equivalent of B2B Web.", evidence: ref("§1 System Directory") },
  { id: "sas-portal", name: "SaS Self-Service Portal", aliases: [], domain: "customer", group: "self-service", owner: "Digital / Retail", function: "Retail kiosk: biometric capture, document verification, bill payment, Customer 360.", evidence: ref("§1 System Directory") },
  { id: "cim", name: "CIM", aliases: [], domain: "customer", group: "assisted", owner: "Care", function: "Agent screen for IVR, email and chat; complaint management APIs.", roadmap: "Replaced by Netcracker CPM over time", evidence: ref("§1 System Directory") },
  { id: "dcrm", name: "DCRM", aliases: [], domain: "customer", group: "assisted", owner: "CBCM team", function: "Back-office order capture; the front end to CRMGW.", evidence: ref("§1 System Directory") },
  { id: "cbcm", name: "CBCM", aliases: ["CRMGW", "CRM GW"], domain: "customer", group: "customer-data", owner: "Enterprise Data", function: "Central customer, billing account, product inventory and order store; the registry RTF loads summary-order baskets from.", evidence: ref("§1 System Directory; §6 CBCM = CRMGW") },
  { id: "nc-crm", name: "Netcracker CRM (NC Digital)", aliases: ["NC CRM"], domain: "customer", group: "customer-data", owner: "Netcracker", function: "Customer, organisation, individual, contact and site data for customers migrated to NC Digital, read through TIBCO TMF APIs.", evidence: ref("§3.1 step 4 branch") },
  { id: "rtf", name: "RTF", aliases: ["Real-Time Fulfillment"], domain: "customer", group: "order", owner: "RTF team", function: "Receives channel orders, validates business rules, builds the value order and hands fixed orders to CWOM; loads summary-order baskets from CRMGW.", evidence: ref("§1 System Directory"), proposedMove: { from: "Service", reason: "RTF captures, validates and routes the customer's order: TAM's Customer Order Management. CWOM keeps the service-order role." } },
  { id: "ibm-bpm", name: "IBM BPM", aliases: ["BPM"], domain: "customer", group: "order", owner: "Middleware", function: "Hosts orders and milestones for the order-tracking journey (isBFMOrder, mergeOrderItems).", evidence: ref("§1 System Directory"), proposedMove: { from: "Service", reason: "Order tracking shows the customer's order status: Customer Order Management in TAM." } },
  { id: "felix", name: "Felix", aliases: [], domain: "customer", group: "order", owner: "RTF / CWOM", function: "Stores order milestones for RTF and CWOM; read through getRealTimeOrderDetails.", evidence: ref("§1 System Directory"), proposedMove: { from: "Service", reason: "Holds customer-order milestones for tracking (Customer Order Management)." } },
  { id: "ehs", name: "EHS", aliases: [], domain: "customer", group: "order", function: "Raises contract events that start the renewal up/downgrade to a non-commitment package.", evidence: { status: "inferred", source: "sdd", where: "§EHS ADO 420619", note: "Not in the SMB reference; its full name and owner are not stated." } },
  { id: "nc-cpm", name: "Netcracker CPM", aliases: ["CPM"], domain: "customer", group: "problem", owner: "Netcracker", function: "Complaint case management, replacing CIM and UCMS.", evidence: ref("§1 System Directory") },
  { id: "bscs", name: "BSCS", aliases: [], domain: "customer", group: "bill", owner: "Ericsson", function: "Billing system; billing starts when the order is fulfilled.", evidence: ref("§1 System Directory"), proposedMove: { from: "Resource", reason: "Billing is Customer Bill Management in TAM's Customer domain, not a resource." } },

  // Service
  { id: "cwom", name: "CWOM", aliases: ["Ericsson Order Care"], domain: "service", group: "order", owner: "Ericsson", function: "Order management for fixed products: validates against ECM, splits the order into sub-orders and orchestrates activation, field work, billing and notification.", evidence: ref("§1 System Directory") },
  { id: "e2eso", name: "E2ESO", aliases: [], domain: "service", group: "order", function: "Service order management: provisions Fortinet HE CPEs in the dedicated ADOM cluster, SD-WAN and FortiPortal organisations.", evidence: ref("§1 System Directory") },
  { id: "xaas", name: "XaaS", aliases: [], domain: "service", group: "activation", function: "SaaS activation layer (Microsoft, AWS and others); answers by callback.", evidence: ref("§1 System Directory"), proposedMove: { from: "Resource", reason: "It activates customer-facing SaaS services: Service Configuration & Activation." } },
  { id: "sla", name: "SLA Management", aliases: [], domain: "service", group: "quality", function: "SLA provisioning and activation.", evidence: ref("§1 System Directory"), proposedMove: { from: "Resource", reason: "SLAs are managed on the service: TAM's Service Quality Management." } },

  // Resource
  { id: "veda", name: "vEDA", aliases: ["eVEDA", "Ericsson Activation"], domain: "resource", group: "activation", owner: "Ericsson", function: "Mobile network activation (HLR, HSS); activates and removes the Backup 5G profile and commands IN and Alepo.", evidence: ref("§1 System Directory") },
  { id: "in", name: "IN", aliases: ["Intelligent Network"], domain: "resource", group: "activation", function: "Activates mobile SIM and data profiles; applies the Backup 5G speed offers (862–874) and the dunning throttle (854).", evidence: ref("§1 System Directory") },
  { id: "alepo", name: "Alepo", aliases: [], domain: "resource", group: "activation", function: "Receives vEDA's commands for Backup 5G, as for DI/DPI.", evidence: { status: "inferred", source: "sdd", where: "§vEDA Cessation", note: "Named once in the SDD; not in the SMB reference." } },
  { id: "nrm", name: "NRM", aliases: [], domain: "resource", group: "inventory", function: "Port and network resource allocation.", evidence: ref("§1 System Directory") },
  { id: "inv-6d", name: "6D Inventory", aliases: ["SIM / Device / Number inventory"], domain: "resource", group: "inventory", function: "Reserves, deducts and releases SIMs, devices and numbers.", evidence: ref("§1 System Directory") },
  { id: "nps", name: "NPS", aliases: [], domain: "resource", group: "inventory", function: "Number portability: takes port-in and port-out requests and submits them to RTF with the summary-order flags.", evidence: { status: "inferred", source: "sdd", where: "§NPS Port In & Port Out", note: "Not in the SMB reference; placed with numbers." } },
  { id: "gis", name: "GIS", aliases: [], domain: "resource", group: "inventory", function: "Network feasibility and availability check.", evidence: ref("§1 System Directory"), proposedMove: { from: "Engaged Party", reason: "Network feasibility reads the operator's own network inventory: Resource domain." } },
  { id: "wfms", name: "WFMS", aliases: ["WFM"], domain: "resource", group: "field", owner: "Engineering", function: "Manual work orders: the technician installs the CPE and FortiAP, captures SIC codes and serials and updates CWOM.", evidence: ref("§1 System Directory (WFM / Remedy)") },
  { id: "remedy", name: "Remedy", aliases: [], domain: "resource", group: "field", owner: "Engineering", function: "Engineering ticketing and assurance.", evidence: ref("§1 System Directory (WFM / Remedy)") },

  // Engaged Party
  { id: "gov", name: "Government Systems", aliases: [], domain: "engaged-party", group: "government", external: true, owner: "External", function: "Trade licence and decree validation.", evidence: ref("§1 System Directory") },
  { id: "eida", name: "EIDA", aliases: [], domain: "engaged-party", group: "government", external: true, owner: "External", function: "National ID reader device.", evidence: ref("§1 System Directory") },
  { id: "ocr", name: "OCR", aliases: [], domain: "engaged-party", group: "government", function: "Reads trade licences, Emirates IDs and establishment cards.", evidence: ref("§1 System Directory") },
  { id: "fortinet", name: "Fortinet (FortiManager / FortiPortal)", aliases: ["FortiPortal", "ADOM FM cluster"], domain: "engaged-party", group: "partner", external: true, function: "Vendor platform: the dedicated ADOM FortiManager cluster for Business Pro Plus CPEs, and FortiPortal for customer self-management.", evidence: sdd("§P1 New Activation; §P3 ADO 194831") },
  { id: "npc", name: "NPC", aliases: [], domain: "engaged-party", group: "partner", external: true, function: "Sends port-out requests to NPS.", evidence: { status: "inferred", source: "sdd", where: "§NPS Portout", note: "Expanded nowhere in the sources." } },

  // Enterprise (band)
  { id: "cns", name: "CNS", aliases: ["Central Notification Service"], domain: "enterprise", group: "common", function: "SMS and email with OTP; template-driven, English and Arabic.", evidence: ref("§1 System Directory") },
  { id: "edms", name: "EDMS", aliases: [], domain: "enterprise", group: "common", function: "Customer documents, technical templates and test results.", evidence: ref("§1 System Directory") },
  { id: "itsm", name: "ServiceNow / HPSM", aliases: ["HPSM", "ServiceNow"], domain: "enterprise", group: "common", owner: "IT", function: "IT ticketing; device-delivery shipment orders and confirmations (HPSM moving to ServiceNow).", evidence: ref("§1 System Directory") },
  { id: "adfs", name: "ADFS", aliases: [], domain: "enterprise", group: "common", function: "Single sign-on for CSRD and GIS screens.", evidence: ref("§1 System Directory") },

  // Integration layer (band)
  { id: "tibco", name: "TIBCO", aliases: [], domain: "integration", group: "bus", owner: "Middleware", function: "Integration bus: digital channels to government, vendors and NC CRM (TMF APIs); carries order-creation notices, milestones and order-tracking reads.", evidence: ref("§1 System Directory"), proposedMove: { from: "Enterprise Management", reason: "An integration bus is infrastructure every domain uses; it is drawn as the integration layer, not a business domain." } },
  { id: "bff", name: "B2B BFF", aliases: ["BFF"], domain: "integration", group: "bus", function: "Backend for frontend of the digital channels.", evidence: { status: "inferred", source: "ref", where: "§1 B2B Web integrations; §7 Glossary", note: "Named as an integration, not described as a system." } },
];

/** Lanes that are teams, not systems: shown in flows, never on the landscape. */
export const TEAMS: Team[] = [
  { id: "mss", name: "MSS team", detail: "Managed Security Services: receives the SD-WAN service onboarding ticket and does the Day-N SD-WAN configuration.", evidence: sdd("§P1 New Activation; General Highlights") },
  { id: "customer", name: "Customer", detail: "The SMB customer or their representative.", evidence: { status: "inferred", note: "The flow's starting party." } },
];

export function systemById(id: string): System | undefined {
  return SYSTEMS.find((system) => system.id === id);
}

/** A lane's name: a system, a team, or the id itself when neither is known. */
export function laneName(id: string): string {
  return systemById(id)?.name ?? TEAMS.find((team) => team.id === id)?.name ?? id;
}
