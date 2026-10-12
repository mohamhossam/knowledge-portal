/**
 * Unsaved review decisions, kept in the tab (area 2 critique run 2, P1): a
 * reload, a closed desk or the browser's Back button no longer loses them. One
 * slot per document, for one version and saved revision (the review's key);
 * session storage only, never sent. Blocked storage leaves the review in memory,
 * as it was before.
 */
import type { LibraryVersion } from "../api/client";
import type { ReviewState } from "./documentContext";
import { type Drafts, initialDrafts, latestRevision, unsaved } from "./model";

/** What the reviewer changed since the last save: the decisions, and the summary when it changed. */
export type KeptReview = { key: string; drafts: Drafts; summary: string | null };

const slot = (documentId: string) => `knowledge-portal.review.${documentId}`;

/** The review's changes against where it starts; null when nothing differs. */
export function changesOf(version: LibraryVersion, review: ReviewState): KeptReview | null {
  const start = initialDrafts(version);
  const drafts: Drafts = {};
  for (const [id, draft] of Object.entries(review.drafts)) {
    const from = start[id];
    if (from && (draft.text !== from.text || draft.included !== from.included || draft.reason !== from.reason)) drafts[id] = draft;
  }
  const summary = review.summary !== (latestRevision(version)?.explanation ?? "") ? review.summary : null;
  return Object.keys(drafts).length > 0 || summary !== null ? { key: review.key, drafts, summary } : null;
}

/** The kept review of a document, if a well-formed one is there. */
export function readKept(documentId: string): KeptReview | null {
  try {
    const raw = window.sessionStorage.getItem(slot(documentId));
    if (!raw) return null;
    const kept = JSON.parse(raw) as Partial<KeptReview>;
    if (typeof kept.key !== "string" || !kept.drafts || typeof kept.drafts !== "object") return null;
    return { key: kept.key, drafts: kept.drafts, summary: typeof kept.summary === "string" ? kept.summary : null };
  } catch {
    return null;
  }
}

/** Keeps the review's changes, or (null) forgets them. */
export function writeKept(documentId: string, kept: KeptReview | null): void {
  try {
    if (kept) window.sessionStorage.setItem(slot(documentId), JSON.stringify(kept));
    else window.sessionStorage.removeItem(slot(documentId));
  } catch {
    // Blocked or full storage: the review lives in memory only, as it did before.
  }
}

/** The review with the kept changes laid over it; only the version's own passages are taken. */
export function restored(version: LibraryVersion, review: ReviewState, kept: KeptReview): ReviewState {
  const drafts = { ...review.drafts };
  for (const block of version.blocks) {
    const draft = kept.drafts[block.id];
    if (draft && drafts[block.id]) drafts[block.id] = { text: String(draft.text), included: Boolean(draft.included), reason: String(draft.reason ?? "") };
  }
  return { ...review, drafts, summary: kept.summary ?? review.summary };
}

/** How many decisions a restore brings back, counted as the save bar counts them. */
export function keptCount(version: LibraryVersion, review: ReviewState, kept: KeptReview): number {
  return unsaved(version, restored(version, review, kept).drafts);
}
