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
