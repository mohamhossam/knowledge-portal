/**
 * The portfolio and its first offering, Business Pro Plus, from the SDD (v2.3)
 * and the SMB reference (v1.0) only. Prices the sources don't state are left
 * out and shown as "not provided yet".
 */
import type { Channel, Offering, OrderType, PortfolioNode } from "../model";

export const PORTFOLIO: PortfolioNode[] = [
  { id: "enterprise", level: "Business unit", name: "Enterprise", parentId: null, description: "The business unit that owns the business portfolios." },
  { id: "fixed", level: "Line of business", name: "Fixed", parentId: "enterprise", description: "Fixed-line products: fibre broadband, voice and the services bundled with them." },
  { id: "smb", level: "Segment", name: "SMB", parentId: "fixed", description: "Small and medium businesses." },
  { id: "business-internet", level: "Product family", name: "Business internet bundles", parentId: "smb", description: "Bundles built on the Bundle Framework (BFM): broadband with business services." },
];

export const CHANNELS: Channel[] = [
  { id: "bcrm", name: "BCRM", systemId: "bcrm", kind: "assisted" },
  { id: "b2b-web", name: "B2B Web", systemId: "b2b-web", kind: "self-service" },
  { id: "smb-app", name: "SMB App", systemId: "smb-app", kind: "self-service" },
  { id: "cim", name: "CIM / UCMS", systemId: "cim", kind: "assisted" },
  { id: "nps", name: "NPS (portability)", systemId: "nps", kind: "system" },
  { id: "ehs", name: "EHS (contract events)", systemId: "ehs", kind: "system" },
];

/** Order types as the SDD codes them (service requests, "SR"). */
export const ORDER_TYPES: OrderType[] = [
  { code: "NEW", name: "New activation", family: "acquire", description: "A new Business Pro Plus subscription on a new or existing account." },
  { code: "MIGRATE", name: "Migration to Business Pro Plus", family: "acquire", description: "From a legacy product (DEL, PBX, BQS…) or from Business Edge (BFV2)." },
  { code: "PORTIN", name: "Port in", family: "acquire", description: "A new activation that brings the customer's number from another operator." },
  { code: "UPDOWNGRD", name: "Upgrade / downgrade", family: "change", description: "Change of plan between Business Pro Plus, Office Presence, Business ON and Business Pro, with or without a device change." },
  { code: "ADDDELETE", name: "Add / delete add-on", family: "change", description: "Static IP, Speed Booster, VSaaS, voice, SaaS, managed-device and other add-ons." },
  { code: "MODSUBS", name: "Modify subscription", family: "change", description: "SaaS service activation from the digital channel." },
  { code: "CHINTUSRN", name: "Change internet username", family: "care", description: "" },
  { code: "CHGPSWD", name: "Change password", family: "care", description: "" },
  { code: "CHGDOMN", name: "Change domain", family: "care", description: "" },
  { code: "CHGSUBDOMN", name: "Change sub-domain", family: "care", description: "" },
  { code: "CHNUMBER", name: "Change number", family: "care", description: "" },
  { code: "FLEXIMINMOV", name: "Flexi minute movement", family: "care", description: "" },
  { code: "TECHVISIT", name: "Technician visit", family: "care", description: "" },
  { code: "DVCREP", name: "Faulty device replacement", family: "care", description: "Raised as a complaint; CPE or FortiAP replaced, with exit charges when out of warranty." },
  { code: "EXTSHIFTSITE", name: "External shift of site", family: "move", description: "Moves the service to another site within the Etisalat area." },
  { code: "RENEWAL", name: "Renewal", family: "change", description: "Contract renewal; EHS can trigger a move to the non-commitment package." },
  { code: "CESSREQ", name: "Cessation", family: "cease", description: "Direct, with retention, within the trial period, or bulk." },
  { code: "PORTOUT", name: "Port out", family: "cease", description: "A cessation started by a port-out request from NPC." },
  { code: "DUNNING", name: "Dunning (TOSS, reconnect, non-payment cessation)", family: "billing", description: "Throttle or suspend for non-payment, reconnect, or cease (CESSNP)." },
];

