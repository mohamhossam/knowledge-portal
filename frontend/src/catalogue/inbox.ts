/**
 * The inbox of change requests from Requirement AI (requirement-portal ADR-0101, step 7):
 * reading it, and saying where a change request comes from. A closed Epic's catalogue change
 * (ontology plan Phase 7) says what it delivered and how that compares with the prediction.
 */
import { useQuery } from "@tanstack/react-query";

import { api, type ChangeRequest } from "../api/client";
import { formatDay } from "../home/format";

type Trace = ChangeRequest["trace"];
export type Delivery = NonNullable<ChangeRequest["delivery"]>;

export const CHANGE_REQUESTS_KEY = ["architecture", "change-requests"] as const;

export function useChangeRequests() {
  return useQuery({ queryKey: CHANGE_REQUESTS_KEY, queryFn: api.changeRequests });
}

/** "REQ-2026-0412, revision 3, approved by Layla Haddad on 3 Oct 2026". */
export function traceLine(trace: Trace): string {
  const approved = [trace.approved_by && `by ${trace.approved_by}`, trace.approved_at && `on ${formatDay(trace.approved_at)}`]
    .filter(Boolean)
    .join(" ");
  return `${trace.requirement_id}, revision ${trace.breakdown_revision}${approved ? `, approved ${approved}` : ""}`;
}


/** "Epic 4711 closed on 20 Oct 2026". */
export function closedLine(delivery: Delivery): string {
  return `Epic ${delivery.epic_external_id} closed on ${formatDay(delivery.closed_at)}`;
}

/** "BCRM realises Static IP", "Business Fiber offers Static IP". */
export function deliveredChangeSentence(change: Delivery["changes"][number]): string {
  return change.op === "realise_concept"
    ? `${change.system_name ?? change.system_id ?? ""} realises ${change.concept_label}`
    : `${change.offering_name ?? change.offering_id ?? ""} offers ${change.concept_label}`;
}

/**
 * How the systems delivered compare with those the product impact predicted: "Delivered 1 of
 * the 2 systems predicted (CIM was not), and 1 not predicted (Provisioning)."
 */
export function hitLine(delivery: Delivery, systemName: (id: string) => string): string {
  const { hits, predicted } = delivery;
  const besides = hits.unpredicted.length
    ? `${hits.unpredicted.length} not predicted (${hits.unpredicted.map(systemName).join(", ")})`
    : "";
  if (!predicted.length) return besides ? `Delivered ${besides}.` : "No systems were predicted.";
  const missed = hits.undelivered.length
    ? ` (${hits.undelivered.map(systemName).join(", ")} ${hits.undelivered.length === 1 ? "was" : "were"} not)`
    : "";
  return `Delivered ${hits.predicted.length} of the ${predicted.length} system${predicted.length === 1 ? "" : "s"} predicted${missed}${
    besides ? `, and ${besides}` : ""}.`;
}
