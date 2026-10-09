/**
 * Business Pro Plus journeys, the order-tracking flow and the catalogue's
 * findings, from the SDD (v2.3) and the SMB reference (v1.0) only.
 *
 * eTOM labels are this catalogue's classification of each step (Operations ·
 * Fulfillment / Billing / CRM); the sources don't state them.
 */
import type { Evidence, Finding, Integration, Journey, Step, TrackingFlow } from "../model";

const ref = (where: string): Evidence => ({ status: "confirmed", source: "ref", where });
const sdd = (where: string): Evidence => ({ status: "confirmed", source: "sdd", where });
const inferred = (source: "sdd" | "ref", where: string, note: string): Evidence => ({ status: "inferred", source, where, note });
const gap = (note: string): Evidence => ({ status: "gap", note });

const ETOM = {
  selling: "Fulfillment · Selling",
  order: "Fulfillment · Order Handling",
  service: "Fulfillment · Service Configuration & Activation",
  resource: "Fulfillment · Resource Provisioning",
  partner: "Fulfillment · Supplier/Partner Requisition Management",
  billing: "Billing · Billing & Revenue Management",
  interface: "CRM · Customer Interface Management",
};

/**
 * The fulfilment every Business Pro Plus activation shares once the channel has
 * submitted the order (its last step points at "announce"): RTF, CWOM and the
 * systems CWOM orchestrates. `channel` is the lane that gets a rejected order back.
 */
