import { ArrowRight, RotateCw } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { Suggestion, SuggestionContent } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { count } from "../home/format";
import { CatalogueFile } from "./CatalogueFile";
import { DraftChangeRequests } from "./ChangeRequests";
import { DraftDocuments } from "./DraftDocuments";
import { type RowFocus, SuggestionRow } from "./SuggestionRow";
import {
  type Filter, type SuggestionGroup, bulkAcceptable, changeSentence, inWords, lexicon, matchesFind, shown,
  suggestionGroups, suggestionState, tally,
} from "./suggestions";
import { useCatalogueContext } from "./useCatalogue";
import { useDraft } from "./useDraft";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "waiting", label: "Waiting" },
  { key: "decide", label: "Needs your decision" },
  { key: "waits", label: "Waits for another" },
  { key: "decided", label: "Decided" },
  { key: "all", label: "All" },
];

const KEPT = "Your edits are kept while this page stays open.";

/**
 * A draft's suggestions, gathered under the systems they would change: new
 * systems first, then the systems the draft has, then domains, channels,
 * offerings and journeys. Decided from the keyboard or by pointer.
 *
 * Keys on a suggestion: j or ↓ next, k or ↑ previous, Enter open or close,
 * a accept, r reject, e edit then accept, Esc stop editing, then close.
 */
/** "2 documents and 1 change request": where the suggestions came from. */
function sourcesInWords(suggestions: Suggestion[]): string {
  const documents = new Set(suggestions.filter((item) => !item.change_request).map((item) => item.document_version_id)).size;
  const requests = new Set(suggestions.filter((item) => item.change_request).map((item) => item.document_version_id)).size;
  return [documents || !requests ? count(documents, "document") : "", requests ? count(requests, "change request") : ""]
    .filter(Boolean)
    .join(" and ");
}

export function SuggestionsPage() {
  const { book } = useCatalogueContext();
  if (book.release.status !== "draft") {
    return <p className="timetable__quiet catalogue__first">Sources are worked on a version in preparation; this one is published.</p>;
  }
  return <Suggestions />;
}

