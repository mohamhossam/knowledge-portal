/**
 * Per-person display preferences (interaction model §2.1, §12): density and
 * the page-wide keyboard shortcuts, kept in this browser. Storage may be
 * blocked; the choice then lasts for the page only.
 */
import { useCallback, useSyncExternalStore } from "react";

export type Density = "automatic" | "comfortable" | "compact";

const KEYS = { density: "knowledge-portal.density", shortcuts: "knowledge-portal.shortcuts" } as const;
type Key = (typeof KEYS)[keyof typeof KEYS];
const memory = new Map<Key, string>();
const listeners = new Set<() => void>();
/** What each key holds, read from storage once and kept until it changes (here or in another tab). */
const cache = new Map<Key, string | null>();

function read(key: Key): string | null {
  if (cache.has(key)) return cache.get(key)!;
  let value: string | null;
  try {
    value = window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    value = memory.get(key) ?? null;
  }
  cache.set(key, value);
  return value;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function write(key: Key, value: string) {
  memory.set(key, value);
  cache.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the in-memory value still applies for this page.
  }
  notify();
}

/** Another tab changed a preference: read it again. One listener for the module, while anyone listens. */
function onStorage(event: StorageEvent) {
  // A cleared storage (key null) may have taken either preference with it.
  if (event.key !== null && event.key !== KEYS.density && event.key !== KEYS.shortcuts) return;
  cache.clear();
  notify();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function asDensity(value: string | null): Density {
  return value === "comfortable" || value === "compact" ? value : "automatic";
}

export function usePreferences() {
  const density = asDensity(useSyncExternalStore(subscribe, () => read(KEYS.density)));
  const shortcuts = useSyncExternalStore(subscribe, () => read(KEYS.shortcuts)) === "on";
  const setDensity = useCallback((next: Density) => write(KEYS.density, next), []);
  const setShortcuts = useCallback((on: boolean) => write(KEYS.shortcuts, on ? "on" : "off"), []);
  return { density, setDensity, shortcuts, setShortcuts };
}

/**
 * The density a region renders at: "automatic" is compact on a review desk
 * and comfortable everywhere else (§12).
 */
export function densityFor(density: Density, region: "page" | "desk"): "comfortable" | "compact" {
  if (density !== "automatic") return density;
  return region === "desk" ? "compact" : "comfortable";
}