function activationFulfilment(channel: string): { steps: Step[]; integrations: Integration[] } {
  const steps: Step[] = [
    { id: "announce", kind: "task", name: "Announce the new order for tracking", lane: "rtf", role: "track", etom: ETOM.order, detail: "RTF sends NotifyOrderCreationRequest through TIBCO to BPM, which opens the order tracker.", next: [{ to: "evaluate" }], evidence: sdd("§BPM; §TIBCO (Order Tracking)") },
    { id: "evaluate", kind: "task", name: "Build the value order and evaluate it", lane: "rtf", role: "validate", etom: ETOM.order, detail: "RTF translates the order to an RTF value order with PSM codes and evaluates it with CRMGW and ECM.", next: [{ to: "rules" }], evidence: ref("§3.1 step 6") },
    { id: "rules", kind: "exclusive", name: "Business rules passed?", lane: "rtf", next: [{ to: "rejected", label: "No" }, { to: "handoff", label: "Yes" }], evidence: ref("§3.1 step 7") },
    { id: "rejected", kind: "error-end", name: "Order returned for correction", lane: channel, next: [], evidence: ref("§3.1 step 7") },
    { id: "handoff", kind: "task", name: "Hand the order to CWOM", lane: "rtf", role: "orchestrate", etom: ETOM.order, detail: "In Ericsson Order Care format, as a summary order (SUMMARY_ORDER / DETAILED_ORDER flags).", next: [{ to: "accept" }], evidence: ref("§3.1 step 7") },
    { id: "accept", kind: "task", name: "Validate against ECM and accept the order", lane: "cwom", role: "orchestrate", etom: ETOM.order, detail: "CWOM accepts the new platform type “Fortinet HE” and the new POs.", next: [{ to: "models" }], evidence: ref("§3.1 step 8") },
    { id: "models", kind: "task", name: "Suggest the CPE and access-point models", lane: "ecm", role: "catalog", etom: ETOM.service, detail: "Below 1 Gbps: Fortinet 90G and FAP-23JF-E. At 1 Gbps: Fortinet 120G and FAP-431F-E.", next: [{ to: "split" }], evidence: sdd("§P1.1 Generic FortiAP Offer") },
    { id: "split", kind: "task", name: "Split into sub-orders", lane: "cwom", role: "orchestrate", etom: ETOM.service, detail: "GPON; GSM (Backup 5G, UCaaS, synchronous SaaS); SaaS (asynchronous); vSaaS; and the master order.", next: [{ to: "fork" }], evidence: inferred("sdd", "§P4 Pending Order Validation", "The sub-orders are named in the validation matrix; the split as a step is this catalogue's reading.") },
    { id: "fork", kind: "parallel", name: "Fulfil the sub-orders", lane: "cwom", next: [{ to: "cpe" }, { to: "install" }, { to: "backup" }, { to: "saas" }, { to: "ship" }, { to: "onboard" }], evidence: inferred("sdd", "§P1 New Activation", "The SDD lists the fulfilment systems; their order is set by workflows not yet provided.") },
    { id: "cpe", kind: "task", name: "Provision the CPE in the ADOM cluster; create the FortiPortal organisation", lane: "e2eso", role: "activate", etom: ETOM.service, detail: "The organisation is created once, with the customer's first site. CWOM passes the site name and organisation name.", next: [{ to: "vendor" }], evidence: sdd("§P1 New Activation; §P2 New Activation") },
    { id: "vendor", kind: "task", name: "Register the CPE and the organisation", lane: "fortinet", role: "activate", etom: ETOM.partner, next: [{ to: "join" }], evidence: sdd("§P1 FortiPortal Access") },
    { id: "install", kind: "task", name: "Install the CPE and FortiAP; capture SIC codes and serials", lane: "wfms", role: "field", etom: ETOM.resource, detail: "The technician sees the SIC code; WFMS updates CWOM with the AP's SIC code and serial. A faulty FortiAP can be replaced on site.", next: [{ to: "join" }], evidence: sdd("§P1 New Activation; §P1.1 Generic FortiAP Offer") },
    { id: "backup", kind: "task", name: "Activate Backup 5G", lane: "veda", role: "activate", etom: ETOM.resource, detail: "HSS profile 5GNSA_BPRO5GBKP; vEDA commands IN and Alepo. The SIM is geo-locked to cell IDs and the dongle's IMEI.", next: [{ to: "speed" }], evidence: inferred("sdd", "§P2 IN; §vEDA", "The SDD details Backup 5G for up/downgrade and cessation and says activation is “the same as the new activation fulfillment”.") },
    { id: "speed", kind: "task", name: "Apply the Backup 5G speed offer", lane: "in", role: "activate", etom: ETOM.resource, detail: "IN offers 862 to 874, by plan speed.", next: [{ to: "join" }], evidence: inferred("sdd", "§P2 IN", "Stated for up/downgrade; read as the same for activation.") },
    { id: "saas", kind: "task", name: "Activate SaaS services", lane: "xaas", role: "activate", etom: ETOM.service, ponr: "The XaaS callback is the point of no return for the asynchronous SaaS order.", next: [{ to: "join" }], evidence: ref("§3.1 step 11") },
    { id: "ship", kind: "task", name: "Ship managed devices", lane: "itsm", role: "logistics", etom: ETOM.partner, detail: "Shipment order from CWOM; the shipment confirmation comes back through TIBCO to a CWOM callback.", ponr: "For managed devices, the MDVC callback from HPSM is the point of no return.", next: [{ to: "join" }], evidence: sdd("§TIBCO; §P4 Cancel Order Changes") },
    { id: "onboard", kind: "task", name: "Receive the SD-WAN onboarding ticket", lane: "mss", role: "field", etom: ETOM.service, detail: "SD-WAN configuration is Day-N; activation doesn't wait for it.", next: [{ to: "join" }], evidence: sdd("§P1 New Activation; General Highlights") },
    { id: "join", kind: "parallel", name: "All sub-orders fulfilled", lane: "cwom", next: [{ to: "bill" }], evidence: inferred("sdd", "§P1", "The join follows the summary order's master order.") },
    { id: "bill", kind: "task", name: "Start billing", lane: "bscs", role: "bill", etom: ETOM.billing, next: [{ to: "notify" }], evidence: ref("§3.1 step 12") },
    { id: "notify", kind: "task", name: "Send the order-completed SMS and email", lane: "cns", role: "notify", etom: ETOM.interface, detail: "Template-driven, in English or Arabic. RTF also triggers the order-submitted and order-completed emails.", next: [{ to: "close" }], evidence: ref("§3.1 step 14") },
    { id: "close", kind: "task", name: "Close the order and update the product inventory", lane: "cbcm", role: "record", etom: ETOM.order, detail: "With PSM catalogue codes.", next: [{ to: "end" }], evidence: ref("§3.1 step 15") },
    { id: "end", kind: "end", name: "Order closed", lane: "cbcm", next: [], evidence: ref("§3.1 step 15") },
  ];
  const integrations: Integration[] = [
    { id: "notify-creation", step: "announce", from: "rtf", to: "ibm-bpm", via: "tibco", operation: "NotifyOrderCreationRequest", purpose: "Open the order tracker. For BFM orders it carries No_Change items too.", style: "Not stated", mode: "not stated", tmf: "TMF622 Product Ordering (notification)", evidence: sdd("§BPM; §TIBCO") },
    { id: "evaluate-crmgw", step: "evaluate", from: "rtf", to: "cbcm", operation: "evaluateOrder", purpose: "Translate to the value order with PSM codes; check business rules.", style: "API", mode: "not stated", tmf: "TMF679 Product Offering Qualification", evidence: sdd("§P2 UpDowngrade (evaluteOrder with CRMGW & ECM)") },
    { id: "evaluate-ecm", step: "evaluate", from: "rtf", to: "ecm", operation: "evaluateOrder", purpose: "Check the order against the ECM product structure.", style: "API", mode: "not stated", evidence: sdd("§P2 UpDowngrade") },
    { id: "cwom-cart", step: "handoff", from: "rtf", to: "cwom", operation: "createShoppingCart / refreshShoppingCart", purpose: "Hand the summary order to CWOM; refresh carries forward devices and overrides amounts.", style: "API", mode: "not stated", tmf: "TMF622 Product Ordering", evidence: inferred("sdd", "§P1 Legacy Migration; §P2 UpDowngrade", "Named for migration and up/downgrade; the reference only says “CWOM format” for activation.") },
    { id: "ecm-validate", step: "accept", from: "cwom", to: "ecm", operation: "Catalogue validation", purpose: "Validate the order against the ECM catalogue.", style: "Not stated", mode: "not stated", evidence: ref("§3.1 step 8") },
    { id: "model-inquiry", step: "models", from: "cwom", to: "ecm", operation: "CPE Model Inquiry", purpose: "Return Model, SIC and List_of_Models for the CPE and, separately, for the FortiAP.", style: "API", mode: "sync", payload: "Platform, bandwidth", evidence: sdd("§P1.1 Generic FortiAP Offer") },
    { id: "service-order", step: "cpe", from: "cwom", to: "e2eso", operation: "Service order", purpose: "Provision the Fortinet HE CPE; site name and organisation name passed.", style: "API", mode: "not stated", tmf: "TMF641 Service Ordering", evidence: sdd("§P2 New Activation; IAD (annex not provided)") },
    { id: "serials", step: "cpe", from: "cwom", to: "e2eso", operation: "PATCH (CPE and FEX serials)", purpose: "Send the CPE serial and Forti Extender serial in one request.", style: "API", mode: "not stated", evidence: sdd("§P1.1 Revised Fortinet APIs (V5)") },
    { id: "adom", step: "vendor", from: "e2eso", to: "fortinet", operation: "Provision in ADOM; create organisation", purpose: "Register the CPE in the dedicated ADOM FortiManager cluster and the FortiPortal organisation.", style: "Not stated", mode: "not stated", evidence: sdd("§P1 New Activation") },
    { id: "work-order", step: "install", from: "cwom", to: "wfms", operation: "Work order", purpose: "Dispatch the installation.", style: "Not stated", mode: "async", evidence: ref("§3.1 step 12") },
    { id: "wfms-update", step: "install", from: "wfms", to: "cwom", operation: "Update transaction", purpose: "Return the CPE and AP SIC codes and serials.", style: "Not stated", mode: "not stated", evidence: sdd("§P1.1 Generic FortiAP Offer") },
    { id: "hss", step: "backup", from: "cwom", to: "veda", operation: "HSS activation", purpose: "Activate the Backup 5G profile (epsProfileId 5GNSA_BPRO5GBKP).", style: "Not stated", mode: "not stated", evidence: inferred("sdd", "§vEDA", "The SDD gives the profile in the cessation commands.") },
    { id: "veda-in", step: "backup", from: "veda", to: "in", operation: "IN commands", purpose: "Set up the Backup 5G subscriber in IN.", style: "Not stated", mode: "not stated", evidence: sdd("§vEDA") },
    { id: "veda-alepo", step: "backup", from: "veda", to: "alepo", operation: "Alepo commands", purpose: "As for DI/DPI.", style: "Not stated", mode: "not stated", evidence: sdd("§vEDA") },
    { id: "update-offer", step: "speed", from: "cwom", to: "in", operation: "updateOffer", purpose: "Apply the Backup 5G speed offer (862–874).", style: "API", mode: "not stated", evidence: inferred("sdd", "§P2 IN", "Stated for up/downgrade.") },
    { id: "saas-activate", step: "saas", from: "cwom", to: "xaas", operation: "Activate SaaS", purpose: "Activate the SaaS services in the bundle.", style: "Not stated", mode: "async", evidence: ref("§3.1 step 11") },
    { id: "saas-callback", step: "saas", from: "xaas", to: "cwom", operation: "Activation callback", purpose: "Confirms activation; the point of no return for the SaaS order.", style: "Callback", mode: "async", evidence: sdd("§P4 Cancel Order Changes") },
    { id: "shipment-order", step: "ship", from: "cwom", to: "itsm", operation: "ShipmentOrder", purpose: "Order the delivery of managed devices.", style: "API", mode: "not stated", evidence: sdd("§CWOM; §TIBCO") },
    { id: "shipment-confirmation", step: "ship", from: "itsm", to: "cwom", via: "tibco", operation: "ShipmentConfirmation → CWOM callback", purpose: "Device delivered.", style: "Callback", mode: "async", evidence: sdd("§TIBCO") },
    { id: "mss-ticket", step: "onboard", from: "cwom", to: "mss", operation: "Service onboarding ticket", purpose: "Pass the SD-WAN service to MSS for Day-N configuration.", style: "Ticket", mode: "async", evidence: { status: "gap", source: "sdd", where: "§P1 New Activation", note: "The ticketing system isn't named." } },
    { id: "billing", step: "bill", from: "cwom", to: "bscs", operation: "Billing", purpose: "Start billing for the fulfilled services.", style: "Not stated", mode: "not stated", evidence: ref("§3.1 step 12") },
    { id: "cns", step: "notify", from: "cwom", to: "cns", operation: "CNS notification API", purpose: "SMS or email from a template ID, language (EN/AR) and parameters.", style: "API", mode: "not stated", tmf: "TMF681 Communication", evidence: ref("§3.1 step 14") },
    { id: "rtf-emails", step: "notify", from: "rtf", to: "cns", operation: "Order submitted / completed emails", purpose: "Customer emails at submission and completion.", style: "Not stated", mode: "not stated", evidence: inferred("sdd", "§P2 UpDowngrade", "RTF triggers them; the sending system isn't named.") },
    { id: "closure", step: "close", from: "cwom", to: "cbcm", operation: "Order closure", purpose: "Update the product inventory with PSM codes.", style: "Not stated", mode: "not stated", tmf: "TMF637 Product Inventory", evidence: ref("§3.1 step 15") },
  ];
  return { steps, integrations };
}

