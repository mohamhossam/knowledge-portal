/**
 * One display state per document (docs/ux/ia/object-model.md, Document ›
 * States), in the redesign's job vocabulary (interaction model §6). Shared by
 * Your work and, from area 2 on, the library.
 */
import type { LibraryDocument } from "../api/client";
import type { StatusTone } from "../design/components";
import { newestVersion, standing } from "./model";

export type DocState = "reading" | "review" | "indexing" | "service" | "withdrawn" | "attention" | "held" | "stopped" | "none";

export const DOC_STATE_WORDS: Record<DocState, string> = {
  reading: "Being read",
  review: "Ready for review",
  indexing: "Being indexed",
  service: "In service",
  withdrawn: "Withdrawn",
  attention: "Needs attention",
  held: "Held",
  stopped: "Stopped",
  none: "Not in service",
};

/** Routine states stay neutral; severe ones carry weight (never colour alone). */
export const DOC_TONE: Record<DocState, StatusTone> = {
  reading: "working",
  review: "neutral",
  indexing: "working",
  service: "done",
  withdrawn: "stopped",
  attention: "attention",
  held: "held",
  stopped: "stopped",
  none: "neutral",
};

export function docState(doc: LibraryDocument): DocState {
  const newest = newestVersion(doc);
  const stage = newest?.stage;
  if (stage === "failed") return "attention";
  if (stage === "quarantined") return "held";
  if (stage === "cancelled") return "stopped";
  if (stage === "queued" || stage === "scanning" || stage === "extracting") return "reading";
  const current = standing(doc);
  if (stage === "ready_for_review" && !doc.publications.some((publication) => publication.version_id === newest?.id && !publication.withdrawn_at)) {
    return current.kind === "withdrawn" ? "withdrawn" : "review";
  }
  if (current.kind === "service") return "service";
  // Approved but not yet searchable: not citable until indexing finishes; stuck after 3 tries.
  if (current.kind === "indexing") return current.stuck ? "attention" : "indexing";
  if (current.kind === "withdrawn") return "withdrawn";
  return "none";
}
