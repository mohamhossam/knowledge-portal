/**
 * Per-person display preferences (interaction model §2.1, §12): density and
 * the page-wide keyboard shortcuts, kept in this browser. Storage may be
 * blocked; the choice then lasts for the page only.
 */
import { useCallback, useSyncExternalStore } from "react";

export type Density = "automatic" | "comfortable" | "compact";

const KEYS = { density: "knowledge-portal.density", shortcuts: "knowledge-portal.shortcuts" } as const;
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the in-memory value still applies for this page.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEYS.density || event.key === KEYS.shortcuts) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
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
