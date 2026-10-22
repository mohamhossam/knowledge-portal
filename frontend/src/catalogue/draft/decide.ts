import type { Suggestion, SuggestionContent } from "../../api/client";
import type { StatusTone } from "../../design/components";
import { STATE_LABEL, draftedForRequirement, fromCatalogue, suggestionState } from "../suggestions";

/** Each suggestion state as a status tone: a decision due is held (ochre), never an alert. */
export const STATE_TONE: Record<ReturnType<typeof suggestionState>, StatusTone> = {
  decide: "held",
  ready: "neutral",
  waits: "neutral",
  present: "neutral",
  accepted: "done",
  rejected: "stopped",
};

/** A suggestion's state in words, saying when it was accepted with edits. */
export function stateWords(suggestion: Suggestion): string {
  return suggestion.status === "accepted" && suggestion.edited ? "Accepted with edits" : STATE_LABEL[suggestionState(suggestion)];
}

/** The part of a change request a suggestion comes from: an approved feature, or the decided product impact. */
export function citedPart(suggestion: Suggestion): string {
  return draftedForRequirement(suggestion) ? "the decided product impact" : `Feature ${suggestion.change_request?.feature_id ?? ""}`;
}

/** A possible match's answer that keeps the name as written: a new system, or the name the document used. */
export const NEW = "__new__";

/** The content to accept once the matches are chosen: unchanged unless a match was taken. */
export function linked(suggestion: Suggestion, choice: Record<string, string>): SuggestionContent | null {
  let content: SuggestionContent | null = null;
  for (const [role, systemId] of Object.entries(choice)) {
    if (systemId === NEW) continue;
    content = content ?? { ...suggestion.content };
    if (role === "target") content.target_system_id = systemId;
    else content.system_id = systemId;
  }
  return content;
}

/** Where a cited place is: the document's title and the place in it, or the place in the draft's own catalogue. */
export function citedSource(suggestion: Suggestion, document: { title: string } | undefined, location: string): string {
  return fromCatalogue(suggestion) ? location : `${document?.title ?? "A document no longer in the draft"} · ${location}`;
}

