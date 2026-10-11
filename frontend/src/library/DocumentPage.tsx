import "./library.css";

import { Download, RotateCw, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api, type LibraryDocument, type LibraryVersion } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { ActionGroup, Button, type Column, DataTable, Dialog, EmptyState, Facts, PageHeader, Skeleton, Status, SubNav } from "../design/components";
import { useDisclosure, useFocusAfterRender } from "../design/hooks";
import { routerPath } from "../auth/paths";
import { useAuth } from "../auth/authContext";
import { formatDay } from "../home/format";
import { DocumentReview } from "../reviews/DocumentReview";
import { RouterLink } from "../shell/links";
import { ActAsAdmin, ActingBanner } from "./AdminGrant";
import { type DocumentContext, type ReviewState, useDocumentContext } from "./documentContext";
import { DOC_STATE_WORDS, DOC_TONE, docState } from "./docState";
import { FileButton } from "./FileButton";
import { awaitingReview, IN_PROGRESS, initialDrafts, latestRevision, livePublication, newestState, newestVersion, standing, unsaved } from "./model";
import { Outcome } from "./parts";
import { ReviewDesk } from "./ReviewDesk";
import { returnBlocker } from "./citing";
import { StandingPanel } from "./StandingPanel";
import { useDocument } from "./useDocument";
import { contentLang, humanWhere, plural } from "./where";

const reviewKey = (version: LibraryVersion | undefined) => (version ? `${version.id}:${latestRevision(version)?.id ?? "none"}` : "none");
const freshReview = (version: LibraryVersion | undefined): ReviewState => ({ key: reviewKey(version), drafts: version ? initialDrafts(version) : {}, summary: "" });

/** Reading the file, in words (§6). */
const STAGE: Record<string, string> = {
  queued: "Waiting to be read",
  scanning: "Checking the file for malware",
  extracting: "Reading the passages",
  failed: "Couldn't read the file",
  quarantined: "Held by the malware scan",
  cancelled: "Reading stopped",
};

/**
 * Record archetype (plan 02 §1): one library document, where it stands with
 * requirement work, and its pages. The main page is the review desk while a
 * version waits for review, else the overview. Withdraw and return to service
 * open consequence panels in place (§5). The unsaved review lives here, so it
 * survives moving between the document's pages.
 */
export function DocumentPage() {
  const { documentId = "" } = useParams();
  const document = useDocument(documentId);
  const data = document.query.data;

  if (document.query.isPending) {
    return (
      <div className="lib">
        <Skeleton label="Reading the document" rows={8} />
      </div>
    );
  }
  if (!data) {
    const missing = document.query.error instanceof ApiError && document.query.error.status === 404;
    const refused = document.query.error instanceof ApiError && document.query.error.status === 403;
    if (refused) return <NotAllowed />;
    return (
      <div className="lib">
        <PageHeader title={missing ? "This document isn't in the library" : "Couldn't open this document"} />
        <EmptyState
          title={missing ? "It may have been handed to another owner while private, or the address is wrong." : `The knowledge service didn't answer: ${errorMessage(document.query.error)}`}
          action={
            <ActionGroup>
              {!missing && <Button onClick={() => void document.query.refetch()}>Try again</Button>}
              <RouterLink href="/library">Back to the library</RouterLink>
            </ActionGroup>
          }
        />
      </div>
    );
  }
  return <Record document={data} hook={document} />;
}

type Hook = ReturnType<typeof useDocument>;

