/**
 * The path the app is served under (vite `base`), from `KNOWLEDGE_BASE_PATH` at build time.
 *
 * Unset, it is `/knowledge/`, where the platform and this repository's deployment serve it.
 * `/` serves it at the root of its own hostname (requirement-portal ADR-0104). Always
 * returned with a leading and a trailing slash.
 */
export const DEFAULT_BASE_PATH = "/knowledge/";

export function basePath(configured: string | undefined): string {
  const segments = (configured ?? DEFAULT_BASE_PATH).trim().replace(/^\/+|\/+$/g, "");
  return segments === "" ? "/" : `/${segments}/`;
}
