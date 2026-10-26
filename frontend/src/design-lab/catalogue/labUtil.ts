/** Small helpers shared by the catalogue mock-ups. */
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useRef } from "react";

import type { PortfolioNode } from "../../catalogue/model/model";

// The map's names live with the map (catalogue/landscape); the lab reads them from there.
export { monogram, shortFunction } from "../../catalogue/landscape/names";

const RULES = new Intl.PluralRules("en");

/** "1 call", "3 calls": the noun agrees with its number. */
export function plural(count: number, one: string, other = `${one}s`): string {
  return `${count} ${RULES.select(count) === "one" ? one : other}`;
}

const LIST = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

export function listOf(items: string[]): string {
  return LIST.format(items);
}

/** The tab says which screen this is, so a reader with several open can tell them apart. */
export function useTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Catalogue · Knowledge portal`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** The first sentence of a summary, ending in exactly one full stop. */
export function firstSentence(text: string): string {
  const [first] = text.split(/(?<=\.)\s/);
  return (first ?? text).trim().replace(/\.*$/, ".");
}

/** "200 Mbps" → 200; anything without a leading number → null. */
export function leadingNumber(value: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(gbps|mbps)?/i.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2]?.toLowerCase() === "gbps" ? n * 1000 : n;
}


/** How far-off scrolling moves: smoothly, or at once when the person asks for reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** The portfolio path from the top level down to a node; a node that is its own ancestor ends the walk. */
export function pathTo(nodes: PortfolioNode[], nodeId: string | null): PortfolioNode[] {
  const path: PortfolioNode[] = [];
  const seen = new Set<string>();
  let node = nodes.find((item) => item.id === nodeId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.unshift(node);
    const parent = node.parentId;
    node = parent ? nodes.find((item) => item.id === parent) : undefined;
  }
  return path;
}

/**
 * A <details> used as a menu: it closes on a click anywhere outside it, and on Escape, which
 * hands focus back to its summary. `close` shuts it after a choice.
 */
export function useDismissableDetails(): { ref: RefObject<HTMLDetailsElement | null>; close: () => void; onKeyDown: (event: KeyboardEvent<HTMLDetailsElement>) => void } {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = useCallback(() => {
    if (ref.current) ref.current.open = false;
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [close]);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDetailsElement>) => {
      if (event.key === "Escape" && ref.current?.open) {
        event.preventDefault();
        close();
        ref.current.querySelector("summary")?.focus();
      }
    },
    [close],
  );
  return { ref, close, onKeyDown };
}
