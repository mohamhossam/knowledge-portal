import { type KeyboardEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import type { LibraryDocument, LibraryVersion } from "../../api/client";
import { ApiError, errorMessage } from "../../api/errors";
import { useAuth } from "../../auth/authContext";
import { useDisclosure, useFocusAfterRender } from "../../design/hooks";
import { formatClock } from "../../home/format";
import { approveReason } from "../approval";
import { useDocumentContext } from "../documentContext";
import {
  counts,
  type Draft,
  latestRevision,
  livePublication,
  matches,
  matchRows,
  newestVersion,
  nextToReview,
  passageProblems,
  reviewBody,
  reviewRows,
  type Row,
  whereOf,
  wrapWords,
} from "../model";
import { plural, sheetHeadings } from "../where";
import { useSeen, useSeenOnDwell } from "./useSeen";

export const PAGE = 200;

export type Filter = "all" | "unseen" | "flagged" | "changed" | "excluded" | "removed";

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
 * The review desk's state and decisions: which passages are shown and which is current, what
 * has been seen and selected, the drafts' changes, and saving and publishing the review.
 */
export function useDeskState(document: LibraryDocument, version: LibraryVersion) {
  const { hook, review, setReview, announce, dirty } = useDocumentContext();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const focusLater = useFocusAfterRender();
  const drafts = review.drafts;
  const summary = review.summary;

  // Typing the summary changes no passage: what the grid shows is memoized on the drafts and
  // "seen", so a keystroke there doesn't re-render 200 rows (area 2 reviews).
  // The matching against the basis depends on the answer only; a decision re-runs the light pass.
  const matching = useMemo(() => matchRows(document, version), [document, version]);
  const basis = matching.basis;
  const rows = useMemo(() => reviewRows(document, version, drafts, matching), [document, version, drafts, matching]);
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
  const reviewer = useAuth()?.actor?.id;
  const { seen, add: markSeen } = useSeen(version.id, reviewer);
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

  useSeenOnDwell(currentId, seen, markSeen);

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

  /** The selected passages excluded with one reason. */
  const excludeSelected = (text: string) => {
    setReview((state) => {
      const next = { ...state.drafts };
      for (const key of selected) if (next[key]) next[key] = { ...next[key], included: false, reason: text };
      return { ...state, drafts: next };
    });
    setSaid({ text: `Excluded ${plural(selected.size, "passage")}. Save to keep it.` });
    setSelected(new Set());
    bulk.close();
  };
  const includeSelected = () => {
    setReview((state) => {
      const next = { ...state.drafts };
      for (const key of selected) if (next[key]) next[key] = { ...next[key], included: true, reason: "" };
      return { ...state, drafts: next };
    });
    setSaid({ text: `Included ${plural(selected.size, "passage")}.` });
    setSelected(new Set());
  };
  const clearSelection = () => setSelected(new Set());

  /**
   * `n` (and a decision finished, §1): on to the next passage to check. Going round past the
   * last row (or the first, with N) is said in the live outcome line: never a silent jump.
   */
  const goNext = (from: Row, backward: boolean) => {
    const next = nextToReview(shown, from.key, seen, backward);
    if (!next) {
      setSaid({ text: tally.flagged > 0 ? "Every flagged passage and every other passage has been seen." : "Every passage has been seen." });
      return false;
    }
    const round = wrapWords(shown, from.key, next, backward);
    if (round) setSaid({ text: round });
    move(next.key);
    focusRow(next.key);
    return true;
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

  /** A filter chosen: "Not seen yet" lists what is unseen now, and the list starts again at its first page. */
  const showFilter = (id: Filter) => {
    if (id === "unseen") setSeenBefore(new Set(seen));
    setView(id, find);
    setLimit(PAGE);
  };
  const findPassages = (value: string) => {
    setView(filter, value);
    setLimit(PAGE);
  };
  const clearView = () => setView(opening, "");
  const showMore = () => setLimit((value) => value + PAGE);

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
          setSaid({ text: `Saved at ${formatClock(new Date())}.${ready ? " You can publish it when you're ready." : ""}` });
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
  const reload = () => {
    setSaid(null);
    void hook.reload();
  };

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

  const included = useMemo(() => rows.filter((row) => row.draft?.included).length, [rows]);
  const flaggedSeen = useMemo(() => rows.filter((row) => row.warnings.length > 0 && seen.has(row.key)).length, [rows, seen]);
  const seenCount = useMemo(() => rows.filter((row) => seen.has(row.key)).length, [rows, seen]);
  const unseen = useMemo(() => rows.filter((row) => !seen.has(row.key)).length, [rows, seen]);
  const live = livePublication(document);
  const liveNumber = live ? document.versions.find((item) => item.id === live.version_id)?.number : undefined;
  const fileBlocking = fileWarnings.filter((warning) => warning.severity === "blocking").length;
  const unavailableReason = approve.open ? null : approveReason(document, version, passageProblems(version, drafts), unsavedReview ? tally.blocking + fileBlocking : null);

  /** Opens the publish panel in place of the save panel, or closes it. */
  const togglePublish = (event: { currentTarget: EventTarget | null }) => {
    hook.approve.reset();
    hook.review.reset();
    if (approve.open) approve.close();
    else {
      if (asking.open) asking.close();
      approve.show(event);
    }
  };

  /** Publishing in one step: what is unsaved is saved with the summary, then that review is published. */
  async function publish(text: string) {
    // What the publish panel said was looked at is what the approval keeps (PRODUCT.md: reviewed means seen).
    const coverage = rows.length ? { passages: rows.length, seen: seenCount, flagged: tally.flagged, flagged_seen: flaggedSeen } : undefined;
    if (!needsSave(text) && revision) {
      hook.approve.mutate({ versionId: version.id, revisionId: revision.id, coverage }, { onSuccess: published });
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
    hook.approve.mutate({ versionId: version.id, revisionId: savedRevision.id, saved, coverage }, { onSuccess: published });
  }
  // Stable for the memoized grid (Enter on a row): on to the pane's first action.
  const onActivate = useCallback(() => focusLater(() => desk.current?.querySelector<HTMLElement>(".ds-split__pane .ds-button")), [focusLater]);
  const published = () => announce("Published. Requirement work can cite it once it is indexed; Jobs shows the indexing.");

  return {
    hook, dirty, summary, setSummary, rows, basis, headings, tally, revision, fileWarnings, unsavedReview,
    seen, selected, setSelected, editing, setEditing, original, setOriginal, filter, find, opening, said, setSaid,
    desk, bulk, approve, asking, shown, visible, current, focusRow, onActivate,
    move, change, exclude, include, edit, excludeSelected, includeSelected, clearSelection, goNext, onRowKey,
    showFilter, findPassages, clearView, showMore, save, reload, onDeskKey,
    included, flaggedSeen, seenCount, unseen, live, liveNumber, unavailableReason, togglePublish, publish,
  };
}
