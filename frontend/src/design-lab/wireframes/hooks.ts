/**
 * The interaction model's mechanics (docs/ux/interaction/model.md), built for
 * real so the wireframes test behaviour, not pictures of it.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useLab, wf } from "./lab-context";

/**
 * §1: on a route change, focus the page's h1 and start at the top (or at the
 * hash target). The title is set by the page before focus moves.
 */
export function useRouteFocus() {
  const location = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    const focusable = target ?? document.getElementById("wf-page-title");
    if (!target) window.scrollTo(0, 0);
    focusable?.focus({ preventScroll: Boolean(!target) });
    target?.scrollIntoView({ block: "center" });
  }, [location.pathname, location.hash]);
}

/**
 * §1.1: sticky regions publish their measured block size, so scroll padding
 * keeps focus clear of them at any zoom. Never a fixed guess.
 */
export function useStickySize(ref: RefObject<HTMLElement | null>, variable: "--wf-sticky-top" | "--wf-sticky-state" | "--wf-sticky-bottom") {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty(variable, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [ref, variable]);
}

function inEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    Boolean(target.closest("[role='grid'],[role='combobox'],[role='listbox']"))
  );
}

/**
 * §2.1 layer 3: global shortcuts are off unless the person turns them on, and
 * never fire inside text fields or grids (WCAG 2.1.4).
 */
export function useGlobalShortcuts(handlers: { help: () => void; jobs: () => void }) {
  const { shortcuts } = useLab();
  const navigate = useNavigate();
  const pendingG = useRef(false);
  useEffect(() => {
    if (!shortcuts) return;
    const go: Record<string, string> = { w: "", l: "/library", c: "/architecture", o: "/ownership", r: "/requirement-knowledge" };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || inEditable(event.target)) return;
      if (pendingG.current) {
        pendingG.current = false;
        if (event.key === "j") {
          event.preventDefault();
          handlers.jobs();
        } else if (event.key in go) {
          event.preventDefault();
          navigate(wf(go[event.key]));
        }
        return;
      }
      if (event.key === "g") {
        pendingG.current = true;
        setTimeout(() => (pendingG.current = false), 1200);
      } else if (event.key === "?") {
        event.preventDefault();
        handlers.help();
      } else if (event.key === "/") {
        const find = document.querySelector<HTMLElement>("[data-wf-find]");
        if (find) {
          event.preventDefault();
          find.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, navigate, handlers]);
}

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

/**
 * §1: a panel takes focus when it opens and hands it back to its opener when
 * it closes; if the opener is gone, to the fallback (a row or region heading).
 */
export function useDisclosure(fallback?: () => HTMLElement | null) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const focusLater = useFocusAfterRender();

  useEffect(() => {
    if (!open || !panel.current) return;
    const first = panel.current.querySelector<HTMLElement>("input,textarea,select,[data-wf-autofocus]");
    (first ?? panel.current.querySelector<HTMLElement>("h2,h3"))?.focus();
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
 * §4: a decision shows at once and is sent after `ms`; Undo inside the window
 * cancels it. The API has no reopen (BG3), so this is the only undo there is.
 */
export function useDelayedCommit<T>(commit: (value: T) => Promise<void>, ms = 6000) {
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

  return { pending, schedule, undo };
}
