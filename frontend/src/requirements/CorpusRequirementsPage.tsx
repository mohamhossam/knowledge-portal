import { useInfiniteQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, type CorpusFilters, type CorpusRequirement, type IndexState } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { LEAVES, REQUIREMENTS_PATH, knowledgeStepHref, useCorpusSummary } from "./knowledge";
import { KnowledgePage } from "./knowledgeHead";

/** How long since a screen before a requirement counts as not screened lately. */
export const STALE_DAYS = 30;

type StateFilter = IndexState | "all";

const STATES: { key: StateFilter; label: string; exceptional: boolean }[] = [
  { key: "all", label: "All", exceptional: false },
  { key: "failed", label: "Stopped indexing", exceptional: true },
  { key: "waiting", label: "Waiting", exceptional: true },
  { key: "current", label: "Current", exceptional: false },
];

const STATE_WORDS: Record<IndexState, string> = {
  current: "Current",
  waiting: "Waiting to be indexed",
  failed: "Stopped indexing",
  rebuild_required: "Waits for the rebuild",
};

const isState = (value: string | null): value is IndexState =>
  value === "current" || value === "waiting" || value === "failed" || value === "rebuild_required";

const screened = (item: CorpusRequirement) => (item.last_screened_at ? formatDay(item.last_screened_at) : "Never");

/**
 * Table 4's corpus, requirement by requirement: identity and state, never content. Read-only:
 * each requirement's owners act on it in requirement work.
 */
