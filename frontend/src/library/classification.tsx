import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { api, type ClassificationOptions, type LibraryDocument } from "../api/client";

const GONE = "no longer in the catalogue";

/** The document types and topics the catalogue in service offers (ADR-0123). */
export function useClassificationOptions() {
  return useQuery({ queryKey: ["library", "classification-options"], queryFn: api.classificationOptions, staleTime: 5 * 60_000 });
}

/** An id's English label, or what became of it. */
export function labelOf(options: ClassificationOptions | undefined, kind: "document_types" | "topics", id: string): string {
  return options?.[kind].find((item) => item.id === id)?.label ?? (options ? `${id} (${GONE})` : id);
}

/** A document's type and topics as facts, saying when it has none. */
export function classificationFacts(document: LibraryDocument, options: ClassificationOptions | undefined): [string, ReactNode][] {
  const topics = document.topics ?? [];
  return [
    ["Type", document.document_type ? labelOf(options, "document_types", document.document_type) : <span className="lib-quiet">Not given</span>],
    ["Topics", topics.length ? topics.map((id) => labelOf(options, "topics", id)).join(", ") : <span className="lib-quiet">None given</span>],
  ];
}