function newActivationDigital(): Journey {
  const fulfilment = activationFulfilment("b2b-web");
  const steps: Step[] = [
    { id: "start", kind: "start", name: "Customer wants Business Pro Plus", lane: "customer", next: [{ to: "configure" }], evidence: ref("§3.1 step 1") },
    { id: "configure", kind: "task", name: "Browse and configure the bundle", lane: "b2b-web", role: "capture", etom: ETOM.selling, detail: "Offers come from the local BCC catalogue, configured for the new Business Pro Plus POs.", next: [{ to: "map" }], evidence: ref("§3.1 step 1") },
    { id: "map", kind: "task", name: "Map the offer to PSM package codes and the ECM structure", lane: "bcc", role: "catalog", etom: ETOM.selling, next: [{ to: "cart" }], evidence: ref("§3.1 step 2") },
    { id: "cart", kind: "task", name: "Add the bundle to the cart", lane: "b2b-web", role: "capture", etom: ETOM.selling, next: [{ to: "migrated" }], evidence: ref("§3.1 step 3") },
    { id: "migrated", kind: "exclusive", name: "Customer migrated to NC Digital?", lane: "b2b-web", next: [{ to: "crmgw", label: "No" }, { to: "nccrm", label: "Yes" }], evidence: ref("§3.1 step 4 branch") },
    { id: "crmgw", kind: "task", name: "Return customer, account and product data", lane: "cbcm", role: "customer-data", etom: ETOM.order, next: [{ to: "submit" }], evidence: ref("§3.1 step 4") },
    { id: "nccrm", kind: "task", name: "Return customer, organisation, contact and site data", lane: "nc-crm", role: "customer-data", etom: ETOM.order, detail: "Other entities still come from CRMGW.", next: [{ to: "submit" }], evidence: ref("§3.1 step 4 branch") },
    { id: "submit", kind: "task", name: "Submit the order with the summary-order flags", lane: "b2b-web", role: "capture", etom: ETOM.order, next: [{ to: "announce" }], evidence: sdd("§P1 New Activation (channels pass the Summary Order Flag)") },
    ...fulfilment.steps,
  ];
  const integrations: Integration[] = [
    { id: "catalogue", step: "configure", from: "b2b-web", to: "bcc", operation: "Offer catalogue", purpose: "Read the Business Pro Plus offers and components.", style: "Not stated", mode: "not stated", evidence: ref("§1 B2B Web; §3.1 step 1") },
    { id: "psm-codes", step: "map", from: "bcc", to: "psm", operation: "Package codes", purpose: "Map the offer to PSM package codes.", style: "Not stated", mode: "not stated", evidence: ref("§3.1 step 2") },
    { id: "ecm-structure", step: "map", from: "bcc", to: "ecm", operation: "Product structure", purpose: "Show bundle and component detail.", style: "Not stated", mode: "not stated", evidence: ref("§3.1 step 2") },
    { id: "crmgw-read", step: "crmgw", from: "b2b-web", to: "cbcm", operation: "CRM GW API", purpose: "Load customer, account and product data.", style: "API", mode: "sync", tmf: "TMF629 Customer · TMF637 Product Inventory", evidence: ref("§3.1 step 4") },
    { id: "nc-read", step: "nccrm", from: "b2b-web", to: "nc-crm", via: "tibco", operation: "TMF APIs (Customer, Organisation, Individual, Contact, Site)", purpose: "Load party data of a customer migrated to NC Digital.", style: "API", mode: "sync", tmf: "TMF632 Party Management · TMF629 Customer", evidence: ref("§3.1 step 4 branch") },
    { id: "submit-rtf", step: "submit", from: "b2b-web", to: "rtf", operation: "RTF order request", purpose: "Submit the order with SUMMARY_ORDER and DETAILED_ORDER request parameters.", style: "XML request", mode: "not stated", payload: "requestItems, requestParameters", tmf: "TMF622 Product Ordering", evidence: inferred("sdd", "§P1 New Activation; §NPS sample", "The XML shape is read from the SDD's request samples.") },
    ...fulfilment.integrations,
  ];
  return {
    id: "bpp-new-digital",
    offeringId: "business-pro-plus",
    orderType: "NEW",
    channels: ["b2b-web", "smb-app"],
    name: "New activation · B2B Web / SMB App",
    summary: "From the customer's own order in B2B Web or the SMB App to a closed order: RTF evaluates it, CWOM splits it into sub-orders and fulfils them in parallel.",
    steps,
    integrations,
    laneLabels: { "b2b-web": "B2B Web / SMB App" },
    trackingId: "order-tracking",
    notes: [
      { title: "Amendment and cancellation", detail: "Cancellation is allowed until the point of no return agreed in the workflows. There is no amendment from the SMB App.", evidence: sdd("§P1 Amendment/Cancellation; §P2") },
      { title: "Workflows not provided", detail: "The agreed workflows, the E2ESO technical proposal and the interface agreement are empty in the SDD's annex; the parallel fulfilment's order and the PONR are therefore partly unknown.", evidence: gap("SDD Annexure: “yet to be provided by Business Governance Team”.") },
    ],
  };
}

