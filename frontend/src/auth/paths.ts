/**
 * Where the portal lives on its origin.
 *
 * The app is served under its build's base path (vite `base`, `/knowledge/` unless
 * `KNOWLEDGE_BASE_PATH` says otherwise). Router paths are relative to that base; sign-in
 * callbacks and links back to requirement work are absolute.
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const CALLBACK_PATH = "/auth/callback";
export const SILENT_CALLBACK_PATH = "/auth/silent-callback";
/**
 * Requirement work, the other portal, or null when this deployment runs without it
 * (requirement-portal ADR-0104). `VITE_REQUIREMENT_PORTAL_URL` names it; unset, it is the
 * platform's root `/`, and set empty, every link to it is left out.
 */
export function requirementPortalUrl(configured: string | undefined): string | null {
  if (configured === undefined) return "/";
  const url = configured.trim();
  if (url === "") return null;
  return url.endsWith("/") ? url : `${url}/`;
}

/** Replaced by the web image's nginx at start-up with the container's `REQUIREMENT_PORTAL_URL`. */
export const RUNTIME_REQUIREMENT_PORTAL_URL = "__REQUIREMENT_PORTAL_URL__";

/**
 * Requirement work's address as the page that loaded the app gives it, or undefined when the
 * page does not say (development, or a server that does not fill it in). The published image
 * cannot know where requirement work is, so it takes the address when the container starts.
 */
export function pageRequirementPortalUrl(doc: Pick<Document, "querySelector">): string | undefined {
  const value = doc.querySelector('meta[name="requirement-portal-url"]')?.getAttribute("content");
  return value === null || value === undefined || value === RUNTIME_REQUIREMENT_PORTAL_URL ? undefined : value;
}

export const REQUIREMENT_APP_URL = requirementPortalUrl(
  pageRequirementPortalUrl(document) ?? import.meta.env.VITE_REQUIREMENT_PORTAL_URL,
);

/** A page of requirement work, such as `requirements/R-1`, or null without it. */
export function requirementWorkHref(path: string, base = REQUIREMENT_APP_URL): string | null {
  return base === null ? null : `${base}${path.replace(/^\/+/, "")}`;
}

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
