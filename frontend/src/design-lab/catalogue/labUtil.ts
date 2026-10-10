/** Small helpers shared by the catalogue mock-ups. */
import { useEffect } from "react";

const RULES = new Intl.PluralRules("en");

/** "1 call", "3 calls": the noun agrees with its number. */
export function plural(count: number, one: string, other = `${one}s`): string {
  return `${count} ${RULES.select(count) === "one" ? one : other}`;
}

const LIST = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

export function listOf(items: string[]): string {
  return LIST.format(items);
}

/** The tab says which screen this is, so a reader with several open can tell them apart. */
export function useTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Catalogue · Knowledge portal`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** The first sentence of a summary, ending in exactly one full stop. */
export function firstSentence(text: string): string {
  const [first] = text.split(/(?<=\.)\s/);
  return (first ?? text).trim().replace(/\.*$/, ".");
}

/** "200 Mbps" → 200; anything without a leading number → null. */
export function leadingNumber(value: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(gbps|mbps)?/i.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2]?.toLowerCase() === "gbps" ? n * 1000 : n;
}

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
