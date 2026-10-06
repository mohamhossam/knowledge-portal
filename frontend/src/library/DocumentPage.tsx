import { Download, RotateCw, Upload, X } from "lucide-react";
import { type ChangeEvent, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";

import { api, type LibraryDocument, type LibraryVersion } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { count, formatDay } from "../home/format";
import {
  IN_PROGRESS, approvalBlocker, comparisonBasis, counts, initialDrafts, isTheEdition, latestRevision, matches, newestVersion,
  reviewBody, reviewRows, saveProblems, standing, unsaved, type Draft, type Filter,
} from "./model";
import { DocumentReview } from "../reviews/DocumentReview";
import { ActAsAdmin, ActingBanner } from "./AdminGrant";
import { type Focus, PassageTable } from "./PassageTable";
import { type DocumentContext, type ReviewState, useDocumentContext } from "./documentContext";
import { useDocument } from "./useDocument";

const PAGE = 200;

const STAGE: Record<string, string> = {
  queued: "Waiting to be read",
  scanning: "Checking the file for malware",
  extracting: "Reading the passages",
  failed: "Extraction failed",
  quarantined: "Quarantined by the malware scanner",
  cancelled: "Processing cancelled",
};

const reviewKey = (version: LibraryVersion | undefined) =>
  version ? `${version.id}:${latestRevision(version)?.id ?? "none"}` : "none";
const freshReview = (version: LibraryVersion | undefined): ReviewState => ({
  key: reviewKey(version),
  drafts: version ? initialDrafts(version) : {},
  summary: "",
});

/** One library document: where it stands with requirement work, its review and its governance. */
export function DocumentPage() {
  const { documentId = "" } = useParams();
  const document = useDocument(documentId);
  const data = document.query.data;

  useEffect(() => {
    window.document.title = `${data?.title ?? "Document"} · Library · Knowledge portal`;
  }, [data?.title]);

  if (document.query.isPending) {
    return <section className="docpage"><p className="docpage__quiet">Reading the document…</p></section>;
  }
  if (!data) {
    const missing = document.query.error instanceof ApiError && document.query.error.status === 404;
    return (
      <section className="docpage" aria-labelledby="doc-missing">
        <h1 id="doc-missing" className="docpage__title">{missing ? "This document is not in the library" : "The document could not be read"}</h1>
        <p className="docpage__quiet">
          {missing
            ? "It may have been withdrawn, or it is someone's private draft."
            : `The knowledge service did not answer: ${errorMessage(document.query.error)}`}
        </p>
        <p><Link to="/library">Back to the library</Link></p>
      </section>
    );
  }
  return data.can_edit ? <OwnerView document={data} hook={document} /> : <ReaderView document={data} />;
}

function EditionLine({ document }: { document: LibraryDocument }) {
  const state = standing(document);
  if (state.kind === "service") {
    return (
      <>
        In service: version {state.versionNumber ?? "?"}, approved by {state.publication.approved_by.display_name}
        {state.publication.on_behalf ? " as admin, on its owner’s behalf," : ""} on{" "}
        {formatDay(state.publication.approved_at)}. Requirement work cites this edition.
      </>
    );
  }
  if (state.kind === "indexing") {
    return state.stuck
      ? <span className="status status--failed">Approved on {formatDay(state.publication.approved_at)}, but indexing stopped after three attempts.</span>
      : <>Approved on {formatDay(state.publication.approved_at)}; being indexed for search.</>;
  }
  if (state.kind === "withdrawn") {
    return <>Withdrawn on {formatDay(state.publication.withdrawn_at)}: {state.publication.withdrawal_reason}</>;
  }
  return <>Not yet in service. Requirement work cannot cite it until a review is approved.</>;
}

function Head({ document, version, actions, pages }: {
  document: LibraryDocument;
  version?: LibraryVersion;
  actions?: ReactNode;
  pages?: ReactNode;
}) {
  return (
    <header className="docpage__head">
      <p className="docpage__number" aria-hidden="true">1</p>
      <div className="docpage__heading">
        <h1 id="doc-title" className="docpage__title" dir="auto">{document.title}</h1>
        <p className="docpage__edition"><EditionLine document={document} /></p>
        <DocumentReview document={document} />
        {version && (
          <p className="docpage__version">
            Working copy: version {version.number} · <span dir="auto">{version.filename}</span> · uploaded by{" "}
            {version.uploaded_by.display_name} on {formatDay(version.uploaded_at)}. Owner: {document.owner.display_name}.
          </p>
        )}
        {actions && <div className="docpage__actions">{actions}</div>}
        {pages}
      </div>
    </header>
  );
}

/** Where the newest version stands, for an admin who sees only the document's outline. */
const OUTLINE_STAGE: Record<string, string> = {
  ...STAGE,
  ready_for_review: "Read; awaiting its owner's review",
};

/** What any other admin sees: the passages in service, read-only, and where the newest stands. */
function ReaderView({ document }: { document: LibraryDocument }) {
  const version = document.versions[0];
  const passages = version?.revisions[0]?.passages.filter((item) => item.included) ?? [];
  const labels = new Map(version?.blocks.map((block) => [block.id, block.label]) ?? []);
  const newest = document.newest;
  const approved = newest && document.publications.some((item) => item.version_id === newest.id);
  return (
    <section className="docpage" aria-labelledby="doc-title">
      <Head document={document} />
      {newest && !approved && (
        <p className="docpage__version">
          Newest: version {newest.number}, uploaded by {newest.uploaded_by.display_name} on {formatDay(newest.uploaded_at)}.{" "}
          <span className={newest.stage === "failed" || newest.stage === "quarantined" ? "status status--failed" : "status"}>
            {OUTLINE_STAGE[newest.stage] ?? newest.stage}
          </span>
          {newest.error && <span className="docpage__why">{newest.error}</span>}
        </p>
      )}
      <ActAsAdmin document={document} />
      {passages.length === 0 ? (
        <p className="docpage__quiet">Nothing of it is in service, so there are no passages to show.</p>
      ) : (
      <table className="passages passages--read">
        <caption className="visually-hidden">Passages in service</caption>
        <thead>
          <tr>
            <th scope="col" className="cell passages__where">Where</th>
            <th scope="col" className="cell passages__working">In service</th>
          </tr>
        </thead>
        <tbody>
          {passages.map((passage) => (
            <tr key={passage.block_id} className="passage">
              <th scope="row" className="cell passages__where">{labels.get(passage.block_id) ?? "—"}</th>
              <td className="cell passages__working" dir="auto">{passage.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </section>
  );
}

type Hook = ReturnType<typeof useDocument>;

function OwnerView({ document, hook }: { document: LibraryDocument; hook: Hook }) {
  const version = newestVersion(document);
  const [withdrawing, setWithdrawing] = useState(false);
  const [stored, setReview] = useState<ReviewState>(() => freshReview(version));
  // A new version or a newly saved revision (ours or a reload) resets the working copy to it.
  const review = stored.key === reviewKey(version) ? stored : freshReview(version);
  if (stored.key !== review.key) setReview(review);
  const dirty = version?.stage === "ready_for_review" ? unsaved(version, review.drafts) : 0;

  useEffect(() => {
    if (dirty === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const replaceId = useId();
  const pending = hook.review.isPending || hook.approve.isPending || hook.replace.isPending;
  const failure = [hook.retry, hook.cancel, hook.replace, hook.withdraw].find((mutation) => mutation.isError)?.error;

  const download = async () => {
    if (!version) return;
    const blob = await api.original(document.id, version.id);
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = version.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const replace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) hook.replace.mutate(file);
  };

  const live = document.publications.some((item) => !item.withdrawn_at);
  const actions = (
    <>
      {document.is_owner && (
        <label className="text-button file-button" htmlFor={replaceId}>
          <Upload size={14} aria-hidden="true" />
          Upload a new version
          <input id={replaceId} type="file" className="visually-hidden" onChange={replace} disabled={pending || dirty > 0}
            accept=".pdf,.docx,.xlsx,.pptx,.csv,.tsv,.txt,.md,.png,.jpg,.jpeg" />
        </label>
      )}
      {version && (
        <button type="button" className="text-button" onClick={() => void download()}>
          <Download size={14} aria-hidden="true" />
          Download the original
        </button>
      )}
      {live && !withdrawing && (
        <button type="button" className="text-button" onClick={() => setWithdrawing(true)}>Withdraw from requirement work…</button>
      )}
    </>
  );

  return (
    <section className="docpage" aria-labelledby="doc-title">
      <ActingBanner document={document} />
      <Head document={document} version={version} actions={actions} pages={<SubIndex dirty={dirty} />} />
      {hook.replace.isPending && <p className="docpage__notice" role="status">Uploading the new version…</p>}
      {failure ? <Failure error={failure} onReload={hook.reload} /> : null}
      {withdrawing && <Withdraw document={document} hook={hook} onDone={() => setWithdrawing(false)} />}
      {version && <Processing document={document} version={version} hook={hook} />}
      <Outlet context={{ document, hook, review, setReview, dirty } satisfies DocumentContext} />
    </section>
  );
}

const PAGES = [
  { to: "", label: "Review", end: true },
  { to: "versions", label: "Search versions" },
  { to: "citations", label: "Who cites it" },
  { to: "ownership", label: "Ownership" },
];

/** The document's own pages, an index under its head. */
function SubIndex({ dirty }: { dirty: number }) {
  return (
    <nav className="subindex" aria-label="This document">
      <ul className="subindex__list">
        {PAGES.map((page) => (
          <li key={page.label}>
            <NavLink to={page.to} end={page.end} className="subindex__link">
              {page.label}
              {page.label === "Review" && dirty > 0 && <span className="subindex__count"> · {dirty} unsaved</span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The review page: the working copy's passages, when there is something to review. */
export function ReviewPage() {
  const { document, hook, review, setReview } = useDocumentContext();
  const version = newestVersion(document);
  if (version?.stage !== "ready_for_review") return null;
  return <Review key={version.id} document={document} version={version} hook={hook} review={review} setReview={setReview} />;
}

export function Failure({ error, onReload }: { error: unknown; onReload: () => void }) {
  const conflict = error instanceof ApiError && error.status === 409;
  return (
    <p className="docpage__failure" role="alert">
      {conflict
        ? "The document changed while you worked (someone else, or the service finishing a step). Reload it; your unsaved decisions on this version stay."
        : errorMessage(error)}
      {conflict && (
        <button type="button" className="text-button" onClick={onReload}>
          <RotateCw size={14} aria-hidden="true" />
          Reload the document
        </button>
      )}
    </p>
  );
}

function Processing({ document, version, hook }: { document: LibraryDocument; version: LibraryVersion; hook: Hook }) {
  if (version.stage === "ready_for_review") return null;
  const running = IN_PROGRESS.has(version.stage);
  const failed = version.stage === "failed" || version.stage === "quarantined";
  return (
    <div className={failed ? "processing processing--failed" : "processing"} role={failed ? "alert" : "status"}>
      <p>
        <span className="status">{STAGE[version.stage] ?? version.stage}</span>
        {" "}· version {version.number}
        {version.error && <> — {version.error}</>}
      </p>
      {running && document.is_owner && (
        <button type="button" className="text-button" onClick={() => hook.cancel.mutate(version.id)} disabled={hook.cancel.isPending}>
          <X size={14} aria-hidden="true" />
          Cancel processing
        </button>
      )}
      {(version.stage === "failed" || version.stage === "cancelled") && document.is_owner && (
        <button type="button" className="text-button" onClick={() => hook.retry.mutate(version.id)} disabled={hook.retry.isPending}>
          <RotateCw size={14} aria-hidden="true" />
          Read it again
        </button>
      )}
      {version.stage === "quarantined" && <p>A quarantined file can never be published. Upload a new version instead.</p>}
      {standing(document).kind === "service" && (
        <p className="processing__aside">The version in service stays citable meanwhile.</p>
      )}
    </div>
  );
}

function Withdraw({ document, hook, onDone }: { document: LibraryDocument; hook: Hook; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const id = useId();
  return (
    <form
      className="withdraw"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        hook.withdraw.mutate(reason.trim(), { onSuccess: onDone });
      }}
    >
      <h2 id={`${id}-title`} className="withdraw__title">Withdraw from requirement work</h2>
      <p>
        Every publication of this document leaves search at once. Requirements that cite it are told their source
        changed, and their owners decide whether to keep or revise what they wrote.
      </p>
      <label className="field" htmlFor={`${id}-reason`}>
        <span className="field__label">Why is this source no longer safe to rely on?</span>
        <textarea id={`${id}-reason`} className="field__input" rows={3} maxLength={2000} required
          value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <p className="withdraw__actions">
        <button type="submit" className="action-button" disabled={!reason.trim() || hook.withdraw.isPending}>
          {hook.withdraw.isPending
            ? "Withdrawing…"
            : document.is_owner ? "Withdraw it" : `Withdraw it on ${document.owner.display_name}’s behalf`}
        </button>
        <button type="button" className="text-button" onClick={onDone}>Keep it in service</button>
      </p>
    </form>
  );
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "changed", label: "Changed" },
  { key: "flagged", label: "Flagged" },
  { key: "excluded", label: "Excluded" },
  { key: "removed", label: "Removed" },
];

function Review({ document, version, hook, review, setReview }: {
  document: LibraryDocument;
  version: LibraryVersion;
  hook: Hook;
  review: ReviewState;
  setReview: DocumentContext["setReview"];
}) {
  const revision = latestRevision(version);
  const drafts = review.drafts;
  const summary = review.summary;
  const setSummary = (value: string) => setReview((current) => ({ ...current, summary: value }));
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [focus, setFocus] = useState<Focus | null>(null);
  const summaryId = useId();

  const basis = comparisonBasis(document);
  const rows = useMemo(() => reviewRows(document, version, drafts), [document, version, drafts]);
  const tally = counts(rows, basis.kind);
  const visible = useMemo(() => rows.filter((row) => matches(row, filter, find)), [rows, filter, find]);
  const dirty = unsaved(version, drafts);
  const identical = isTheEdition(document, version, dirty);
  const problems = saveProblems(version, drafts, summary);
  const blocker = approvalBlocker(document, version, dirty);
  const failure = [hook.review, hook.approve].find((mutation) => mutation.isError)?.error;
  const fileWarnings = version.warning_details.filter((warning) => !warning.block_id);

  const change = (blockId: string, patch: Partial<Draft>) =>
    setReview((current) => {
      const draft = current.drafts[blockId];
      return draft ? { ...current, drafts: { ...current.drafts, [blockId]: { ...draft, ...patch } } } : current;
    });

  const basisLabel = basis.kind === "edition"
    ? `In service · version ${basis.version.number}`
    : "As extracted";
  const workingLabel = basis.kind === "edition" ? `Working copy · version ${version.number}` : "Reviewed";

  const save = () => hook.review.mutate(
    { versionId: version.id, body: reviewBody(version, drafts, summary, document.version) },
    { onSuccess: () => setSummary("") },
  );

  return (
    <>
      <section className="notice-table" aria-labelledby="changes-title">
        <h2 id="changes-title" className="notice-table__title">
          {identical
            ? "The working copy is the edition in service. Nothing changed since it was approved; it holds:"
            : basis.kind === "edition" ? "Changes from the edition in service" : "First edition: what the review holds"}
        </h2>
        <dl className="notice-table__grid">
          {(identical
            ? [["In service", tally.all - tally.excludedAll - tally.removed], ["Excluded", tally.excludedAll], ["Flagged", tally.flagged]]
            : basis.kind === "edition"
              ? [["Edited", tally.edited], ["Leaving the edition", tally.excluded], ["New", tally.new], ["Removed", tally.removed], ["Flagged", tally.flagged]]
              : [["Edited", tally.edited], ["Excluded", tally.excludedAll], ["Flagged", tally.flagged]]
          ).map(([label, value]) => (
            <div key={label} className="notice-table__item">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div className={tally.blocking > 0 ? "notice-table__item is-blocking" : "notice-table__item"}>
            <dt>Blocking approval</dt>
            <dd>{tally.blocking}</dd>
          </div>
        </dl>
        <p className="notice-table__total">{count(tally.all, "passage")} in version {version.number}.</p>
        {fileWarnings.length > 0 && (
          <ul className="file-warnings" aria-label="About the whole file">
            {fileWarnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`} className={warning.severity === "blocking" ? "is-blocking" : undefined}>
                <span className="status">
                  {warning.severity === "blocking" ? "Blocking, whole file" : warning.severity === "warning" ? "Warning, whole file" : "Note, whole file"}
                </span>{" "}
                {warning.message}
                {warning.severity === "blocking" && " A warning about the whole file cannot be cleared by excluding passages; upload a new version."}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="filters">
        <div className="filters__set" role="group" aria-label="Show passages">
          {FILTERS.filter((item) => item.key !== "removed" || basis.kind === "edition").map((item) => {
            const n = item.key === "all" ? tally.all
              : item.key === "changed" ? tally.edited + tally.new + tally.removed
              : item.key === "flagged" ? tally.flagged
              : item.key === "excluded" ? tally.excludedAll : tally.removed;
            return (
              <button
                key={item.key}
                type="button"
                className="filter"
                aria-pressed={filter === item.key}
                onClick={() => { setFilter(item.key); setShown(PAGE); }}
              >
                {item.label} <span className="filter__count">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="field field--inline">
          <span className="field__label">Find in passages</span>
          <input type="search" className="field__input" value={find} onChange={(event) => { setFind(event.target.value); setShown(PAGE); }} />
        </label>
      </div>
      <p className="keys">
        Keys on a passage: <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>Enter</kbd> open, <kbd>x</kbd> exclude,{" "}
        <kbd>i</kbd> include, <kbd>e</kbd> edit, <kbd>o</kbd> original, <kbd>Esc</kbd> close.
      </p>

      {visible.length > 0 ? (
        <PassageTable
          documentId={document.id}
          versionId={version.id}
          versionNumber={version.number}
          rows={visible}
          shown={shown}
          onMore={() => setShown((current) => current + PAGE)}
          basisLabel={basisLabel}
          workingLabel={workingLabel}
          focus={focus}
          onFocus={setFocus}
          onChange={change}
        />
      ) : (
        <p className="timetable__quiet">No passage matches.</p>
      )}

      <form
        className="savebar"
        aria-label="Save and approve the review"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <p className="savebar__state" aria-live="polite">
          {dirty > 0 ? <strong>{dirty} unsaved {dirty === 1 ? "change" : "changes"}</strong> : revision ? "All changes saved" : "Not yet saved"}
          {revision && <> · revision {version.revisions.length} saved {formatDay(revision.created_at)}</>}
        </p>
        <label className="field field--inline savebar__summary" htmlFor={summaryId}>
          <span className="field__label">Review summary</span>
          <input id={summaryId} className="field__input" maxLength={2000} value={summary}
            onChange={(event) => setSummary(event.target.value)} placeholder="What you checked, and what you changed" />
        </label>
        <button type="submit" className="action-button" disabled={problems.length > 0 || hook.review.isPending}
          aria-describedby={problems.length ? `${summaryId}-problems` : undefined}>
          {hook.review.isPending ? "Saving…" : "Save review"}
        </button>
        <button
          type="button"
          className="action-button action-button--secondary"
          disabled={blocker !== null || hook.approve.isPending}
          aria-describedby={blocker ? `${summaryId}-blocker` : undefined}
          onClick={() => revision && hook.approve.mutate({ versionId: version.id, revisionId: revision.id })}
        >
          {hook.approve.isPending
            ? "Approving…"
            : document.is_owner ? "Approve and publish" : `Approve on ${document.owner.display_name}’s behalf`}
        </button>
        {((problems.length > 0 && (dirty > 0 || !revision)) || blocker) && (
          <p className="savebar__why">
            {problems.length > 0 && (dirty > 0 || !revision) && <span id={`${summaryId}-problems`}>{problems.join(" ")} </span>}
            {blocker && <span id={`${summaryId}-blocker`}>{blocker}</span>}
          </p>
        )}
        {failure ? <Failure error={failure} onReload={hook.reload} /> : null}
      </form>
    </>
  );
}
