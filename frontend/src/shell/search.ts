/**
 * Global search's matching (Ctrl+K): names the portal already holds, matched
 * in the browser. Every word typed must appear; a name that starts with the
 * query comes first, then one with a word that starts with it, then the rest,
 * each in name order. Matching ignores case and accents ("Société" is "societe").
 */

const fold = (text: string) =>
  text
    .normalize("NFKD")
    // The Latin accents NFKD splits off; the Arabic marks it also dropped went with English only.
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

export function words(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** How well a thing's names answer the query: 0 not at all, higher is better. */
export function score(names: (string | null | undefined)[], query: string): number {
  const wanted = words(query);
  if (!wanted.length) return 0;
  const texts = names.filter((name): name is string => Boolean(name)).map(fold);
  if (!texts.length) return 0;
  const all = texts.join(" ");
  if (!wanted.every((word) => all.includes(word))) return 0;
  const whole = wanted.join(" ");
  if (texts.some((text) => text.startsWith(whole))) return 3;
  if (texts.some((text) => text.split(/[\s\-_/·.,()]+/).some((part) => part.startsWith(wanted[0]!)))) return 2;
  return 1;
}

/** The best `limit` items for the query, best first, then by name. */
export function rank<T>(items: T[], query: string, names: (item: T) => (string | null | undefined)[], limit: number): { items: T[]; total: number } {
  const scored = items
    .map((item) => ({ item, score: score(names(item), query), name: names(item)[0] ?? "" }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { items: scored.slice(0, limit).map((entry) => entry.item), total: scored.length };
}

/** A passage's opening words, on one line. */
export function excerpt(text: string, length = 110): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > length ? `${line.slice(0, length - 1).trimEnd()}…` : line;
}
