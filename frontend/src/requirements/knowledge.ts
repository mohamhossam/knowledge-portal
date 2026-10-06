import { useQuery } from "@tanstack/react-query";

import { api } from "../api/client";

export const KNOWLEDGE_PATH = "/requirement-knowledge";
export const REQUIREMENTS_PATH = `${KNOWLEDGE_PATH}/requirements`;
export const FINDINGS_PATH = `${KNOWLEDGE_PATH}/findings`;
/** Old BRDs with their Azure DevOps lineage, as reference knowledge (Knowledge Center E). */
export const HISTORIC_PATH = `${KNOWLEDGE_PATH}/historic`;

/** The summary Table 4 is read from; its counts label the filters. Shared with the overview's cache. */
export function useCorpusSummary() {
  return useQuery({ queryKey: ["knowledge-center", "requirement-corpus"], queryFn: api.requirementCorpus });
}

/** A requirement's Knowledge step, in requirement work at the platform's root. */
export const knowledgeStepHref = (requirementId: string) =>
  `/requirements/${encodeURIComponent(requirementId)}/knowledge`;

/** Said after a link that leaves the portal for requirement work. */
export const LEAVES = " (opens requirement work)";
