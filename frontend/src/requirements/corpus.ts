import type { CorpusRequirement, FindingKind, IndexState } from "../api/client";
import type { StatusTone } from "../design/components";

/** How long since a screen before a requirement counts as not screened lately. */
export const STALE_DAYS = 30;

export const STATE_WORDS: Record<IndexState, string> = {
  current: "Current",
  waiting: "Waiting to be indexed",
  failed: "Stopped indexing",
  rebuild_required: "Waits for the rebuild",
};

export const isState = (value: string | null): value is IndexState =>
  value === "current" || value === "waiting" || value === "failed" || value === "rebuild_required";

export const KIND_WORDS: Record<FindingKind, string> = {
  possible_duplicate: "Possible duplicate",
  possible_contradiction: "Possible contradiction",
};

/** Where a requirement stands, as one pill: the state that needs someone, or none when it is quietly current. */
export function standingOf(item: CorpusRequirement): { tone: StatusTone; words: string } | null {
  if (item.retired) return { tone: "stopped", words: "Retired" };
  if (item.duplicate) return { tone: "stopped", words: "Duplicate" };
  if (item.index_state === "failed") return { tone: "attention", words: STATE_WORDS.failed };
  if (item.index_state === "waiting") return { tone: "working", words: "Waiting" };
  if (item.index_state === "rebuild_required") return { tone: "neutral", words: "Waits for the rebuild" };
  return null;
}
