/**
 * Sending the Decide step's answers, apart from the page: the order of the calls,
 * and which of the service's refusals mean "already done" and may be passed over.
 * Every other failure stops the send and reaches the person.
 */
import type { Suggestion, SuggestionContent } from "../../api/client";
import { ApiError } from "../../api/errors";

/** What the send needs from the draft (useDraft), and nothing more. */
export type SendPort = {
  /** Accept or reject one suggestion; false when the service refused it (the draft says why). */
  decide: (decision: { suggestionId: string; accept: boolean; content?: SuggestionContent | null }) => Promise<boolean>;
  /** Accept every suggestion that can apply now; how many are left. */
  acceptReady: () => Promise<{ remaining: number }>;
  /** Suggest a system that answers wait for and nothing suggests. */
  settleSubject: (subject: { system_id: string; name: string; kind: "system" }) => Promise<unknown>;
  /** The draft's suggestions, read again. */
  refetchSuggestions: () => Promise<Suggestion[]>;
};

export type SendAnswer = { suggestionId: string; accept: boolean; content: SuggestionContent | null };

export type SendPlan = {
  /** Sent first. */
  rejected: SendAnswer[];
  /** Sent last, in the order accepting them works (inDependencyOrder). */
  accepted: SendAnswer[];
  /** The systems the accepted answers need first: suggested ones to accept, and by id those nothing suggests. */
  first: { accept: string[]; add: { id: string; name: string }[] };
  /** Also accept what the answers make ready, before and after them. */
  withFollowing: boolean;
};

export type SendOutcome = { done: number; refused: number; systems: number; remaining: number };

/** A refusal that only says the work is already done, or was done meanwhile, by its status and code. */
type Passable = { status: number; code?: string };

/** Accepting what is ready: the draft moved on meanwhile (409); the answers still go. */
const READY_PASSES: Passable[] = [{ status: 409 }];

/**
 * Suggesting a system the answers need: the draft has it already (422), nothing waits for it
 * any more (404), or the draft moved on (409). What is still open is accepted after.
 */
const SETTLE_PASSES: Passable[] = [
  { status: 409 },
  { status: 422, code: "invalid_architecture_knowledge" },
  { status: 404, code: "catalogue_suggestion_not_found" },
];

export function passes(error: unknown, allowed: Passable[]): boolean {
  return error instanceof ApiError && allowed.some((item) => item.status === error.status && (item.code === undefined || item.code === error.code));
}

async function passing<T>(call: () => Promise<T>, allowed: Passable[]): Promise<T | undefined> {
  try {
    return await call();
  } catch (error) {
    if (passes(error, allowed)) return undefined;
    throw error;
  }
}

/**
 * Rejections first; then, with `withFollowing`, what is ready; then the systems the answers
 * need (the service refuses a link to a system the draft lacks); then the answers in
 * dependency order; then what they made ready.
 */
export async function sendAnswers(port: SendPort, plan: SendPlan): Promise<SendOutcome> {
  const outcome: SendOutcome = { done: 0, refused: 0, systems: 0, remaining: 0 };
  const decide = async (answer: SendAnswer) => {
    if (await port.decide({ suggestionId: answer.suggestionId, accept: answer.accept, content: answer.content })) outcome.done += 1;
    else outcome.refused += 1;
  };
  const acceptReady = async () => {
    const result = await passing(port.acceptReady, READY_PASSES);
    if (result) outcome.remaining = result.remaining;
  };

  for (const answer of plan.rejected) await decide(answer);
  if (plan.withFollowing) await acceptReady();

  const add = new Map(plan.first.add.map((item) => [item.id, item.name]));
  for (const [systemId, name] of add) await passing(() => port.settleSubject({ system_id: systemId, name, kind: "system" }), SETTLE_PASSES);
  const wanted = new Set(plan.first.accept);
  if (add.size || wanted.size) {
    const now = await port.refetchSuggestions();
    const needed = now.filter((item) => item.status === "proposed" && item.content.kind === "system" && (wanted.has(item.id) || add.has(item.content.system_id)));
    for (const system of needed) if (await port.decide({ suggestionId: system.id, accept: true })) outcome.systems += 1;
  }

  for (const answer of plan.accepted) await decide(answer);
  if (plan.withFollowing) await acceptReady();
  return outcome;
}