function Record({ document, hook }: { document: LibraryDocument; hook: Hook }) {
  const location = useLocation();
  const version = newestVersion(document);
  const [stored, setReview] = useState<ReviewState>(() => freshReview(version));
  // A new version or a newly saved revision (ours, or a reload) resets the working copy to it.
  const review = stored.key === reviewKey(version) ? stored : freshReview(version);
  if (stored.key !== review.key) setReview(review);
  const dirty = version?.stage === "ready_for_review" ? unsaved(version, review.drafts) : 0;

  const [said, setSaid] = useState<{ text: string; failed?: boolean } | null>(null);
  const outcome = useRef<HTMLParagraphElement>(null);
  const focusLater = useFocusAfterRender();
  const announce = useCallback((text: string, failed?: boolean) => {
    setSaid({ text, failed });
    focusLater(() => outcome.current);
  }, [focusLater]);

  const panel = useDisclosure(() => window.document.getElementById("record-standing"));
  const leave = useLeaveGuard(document.id, dirty);
  const [downloading, setDownloading] = useState(false);
  const state = docState(document);
  const stand = standing(document);
  const owner = document.owner.display_name;
  const base = `/library/${encodeURIComponent(document.id)}`;
  const tab = location.pathname.endsWith("/versions") ? "versions"
    : /\/(cited-by|citations)$/.test(location.pathname) ? "cited-by"
      : location.pathname.endsWith("/ownership") ? "ownership" : "main";
  const desk = awaitingReview(document);
  const canWithdraw = document.can_edit && stand.kind === "service";
  const canReturn = document.can_edit && stand.kind === "withdrawn" && !desk;

  const provenance =
    stand.kind === "service" ? (
      <>
        In service since {formatDay(stand.publication.activated_at ?? stand.publication.approved_at)} · version {stand.versionNumber ?? "?"} · approved by <bdi>{stand.publication.approved_by.display_name}</bdi>
        {stand.publication.on_behalf ? <>, as admin on {owner}'s behalf</> : null}
        {desk && <> · a newer review waits to be published</>}
      </>
    ) : stand.kind === "indexing" ? (
      stand.stuck
        ? <>Approved on {formatDay(stand.publication.approved_at)}, but indexing for search stopped after three attempts. Requirement work can't cite it yet.</>
        : <>Approved on {formatDay(stand.publication.approved_at)}; being indexed for search. Requirement work can cite it once that finishes.</>
    ) : stand.kind === "withdrawn" ? (
      <>Withdrawn on {formatDay(stand.publication.withdrawn_at)} by <bdi>{stand.publication.withdrawn_by?.display_name ?? "—"}</bdi>{stand.publication.withdrawal_reason ? <>: <q dir="auto">{stand.publication.withdrawal_reason}</q></> : null}</>
    ) : (
      <>Not in service. Requirement work can't cite it until a review is published.</>
    );

  const download = async () => {
    if (!version) return;
    setDownloading(true);
    try {
      const blob = await api.original(document.id, version.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = version.filename;
      anchor.click();
      // Revoked once the browser has the download, not before (Firefox and Safari cancel it).
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      announce(`Couldn't download the original: ${errorMessage(error)}`, true);
    } finally {
      setDownloading(false);
    }
  };

  const context: DocumentContext = { document, hook, review, setReview, dirty, announce };

  return (
    <div className="lib lib-record">
      <ActingBanner document={document} onDone={announce} />
      <PageHeader
        title={<span lang={contentLang(document.title)}>{document.title}</span>}
        documentTitle={`${document.title} · Library`}
        meta={
          <>
            <Status tone={DOC_TONE[state]}>{DOC_STATE_WORDS[state]}</Status>
            <span>Owner {document.is_owner ? "you" : <bdi>{owner}</bdi>}</span>
            {version && <span>Version {version.number} · <bdi>{version.filename}</bdi></span>}
          </>
        }
        provenance={provenance}
        actions={
          document.can_edit ? (
            <ActionGroup>
              {document.is_owner && (
                <FileButton
                  busy={hook.replace.isPending}
                  unavailableReason={dirty > 0 ? "Save your review first." : null}
                  onFile={([file]) => file && hook.replace.mutate(file, {
                    onSuccess: () => announce(`Uploaded version ${(version?.number ?? 0) + 1}. It is being read; Jobs shows the progress.`),
                    onError: (error) => announce(`Couldn't upload it: ${errorMessage(error)}`, true),
                  })}
                >
                  Upload a new version
                </FileButton>
              )}
              {version && <Button variant="quiet" icon={<Download size={14} />} busy={downloading} onClick={() => void download()}>{downloading ? "Downloading…" : "Download the original"}</Button>}
              {(canWithdraw || canReturn) && (
                <Button
                  id="record-standing"
                  variant={canWithdraw ? "secondary" : "primary"}
                  aria-expanded={panel.open}
                  unavailableReason={canReturn ? returnBlocker(document, dirty) : null}
                  onClick={(event) => {
                    hook.withdraw.reset();
                    hook.approve.reset();
                    if (panel.open) panel.close();
                    else panel.show(event);
                  }}
                >
                  {canWithdraw ? "Withdraw…" : "Return to service…"}
                </Button>
              )}
            </ActionGroup>
          ) : undefined
        }
      >
        <DocumentReview document={document} />
        <SubNav
          label="This document"
          link={RouterLink}
          items={[
            { href: base, label: desk ? (dirty > 0 ? `Review (${plural(dirty, "unsaved change")})` : "Review") : "Overview", current: tab === "main" },
            { href: `${base}/versions`, label: "Versions", current: tab === "versions" },
            { href: `${base}/cited-by`, label: "Cited by", current: tab === "cited-by" },
            { href: `${base}/ownership`, label: "Ownership", current: tab === "ownership" },
          ]}
        />
      </PageHeader>
      {panel.open && (
        <StandingPanel
          document={document}
          hook={hook}
          dirty={dirty}
          panelRef={panel.panel}
          onDone={(text) => {
            panel.close();
            announce(text);
          }}
          onKeep={panel.close}
        />
      )}
      <Outcome text={said?.text} failed={said?.failed} focusRef={outcome} />
      <Outlet context={context} />
      {leave.dialog}
    </div>
  );
}

/** The document's main page: the review desk while a version waits, else the overview. */
export function MainPage() {
  const { document } = useDocumentContext();
  const [params] = useSearchParams();
  const version = newestVersion(document);
  if (!document.can_edit) return <ReaderView />;
  // "?review=again": the owner changes what is in service, from the version's saved review.
  if (version && (awaitingReview(document) || (params.get("review") === "again" && version.stage === "ready_for_review"))) {
    return <ReviewDesk key={version.id} document={document} version={version} />;
  }
  return <Overview />;
}

/** What the newest version's reading is doing, with retry and stop beside it (§6.1). */
function Processing() {
  const { document, hook, announce } = useDocumentContext();
  const newest = newestState(document);
  const stand = standing(document);
  if (!newest) return null;
  const running = IN_PROGRESS.has(newest.stage);
  const failed = newest.stage === "failed";
  const held = newest.stage === "quarantined";
  const stopped = newest.stage === "cancelled";
  const stuck = stand.kind === "indexing" && stand.stuck;
  if (!running && !failed && !held && !stopped && !stuck) return null;
  const attempt = "attempt" in newest ? newest.attempt : 0;
  const after = (text: string) => ({ onSuccess: () => announce(text), onError: (error: unknown) => announce(`Couldn't do that: ${errorMessage(error)}`, true) });
  return (
    <section className="lib-processing" aria-label="Reading the file">
      <p>
        {stuck ? (
          <Status tone="attention">Indexing for search stopped after three attempts</Status>
        ) : (
          <Status tone={running ? "working" : failed ? "attention" : held ? "held" : "stopped"}>{STAGE[newest.stage] ?? newest.stage}</Status>
        )}{" "}
        <span className="lib-quiet">
          Version {newest.number}{attempt > 1 ? ` · attempt ${attempt} of 3` : ""}
          {running ? " · You can leave this page; reading carries on, and Jobs shows its progress." : ""}
        </span>
      </p>
      {(newest.error || (stuck && stand.publication.indexing_error)) && (
        <p>What the {stuck ? "index" : "reader"} reported: <q dir="auto">{stuck ? stand.publication.indexing_error : newest.error}</q></p>
      )}
      {held && <p>A held file is never published. Upload a clean copy as a new version.</p>}
      {document.can_edit && (
        <ActionGroup>
          {running && <Button icon={<Square size={14} />} busy={hook.cancel.isPending} onClick={() => hook.cancel.mutate(newest.id, after("Reading stopped."))}>Stop reading</Button>}
          {/* The fix first (§6): a file the reader can't read fails the same way again; a retry helps only a passing fault. */}
          {(failed || held) && document.is_owner && (
            <FileButton
              variant="primary"
              busy={hook.replace.isPending}
              onFile={([file]) => file && hook.replace.mutate(file, after("Uploaded a new version. It is being read; Jobs shows the progress."))}
            >
              {held ? "Upload a clean copy" : "Upload a new version"}
            </FileButton>
          )}
          {(failed || stopped) && <Button icon={<RotateCw size={14} />} busy={hook.retry.isPending} onClick={() => hook.retry.mutate(newest.id, after("Reading it again. Jobs shows the progress."))}>Try reading again</Button>}
          {stuck && document.is_owner && <Button icon={<RotateCw size={14} />} busy={hook.retryIndexing.isPending} onClick={() => hook.retryIndexing.mutate(undefined, after("Indexing it again. Jobs shows the progress."))}>Try indexing again</Button>}
        </ActionGroup>
      )}
      {failed && <p className="lib-quiet">Try reading again only helps if the failure was passing (a timeout, a busy service). If the file itself is the problem, it fails the same way.</p>}
      {stand.kind === "service" && (running || failed || held) && <p className="lib-quiet">The version in service stays citable meanwhile.</p>}
    </section>
  );
}

type Passage = { id: string; where: string; text: string };

/** The passages requirement work cites now, read-only; "#passage-…" focuses one (from search). */
function InService({ caption }: { caption: string }) {
  const { document } = useDocumentContext();
  const location = useLocation();
  const live = livePublication(document);
  const source = live ? document.versions.find((item) => item.id === live.version_id) : undefined;
  const revision = source?.revisions.find((item) => item.id === live?.revision_id);
  const passages = useMemo<Passage[]>(() => {
    if (!source || !revision) return [];
    const blocks = new Map(source.blocks.map((block) => [block.id, block]));
    return revision.passages.filter((item) => item.included).map((item) => {
      const block = blocks.get(item.block_id);
      const where = block ? [...block.section_path.filter((part) => !block.label.includes(part)), block.label].join(" › ") : "—";
      return { id: item.block_id, where: humanWhere(where), text: item.text };
    });
  }, [source, revision]);
  const wanted = (() => {
    const raw = location.hash.replace(/^#passage-/, "");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  useEffect(() => {
    if (!wanted) return;
    const row = window.document.getElementById(`passage-${wanted}`);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.focus({ preventScroll: true });
  }, [wanted, passages.length]);

  if (!live) return null;
  if (!source || !revision) {
    return <p className="lib-quiet">The passages in service are private to its owner. Requirement work cites them as approved.</p>;
  }
  const columns: Column<Passage>[] = [
    { id: "where", header: "Where", rowHeader: true, width: "12rem", cell: (item) => <span id={`passage-${item.id}`} tabIndex={-1} className="lib-anchor">{item.where}</span> },
    { id: "text", header: "Passage", bidi: true, cell: (item) => <span lang={contentLang(item.text)} className="lib-passage-cell">{item.text}</span> },
  ];
  return (
    <section className="ds-section lib-inservice" aria-labelledby="in-service-title">
      <div className="ds-section__head">
        <h2 id="in-service-title" className="ds-section__title">{caption} <span className="ds-section__count">{passages.length.toLocaleString("en")}</span></h2>
      </div>
      <DataTable caption={caption} captionHidden columns={columns} rows={passages} rowId={(item) => item.id} emptyText="Every passage of it is excluded." />
    </section>
  );
}

/** The record's main page when nothing waits for review: where it stands, its facts, what is in service. */
function Overview() {
  const { document } = useDocumentContext();
  const version = newestVersion(document);
  const stand = standing(document);
  const live = livePublication(document);
  const liveVersion = live ? document.versions.find((item) => item.id === live.version_id) : undefined;
  // Changing what is in service without a new file: the version's saved review, reviewed again.
  const again = document.can_edit && Boolean(live) && version?.stage === "ready_for_review" && Boolean(latestRevision(version));
  return (
    <div className="lib-overview">
      <Processing />
      <Facts
        items={[
          ["Newest version", version ? <>{version.number} · <bdi>{version.filename}</bdi>, uploaded {formatDay(version.uploaded_at)} by <bdi>{version.uploaded_by.display_name}</bdi></> : "—"],
          ["In service", live ? <>Version {liveVersion?.number ?? "?"}{live.chunk_count ? `, ${plural(live.chunk_count, "indexed passage")}` : ""}</> : stand.kind === "withdrawn" ? <>Nothing: withdrawn on {formatDay(stand.publication.withdrawn_at)}</> : "Nothing yet"],
          ["Owner", document.is_owner ? "You" : <bdi>{document.owner.display_name}</bdi>],
        ]}
      />
      {again && (
        <p className="lib-quiet">
          To change what is in service without a new file, <RouterLink href="?review=again">review version {version!.number} again</RouterLink>; publishing it replaces the version in service.
        </p>
      )}
      <InService caption="Passages in service" />
    </div>
  );
}

/** Another admin's view: the passages in service, where the newest version stands, and acting for the owner. */
function ReaderView() {
  const { document, announce } = useDocumentContext();
  const newest = newestState(document);
  const approved = newest && document.publications.some((item) => item.version_id === newest.id && !item.withdrawn_at);
  return (
    <div className="lib-overview">
      <ActAsAdmin document={document} onDone={announce} />
      {newest && !approved && (
        <p>
          Newest: version {newest.number}, uploaded {formatDay(newest.uploaded_at)} by <bdi>{newest.uploaded_by.display_name}</bdi>.{" "}
          <Status tone={newest.stage === "failed" ? "attention" : newest.stage === "quarantined" ? "held" : IN_PROGRESS.has(newest.stage) ? "working" : "neutral"}>
            {newest.stage === "ready_for_review" ? "Read; waiting for its owner's review" : STAGE[newest.stage] ?? newest.stage}
          </Status>
          {newest.error && <span className="lib-detail">{newest.error}</span>}
        </p>
      )}
      <InService caption="Passages in service" />
      {!livePublication(document) && <p className="lib-quiet">Nothing of it is in service, so there are no passages to show.</p>}
    </div>
  );
}


/**
 * §4: unsaved review work asks before it is lost. Closing or reloading the tab uses the
 * browser's own question; a link that leaves the document (the rail, Jobs, a search result)
 * opens the one modal the model allows here. The app has no data router, so the guard listens
 * for link clicks itself; the browser's Back button is not caught (backlog).
 */
function useLeaveGuard(documentId: string, dirty: number) {
  const navigate = useNavigate();
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    if (dirty === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target || link.hasAttribute("download") || link.origin !== window.location.origin) return;
      const path = routerPath(link.pathname);
      // The document's own pages keep the unsaved review: it lives above them.
      if (path.startsWith(`/library/${encodeURIComponent(documentId)}`) || path.startsWith(`/library/${documentId}`)) return;
      event.preventDefault();
      event.stopPropagation();
      setTo(`${path}${link.search}${link.hash}`);
    };
    window.addEventListener("beforeunload", warn);
    window.document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.document.removeEventListener("click", click, true);
    };
  }, [documentId, dirty]);
  const dialog = (
    <Dialog
      open={to !== null}
      title="Leave without saving your review?"
      onClose={() => setTo(null)}
      actions={
        <>
          <Button variant="primary" data-autofocus onClick={() => setTo(null)}>Stay and save</Button>
          <Button onClick={() => { const next = to; setTo(null); if (next) navigate(next); }}>Leave without saving</Button>
        </>
      }
    >
      <p>You have {plural(dirty, "unsaved change")} to this review. Leaving loses {dirty === 1 ? "it" : "them"}.</p>
    </Dialog>
  );
  return { dialog };
}

/** A refusal (403) is a permission state (§7), not a service that didn't answer. */
function NotAllowed() {
  const auth = useAuth();
  return (
    <div className="lib">
      <PageHeader title="You can't open this document" />
      <EmptyState title="Opening library documents needs the Knowledge admin role." action={<RouterLink href="/library">Back to the library</RouterLink>}>
        <p>You're signed in as <bdi>{auth?.actor?.display_name ?? "someone else"}</bdi>. Ask your platform administrator to add the role.</p>
      </EmptyState>
    </div>
  );
}
