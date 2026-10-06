import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useId, useState } from "react";

import { api, type ReferenceChunk } from "../api/client";
import { errorMessage } from "../api/errors";
import { count, formatDay } from "../home/format";
import { Failure } from "./DocumentPage";
import { useDocumentContext } from "./documentContext";
import { newestVersion } from "./model";
import {
  STATE_LABEL, buildStaleness, canRetryIndexing, pendingBuild, policyLabel, publicationState,
} from "./publications";

/**
 * How the document is indexed for search: every publication and its state, the
 * table-aware build waiting for activation, and a preview of a new one.
 */
export function VersionsPage() {
  const { document, hook, dirty } = useDocumentContext();
  const pending = pendingBuild(document);
  const failure = [hook.build, hook.activate, hook.discard, hook.retryIndexing].find((item) => item.isError)?.error;
  const versionNumber = (versionId: string) => document.versions.find((item) => item.id === versionId)?.number;
  const rows = [...document.publications].reverse();

  return (
    <>
      {failure ? <Failure error={failure} onReload={hook.reload} /> : null}

      <section className="govsection" aria-labelledby="pubs-title">
        <h2 id="pubs-title" className="govsection__title">Search versions</h2>
        <p className="govsection__lead">
          Each approval is indexed for search as a version. Requirement work cites the one in service.
        </p>
        {rows.length > 0 ? (
          <table className="govtable">
            <caption className="visually-hidden">Search versions of this document, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Approved</th>
                <th scope="col">State</th>
                <th scope="col" className="cell--p2">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((publication) => {
                const state = publicationState(document, publication);
                return (
                  <tr key={publication.id} className={`row row--${state === "in-service" ? "service" : state === "stuck" ? "delayed" : state === "ready" || state === "indexing" ? "due" : "past"}`}>
                    <th scope="row">
                      {formatDay(publication.approved_at)}
                      <span className="secondary govtable__by">{publication.approved_by.display_name}</span>
                    </th>
                    <td>
                      <span className="status">{STATE_LABEL[state]}</span>
                      <span className="secondary govtable__by">
                        {policyLabel(publication.chunking_policy)}
                        {publication.chunk_count ? ` · ${count(publication.chunk_count, "indexed passage")}` : ""}
                      </span>
                      {publication.withdrawal_reason && <span className="secondary govtable__by">{publication.withdrawal_reason}</span>}
                      {state === "stuck" && publication.indexing_error && <span className="secondary govtable__by">{publication.indexing_error}</span>}
                    </td>
                    <td className="cell--p2">version {versionNumber(publication.version_id) ?? "?"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="timetable__quiet">Nothing has been approved yet. Approve a saved review on the Review page.</p>
        )}
        {canRetryIndexing(document) && document.is_owner && (
          <p className="govsection__action">
            Indexing stopped after three attempts.{" "}
            <button type="button" className="text-button" disabled={hook.retryIndexing.isPending} onClick={() => hook.retryIndexing.mutate()}>
              <RotateCw size={14} aria-hidden="true" />
              Index it again
            </button>
          </p>
        )}
      </section>

      {!document.is_owner ? (
        <p className="govsection__lead">
          Building and activating its search versions stay with {document.owner.display_name}, its owner.
        </p>
      ) : pending ? <PendingBuild /> : <NewBuild dirty={dirty} />}
      <SavedChunks dirty={dirty} />
    </>
  );
}

function PendingBuild() {
  const { document, hook } = useDocumentContext();
  const build = pendingBuild(document)!;
  const [acknowledged, setAcknowledged] = useState(false);
  const id = useId();
  const stale = buildStaleness(document, build);
  const stuck = !build.built_at && build.indexing_attempts >= 3;
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Table-aware version awaiting activation</h2>
      {!build.built_at ? (
        <p className={stuck ? "docpage__failure" : "govsection__lead"} role={stuck ? "alert" : "status"}>
          {stuck
            ? `Building stopped after three attempts${build.indexing_error ? `: ${build.indexing_error}` : "."} Discard it and build again.`
            : "Being built. The version in service stays citable until this one is activated."}
        </p>
      ) : (
        <>
          <p className="govsection__lead">
            Built on {formatDay(build.built_at)}: {count(build.chunk_count, "indexed passage")}. Activating it replaces the version in
            service; requirements citing the current version are told their source changed.
          </p>
          {stale && <p className="docpage__failure" role="alert">{stale} Discard it and build again.</p>}
          {!stale && (
            <label className="check">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              I understand that requirements citing the current version will need to review their source.
            </label>
          )}
        </>
      )}
      <p className="govsection__actions">
        {build.built_at && !stale && (
          <button
            type="button"
            className="action-button"
            disabled={!acknowledged || hook.activate.isPending}
            onClick={() => hook.activate.mutate({ buildId: build.id, manifest: build.chunk_manifest ?? "" })}
          >
            {hook.activate.isPending ? "Activating…" : "Activate this version"}
          </button>
        )}
        <button type="button" className="text-button" disabled={hook.discard.isPending} onClick={() => hook.discard.mutate(build.id)}>
          Discard it
        </button>
      </p>
    </section>
  );
}

function NewBuild({ dirty }: { dirty: number }) {
  const { document, hook } = useDocumentContext();
  const newest = newestVersion(document);
  const id = useId();
  const preview = useQuery({
    queryKey: ["library", "build-preview", document.id, document.version],
    queryFn: () => api.buildPreview(document.id),
    enabled: false,
    retry: false,
  });
  const blocking = newest?.blocking_warnings.length ?? 0;
  const current = preview.data && preview.data.document_version === document.version ? preview.data : undefined;
  if (!document.build_fingerprint) {
    return (
      <section className="govsection" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="govsection__title">Table-aware version</h2>
        <p className="govsection__lead">Save a review first; a table-aware version is built from the saved review.</p>
      </section>
    );
  }
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Build a table-aware version</h2>
      <p className="govsection__lead">
        Table rows and worksheet ranges are indexed field by field, each with its label, so a requirement can cite one
        field rather than a whole row. It is built from the latest saved review, then waits for you to activate it.
      </p>
      <p className="govsection__actions">
        <button type="button" className="text-button" disabled={dirty > 0 || preview.isFetching} onClick={() => void preview.refetch()}>
          {preview.isFetching ? "Preparing the preview…" : current ? "Preview again" : "Preview what it would index"}
        </button>
        {current && (
          <button
            type="button"
            className="action-button"
            disabled={dirty > 0 || blocking > 0 || current.chunks.length === 0 || hook.build.isPending}
            onClick={() => hook.build.mutate(current)}
          >
            {hook.build.isPending ? "Starting the build…" : `Build it (${count(current.chunks.length, "passage")})`}
          </button>
        )}
      </p>
      {dirty > 0 && <p className="govsection__lead">Save the review first: {dirty} unsaved {dirty === 1 ? "change" : "changes"}.</p>}
      {blocking > 0 && <p className="docpage__failure">{blocking} blocking {blocking === 1 ? "warning stays" : "warnings stay"} unresolved on the Review page.</p>}
      {preview.isError && <p className="docpage__failure" role="alert">{errorMessage(preview.error)}</p>}
      {current && <ChunkTable chunks={current.chunks} caption="Passages and fields this build would index" />}
    </section>
  );
}

function SavedChunks({ dirty }: { dirty: number }) {
  const { document } = useDocumentContext();
  const id = useId();
  const chunks = useQuery({
    queryKey: ["library", "chunk-preview", document.id, document.version],
    queryFn: () => api.chunkPreview(document.id),
    enabled: false,
    retry: false,
  });
  if (!document.review_fingerprint) return null;
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">How search will see the saved review</h2>
      <p className="govsection__lead">The passages an approval would index, split as search will find them.</p>
      <p className="govsection__actions">
        <button type="button" className="text-button" disabled={dirty > 0 || chunks.isFetching} onClick={() => void chunks.refetch()}>
          {chunks.isFetching ? "Preparing…" : chunks.data ? "Show again" : "Show the passages search would index"}
        </button>
      </p>
      {chunks.isError && <p className="docpage__failure" role="alert">{errorMessage(chunks.error)}</p>}
      {chunks.data && <ChunkTable chunks={chunks.data} caption="Passages search would index from the saved review" />}
    </section>
  );
}

export function ChunkTable({ chunks, caption }: { chunks: ReferenceChunk[]; caption: string }) {
  return (
    <table className="govtable">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Where</th>
          <th scope="col">Passage</th>
          <th scope="col" className="cell--end cell--p2">Tokens</th>
        </tr>
      </thead>
      <tbody>
        {chunks.map((chunk) => (
          <tr key={chunk.id} className="row">
            <th scope="row" className="govtable__where">
              {chunk.location}
              {chunk.field_context && <span className="secondary govtable__by">{chunk.field_context}</span>}
            </th>
            <td dir="auto"><span className="clamp">{chunk.original_text}</span></td>
            <td className="cell--end cell--p2">{chunk.token_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