function newActivationAssisted(): Journey {
  const fulfilment = activationFulfilment("bcrm");
  const steps: Step[] = [
    { id: "start", kind: "start", name: "Customer asks for Business Pro Plus", lane: "customer", next: [{ to: "capture" }], evidence: sdd("§P1 Applicable Channels") },
    { id: "capture", kind: "task", name: "Capture the order from the bundle definition", lane: "bcrm", role: "capture", etom: ETOM.selling, detail: "The new PO-modelling flag in the bundle definition decides the summary-order flags.", next: [{ to: "account" }], evidence: sdd("§P1 Legacy Migration (as for SMB FW: Order to Delivery)") },
    { id: "account", kind: "task", name: "Return customer and account data", lane: "cbcm", role: "customer-data", etom: ETOM.order, next: [{ to: "submit" }], evidence: ref("§1 BCRM integrations") },
    { id: "submit", kind: "task", name: "Submit the order with the summary-order flags", lane: "bcrm", role: "capture", etom: ETOM.order, next: [{ to: "announce" }], evidence: sdd("§P1 New Activation") },
    ...fulfilment.steps,
  ];
  const integrations: Integration[] = [
    { id: "bcrm-account", step: "account", from: "bcrm", to: "cbcm", operation: "Customer and account", purpose: "Load the customer's account.", style: "Not stated", mode: "not stated", evidence: ref("§1 BCRM integrations") },
    { id: "submit-rtf", step: "submit", from: "bcrm", to: "rtf", operation: "RTF order request", purpose: "Submit the order with the summary-order flags.", style: "XML request", mode: "not stated", tmf: "TMF622 Product Ordering", evidence: inferred("sdd", "§P1 New Activation", "The XML shape is read from the SDD's request samples.") },
    ...fulfilment.integrations,
  ];
  return {
    id: "bpp-new-bcrm",
    offeringId: "business-pro-plus",
    orderType: "NEW",
    channels: ["bcrm"],
    name: "New activation · BCRM",
    summary: "An agent captures the order in BCRM; from submission it follows the same fulfilment as the digital journey.",
    steps,
    integrations,
    trackingId: "order-tracking",
    notes: [
      { title: "Amendment", detail: "BCRM loads the complete basket from CRMGW, updates the impacted items and passes the extSubscriptionId to RTF. Upselling (add IP phone) from WFMS/CPP is supported.", evidence: sdd("§P1 Legacy Migration, Amendment") },
    ],
  };
}

