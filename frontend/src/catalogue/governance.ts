/**
 * Where the catalogue's knowledge comes from, and where its sources disagree
 * (requirement-portal ADR-0101, step 5): levels in words, the registered source a
 * fact's source text names, and the conflicts that concern an offering. Pure functions.
 */
import { createContext, useContext } from "react";

import type { KnowledgeSource, Offering, SourceConflict, SourceLevel } from "../api/client";

/** A level as the original explorer ranked its sources. */
export const LEVEL: Record<SourceLevel, { short: string; word: string; long: string }> = {
  L1: { short: "L1", word: "Canonical", long: "The canonical landscape every product rests on" },
  L2: { short: "L2", word: "Primary", long: "A primary source for its scope" },
  L3: { short: "L3", word: "Carried forward", long: "A baseline carried forward, not re-verified" },
};

export const LEVEL_OPTIONS = (Object.keys(LEVEL) as SourceLevel[]).map((level) => ({ value: level, label: `${level}: ${LEVEL[level].word}` }));

/**
 * The registered source a fact's source text begins with, by id or short name: "BPP SDD
 * §10" names the source short-named "BPP SDD". The longest name wins, and a name ends
 * where a word does, as the service reads it.
 */
export function namedSource(text: string | null | undefined, sources: KnowledgeSource[]): KnowledgeSource | null {
  const written = (text ?? "").trim().toLocaleLowerCase();
  if (!written) return null;
  let best: { length: number; source: KnowledgeSource } | null = null;
  for (const source of sources) {
    for (const name of [source.id, source.short]) {
      const key = (name ?? "").trim().toLocaleLowerCase();
      if (!key || !written.startsWith(key)) continue;
      const next = written.charAt(key.length);
      if (next && /[\p{L}\p{N}]/u.test(next)) continue;
      if (!best || key.length > best.length) best = { length: key.length, source };
    }
  }
  return best?.source ?? null;
}

/** A source's level as it follows its name: "(L2)", "(L3, not supplied)". */
export function levelTag(source: KnowledgeSource): string {
  return `(${source.level}${source.supplied === false ? ", not supplied" : ""})`;
}

/**
 * A fact's source text with its source's level after the name it cites, when it names a
 * registered one: "BPP SDD §10" reads "BPP SDD (L2) §10", as a conflict's sides do.
 */
export function withLevel(text: string | null | undefined, sources: KnowledgeSource[]): string | null {
  const written = (text ?? "").trim();
  if (!written) return null;
  const source = namedSource(written, sources);
  if (!source) return written;
  const name = [source.short, source.id]
    .filter((item): item is string => !!item)
    .sort((a, b) => b.length - a.length)
    .find((item) => written.toLocaleLowerCase().startsWith(item.trim().toLocaleLowerCase())) ?? "";
  const cited = written.slice(0, name.trim().length);
  const rest = written.slice(name.trim().length).trim();
  return [cited, levelTag(source), rest].filter(Boolean).join(" ");
}

/** The source register a page reads from, so any fact's source can say its level. */
export const SourcesContext = createContext<KnowledgeSource[]>([]);

/** Says a fact's source text with its level, from the register in context. */
export function useSourceText(): (text: string | null | undefined) => string | null {
  const sources = useContext(SourcesContext);
  return (text) => withLevel(text, sources);
}

/** The conflicts that concern an offering, and one of its order types when given. */
export function conflictsFor(conflicts: SourceConflict[], productId: string, orderCode?: string | null): SourceConflict[] {
  return conflicts.filter((conflict) =>
    conflict.scope.some(
      (scope) =>
        scope.product_id === productId &&
        (!orderCode || !(scope.order_types ?? []).length || (scope.order_types ?? []).some((code) => code.toLocaleLowerCase() === orderCode.toLocaleLowerCase())),
    ),
  );
}

/** The question a conflict raises for an offering, when it names one. */
export function questionOf(conflict: SourceConflict, productId: string): string | null {
  return conflict.scope.find((scope) => scope.product_id === productId)?.question_id ?? null;
}

/** The conflicts that raise one of the offering's questions. */
export function raisedBy(offering: Offering, conflicts: SourceConflict[], questionId: string): SourceConflict[] {
  return conflicts.filter((conflict) => questionOf(conflict, offering.id)?.toLocaleLowerCase() === questionId.toLocaleLowerCase());
}

/**
 * The offering's open questions a list shows. Beside a list of conflicts, a question some
 * conflict of the offering raises is left out: the conflicts listed say it, and another order
 * type's conflict leaves it to that order type.
 */
export function shownQuestions(offering: Offering, conflicts: SourceConflict[], beside?: SourceConflict[]): {
  shown: NonNullable<Offering["questions"]>;
  withConflicts: number;
} {
  const all = offering.questions ?? [];
  const raised = (id: string) => raisedBy(offering, conflicts, id);
  return {
    shown: beside ? all.filter((question) => raised(question.id).length === 0) : all,
    withConflicts: beside ? all.filter((question) => raised(question.id).some((conflict) => beside.includes(conflict))).length : 0,
  };
}

/** A conflict that still raises a question the offering would no longer have: it must change first. */
export function questionProblem(value: Offering, conflicts: SourceConflict[]): string | null {
  const asked = new Set((value.questions ?? []).map((item) => item.id.trim().toLocaleLowerCase()));
  for (const conflict of conflicts) {
    const question = questionOf(conflict, value.id);
    if (question && !asked.has(question.toLocaleLowerCase())) {
      return `The conflict ${conflict.title} raises the question ${question}; change the conflict first.`;
    }
  }
  return null;
}

/** The sources in the register's order: canonical first, then primary, then carried forward. */
export function byLevel(sources: KnowledgeSource[]): KnowledgeSource[] {
  return [...sources].sort((a, b) => a.level.localeCompare(b.level) || a.title.localeCompare(b.title));
}

/** An id not yet taken, from a name or a prefix and a number: "SDD", "CF-03". */
function freeId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id.toLocaleLowerCase()); n += 1) id = `${base}-${n}`;
  taken.add(id.toLocaleLowerCase());
  return id;
}

/** Every item with an id: the one it has, or one made from its name. */
export function withIds<T extends { id: string }>(items: T[], name: (item: T, index: number) => string): T[] {
  const taken = new Set(items.map((item) => item.id.trim().toLocaleLowerCase()).filter(Boolean));
  return items.map((item, index) => (item.id.trim() ? { ...item, id: item.id.trim() } : { ...item, id: freeId(name(item, index), taken) }));
}
