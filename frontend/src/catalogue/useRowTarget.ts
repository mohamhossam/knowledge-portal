import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

/** How long a row is looked for while its table draws: a tab, a view or a lazy chunk the same link chose. */
const PATIENCE_MS = 1000;

/**
 * A page opened at one row of its tables or lists (`?row=<id>`), as a link names it: the row
 * with that `data-row-id` within `scope` (the record, by default, never a list beside it) is
 * brought into view, marked as the place linked to, and its first cell takes focus, so reading
 * goes on from there. It lands on each navigation that names a row, a link followed again
 * included; choosing another view or tab lets go of the row, so it never pulls focus back. The
 * address bar lets go of it without a navigation, which would move focus to the record's title.
 * A row no longer there is said, rather than left unexplained. Returns that row's id, if so.
 */
export function useRowTarget(scope = ".ds-record"): string | null {
  const [params] = useSearchParams();
  const { key } = useLocation();
  const row = params.get("row");
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    const started = Date.now();
    let timer = 0;
    const done = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("row")) return;
      url.searchParams.delete("row");
      window.history.replaceState(window.history.state, "", url);
    };
    const find = () => {
      const target = document.querySelector<HTMLElement>(`${scope} :is(tr, li)[data-row-id="${CSS.escape(row)}"]`);
      if (!target) {
        if (Date.now() - started < PATIENCE_MS) timer = window.setTimeout(find, 32);
        else {
          setMissing(row);
          done();
        }
        return;
      }
      landOn(target);
      setMissing(null);
      done();
    };
    timer = window.setTimeout(find, 0);
    return () => window.clearTimeout(timer);
  }, [row, key, scope]);
  return missing;
}

/**
 * Lands on a row: a table's or a list's, such as one a link named or one a row points to. It is
 * marked as the place linked to (and no other is), brought into view, and its first cell, or a
 * list's item itself, takes focus.
 */
export function landOn(target: HTMLElement) {
  // A table folded away, such as a journey's steps under its drawing, opens to show it.
  const folded = target.closest("details");
  if (folded) folded.open = true;
  for (const marked of document.querySelectorAll("[data-row-target]")) {
    marked.removeAttribute("data-row-target");
    marked.removeAttribute("aria-current");
  }
  target.setAttribute("data-row-target", "");
  target.setAttribute("aria-current", "location");
  target.scrollIntoView?.({ block: "center" });
  const cell = target.matches("tr") ? target.querySelector<HTMLElement>("th, td") : target;
  if (cell) {
    cell.tabIndex = -1;
    cell.focus({ preventScroll: true });
  }
}
