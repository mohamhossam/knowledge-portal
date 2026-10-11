import { useQuery } from "@tanstack/react-query";
import { Check, Image as ImageIcon, RotateCcw } from "lucide-react";
import { type KeyboardEvent, memo, type ReactNode, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { api, type LibraryDocument, type LibraryVersion } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import {
  ActionGroup,
  BulkActionBar,
  Button,
  type Column,
  ConsequencePanel,
  DataTable,
  FilterStrip,
  KeysHint,
  Lines,
  Select,
  SplitPane,
  Status,
  StickyFooter,
  TextArea,
  TextField,
} from "../design/components";
import { useDisclosure, useFocusAfterRender } from "../design/hooks";
import { openShortcuts } from "../shell/shortcuts";
import { densityFor, usePreferences } from "../shell/preferences";
import { useDocumentContext } from "./documentContext";
import {
  comparisonBasis,
  counts,
  type Draft,
  latestRevision,
  livePublication,
  matches,
  nextToReview,
  passageProblems,
  reviewBody,
  reviewRows,
  type Row,
  whereOf,
} from "./model";
import { Outcome } from "./parts";
import { CitingNow } from "./StandingPanel";
import { contentLang, humanWhere, labelledCells, locationGroup, plural, sheetHeadings, tableCells } from "./where";
import { newestVersion } from "./model";

const PAGE = 200;

type Filter = "all" | "unseen" | "flagged" | "changed" | "excluded" | "removed";

/** How long a passage holds focus before it counts as seen (decided at GATE 8.2): passing through isn't looking. */
const SEEN_AFTER_MS = 600;

/** "Seen" is per reviewer and for this session only (BG2): kept in the tab, never sent. */
function useSeen(versionId: string) {
  const key = `knowledge-portal.seen.${versionId}`;
  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify([...seen]));
    } catch {
      // Blocked storage: seen lasts while the desk is open.
    }
  }, [key, seen]);
  const add = useCallback((id: string) => setSeen((all) => (all.has(id) ? all : new Set(all).add(id))), []);
  return { seen, add };
}