function upDowngrade(): Journey {
  const steps: Step[] = [
    { id: "start", kind: "start", name: "Customer asks to change plan", lane: "customer", next: [{ to: "retrieve" }], evidence: sdd("§P2 ADO 81197") },
    { id: "retrieve", kind: "task", name: "Retrieve the account and check the bundle model", lane: "bcrm", role: "capture", etom: ETOM.order, detail: "If NEW_BUNDLE_MODEL is true, the summary-order attributes are added.", next: [{ to: "evaluate-change" }], evidence: sdd("§P2 ADO 81197") },
    { id: "evaluate-change", kind: "task", name: "Work out the items to add and remove", lane: "bcrm", role: "capture", etom: ETOM.order, detail: "The SMB App calls CRMGW's OrderEvaluate for toBeAddedItems and toBeDeletedItems; BCRM uses its existing logic.", next: [{ to: "submit" }], evidence: sdd("§P2 ADO 81197") },
    { id: "submit", kind: "task", name: "Submit UPDOWNGRD", lane: "bcrm", role: "capture", etom: ETOM.order, detail: "processCode PRSU0001: target bundle ADD, source bundle REMOVE, changed components and add-ons, ACTION_CHARGE_CODE AC_UPDOWNGRD_F.", next: [{ to: "announce" }], evidence: sdd("§P2 ADO 81197, request mapping") },
    { id: "announce", kind: "task", name: "Announce the order for tracking", lane: "rtf", role: "track", etom: ETOM.order, detail: "No_Change items included for BFM orders.", next: [{ to: "load" }], evidence: sdd("§BPM; §TIBCO ADO 81961") },
    { id: "load", kind: "task", name: "Load the basket from the CRMGW registry", lane: "rtf", role: "orchestrate", etom: ETOM.order, next: [{ to: "evaluate" }], evidence: sdd("§P2 ADO 81197") },
    { id: "evaluate", kind: "task", name: "Evaluate the order", lane: "rtf", role: "validate", etom: ETOM.order, next: [{ to: "cart" }], evidence: sdd("§P2 ADO 81197") },
    { id: "cart", kind: "task", name: "Create and refresh the CWOM cart", lane: "rtf", role: "orchestrate", etom: ETOM.order, detail: "Carry forward devices and override amounts in refreshShoppingCart.", next: [{ to: "fulfil" }], evidence: sdd("§P2 ADO 81197") },
    { id: "fulfil", kind: "task", name: "Fulfil as a summary order, per workflow", lane: "cwom", role: "orchestrate", etom: ETOM.service, detail: "Workflows WF-1 to WF-7 by from/to bundle.", next: [{ to: "backup" }], evidence: sdd("§P2 ADO 81197") },
    { id: "backup", kind: "exclusive", name: "Backup 5G in the source and target?", lane: "cwom", next: [{ to: "speed", label: "In both" }, { to: "activate", label: "Target only" }, { to: "remove", label: "Source only" }, { to: "device", label: "Neither" }], evidence: sdd("§P2 IN") },
    { id: "speed", kind: "task", name: "Update the Backup 5G speed offer", lane: "in", role: "activate", etom: ETOM.resource, next: [{ to: "device" }], evidence: sdd("§P2 IN") },
    { id: "activate", kind: "task", name: "Activate Backup 5G", lane: "veda", role: "activate", etom: ETOM.resource, detail: "Then IN applies the speed offer, as in activation.", next: [{ to: "device" }], evidence: sdd("§P2 IN") },
    { id: "remove", kind: "task", name: "Remove the Backup 5G accounts", lane: "veda", role: "activate", etom: ETOM.resource, next: [{ to: "device" }], evidence: sdd("§P2 IN") },
    { id: "device", kind: "task", name: "Change the CPE service and devices, per workflow", lane: "e2eso", role: "activate", etom: ETOM.service, detail: "With a device change from P3 (ADO 81961).", next: [{ to: "notify" }], evidence: sdd("§P3 ADO 81961") },
    { id: "notify", kind: "task", name: "Send the order submitted and completed emails", lane: "cns", role: "notify", etom: ETOM.interface, next: [{ to: "end" }], evidence: inferred("sdd", "§P2 ADO 81197", "RTF triggers them; the sending system isn't named.") },
    { id: "end", kind: "end", name: "Plan changed", lane: "cbcm", next: [], evidence: inferred("ref", "§3.1 step 15", "Closure as for activation.") },
  ];
  const integrations: Integration[] = [
    { id: "retrieve-account", step: "retrieve", from: "bcrm", to: "cbcm", operation: "retrieveAccount", purpose: "Read the subscription and its NEW_BUNDLE_MODEL attribute.", style: "API", mode: "sync", tmf: "TMF637 Product Inventory", evidence: sdd("§P2 ADO 81197") },
    { id: "order-evaluate", step: "evaluate-change", from: "bcrm", to: "cbcm", operation: "OrderEvaluate", purpose: "toBeAddedItems (ADDSRVICE) and toBeDeletedItems (DELETESRV), with ECM_SUBSCRIPTION_ID.", style: "API", mode: "sync", payload: "order.orderItems[].type.code = UPDOWNGRD", evidence: sdd("§P2 ADO 81197 (SMB App)") },
    { id: "submit-rtf", step: "submit", from: "bcrm", to: "rtf", operation: "RTF order request (UPDOWNGRD)", purpose: "Submit the change with the summary-order attributes.", style: "XML request", mode: "not stated", payload: "/request/processCode PRSU0001, /request/operation UPDOWNGRD", tmf: "TMF622 Product Ordering", evidence: sdd("§P2 ADO 81197, request mapping") },
    { id: "notify-creation", step: "announce", from: "rtf", to: "ibm-bpm", via: "tibco", operation: "NotifyOrderCreationRequest", purpose: "Track the order; No_Change items included.", style: "Not stated", mode: "not stated", evidence: sdd("§TIBCO ADO 81961") },
    { id: "load-registry", step: "load", from: "rtf", to: "cbcm", operation: "Load registry basket", purpose: "Load the customer's basket from the CRMGW registry.", style: "Not stated", mode: "not stated", evidence: sdd("§P2 ADO 81197") },
    { id: "evaluate-crmgw", step: "evaluate", from: "rtf", to: "cbcm", operation: "evaluateOrder", purpose: "Evaluate with CRMGW.", style: "API", mode: "not stated", evidence: sdd("§P2 ADO 81197") },
    { id: "evaluate-ecm", step: "evaluate", from: "rtf", to: "ecm", operation: "evaluateOrder", purpose: "Evaluate with ECM.", style: "API", mode: "not stated", evidence: sdd("§P2 ADO 81197") },
    { id: "create-cart", step: "cart", from: "rtf", to: "cwom", operation: "createShoppingCart", purpose: "Pass the whole loaded basket.", style: "API", mode: "not stated", tmf: "TMF622 Product Ordering", evidence: sdd("§P2 ADO 81197") },
    { id: "refresh-cart", step: "cart", from: "rtf", to: "cwom", operation: "refreshShoppingCart", purpose: "Carry forward devices; override amounts (CWOM enriches the charges).", style: "API", mode: "not stated", evidence: sdd("§P2 ADO 81197") },
    { id: "update-offer", step: "speed", from: "cwom", to: "in", operation: "updateOffer", purpose: "New bandwidth for the Backup 5G service (offers 862–874).", style: "API", mode: "not stated", evidence: sdd("§P2 IN") },
    { id: "veda-activate", step: "activate", from: "cwom", to: "veda", operation: "HSS activation", purpose: "Activate Backup 5G, as in activation.", style: "Not stated", mode: "not stated", evidence: sdd("§P2 IN") },
    { id: "veda-remove", step: "remove", from: "cwom", to: "veda", operation: "Delete Backup 5G accounts", purpose: "As for DI/DPI.", style: "Not stated", mode: "not stated", evidence: sdd("§P2 IN") },
    { id: "service-change", step: "device", from: "cwom", to: "e2eso", operation: "Service order", purpose: "Change the CPE service per workflow and technical proposal.", style: "Not stated", mode: "not stated", tmf: "TMF641 Service Ordering", evidence: sdd("§P2; §P3 ADO 81961") },
    { id: "rtf-emails", step: "notify", from: "rtf", to: "cns", operation: "Order submitted / completed emails", purpose: "As for new activation.", style: "Not stated", mode: "not stated", evidence: inferred("sdd", "§P2 ADO 81197", "The sending system isn't named.") },
  ];
  return {
    id: "bpp-updowngrd",
    offeringId: "business-pro-plus",
    orderType: "UPDOWNGRD",
    channels: ["bcrm", "smb-app"],
    name: "Upgrade / downgrade · BCRM / SMB App",
    summary: "A plan change as a summary order: RTF loads the basket from CRMGW, CWOM fulfils it per workflow, and Backup 5G follows four branches.",
    steps,
    integrations,
    laneLabels: { bcrm: "BCRM / SMB App" },
    trackingId: "order-tracking",
    notes: [
      { title: "From/to paths", detail: "28 paths across Business Pro Plus (with and without 5G), Office Presence (with and without connectivity), Business ON and Business Pro; P3 adds the device-change paths.", evidence: sdd("Scope; §P2; §P3") },
      { title: "No amendment from the SMB App", detail: "Order amendment applies to BCRM only.", evidence: sdd("§P2 ADO 81197, Amendment") },
      { title: "One-time data migration", detail: "Replica offers with the new modelling in ECM and PSM; customer accounts in CRMGW and the CWOM registry updated to match.", evidence: sdd("§P2 One-Time Data Migration Activity") },
    ],
  };
}