const sdd = (where: string) => ({ status: "confirmed" as const, source: "sdd" as const, where });

/** Speeds, devices and backup offers are stated; upload is derived from the 1:2 ratio (rule R2). */
const PLAN_EVIDENCE = { status: "confirmed" as const, source: "sdd" as const, where: "§IN Backup 5G table; §P1.1 CPE/AP inquiry", note: "Upload speeds are derived from the 1:2 ratio (R2); the SDD lists download tiers only." };

export const OFFERINGS: Offering[] = [
  {
    id: "business-pro-plus",
    nodeId: "business-internet",
    name: "Business Pro Plus",
    shortName: "B. Pro+",
    summary: "The premium flavour of Business Pro: fibre (GPON) internet on Fortinet 90G/120G CPEs, with SD-WAN and FortiPortal, firewall, static IP, proactive monitoring, a managed FortiAP and optional Backup 5G.",
    purpose: "Gives a small or medium business a secure, managed business connection it can run itself: one premium bundle instead of separate internet, security and Wi-Fi products, delivered through the Summary Order Fulfillment of the SMB Framework (Order to Delivery).",
    evidence: sdd("§Solution Overview P1"),
    values: [
      { title: "Secure by default", detail: "Firewall, static IP, SD-WAN/FortiPortal and proactive monitoring are mandatory in every Business Pro Plus bundle, on Fortinet 90G or 120G CPEs.", evidence: sdd("§P1.1 Mandating Bundling Components; General Highlights") },
      { title: "Multi-branch networking", detail: "SD-WAN with IPSec tunnels between branches and hub/spoke set-up, managed from FortiPortal. Overlay and routing configuration is a Day-N service by the MSS team.", evidence: sdd("Feasibility matrix, User Story 57539; General Highlights") },
      { title: "Business continuity", detail: "Optional Backup 5G: traffic fails over to the 5G network when the fibre link goes down, and back when it returns.", evidence: sdd("Feasibility matrix, User Story 80255 (existing implementation)") },
      { title: "Self-management", detail: "The customer opens FortiPortal from B2B Web or the SMB App by single sign-on, with a role that follows their B2B role.", evidence: sdd("§P3 ADO 194831") },
      { title: "Managed Wi-Fi", detail: "A managed FortiAP access point, boxed and serialised, delivered with the CPE.", evidence: sdd("Feasibility matrix, User Story 81960") },
      { title: "Network visibility", detail: "Bandwidth, latency and tunnel dashboards and reports in FortiPortal. Subject to Fortinet feasibility (TBD in the SDD).", evidence: { status: "inferred", source: "sdd", where: "Feasibility matrix, User Story 81220", note: "Feasibility is TBD in the SDD." } },
    ],
    eligibility: [
      { title: "Segment", detail: "SMB customers (Enterprise › Fixed › SMB).", evidence: { status: "inferred", source: "ref", where: "Title and scope", note: "The SDD doesn't state a customer-type rule." } },
      { title: "New activation", detail: "Sold through BCRM, B2B Web and the SMB App.", evidence: sdd("§P1 Applicable Channels") },
      { title: "Migration", detail: "Existing customers on legacy products (DEL, PBX, BQS…) migrate through BCRM; Business Edge (BFV2) customers through BCRM or the SMB App.", evidence: sdd("Scope; §P3 ADO 202824") },
      { title: "Location", detail: "External shift only within the Etisalat area. Bitstream is out of scope.", evidence: sdd("Scope; Feasibility matrix") },
      { title: "Commitment", detail: "No contract, 1 year or 2 years; the CPE rate plan follows the contract period chosen.", evidence: sdd("§ADO 438907, US 438909") },
      { title: "FortiPortal", detail: "Provisioned only for Business Pro Plus accounts (self-service CFSS). The organisation is created with the first site and removed with the last branch's cessation.", evidence: sdd("§P1 FortiPortal Access") },
    ],
    plans: [
      { name: "Business Pro Plus 200 Mbps", download: "200 Mbps", upload: "100 Mbps", cpe: "Fortinet 90G", accessPoint: "FAP-23JF-E", backupOffer: "IN offer 862 (200 Mbps)", evidence: PLAN_EVIDENCE },
      { name: "Business Pro Plus 300 Mbps", download: "300 Mbps", upload: "150 Mbps", cpe: "Fortinet 90G", accessPoint: "FAP-23JF-E", backupOffer: "IN offer 864 (300 Mbps)", evidence: PLAN_EVIDENCE },
      { name: "Business Pro Plus 400 Mbps", download: "400 Mbps", upload: "200 Mbps", cpe: "Fortinet 90G", accessPoint: "FAP-23JF-E", backupOffer: "IN offer 866 (400 Mbps)", evidence: PLAN_EVIDENCE },
      { name: "Business Pro Plus 600 Mbps", download: "600 Mbps", upload: "300 Mbps", cpe: "Fortinet 90G", accessPoint: "FAP-23JF-E", backupOffer: "IN offer 869 (600 Mbps)", evidence: PLAN_EVIDENCE },
      { name: "Business Pro Plus 800 Mbps", download: "800 Mbps", upload: "400 Mbps", cpe: "Fortinet 90G", accessPoint: "FAP-23JF-E", backupOffer: "IN offer 872 (800 Mbps)", evidence: PLAN_EVIDENCE },
      { name: "Business Pro Plus 1 Gbps", download: "1024 Mbps", upload: "512 Mbps", cpe: "Fortinet 120G", accessPoint: "FAP-431F-E", backupOffer: "IN offer 874 (1 Gbps)", evidence: PLAN_EVIDENCE },
    ],
    rules: [
      { id: "R1", kind: "composition", statement: "SD-WAN/FortiPortal, Firewall, Static IP and Proactive Monitoring are mandatory: checked by default and locked in the Automation Portal for Business Pro Plus bundles.", evidence: sdd("§P1.1 Mandating Bundling Components") },
      { id: "R2", kind: "composition", statement: "Speed profiles with an upload:download ratio of 1:2 are only for Business Pro Plus; the 1:10 profiles stay with Business Pro.", evidence: sdd("§P1 Bundle Definition") },
      { id: "R3", kind: "fulfilment", statement: "ECM suggests the Fortinet 90G below 1 Gbps and the 120G at 1 Gbps; FAP-23JF-E below 1 Gbps and FAP-431F-E from 1 Gbps.", evidence: sdd("§P1.1 Generic FortiAP Offer") },
      { id: "R4", kind: "fulfilment", statement: "Business Pro Plus CPEs are provisioned in the dedicated ADOM FortiManager cluster (platform type \"Fortinet HE\").", evidence: sdd("§P1 New Activation") },
      { id: "R5", kind: "fulfilment", statement: "SD-WAN configuration (overlay, routing, templates, security policies) is a Day-N service by the MSS team, not part of activation.", evidence: sdd("General Highlights") },
      { id: "R6", kind: "dependency", statement: "A lifecycle request is accepted only when the sub-orders it depends on are complete (pending-order validation matrix in CRMGW). An up/downgrade needs the master order closed.", evidence: sdd("§P4 Pending Order Validation") },
      { id: "R7", kind: "dependency", statement: "An add-on can be added only when its service type's sub-order is closed: voice needs GSM; static IP and Speed Booster need GSM and GPON; SaaS needs GSM and SaaS; vSaaS needs GSM and vSaaS.", evidence: sdd("§P4 Pending Order Validation, add-on matrix") },
      { id: "R8", kind: "lifecycle", statement: "Amendment and cancellation are allowed until the point of no return agreed in the workflows. There is no amendment from the SMB App.", evidence: sdd("§P1 Amendment/Cancellation; §P2 UpDowngrade") },
      { id: "R9", kind: "billing", statement: "Dunning throttles Backup 5G to 5 Mbps with IN offer 854 at TOSS, and removes it at reconnect.", evidence: sdd("§P3 ADO 259162") },
      { id: "R10", kind: "billing", statement: "The new generic CPE rate plan for 90G/120G carries an exit charge of AED 650 (to be confirmed by the business), per contract period: no contract, 1 year, 2 years.", evidence: sdd("§ADO 438907, US 438909") },
      { id: "R11", kind: "composition", statement: "The 900/450 speed profile is not offered on the Fortinet 90G until it passes the lab test.", evidence: sdd("General Highlights, Speed Booster") },
    ],
    components: [
      { id: "gpon", name: "Fibre internet (GPON) on the CPE", offerCode: "PO_VCPE_ONPREM_GPON_HE", specCode: "CFSS_INTERNET_CPE_ONPREM_HE", mandatory: true, description: "The broadband access, at the plan's speed profile.", systems: [{ systemId: "cwom", responsibility: "Orchestrates the GPON sub-order" }, { systemId: "e2eso", responsibility: "Provisions the CPE service" }, { systemId: "wfms", responsibility: "Installation work order" }], evidence: sdd("§P1 Catalog Modelling") },
      { id: "cpe", name: "CPE device (Fortinet 90G / 120G)", offerCode: "PO_ADDON_BFM_ONPREM_CPE", specCode: "RPCUSTONPREMEQPT", mandatory: true, description: "Generic CPE offer with CPE_PLATFORM_TYPE \"Fortinet HE\", SIC_CODE, MODEL and LIST_OF_MODELS; a new generic CPE rate plan for B. Pro+ (ADO 438907).", systems: [{ systemId: "ecm", responsibility: "Suggests the model by bandwidth" }, { systemId: "wfms", responsibility: "Captures SIC code and serial" }, { systemId: "e2eso", responsibility: "Provisions in the ADOM cluster" }], evidence: sdd("§P1 Catalog Modelling; §ADO 438907") },
      { id: "firewall", name: "Firewall", offerCode: "PO_ADDON_BFM_ONPREM_FIREWALL_HE", specCode: "CFSS_ONPREM_FIREWALL_HE", mandatory: true, description: "Default or non-default configuration from the bundle; UTP licence per the existing SMB FW implementation.", systems: [{ systemId: "cwom", responsibility: "Provisions by default/non-default" }, { systemId: "e2eso", responsibility: "Applies on the CPE" }], evidence: sdd("§P1 Firewall; §P1.1") },
      { id: "selfservice", name: "Self-service portal (FortiPortal)", offerCode: "PO_SELFSERVICE_PORTAL_ACCESS", specCode: "CFSS_SELFSERVICE_PORTAL_ACCESS", mandatory: true, description: "FortiPortal access; shown in B2B as \"Security & Services Portal\" (rate plan RP_SELFSERVICE_PORTAL_ACCESS, component type SSPRTL).", systems: [{ systemId: "e2eso", responsibility: "Creates the FortiPortal organisation" }, { systemId: "cbcm", responsibility: "Returns the SSPRTL benefit" }, { systemId: "b2b-web", responsibility: "SAML single sign-on" }], evidence: sdd("§P1 Bundle Definition; §P3 ADO 194831") },
      { id: "sdwan", name: "SD-WAN", offerCode: "PO_SDWAN_NEW", specCode: "CFSS_SDWAN_NEW", mandatory: true, description: "SD-WAN service; its configuration is Day-N by MSS.", systems: [{ systemId: "cwom", responsibility: "Passes SD-WAN in the onboarding ticket" }, { systemId: "mss", responsibility: "Day-N configuration" }], evidence: sdd("§P1 Bundle Definition; General Highlights") },
      { id: "ap", name: "Access point (FortiAP)", offerCode: "PO_ACCESS_POINT", specCode: "PRS_ACCESS_POINT", mandatory: true, description: "Generic AP offer with SIC_CODE, MODEL, DEVICE_RECOVERY, LIST_OF_MODELS and CAPTURE_REQUIRED.", systems: [{ systemId: "ecm", responsibility: "Suggests the AP model" }, { systemId: "wfms", responsibility: "Captures serial and SIC code" }, { systemId: "cwom", responsibility: "Provisions like the generic CPE" }], evidence: sdd("§P1.1 Generic FortiAP Offer") },
      { id: "static-ip", name: "Static IP", mandatory: true, description: "Mandatory in Business Pro Plus bundles.", systems: [{ systemId: "cwom", responsibility: "Provisions" }], evidence: sdd("§P1.1 Mandating Bundling Components") },
      { id: "monitoring", name: "Proactive monitoring", mandatory: true, description: "Proactive monitoring for the Fortinet 90G/120G CPEs.", systems: [{ systemId: "e2eso", responsibility: "Enables on the CPE" }], evidence: sdd("§P1.1; Solution Assumptions") },
      { id: "backup-5g", name: "Backup 5G", mandatory: false, description: "Failover over a Forti Extender or GSM SIM, with HSS profile 5GNSA_BPRO5GBKP; the SIM is geo-locked to cell IDs and the dongle's IMEI.", systems: [{ systemId: "veda", responsibility: "Activates and removes the profile" }, { systemId: "in", responsibility: "Applies the speed offer" }], evidence: sdd("§P2 IN; §vEDA; Solution Assumptions") },
    ],
    orderTypes: [
      { code: "NEW", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P1", evidence: sdd("Scope; §P1") },
      { code: "MIGRATE", channels: ["bcrm", "smb-app"], priority: "P1 / P3", note: "Legacy through BCRM (P1); Business Edge through BCRM and the SMB App (P3).", evidence: sdd("Scope; §P1 Legacy Migration; §P3 ADO 202824") },
      { code: "PORTIN", channels: ["bcrm", "b2b-web", "smb-app", "nps"], priority: "P3", evidence: sdd("§NPS Port In & Port Out") },
      { code: "UPDOWNGRD", channels: ["bcrm", "smb-app"], priority: "P2 / P3", note: "28 from/to paths across Business Pro Plus, Office Presence, Business ON and Business Pro; P3 adds device change.", evidence: sdd("Scope; §P2 ADO 81197; §P3 ADO 81961") },
      { code: "ADDDELETE", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P2 / P4", note: "VSaaS and static IP (P2); Speed Booster and add-ons while on 5G backup (P4).", evidence: sdd("Scope") },
      { code: "MODSUBS", channels: ["b2b-web", "smb-app"], priority: "P4", evidence: sdd("Scope, P4 SaaS activation (MODSUBS)") },
      { code: "CHINTUSRN", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P2 / P4", evidence: sdd("Scope") },
      { code: "CHGPSWD", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P2 / P4", evidence: sdd("Scope") },
      { code: "CHGDOMN", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P4", evidence: sdd("Scope") },
      { code: "CHGSUBDOMN", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P4", evidence: sdd("Scope") },
      { code: "CHNUMBER", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P4", evidence: sdd("Scope") },
      { code: "FLEXIMINMOV", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P4", evidence: sdd("Scope") },
      { code: "TECHVISIT", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P4", evidence: sdd("Scope") },
      { code: "DVCREP", channels: ["cim"], priority: "P3 / P4", evidence: sdd("§P4 ADO 289225") },
      { code: "EXTSHIFTSITE", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P3", evidence: sdd("§P3 ADO 202826") },
      { code: "RENEWAL", channels: ["ehs"], priority: "P4", evidence: sdd("§EHS ADO 420619") },
      { code: "CESSREQ", channels: ["bcrm", "b2b-web", "smb-app"], priority: "P2", evidence: sdd("§P2 ADO 259161") },
      { code: "PORTOUT", channels: ["nps"], priority: "P3", evidence: sdd("§NPS Portout") },
      { code: "DUNNING", channels: [], priority: "P3", note: "The source that starts dunning isn't named in the SDD.", evidence: sdd("§P3 ADO 259162") },
    ],
  },
];

export function offeringById(id: string | null | undefined): Offering | undefined {
  return OFFERINGS.find((offering) => offering.id === id);
}

export function orderTypeByCode(code: string | null | undefined): OrderType | undefined {
  return ORDER_TYPES.find((type) => type.code === code);
}

export function channelById(id: string | null | undefined): Channel | undefined {
  return CHANNELS.find((channel) => channel.id === id);
}
