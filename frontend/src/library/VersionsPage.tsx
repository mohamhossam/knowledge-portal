import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import { api, type LibraryVersion, type Publication, type ReferenceChunk } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, type Column, ConsequencePanel, DataTable, EmptyState, Section, Status, type StatusTone } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { useDocumentContext } from "./documentContext";
import { newestVersion } from "./model";
import { Failure } from "./parts";
import { CitingNow } from "./StandingPanel";
import { ATTEMPT_LIMIT, buildStaleness, canRetryIndexing, pendingBuild, type PublicationState, publicationState } from "./publications";
import { contentLang, humanWhere, plural } from "./where";

/** A publication's state in the glossary's words, with a tone that never leans on colour alone. */
const PUBLISHED: Record<PublicationState, { words: string; tone: StatusTone }> = {
  "in-service": { words: "In service", tone: "done" },
  indexing: { words: "Being indexed", tone: "working" },
  stuck: { words: "Indexing stopped", tone: "attention" },
  ready: { words: "Built; waiting to be activated", tone: "neutral" },
  previous: { words: "Replaced", tone: "neutral" },
  withdrawn: { words: "Withdrawn", tone: "stopped" },
  discarded: { words: "Discarded", tone: "stopped" },
};

const STAGE_WORDS: Record<string, { words: string; tone: StatusTone }> = {
  queued: { words: "Waiting to be read", tone: "neutral" },
  scanning: { words: "Being read", tone: "working" },
  extracting: { words: "Being read", tone: "working" },
  ready_for_review: { words: "Read", tone: "done" },
  failed: { words: "Couldn't be read", tone: "attention" },
  quarantined: { words: "Held", tone: "held" },
  cancelled: { words: "Reading stopped", tone: "stopped" },
};

const isTables = (policy: string) => policy.startsWith("table-fields");

/**
 * A document's versions (plan 02 §2): the files uploaded, what was published
 * from them and how search indexes it, and the optional search index for
 * tables, activated through a consequence panel (§5).
 */
export function VersionsPage() {
  const { document, hook, announce } = useDocumentContext();
  const failure = [hook.build, hook.activate, hook.discard, hook.retryIndexing].find((item) => item.isError)?.error;
  const numberOf = (versionId: string) => document.versions.find((item) => item.id === versionId)?.number;
  const files = [...document.versions].sort((a, b) => b.number - a.number);
  const published = [...document.publications].reverse();

  const fileColumns: Column<LibraryVersion>[] = [
    { id: "number", header: "Version", rowHeader: true, numeric: true, width: "6rem", cell: (item) => item.number },
    { id: "file", header: "File", bidi: true, cell: (item) => <bdi>{item.filename}</bdi> },
    { id: "uploaded", header: "Uploaded", width: "16rem", cell: (item) => <>{formatDay(item.uploaded_at)} · <bdi>{item.uploaded_by.display_name}</bdi></> },
    {
      id: "state",
      header: "Reading",
      width: "13rem",
      cell: (item) => {
        const stage = STAGE_WORDS[item.stage] ?? { words: item.stage, tone: "neutral" as const };
        return (
          <>
            <Status tone={stage.tone}>{stage.words}</Status>
            {item.attempt > 1 && <span className="lib-detail">Attempt {item.attempt} of {ATTEMPT_LIMIT}</span>}
            {item.error && <span className="lib-detail">{item.error}</span>}
          </>
        );
      },
    },
  ];

  const publishedColumns: Column<Publication>[] = [
    { id: "approved", header: "Published", rowHeader: true, width: "14rem", cell: (item) => <>{formatDay(item.approved_at)}<span className="lib-detail lib-detail--plain">by <bdi>{item.approved_by.display_name}</bdi>{item.on_behalf ? ", as admin" : ""}</span></> },
    {
      id: "state",
      header: "State",
      cell: (item) => {
        const state = publicationState(document, item);
        return (
          <>
            <Status tone={PUBLISHED[state].tone}>{PUBLISHED[state].words}</Status>
            {item.withdrawal_reason && <span className="lib-detail lib-detail--plain" dir="auto">{item.withdrawal_reason}</span>}
            {state === "stuck" && item.indexing_error && <span className="lib-detail">{item.indexing_error}</span>}
          </>
        );
      },
    },
    { id: "kind", header: "Index", width: "12rem", cell: (item) => (isTables(item.chunking_policy) ? "Search index for tables" : "Passages") },
    { id: "count", header: "Indexed", numeric: true, width: "8rem", cell: (item) => (item.chunk_count ? plural(item.chunk_count, "passage") : "—") },
    { id: "from", header: "From", numeric: true, width: "7rem", cell: (item) => `Version ${numberOf(item.version_id) ?? "?"}` },
  ];

  return (
    <div className="lib-stack">
      {failure ? <Failure error={failure} onReload={hook.reload} /> : null}

      <Section title="Files uploaded" count={files.length}>
        {files.length === 0 ? (
          <p className="lib-quiet">Its files are private to {document.owner.display_name}, its owner.</p>
        ) : (
          <DataTable caption="Files uploaded, newest first" captionHidden columns={fileColumns} rows={files} rowId={(item) => item.id} />
        )}
      </Section>

      <Section title="Published" count={published.length}>
        <p className="lib-quiet">Each approval is indexed for search. Requirement work cites the one in service.</p>
        {published.length === 0 ? (
          <EmptyState title="Nothing has been published yet.">
            <p>Publish a saved review from the document's Review page.</p>
          </EmptyState>
        ) : (
          <DataTable caption="Published versions, newest first" captionHidden columns={publishedColumns} rows={published} rowId={(item) => item.id} />
        )}
        {canRetryIndexing(document) && document.is_owner && (
          <p>
            <Status tone="attention">Indexing stopped after {ATTEMPT_LIMIT} attempts.</Status>{" "}
            <Button icon={<RotateCw size={14} />} busy={hook.retryIndexing.isPending} onClick={() => hook.retryIndexing.mutate(undefined, { onSuccess: () => announce("Indexing it again. Jobs shows the progress.") })}>Try indexing again</Button>
          </p>
        )}
      </Section>

      {!document.is_owner ? (
        <Section title="Search index for tables">
          <p className="lib-quiet">Building and activating it stay with <bdi>{document.owner.display_name}</bdi>, its owner.</p>
        </Section>
      ) : pendingBuild(document) ? <PendingBuild /> : <NewBuild />}
      <SavedPassages />
    </div>
  );
}

