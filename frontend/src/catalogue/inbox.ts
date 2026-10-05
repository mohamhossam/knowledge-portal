/**
 * The inbox of change requests from Requirement AI (requirement-portal ADR-0101, step 7):
 * reading it, and saying where a change request comes from.
 */
import { useQuery } from "@tanstack/react-query";

import { api, type ChangeRequest } from "../api/client";
import { formatDay } from "../home/format";

type Trace = ChangeRequest["trace"];

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

