import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type LibraryDocument } from "../api/client";
import { settling } from "./model";

export const documentKey = (documentId: string) => ["library", "document", documentId] as const;

/** A change to the document: it runs against the version the owner is looking at. */
function useChange<Input>(
  documentId: string,
  current: LibraryDocument | undefined,
  run: (document: LibraryDocument, input: Input) => Promise<LibraryDocument>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Input) => {
      if (!current) throw new Error("The document is still loading.");
      return run(current, input);
    },
    onSuccess: (document) => {
      queryClient.setQueryData(documentKey(documentId), document);
      void queryClient.invalidateQueries({ queryKey: ["library", "documents"] });
    },
  });
}

/**
 * One library document, kept current while its file is being read or its
 * approval indexed. Every change answers with the whole document, which
 * replaces the cached one, and the library table is refreshed behind it.
 */
export function useDocument(documentId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: documentKey(documentId),
    queryFn: () => api.libraryDocument(documentId),
    refetchInterval: (state) => (state.state.data && settling(state.state.data) ? 1500 : false),
  });
  const current = query.data;

  return {
    query,
    review: useChange(documentId, current, (document, input: { versionId: string; body: Parameters<typeof api.review>[2] }) =>
      api.review(document.id, input.versionId, input.body)),
    approve: useChange(documentId, current, (document, input: { versionId: string; revisionId: string }) =>
      api.approve(document.id, input.versionId, {
        expected_version: document.version,
        revision_id: input.revisionId,
        fingerprint: document.review_fingerprint ?? "",
      })),
    withdraw: useChange(documentId, current, (document, reason: string) =>
      api.withdraw(document.id, { expected_version: document.version, reason })),
    retry: useChange(documentId, current, (document, versionId: string) =>
      api.retry(document.id, versionId, document.version)),
    cancel: useChange(documentId, current, (document, versionId: string) =>
      api.cancel(document.id, versionId, document.version)),
    replace: useChange(documentId, current, (document, file: File) =>
      api.upload({ file, title: document.title, documentId: document.id, expectedVersion: document.version })),
    reload: () => queryClient.invalidateQueries({ queryKey: documentKey(documentId) }),
  };
}