function PendingBuild() {
  const { document, hook, announce } = useDocumentContext();
  const build = pendingBuild(document)!;
  const panel = useDisclosure(() => window.document.getElementById("build-activate"));
  const discard = useDisclosure(() => window.document.getElementById("build-discard"));
  const stale = buildStaleness(document, build);
  const stuck = !build.built_at && build.indexing_attempts >= ATTEMPT_LIMIT;
  return (
    <Section title="Search index for tables">
      {!build.built_at ? (
        <p>
          {stuck ? (
            <Status tone="attention">Building stopped after {ATTEMPT_LIMIT} attempts{build.indexing_error ? `: ${build.indexing_error}` : "."} Discard it and build again.</Status>
          ) : (
            <Status tone="working">Being built. The version in service stays citable until this one is activated.</Status>
          )}
        </p>
      ) : (
        <>
          <p>Built on {formatDay(build.built_at)}: {plural(build.chunk_count, "indexed passage")}, table rows kept together field by field.</p>
          {stale && <p role="status"><Status tone="attention">{stale} Discard it and build again.</Status></p>}
        </>
      )}
      <ActionGroup>
        {build.built_at && !stale && (
          <Button id="build-activate" variant="primary" aria-expanded={panel.open} onClick={(event) => (panel.open ? panel.close() : panel.show(event))}>Activate it…</Button>
        )}
        <Button id="build-discard" aria-expanded={discard.open} onClick={(event) => (discard.open ? discard.close() : discard.show(event))}>Discard it…</Button>
      </ActionGroup>
      {discard.open && (
        <ConsequencePanel
          panelRef={discard.panel}
          title="Discard the search index for tables"
          happens={<>The built index of {plural(build.chunk_count, "passage")} is set aside, never activated. Search keeps the index in service.</>}
          reversibility="It can't be brought back; you can build a new one from the saved review."
          confirmLabel="Discard it"
          keepLabel="Keep it"
          busy={hook.discard.isPending}
          busyLabel="Discarding…"
          failure={hook.discard.isError ? errorMessage(hook.discard.error) : null}
          onConfirm={() => hook.discard.mutate(build.id, { onSuccess: () => announce("Discarded. Search keeps the index in service; you can build a new one below.") })}
          onKeep={discard.close}
        />
      )}
      {panel.open && (
        <ConsequencePanel
          panelRef={panel.panel}
          title="Activate the search index for tables"
          happens={<>It replaces the index in service: requirement work finds and cites its {plural(build.chunk_count, "passage")} from then on.</>}
          affects={
            <CitingNow
              documentId={document.id}
              list={false}
              lead={(count, one, none) => <><strong className="ds-num">{count}</strong> {one ? "requirement" : "requirements"} you can see {one ? "cites" : "cite"} the version in service{none ? "" : ". Their owners are told the source changed, and decide whether to keep or revise what they wrote"}</>}
            />
          }
          reversibility="To go back, publish the passages again from a saved review; the requirements are told again."
          confirmLabel="Activate it"
          keepLabel="Not yet"
          busy={hook.activate.isPending}
          busyLabel="Activating…"
          failure={hook.activate.isError ? errorMessage(hook.activate.error) : null}
          onConfirm={() => hook.activate.mutate({ buildId: build.id, manifest: build.chunk_manifest ?? "" }, { onSuccess: () => announce("Activated. Requirement work now cites the search index for tables.") })}
          onKeep={panel.close}
        />
      )}
    </Section>
  );
}

