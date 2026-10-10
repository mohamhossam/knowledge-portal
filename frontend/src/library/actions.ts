/**
 * The library's job actions for a document seen from outside its record (a row
 * in Your work, a job in Jobs): try reading again, stop reading, upload a new
 * version, try indexing again. The same API calls as the record's own
 * (useDocument), each naming the document version it saw; the lists and the
 * record are refreshed behind them.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, type LibraryDocument } from "../api/client";
import { errorMessage } from "../api/errors";
import { newestVersion } from "./model";
import { documentKey } from "./useDocument";

export type JobAction = "retry" | "cancel" | "upload" | "retry-indexing";

type Input = { document: LibraryDocument; action: JobAction; file?: File };

const DONE: Record<JobAction, (title: string) => string> = {
  retry: (title) => `Reading '${title}' again. Jobs shows its progress.`,
  cancel: (title) => `Stopped reading '${title}'.`,
  upload: (title) => `Uploaded a new version of '${title}'. Jobs shows the reading.`,
  "retry-indexing": (title) => `Indexing '${title}' again. Jobs shows its progress.`,
};

function run({ document, action, file }: Input): Promise<LibraryDocument> {
  const version = newestVersion(document) ?? document.newest;
  if (action === "upload") {
    if (!file) return Promise.reject(new Error("Choose a file first."));
    return api.upload({ file, title: document.title, documentId: document.id, expectedVersion: document.version });
  }
  if (action === "retry-indexing") return api.retryIndexing(document.id, document.version);
  if (!version) return Promise.reject(new Error("This document has no version yet."));
  return action === "retry" ? api.retry(document.id, version.id, document.version) : api.cancel(document.id, version.id, document.version);
}

/** One mutation for every job action, with the outcome said in words (§6, §15). */
export function useJobActions() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: run,
    onSuccess: (updated) => {
      queryClient.setQueryData(documentKey(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: ["library", "documents"] });
    },
  });
  const said = mutation.isSuccess && mutation.variables
    ? { text: DONE[mutation.variables.action](mutation.variables.document.title), failed: false }
    : mutation.isError && mutation.variables
      ? { text: `Couldn't do that for '${mutation.variables.document.title}': ${errorMessage(mutation.error)}`, failed: true }
      : null;
  return {
    /** `onSettled` runs once it is done or refused, e.g. to move focus to the outcome when the row has gone. */
    act: (document: LibraryDocument, action: JobAction, file?: File, onSettled?: () => void) => {
      // One at a time: a second press would send a stale expected version (409).
      if (mutation.isPending) return;
      mutation.mutate({ document, action, file }, { onSettled });
    },
    busy: mutation.isPending ? mutation.variables : undefined,
    said,
  };
}
