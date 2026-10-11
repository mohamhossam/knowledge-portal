import { useOutletContext } from "react-router-dom";

import type { LibraryDocument } from "../api/client";
import type { Drafts } from "./model";
import type { useDocument } from "./useDocument";

type Hook = ReturnType<typeof useDocument>;

/** The working copy's unsaved review, kept while the owner moves between the document's pages. */
export type ReviewState = { key: string; drafts: Drafts; summary: string };

export type DocumentContext = {
  document: LibraryDocument;
  hook: Hook;
  review: ReviewState;
  setReview: (update: (current: ReviewState) => ReviewState) => void;
  /** Unsaved review changes; other pages refuse changes that would lose them. */
  dirty: number;
  /**
   * Says an outcome on the record's own line (§15) and moves focus there: for
   * a change that removes the control that made it (publishing closes the desk).
   */
  announce: (text: string, failed?: boolean) => void;
};

export function useDocumentContext() {
  return useOutletContext<DocumentContext>();
}