function NewBuild() {
  const { document, hook, dirty } = useDocumentContext();
  const newest = newestVersion(document);
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
      <Section title="Search index for tables">
        <p className="lib-quiet">Save a review first: the index for tables is built from the saved review.</p>
      </Section>
    );
  }
  const waitReason = dirty > 0 ? `Save the review first (${plural(dirty, "unsaved change")}).` : null;
  return (
    <Section title="Search index for tables">
      <p className="lib-quiet">
        An optional second index that keeps table rows together: each row and worksheet range is indexed field by field, with its label, so a
        requirement can cite one field rather than a whole row. It is built from the latest saved review, then waits for you to activate it.
      </p>
      <ActionGroup>
        <Button busy={preview.isFetching} unavailableReason={waitReason} onClick={() => void preview.refetch()}>
          {preview.isFetching ? "Preparing the preview…" : current ? "Preview again" : "Preview what it would index"}
        </Button>
        {current && (
          <Button
            variant="primary"
            busy={hook.build.isPending}
            unavailableReason={waitReason ?? (blocking > 0 ? `${plural(blocking, "warning blocks", "warnings block")} it on the Review page.` : current.chunks.length === 0 ? "Nothing to index." : null)}
            onClick={() => hook.build.mutate(current)}
          >
            {hook.build.isPending ? "Starting the build…" : `Build it (${plural(current.chunks.length, "passage")})`}
          </Button>
        )}
      </ActionGroup>
      {preview.isError && <p role="status"><Status tone="attention">{errorMessage(preview.error)}</Status></p>}
      {current && <ChunkTable chunks={current.chunks} caption="Passages and fields this index would hold" />}
    </Section>
  );
}

function SavedPassages() {
  const { document, dirty } = useDocumentContext();
  const chunks = useQuery({
    queryKey: ["library", "chunk-preview", document.id, document.version],
    queryFn: () => api.chunkPreview(document.id),
    enabled: false,
    retry: false,
  });
  if (!document.review_fingerprint || !document.can_edit) return null;
  return (
    <Section title="How search will see the saved review">
      <p className="lib-quiet">The passages a publication would index, split the way search finds them.</p>
      <ActionGroup>
        <Button busy={chunks.isFetching} unavailableReason={dirty > 0 ? `Save the review first (${plural(dirty, "unsaved change")}).` : null} onClick={() => void chunks.refetch()}>
          {chunks.isFetching ? "Preparing…" : chunks.data ? "Show again" : "Show the passages search would index"}
        </Button>
      </ActionGroup>
      {chunks.isError && <p role="status"><Status tone="attention">{errorMessage(chunks.error)}</Status></p>}
      {chunks.data && <ChunkTable chunks={chunks.data} caption="Passages search would index from the saved review" />}
    </Section>
  );
}

export function ChunkTable({ chunks, caption }: { chunks: ReferenceChunk[]; caption: string }) {
  const columns: Column<ReferenceChunk>[] = [
    { id: "where", header: "Where", rowHeader: true, width: "12rem", cell: (chunk) => <>{humanWhere(chunk.location)}{chunk.field_context && <span className="lib-detail lib-detail--plain"><bdi>{chunk.field_context}</bdi></span>}</> },
    { id: "text", header: "Passage", bidi: true, cell: (chunk) => <span className="lib-clamp" lang={contentLang(chunk.original_text)}>{chunk.original_text}</span> },
    { id: "tokens", header: "Tokens", numeric: true, width: "6rem", cell: (chunk) => chunk.token_count },
  ];
  return <DataTable caption={caption} captionHidden columns={columns} rows={chunks} rowId={(chunk) => chunk.id} />;
}
