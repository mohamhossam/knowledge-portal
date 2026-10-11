import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";
import { requirementWorkHref } from "../auth/paths";

export const KNOWLEDGE_PATH = "/requirement-knowledge";
export const REQUIREMENTS_PATH = `${KNOWLEDGE_PATH}/requirements`;
export const FINDINGS_PATH = `${KNOWLEDGE_PATH}/findings`;
/** Old BRDs with their Azure DevOps lineage, as reference knowledge (Knowledge Center E). */
export const HISTORIC_PATH = `${KNOWLEDGE_PATH}/historic`;

/** A requirement's record on the workbench, keeping the list's filters. */
export const requirementHref = (requirementId: string, search = "") =>
  `${REQUIREMENTS_PATH}/${encodeURIComponent(requirementId)}${search}`;
/** A finding's record on the workbench, keeping the list's filters. */
export const findingHref = (findingId: string, search = "") => `${FINDINGS_PATH}/${encodeURIComponent(findingId)}${search}`;

export const CORPUS_KEY = ["knowledge-center", "requirement-corpus"] as const;

/** Requirement work's corpus in counts; its counts label the filters and the area's head. */
export function useCorpusSummary() {
  return useQuery({ queryKey: CORPUS_KEY, queryFn: api.requirementCorpus });
}

/** How many historic Requirements stand in each state; shared with the list's first page. */
export function useHistoricCounts() {
  return useQuery({ queryKey: ["historic", "list", "counts"], queryFn: async () => (await api.historicList({})).counts });
}

/** A requirement's Knowledge step in requirement work, or null when it is not connected. */
export const knowledgeStepHref = (requirementId: string) =>
  requirementWorkHref(`requirements/${encodeURIComponent(requirementId)}/knowledge`);

/** Said after a link that leaves the portal for requirement work. */
export const LEAVES = " (opens requirement work)";

/** The address's query, kept on a record's link so the list stays as filtered. */
export const searchOf = (params: URLSearchParams) => (params.size ? `?${params}` : "");