export const JOURNEYS: Journey[] = [newActivationDigital(), newActivationAssisted(), upDowngrade()];

export const TRACKING: TrackingFlow[] = [
  {
    id: "order-tracking",
    name: "Order tracking",
    summary: "What happens inside when an order is created and when the customer or the back office opens its tracker: RTF announces it, CWOM publishes milestones per sub-order through TIBCO to BPM, and channels read them back.",
    participants: ["b2b-web", "rtf", "tibco", "ibm-bpm", "felix", "cwom", "itsm"],
    messages: [
      { id: "t1", step: "", from: "b2b-web", to: "rtf", operation: "Submit order (SR)", purpose: "The channel submits the order.", style: "XML request", mode: "not stated", evidence: ref("§3.1 step 5") },
      { id: "t2", step: "", from: "rtf", to: "tibco", operation: "NotifyOrderCreationRequest", purpose: "Order and its items; BFM orders include No_Change items.", style: "Not stated", mode: "not stated", evidence: sdd("§TIBCO; §BPM") },
      { id: "t3", step: "", from: "tibco", to: "ibm-bpm", operation: "Create the tracker", purpose: "isBFMOrder, mergeOrderItems (GSM and GPON items of a BFM primary package).", style: "Not stated", mode: "not stated", evidence: sdd("§BPM") },
      { id: "t4", step: "", from: "cwom", to: "tibco", operation: "Milestone (per sub-order)", purpose: "CWOM publishes the AS-IS milestones of each sub-order.", style: "Event / message", mode: "async", evidence: sdd("§TIBCO (TIBCO follows the M/S approach)") },
      { id: "t5", step: "", from: "tibco", to: "ibm-bpm", operation: "Update milestones", purpose: "BPM records the milestone against the order item.", style: "Not stated", mode: "async", evidence: sdd("§BPM") },
      { id: "t6", step: "", from: "ibm-bpm", to: "felix", operation: "Store (felix / getRealTimeOrderDetails SP)", purpose: "Milestones kept for the real-time read.", style: "Database", mode: "not stated", evidence: inferred("sdd", "§BPM General Note", "The SDD names “the felix / getRealTimeOrderDetails SP”.") },
      { id: "t7", step: "", from: "cwom", to: "itsm", operation: "ShipmentOrder", purpose: "Device delivery.", style: "API", mode: "not stated", evidence: sdd("§TIBCO") },
      { id: "t8", step: "", from: "itsm", to: "tibco", operation: "ShipmentConfirmation", purpose: "HPSM confirms the delivery.", style: "Callback", mode: "async", evidence: sdd("§TIBCO") },
      { id: "t9", step: "", from: "tibco", to: "cwom", operation: "CWOM callback", purpose: "Device delivered.", style: "Callback", mode: "async", evidence: sdd("§TIBCO") },
      { id: "t10", step: "", from: "b2b-web", to: "tibco", operation: "getRealTimeOrderDetails", purpose: "The customer (B2B, SMB App) or the back office opens the tracker.", style: "API", mode: "sync", tmf: "TMF622 Product Ordering (GET)", evidence: sdd("§TIBCO; US 2367, 44387, 2380") },
      { id: "t11", step: "", from: "tibco", to: "felix", operation: "Read order and milestones", purpose: "Through the getRealTimeOrderDetails SP.", style: "Database", mode: "sync", evidence: inferred("sdd", "§BPM General Note", "Read path inferred from the SP's name.") },
      { id: "t12", step: "", from: "tibco", to: "b2b-web", operation: "Order status per basket item", purpose: "Milestones shown on the tracking page.", style: "API", mode: "sync", evidence: ref("§3.1 step 10") },
    ],
    milestones: [
      { name: "Order created", producer: "rtf", detail: "RTF's NotifyOrderCreationRequest opens the tracker.", evidence: sdd("§BPM") },
      { name: "Sub-order milestones", producer: "cwom", detail: "The AS-IS New Activation milestones, per sub-order (GPON, GSM, SaaS, vSaaS); also posted for lifecycle orders.", evidence: sdd("§BPM; §TIBCO") },
      { name: "Device delivered", producer: "itsm", detail: "HPSM's shipment confirmation.", evidence: sdd("§TIBCO") },
    ],
    correlation: [
      { title: "Digital orders", detail: "Digital Order ID ↔ CWOM Order ID, per basket item.", evidence: ref("§3.1 step 10") },
      { title: "BCRM orders", detail: "BCRM Order ID ↔ CWOM Order ID.", evidence: ref("§3.1 step 10") },
    ],
    knownIssues: [
      { title: "Stale or incomplete status", detail: "Tracking can show a stale status if CWOM fails to send a milestone or it isn't captured.", evidence: ref("§5 Known Issues") },
      { title: "Deleted items aren't tracked", detail: "BPM doesn't track order items with type DELETE on MIGRATE or UPDOWNGRD orders.", evidence: sdd("§BPM General Note") },
      { title: "Milestone names", detail: "Neither source lists the milestone names; the SDD refers to the AS-IS New Activation milestones.", evidence: gap("Milestone dictionary not in the sources.") },
    ],
  },
];

