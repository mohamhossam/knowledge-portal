/**
 * A document's publications: what is searchable, what is being indexed, and
 * what a table-aware build would replace. Pure functions over the API's view.
 */
import type { LibraryDocument, Publication } from "../api/client";
import { latestRevision, newestVersion } from "./model";

export type PublicationState =
  | "in-service"
  | "indexing"
  | "stuck"
  | "ready"
  | "previous"
  | "withdrawn"
  | "discarded";

/** Index attempts after which the service stops trying and waits for its owner. */
export const ATTEMPT_LIMIT = 3;

export function publicationState(document: LibraryDocument, publication: Publication): PublicationState {
  if (publication.id === document.published_id) return "in-service";
  if (publication.withdrawn_at) {
    return publication.requires_activation && !publication.activated_at ? "discarded" : "withdrawn";
  }
  if (publication.activated_at) return "previous";
  if (publication.built_at) return "ready";
  return publication.indexing_attempts >= ATTEMPT_LIMIT ? "stuck" : "indexing";
}

/** The table-aware build waiting to be activated or discarded, if any. */
export function pendingBuild(document: LibraryDocument): Publication | undefined {
  return document.publications.find((item) => item.requires_activation && !item.activated_at && !item.withdrawn_at);
}

/**
 * Why a built version can no longer be activated as it stands; null when it can.
 * Activation needs the source and the edition in service to be what they were
 * when the build ran.
 */
export function buildStaleness(document: LibraryDocument, build: Publication): string | null {
  const newest = newestVersion(document);
  if (newest && newest.id !== build.version_id) return "A newer version has been uploaded since this build.";
  if (latestRevision(newest)?.id !== build.revision_id) return "The review was saved again since this build.";
  if ((build.replaces_publication_id ?? null) !== (document.published_id ?? null)) {
    return "The version in service changed since this build.";
  }
  return null;
}

/** Whether indexing stopped and only its owner can start it again. */
export function canRetryIndexing(document: LibraryDocument): boolean {
  const latest = document.publications.at(-1);
  return Boolean(latest && !latest.withdrawn_at && !latest.activated_at && !latest.built_at
    && latest.indexing_attempts >= ATTEMPT_LIMIT);
}

/**
 * What an approval keeps of how much its approver looked at, in words: "looked at 3 of
 * 4 passages, 1 of 2 flagged". Null when the approval kept none (before it was kept,
 * or a version put back on an earlier review).
 */
export function coverageWords(publication: Publication): string | null {
  const coverage = publication.coverage;
  if (!coverage) return null;
  const passages = `looked at ${coverage.seen.toLocaleString("en")} of ${coverage.passages.toLocaleString("en")} ${coverage.passages === 1 ? "passage" : "passages"}`;
  const flagged = coverage.flagged ?? 0;
  return flagged > 0 ? `${passages}, ${(coverage.flagged_seen ?? 0).toLocaleString("en")} of ${flagged.toLocaleString("en")} flagged` : passages;
}
