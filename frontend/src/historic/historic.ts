import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type HistoricBreakdown,
  type HistoricDetail,
  type HistoricSharedRoot,
  type HistoricStatus,
  type HistoricSummary,
  type HistoricWorkItem,
  type LineageNode,
} from "../api/client";
import { count } from "../home/format";
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

/**
 * Its roots and suggested ids that other historic Requirements already hold as roots, by id.
 * One Epic can serve two BRDs, so this is said beside the id, never refused (ADR-0102).
 */
export function useSharedRoots(record: HistoricDetail) {
  const query = useQuery({
    queryKey: [...historicKey(record.id), "shared-roots", record.version],
    queryFn: () => api.historicSharedRoots(record.id),
    enabled: record.root_ids.length > 0 || record.suggestions.length > 0,
  });
  const byId = new Map<number, HistoricSharedRoot[]>();
  for (const item of query.data?.items ?? []) byId.set(item.work_item_id, [...(byId.get(item.work_item_id) ?? []), item]);
  return byId;
}

/**
 * The Requirements whose prior art cites it, from requirement work: who and when, never what
 * was matched (ADR-0102 Amendment 1). Only a record that was ever published can be cited.
 */
export function useCitedBy(record: Pick<HistoricDetail, "id" | "publications">) {
  return useInfiniteQuery({
    queryKey: [...historicKey(record.id), "cited-by"],
    queryFn: ({ pageParam }) => api.historicCitedBy(record.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    enabled: record.publications.length > 0,
  });
}

/** How many Requirements cite it, in words; a dash when requirement work could not say. */
export function citedBy(citations: number | null | undefined): string {
  if (citations === null || citations === undefined) return "—";
  return citations === 0 ? "None" : count(citations, "requirement");
}

/** Every work item of a breakdown's lineage, by id. */
export function itemsOf(breakdown: HistoricBreakdown | null | undefined): Map<number, HistoricWorkItem> {
  const items = new Map<number, HistoricWorkItem>();
  const walk = (nodes: LineageNode[]) => nodes.forEach((node) => { items.set(node.item.id, node.item); walk(node.children); });
  walk(breakdown?.lineage ?? []);
  return items;
}

/** The one decision a record waits on, said in its head and anchored to its section; or none. */
export function nextStep(record: HistoricDetail): { target: string; label: string } | null {
  const pending = record.pending_refresh;
  if (pending) {
    return {
      target: "historic-refresh",
      label: pending.changes.length > 0
        ? `A newer read from Azure DevOps is waiting: ${count(pending.changes.length, "work item")} changed`
        : "A newer read from Azure DevOps is waiting, with nothing changed",
    };
  }
  if (record.status !== "draft" || busy(record)) return null;
  if (record.brds_failed > 0) return { target: "historic-brds", label: "A BRD could not be read: read it again" };
  if (record.run?.status === "failed") return { target: "historic-work-items", label: "Read the breakdown again" };
  if (!record.breakdown) return { target: "historic-work-items", label: "Link its work items" };
  return record.blockers.length === 0
    ? { target: "historic-publish", label: "Publish it as reference knowledge" }
    : { target: "historic-publish", label: "See what publishing waits on" };
}

export const STATUS_WORDS: Record<HistoricStatus, string> = { draft: "draft", published: "published", withdrawn: "withdrawn" };

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