/** A "#passage-…" address, decoded; a malformed one is taken as it is. */
function passageOf(hash: string): string {
  const raw = hash.replace(/^#passage-/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Why the review can't be published now, short enough to sit beside the button (backlog K1).
 * Unsaved decisions don't stop it: publishing saves them first, with the summary asked for in
 * the same panel (the audit's one-step approval). `pending` is how many blocking warnings the
 * decisions on screen leave, when they differ from the saved review; null when they don't.
 */
function approveReason(document: LibraryDocument, version: LibraryVersion, problems: string[], pending: number | null): string | null {
  if (problems.length > 0) return problems[0]!;
  const blocking = pending ?? version.blocking_warnings.length;
  if (blocking > 0) return `${plural(blocking, "warning blocks", "warnings block")} it.`;
  if (document.publications.some((item) => !item.withdrawn_at && item.requires_activation && !item.activated_at)) return "A search index for tables waits; see Versions.";
  if (pending === null && document.publications.some((item) => !item.withdrawn_at && item.fingerprint === document.review_fingerprint)) return "Already published.";
  return null;
}

const CHANGE_WORD: Record<Row["change"], string> = { same: "Kept", edited: "Edited", excluded: "Excluded", new: "New", removed: "Removed" };

/**
 * The review desk (plan 02 §1, interaction model §2.2): progress and "seen",
 * the passage grid beside a sticky passage pane, bulk exclude with one
 * reason, a one-line save bar, and publishing through a consequence panel.
 * The grid's keys work only while focus is in it (WCAG 2.1.4).
 */
export function ReviewDesk({ document, version }: { document: LibraryDocument; version: LibraryVersion }) {
  const { hook, review, setReview, announce, dirty } = useDocumentContext();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { density } = usePreferences();
  const focusLater = useFocusAfterRender();
  const drafts = review.drafts;
  const summary = review.summary;

  // Typing the summary changes no passage: what the grid shows is memoized on the drafts and
  // "seen", so a keystroke there doesn't re-render 200 rows (area 2 reviews).
  const basis = useMemo(() => comparisonBasis(document), [document]);
  const rows = useMemo(() => reviewRows(document, version, drafts), [document, version, drafts]);
  const headings = useMemo(() => sheetHeadings(version.blocks.map((block) => ({ where: whereOf(block), text: block.text ?? null }))), [version]);
  const tally = useMemo(() => counts(rows, basis.kind), [rows, basis.kind]);
  const revision = latestRevision(version);
  const fileWarnings = version.warning_details.filter((warning) => !warning.block_id);
  // What publishing now would have to save first: no review saved yet, decisions since, or a new summary.
  const unsavedReview = !revision || !document.review_fingerprint || dirty > 0;
  const needsSave = (text: string) => unsavedReview || text.trim() !== revision?.explanation.trim();

  // A link "#passage-…" (from search) opens the desk at that passage, seen and focused.
  const [arrival] = useState(() => {
    const wanted = passageOf(location.hash);
    return wanted ? rows.find((row) => row.key === wanted || row.basisBlockId === wanted)?.key : undefined;
  });
  const { seen, add: markSeen } = useSeen(version.id);
  // "Not seen yet" lists what was unseen when it was chosen: a passage looked at stays listed, so k
  // goes back to it, until the filter is chosen again.
  const [seenBefore, setSeenBefore] = useState<ReadonlySet<string>>(() => new Set(seen));
  // The desk opens on what is left to look at while anything is (design evaluation, review desk
  // fixes); once every passage has been seen it opens on all of them.
  const [opening] = useState<Filter>(() => (rows.some((row) => !seen.has(row.key)) ? "unseen" : "all"));
  const [currentId, setCurrentId] = useState<string | undefined>(arrival);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  // What is shown lives in the address (§3), so a reload or a shared link keeps it.
  const show = params.get("show") ?? "";
  const filter = (["all", "unseen", "flagged", "changed", "excluded", "removed"].includes(show) ? show : opening) as Filter;
  const find = params.get("find") ?? "";
  const findDeferred = useDeferredValue(find);
  const setView = useCallback((next: Filter, text: string) => {
    setParams((previous) => {
      const query = new URLSearchParams(previous);
      if (next === opening) query.delete("show");
      else query.set("show", next);
      if (text) query.set("find", text);
      else query.delete("find");
      return query;
    }, { replace: true });
  }, [setParams, opening]);
  const [limit, setLimit] = useState(PAGE);
  const [said, setSaid] = useState<{ text: string; failed?: boolean; conflict?: boolean } | null>(null);
  const [group, setGroup] = useState("");
  const [picking, setPicking] = useState(false);
  const desk = useRef<HTMLDivElement>(null);
  const bulk = useDisclosure(() => desk.current?.querySelector<HTMLElement>("tr.is-current [data-cell-focus]") ?? null);
  const approve = useDisclosure(() => window.document.getElementById("desk-approve"));
  const asking = useDisclosure(() => window.document.getElementById("desk-save"));

  // The current row stays listed while it is reviewed, even once it no longer matches the filter.
  const shown = useMemo(() => rows.filter((row) =>
    row.key === currentId
    || (filter === "unseen" ? matches(row, "all", findDeferred) && !seenBefore.has(row.key) : matches(row, filter, findDeferred))), [rows, currentId, filter, findDeferred, seenBefore]);
  // The current row is always rendered: the list reaches it in steps of 200 (a jump past row 200).
  const currentIndex = shown.findIndex((row) => row.key === currentId);
  const reach = Math.max(limit, Math.ceil((currentIndex + 1) / PAGE) * PAGE);
  const visible = useMemo(() => shown.slice(0, reach), [shown, reach]);
  const current = visible.find((row) => row.key === currentId) ?? visible[0];
  const cellOf = (key: string | undefined) => (key ? desk.current?.querySelector<HTMLElement>(`tr[data-row-id="${CSS.escape(key)}"] [data-cell-focus]`) : null);
  const focusRow = (key?: string) => focusLater(() => cellOf(key ?? current?.key));

  useEffect(() => {
    if (!arrival) return;
    markSeen(arrival);
    const cell = cellOf(arrival);
    cell?.scrollIntoView({ block: "center" });
    cell?.focus({ preventScroll: true });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival]);

  // A passage is seen once it has been the current one for a moment (GATE 8.2): a run of j
  // through forty rows doesn't count as looking at forty passages.
  useEffect(() => {
    if (!currentId || seen.has(currentId)) return;
    const timer = window.setTimeout(() => markSeen(currentId), SEEN_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [currentId, seen, markSeen]);

  const move = (key: string) => {
    // Rows already shown stay shown: the list only grows to reach the row moved to (area 2 critique).
    const index = shown.findIndex((row) => row.key === key);
    if (index + 1 > limit) setLimit(Math.ceil((index + 1) / PAGE) * PAGE);
    if (key !== currentId) {
      setCurrentId(key);
      setEditing(false);
      setOriginal(null);
    }
  };
  const change = (key: string, patch: Partial<Draft>) =>
    setReview((state) => {
      const draft = state.drafts[key];
      return draft ? { ...state, drafts: { ...state.drafts, [key]: { ...draft, ...patch } } } : state;
    });
  const setSummary = (value: string) => setReview((state) => ({ ...state, summary: value }));

  const exclude = (row: Row) => {
    change(row.key, { included: false });
    focusLater(() => desk.current?.querySelector<HTMLElement>("[name='desk-reason']"));
  };
  const include = (row: Row) => {
    change(row.key, { included: true, reason: "" });
    setSaid({ text: `Passage ${row.ordinal} included.` });
  };
  const edit = () => {
    setEditing(true);
    focusLater(() => desk.current?.querySelector<HTMLElement>("[name='desk-edit']"));
  };

  const goNext = (from: Row, backward: boolean) => {
    const next = nextToReview(shown, from.key, seen, backward);
    if (!next) {
      setSaid({ text: tally.flagged > 0 ? "Every flagged passage and every other passage has been seen." : "Every passage has been seen." });
      return;
    }
    move(next.key);
    focusRow(next.key);
  };

  const onRowKey = (row: Row, key: string) => {
    if (key === "n" || key === "N") {
      goNext(row, key === "N");
      return true;
    }
    if (!row.draft) return false;
    if (key === "x") exclude(row);
    else if (key === "i") include(row);
    else if (key === "e") edit();
    else if (key === "o") setOriginal(row.key);
    else return false;
    return true;
  };

  /** Back to the first excluded passage without a reason, its field focused. */
  function showMissingReason() {
    const missing = rows.find((row) => row.draft && !row.draft.included && !row.draft.reason.trim());
    if (!missing) return;
    if (filter !== "all" || find) setView("all", "");
    move(missing.key);
    focusLater(() => desk.current?.querySelector<HTMLElement>("[name='desk-reason']"));
  }

  function save() {
    if (hook.review.isPending || hook.approve.isPending) return;
    if (!needsSave(summary)) {
      setSaid({ text: "Nothing changed since your last save." });
      return;
    }
    const blocked = passageProblems(version, drafts);
    if (blocked.length > 0) {
      if (asking.open) asking.close();
      setSaid({ text: `Not saved yet: ${blocked.join(" ")}`, failed: true });
      showMissingReason();
      return;
    }
    // The summary is asked for where it is needed, once: in a panel beside the list, not in the bar.
    if (!summary.trim()) {
      if (approve.open) return;
      hook.review.reset();
      if (!asking.open) asking.show();
      return;
    }
    setSaid({ text: "Saving…" });
    hook.review.mutate(
      { versionId: version.id, body: reviewBody(version, drafts, summary, document.version) },
      {
        onSuccess: (updated) => {
          if (asking.open) asking.close();
          // The saved document, not the one this closure saw before the save.
          const saved = newestVersion(updated);
          const ready = saved !== undefined && approveReason(updated, saved, [], null) === null;
          setSaid({ text: `Saved at ${clock(new Date())}.${ready ? " You can publish it when you're ready." : ""}` });
        },
        onError: (error) =>
          setSaid(
            error instanceof ApiError && error.status === 409
              ? { text: "The document changed while you worked (someone else, or the service finishing a step). Reload it, then save again; your unsaved decisions stay unless someone saved a review meanwhile.", failed: true, conflict: true }
              : { text: `Couldn't save: ${errorMessage(error)}`, failed: true },
          ),
      },
    );
  }

  const onDeskKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      save();
      return;
    }
    // In the grid, j / ↓ past the last row shown and End go on into the rows not shown yet:
    // the 200-row page is for rendering, not a wall for the keyboard.
    const inGrid = event.target instanceof HTMLElement && event.target.closest("[data-cell-focus]");
    if (!inGrid || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || shown.length <= visible.length) return;
    const target = event.key === "End"
      ? shown.at(-1)
      : (event.key === "j" || event.key === "ArrowDown") && current?.key === visible.at(-1)?.key ? shown[visible.length] : undefined;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    move(target.key);
    focusRow(target.key);
  };

  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.draft) continue;
      const name = locationGroup(row.where);
      map.set(name, [...(map.get(name) ?? []), row.key]);
    }
    return [...map.entries()];
  }, [rows]);
  const offerGroups = groups.length > 1 && groups.some(([, keys]) => keys.length > 1) && groups.length < rows.length;
  const chosenGroup = groups.find(([name]) => name === group) ?? groups[0];

  const included = useMemo(() => rows.filter((row) => row.draft?.included).length, [rows]);
  const flaggedSeen = useMemo(() => rows.filter((row) => row.warnings.length > 0 && seen.has(row.key)).length, [rows, seen]);
  const unseen = useMemo(() => rows.filter((row) => !seen.has(row.key)).length, [rows, seen]);
  const live = livePublication(document);
  const liveNumber = live ? document.versions.find((item) => item.id === live.version_id)?.number : undefined;
  const fileBlocking = fileWarnings.filter((warning) => warning.severity === "blocking").length;
  const reason = approve.open ? null : approveReason(document, version, passageProblems(version, drafts), unsavedReview ? tally.blocking + fileBlocking : null);

  const behalf = !document.is_owner;

  const text = useCallback((row: Row) => <PassageText row={row} headings={headings} />, [headings]);
  const columns = useMemo(() => passageColumns(seen, headings), [seen, headings]);

  // The grid is memoized: its handlers are stable and read the latest state when a key arrives.
  const handlers = useRef({ move, onRowKey });
  useLayoutEffect(() => {
    handlers.current = { move, onRowKey };
  });
  const onCurrentChange = useCallback((key: string) => handlers.current.move(key), []);
  const onGridKey = useCallback((row: Row, key: string) => handlers.current.onRowKey(row, key), []);
  const onActivate = useCallback(() => focusLater(() => desk.current?.querySelector<HTMLElement>(".ds-split__pane .ds-button")), [focusLater]);

  const bulkPanel = bulk.open ? (
        <ConsequencePanel
          panelRef={bulk.panel}
          title={`Exclude ${plural(selected.size, "passage")}`}
          happens="They won't be published with this version."
          affects={
            <Lines label="Passages to exclude">
              {rows.filter((row) => selected.has(row.key)).slice(0, 8).map((row) => (
                <li key={row.key}>{humanWhere(row.where)}: <span className="lib-oneline">{text(row)}</span></li>
              ))}
              {selected.size > 8 && <li>and {(selected.size - 8).toLocaleString("en")} more</li>}
            </Lines>
          }
          reversibility="You can include them again before you save."
          reason={{ label: "Why exclude them?", hint: "One reason for all of them. The document's reviewers see it." }}
          confirmLabel={`Exclude ${plural(selected.size, "passage")}`}
          keepLabel="Cancel"
          onConfirm={(text) => {
            setReview((state) => {
              const next = { ...state.drafts };
              for (const key of selected) if (next[key]) next[key] = { ...next[key], included: false, reason: text };
              return { ...state, drafts: next };
            });
            setSaid({ text: `Excluded ${plural(selected.size, "passage")}. Save to keep it.` });
            setSelected(new Set());
            bulk.close();
          }}
          onKeep={bulk.close}
        />
  ) : null;

  /** Publishing in one step: what is unsaved is saved with the summary, then that review is published. */
  async function publish(text: string) {
    if (!needsSave(text) && revision) {
      hook.approve.mutate({ versionId: version.id, revisionId: revision.id }, { onSuccess: published });
      return;
    }
    let saved: LibraryDocument;
    try {
      saved = await hook.review.mutateAsync({ versionId: version.id, body: reviewBody(version, drafts, text, document.version) });
    } catch {
      return; // The panel says why.
    }
    const savedRevision = latestRevision(saved.versions.find((item) => item.id === version.id));
    if (!savedRevision) return;
    hook.approve.mutate({ versionId: version.id, revisionId: savedRevision.id, saved }, { onSuccess: published });
  }
  const published = () => announce("Published. Requirement work can cite it once it is indexed; Jobs shows the indexing.");
  const changeFailure = (error: unknown, verb: string) =>
    error instanceof ApiError && error.status === 409 ? `The document changed while you were deciding. Reload it, then ${verb} again.` : errorMessage(error);
  const summaryField = { label: "Review summary", hint: "What you checked, and what you changed. The document's reviewers see it.", value: summary, onChange: setSummary, maxLength: 2000 };

  const savePanel = asking.open ? (
        <ConsequencePanel
          panelRef={asking.panel}
          title="Save your review"
          happens={<>Your decisions on {plural(rows.filter((row) => row.draft).length, "passage")} are kept with version {version.number}, with what you write here.</>}
          reversibility="Nothing is published until you approve it. You can change your decisions and save again."
          reason={summaryField}
          confirmLabel="Save review"
          keepLabel="Not yet"
          busy={hook.review.isPending}
          busyLabel="Saving…"
          failure={hook.review.isError ? changeFailure(hook.review.error, "save") : null}
          onConfirm={save}
          onKeep={asking.close}
        />
  ) : null;

  const approvePanel = approve.open ? (
        <ConsequencePanel
          panelRef={approve.panel}
          title={`Publish version ${version.number}`}
          happens={<>Requirement work can cite its <strong>{plural(included, "passage")}</strong> once they are indexed.</>}
          affects={
            <>
              {live ? (
                <CitingNow
                  documentId={document.id}
                  list={false}
                  lead={(count, one, none) => <>It replaces version {liveNumber ?? "?"} in service, which <strong className="ds-num">{count}</strong> {one ? "requirement" : "requirements"} you can see {one ? "cites" : "cite"}{none ? "" : ". Their owners are told the source changed"}</>}
                />
              ) : (
                <p>Nothing of it is in service yet.</p>
              )}
              <p>
                You looked at {seen.size.toLocaleString("en")} of {plural(rows.length, "passage")}
                {tally.flagged > 0 ? `, and ${flaggedSeen.toLocaleString("en")} of the ${tally.flagged.toLocaleString("en")} flagged.` : "."}
              </p>
              {unsavedReview && revision && dirty > 0 && <p>Your {plural(dirty, "unsaved change")} {dirty === 1 ? "is" : "are"} saved with it.</p>}
            </>
          }
          reason={summaryField}
          reversibility="You can withdraw it later; withdrawing tells the requirements that cite it."
          confirmLabel={behalf ? `Publish version ${version.number} on ${document.owner.display_name}'s behalf` : `Publish version ${version.number}`}
          keepLabel="Not yet"
          busy={hook.review.isPending || hook.approve.isPending}
          busyLabel={hook.review.isPending ? "Saving your review…" : "Publishing…"}
          failure={hook.review.isError ? `Not saved, so not published: ${changeFailure(hook.review.error, "publish")}` : hook.approve.isError ? changeFailure(hook.approve.error, "publish") : null}
          onConfirm={(text) => void publish(text)}
          onKeep={approve.close}
        />
  ) : null;

  const passagePane = !current ? (
    <p className="lib-quiet">Choose a passage to see it in full.</p>
  ) : !current.draft ? (
    <>
      <h2 className="ds-section__title">Passage {current.ordinal}, removed</h2>
      <p className="lib-quiet">{humanWhere(current.where)}</p>
      <p dir="auto" lang={contentLang(current.basis)} className="lib-passage lib-passage--muted">{current.basis}</p>
      <p>It is in service now and has no counterpart in version {version.number}. Requirement work keeps citing it until version {version.number} is published.</p>
    </>
  ) : (
    <>
      <h2 className="ds-section__title">Passage {current.ordinal}</h2>
      <p className="lib-quiet">{humanWhere(current.where)}{seen.has(current.key) ? " · seen" : ""}{current.change !== "same" ? ` · ${CHANGE_WORD[current.change].toLocaleLowerCase()}` : ""}</p>
      {current.warnings.map((warning, index) => (
        <p key={`${warning.code}-${index}`} className="lib-warning">
          <Status tone={warning.severity === "blocking" ? "attention" : "held"}>{warning.severity === "blocking" ? (current.blocking ? "Blocks approval" : "Blocked approval, now excluded") : "Flagged"}</Status>{" "}
          {warning.message}
          {warning.severity === "blocking" && current.blocking && " Exclude this passage with a reason and save, or upload a new version."}
        </p>
      ))}
      {editing ? (
        <TextArea
          name="desk-edit"
          label="Text to publish"
          hint="Esc goes back to the passage list."
          rows={Math.min(12, Math.max(4, Math.ceil(current.draft.text.length / 70)))}
          value={current.draft.text}
          onChange={(event) => change(current.key, { text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
              focusRow();
            }
          }}
        />
      ) : (
        <div className="lib-passage" dir="auto" lang={contentLang(current.draft.text)}>{text(current)}</div>
      )}
      {current.basis !== null && current.basis.trim() !== current.draft.text.trim() && (
        <div className="lib-basis">
          <p className="lib-quiet">{basis.kind === "edition" ? `In service now (version ${liveNumber ?? "?"})` : "As read from the file"}</p>
          <p dir="auto" lang={contentLang(current.basis)} className="lib-passage lib-passage--muted">{current.basis}</p>
        </div>
      )}
      <ActionGroup label={`Decide passage ${current.ordinal}`}>
        {current.draft.included ? (
          <Button aria-keyshortcuts="x" onClick={() => exclude(current)}>Exclude (x)</Button>
        ) : (
          <Button aria-keyshortcuts="i" onClick={() => include(current)}>Include (i)</Button>
        )}
        <Button aria-keyshortcuts="e" aria-expanded={editing} onClick={() => (editing ? setEditing(false) : edit())}>{editing ? "Done editing" : "Edit (e)"}</Button>
        {current.block?.text != null && current.block.text !== current.draft.text && (
          <Button variant="quiet" icon={<RotateCcw size={14} />} onClick={() => change(current.key, { text: current.block!.text! })}>Restore the text as read</Button>
        )}
        <Button aria-keyshortcuts="o" aria-expanded={original === current.key} onClick={() => setOriginal(original === current.key ? null : current.key)}>
          {original === current.key ? "Hide the original" : "Show the original (o)"}
        </Button>
      </ActionGroup>
      {!current.draft.included && (
        <TextField
          name="desk-reason"
          label="Why exclude it?"
          hint="The document's reviewers see this. Enter goes back to the list."
          required
          maxLength={10000}
          value={current.draft.reason}
          error={said?.failed && !current.draft.reason.trim() ? "Give a reason: the document's reviewers see it." : null}
          onChange={(event) => change(current.key, { reason: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter") {
              event.preventDefault();
              focusRow();
            }
          }}
        />
      )}
      {original === current.key && current.block && <OriginalPreview documentId={document.id} versionId={version.id} blockId={current.block.id} where={humanWhere(current.where)} />}
    </>
  );
  // The bulk and publish panels open in the pane, beside the list and next to the bar that opened
  // them, not after 200 rows (area 2 reviews).
  const pane: ReactNode = bulkPanel ?? approvePanel ?? savePanel ?? passagePane;

  return (
    <div ref={desk} className="lib-desk" data-density={densityFor(density, "desk")} onKeyDownCapture={onDeskKey}>
      {/* Progress and the notes about the whole file on one row: the grid starts higher (GATE 8.2). */}
      <div className="lib-deskhead">
      <section className="lib-progress" aria-label="Review progress">
        <p>
          Seen <strong className="ds-num">{seen.size.toLocaleString("en")}</strong> of {rows.length.toLocaleString("en")}
          {" · "}{tally.flagged.toLocaleString("en")} flagged
          {" · "}{tally.blocking.toLocaleString("en")} {tally.blocking === 1 ? "blocks" : "block"} approval
          {" · "}<span className={dirty > 0 ? "lib-strong" : undefined}>{dirty.toLocaleString("en")} unsaved {dirty === 1 ? "change" : "changes"}</span>
          <span className="lib-quiet">
            {" · "}{basis.kind === "edition" ? `compared with version ${liveNumber ?? "?"} in service` : "compared with the text as read"}
          </span>
        </p>
        <progress max={Math.max(rows.length, 1)} value={seen.size} aria-label="Passages seen" />
      </section>
        {fileWarnings.some((warning) => warning.severity !== "blocking") && (
          <details className="lib-filenotes">
            <summary>
              <Status tone="held">Flagged, whole file</Status>{" "}
              {plural(fileWarnings.filter((warning) => warning.severity !== "blocking").length, "note")} about reading it
            </summary>
            <Lines>
              {fileWarnings.filter((warning) => warning.severity !== "blocking").map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}
            </Lines>
          </details>
        )}
      </div>

      {fileWarnings.filter((warning) => warning.severity === "blocking").length > 0 && (
        <Lines label="Blocks approval, about the whole file">
          {fileWarnings.filter((warning) => warning.severity === "blocking").map((warning, index) => (
            <li key={`${warning.code}-${index}`}>
              <Status tone="attention">Blocks approval, whole file</Status> {warning.message} Excluding passages can't clear this one: upload a new version.
            </li>
          ))}
        </Lines>
      )}

      <div className="lib-toolbar">
        <FilterStrip
          label="Show passages"
          filters={[
            { id: "all", label: "All", count: rows.length },
            { id: "unseen", label: "Not seen yet", count: unseen },
            { id: "flagged", label: "Flagged", count: tally.flagged },
            { id: "changed", label: "Changed", count: tally.edited + tally.new + tally.removed },
            { id: "excluded", label: "Excluded", count: tally.excludedAll },
            ...(basis.kind === "edition" && tally.removed > 0 ? [{ id: "removed", label: "Removed", count: tally.removed }] : []),
          ]}
          active={filter}
          onChange={(id) => {
            if (id === "unseen") setSeenBefore(new Set(seen));
            setView(id as Filter, find);
            setLimit(PAGE);
          }}
          find={{ label: "Find in passages", value: find, onChange: (value) => { setView(filter, value); setLimit(PAGE); }, placeholder: "Words or a sheet…" }}
          // Back to the view the desk opened on; that view needs no clearing.
          onClear={filter !== opening || find ? () => setView(opening, "") : undefined}
        />
        {offerGroups && chosenGroup && !picking && (
          <Button variant="link" aria-expanded={false} onClick={() => setPicking(true)}>Select a location…</Button>
        )}
        {offerGroups && chosenGroup && picking && (
          <div className="lib-select-group" role="group" aria-label="Select a whole location">
            <Select label="Select a location" value={chosenGroup[0]} onChange={(event) => setGroup(event.target.value)}>
              {groups.map(([name, keys]) => <option key={name} value={name}>{name} · {plural(keys.length, "passage")}</option>)}
            </Select>
            <Button onClick={() => {
              setSelected(new Set([...selected, ...chosenGroup[1]]));
              setSaid({ text: `Selected ${plural(chosenGroup[1].length, "passage")} in ${chosenGroup[0]}.` });
            }}>
              Select {plural(chosenGroup[1].length, "passage")}
            </Button>
            <Button variant="link" onClick={() => setPicking(false)}>Done</Button>
          </div>
        )}
      </div>
      <KeysHint
        onMore={openShortcuts}
        keys={[
          { keys: ["↑", "↓", "j", "k"], does: "move" },
          { keys: ["n"], does: "next to check" },
          { keys: ["x", "i"], does: "exclude, include" },
          { keys: ["e"], does: "edit" },
          { keys: ["o"], does: "original" },
          { keys: ["Space"], does: "select" },
          { keys: ["Ctrl+Enter"], does: "save" },
        ]}
      />

      <SplitPane
        paneLabel={bulkPanel ? "Exclude the selected passages" : approvePanel ? "Publish" : savePanel ? "Save the review" : current ? `Passage ${current.ordinal}` : "Passage"}
        list={
          <>
            <PassageGrid
              caption={`Passages of version ${version.number}`}
              columns={columns}
              rows={visible}
              total={shown.length}
              selected={selected}
              onSelectedChange={setSelected}
              currentId={current?.key}
              onCurrentChange={onCurrentChange}
              onActivate={onActivate}
              onRowKey={onGridKey}
            />
            {visible.length < shown.length && (
              <p className="lib-more">
                <Button variant="link" onClick={() => setLimit((value) => value + PAGE)}>
                  Show the next {Math.min(PAGE, shown.length - visible.length).toLocaleString("en")} of {(shown.length - visible.length).toLocaleString("en")} more
                </Button>
              </p>
            )}
          </>
        }
        pane={pane}
      />

      <StickyFooter label="Save the review">
        {/* The selection bar sits inside the save bar's region, so the two stack and are measured as one (§1.1). */}
        <BulkActionBar count={bulk.open ? 0 : selected.size} noun={["passage", "passages"]} onClear={() => setSelected(new Set())}>
          <Button onClick={bulk.show}>Exclude {plural(selected.size, "passage")}…</Button>
          <Button
            onClick={() => {
              setReview((state) => {
                const next = { ...state.drafts };
                for (const key of selected) if (next[key]) next[key] = { ...next[key], included: true, reason: "" };
                return { ...state, drafts: next };
              });
              setSaid({ text: `Included ${plural(selected.size, "passage")}.` });
              setSelected(new Set());
            }}
          >
            Include {plural(selected.size, "passage")}
          </Button>
        </BulkActionBar>
        <div className="lib-savebar">
          <div className="lib-savebar__row">
            <ActionGroup>
              <Button id="desk-save" busy={hook.review.isPending && !approve.open} aria-expanded={asking.open} onClick={save}>{hook.review.isPending && !approve.open ? "Saving…" : "Save review"}</Button>
              <Button
                id="desk-approve"
                variant="primary"
                unavailableReason={reason}
                aria-expanded={approve.open}
                onClick={(event) => {
                  hook.approve.reset();
                  hook.review.reset();
                  if (approve.open) approve.close();
                  else {
                    if (asking.open) asking.close();
                    approve.show(event);
                  }
                }}
              >
                Approve and publish…
              </Button>
            </ActionGroup>
          </div>
          <div className="lib-savebar__said">
            <Outcome text={said?.text} failed={said?.failed} />
            {said?.conflict && <Button variant="link" onClick={() => { setSaid(null); void hook.reload(); }}>Reload the document</Button>}
          </div>
        </div>
      </StickyFooter>
    </div>
  );
}

