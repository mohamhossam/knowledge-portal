/**
 * The path the app is served under (vite `base`), from `KNOWLEDGE_BASE_PATH` at build time.
 *
 * Unset, it is `/knowledge/`, where this repository's deployment serves it. `/` serves it
 * at the root of its own hostname. Always
 * returned with a leading and a trailing slash.
 */
const DEFAULT_BASE_PATH = "/knowledge/";

export function basePath(configured: string | undefined): string {
  const segments = (configured ?? DEFAULT_BASE_PATH).trim().replace(/^\/+|\/+$/g, "");
  return segments === "" ? "/" : `/${segments}/`;
}
