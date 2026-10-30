import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/** How long a row is looked for while its table draws: a tab, a view or a lazy chunk the same link chose. */
const PATIENCE_MS = 1000;

/**
 * A page opened at one row of its tables (`?row=<id>`), as a link from elsewhere names it: the
 * record's row with that `data-row-id` (never a list's beside it) is brought into view, marked as
 * the place linked to, and its first cell takes focus, so reading goes on from there. It lands
 * once: it runs again only for another row, so choosing another view or tab never pulls focus
 * back; and the address bar lets go of the row without a navigation, which would move focus to
 * the record's title.
 * A row no longer there is said, rather than left unexplained. Returns that row's id, if so.
 */
export function useRowTarget(): string | null {
  const [params] = useSearchParams();
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
      const target = document.querySelector<HTMLElement>(`.ds-record tr[data-row-id="${CSS.escape(row)}"]`);
      if (!target) {
        if (Date.now() - started < PATIENCE_MS) timer = window.setTimeout(find, 32);
        else {
          setMissing(row);
          done();
        }
        return;
      }
      // A table folded away, such as a journey's steps under its drawing, opens to show it.
      const folded = target.closest("details");
      if (folded) folded.open = true;
      for (const marked of document.querySelectorAll("tr[data-row-target]")) {
        marked.removeAttribute("data-row-target");
        marked.removeAttribute("aria-current");
      }
      target.setAttribute("data-row-target", "");
      target.setAttribute("aria-current", "location");
      target.scrollIntoView?.({ block: "center" });
      const cell = target.querySelector<HTMLElement>("th, td");
      if (cell) {
        cell.tabIndex = -1;
        cell.focus({ preventScroll: true });
      }
      setMissing(null);
      done();
    };
    timer = window.setTimeout(find, 0);
    return () => window.clearTimeout(timer);
  }, [row]);
  return missing;
}
