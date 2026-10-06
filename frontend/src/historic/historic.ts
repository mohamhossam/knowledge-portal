import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type HistoricDetail, type HistoricStatus, type HistoricSummary } from "../api/client";
import { HISTORIC_PATH } from "../requirements/knowledge";
import type { Rank } from "../timetable/TimetableTable";

/** Historic Requirements live on Table 4, beside the corpus they will join (ADR-0102). */
export { HISTORIC_PATH };
export const historicHref = (id: string) => `${HISTORIC_PATH}/${encodeURIComponent(id)}`;

export const historicKey = (id: string) => ["historic", "record", id] as const;
export const HISTORIC_LIST_KEY = ["historic", "list"] as const;

export function useHistoricList(status: HistoricStatus | null, query: string) {
  return useInfiniteQuery({
    queryKey: [...HISTORIC_LIST_KEY, status, query],
    queryFn: ({ pageParam }) => api.historicList({ status: status ?? undefined, query, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
}

/** Whether something is being read for it right now: its BRDs, or its breakdown. */
export function busy(record: Pick<HistoricSummary, "brds_reading" | "run_status">): boolean {
  return record.brds_reading > 0 || record.run_status === "queued" || record.run_status === "running";
}

/** One historic Requirement, kept current while its BRDs or breakdown are being read. */
export function useHistoric(id: string) {
  return useQuery({
    queryKey: historicKey(id),
    queryFn: () => api.historic(id),
    refetchInterval: (state) => (state.state.data && busy(state.state.data) ? 1500 : false),
  });
}

/** A change to it: answered with the whole record, which replaces the cached one. */
export function useHistoricChange<Input>(id: string, run: (input: Input) => Promise<HistoricDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (record) => {
      queryClient.setQueryData(historicKey(id), record);
      void queryClient.invalidateQueries({ queryKey: HISTORIC_LIST_KEY });
    },
  });
}

/** Where a historic Requirement stands, as one row: its rank and its state, in words. */
export function standing(item: HistoricSummary): { rank: Rank; status: string; detail?: string } {
  if (item.status === "withdrawn") return { rank: "past", status: "Withdrawn" };
  if (item.status === "published") {
    return item.refresh_waiting
      ? { rank: "due", status: "Refresh waiting", detail: "Accept or discard what changed in Azure DevOps." }
      : { rank: "service", status: "Published" };
  }
  if (item.brds_failed > 0) return { rank: "delayed", status: "A BRD could not be read" };
  if (item.run_status === "failed") {
    return { rank: "delayed", status: "Breakdown not read", detail: runFailure(item.run_failure) };
  }
  if (item.brds_reading > 0) return { rank: "running", status: "Reading its BRD" };
  if (item.run_status === "queued" || item.run_status === "running") {
    return { rank: "running", status: "Reading the breakdown" };
  }
  if (item.work_items === 0) return { rank: "due", status: "Link its work items" };
  return { rank: "due", status: "Ready to publish" };
}

const RUN_FAILURE: Record<string, string> = {
  ado_not_configured: "No Azure DevOps connection is configured. An administrator sets one up.",
  ado_unavailable: "Azure DevOps did not answer. Read it again later.",
};

export function runFailure(code: string | null | undefined): string {
  return (code && RUN_FAILURE[code]) ?? "The breakdown could not be read. Read it again.";
}

export const TYPE_WORDS: Record<string, string> = { epic: "Epic", feature: "Feature", user_story: "User Story" };

export const PROBLEM_WORDS: Record<string, string> = {
  not_found: "Not found in Azure DevOps",
  not_permitted: "Not readable with the import's access",
  unsupported_type: "Not an Epic, Feature or User Story",
  over_limit: "Beyond the import's limit",
};

export const FIELD_WORDS: Record<string, string> = {
  title: "title",
  state: "state",
  description: "description",
  acceptance_criteria: "acceptance criteria",
  area_path: "area",
  iteration_path: "iteration",
  tags: "tags",
  parent_id: "parent",
  child_ids: "children",
  type: "type",
};

/** "48213, 48300" or "48213 48300" or "#48213": the ids a curator typed, in order, once each. */
export function parseIds(text: string): { ids: number[]; invalid: string[] } {
  const ids: number[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/).map((part) => part.replace(/^#/, "")).filter(Boolean)) {
    const value = Number(token);
    if (!/^\d+$/.test(token) || value < 1 || value > 2_147_483_647) invalid.push(token);
    else if (!ids.includes(value)) ids.push(value);
  }
  return { ids, invalid };
}
