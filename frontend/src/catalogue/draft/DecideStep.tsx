import { Network } from "lucide-react";
import { type MouseEvent, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import type { Suggestion, SuggestionContent } from "../../api/client";
import { ApiError, errorMessage } from "../../api/errors";
import {
  BulkActionBar, Button, type Column, ConsequencePanel, DataTable, EmptyState, FilterStrip, KeysHint, Lines, Skeleton,
  SplitPane, Status,
} from "../../design/components";
import { useDisclosure, useFocusAfterRender } from "../../design/hooks";
import { count } from "../../home/format";
import { densityFor, usePreferences } from "../../shell/preferences";
import { ButtonLink } from "../../shell/links";
import { openShortcuts } from "../../shell/shortcuts";
import {
  type Blocker, type Filter, type SuggestionGroup, blockers as deadEnds, realisedByKey, bulkAcceptable, changeSentence, decideWhy, dependencyEdges, draftedForRequirement, featureWarnings, fromCatalogue, inWords, lexicon,
  matchesFind, shown as inFilter, suggestionGroups, suggestionState, tally, waitsFor,
} from "../suggestions";
import { useCatalogueContext } from "../useCatalogue";
import { useDraft } from "../useDraft";
import { STATE_TONE, citedPart, stateWords } from "./decide";
import { DecisionTree } from "./DecisionTree";
import { type Answer, type DraftChoices, settleRequest } from "./MissingThings";
import { NextStep } from "./NextStep";
import { Said } from "./parts";
import { decideQuestions } from "./questions";
import { SuggestionPane } from "./SuggestionPane";

const FILTERS: Filter[] = ["waiting", "ready", "decide", "waits", "decided", "all"];
const FILTER_LABEL: Record<Filter, string> = {
  waiting: "Waiting",
  ready: "Ready to accept",
  decide: "Needs your decision",
  waits: "Can't be accepted yet",
  decided: "Decided",
  all: "All",
};

type Row = { suggestion: Suggestion; group: SuggestionGroup; sentence: string };

const KEPT = "Your edits are kept while this page stays open.";

/**
 * Step 2 of a draft: deciding what its sources suggest, at a desk like the
 * library's review desk. The suggestions in a keyboard grid, grouped by the
 * system they would change, beside a pane with the one in hand: what it would
 * change, where it comes from and the decision. Decisions are sent one after
 * another, each on the revision the one before returned.
 *
 * Keys in the grid: ↑ ↓ j k move, Enter goes to the decision, a accept,
 * r reject, e edit then accept, n the next that needs a person, Space select.
 */
export function DecideStep() {
  const { book } = useCatalogueContext();
  if (book.release.status !== "draft") return null;
  return <Decide />;
}

function Decide() {
  const { book, actorName, base } = useCatalogueContext();
  const release = book.release;
  const draft = useDraft(release);
  const { density } = usePreferences();
  const focusLater = useFocusAfterRender();
  const all = useMemo(() => draft.suggestions.data?.suggestions ?? [], [draft.suggestions.data]);
  // Arriving from a change request read into the draft, the page says what the reading made.
  const arrived = (useLocation().state as { notice?: string } | null)?.notice ?? null;
  const words = useMemo(() => lexicon(release, all), [release, all]);
  const [params, setParams] = useSearchParams();
  // What is shown lives in the address, so a reload or a shared link keeps it.
  const filter = (FILTERS.find((item) => item === params.get("show")) ?? "waiting") as Filter;
  const find = params.get("find") ?? "";
  const setView = useCallback((next: Filter, text: string) => {
    setParams((previous) => {
      const query = new URLSearchParams(previous);
      if (next === "waiting") query.delete("show");
      else query.set("show", next);
      if (text) query.set("find", text);
      else query.delete("find");
      return query;
    }, { replace: true });
  }, [setParams]);
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState(false);
  // The chains of waiting suggestions, drawn on request: the desk keeps its rows on arrival.
  const [chains, setChains] = useState(false);
  const [said, setSaid] = useState<{ text: string; failed?: boolean } | null>(null);
  // Edits made in a suggestion's editor and not yet accepted: moving on never loses them.
  const [edits, setEdits] = useState<Record<string, SuggestionContent>>({});
  const keep = useCallback((key: string, content: SuggestionContent | null) =>
    setEdits((current) => {
      if (content ? current[key] === content : !(key in current)) return current;
      const next = { ...current };
      if (content) next[key] = content;
      else delete next[key];
      return next;
    }), []);
  const desk = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rejecting = useDisclosure(() => desk.current?.querySelector<HTMLElement>("tr.is-current [data-cell-focus]") ?? null);
  const accepting = useDisclosure(() => desk.current?.querySelector<HTMLElement>("tr.is-current [data-cell-focus]") ?? null);
  // What accepting the ready ones will take, fixed when its panel opens: what is listed is what is sent.
  const [acceptSet, setAcceptSet] = useState<Suggestion[]>([]);

  const counts = tally(all);
  const bulk = useMemo(() => bulkAcceptable(release, all), [release, all]);
  const bulkCount = bulk.ready.length + bulk.lifted.length;
  const readyIds = useMemo(() => new Set([...bulk.ready, ...bulk.lifted].map((item) => item.id)), [bulk]);
  const stuck = useMemo(() => deadEnds(release, all, words), [release, all, words]);
  // Focus mode asks once for every suggestion naming the same system: count its questions, not the suggestions.
  const questions = useMemo(() => decideQuestions(all, words).length, [all, words]);
  // What the draft already holds, for saying a missing name is one of them.
  const choices = useMemo<DraftChoices>(() => ({
    systems: release.systems.filter((system) => !system.deprecated).map((system) => ({ id: system.id, name: system.name, aliases: system.aliases })),
    specifications: (release.realisations ?? []).flatMap((item) =>
      item.layer === "resource" ? [] : [{ id: item.id, name: item.name, aliases: item.aliases ?? [], layer: item.layer }],
    ),
    channels: (release.channels ?? []).map((item) => ({ id: item.id, name: item.name })),
    offerings: (release.products ?? []).map((item) => ({ id: item.id, name: item.name, code: item.code, order_types: item.order_types })),
  }), [release]);
  // Each waiting suggestion that waits on a dead end, with what it waits for in words.
  const deadEndOf = useMemo(() => new Map(stuck.flatMap((blocker) => blocker.waiting.map((item) => [item.id, blocker.label] as const))), [stuck]);
  // "What waits for what" earns its place only when a suggestion waits on another one.
  const chained = useMemo(() => dependencyEdges(all).length > 0, [all]);
  // With nothing to accept or decide, only the keys that still act are shown.
  const acting = counts.decide > 0 || bulkCount > 0;
  const notes = useMemo(() => featureWarnings(draft.suggestions.data?.runs ?? []), [draft.suggestions.data]);
  const documents = useMemo(() => new Map(release.documents.map((item) => [item.id, item])), [release.documents]);

  // Groups keep the place they first took this session, so deciding never moves the system being worked.
  const [placed, setPlaced] = useState<string[]>([]);
  const fresh = useMemo(() => suggestionGroups(release, all, words), [release, all, words]);
  const order = useMemo(() => [...placed, ...fresh.map((group) => group.key).filter((key) => !placed.includes(key))], [placed, fresh]);
  // Remembering a new group's place is state derived while rendering, as React prescribes for it.
  if (order.length !== placed.length) setPlaced(order);
  const rows = useMemo<Row[]>(
    () =>
      [...fresh]
        .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
        .flatMap((group) => group.suggestions.map((suggestion) => ({ suggestion, group, sentence: changeSentence(suggestion, words) }))),
    [fresh, order, words],
  );
  // The suggestion in hand stays listed while it is worked on, even once it no longer matches the filter.
  const shown = useMemo(
    () => rows.filter((row) => row.suggestion.id === currentId || (inFilter(row.suggestion, filter, readyIds) && matchesFind(row.suggestion, row.sentence, row.group.label, find))),
    [rows, currentId, filter, find, readyIds],
  );
  const current = shown.find((row) => row.suggestion.id === currentId) ?? shown[0];

  const cellOf = (id: string) => desk.current?.querySelector<HTMLElement>(`tr[data-row-id="${CSS.escape(id)}"] [data-cell-focus]`) ?? null;
  const focusRow = (id: string) => focusLater(() => cellOf(id));
  const say = (text: string, failed = false) => setSaid({ text, failed });
  // What settling a missing thing did, said beside the missing things themselves.
  const [settled, setSettled] = useState<{ text: string; failed?: boolean } | null>(null);

  const move = (id: string) => {
    if (id === currentId) return;
    if (currentId && edits[currentId] && editing) say(`Moved on. ${KEPT}`);
    setCurrentId(id);
    setEditing(false);
  };

  /** The next waiting suggestion after this one, in the list as shown. */
  const nextWaiting = (from: Suggestion) => {
    const start = shown.findIndex((row) => row.suggestion.id === from.id);
    const waiting = (row: Row) => row.suggestion.id !== from.id && row.suggestion.status === "proposed";
    return shown.slice(start + 1).find(waiting) ?? shown.slice(0, Math.max(start, 0)).find(waiting);
  };

  const decide = (row: Row, accept: boolean, content: SuggestionContent | null | undefined, from: "grid" | "pane") => {
    const next = nextWaiting(row.suggestion);
    say(`${accept ? "Accepting" : "Rejecting"}: ${row.sentence}.`);
    void draft.decide({ suggestionId: row.suggestion.id, accept, content }).then((done) => {
      if (!done) return;
      say(`${accept ? "Accepted" : "Rejected"}: ${row.sentence}.`);
      // Edits are dropped only once the decision is taken; a refused one keeps them.
      keep(row.suggestion.id, null);
    });
    setEditing(false);
    if (!next) {
      // The last one waiting: the list may empty under the filter; the pane's heading keeps focus in place.
      if (from === "pane") focusLater(() => heading.current);
      return;
    }
    setCurrentId(next.suggestion.id);
    if (from === "grid") focusRow(next.suggestion.id);
    else focusLater(() => heading.current);
  };

  const toPane = () => focusLater(() => desk.current?.querySelector<HTMLElement>(".ds-split__pane input, .ds-split__pane .ds-button"));
  // Stacked (a narrow screen), the pane sits under every listed suggestion: a row tapped (not its
  // checkbox) brings the pane into view and moves focus to its heading, as Enter moves it into the pane.
  const tapped = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".ds-split__list tr[data-row-id]") || target.closest("input, button, a, label")) return;
    focusLater(() => {
      const list = desk.current?.querySelector<HTMLElement>(".ds-split__list")?.getBoundingClientRect();
      const pane = desk.current?.querySelector<HTMLElement>(".ds-split__pane");
      if (!list || !list.height || !pane || pane.getBoundingClientRect().top < list.bottom - 1) return null;
      pane.scrollIntoView({ block: "start" });
      return heading.current;
    });
  };
  const edit = () => {
    setEditing(true);
    focusLater(() => desk.current?.querySelector<HTMLElement>(".draft-legacy input, .draft-legacy textarea, .draft-legacy select"));
  };

  const onRowKey = (row: Row, key: string) => {
    const proposed = row.suggestion.status === "proposed";
    if (key === "n") {
      const next = shown.find((each, index) => index > shown.indexOf(row) && each.suggestion.status === "proposed" && suggestionState(each.suggestion) === "decide")
        ?? shown.find((each) => each.suggestion.status === "proposed" && suggestionState(each.suggestion) === "decide");
      if (!next) say("Nothing listed here needs your decision.");
      else {
        move(next.suggestion.id);
        focusRow(next.suggestion.id);
      }
      return true;
    }
    if (!proposed) return false;
    if (key === "a") {
      // A match to choose, a wait to clear or edits kept is decided in the pane.
      if (row.suggestion.possible_matches.length || suggestionState(row.suggestion) === "waits" || edits[row.suggestion.id]) {
        say(row.suggestion.possible_matches.length ? "Choose first whether the name means a system the draft has." : "Decide it in the pane.");
        toPane();
      } else decide(row, true, null, "grid");
      return true;
    }
    if (key === "r") {
      decide(row, false, null, "grid");
      return true;
    }
    if (key === "e") {
      edit();
      return true;
    }
    return false;
  };

  // The grid's handlers are stable and read the latest state when a key arrives.
  const handlers = useRef({ move, onRowKey, toPane });
  useLayoutEffect(() => {
    handlers.current = { move, onRowKey, toPane };
  });
  const onCurrentChange = useCallback((id: string) => handlers.current.move(id), []);
  const onGridKey = useCallback((row: Row, key: string) => handlers.current.onRowKey(row, key), []);
  const onActivate = useCallback(() => handlers.current.toPane(), []);

  /** Opens the panel that lists what accepting the ready ones takes; nothing is sent until it is confirmed. */
  const askToAcceptReady = () => {
    setAcceptSet([...bulk.ready, ...bulk.lifted]);
    accepting.show();
  };
  const acceptReady = () => {
    const ids = acceptSet.map((item) => item.id);
    draft.acceptReady.mutate(ids, {
      onSuccess: (result) => {
        const accepted = counts.waiting - result.remaining;
        const missed = ids.length - accepted;
        say(
          `Accepted ${count(accepted, "suggestion")}.`
          + (missed > 0 ? ` ${count(missed, "listed one")} couldn't apply and ${missed === 1 ? "waits" : "wait"} for you to decide.` : "")
          + (result.remaining ? ` ${result.remaining} still wait for you.` : " Nothing is left waiting."),
        );
        accepting.close();
      },
    });
  };
  /** Settles a missing thing as the person answered it, and says what that did. */
  const answer = (blocker: Blocker, chosen: Answer) => {
    if (chosen.kind === "without_link") {
      dropLink(blocker);
      return;
    }
    draft.settleSubject.mutate(settleRequest(blocker, chosen), {
      onSuccess: (result) => setSettled({ text: settledWords(blocker, chosen, result) }),
      onError: (error) => setSettled({ text: inWords(errorMessage(error), words), failed: true }),
    });
  };
  /** The pane's own answer for the suggestion in hand: its name is a system, or an offering. */
  const settle = (reference: string, name: string, kind: "system" | "offering") =>
    answer({ key: `${kind}:${reference}`, kind, reference, name, label: name, waiting: [] }, { kind });
  /** Accepts what waits on a record named in the wrong layer, without naming it as what realises them. */
  const dropLink = (blocker: Blocker) => {
    const { key } = blocker;
    const edited = blocker.waiting.flatMap((item) => {
      const record = item.content.realisation;
      if (!record) return [];
      const kept = record.realised_by.filter((reference) => !realisedByKey(record.layer, reference).includes(key));
      return [{ item, content: { ...item.content, realisation: { ...record, realised_by: kept } } }];
    });
    setSettled({ text: `Accepting ${count(edited.length, "suggestion")} without ${blocker.name} as what realises them.` });
    void Promise.all(edited.map(({ item, content }) => draft.decide({ suggestionId: item.id, accept: true, content }))).then((done) => {
      const accepted = done.filter(Boolean).length;
      setSettled({
        text: `Accepted ${count(accepted, "suggestion")} without ${blocker.name}${accepted < edited.length ? `; ${edited.length - accepted} couldn't apply and wait for you` : ""}.`,
        failed: accepted < edited.length,
      });
    });
  };
  const showWaiting = (blocker: Blocker) => {
    setView("waits", blocker.name);
    const first = blocker.waiting[0];
    if (first) {
      move(first.id);
      focusRow(first.id);
    }
  };
  const rejectWaiting = (blocker: Blocker) => {
    setSelected(new Set(blocker.waiting.map((item) => item.id)));
    rejecting.show();
  };

  const chosen = rows.filter((row) => selected.has(row.suggestion.id) && row.suggestion.status === "proposed");
  const chosenReady = chosen.filter((row) => suggestionState(row.suggestion) === "ready");
  const failure = draft.failure ?? draft.acceptReady.error ?? draft.rejectMany.error;
  const conflict = failure instanceof ApiError && failure.status === 409 && failure.code === "architecture_knowledge_conflict";
  const busy = draft.pending > 0 || draft.acceptReady.isPending || draft.rejectMany.isPending;

  if (draft.suggestions.isPending) return <Skeleton label="Reading the suggestions" rows={8} />;
  if (draft.suggestions.isError) {
    return (
      <EmptyState title={`Couldn't read the suggestions: ${errorMessage(draft.suggestions.error)}`} action={<Button onClick={() => void draft.suggestions.refetch()}>Try again</Button>} />
    );
  }
  if (!all.length) {
    return (
      <EmptyState title="No suggestion yet." action={<ButtonLink to={`${base}/sources`} variant="primary">Add documents on Sources</ButtonLink>}>
        <p>What the draft's documents and change requests say arrives here, to be accepted or rejected one by one.</p>
      </EmptyState>
    );
  }

  const rejectPanel = rejecting.open && chosen.length ? (
    <ConsequencePanel
      panelRef={rejecting.panel}
      title={`Reject ${count(chosen.length, "suggestion")}`}
      happens="They don't reach the draft."
      affects={
        <Lines label="Suggestions to reject">
          {chosen.slice(0, 8).map((row) => <li key={row.suggestion.id} dir="auto">{row.sentence}</li>)}
          {chosen.length > 8 && <li>and {(chosen.length - 8).toLocaleString("en")} more</li>}
        </Lines>
      }
      reversibility="A rejection stays: correct the draft afterwards with hand edits on its pages."
      confirmLabel={`Reject ${count(chosen.length, "suggestion")}`}
      busyLabel="Rejecting…"
      keepLabel="Keep them"
      busy={draft.rejectMany.isPending}
      onConfirm={() =>
        draft.rejectMany.mutate(chosen.map((row) => row.suggestion.id), {
          onSuccess: (result) => {
            say(`Rejected ${count(result.rejected, "suggestion")}.`);
            setSelected(new Set());
            rejecting.close();
          },
        })
      }
      onKeep={rejecting.close}
    />
  ) : null;

  const acceptPanel = accepting.open && acceptSet.length ? (
    <ConsequencePanel
      panelRef={accepting.panel}
      title={`Accept ${count(acceptSet.length, "suggestion")}`}
      happens={
        <>
          They reach the draft as listed. None of them needs a decision
          {acceptSet.some((item) => !bulk.ready.some((ready) => ready.id === item.id)) ? ", and those that wait on another wait on one in this list" : ""}.
        </>
      }
      affects={
        <>
          <Lines label="Suggestions to accept">
            {acceptSet.slice(0, 8).map((item, index, shown) => {
              const sentence = changeSentence(item, words);
              // Two suggestions can read alike (the same system read twice): where each was read tells them apart.
              const twin = shown.some((other, at) => at !== index && changeSentence(other, words) === sentence);
              return (
                <li key={item.id} dir="auto">
                  {sentence}
                  {twin && item.citations[0]?.location && <span className="draft-detail">Read at {item.citations[0].location}</span>}
                </li>
              );
            })}
            {acceptSet.length > 8 && <li>and {(acceptSet.length - 8).toLocaleString("en")} more</li>}
          </Lines>
          {acceptSet.length > 8 && filter !== "ready" && (
            <Button variant="link" onClick={() => setView("ready", "")}>List all {acceptSet.length.toLocaleString("en")} beside this</Button>
          )}
        </>
      }
      reversibility="An acceptance stays: correct the draft afterwards with hand edits on its pages. Nothing reaches requirement work until the draft is published."
      confirmLabel={`Accept ${count(acceptSet.length, "suggestion")}`}
      busyLabel="Accepting…"
      keepLabel="Not yet"
      busy={draft.acceptReady.isPending}
      onConfirm={acceptReady}
      onKeep={accepting.close}
    />
  ) : null;

  const pane = acceptPanel ?? rejectPanel ?? (current ? (
    <SuggestionPane
      key={current.suggestion.id}
      suggestion={current.suggestion}
      release={release}
      words={words}
      document={documents.get(current.suggestion.document_version_id)}
      actorName={actorName}
      busy={busy}
      kept={edits[current.suggestion.id]}
      deadEnd={deadEndOf.get(current.suggestion.id)}
      notes={
        current.suggestion.change_request && !draftedForRequirement(current.suggestion)
          ? notes.get(`${current.suggestion.change_request.change_request_id}/${current.suggestion.change_request.feature_id}`)
          : undefined
      }
      editing={editing}
      headingRef={heading}
      onEdit={(on) => (on ? edit() : (setEditing(false), focusLater(() => desk.current?.querySelector<HTMLElement>(".ds-split__pane [aria-keyshortcuts='e']"))))}
      onKeep={(content) => {
        keep(current.suggestion.id, content);
        if (!content) say("Your edits are dropped.");
      }}
      onDecide={(accept, content) => decide(current, accept, content, "pane")}
      settling={draft.settleSubject.isPending}
      onSettle={settle}
    />
  ) : (
    <p className="draft-quiet">Choose a suggestion to see it in full.</p>
  ));

  const decided = counts.accepted + counts.rejected;
  return (
    // A row tapped on a narrow screen scrolls its pane into view; the keyboard opens a row with
    // Enter on the grid itself, so this click handler adds nothing a key lacks.
    // eslint-disable-next-line jsx-a11y-x/no-static-element-interactions
    <div
      ref={desk}
      className="draft-desk"
      data-density={densityFor(density, "desk")}
      onClick={tapped}
      onKeyDown={(event) => {
        // Esc in the pane goes back to the suggestion in the list.
        if (event.key === "Escape" && current && (event.target as HTMLElement).closest(".ds-split__pane") && !editing) {
          event.preventDefault();
          focusRow(current.suggestion.id);
        }
      }}
    >
      {arrived && <p role="status"><Status tone="done">{arrived}</Status></p>}
      <section className="draft-progress" aria-label="Decisions so far">
        <p>
          <strong className="ds-num">{counts.waiting.toLocaleString("en")}</strong> waiting
          {counts.decide > 0 || deadEndOf.size === 0
            ? <>{" · "}<strong className="ds-num">{counts.decide.toLocaleString("en")}</strong> need your decision</>
            : <>{" · "}<strong className="ds-num">{deadEndOf.size.toLocaleString("en")}</strong> on things no document describes</>}
          {" · "}{counts.accepted.toLocaleString("en")} accepted
          {" · "}{counts.rejected.toLocaleString("en")} rejected
          {counts.present > 0 && ` · ${counts.present.toLocaleString("en")} already in the draft`}
          <span className="draft-quiet"> · {count(counts.all, "suggestion")} from {sourcesInWords(all)}</span>
        </p>
        <progress max={Math.max(counts.all, 1)} value={decided} aria-label="Suggestions decided" />
      </section>
      <NextStep
        questions={questions}
        bulk={bulkCount}
        bulkLabel={draft.acceptReady.isPending ? "Accepting…" : bulkLabel(bulk.ready.length, bulk.lifted.length)}
        waiting={counts.waiting}
        accepted={counts.accepted}
        blockers={stuck}
        focusTo={`${base}/decide/focus`}
        changesTo={`${base}/changes`}
        busy={busy}
        settling={draft.settleSubject.isPending}
        onAcceptReady={askToAcceptReady}
        onAnswer={answer}
        choices={choices}
        settled={settled}
        onShow={showWaiting}
        onReject={rejectWaiting}
      />
      {chained && <section className="draft-chains" aria-label="What waits for what">
        <Button variant="quiet" icon={<Network size={16} />} aria-expanded={chains} onClick={() => setChains((on) => !on)}>
          {chains ? "Hide what waits for what" : "Show what waits for what"}
        </Button>
        {chains && (
          <DecisionTree
            suggestions={all}
            words={words}
            missing={stuck}
            onChooseMissing={showWaiting}
            onChoose={(id) => {
              move(id);
              focusRow(id);
            }}
          />
        )}
      </section>}

      <div className="draft-toolbar">
        <FilterStrip
          label="Show suggestions"
          // A filter that would show nothing is left out, unless it is the one in use.
          filters={FILTERS.map((id) => ({ id, label: FILTER_LABEL[id], count: all.filter((item) => inFilter(item, id, readyIds)).length })).filter((item) => item.count > 0 || item.id === filter)}
          active={filter}
          onChange={(id) => setView(id as Filter, find)}
          find={{ label: "Find in the suggestions", value: find, onChange: (value) => setView(filter, value), placeholder: "A system, a word or a document…" }}
          onClear={filter !== "waiting" || find ? () => setView("waiting", "") : undefined}
        />
      </div>
      <KeysHint
        onMore={openShortcuts}
        keys={[
          { keys: ["↑", "↓", "j", "k"], does: "move" },
          { keys: ["Enter"], does: "decide in the pane" },
          ...(acting ? [{ keys: ["a", "r"], does: "accept, reject" }] : [{ keys: ["r"], does: "reject" }]),
          { keys: ["e"], does: "edit, then accept" },
          ...(acting ? [{ keys: ["n"], does: "next that needs you" }] : []),
          { keys: ["Space"], does: "select" },
        ]}
      />
      <div className="draft-said-line">
        <Said text={conflict ? "The draft changed while you decided (someone else, or a reading finishing). Reload it and decide again." : failure ? inWords(errorMessage(failure), words) : said?.text} failed={Boolean(failure) || said?.failed} />
        {conflict && <Button variant="link" onClick={draft.reload}>Reload the draft</Button>}
      </div>

      <SplitPane
        paneLabel={acceptPanel ? "Accept the ready suggestions" : rejectPanel ? "Reject the selected suggestions" : current ? "The suggestion" : "Suggestion"}
        list={
          <SuggestionGrid
            rows={shown}
            deadEndOf={deadEndOf}
            selected={selected}
            onSelectedChange={setSelected}
            currentId={current?.suggestion.id}
            onCurrentChange={onCurrentChange}
            onActivate={onActivate}
            onRowKey={onGridKey}
            edits={edits}
            words={words}
          />
        }
        pane={pane}
      />

      <BulkActionBar count={rejecting.open || accepting.open ? 0 : selected.size} noun={["suggestion", "suggestions"]} onClear={() => setSelected(new Set())}>
        <Button
          busy={busy}
          unavailableReason={chosenReady.length ? null : "None of them is ready to accept without a decision."}
          onClick={() => {
            for (const row of chosenReady) void draft.decide({ suggestionId: row.suggestion.id, accept: true });
            const left = selected.size - chosenReady.length;
            say(`Accepting ${count(chosenReady.length, "suggestion")}.${left ? ` ${left} left selected: decide ${left === 1 ? "it" : "them"} one by one.` : ""}`);
            setSelected(new Set(rows.filter((row) => selected.has(row.suggestion.id) && !chosenReady.includes(row)).map((row) => row.suggestion.id)));
          }}
        >
          Accept {count(chosenReady.length, "ready one", "ready ones")}
        </Button>
        <Button unavailableReason={chosen.length ? null : "They are all decided already."} onClick={rejecting.show}>
          Reject {count(chosen.length, "suggestion")}…
        </Button>
      </BulkActionBar>
    </div>
  );
}

