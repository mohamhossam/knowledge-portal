/**
 * Where the portal lives on the platform's origin.
 *
 * The app is served under `/knowledge/` (vite `base`), beside requirement work
 * at `/`. Router paths are relative to that base; sign-in callbacks and links
 * back to requirement work are absolute.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const CALLBACK_PATH = "/auth/callback";
export const SILENT_CALLBACK_PATH = "/auth/silent-callback";
/** Requirement work, the platform's other portal. */
export const REQUIREMENT_APP_URL = "/";

export const absolute = (path: string) => `${window.location.origin}${BASE}${path}`;

/** The router path of the current location, without the base. */
export function routerPath(pathname = window.location.pathname): string {
  return pathname.startsWith(BASE) ? pathname.slice(BASE.length) || "/" : pathname;
}

const blocked = new Set(["/login", CALLBACK_PATH, SILENT_CALLBACK_PATH]);

/**
 * A router path to return to after sign-in, or the home.
 *
 * Only a path inside this portal qualifies: anything that would leave the
 * origin (`//host`, a scheme) or land on a sign-in route is replaced.
 */
export function safeReturnPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  try {
    const resolved = new URL(candidate, window.location.origin);
    if (resolved.origin !== window.location.origin || blocked.has(resolved.pathname)) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