function Suggestions() {
  const { book, actorName } = useCatalogueContext();
  const release = book.release;
  const draft = useDraft(release);
  const all = useMemo(() => draft.suggestions.data?.suggestions ?? [], [draft.suggestions.data]);
  // Arriving from a change request read into the draft, the page says what the reading made.
  const arrived = (useLocation().state as { notice?: string } | null)?.notice ?? null;
  const words = useMemo(() => lexicon(release, all), [release, all]);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [find, setFind] = useState("");
  const [focus, setFocus] = useState<RowFocus | null>(null);
  const [said, say] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Edits made in a suggestion's editor and not yet accepted: closing the row or stopping never loses them.
  const [edits, setEdits] = useState<Record<string, SuggestionContent>>({});
  const keep = (key: string, content: SuggestionContent | null) =>
    setEdits((current) => {
      if (content ? current[key] === content : !(key in current)) return current;
      const next = { ...current };
      if (content) next[key] = content;
      else delete next[key];
      return next;
    });
  const counts = tally(all);
  const bulk = useMemo(() => bulkAcceptable(release, all), [release, all]);
  const bulkCount = bulk.ready.length + bulk.lifted.length;
  // Groups keep the place they first took this session, so deciding never moves the station being worked.
  const [placed, setPlaced] = useState<string[]>([]);
  const fresh = useMemo(() => suggestionGroups(release, all, words), [release, all, words]);
  const order = useMemo(() => [...placed, ...fresh.map((group) => group.key).filter((key) => !placed.includes(key))], [placed, fresh]);
  // Remembering a new group's place is state derived while rendering, as React prescribes for it.
  if (order.length !== placed.length) setPlaced(order);

  const groups = useMemo(() => {
    const everything = [...fresh].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return everything
      .map((group) => ({
        ...group,
        visible: group.suggestions.filter(
          (item) => shown(item, filter) && matchesFind(item, changeSentence(item, words), group.label, find),
        ),
      }))
      .filter((group) => group.visible.length > 0);
  }, [fresh, order, words, filter, find]);
  const rows = groups.flatMap((group) => group.visible);
  const documents = useMemo(() => new Map(release.documents.map((item) => [item.id, item])), [release.documents]);

  // Keyboard focus follows the focused row's change button, and never leaves the row hidden.
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // Rows remount when a decision moves their group (a new system, once accepted, joins the draft's
  // systems), so focus is put back after every change unless it has gone somewhere else on purpose.
  useEffect(() => {
    if (!focus) return;
    const element = rowRefs.current.get(focus.key);
    const active = document.activeElement;
    // An open row keeps focus where the curator put it (a field, a choice); the foot's link hands it over.
    const ours = active === document.body || active === null || active.closest(focus.open ? ".timetable__next" : ".galley, .timetable__next") !== null;
    if (element && active !== element && ours) {
      element.focus({ preventScroll: true });
      (element.closest("tr") ?? element).scrollIntoView({ block: "nearest" });
    }
  }, [focus, rows]);
  // A row opened near the foot of the view brings its detail up with it, the row itself kept in view,
  // and whatever took focus inside the detail (the editor's title) kept in view too.
  const opened = focus?.open ? focus.key : null;
  useEffect(() => {
    const row = opened ? rowRefs.current.get(opened)?.closest("tr") : null;
    const detail = row?.nextElementSibling;
    if (!row || !(detail instanceof HTMLElement)) return;
    detail.scrollIntoView({ block: "nearest" });
    row.scrollIntoView({ block: "nearest" });
    const active = document.activeElement;
    if (active instanceof HTMLElement && detail.contains(active)) active.scrollIntoView({ block: "nearest" });
  }, [opened]);
  // A focused row that left the view (decided under "Waiting") hands focus to where it stood.
  const lastIndex = useRef(0);
  useEffect(() => {
    if (!focus) return;
    const index = rows.findIndex((row) => row.id === focus.key);
    if (index >= 0) lastIndex.current = index;
    else if (rows.length) setFocus({ key: rows[Math.min(lastIndex.current, rows.length - 1)]!.id, open: false });
    else setFocus(null);
  }, [rows, focus]);

  const nextWaiting = (from: Suggestion) => {
    const start = rows.findIndex((row) => row.id === from.id);
    return rows.slice(start + 1).find((row) => row.status === "proposed") ?? rows.slice(0, start).find((row) => row.status === "proposed");
  };

  const decide = (suggestion: Suggestion, accept: boolean, content?: SuggestionContent | null) => {
    const next = nextWaiting(suggestion);
    say(`${accept ? "Accepting" : "Rejecting"}: ${changeSentence(suggestion, words)}.`);
    void draft.decide({ suggestionId: suggestion.id, accept, content }).then((done) => {
      if (!done) return;
      say(`${accept ? "Accepted" : "Rejected"}: ${changeSentence(suggestion, words)}.`);
      // Edits are dropped only once the decision is taken; a refused one keeps them.
      keep(suggestion.id, null);
    });
    setFocus(next ? { key: next.id, open: false } : null);
  };

  // Leaving an open row never drops its edits; with some kept, it says so, whichever way it was left.
  const leaving = (key: string) => {
    if (focus?.key === key && focus.open && edits[key]) say(`Closed. ${KEPT}`);
  };

  const move = (step: number) => {
    const index = focus ? rows.findIndex((row) => row.id === focus.key) : -1;
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
    if (!next) return;
    if (focus && next.id !== focus.key) leaving(focus.key);
    setFocus({ key: next.id, open: focus?.open ?? false });
  };

  const closeRow = (suggestion: Suggestion) => {
    leaving(suggestion.id);
    setFocus({ key: suggestion.id, open: false });
  };

  const onRowKey = (event: KeyboardEvent<HTMLButtonElement>, suggestion: Suggestion) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const proposed = suggestion.status === "proposed";
    const state = suggestionState(suggestion);
    const open = focus?.key === suggestion.id && focus.open;
    const close = () => closeRow(suggestion);
    const handled = (() => {
      switch (event.key) {
        case "j":
        case "ArrowDown":
          return move(1), true;
        case "k":
        case "ArrowUp":
          return move(-1), true;
        case "Enter":
          return open ? close() : setFocus({ key: suggestion.id, open: true }), true;
        case "Escape":
          return close(), true;
        case "a":
          if (!proposed) return false;
          // A match to choose, a wait to clear or edits kept is decided in the open row.
          if (suggestion.possible_matches.length || state === "waits" || edits[suggestion.id]) return setFocus({ key: suggestion.id, open: true }), true;
          return decide(suggestion, true), true;
        case "r":
          return proposed ? (decide(suggestion, false), true) : false;
        case "e":
          return proposed ? (setFocus({ key: suggestion.id, open: true, editing: true }), true) : false;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };

  const failure = draft.failure ?? draft.acceptReady.error ?? draft.rejectMany.error;
  const conflict = failure instanceof ApiError && failure.status === 409 && failure.code === "architecture_knowledge_conflict";

  return (
    <>
      {arrived && <p className="toolbar__notice" role="status">{arrived}</p>}
      <DraftDocuments release={release} draft={draft} actorName={actorName} />
      <DraftChangeRequests release={release} runs={draft.suggestions.data?.runs ?? []} suggestions={all} />
      <CatalogueFile release={release} />

      <section className="govsection" aria-labelledby="suggestions-title">
        <h2 id="suggestions-title" className="govsection__title">Suggestions</h2>
        {draft.suggestions.isPending ? (
          <p className="timetable__quiet">Reading the suggestions…</p>
        ) : draft.suggestions.isError ? (
          <p className="docpage__failure" role="alert">
            {errorMessage(draft.suggestions.error)}
            <button type="button" className="text-button" onClick={() => void draft.suggestions.refetch()}>
              <RotateCw size={14} aria-hidden="true" />
              Try again
            </button>
          </p>
        ) : all.length === 0 ? (
          <p className="timetable__quiet">No suggestion yet. Add a document above; what it says arrives here to be decided.</p>
        ) : (
          <>
            <div className="notice-table" role="group" aria-labelledby="suggestions-title">
              <dl className="notice-table__grid">
                {([
                  ["Waiting", counts.waiting],
                  ["Ready", counts.ready],
                  ["Needs your decision", counts.decide],
                  ["Waits for another", counts.waits],
                  ...(counts.present ? [["Already in the draft", counts.present] as const] : []),
                  ["Accepted", counts.accepted],
                  ["Rejected", counts.rejected],
                ] as const).map(([label, value]) => (
                  <div key={label} className="notice-table__item">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="notice-table__total">
                {count(counts.all, "suggestion")} from {sourcesInWords(all)}.
              </p>
            </div>

            <div className="govsection__actions">
              <button
                type="button"
                className="action-button"
                disabled={bulkCount === 0 || draft.acceptReady.isPending || draft.pending > 0}
                onClick={() =>
                  draft.acceptReady.mutate(undefined, {
                    onSuccess: (result) =>
                      setNotice(
                        `Accepted ${count(counts.waiting - result.remaining, "suggestion")}. ${
                          result.remaining ? `${result.remaining} still wait for you.` : "Nothing is left waiting."
                        }`,
                      ),
                  })
                }
              >
                {draft.acceptReady.isPending ? "Accepting…" : bulkLabel(bulk.ready.length, bulk.lifted.length)}
              </button>
              <span className="secondary">
                Domains first, then systems, then what hangs on them. Matches, inferred links and replacements stay for you.
              </span>
            </div>

            {notice && <p className="toolbar__notice" role="status">{notice}</p>}
            {failure ? (
              <p className="docpage__failure" role="alert">
                {conflict
                  ? "The draft changed while you decided (someone else, or a reading finishing). Reload it and decide again."
                  : inWords(errorMessage(failure), words)}
                {conflict && (
                  <button type="button" className="text-button" onClick={draft.reload}>
                    <RotateCw size={14} aria-hidden="true" />
                    Reload the draft
                  </button>
                )}
              </p>
            ) : null}
            <p className="visually-hidden" role="status" aria-live="polite">{said}</p>

            <div className="filters">
              <div className="filters__set" role="group" aria-label="Show suggestions">
                {FILTERS.map((item) => {
                  const n = all.filter((suggestion) => shown(suggestion, item.key)).length;
                  return (
                    <button key={item.key} type="button" className="filter" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                      {item.label} <span className="filter__count">{n}</span>
                    </button>
                  );
                })}
              </div>
              <label className="field field--inline">
                <span className="field__label">Find</span>
                <input type="search" className="field__input" value={find} onChange={(event) => setFind(event.target.value)} />
              </label>
            </div>
            <p className="keys">
              Keys on a suggestion: <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>Enter</kbd> open, <kbd>a</kbd> accept,{" "}
              <kbd>r</kbd> reject, <kbd>e</kbd> edit then accept, <kbd>Esc</kbd> stop editing, then close.
            </p>

            {rows.length ? (
              <table className="govtable galley">
                <caption className="visually-hidden">Suggestions, grouped by the system they would change</caption>
                <thead>
                  <tr>
                    <th scope="col">Change</th>
                    <th scope="col" className="galley__state">State</th>
                  </tr>
                </thead>
                {groups.map((group) => (
                  <GroupRows
                    key={group.key}
                    group={group}
                    visible={group.visible}
                    confirming={confirming === group.key}
                    onConfirm={(on) => setConfirming(on ? group.key : null)}
                    busy={draft.pending > 0 || draft.rejectMany.isPending}
                    onAcceptReady={(ready) => {
                      for (const item of ready) void draft.decide({ suggestionId: item.id, accept: true });
                      say(`Accepting ${count(ready.length, "suggestion")} for ${group.label}.`);
                    }}
                    onRejectWaiting={(waiting) =>
                      draft.rejectMany.mutate(waiting.map((item) => item.id), {
                        onSuccess: (result) => {
                          setConfirming(null);
                          say(`Rejected ${count(result.rejected, "suggestion")} for ${group.label}.`);
                        },
                      })
                    }
                  >
                    {group.visible.map((suggestion) => (
                      <SuggestionRow
                        key={suggestion.id}
                        suggestion={suggestion}
                        release={release}
                        words={words}
                        documents={documents}
                        actorName={actorName}
                        focus={focus}
                        focusable={focus ? focus.key === suggestion.id : suggestion === rows[0]}
                        busy={draft.pending > 0}
                        kept={edits[suggestion.id]}
                        toggleRef={(element) => {
                          if (element) rowRefs.current.set(suggestion.id, element);
                          else rowRefs.current.delete(suggestion.id);
                        }}
                        onKeyDown={(event) => onRowKey(event, suggestion)}
                        onFocus={setFocus}
                        onClose={() => closeRow(suggestion)}
                        onKeep={(content) => {
                          keep(suggestion.id, content);
                          if (!content) say("Your edits are dropped.");
                        }}
                        onDecide={(accept, content) => decide(suggestion, accept, content)}
                      />
                    ))}
                  </GroupRows>
                ))}
              </table>
            ) : null}
            {rows.length ? (
              <NextDecision
                first={[...rows, ...all].find((item) => item.status === "proposed" && suggestionState(item) === "decide")}
                waiting={counts.waiting}
                words={words}
                onGo={(item) => {
                  setFilter("waiting");
                  setFind("");
                  setFocus({ key: item.id, open: true });
                }}
              />
            ) : (
              <p className="timetable__quiet">{find ? "Nothing matches." : "No suggestion is in this state."}</p>
            )}
          </>
        )}
      </section>
    </>
  );
}

/** One system's suggestions, under a head that says what the system is and offers its safe ones together. */
function GroupRows({ group, visible, confirming, onConfirm, busy, onAcceptReady, onRejectWaiting, children }: {
  group: SuggestionGroup;
  visible: Suggestion[];
  confirming: boolean;
  onConfirm: (on: boolean) => void;
  busy: boolean;
  onAcceptReady: (ready: Suggestion[]) => void;
  onRejectWaiting: (waiting: Suggestion[]) => void;
  children: ReactNode;
}) {
  const { base } = useCatalogueContext();
  const ready = group.suggestions.filter((item) => suggestionState(item) === "ready");
  const waiting = group.suggestions.filter((item) => item.status === "proposed");
  return (
    <tbody className="galley__group">
      <tr className="galley__head">
        <th scope="colgroup" colSpan={2}>
          <span className="galley__title">
            {group.isNew ? (
              <><span className="galley__new">New system</span> <span dir="auto">{group.label}</span></>
            ) : group.systemId ? (
              <Link to={`${base}/systems/${encodeURIComponent(group.systemId)}`} dir="auto">{group.label}</Link>
            ) : (
              <span dir="auto">{group.label}</span>
            )}
          </span>
          <span className="galley__tally">
            {count(waiting.length, "waiting", "waiting")}
            {visible.length !== group.suggestions.length && ` · ${visible.length} of ${group.suggestions.length} shown`}
          </span>
          <span className="galley__actions">
            {ready.length > 0 && (
              <button type="button" className="text-button" disabled={busy} onClick={() => onAcceptReady(ready)}>
                Accept the {ready.length} ready here
              </button>
            )}
            {waiting.length > 1 && !confirming && (
              <button type="button" className="text-button" disabled={busy} onClick={() => onConfirm(true)}>
                Reject the {waiting.length} waiting here
              </button>
            )}
            {confirming && (
              <span className="galley__confirm" role="group" aria-label={`Reject every waiting suggestion for ${group.label}`}>
                <span>Reject all {waiting.length}? A rejection stays.</span>
                <button type="button" className="text-button galley__reject" disabled={busy} onClick={() => onRejectWaiting(waiting)}>
                  Yes, reject them
                </button>
                <button type="button" className="text-button" onClick={() => onConfirm(false)}>Keep them</button>
              </span>
            )}
          </span>
        </th>
      </tr>
      {children}
    </tbody>
  );
}

/** "Accept the 4 ready and the 11 that wait on them", for the bulk action. */
function bulkLabel(ready: number, lifted: number): string {
  if (ready + lifted === 0) return "Nothing to accept without a decision";
  const first = ready === 1 ? "the one ready" : `the ${ready} ready`;
  if (!lifted) return `Accept ${first}`;
  return `Accept ${first} and the ${lifted} that wait on ${ready === 1 ? "it" : "them"}`;
}

/** The next decision, said as the question it asks. */
function nextDecisionLabel(item: Suggestion, words: ReturnType<typeof lexicon>): string {
  const written = item.possible_matches[0]?.written_as;
  if (written) return `Decide whether “${written}” is a system the draft already has`;
  if (item.basis === "inferred") return `Check the inferred link: ${changeSentence(item, words)}`;
  return `Decide whether to replace what the draft has: ${changeSentence(item, words)}`;
}

/** The galley's foot: the next decision only a person can make, or why there is none. */
function NextDecision({ first, waiting, words, onGo }: {
  first: Suggestion | undefined;
  waiting: number;
  words: ReturnType<typeof lexicon>;
  onGo: (item: Suggestion) => void;
}) {
  if (!first) {
    return (
      <p className="timetable__next timetable__next--quiet">
        {waiting ? `Nothing needs your decision; ${count(waiting, "suggestion")} still ${waiting === 1 ? "waits" : "wait"}.` : "Every suggestion is decided."}
      </p>
    );
  }
  return (
    <p className="timetable__next">
      <button type="button" className="next-button" onClick={() => onGo(first)}>
        {nextDecisionLabel(first, words)}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </p>
  );
}