/** "2 documents, 1 change request and the draft's catalogue": where the suggestions came from. */
function sourcesInWords(suggestions: Suggestion[]): string {
  const catalogue = suggestions.some(fromCatalogue);
  const documents = new Set(suggestions.filter((item) => !item.change_request && !fromCatalogue(item)).map((item) => item.document_version_id)).size;
  const requests = new Set(suggestions.filter((item) => item.change_request).map((item) => item.document_version_id)).size;
  const parts = [
    documents || (!requests && !catalogue) ? count(documents, "document") : "",
    requests ? count(requests, "change request") : "",
    catalogue ? "the draft's catalogue" : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]!;
}

/** What settling a missing thing did, in a sentence for the Said line. */
function settledWords(blocker: Blocker, chosen: Answer, result: { retyped: number; added: number }): string {
  const { name } = blocker;
  const freed = (noun: string) => (result.retyped ? `: ${count(result.retyped, noun)} can be decided` : "");
  const orderType = name.split(" › ").slice(1).join(" › ");
  switch (chosen.kind) {
    case "system":
      return result.added ? `Suggested the system ${name}. Accept it to free what waits for it.` : `The system ${name} is already suggested.`;
    case "offering":
      if (result.added) return `Suggested the offering ${name}. Accept it to free what waits for it.`;
      return `${name} is now a product offering${result.retyped ? `: ${count(result.retyped, "suggestion")} changed with it` : ""}.`;
    case "existing":
      return `${name} is now another name for ${chosen.name}${freed("suggestion")}.`;
    case "specification":
      return `${name} is the ${chosen.layer === "cfs" ? "CFSS" : "RFSS"} ${chosen.name}${freed("rule")}.`;
    case "new_specification":
      return result.added ? `Suggested ${name} as ${chosen.layer === "cfs" ? "a CFSS" : "an RFSS"}. Accept it to free its rules.` : `${name} is already suggested.`;
    case "order_type":
      return `Added the order type ${orderType} to the offering${freed("journey")}.`;
    case "existing_order_type":
      return `The journeys for ${orderType} are now for ${chosen.name}${freed("journey")}.`;
    case "channel":
      return result.added ? `Suggested the channel ${name}. Accept it to free what waits for it.` : `The channel ${name} is already suggested.`;
    case "existing_channel":
      return `${name} now names the channel ${chosen.name}${freed("suggestion")}.`;
    default:
      return "";
  }
}

