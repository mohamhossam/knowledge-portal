/** What a failed page is, in words: shared by the boundaries and their fallbacks. */

/**
 * A page's code that is no longer on the server: a newer portal was published while
 * the page was open, so the chunk it asks for is gone. Only reloading fixes it.
 */
export function isStaleChunk(error: unknown): boolean {
  const said = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|importing a module script failed|ChunkLoadError|Loading (CSS )?chunk/i.test(said);
}

/** The heading a failure takes: a page left behind by an update, or a page that broke. */
export function failureTitle(error: unknown): string {
  return isStaleChunk(error) ? "A newer portal is ready" : "This page stopped working";
}
