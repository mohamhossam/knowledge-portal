import { api, type CorpusFinding, type FindingAge } from "../api/client";
import { count } from "../home/format";

export const DAY = 24 * 60 * 60 * 1000;
export const FINDINGS_KEY = ["knowledge-center", "requirement-corpus", "findings"] as const;

export type Person = NonNullable<CorpusFinding["subject"]["owner"]>;

export const AGE_WORDS: Record<FindingAge, { group: string; status: string }> = {
  over_30_days: { group: "Open over 30 days", status: "Overdue" },
  from_7_to_30_days: { group: "Open 7 to 30 days", status: "Awaiting owners" },
  under_7_days: { group: "Open under 7 days", status: "With their owners" },
};

export const isAge = (value: string | null): value is FindingAge =>
  value === "over_30_days" || value === "from_7_to_30_days" || value === "under_7_days";

/** "today", "yesterday", "5 days ago". */
export function daysAgo(iso: string, now: number): string {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

/** "Opened today", "Open 40 days". */
export function standing(item: CorpusFinding, now: number): string {
  const days = Math.max(0, Math.floor((now - new Date(item.raised_at).getTime()) / DAY));
  return days === 0 ? "Opened today" : `Open ${count(days, "day")}`;
}

/** The finding's owners, each once: requirement work notifies each distinct owner once. */
export function owners(item: CorpusFinding): Person[] {
  const found = new Map<string, Person>();
  for (const owner of [item.subject.owner, item.related.owner]) if (owner) found.set(owner.id, owner);
  return [...found.values()];
}

/** "Ravi Reviewer and you": the others by name, the signed-in admin last, as "you". */
export function names(people: Person[], me: string | undefined): string {
  const words = [...people.filter((person) => person.id !== me).map((person) => person.display_name)];
  if (people.some((person) => person.id === me)) words.push("you");
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** A finding the batch may ask about: not waiting out its week, and someone to ask. */
export const askable = (item: CorpusFinding) => item.next_nudge_at === null && owners(item).length > 0;

/** Every overdue finding, page by page (at most a thousand), for the batch ask. */
export async function allOverdue(): Promise<CorpusFinding[]> {
  const found: CorpusFinding[] = [];
  for (let offset: number | null = 0; offset !== null && found.length < 1000;) {
    const page = await api.corpusFindings({ age: "over_30_days" }, offset);
    found.push(...page.items);
    offset = page.next_offset;
  }
  return found;
}
