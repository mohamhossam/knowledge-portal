import "./draft.css";

import { type ReactNode, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { Release, Suggestion } from "../../api/client";
import { errorMessage } from "../../api/errors";
import {
  ActionGroup, Button, Dialog, EmptyState, EvidenceQuote, FocusFrame, FocusQuestion, type FocusStep, FocusTitle, Lines, Skeleton, Status, Suggested,
} from "../../design/components";
import { Diagram, type DiagramNode, tree } from "../../design/diagram";
import { count } from "../../home/format";
import { RouterLink } from "../../shell/links";
import {
  type Lexicon, bulkAcceptable, changeSentence, decideWhy, dependencyEdges, inDependencyOrder, inWords, lexicon, suggestionState, waitsFor,
} from "../suggestions";
import { useCatalogueContext } from "../useCatalogue";
import { useDraft } from "../useDraft";
import { stateWords } from "./decide";
import { type DecideAnswer, type DecideQuestion, decideChoices, decideQuestions } from "./questions";

/** How many suggestions the summary names before "and N more". */
const NAMED = 8;

const nameOf = (release: Release) => release.name || "Untitled version";

/**
 * A draft's Decide step in focus mode (UX rebuild plan, phase 2): the
 * suggestions a person must decide, one question at a time, beside the tree
 * of what waits on what. Answers are kept here until the summary, which lists
 * what the answers accept and reject and what follows from them; nothing
 * reaches the draft before the curator confirms it there.
 */
export function DecideFocus() {
  const { book, base } = useCatalogueContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = params.get("from") === "todo" ? "/" : `${base}/decide`;
  const release = book.release;
  if (release.status !== "draft") {
    return (
      <FocusFrame work={<bdi>{nameOf(release)}</bdi>} place="Nothing to decide" steps={[]} onLeave={() => navigate(back)} documentTitle={`Decide · ${nameOf(release)}`}>
        <FocusTitle>Only a draft has suggestions to decide</FocusTitle>
        <EmptyState title="This catalogue version isn't a draft." action={<RouterLink href="/architecture/versions">See every version</RouterLink>} />
      </FocusFrame>
    );
  }
  return <Run release={release} base={base} back={back} />;
}

function Run({ release, base, back }: { release: Release; base: string; back: string }) {
  const draft = useDraft(release);
  const navigate = useNavigate();
  const all = useMemo(() => draft.suggestions.data?.suggestions ?? [], [draft.suggestions.data]);
  const words = useMemo(() => lexicon(release, all), [release, all]);
  // The questions are fixed for the run: deciding one never moves the others.
  const [frozen, setFrozen] = useState<DecideQuestion[] | null>(null);
  const fresh = useMemo(() => decideQuestions(all, words), [all, words]);
  if (frozen === null && draft.suggestions.isSuccess) setFrozen(fresh);
  const questions = useMemo(() => frozen ?? [], [frozen]);
  const asked = useMemo(() => questions.map((item) => item.id), [questions]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, DecideAnswer>>({});
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [choice, setChoice] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const work = <bdi>{nameOf(release)}</bdi>;
  const given = Object.keys(answers).length;
  // Answers live here until the summary sends them: leaving with some asks first.
  const leave = () => (given > 0 ? setLeaving(true) : navigate(back));
  const leaveDialog = (
    <Dialog
      open={leaving}
      title="Leave without sending your answers?"
      onClose={() => setLeaving(false)}
      actions={
        <>
          <Button variant="primary" data-autofocus onClick={() => setLeaving(false)}>Stay</Button>
          <Button onClick={() => { setLeaving(false); navigate(back); }}>Leave without sending</Button>
        </>
      }
    >
      <p>You have given {count(given, "answer")}. They reach the draft only from the summary; leaving loses {given === 1 ? "it" : "them"}.</p>
    </Dialog>
  );
  if (draft.suggestions.isPending) {
    return (
      <FocusFrame work={work} place="Reading the suggestions" steps={[]} onLeave={leave} documentTitle={`Decide · ${nameOf(release)}`}>
        <Skeleton label="Reading the suggestions" rows={6} />
      </FocusFrame>
    );
  }
  if (draft.suggestions.isError) {
    return (
      <FocusFrame work={work} place="Couldn't read the suggestions" steps={[]} onLeave={leave} documentTitle={`Decide · ${nameOf(release)}`}>
        <FocusTitle>Couldn't read the suggestions</FocusTitle>
        <EmptyState title={errorMessage(draft.suggestions.error)} action={<Button onClick={() => void draft.suggestions.refetch()}>Try again</Button>} />
      </FocusFrame>
    );
  }

  const atSummary = index >= questions.length;
  const go = (next: number) => {
    setIndex(next);
    setChoice(null);
  };
  const nextOpen = (from: number) => {
    for (let at = from + 1; at < questions.length; at += 1) if (!answers[questions[at]!.id] && !skipped.has(questions[at]!.id)) return at;
    return questions.length;
  };
  const steps: FocusStep[] = questions.map((item, at) =>
    at === index ? "current" : answers[item.id] ? "answered" : skipped.has(item.id) ? "skipped" : "open");
  const place = atSummary ? "Summary" : `Question ${index + 1} of ${questions.length}`;
  const current = questions[index];
  const aside = (
    <DecisionTree suggestions={all} words={words} answers={answers} asked={asked} current={atSummary ? undefined : current?.suggestion.id} />
  );
  const frame = (children: ReactNode) => (
    <>
      <FocusFrame
        work={work}
        place={place}
        steps={steps}
        onLeave={leave}
        leaveLabel="Leave focus mode"
        documentTitle={`${place} · Decide · ${nameOf(release)}`}
        aside={all.some((item) => item.status === "proposed") ? aside : undefined}
        asideLabel="What waits on what"
      >
        {children}
      </FocusFrame>
      {leaveDialog}
    </>
  );

  if (atSummary) {
    return frame(
      <Summary
        release={release}
        all={all}
        words={words}
        questions={questions}
        answers={answers}
        draft={draft}
        onBack={go}
        onDone={(notice) => navigate(`${base}/decide`, { state: { notice } })}
      />,
    );
  }

  const question = current!;
  const choices = decideChoices(question);
  // The same name answered already: offered again, so one answer covers every link to it.
  const sameName = question.match
    ? questions.find((other) => other.id !== question.id && other.match?.writtenAs === question.match?.writtenAs && answers[other.id])
    : undefined;
  const echoed = sameName && choices.some((item) => item.value === answers[sameName.id]!.choice) ? answers[sameName.id]!.choice : undefined;
  const value = choice ?? answers[question.id]?.choice ?? echoed;
  const { suggestion } = question;
  const citation = suggestion.citations[0];
  const document = release.documents.find((item) => item.id === suggestion.document_version_id);
  return frame(
    <FocusQuestion<string>
      key={question.id}
      title={question.prompt}
      lead={
        <>
          <Suggested basis={suggestion.basis === "inferred" ? "inferred" : "stated"} /> {decideWhy(suggestion)}.
          {echoed && !answers[question.id] && !choice && <> Chosen from your earlier answer about “{question.match?.writtenAs}”.</>}
        </>
      }
      source={
        <>
          <p dir="auto"><strong>{question.sentence}</strong></p>
          {citation?.quote ? (
            <EvidenceQuote
              text={citation.quote}
              source={suggestion.change_request ? <bdi>{suggestion.change_request.change_request_id}</bdi> : <><bdi>{document?.title ?? "A document no longer in the draft"}</bdi> · {citation.location}</>}
            />
          ) : (
            <p className="draft-quiet">The suggestion cites no passage.</p>
          )}
          {suggestion.rationale && <p dir="auto"><span className="draft-quiet">Why it was inferred:</span> {suggestion.rationale}</p>}
        </>
      }
      choices={choices.map((item) => ({ value: item.value, label: item.label, consequence: item.consequence }))}
      value={value}
      onChange={setChoice}
      onNext={() => {
        const picked = choices.find((item) => item.value === value);
        if (!picked) return;
        setAnswers((all) => ({ ...all, [question.id]: picked.answer }));
        setSkipped((all) => {
          if (!all.has(question.id)) return all;
          const next = new Set(all);
          next.delete(question.id);
          return next;
        });
        go(nextOpen(index));
      }}
      onSkip={() => {
        setSkipped((all) => new Set(all).add(question.id));
        go(nextOpen(index));
      }}
    >
      <p className="draft-quiet">
        To edit it before accepting, <RouterLink href={`${base}/decide`}>open it in the Decide step</RouterLink>.
      </p>
    </FocusQuestion>,
  );
}

/** A suggestion's name in a node: what it adds, short. */
function nodeLabel(suggestion: Suggestion, words: Lexicon): string {
  const { content } = suggestion;
  switch (content.kind) {
    case "relationship":
      return `${suggestion.system_name ?? words.system(content.system_id)} → ${suggestion.target_system_name ?? words.system(content.target_system_id ?? "")}`;
    case "placement":
      return `Place ${suggestion.system_name ?? words.system(content.system_id)}`;
    case "constraint":
      return content.text;
    case "journey":
      return content.journey?.name ?? content.name;
    default:
      return content.name || content.text || content.kind;
  }
}

const KIND_WORD: Partial<Record<Suggestion["content"]["kind"], string>> = {
  system: "System",
  component: "Component",
  capability: "Capability",
  constraint: "Constraint",
  relationship: "Link",
  placement: "Placement",
  landscape_domain: "Domain",
  product: "Offering",
  journey: "Journey",
  channel: "Channel",
  question: "Question",
};

/** The draft decision tree: what the suggestions to decide settle, to their right. */
function DecisionTree({ suggestions, words, answers, asked, current }: {
  suggestions: Suggestion[]; words: Lexicon; answers: Record<string, DecideAnswer>; asked: string[]; current?: string;
}) {
  const layout = useMemo(() => {
    const proposed = suggestions.filter((item) => item.status === "proposed");
    const edges = dependencyEdges(proposed);
    // Only what the questions touch: what each one waits on, and what waits on it, all the way along.
    const reach = (up: boolean) => {
      const seen = new Set(asked);
      for (let grew = true; grew; ) {
        grew = false;
        for (const edge of edges) {
          const [from, to] = up ? [edge.to, edge.from] : [edge.from, edge.to];
          if (seen.has(from) && !seen.has(to)) {
            seen.add(to);
            grew = true;
          }
        }
      }
      return seen;
    };
    const kept = new Set([...reach(true), ...reach(false)]);
    const open = proposed.filter((item) => kept.has(item.id));
    const nodes: DiagramNode[] = open.map((item) => {
      const state = suggestionState(item);
      const answer = answers[item.id];
      return {
        id: item.id,
        label: nodeLabel(item, words),
        detail: KIND_WORD[item.content.kind] ?? item.content.kind,
        status: answer ? (answer.accept ? "You accept it" : "You reject it") : item.id === current ? "This question" : stateWords(item),
        tone: item.id === current ? "subject" : answer ? (answer.accept ? "ready" : "muted") : state === "decide" ? "decide" : "plain",
      };
    });
    return tree(nodes, edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to)), { nodeWidth: 220, columnGap: 40 });
  }, [suggestions, words, answers, asked, current]);
  return (
    <Diagram
      label="What waits on what"
      caption="What your answers settle: each one settles what is to its right"
      layout={layout}
      legend={<>Amber: needs your decision. Maroon: this question. Green: you accept it.</>}
    />
  );
}

