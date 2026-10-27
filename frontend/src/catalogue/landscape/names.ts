/** How the architecture map names a system on its card: a short purpose, and a monogram. */

/** A system's purpose in a few words: the text before the first colon or full stop, cut at a word. */
export function shortFunction(text: string): string {
  const head = (text.split(/[:.;]|\s[—–]\s/)[0] ?? "").trim();
  if (head.length <= 46) return head;
  return `${head.slice(0, 44).replace(/\s+\S*$/, "")}…`;
}

/**
 * A system's monogram: its acronym in brackets ("Digital Catalog (BCC)"), else
 * its last acronym ("Netcracker CSRD", "B2B BFF", "vEDA"), else a short name
 * whole ("XaaS"), else the initials of up to three words.
 */
export function monogram(name: string): string {
  const bracket = /\(([A-Z0-9]{2,4})\)/.exec(name)?.[1];
  if (bracket) return bracket;
  const words = name
    .replace(/\(.*\)/, "")
    .split(/[\s/]+/)
    .filter(Boolean);
  const acronym = words.filter((word) => /^[a-z]?[A-Z0-9]{2,}$/.test(word)).at(-1);
  if (acronym) return acronym.length <= 4 ? acronym : acronym.slice(0, 3);
  const first = words[0] ?? name;
  if (words.length === 1 && first.length <= 4) return first;
  if (words.length > 1) return words.slice(0, 3).map((word) => word[0] ?? "").join("");
  return first.slice(0, 2);
}
