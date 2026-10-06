import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type ConfirmReview, type Reminders } from "../api/client";
import { REMINDERS_KEY, REVIEW_READS, SYSTEM_REVIEWS_KEY } from "./review";

export const MAINTAINER = "knowledge_maintainer";

/** Every system of the version in service, and where its review stands. */
export function useSystemStandings(enabled = true) {
  return useQuery({ queryKey: SYSTEM_REVIEWS_KEY, queryFn: api.systemReviews, enabled });
}

/** Confirming systems of the version in service; every review read is refreshed after it. */
export function useConfirmSystems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ systemIds, body }: { systemIds: string[] | null; body: ConfirmReview }) =>
      api.confirmSystemReviews(systemIds, body),
    onSuccess: () => Promise.all(REVIEW_READS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

/** Who answers for what, kept current while the page is open. */
export function useReminders() {
  return useQuery({ queryKey: REMINDERS_KEY, queryFn: api.reminders, refetchInterval: 5 * 60_000 });
}

/** "2 overdue and 1 due within two weeks". */
export function tally(reminders: Pick<Reminders, "overdue" | "due_soon">): string {
  const parts = [
    reminders.overdue > 0 ? `${reminders.overdue} overdue` : "",
    reminders.due_soon > 0 ? `${reminders.due_soon} due within two weeks` : "",
  ].filter(Boolean);
  return parts.join(" and ");
}
