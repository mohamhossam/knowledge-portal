import type { LibraryDocument } from "../api/client";
import type { Rank } from "../timetable/TimetableTable";
import { IN_PROGRESS, newestState, standing } from "./model";

export const RANK_ORDER: Record<Rank, number> = { delayed: 0, due: 1, running: 2, service: 3, past: 4 };

/** Where a document stands, as one row of the library table. */
export function libraryRow(document: LibraryDocument) {
  const newest = newestState(document);
  const state = standing(document);
  const approved = newest !== undefined && document.publications.some((item) => item.version_id === newest.id);
  const inService = state.kind === "service" ? `v${state.versionNumber ?? "?"}` : "—";
  let rank: Rank = "service";
  let status = "In service";
  let since = state.kind === "service" ? state.publication.approved_at : newest?.uploaded_at;
  if (newest && (newest.stage === "failed" || newest.stage === "quarantined")) {
    rank = "delayed";
    status = newest.stage === "failed" ? "Extraction failed" : "Quarantined";
    since = newest.uploaded_at;
  } else if (newest && IN_PROGRESS.has(newest.stage)) {
    rank = "running";
    status = "Being read";
    since = newest.uploaded_at;
  } else if (newest?.stage === "ready_for_review" && !approved) {
    rank = "due";
    status = document.is_owner ? "Awaiting your review" : "Awaiting review";
    since = newest.uploaded_at;
  } else if (state.kind === "indexing") {
    rank = state.stuck ? "delayed" : "running";
    status = state.stuck ? "Indexing stopped" : "Being indexed";
    since = state.publication.approved_at;
  } else if (state.kind === "withdrawn") {
    rank = "past";
    status = "Withdrawn";
    since = state.publication.withdrawn_at ?? undefined;
  } else if (state.kind === "none") {
    rank = newest?.stage === "cancelled" ? "past" : "due";
    status = newest?.stage === "cancelled" ? "Processing cancelled" : "Not yet reviewed";
  }
  // Due or overdue for review only matters once nothing else does: it stays in service meanwhile.
  const review = document.review ?? null;
  if (rank === "service" && review && review.state !== "current") {
    rank = review.state === "overdue" ? "delayed" : "due";
    status = review.state === "overdue" ? "Review overdue" : "Review due soon";
  }
  return { rank, status, inService, since, review };
}
