/**
 * Where the catalogue's knowledge comes from, and where its sources disagree
 * (requirement-portal ADR-0101, step 5): levels in words, the registered source a
 * fact's source text names, and the conflicts that concern an offering. Pure functions.
 */
import { createContext, useContext } from "react";

import type { ChangeRecord, KnowledgeSource, Offering, SourceConflict, SourceLevel, SourceReference } from "../api/client";

/** A level as the original explorer ranked its sources. */
export const LEVEL: Record<SourceLevel, { short: string; word: string; long: string }> = {
  L1: { short: "L1", word: "Canonical", long: "The canonical landscape every product rests on" },
  L2: { short: "L2", word: "Primary", long: "A primary source for its scope" },
  L3: { short: "L3", word: "Carried forward", long: "A baseline carried forward, not re-verified" },
};

export const LEVEL_OPTIONS = (Object.keys(LEVEL) as SourceLevel[]).map((level) => ({ value: level, label: `${level}: ${LEVEL[level].word}` }));

/**
 * A version's source register, with every source line its facts write as the service read
 * it (review recommendation 5). The service reads a line once, by one rule; a screen looks
 * a line up here and never matches it itself.
 */
export type SourceRegister = {
  sources: ReadonlyMap<string, KnowledgeSource>;
  lines: ReadonlyMap<string, SourceReference>;
};

export const EMPTY_REGISTER: SourceRegister = { sources: new Map(), lines: new Map() };

/** The register of a version as the API sends it. */
export function sourceRegister(release: { sources?: KnowledgeSource[] | null; source_references?: SourceReference[] | null }): SourceRegister {
  return {
    sources: new Map((release.sources ?? []).map((item) => [item.id, item])),
    lines: new Map((release.source_references ?? []).map((item) => [item.text, item])),
  };
}

/** The registered source a fact's source line names, as the service read it; null when it names none. */
export function namedSource(text: string | null | undefined, register: SourceRegister): KnowledgeSource | null {
  const id = register.lines.get((text ?? "").trim())?.source_id;
  return (id && register.sources.get(id)) || null;
}

/** A source's level as it follows its name: "(L2)", "(L3, not supplied)". */
export function levelTag(source: KnowledgeSource): string {
  return `(${source.level}${source.supplied === false ? ", not supplied" : ""})`;
}

/**
 * A fact's source text with its source's level after the name it cites, when it names a
 * registered one: "BPP SDD §10" reads "BPP SDD (L2) §10", as a conflict's sides do. A line
 * the service has not read yet (typed in an editor, not yet saved) reads as written.
 */
export function withLevel(text: string | null | undefined, register: SourceRegister): string | null {
  const written = (text ?? "").trim();
  if (!written) return null;
  const line = register.lines.get(written);
  const source = line?.source_id ? register.sources.get(line.source_id) : undefined;
  if (!line || !source || !line.cited) return written;
  return [line.cited, levelTag(source), line.rest].filter(Boolean).join(" ");
}

/** The source register a page reads from, so any fact's source can say its level. */
export const SourcesContext = createContext<SourceRegister>(EMPTY_REGISTER);

/** Says a fact's source text with its level, from the register in context. */
export function useSourceText(): (text: string | null | undefined) => string | null {
  const register = useContext(SourcesContext);
  return (text) => withLevel(text, register);
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

/** An open question on one line: "title: text" when it has a title, else its text. */
export function questionLine(question: Pick<Offering["questions"][number], "title" | "text">): string {
  return question.title ? `${question.title}: ${question.text}` : question.text;
}

/** The question a conflict raises for an offering, when it names one. */
export function questionOf(conflict: SourceConflict, productId: string): string | null {
  return conflict.scope.find((scope) => scope.product_id === productId)?.question_id ?? null;
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

/** What became of a change request's item, in words; nothing when it was simply recorded. */
export const ITEM_STATUS: Record<ChangeRecord["items"][number]["status"] & string, string | null> = {
  recorded: null,
  inferred: "mapped automatically",
  gap: "needs an architect's review",
  conflict: "needs a decision",
};

/** How a source is cited at the head of a line: its short name, or else its id, which the service reads either way. */
export const citedAs = (source: KnowledgeSource) => source.short?.trim() || source.id;

/** A source as an option: as it is cited, then its title when that says more. */
const optionLabel = (source: KnowledgeSource) => `${citedAs(source)}${source.title && source.title !== citedAs(source) ? `: ${source.title}` : ""}`;

/** Registered sources, grouped by level as the register ranks them: "Canonical (L1)", "Primary (L2)", "Carried forward (L3)". */
export function registerOptions(sources: KnowledgeSource[]): { value: string; label: string; group: string }[] {
  return byLevel(sources).map((source) => ({
    value: source.id,
    label: optionLabel(source),
    group: `${LEVEL[source.level as SourceLevel]?.word ?? source.level} (${source.level})`,
  }));
}