/** The passage in the original file, rendered by the service, on request ("o"). */
function OriginalPreview({ documentId, versionId, blockId, where }: { documentId: string; versionId: string; blockId: string; where: string }) {
  const preview = useQuery({
    queryKey: ["library", "preview", versionId, blockId],
    queryFn: () => api.originalPreview(documentId, versionId, blockId),
    staleTime: Infinity,
    retry: false,
  });
  if (preview.isPending) return <p className="lib-quiet" role="status"><ImageIcon size={14} aria-hidden="true" /> Showing the original at {where}…</p>;
  if (preview.isError) {
    return (
      <p role="status">
        <Status tone="attention">Couldn't show the original: {errorMessage(preview.error)}</Status>{" "}
        <Button variant="link" onClick={() => void preview.refetch()}>Try again</Button>
      </p>
    );
  }
  return (
    <figure className="lib-original">
      {preview.data.image_data && <img src={preview.data.image_data} alt={`The original at ${where}`} />}
      <figcaption className="lib-quiet">{preview.data.explanation}</figcaption>
    </figure>
  );
}

const clock = (at: Date) => at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** A passage's text: a worksheet row as labelled cells (backlog O-3), else as it reads. */
function PassageText({ row, headings }: { row: Row; headings: Map<string, Map<string, string>> }) {
  const value = row.draft?.text ?? row.basis ?? "";
  const cells = labelledCells(value, row.where, headings);
  if (cells) {
    return (
      <span className="lib-cells" dir="auto" lang={contentLang(value)}>
        {cells.map((cell, index) => (
          <span key={`${cell.label}-${index}`} className="lib-cells__cell"><span className="lib-cells__label">{cell.label}</span> <bdi>{cell.value}</bdi></span>
        ))}
      </span>
    );
  }
  const plain = tableCells(value);
  return <span lang={contentLang(value)}>{plain ? plain.map((cell) => cell.value).join(" · ") : value}</span>;
}

