import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import { errorMessage } from "../api/errors";
import { useCatalogueContext } from "./useCatalogue";

/** One passage of a version's index, as it is cited for a system. */
export function EvidencePage() {
  const { chunkId = "" } = useParams();
  const { book, base } = useCatalogueContext();
  const evidence = useQuery({
    queryKey: ["architecture", "releases", book.release.id, "evidence", chunkId],
    queryFn: () => api.evidence(book.release.id, chunkId),
  });
  const document = book.release.documents.find((item) => item.id === evidence.data?.document_version_id);
  // A passage indexed from a system's own entry is located as "system <id>".
  const aboutSystem = /^system (.+)$/.exec(evidence.data?.location ?? "")?.[1];
  return (
    <section className="govsection catalogue__first" aria-labelledby="evidence-title">
      <h2 id="evidence-title" className="govsection__title">A cited passage</h2>
      {evidence.isPending ? (
        <p className="timetable__quiet">Opening the passage…</p>
      ) : evidence.isError ? (
        <p className="docpage__failure" role="alert">{errorMessage(evidence.error)}</p>
      ) : (
        <>
          <p className="govsection__lead" dir="ltr">
            {aboutSystem ? (
              <>
                From the catalogue's own entry for{" "}
                <Link to={`${base}/systems/${encodeURIComponent(aboutSystem)}`}>
                  <bdi>{book.systems.get(aboutSystem)?.name ?? evidence.data.source_label}</bdi>
                </Link>
              </>
            ) : (
              <>
                <bdi>{document?.title ?? evidence.data.source_label}</bdi> · {evidence.data.location}
              </>
            )}
          </p>
          <p className="evidence__text" dir="auto">{evidence.data.text}</p>
        </>
      )}
      <p className="govsection__actions">
        <Link to={`${base}/check`}>Back to the checks</Link>
      </p>
    </section>
  );
}