/** "Accept the 4 ready and the 11 that wait on them", for the bulk action. */
function bulkLabel(ready: number, lifted: number): string {
  if (ready + lifted === 0) return "Accept the ready ones";
  const first = ready === 1 ? "the one ready" : `the ${ready} ready`;
  if (!lifted) return `Accept ${first}`;
  return `Accept ${first} and the ${lifted} that wait on ${ready === 1 ? "it" : "them"}`;
}

const rowId = (row: Row) => row.suggestion.id;
const rowLabel = (row: Row) => row.sentence;

/** The suggestions as a keyboard grid; typing in the pane re-renders the desk, not every row. */
function SuggestionGrid({ rows, deadEndOf, selected, onSelectedChange, currentId, onCurrentChange, onActivate, onRowKey, edits, words }: {
  rows: Row[];
  /** Waiting suggestions that wait on something nothing adds, with what that is. */
  deadEndOf: ReadonlyMap<string, string>;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  currentId: string | undefined;
  onCurrentChange: (id: string) => void;
  onActivate: () => void;
  onRowKey: (row: Row, key: string) => boolean;
  edits: Record<string, SuggestionContent>;
  words: ReturnType<typeof lexicon>;
}) {
  const columns = useMemo<Column<Row>[]>(() => [
    {
      id: "change",
      header: "Change",
      rowHeader: true,
      bidi: true,
      cell: ({ suggestion, sentence }) => (
        <>
          <span className="draft-change">{sentence}</span>
          <span className="draft-detail" dir="ltr">
            {suggestion.change_request ? (
              <><bdi>{suggestion.change_request.change_request_id}</bdi> · {citedPart(suggestion)} · from Requirement AI</>
            ) : (
              <>{suggestion.citations[0]?.location ?? "No passage cited"}{suggestion.basis === "inferred" && " · inferred"}</>
            )}
          </span>
        </>
      ),
    },
    {
      id: "system",
      header: "Group",
      width: "11rem",
      bidi: true,
      cell: ({ group, suggestion }) =>
        group.isNew
          ? <>{group.label}<span className="draft-detail">{deadEndOf.has(suggestion.id) ? "Not in the catalogue" : "New system"}</span></>
          : group.label,
    },
    {
      id: "state",
      header: "State",
      width: "13rem",
      cell: ({ suggestion }) => {
        const state = suggestionState(suggestion);
        return (
          <>
            {state === "waits" && deadEndOf.has(suggestion.id)
              ? <Status tone="held">Nothing adds what it needs</Status>
              : <Status tone={STATE_TONE[state]}>{stateWords(suggestion)}</Status>}
            {state === "decide" && <span className="draft-detail">{decideWhy(suggestion)}</span>}
            {state === "waits" && <span className="draft-detail">{waitsFor(suggestion, words)}</span>}
            {edits[suggestion.id] && suggestion.status === "proposed" && <span className="draft-detail">Edited, not accepted yet</span>}
          </>
        );
      },
    },
  ], [deadEndOf, edits, words]);
  return (
    <DataTable
      caption="Suggestions, grouped by what they would change"
      captionHidden
      columns={columns}
      rows={rows}
      rowId={rowId}
      rowLabel={rowLabel}
      selected={selected}
      onSelectedChange={onSelectedChange}
      currentId={currentId}
      onCurrentChange={onCurrentChange}
      onActivate={onActivate}
      onRowKey={onRowKey}
      emptyText="No suggestion matches. Change the filter or the find text."
    />
  );
}
