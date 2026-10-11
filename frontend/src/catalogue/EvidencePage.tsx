import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { api } from "../api/client";
import { errorMessage } from "../api/errors";
import { EvidenceQuote, Section, Skeleton, Status } from "../design/components";
import { RouterLink } from "../shell/links";
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
    <Section title="The passage">
      {evidence.isPending ? (
        <Skeleton label="Opening the passage" rows={3} />
      ) : evidence.isError ? (
        <p role="alert"><Status tone="attention">{errorMessage(evidence.error)}</Status></p>
      ) : (
        <EvidenceQuote
          text={evidence.data.text}
          source={
            aboutSystem ? (
              <>
                From the catalogue's own entry for{" "}
                <RouterLink href={`${base}/systems/${encodeURIComponent(aboutSystem)}`}>
                  <bdi>{book.systems.get(aboutSystem)?.name ?? evidence.data.source_label}</bdi>
                </RouterLink>
              </>
            ) : (
              <>
                <bdi>{document?.title ?? evidence.data.source_label}</bdi> · {evidence.data.location}
              </>
            )
          }
        />
      )}
      <p className="cat-lead">
        <RouterLink href={`${base}/check`}>Back to the checks</RouterLink>
      </p>
    </Section>
  );
}