function passageColumns(seen: ReadonlySet<string>, headings: Map<string, Map<string, string>>): Column<Row>[] {
  return [
    {
      id: "where",
      header: "Where",
      rowHeader: true,
      width: "8.5rem",
      cell: (row) => (
        <>
          {humanWhere(row.where)}
          {/* Seen is shown on the row too (a mark, never colour alone), so the reviewer sees their trail. */}
          {seen.has(row.key) ? <Check size={12} aria-hidden="true" className="lib-seen" /> : <span className="ds-visually-hidden">, not seen</span>}
        </>
      ),
    },
    {
      id: "text",
      header: "Text",
      bidi: true,
      cell: (row) => (
        <span className={`lib-cell-text${row.draft && !row.draft.included ? " lib-excluded" : ""}`}>
          <PassageText row={row} headings={headings} />
          {row.draft && !row.draft.included && row.draft.reason && <span className="lib-detail lib-detail--plain">Excluded: <bdi>{row.draft.reason}</bdi></span>}
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      width: "10rem",
      cell: (row) => (
        <span className="lib-state">
          {row.blocking ? <Status tone="attention">Blocks approval</Status> : row.warnings.length ? <Status tone="held">Flagged</Status> : null}
          <span>{CHANGE_WORD[row.change]}</span>
        </span>
      ),
    },
  ];
}

const rowKey = (row: Row) => row.key;
const rowName = (row: Row) => `passage ${row.ordinal}`;

/** The passage grid, memoized: typing a summary or a reason re-renders the desk, not 200 rows. */
const PassageGrid = memo(function PassageGrid({ caption, columns, rows, total, selected, onSelectedChange, currentId, onCurrentChange, onActivate, onRowKey }: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  total: number;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  currentId: string | undefined;
  onCurrentChange: (id: string) => void;
  onActivate: () => void;
  onRowKey: (row: Row, key: string) => boolean;
}) {
  return (
    <DataTable
      caption={caption}
      captionHidden
      columns={columns}
      rows={rows}
      totalRows={total}
      rowId={rowKey}
      rowLabel={rowName}
      selected={selected}
      onSelectedChange={onSelectedChange}
      currentId={currentId}
      onCurrentChange={onCurrentChange}
      onActivate={onActivate}
      onRowKey={onRowKey}
      emptyText="No passage matches. Change the filter or the find text."
    />
  );
});
