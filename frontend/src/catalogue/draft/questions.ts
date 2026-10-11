/**
 * A draft's decisions as questions (UX rebuild plan, phase 2): one for each
 * suggestion a person must decide, asked in plain words, with what each answer
 * does. Pure, shared by the focus page and To do (which shows the first).
 */
import type { PossibleMatch, Suggestion, SuggestionContent } from "../../api/client";
import { type Lexicon, changeSentence, draftedForRequirement, inDependencyOrder, suggestionState } from "../suggestions";
import { NEW, linked } from "./decide";

export type DecideQuestion = {
  id: string;
  suggestion: Suggestion;
  /** The change it would make, as a sentence. */
  sentence: string;
  /** The question, in a line. */
  prompt: string;
  /** For a name that may be a system the draft has: the role it plays, and the candidates. */
  match?: { role: string; writtenAs: string; candidates: PossibleMatch[] };
};

/** An answer: accept (as written, or with a match taken) or reject. */
export type DecideAnswer = { choice: string; accept: boolean; content: SuggestionContent | null };

export function decideQuestions(suggestions: Suggestion[], words: Lexicon): DecideQuestion[] {
  const open = suggestions.filter((item) => item.status === "proposed" && suggestionState(item) === "decide");
  return inDependencyOrder(open).map((suggestion) => {
    const sentence = changeSentence(suggestion, words);
    const role = suggestion.possible_matches[0]?.role;
    if (role) {
      const candidates = suggestion.possible_matches.filter((item) => item.role === role);
      const writtenAs = candidates[0]!.written_as;
      // A system asks whether it is one the draft has; a link or a part asks which system it names.
      const prompt = suggestion.content.kind === "system"
        ? `Is “${writtenAs}” a system the draft already has?`
        : `Which system does “${writtenAs}” mean here?`;
      return { id: suggestion.id, suggestion, sentence, prompt, match: { role, writtenAs, candidates } };
    }
    const prompt = suggestion.basis === "inferred"
      ? `Accept a link the reading inferred? ${sentence}`
      : draftedForRequirement(suggestion) && suggestion.match !== "updates_existing"
        ? `Accept what was drafted for a new offering? ${sentence}`
        : `Replace what the draft has? ${sentence}`;
    return { id: suggestion.id, suggestion, sentence, prompt };
  });
}

/** The answers a question offers, each with what it does. */
export function decideChoices(question: DecideQuestion): { value: string; label: string; consequence: string; answer: DecideAnswer }[] {
  const { suggestion, match } = question;
  const inferred = suggestion.basis === "inferred";
  const isSystem = suggestion.content.kind === "system";
  const reject = {
    value: "reject",
    label: "Reject it",
    consequence: isSystem ? "It doesn't reach the draft, and what waits on it keeps waiting." : "It doesn't reach the draft.",
    answer: { choice: "reject", accept: false, content: null },
  };
  if (match) {
    const others = suggestion.possible_matches.filter((item) => item.role !== match.role);
    // A second name, if any, is kept as written: the full Decide step can still match it.
    const base = Object.fromEntries(others.map((item) => [item.role, NEW]));
    return [
      ...match.candidates.map((candidate) => ({
        value: `match:${candidate.system_id}`,
        label: isSystem ? `Yes, it is ${candidate.system_name}` : `It means ${candidate.system_name}`,
        consequence: `${candidate.reason ? `${candidate.reason.replace(/\.?$/, ".")} ` : ""}${isSystem ? `Adds “${match.writtenAs}” as another name of ${candidate.system_name}.` : `Accepted, pointing at ${candidate.system_name}.`}${inferred ? " The link was inferred, not stated." : ""}`,
        answer: { choice: `match:${candidate.system_id}`, accept: true, content: linked(suggestion, { ...base, [match.role]: candidate.system_id }) },
      })),
      {
        value: "new",
        label: isSystem ? "No, it is a new system" : "Keep the name as written",
        consequence: isSystem
          ? `Adds ${match.writtenAs} to the draft as a new system.`
          : `Accepted as the document wrote it, once the draft has a system called ${match.writtenAs}.`,
        answer: { choice: "new", accept: true, content: null },
      },
      reject,
    ];
  }
  return [
    {
      value: "accept",
      label: inferred ? "Accept the link" : suggestion.match === "updates_existing" ? "Replace what the draft has" : "Accept it as drafted",
      consequence: `${question.sentence}.`,
      answer: { choice: "accept", accept: true, content: null },
    },
    reject,
  ];
}
