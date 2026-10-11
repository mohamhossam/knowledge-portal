/**
 * Two diagrams shaped like the demo seed (scripts/seed_demo.py and the SMB
 * architecture catalogue), for the gallery and the kit's tests. Sample data:
 * the screens in phases 3 and 4 build these from the API instead.
 */
import type { DiagramEdge, DiagramNode } from "../../design/diagram";

/** One system in context: CWOM, what calls it on the left, what it calls on the right. */
export const CWOM_LANES = [
  { id: "callers", label: "Calls CWOM" },
  { id: "system", label: "System" },
  { id: "called", label: "CWOM calls" },
];

export const CWOM_NODES: DiagramNode[] = [
  { id: "rtf", label: "RTF", detail: "Order orchestration", lane: "callers" },
  { id: "cwom", label: "CWOM", detail: "Order orchestration", tone: "subject", lane: "system" },
  { id: "felix", label: "Felix", detail: "Order tracking", lane: "called" },
  { id: "service-activation", label: "eVEDA", detail: "Activation", lane: "called" },
  { id: "wfm", label: "WFM", detail: "Workforce", lane: "called" },
  { id: "bscs", label: "BSCS", detail: "Billing", status: "No squad", tone: "gap", lane: "called" },
  { id: "cns", label: "CNS", detail: "Notifications", status: "No squad", tone: "gap", lane: "called" },
];

export const CWOM_EDGES: DiagramEdge[] = [
  { from: "rtf", to: "cwom", label: "orchestrates" },
  { from: "cwom", to: "felix", label: "events", dashed: true },
  { from: "cwom", to: "service-activation", label: "orchestrates" },
  { from: "cwom", to: "wfm", label: "orchestrates" },
  { from: "cwom", to: "bscs", label: "sends data" },
  { from: "cwom", to: "cns", label: "events", dashed: true },
];

/** Who runs what: value stream, product, system, and the squad that runs each system. */
const squad = (system: string, name: string): DiagramNode => ({ id: `${system}:squad`, label: name, detail: "Squad", shape: "pill" });
const system = (id: string, label: string, owned: boolean): DiagramNode =>
  owned ? { id, label, detail: "System" } : { id, label, detail: "System", status: "No squad", tone: "gap" };

export const OWNERSHIP_NODES: DiagramNode[] = [
  { id: "retail", label: "Retail", detail: "Value stream" },
  { id: "fibre-ordering", label: "Fibre bundle ordering", detail: "Product" },
  system("b2b-web", "B2B Web", true),
  squad("b2b-web", "Sales squad"),
  system("b2b-bff", "B2B BFF", false),
  system("cbcm-crmgw", "CBCM / CRMGW", false),
  system("cwom", "CWOM", true),
  squad("cwom", "Fulfilment squad"),
  system("bscs", "BSCS", false),
  { id: "care", label: "Customer care", detail: "Product" },
  system("cim", "CIM", true),
  squad("cim", "Care squad"),
  system("service-now", "ServiceNow", false),
  { id: "business", label: "Business", detail: "Value stream" },
  { id: "partner-channel", label: "Partner channel", detail: "Product" },
  system("bcrm", "BCRM", true),
  squad("bcrm", "Sales squad"),
  system("dcrm", "DCRM", false),
  { id: "unplaced", label: "22 more systems", status: "No product or squad", tone: "gap" },
];

export const OWNERSHIP_EDGES: DiagramEdge[] = [
  ["retail", "fibre-ordering"],
  ["fibre-ordering", "b2b-web"],
  ["b2b-web", "b2b-web:squad"],
  ["fibre-ordering", "b2b-bff"],
  ["fibre-ordering", "cbcm-crmgw"],
  ["fibre-ordering", "cwom"],
  ["cwom", "cwom:squad"],
  ["fibre-ordering", "bscs"],
  ["retail", "care"],
  ["care", "cim"],
  ["cim", "cim:squad"],
  ["care", "service-now"],
  ["business", "partner-channel"],
  ["partner-channel", "bcrm"],
  ["bcrm", "bcrm:squad"],
  ["partner-channel", "dcrm"],
].map(([from, to]) => ({ from: from!, to: to! }));