function Summary({ release, all, words, questions, answers, draft, onBack, onDone }: {
  release: Release;
  all: Suggestion[];
  words: Lexicon;
  questions: DecideQuestion[];
  answers: Record<string, DecideAnswer>;
  draft: ReturnType<typeof useDraft>;
  onBack: (index: number) => void;
  onDone: (notice: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const accepted = questions.filter((item) => answers[item.id]?.accept);
  const rejected = questions.filter((item) => answers[item.id] && !answers[item.id]!.accept);
  const open = questions.map((item, at) => ({ item, at })).filter(({ item }) => !answers[item.id]);
  const follows = useMemo(() => {
    // What the answers accept, as it will be accepted: with a match taken, it adds what the match says.
    const given = questions
      .filter((item) => answers[item.id]?.accept)
      .map((item) => ({ ...item.suggestion, content: answers[item.id]!.content ?? item.suggestion.content }));
    const result = bulkAcceptable(release, all, given);
    return [...result.ready, ...result.lifted];
  }, [release, all, questions, answers]);
  const settled = new Set([...questions.filter((item) => answers[item.id]).map((item) => item.id), ...follows.map((item) => item.id)]);
  const still = all.filter((item) => item.status === "proposed" && !settled.has(item.id) && !open.some(({ item: question }) => question.id === item.id));

  const send = async (withFollowing: boolean) => {
    setSending(true);
    setFailed(null);
    let done = 0;
    let refused = 0;
    const decide = async (question: DecideQuestion) => {
      const answer = answers[question.id]!;
      if (await draft.decide({ suggestionId: question.id, accept: answer.accept, content: answer.content })) done += 1;
      else refused += 1;
    };
    try {
      // Rejections first; then what follows, so the answers find the systems they hang on; then the answers.
      for (const question of rejected) await decide(question);
      const last = { remaining: 0 };
      const acceptReady = async () => {
        try {
          last.remaining = (await draft.acceptReady.mutateAsync()).remaining;
        } catch {
          // Nothing was ready, or the draft moved on: the answers still go.
        }
      };
      if (withFollowing) await acceptReady();
      const order = inDependencyOrder(accepted.map((item) => item.suggestion)).map((suggestion) => accepted.find((item) => item.id === suggestion.id)!);
      for (const question of order) await decide(question);
      if (withFollowing) await acceptReady();
      const parts = [
        `${count(done, "answer")} sent${withFollowing ? ", and what followed accepted" : ""}`,
        refused ? `${count(refused, "answer")} couldn't be taken: decide ${refused === 1 ? "it" : "them"} here` : "",
        last.remaining ? `${count(last.remaining, "suggestion")} still ${last.remaining === 1 ? "waits" : "wait"} for you` : "",
      ].filter(Boolean);
      onDone(`${parts.join("; ")}.`);
    } catch (error) {
      setFailed(inWords(errorMessage(error), words));
    } finally {
      setSending(false);
    }
  };

  const sentence = (suggestion: Suggestion) => changeSentence(suggestion, words);
  const listed = (items: Suggestion[], label: string, line: (item: Suggestion) => ReactNode = sentence) => (
    <Lines label={label}>
      {items.slice(0, NAMED).map((item) => <li key={item.id} dir="auto">{line(item)}</li>)}
      {items.length > NAMED && <li>and {(items.length - NAMED).toLocaleString("en")} more</li>}
    </Lines>
  );
  const answered = accepted.length + rejected.length;
  return (
    <div className="ds-focus__question">
      <FocusTitle>{answered ? `Send your ${count(answered, "answer")}?` : "Nothing answered yet"}</FocusTitle>
      <p className="ds-focus__lead">Nothing reaches the draft until you confirm it here. A decision stays once sent; correct the draft afterwards with hand edits on its pages.</p>

      {accepted.length > 0 && (
        <section className="ds-focus__part" aria-labelledby="decide-accept">
          <h2 id="decide-accept" className="ds-focus__part-title">You accept · {accepted.length.toLocaleString("en")}</h2>
          {listed(accepted.map((item) => item.suggestion), "You accept", (item) => {
            const choice = answers[item.id]!.choice;
            const match = item.possible_matches.find((candidate) => choice === `match:${candidate.system_id}`);
            return <>{sentence(item)}{match ? <span className="draft-quiet"> · “{match.written_as}” is {match.system_name}</span> : null}</>;
          })}
        </section>
      )}
      {rejected.length > 0 && (
        <section className="ds-focus__part" aria-labelledby="decide-reject">
          <h2 id="decide-reject" className="ds-focus__part-title">You reject · {rejected.length.toLocaleString("en")}</h2>
          {listed(rejected.map((item) => item.suggestion), "You reject")}
        </section>
      )}
      <section className="ds-focus__part" aria-labelledby="decide-follow">
        <h2 id="decide-follow" className="ds-focus__part-title">What follows · {follows.length.toLocaleString("en")}</h2>
        {follows.length ? (
          <>
            <p>Ready, or waiting only on what your answers and these add. Accepting them is one more step you choose below.</p>
            {listed(follows, "What follows")}
          </>
        ) : (
          <p>Nothing else is ready to accept.</p>
        )}
      </section>
      {still.length > 0 && (
        <section className="ds-focus__part" aria-labelledby="decide-still">
          <h2 id="decide-still" className="ds-focus__part-title">Still waiting · {still.length.toLocaleString("en")}</h2>
          {listed(still, "Still waiting", (item) => <>{sentence(item)} <span className="draft-quiet">· {suggestionState(item) === "waits" ? waitsFor(item, words) : stateWords(item)}</span></>)}
        </section>
      )}
      {open.length > 0 && (
        <section className="ds-focus__part" aria-labelledby="decide-open">
          <h2 id="decide-open" className="ds-focus__part-title">Still open · {open.length.toLocaleString("en")}</h2>
          <ul className="ds-focus__open">
            {open.map(({ item, at }) => (
              <li key={item.id}><Button variant="link" onClick={() => onBack(at)}>Question {at + 1}: {item.prompt}</Button></li>
            ))}
          </ul>
        </section>
      )}
      <ActionGroup>
        <Button variant="tertiary" onClick={() => onBack(Math.max(0, questions.length - 1))}>Back to the questions</Button>
        <Button busy={sending} unavailableReason={answered ? null : "Answer a question first."} onClick={() => void send(false)}>
          Send only my answers
        </Button>
        <Button variant="primary" busy={sending} unavailableReason={answered || follows.length ? null : "Nothing to send."} onClick={() => void send(true)}>
          {sending ? "Sending…" : follows.length ? `Send them and accept the ${count(follows.length, "that follows", "that follow")}` : "Send them"}
        </Button>
      </ActionGroup>
      <p className="ds-focus__failure" role="status">{failed ? <Status tone="attention">{failed}</Status> : null}</p>
    </div>
  );
}