export function CorpusRequirementsPage() {
  const [params, setParams] = useSearchParams();
  const state = params.get("state");
  const filters: CorpusFilters = {
    indexState: isState(state) ? state : undefined,
    ownerId: params.get("owner") ?? undefined,
    query: params.get("q") ?? undefined,
    openFindingsOnly: params.get("open") === "1",
    notScreenedForDays: params.get("stale") ? STALE_DAYS : undefined,
  };
  const [find, setFind] = useState(filters.query ?? "");
  const summary = useCorpusSummary();

  const set = (key: string, value: string | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  const clear = () => {
    setFind("");
    setParams(new URLSearchParams(), { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (find.trim() !== (params.get("q") ?? "")) set("q", find.trim() || null);
    }, 300);
    return () => window.clearTimeout(timer);
    // `set` and `params` change with every navigation; only the typed text starts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find]);

  const pages = useInfiniteQuery({
    queryKey: ["knowledge-center", "requirement-corpus", "requirements", filters],
    queryFn: ({ pageParam }) => api.corpusRequirements(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const owner = filters.ownerId ? items.find((item) => item.owner?.id === filters.ownerId)?.owner : undefined;
  const tally = summary.data;
  // The strip's counts are the whole corpus's; once another filter narrows the page they would mislead.
  const otherwiseNarrowed = Boolean(filters.query || filters.openFindingsOnly || filters.notScreenedForDays || filters.ownerId);
  const counts: Partial<Record<StateFilter, number>> = tally && !otherwiseNarrowed
    ? { all: tally.requirements, failed: tally.failed, waiting: tally.waiting, current: tally.current }
    : {};
  const pressed: StateFilter = filters.indexState ?? "all";
  const shown = STATES.filter((item) =>
    !item.exceptional || item.key === pressed || !tally || (item.key === "failed" ? tally.failed : tally.waiting) > 0,
  );
  const narrowed = Boolean(filters.indexState) || otherwiseNarrowed;

  return (
    <KnowledgePage page="Requirements">
      <section className="govsection" aria-labelledby="corpus-requirements-title">
        <h2 id="corpus-requirements-title" className="govsection__title">Every requirement, by title</h2>
        <p className="govsection__lead">
          Whose each requirement is, how its index stands and when it was last screened against the others. Their
          owners act on them in requirement work, where each title leads.
        </p>
        {tally?.rebuild_required && (
          <p className="docpage__notice">
            The embedding model changed. Every requirement waits for the index to be rebuilt in requirement work, so the
            index states below read &ldquo;Waits for the rebuild&rdquo;.
          </p>
        )}
        <div className="filters">
          <div className="filters__set" role="group" aria-label="Show requirements by index">
            {shown.map((item) => (
              <button
                key={item.key}
                type="button"
                className="filter"
                aria-pressed={pressed === item.key}
                onClick={() => set("state", item.key === "all" ? null : item.key)}
              >
                {item.label}
                {counts[item.key] !== undefined && (
                  <>
                    <span className="visually-hidden">, </span>
                    <span className="filter__count">{counts[item.key]}</span>
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
        <div className="filters filters--checks">
          <label className="check">
            <input type="checkbox" checked={filters.openFindingsOnly} onChange={(event) => set("open", event.target.checked ? "1" : null)} />
            With open findings only
          </label>
          <label className="check">
            <input type="checkbox" checked={Boolean(filters.notScreenedForDays)} onChange={(event) => set("stale", event.target.checked ? "1" : null)} />
            Not screened in {STALE_DAYS} days
          </label>
        </div>
        {filters.ownerId && (
          <p className="knowledge__owner">
            {owner ? <>Owned by <strong>{owner.display_name}</strong>.</> : "Narrowed to one owner."}{" "}
            <button type="button" className="text-button" onClick={() => set("owner", null)}>Show every owner&rsquo;s</button>
          </p>
        )}

        {pages.isError ? (
          <p className="docpage__failure" role="alert">
            Requirement work did not answer: {errorMessage(pages.error)}
            <button type="button" className="text-button" onClick={() => void pages.refetch()}>
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          </p>
        ) : pages.isPending ? (
          <p className="timetable__quiet">Asking requirement work…</p>
        ) : items.length === 0 ? (
          <p className="timetable__quiet">
            {narrowed ? (
              <>
                No requirement matches these filters.{" "}
                <button type="button" className="text-button" onClick={clear}>Show all requirements</button>
              </>
            ) : "Requirement work's corpus holds no requirements yet."}
          </p>
        ) : (
          <table className="govtable knowledge__table knowledge__requirements">
            <caption className="visually-hidden">Requirements in requirement work&rsquo;s corpus, by title</caption>
            <thead>
              <tr>
                <th scope="col">Requirement</th>
                <th scope="col" className="knowledge__wide">Index</th>
                <th scope="col" className="knowledge__wide cell--end">Last screened</th>
                <th scope="col" className="cell--end">Open findings</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => <RequirementRow key={item.requirement_id} item={item} />)}
            </tbody>
          </table>
        )}
        {pages.hasNextPage && (
          <p className="govsection__actions">
            <button type="button" className="text-button" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
              {pages.isFetchingNextPage ? "Asking…" : "Show more"}
            </button>
          </p>
        )}
      </section>
    </KnowledgePage>
  );
}

/** A stopped index is a disruption; open findings make a row due; a duplicate is past. */
function rank(item: CorpusRequirement): string {
  if (item.duplicate) return "row--past";
  if (item.index_state === "failed") return "row--delayed";
  return item.open_findings > 0 ? "row--due" : "";
}

function IndexWords({ item }: { item: CorpusRequirement }) {
  // Only a state that needs someone carries the status weight; "Current" is the quiet default.
  return item.index_state === "current"
    ? <>{STATE_WORDS.current}</>
    : <span className="status">{STATE_WORDS[item.index_state]}</span>;
}

function RequirementRow({ item }: { item: CorpusRequirement }) {
  return (
    <tr className={`row ${rank(item)}`}>
      <th scope="row">
        <a href={knowledgeStepHref(item.requirement_id)} className="knowledge__title" dir="auto">
          {item.title}
          <span className="visually-hidden">{LEAVES}</span>
        </a>
        <span className="secondary govtable__by knowledge__owned">
          {item.owner ? (
            <>
              Owned by{" "}
              <Link
                to={`${REQUIREMENTS_PATH}?owner=${encodeURIComponent(item.owner.id)}`}
                className="knowledge__person"
                aria-label={`${item.owner.display_name}: show only their requirements`}
              >
                {item.owner.display_name}
              </Link>
            </>
          ) : "No owner"}
          {item.duplicate && " · closed as a duplicate"}
        </span>
        {/* On phones the two state columns fold into this line, as the Kept Column Rule asks. */}
        <span className="secondary govtable__by knowledge__narrow">
          <IndexWords item={item} /> · screened {screened(item)}
        </span>
      </th>
      <td className="knowledge__wide"><IndexWords item={item} /></td>
      <td className="knowledge__wide cell--end">{screened(item)}</td>
      <td className="cell--end">
        {item.open_findings > 0 ? <span className="status">{item.open_findings}</span> : "0"}
      </td>
    </tr>
  );
}
