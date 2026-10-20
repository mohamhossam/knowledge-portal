import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { errorMessage } from "../api/errors";
import { EvidenceQuote, Section, Skeleton, Status } from "../design/components";
import { RouterLink } from "../shell/links";
import { documentLang } from "./draft/decide";
import { useCatalogueContext } from "./useCatalogue";

type EvidenceData = Awaited<ReturnType<typeof api.evidence>>;

/** What a section-v4 index records of a passage: the catalogue entries it names, and the
 * other places its exact text appears. Nothing for older indexes or catalogue records. */
function PassageFacts({ evidence, base }: { evidence: EvidenceData; base: string }) {
  const mentions = evidence.mentions ?? [];
  const aliases = evidence.aliases ?? [];
  if (!mentions.length && !aliases.length) return null;
  return (
    <dl className="cat-facts">
      {mentions.length > 0 && (
        <>
          <dt>Names in the catalogue</dt>
          <dd>
            <ul className="cat-inline-list">
              {mentions.map((item) => (
                <li key={`${item.entity}:${item.entity_id}`}>
                  <RouterLink
                    href={`${base}/${item.entity === "system" ? "systems" : "offerings"}/${encodeURIComponent(item.entity_id)}`}
                  >
                    <bdi>{item.name}</bdi>
                  </RouterLink>
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
      {aliases.length > 0 && (
        <>
          <dt>Same text also at</dt>
          <dd>{aliases.join("; ")}</dd>
        </>
      )}
    </dl>
  );
}

/** One passage of a version's index, as it is cited for a system. */
export function EvidencePage() {
  const { chunkId = "" } = useParams();
  // The line the citation quotes (O-4), carried by the link from the checks: only it is marked.
  const quote = useSearchParams()[0].get("quote")?.trim() || undefined;
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
          quote={quote}
          lang={aboutSystem ? undefined : documentLang(document)}
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
      {evidence.data && <PassageFacts evidence={evidence.data} base={base} />}
      <p className="cat-lead">
        <RouterLink href={`${base}/check`}>Back to the checks</RouterLink>
      </p>
    </Section>
  );
}
