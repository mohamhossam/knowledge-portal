import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Release, type SuggestionContent } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { typedFile } from "./suggestions";

/** What became of one file of a multi-file upload. */
export type UploadLine =
  | { filename: string; state: "reading"; versionId: string }
  | { filename: string; state: "unread"; versionId: string; reason: string }
  | { filename: string; state: "refused"; reason: string };

const releaseKey = (releaseId: string) => ["architecture", "releases", releaseId] as const;
const suggestionsKey = (releaseId: string) => ["architecture", "releases", releaseId, "suggestions"] as const;
const extractionsKey = (releaseId: string) => ["architecture", "releases", releaseId, "extractions"] as const;

type Decision = { suggestionId: string; accept: boolean; content?: SuggestionContent | null };

/**
 * A draft's documents and suggestions, and every change to them.
 *
 * Decisions run one after another, each with the revision the previous one
 * returned, so deciding quickly from the keyboard never races the draft. A
 * conflict (409) stops the queue; the page offers to reload.
 */
export function useDraft(release: Release) {
  const queryClient = useQueryClient();
  const releaseId = release.id;
  const revision = useRef(release.revision);
  useEffect(() => {
    revision.current = Math.max(revision.current, release.revision);
  }, [release.revision]);

  const suggestions = useQuery({ queryKey: suggestionsKey(releaseId), queryFn: () => api.suggestions(releaseId) });
  const extractions = useQuery({
    queryKey: extractionsKey(releaseId),
    queryFn: () => api.extractions(releaseId),
    // A document being read is checked every few seconds until it is done.
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.job.status === "queued" || item.job.status === "running") ? 3000 : false,
  });

  const settle = useCallback(
    (next?: Release) => {
      if (next) {
        revision.current = next.revision;
        queryClient.setQueryData(releaseKey(releaseId), next);
      }
      void queryClient.invalidateQueries({ queryKey: ["architecture"] });
    },
    [queryClient, releaseId],
  );

  // The decision queue.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [failure, setFailure] = useState<unknown>(null);
  const decide = useCallback(
    (decision: Decision) => {
      setPending((n) => n + 1);
      const run = queue.current.then(async () => {
        try {
          const next = await api.decide(releaseId, decision.suggestionId, {
            expected_revision: revision.current,
            accept: decision.accept,
            content: decision.content ?? null,
          });
          setFailure(null);
          settle(next);
          return true;
        } catch (error) {
          setFailure(error);
          void queryClient.invalidateQueries({ queryKey: suggestionsKey(releaseId) });
          return false;
        } finally {
          setPending((n) => n - 1);
        }
      });
      queue.current = run.catch(() => undefined);
      return run;
    },
    [queryClient, releaseId, settle],
  );

  // Only the suggestions the person was shown: a reading that finished meanwhile adds none.
  const acceptReady = useMutation({
    mutationFn: (ids: string[]) => api.acceptAll(releaseId, revision.current, ids),
    onSuccess: (result) => settle(result.release),
  });
  const rejectMany = useMutation({
    mutationFn: (ids: string[]) => api.rejectMany(releaseId, revision.current, ids),
    onSuccess: () => settle(),
  });
  // Saying what a name suggestions wait for is: it changes suggestions, and the draft too
  // when the name is a system the draft has (it becomes one of its aliases).
  const settleSubject = useMutation({
    mutationFn: (subject: Parameters<typeof api.settleSubject>[1]) =>
      api.settleSubject(releaseId, subject),
    onSettled: (_, __, subject) => {
      void queryClient.invalidateQueries({ queryKey: suggestionsKey(releaseId) });
      if (subject.kind === "existing") void queryClient.invalidateQueries({ queryKey: releaseKey(releaseId) });
    },
  });

  const addDocument = useMutation({
    mutationFn: async (input: { file: File; title: string }) => {
      const next = await api.addCatalogueDocument(releaseId, {
        ...input,
        file: typedFile(input.file),
        expectedRevision: revision.current,
      });
      settle(next);
      const added = next.documents.at(-1);
      // Uploading does not start the reading; ask for it straight away.
      if (added) await api.readCatalogueDocument(releaseId, added.id);
      return added;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: extractionsKey(releaseId) });
      void queryClient.invalidateQueries({ queryKey: suggestionsKey(releaseId) });
    },
  });
  // Several files at once (Knowledge Center C): each added file starts reading, one after
  // another, within the per-minute model budget; one the budget refuses waits to be read.
  const addDocuments = useMutation({
    mutationFn: async (input: { files: File[] }): Promise<UploadLine[]> => {
      const batch = await api.addCatalogueDocuments(releaseId, {
        files: input.files.map(typedFile),
        expectedRevision: revision.current,
      });
      settle(batch.release);
      const lines: UploadLine[] = [];
      for (const result of batch.results) {
        if (result.outcome === "refused" || !result.version_id) {
          lines.push({ filename: result.filename, state: "refused", reason: result.reason ?? "" });
          continue;
        }
        try {
          await api.readCatalogueDocument(releaseId, result.version_id);
          lines.push({ filename: result.filename, state: "reading", versionId: result.version_id });
        } catch (error) {
          lines.push({
            filename: result.filename,
            state: "unread",
            versionId: result.version_id,
            reason: error instanceof ApiError && error.status === 429
              ? "The model budget for this minute is spent."
              : errorMessage(error),
          });
        }
      }
      return lines;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: extractionsKey(releaseId) });
      void queryClient.invalidateQueries({ queryKey: suggestionsKey(releaseId) });
    },
  });
  const removeDocument = useMutation({
    mutationFn: (versionId: string) =>
      api.selectCatalogueDocuments(releaseId, {
        expected_revision: revision.current,
        version_ids: release.documents.map((item) => item.id).filter((id) => id !== versionId),
      }),
    onSuccess: (next) => settle(next),
  });
  const read = useMutation({
    mutationFn: (versionId: string) => api.readCatalogueDocument(releaseId, versionId),
    onSettled: () => settle(),
  });
  const cancel = useMutation({ mutationFn: (jobId: string) => api.cancelJob(jobId), onSettled: () => settle() });
  const retry = useMutation({ mutationFn: (jobId: string) => api.retryJob(jobId), onSettled: () => settle() });

  const reload = useCallback(() => {
    setFailure(null);
    void queryClient.invalidateQueries({ queryKey: ["architecture"] });
  }, [queryClient]);

  return {
    suggestions, extractions, decide, pending, failure, acceptReady, rejectMany, settleSubject, addDocument, addDocuments, removeDocument, read, cancel, retry, reload,
  };
}

export type DraftHook = ReturnType<typeof useDraft>;

/** Starting, renaming and removing the one draft. */
export function useDraftLifecycle() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["architecture"] });
  const create = useMutation({ mutationFn: (name: string) => api.createDraft(name), onSuccess: refresh });
  const rename = useMutation({
    mutationFn: ({ release, name }: { release: Release; name: string }) =>
      api.renameDraft(release.id, { expected_revision: release.revision, name }),
    onSuccess: refresh,
  });
  const discard = useMutation({
    mutationFn: (release: Release) => api.discardDraft(release.id, release.revision),
    // The page leaves the removed draft first; only then are its answers dropped, so nothing asks for it again.
    onSuccess: (_, release) => {
      setTimeout(() => {
        queryClient.removeQueries({ queryKey: releaseKey(release.id) });
        void refresh();
      }, 0);
    },
  });
  return { create, rename, discard };
}
