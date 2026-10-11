import { FilePen } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import type { Release } from "../../api/client";
import { ButtonLink } from "../../shell/links";
import { useReleases } from "../useCatalogue";

/**
 * A draft in preparation, on the catalogue's head (UX rebuild polish): one
 * action beside the head's own, instead of a banner across the page; the
 * head's state already says which version is being read. Reading the draft
 * itself, the way back to its steps. Nothing on Versions, where the draft has
 * its own line.
 */
export function useDraftAction(readingDraft?: Release): ReactNode {
  const releases = useReleases();
  const location = useLocation();
  const draft = readingDraft ?? releases.data?.find((item) => item.status === "draft");
  if (!draft || location.pathname === "/architecture/versions") return null;
  const at = `/architecture/versions/${encodeURIComponent(draft.id)}/sources`;
  return (
    <ButtonLink to={at}>
      <FilePen size={16} aria-hidden="true" /> {readingDraft ? "Back to its steps" : "Carry on with the draft"}
    </ButtonLink>
  );
}
