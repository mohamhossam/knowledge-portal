import type { Suggestion } from "../../api/client";
import type { StatusTone } from "../../design/components";
import { STATE_LABEL, draftedForRequirement, suggestionState } from "../suggestions";

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
