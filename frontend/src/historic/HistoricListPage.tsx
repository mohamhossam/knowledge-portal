import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCw, Upload } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { api, type HistoricStatus, type HistoricSummary } from "../api/client";
import { errorMessage } from "../api/errors";
import { count, formatDay } from "../home/format";
import { KnowledgePage } from "../requirements/knowledgeHead";
import { citedBy, HISTORIC_LIST_KEY, historicHref, standing, useHistoricList } from "./historic";

const MAX_FILES = 20;
const ACCEPTED = ".docx,.pdf";

const FILTERS: { key: HistoricStatus | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "withdrawn", label: "Withdrawn" },
];

/**
 * Table 4's historic Requirements: old BRDs imported with their Azure DevOps breakdown, as
 * reference knowledge (Knowledge Center E). Drafts wait on a curator; published ones reach
 * requirement work as prior art.
 */
export function HistoricListPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("status");
  const status: HistoricStatus | null = asked === "draft" || asked === "published" || asked === "withdrawn" ? asked : null;
  const setStatus = (value: HistoricStatus | null) =>
    setParams(value ? { status: value } : {}, { replace: true });
  const [find, setFind] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(find.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [find]);
  const pages = useHistoricList(status, query);
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = pages.data?.pages[0]?.counts;
  const total = counts ? counts.draft + counts.published + counts.withdrawn : undefined;
  const tally = (key: HistoricStatus | null) => (counts ? (key ? counts[key] : total) : undefined);

  return (
    <KnowledgePage page="Historic">
      <section className="govsection" aria-labelledby="historic-title">
        <h2 id="historic-title" className="govsection__title">Historic requirements</h2>
        <p className="govsection__lead">
          Old BRDs with the Epics, Features and User Stories they were delivered as in Azure DevOps. Once published,
          they reach requirement work as prior art: reference, never a decision. Nothing is written to Azure DevOps.
        </p>
        {notice && <p className="toolbar__notice" role="status">{notice}</p>}
        <div className="filters">
          <div className="filters__set" role="group" aria-label="Show historic requirements">
            {FILTERS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="filter"
                aria-pressed={status === item.key}
                onClick={() => setStatus(item.key)}
              >
                {item.label}
                {tally(item.key) !== undefined && (
                  <>
                    <span className="visually-hidden">, </span>
                    <span className="filter__count">{tally(item.key)}</span>
                  </>
                )}
              </button>
            ))}
          </div>
          <label className="field field--inline">
            <span className="field__label">Find a title</span>
            <input type="search" className="field__input" maxLength={200} value={find} onChange={(event) => setFind(event.target.value)} />
          </label>
        </div>
        {pages.isError ? (
          <p className="docpage__failure" role="alert">
            The knowledge service did not answer: {errorMessage(pages.error)}
            <button type="button" className="text-button" onClick={() => void pages.refetch()}>
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          </p>
        ) : pages.isPending ? (
          <p className="timetable__quiet">Reading historic requirements…</p>
        ) : items.length === 0 ? (
          <p className="timetable__quiet">
            {query || status ? (
              <>
                No historic requirement matches.{" "}
                <button type="button" className="text-button" onClick={() => { setFind(""); setQuery(""); setStatus(null); }}>
                  Show all
                </button>
              </>
            ) : "None yet. Import the first BRDs below."}
          </p>
        ) : (
          <table className="govtable historic__table">
            <caption className="visually-hidden">Historic requirements, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">State</th>
                <th scope="col" className="cell--end cell--p2">BRDs</th>
                <th scope="col" className="cell--end cell--p2">Work items</th>
                <th scope="col" className="cell--end cell--p2">Cited by</th>
                <th scope="col" className="cell--end cell--p3">State since</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => <HistoricRow key={item.id} item={item} />)}
            </tbody>
          </table>
        )}
        {pages.hasNextPage && (
          <p className="govsection__actions">
            <button type="button" className="text-button" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
              {pages.isFetchingNextPage ? "Reading…" : "Show more"}
            </button>
          </p>
        )}
      </section>
      <ImportBrds />
    </KnowledgePage>
  );
}

function since(item: HistoricSummary): string | null | undefined {
  return item.withdrawn_at ?? item.published_at ?? item.created_at;
}

