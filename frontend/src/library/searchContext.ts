/** One place of a search result's surrounding text. */
export type ContextPlace = { location: string; text: string; cited: boolean };

/**
 * The service sends surrounding text as blocks of "place, newline, text",
 * separated by blank lines. Each becomes its own line, the cited place marked;
 * a leading Markdown heading marker is presentation, not content, so it goes.
 */
export function contextPlaces(contextText: string, citedLocation: string): ContextPlace[] {
  const places = contextText
    .split(/\n{2,}/)
    .map((block) => {
      const [first = "", ...rest] = block.split("\n");
      const text = rest.join(" ").replace(/^#{1,6}\s+/, "").trim();
      return rest.length ? { location: first.trim(), text, cited: first.trim() === citedLocation } : null;
    })
    .filter((place): place is ContextPlace => place !== null && place.text !== "");
  // Text without places is still shown, as one block at the cited place.
  return places.length ? places : [{ location: citedLocation, text: contextText.trim(), cited: true }];
}
