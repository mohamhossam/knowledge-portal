import { useQuery } from "@tanstack/react-query";

import { api, type LibraryDocument } from "../api/client";
import { approvalBlocker, latestRevision, newestVersion } from "./model";

/**
 * Who cites the document now (the first page of its dependants), shared by
 * withdraw and publish. Unknown is never zero (§11): a failed ask says so.
 */
export function useCiting(documentId: string, enabled = true) {
  return useQuery({
    queryKey: ["library", "dependencies", documentId, "first"],
    queryFn: () => api.dependencies(documentId, 0),
    enabled,
    retry: false,
  });
}

/**
 * Why a withdrawn document can't return to service as it was; null when it can. In the
 * glossary's words: returning publishes the last approved review of the newest version again.
 */
export function returnBlocker(document: LibraryDocument, dirty: number): string | null {
  const version = newestVersion(document);
  if (!version) return "There is no version to return.";
  if (version.stage === "failed") return `Version ${version.number} couldn't be read: upload a new version, then review and publish it.`;
  if (version.stage === "quarantined") return `Version ${version.number} is held by the malware scan: upload a clean copy.`;
  if (version.stage !== "ready_for_review") return `Version ${version.number} is still being read.`;
  const revision = latestRevision(version);
  const returned = document.publications.find((item) => item.withdrawn_at && item.version_id === version.id && item.revision_id === revision?.id);
  if (!revision || !returned) return "Its newest version has a review that was never published: review it and publish it instead.";
  if (dirty > 0) return "Save your review first.";
  if (version.blocking_warnings.length > 0) return `${version.blocking_warnings.length} ${version.blocking_warnings.length === 1 ? "passage blocks" : "passages block"} approval: see Review.`;
  if (document.publications.some((item) => !item.withdrawn_at && item.requires_activation && !item.activated_at)) return "A search index for tables waits on Versions: activate it or discard it first.";
  return approvalBlocker(document, version, dirty) === null ? null : "It can't be published again as it stands.";
}
