/**
 * Journeys for the diagrams' tests: the explorer's Business Pro Plus activation,
 * and a fuller one shaped like the SMB reference's (a decision, a loop back for
 * correction, sub-orders in parallel that rejoin at billing), given only as
 * flow rules, as a draft carries it before the service derives its edges.
 */
import type { Journey } from "../../api/client";
import { EXPLORED } from "../../explorer/fixtures";

export const ACTIVATION = EXPLORED.journeys![0] as unknown as Journey;

const step = (number: string, name: string, extra: object = {}) => ({
  number, name, supporting_system_ids: [], component_ids: [], channels: [], channel_entry: false, ...extra,
});

export const SYSTEMS: Record<string, string> = {
  web: "B2B Web", rtf: "RTF", cwom: "CWOM", e2eso: "E2ESO", wfms: "WFMS", bscs: "BSCS", cbcm: "CBCM", ecm: "ECM", cns: "CNS",
};

export const ORDERING = {
  id: "bpp-full",
  name: "Business Pro Plus new activation, in full",
  product_id: "bpp",
  order_type_code: "NEW",
  activities: [
    step("300", "Submit the order", { channel_entry: true, phase: "Capture", customer_visible: true }),
    step("320", "Build the value order and evaluate it", { performing_system_id: "rtf", phase: "Validate" }),
    step("330", "Order returned for correction", { phase: "Validate", customer_visible: true }),
    step("340", "Hand the order to CWOM", { performing_system_id: "rtf", phase: "Validate", point_of_no_return: "Past this step, the order can no longer be cancelled." }),
    step("370", "Split into sub-orders", { performing_system_id: "cwom", supporting_system_ids: ["ecm"], phase: "Orchestrate", confidence: "inferred" }),
    step("380", "Provision the CPE", { performing_system_id: "e2eso", phase: "Fulfil", track: "CPE" }),
    step("400", "Install the CPE and FortiAP", { performing_system_id: "wfms", phase: "Fulfil", track: "Install" }),
    step("460", "Start billing", { performing_system_id: "bscs", phase: "Bill and close" }),
    step("470", "Send the order-completed SMS and email", { performing_system_id: "cns", phase: "Bill and close", customer_visible: true }),
    step("480", "Close the order and update the product inventory", { performing_system_id: "cbcm", phase: "Bill and close" }),
  ],
  flow_rules: [
    { kind: "decision", from_activity: "320", to_activity: "340", condition: "Passes evaluation" },
    { kind: "decision", from_activity: "320", to_activity: "330", condition: "Rejected" },
    { kind: "loop", from_activity: "330", to_activity: "300", condition: "Correct and resubmit" },
    { kind: "parallel", from_activity: "370", to_activity: "380", parallel_group: "sub-orders", rejoin_at: "460" },
    { kind: "parallel", from_activity: "370", to_activity: "400", parallel_group: "sub-orders", rejoin_at: "460" },
  ],
  integrations: [
    { from_activity: "300", to_activity: "320", interaction: "Order submission", interface: "RTF Submit Order", timing: "Sync", open_api_ids: [] },
    { from_activity: "340", to_activity: "370", interaction: "Service order", interface: "CWOM SO", timing: "Async", open_api_ids: [] },
  ],
  edges: [],
} as unknown as Journey;

/** No phases and no flow: a journey as a first extraction leaves it. */
export const BARE = {
  id: "bare",
  name: "Disconnect",
  activities: [
    step("10", "Request the disconnection", { channel_entry: true }),
    step("20", "Stop the service", { performing_system_id: "cwom" }),
    step("30", "Collect the router"),
  ],
  flow_rules: [],
  integrations: [],
  edges: [],
} as unknown as Journey;
