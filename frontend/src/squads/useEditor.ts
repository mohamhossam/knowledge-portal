import { useCallback, useRef, useState } from "react";

import { useFocusAfterRender } from "../design/hooks";

const FIRST = "input:not([type=hidden]),textarea,select,[data-autofocus]";

/**
 * One edit open at a time on a page, in place (§1): opening (or switching to
 * another) moves focus to its first field, else its heading; closing hands
 * focus back to what opened it, or to the fallback when that is gone or hidden.
 */
export function useEditor<T>() {
  const [editing, setEditing] = useState<T | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const focusLater = useFocusAfterRender();

  const open = useCallback((value: T, event?: { currentTarget: EventTarget | null }) => {
    opener.current = (event?.currentTarget as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
    setEditing(value);
    focusLater(() => panel.current?.querySelector<HTMLElement>(FIRST) ?? panel.current?.querySelector<HTMLElement>("h2,h3,[tabindex='-1']"));
  }, [focusLater]);

  /** `moved`: the edit opened something new (a record just added), so focus goes to the fallback, not back. */
  const close = useCallback((fallback?: () => HTMLElement | null | undefined, moved = false) => {
    setEditing(null);
    // An opener that is gone, or hidden now (a selection bar with nothing selected), can't take focus.
    focusLater(() => (!moved && opener.current?.isConnected && !opener.current.closest("[hidden]") ? opener.current : fallback?.()));
  }, [focusLater]);

  return { editing, open, close, panel };
}
