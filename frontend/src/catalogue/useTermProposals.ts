import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Release } from "../api/client";
import { termProposals, type TermProposal } from "./vocabularyProposals";

/**
 * A draft's waiting vocabulary proposals, and the clean-up that makes them: the same suggestions
 * Decide shows, read under its key so deciding there is seen here. A version in service has none.
 */
export function useTermProposals(release: Release): {
  proposals: TermProposal[];
  loading: boolean;
  /** The proposals could not be read: never said as none. */
  failed: boolean;
  retry: () => void;
  /** When the clean-up last read this draft, if it has. */
  lastRun: string | null;
  cleanUp: ReturnType<typeof useMutation<{ candidate_count: number }, unknown, void>>;
} {
  const draft = release.status === "draft";
  const queryClient = useQueryClient();
  const key = ["architecture", "releases", release.id, "suggestions"] as const;
  const suggestions = useQuery({ queryKey: key, queryFn: () => api.suggestions(release.id), enabled: draft });
  const cleanUp = useMutation({
    mutationFn: () => api.cleanUpVocabulary(release.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["architecture", "releases", release.id, "extractions"] });
    },
  });
  const runs = (suggestions.data?.runs ?? []).filter((run) => run.reading === "vocabulary_cleanup").map((run) => run.created_at).sort();
  return {
    proposals: draft ? termProposals(suggestions.data?.suggestions ?? [], release) : [],
    loading: draft && suggestions.isPending,
    failed: draft && suggestions.isError,
    retry: () => void suggestions.refetch(),
    lastRun: runs.at(-1) ?? null,
    cleanUp,
  };
}
