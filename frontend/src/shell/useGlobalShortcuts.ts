import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { usePreferences } from "./preferences";

const GO: Record<string, string> = { w: "/", l: "/library", c: "/architecture", o: "/squads", r: "/requirement-knowledge" };

function inEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    Boolean(target.closest("[role='grid'],[role='combobox'],[role='listbox'],table"))
  );
}

/**
 * §2.1 layer 3: page-wide single-key shortcuts. Off unless the person turns
 * them on, and never inside fields, grids or tables, whose own keys win
 * (WCAG 2.1.4).
 */
export function useGlobalShortcuts(handlers: { help: () => void; jobs: () => void }) {
  const { shortcuts } = usePreferences();
  const navigate = useNavigate();
  const pendingG = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest handlers and navigate, read at key time: the listener isn't re-added on every
  // panel toggle or route change, so a pending "g" chord survives them.
  const latest = useRef({ handlers, navigate });
  useEffect(() => {
    latest.current = { handlers, navigate };
  });
  useEffect(() => {
    if (!shortcuts) return;
    const clear = () => {
      if (pendingG.current) clearTimeout(pendingG.current);
      pendingG.current = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || inEditable(event.target)) return;
      if (pendingG.current) {
        clear();
        if (event.key === "j") {
          event.preventDefault();
          latest.current.handlers.jobs();
        } else if (event.key in GO) {
          event.preventDefault();
          latest.current.navigate(GO[event.key]!);
        }
        return;
      }
      if (event.key === "g") {
        pendingG.current = setTimeout(clear, 1200);
      } else if (event.key === "?") {
        event.preventDefault();
        latest.current.handlers.help();
      } else if (event.key === "/") {
        const find = document.querySelector<HTMLElement>("[data-find]");
        if (find) {
          event.preventDefault();
          find.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clear();
    };
  }, [shortcuts]);
}
