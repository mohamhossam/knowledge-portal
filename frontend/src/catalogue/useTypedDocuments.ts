import { useQuery } from "@tanstack/react-query";

import { api, type LibraryDocument } from "../api/client";
import type { Term } from "./vocabularyEditing";

/**
 * The library documents a document type is given to: the library, not the version, holds them,
 * so a type is read against it. Every other term has none; the library is read only for a type.
 */
export function useTypedDocuments(term: Term): { documents: LibraryDocument[]; checking: boolean; failed: boolean } {
  const typed = term.scheme === "document_type";
  const library = useQuery({ queryKey: ["library", "documents"], queryFn: api.libraryDocuments, enabled: typed });
  if (!typed) return { documents: [], checking: false, failed: false };
  return {
    documents: (library.data ?? []).filter((document) => document.document_type === term.id),
    checking: library.isPending,
    failed: library.isError,
  };
}