function HistoricRow({ item }: { item: HistoricSummary }) {
  const { rank, status, detail } = standing(item);
  return (
    <tr className={`row row--${rank}`}>
      <th scope="row" aria-label={item.title}>
        <Link to={historicHref(item.id)} dir="auto">{item.title}</Link>
        {/* BRDs, work items and citations leave the grid on phones; they stay with the title. */}
        <span className="secondary govtable__by historic__narrow">
          {count(item.brds, "BRD")}{item.work_items > 0 ? ` · ${count(item.work_items, "work item")}` : ""}
          {item.citations ? ` · cited by ${count(item.citations, "requirement")}` : ""}
        </span>
      </th>
      <td>
        <span className="status">{status}</span>
        {detail && <span className="secondary govtable__by">{detail}</span>}
      </td>
      <td className="cell--end cell--p2">{item.brds}</td>
      <td className="cell--end cell--p2">{item.work_items || "—"}</td>
      <td className="cell--end cell--p2">{citedBy(item.citations)}</td>
      <td className="cell--end cell--p3">{formatDay(since(item))}</td>
    </tr>
  );
}

type Result = { filename: string; outcome: string; id?: string | null; title?: string | null; reason?: string | null };

/** Several BRDs at once: each starts its own draft, or is refused with why. */
function ImportBrds() {
  const id = useId();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[] | null>(null);
  const importing = useMutation({
    mutationFn: () => api.importHistoric(files),
    onSuccess: (response) => {
      setResults(response.results.map((item) => ({
        filename: item.filename,
        outcome: item.outcome,
        id: item.version_id,
        title: item.title,
        reason: item.reason,
      })));
      setFiles([]);
      if (input.current) input.current.value = "";
      void queryClient.invalidateQueries({ queryKey: HISTORIC_LIST_KEY });
    },
  });
  const waits = files.length === 0
    ? "Choose the BRDs first."
    : files.length > MAX_FILES ? `Choose at most ${MAX_FILES} at a time.` : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!waits && !importing.isPending) importing.mutate();
  };
  return (
    <form className="add historic__import" aria-labelledby={`${id}-title`} onSubmit={submit}>
      <h2 id={`${id}-title`} className="add__title">Import old BRDs</h2>
      <p className="add__lead">
        Word (.docx) or PDF, up to 10 MB each and {MAX_FILES} at a time. Each starts its own draft and is read; work-item
        ids it mentions are suggested for you to confirm. A Word 97–2003 .doc file needs saving as .docx first.
      </p>
      <label className="field" htmlFor={`${id}-files`}>
        <span className="field__label">BRDs</span>
        <input
          ref={input}
          id={`${id}-files`}
          type="file"
          multiple
          className="field__input field__input--file"
          accept={ACCEPTED}
          onChange={(event) => { setFiles([...(event.target.files ?? [])]); setResults(null); }}
        />
      </label>
      <p className="add__actions">
        <button type="submit" className="action-button" aria-disabled={!!waits || importing.isPending || undefined} aria-describedby={waits ? `${id}-waits` : undefined}>
          <Upload size={16} aria-hidden="true" />
          {importing.isPending ? "Importing…" : files.length > 1 ? `Import the ${files.length} BRDs` : files.length === 1 ? "Import the BRD" : "Import the BRDs"}
        </button>
      </p>
      {waits && <p id={`${id}-waits`} className="versions__waits">{waits}</p>}
      {importing.isError && <p className="docpage__failure" role="alert">{errorMessage(importing.error)}</p>}
      {results && <ImportResults results={results} />}
    </form>
  );
}

function ImportResults({ results }: { results: Result[] }) {
  const started = results.filter((item) => item.outcome === "added").length;
  const summary = useRef<HTMLParagraphElement>(null);
  // The outcome takes focus once, so the reader goes on from it.
  useEffect(() => summary.current?.focus(), []);
  return (
    <div className="uploads">
      <p ref={summary} tabIndex={-1} className="uploads__summary" role="status">
        {started} of {count(results.length, "BRD")} imported{started > 0 ? "; each is being read." : "."}
      </p>
      <ul className="uploads__list">
        {results.map((item, index) => (
          <li key={`${index}-${item.filename}`} className={`uploads__item uploads__item--${item.outcome === "added" ? "reading" : "refused"}`}>
            <span className="uploads__name" dir="auto">
              {item.outcome === "added" && item.id ? <Link to={historicHref(item.id)}>{item.filename}</Link> : item.filename}
            </span>
            <span className="status">{item.outcome === "added" ? "Imported" : "Refused"}</span>
            {item.reason && <span className="secondary uploads__why">{item.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