export const FINDINGS: Finding[] = [
  { id: "F1", kind: "conflict", title: "How milestones reach tracking", detail: "The reference says CWOM writes a milestone table and a database trigger feeds Felix. The SDD says CWOM publishes milestones per sub-order through TIBCO to BPM, after RTF's NotifyOrderCreationRequest. This catalogue follows the SDD.", sources: [ref("§3.1 step 9"), sdd("§BPM; §TIBCO")] },
  { id: "F2", kind: "conflict", title: "IBM BPM and Felix overlap", detail: "Both are described as holding order milestones for tracking. The SDD reads them as BPM using a Felix stored procedure.", sources: [ref("§1 IBM BPM, Felix"), sdd("§BPM General Note")] },
  { id: "F3", kind: "gap", title: "RTF → CWOM call for new activation", detail: "The reference says only “CWOM format”. The SDD names createShoppingCart and refreshShoppingCart for migration and up/downgrade.", sources: [ref("§3.1 step 7"), sdd("§P1 Legacy Migration")] },
  { id: "F4", kind: "gap", title: "Workflows and points of no return", detail: "The SDD's workflow annex (WF-1 to WF-7) and PONR definitions are “yet to be provided”.", sources: [sdd("Annexure: Workflows")] },
  { id: "F5", kind: "gap", title: "E2ESO technical proposal and interface agreement", detail: "Both annexes are empty, so the CWOM ↔ E2ESO calls are known by purpose only.", sources: [sdd("Annexure: E2ESO TP, IAD")] },
  { id: "F6", kind: "gap", title: "Integration style and timing", detail: "Most calls don't say whether they are REST, SOAP or messages, or whether they are synchronous.", sources: [sdd("Throughout")] },
  { id: "F7", kind: "gap", title: "Plan prices", detail: "Neither source states the plans' prices. The only amount is the 90G/120G CPE exit charge, AED 650, to be confirmed.", sources: [sdd("§ADO 438907")] },
  { id: "F8", kind: "gap", title: "Device codes", detail: "SIC codes and some models of the 90G, 120G and FortiAP are TBD.", sources: [sdd("§P1 Catalog Modelling")] },
  { id: "F9", kind: "gap", title: "Milestone names", detail: "No milestone dictionary in either source.", sources: [sdd("§BPM")] },
  { id: "F10", kind: "gap", title: "MSS ticketing system", detail: "The system that carries the SD-WAN onboarding ticket isn't named.", sources: [sdd("§P1 New Activation")] },
  { id: "F11", kind: "undefined", title: "Names used but not defined", detail: "CPP, ODS (DWH), Bid Mgmt, PM tool and “Billing” are named as integrations but not described as systems.", sources: [ref("§1; §5")] },
  { id: "F12", kind: "undefined", title: "Who starts dunning", detail: "The SDD details the fulfilment of TOSS, reconnect and CESSNP but not the system that raises them.", sources: [sdd("§P3 ADO 259162")] },
  { id: "F13", kind: "conflict", title: "Names that differ between sources", detail: "eVEDA / vEDA, WFM / WFMS, B2B Web / B2B, CBCM / CRMGW. Treated as aliases of one system.", sources: [ref("§1; §6"), sdd("Stakeholders")] },
  { id: "F14", kind: "conflict", title: "Section references", detail: "The reference's rules point to Section 4 for process flows; they are in Section 3.", sources: [ref("§0 Rules")] },
  { id: "F15", kind: "conflict", title: "SDD version", detail: "The cover says version 2.2; the revision history goes to 2.3 (11/09/2026), and 2.2's date is incomplete.", sources: [sdd("Cover; Revision History")] },
];

export function journeysFor(offeringId: string, orderType?: string | null, channel?: string | null): Journey[] {
  return JOURNEYS.filter(
    (journey) =>
      journey.offeringId === offeringId &&
      (!orderType || journey.orderType === orderType) &&
      (!channel || journey.channels.includes(channel)),
  );
}

export function journeyById(id: string | undefined): Journey | undefined {
  return JOURNEYS.find((journey) => journey.id === id);
}
