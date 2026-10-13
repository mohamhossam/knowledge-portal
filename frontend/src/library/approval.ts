import type { LibraryDocument, LibraryVersion } from "../api/client";
import { plural } from "./where";

/**
 * Why the review can't be published now, short enough to sit beside the button (backlog K1).
 * Unsaved decisions don't stop it: publishing saves them first, with the summary asked for in
 * the same panel (the audit's one-step approval). `pending` is how many blocking warnings the
 * decisions on screen leave, when they differ from the saved review; null when they don't.
 */
export function approveReason(document: LibraryDocument, version: LibraryVersion, problems: string[], pending: number | null): string | null {
  if (problems.length > 0) return problems[0]!;
  const blocking = pending ?? version.blocking_warnings.length;
  if (blocking > 0) return `${plural(blocking, "warning blocks", "warnings block")} it.`;
  if (document.publications.some((item) => !item.withdrawn_at && item.requires_activation && !item.activated_at)) return "A search index for tables waits; see Versions.";
  if (pending === null && document.publications.some((item) => !item.withdrawn_at && item.fingerprint === document.review_fingerprint)) return "Already published.";
  return null;
}
