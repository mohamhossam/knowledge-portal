/**
 * A draft's decisions as questions (UX rebuild plan, phase 2): one for each
 * suggestion a person must decide, asked in plain words, with what each answer
 * does. Suggestions that name the same unknown system share one question, whose
 * answer covers them all. Pure, shared by the focus page and To do (which shows the first).
 */
import type { PossibleMatch, Suggestion, SuggestionContent } from "../../api/client";
import { type Lexicon, draftedForRequirement, inDependencyOrder, listed, standaloneSentence, suggestionState, systemsFirst, waitsFor } from "../suggestions";
import { NEW, linked } from "./decide";

export type DecideQuestion = {
  id: string;
  suggestion: Suggestion;
  /** The change it would make, as a sentence that names the system it is about. */
  sentence: string;
  /** What it still waits for once accepted, as a sentence ("Waits for the system RTF"), if anything. */
  waits?: string;
  /**
   * The missing systems accepting it adds first: suggested ones no one need decide, and by id
   * those nothing suggests. The service refuses a link to a system the draft lacks.
   */
  first?: { accept: Suggestion[]; add: { id: string; name: string }[] };
  /** The question, in a line. */
  prompt: string;
  /** For a name that may be a system the draft has: the role it plays, and the candidates. */
  match?: { role: string; writtenAs: string; candidates: PossibleMatch[] };
  /** The other suggestions naming the same system, which the answer covers too. */
  also: Suggestion[];
};

/** An answer: accept (as written, or with a match taken) or reject, with what each suggestion it covers becomes. */
export type DecideAnswer = { choice: string; accept: boolean; each: { suggestion: Suggestion; content: SuggestionContent | null }[] };

/** Every suggestion a question covers, the one it is asked about first. */
export const covered = (question: DecideQuestion): Suggestion[] => [question.suggestion, ...question.also];

/** A name as the document wrote it, the same however it is cased or spaced. */
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function decideQuestions(suggestions: Suggestion[], words: Lexicon): DecideQuestion[] {
  const open = suggestions.filter((item) => item.status === "proposed" && suggestionState(item) === "decide");
  // One question for each name a system may be: the system suggestion leads (it sorts first), the rest follow it.
  const named = new Map<string, Suggestion[]>();
  const asked: (Suggestion | string)[] = [];
  for (const suggestion of inDependencyOrder(open)) {
    const writtenAs = suggestion.possible_matches[0]?.written_as;
    if (writtenAs === undefined) {
      asked.push(suggestion);
      continue;
    }
    const key = nameKey(writtenAs);
    if (!named.has(key)) asked.push(key);
    named.set(key, [...(named.get(key) ?? []), suggestion]);
  }
  return asked.map((item) => {
    if (typeof item !== "string") return question(item, [], suggestions, words);
    const [lead, ...also] = named.get(item)!;
    return question(lead!, also, suggestions, words);
  });
}

function question(suggestion: Suggestion, also: Suggestion[], suggestions: Suggestion[], words: Lexicon): DecideQuestion {
  const sentence = standaloneSentence(suggestion, words);
  const needed = systemsFirst(suggestion, suggestions);
  // A system suggestion that is a question of its own is answered there, not taken for granted.
  const accept = needed.suggested.filter((item) => suggestionState(item) !== "decide");
  const add = needed.unsuggested.map((id) => ({ id, name: words.system(id) }));
  // What the others the answer covers need first is added first too, once each.
  for (const other of also) {
    const theirs = systemsFirst(other, suggestions);
    for (const item of theirs.suggested) if (suggestionState(item) !== "decide" && !accept.includes(item)) accept.push(item);
    for (const id of theirs.unsuggested) if (!add.some((known) => known.id === id)) add.push({ id, name: words.system(id) });
  }
  const first = accept.length || add.length ? { accept, add } : undefined;
  // With every system it waits for added first, it waits for nothing more, unless it also needs something else.
  const settled = first && needed.suggested.every((item) => accept.includes(item)) && needed.others.length === 0;
  const waits = suggestion.match.startsWith("needs_") && !settled ? waitsFor(suggestion, words) : undefined;
  const role = suggestion.possible_matches[0]?.role;
  if (role) {
    const candidates = suggestion.possible_matches.filter((item) => item.role === role);
    const writtenAs = candidates[0]!.written_as;
    // A system asks whether it is one the draft has; a link or a part asks which system it names.
    const prompt = suggestion.content.kind === "system"
      ? `Is “${writtenAs}” a system the draft already has?`
      : `Which system does “${writtenAs}” mean here?`;
    return { id: suggestion.id, suggestion, sentence, waits, first, prompt, match: { role, writtenAs, candidates }, also };
  }
  const prompt = suggestion.basis === "inferred"
    ? `Accept a link the reading inferred? ${sentence}`
    : draftedForRequirement(suggestion) && suggestion.match !== "updates_existing"
      ? `Accept what was drafted for a new offering? ${sentence}`
      : `Replace what the draft has? ${sentence}`;
  return { id: suggestion.id, suggestion, sentence, waits, first, prompt, also };
}

