import { useCallback, useEffect, useState } from "react";

/** How long a passage holds focus before it counts as seen (decided at GATE 8.2): passing through isn't looking. */
const SEEN_AFTER_MS = 600;

/**
 * "Seen" is per reviewer and per version (BG2). It is kept in this browser, so a closed tab
 * or a crash doesn't start the count again, and it is sent with the approval as its coverage.
 */
export function useSeen(versionId: string, reviewerId: string | undefined) {
  const key = `knowledge-portal.seen.${reviewerId ?? "anyone"}.${versionId}`;
  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      // Kept for the tab only before it was kept in the browser: read once, then moved.
      const kept = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(`knowledge-portal.seen.${versionId}`);
      return new Set(JSON.parse(kept ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify([...seen]));
    } catch {
      // Blocked storage: seen lasts while the desk is open.
    }
  }, [key, seen]);
  const add = useCallback((id: string) => setSeen((all) => (all.has(id) ? all : new Set(all).add(id))), []);
  return { seen, add };
}

/**
 * A passage is seen once it has been the current one for a moment (GATE 8.2): a run of j
 * through forty rows doesn't count as looking at forty passages.
 */
export function useSeenOnDwell(currentId: string | undefined, seen: ReadonlySet<string>, markSeen: (id: string) => void) {
  useEffect(() => {
    if (!currentId || seen.has(currentId)) return;
    const timer = window.setTimeout(() => markSeen(currentId), SEEN_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [currentId, seen, markSeen]);
}
