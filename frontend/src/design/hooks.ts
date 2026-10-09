/**
 * The interaction model's mechanics (docs/ux/interaction/model.md), shared by
 * every design-system component. Proven first in the Phase 3 wireframe lab.
 */
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * Focus something after the next render commits. Effects run after the DOM
 * updates and, unlike requestAnimationFrame, are not paused in background tabs.
 */
export function useFocusAfterRender() {
  const [tick, setTick] = useState(0);
  const target = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    if (tick === 0 || !target.current) return;
    target.current()?.focus();
    target.current = null;
  }, [tick]);
  return useCallback((get: () => HTMLElement | null | undefined) => {
    target.current = get;
    setTick((n) => n + 1);
  }, []);
}

type StickyVariable = "--sticky-top" | "--sticky-state" | "--sticky-head" | "--sticky-bottom";

/**
 * The sticky regions measuring each variable right now (e.g. a selection bar inside a save
 * bar). It mirrors a document-wide value, the root's CSS variables, so it is document-wide too.
 */
const stickies = new Map<StickyVariable, Set<HTMLElement>>();

/** Sticky now, itself or (a table head's row) through its cells: at 400% zoom bars stop sticking. */
function sticks(element: HTMLElement): boolean {
  const cell = element.firstElementChild;
  return getComputedStyle(element).position === "sticky" || (cell !== null && getComputedStyle(cell).position === "sticky");
}

/** Publishes the tallest region of a variable that sticks, or removes it when none does. */
function publish(variable: StickyVariable) {
  const root = document.documentElement;
  const heights = [...(stickies.get(variable) ?? [])].filter(sticks).map((element) => element.getBoundingClientRect().height);
  if (heights.length === 0) root.style.removeProperty(variable);
  else root.style.setProperty(variable, `${Math.ceil(Math.max(...heights))}px`);
}

/**
 * §1.1: a sticky region publishes its measured block size, so scroll padding
 * keeps focus clear of it at any zoom. Never a fixed guess. Regions sharing a
 * variable publish the tallest of them, one leaving doesn't reset the rest, and
 * a region that stops sticking (narrow, or zoomed) counts as 0.
 */
export function useStickySize(ref: RefObject<HTMLElement | null>, variable: StickyVariable) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const registered = stickies.get(variable) ?? new Set<HTMLElement>();
    stickies.set(variable, registered.add(element));
    const update = () => publish(variable);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    // A zoom or a narrower window can switch a bar between sticky and static without resizing it.
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      registered.delete(element);
      update();
    };
  }, [ref, variable]);
}

/**
 * §1: a disclosure takes focus when it opens (its first field, else its
 * heading) and hands it back to its opener when it closes, or to the fallback.
 */
export function useDisclosure(fallback?: () => HTMLElement | null) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const focusLater = useFocusAfterRender();

  useEffect(() => {
    if (!open || !panel.current) return;
    const first = panel.current.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select,[data-autofocus]");
    // A side panel sticks (or is fixed): focusing into it must not scroll the page to where it
    // would sit unstuck, which is the top of a long page (area 2 critique).
    const position = getComputedStyle(panel.current).position;
    (first ?? panel.current.querySelector<HTMLElement>("h2,h3,[tabindex='-1']"))?.focus({ preventScroll: position === "sticky" || position === "fixed" });
  }, [open]);

  const show = useCallback((event?: { currentTarget: EventTarget | null }) => {
    opener.current = (event?.currentTarget as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    focusLater(() => (opener.current?.isConnected ? opener.current : fallback?.()));
  }, [fallback, focusLater]);

  return { open, show, close, panel };
}

export type Pending<T> = { id: string; label: string; value: T; until: number };

/**
 * §4: a decision shows at once and is sent after `ms`; undo inside the window
 * cancels it. The API cannot reopen a decision (BG3), so this is the undo there is.
 */
export function useDelayedCommit<T>(commit: (value: T) => Promise<void> | void, ms = 6000) {
  const [pending, setPending] = useState<Pending<T>[]>([]);
  const list = useRef<Pending<T>[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const replace = useCallback((next: Pending<T>[]) => {
    list.current = next;
    setPending(next);
  }, []);

  const schedule = useCallback((id: string, label: string, value: T) => {
    clearTimeout(timers.current.get(id));
    const timer = setTimeout(() => {
      timers.current.delete(id);
      replace(list.current.filter((item) => item.id !== id));
      void commit(value);
    }, ms);
    timers.current.set(id, timer);
    replace([...list.current.filter((item) => item.id !== id), { id, label, value, until: Date.now() + ms }]);
  }, [commit, ms, replace]);

  /** Cancels one pending decision (the newest when no id is given) and returns it. */
  const undo = useCallback((id?: string): Pending<T> | undefined => {
    const undone = id ? list.current.find((item) => item.id === id) : list.current.at(-1);
    if (!undone) return undefined;
    clearTimeout(timers.current.get(undone.id));
    timers.current.delete(undone.id);
    replace(list.current.filter((item) => item !== undone));
    return undone;
  }, [replace]);

  /** Sends every pending decision now (before leaving the page). */
  const flush = useCallback(() => {
    for (const item of list.current) {
      clearTimeout(timers.current.get(item.id));
      void commit(item.value);
    }
    timers.current.clear();
    replace([]);
  }, [commit, replace]);

  return { pending, schedule, undo, flush };
}

/**
 * §2.2 lists and toolbars: one tab stop for the group; arrows move between
 * items (vertical, horizontal or both), Home/End jump to the ends.
 */
export function rovingKeyDown(
  event: KeyboardEvent<HTMLElement>,
  selector: string,
  orientation: "vertical" | "horizontal" | "both" = "vertical",
) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector)).filter((item) => !item.hasAttribute("disabled"));
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return;
  const next = (orientation !== "horizontal" && event.key === "ArrowDown") || (orientation !== "vertical" && event.key === "ArrowRight")
    ? items[Math.min(index + 1, items.length - 1)]
    : (orientation !== "horizontal" && event.key === "ArrowUp") || (orientation !== "vertical" && event.key === "ArrowLeft")
      ? items[Math.max(index - 1, 0)]
      : event.key === "Home" ? items[0] : event.key === "End" ? items.at(-1) : undefined;
  if (!next) return;
  event.preventDefault();
  items.forEach((item) => item.setAttribute("tabindex", item === next ? "0" : "-1"));
  next.focus();
}