/** The answers a question offers, each with what it does. */
export function decideChoices(question: DecideQuestion): { value: string; label: string; consequence: string; answer: DecideAnswer }[] {
  const { suggestion, match, also } = question;
  const all = covered(question);
  const isSystem = suggestion.content.kind === "system";
  // One answer, given to every suggestion the question covers.
  const each = (content: (item: Suggestion) => SuggestionContent | null) => all.map((item) => ({ suggestion: item, content: content(item) }));
  const guessed = all.filter((item) => item.basis === "inferred").length;
  const inferred = !guessed ? "" : all.length === 1 ? " The link was inferred, not stated." : ` ${guessed} of them ${guessed === 1 ? "was" : "were"} inferred, not stated.`;
  // What else the answer covers: "the 3 suggestions that name it".
  const naming = also.length === 1 ? "suggestion that names it" : `${also.length} suggestions that name it`;
  const reject = {
    value: "reject",
    label: "Reject it",
    consequence: also.length
      ? `Neither it nor the ${naming} ${also.length === 1 ? "reaches" : "reach"} the draft.`
      : isSystem ? "It doesn't reach the draft, and what waits on it keeps waiting." : "It doesn't reach the draft.",
    answer: { choice: "reject", accept: false, each: each(() => null) },
  };
  if (match) {
    const key = nameKey(match.writtenAs);
    // Each points at the system in the role it names it in; a second name, if any, is kept as
    // written: the full Decide step can still match it.
    const pointing = (systemId: string) => (item: Suggestion) => {
      const role = item.possible_matches.find((other) => nameKey(other.written_as) === key)?.role ?? match.role;
      const base = Object.fromEntries(item.possible_matches.filter((other) => other.role !== role).map((other) => [other.role, NEW]));
      return linked(item, { ...base, [role]: systemId });
    };
    const accepted = (how: string) => `${all.length > 1 ? `All ${all.length} accepted` : "Accepted"}${how}`;
    return [
      ...match.candidates.map((candidate) => ({
        value: `match:${candidate.system_id}`,
        label: isSystem ? `Yes, it is ${candidate.system_name}` : `It means ${candidate.system_name}`,
        consequence: `${candidate.reason ? `${candidate.reason.replace(/\.?$/, ".")} ` : ""}${isSystem
          ? `Adds “${match.writtenAs}” as another name of ${candidate.system_name}.${also.length ? ` The ${naming} ${also.length === 1 ? "points" : "point"} at ${candidate.system_name}.` : ""}`
          : accepted(`, pointing at ${candidate.system_name}.`)}${inferred}`,
        answer: { choice: `match:${candidate.system_id}`, accept: true, each: each(pointing(candidate.system_id)) },
      })),
      {
        value: "new",
        label: isSystem ? "No, it is a new system" : "Keep the name as written",
        consequence: isSystem
          ? `Adds ${match.writtenAs} to the draft as a new system${also.length ? `, with the ${naming}` : ""}.`
          : accepted(` as the document wrote ${all.length > 1 ? "them" : "it"}, once the draft has a system called ${match.writtenAs}.`),
        answer: { choice: "new", accept: true, each: each(() => null) },
      },
      reject,
    ];
  }
  const systems = firstSystems(question);
  return [
    {
      value: "accept",
      label: `${suggestion.basis === "inferred" ? "Accept the link" : suggestion.match === "updates_existing" ? "Replace what the draft has" : "Accept it as drafted"}${systems ? `, adding ${systems}` : ""}`,
      // What accepting adds, the systems it needs first included, and what it then still waits for.
      consequence: `${systems ? `Adds ${systems} first, then: ` : "Adds: "}${question.sentence}.${question.waits ? ` ${question.waits.replace(/^Waits/, "Then it waits")}, and reaches the draft with it.` : ""}`,
      answer: { choice: "accept", accept: true, each: each(() => null) },
    },
    reject,
  ];
}

/** The systems an accepted answer adds first, in a phrase: "the system Generic AP PO". */
export function firstSystems(question: DecideQuestion): string {
  const names = [
    ...(question.first?.accept ?? []).map((item) => item.content.name || item.content.system_id),
    ...(question.first?.add ?? []).map((item) => item.name),
  ];
  if (!names.length) return "";
  return `the system${names.length > 1 ? "s" : ""} ${listed(names)}`;
}
