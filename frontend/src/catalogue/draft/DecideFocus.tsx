import "./draft.css";

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { Release, Suggestion } from "../../api/client";
import { errorMessage } from "../../api/errors";
import {
  ActionGroup, Button, Dialog, EmptyState, EvidenceQuote, FocusFrame, FocusQuestion, type FocusStep, FocusTitle, Lines, Skeleton, Status, Suggested,
} from "../../design/components";
import { DiagramLegend } from "../../design/diagram";
import { count } from "../../home/format";
import { RouterLink } from "../../shell/links";
import {
  type Lexicon, bulkAcceptable, changeSentence, decideWhy, inDependencyOrder, inWords, lexicon, suggestionState, waitsFor,
} from "../suggestions";
import { useCatalogueContext } from "../useCatalogue";
import { useDraft } from "../useDraft";
import { citedSource, documentLang, stateWords } from "./decide";
import { DecisionTree } from "./DecisionTree";
import { type NodeMark, touching } from "./decisionTreeModel";
import { type DecideAnswer, type DecideQuestion, decideChoices, decideQuestions, firstSystems } from "./questions";
import { type SendAnswer, sendAnswers, type SendPlan, type SendPort } from "./sendAnswers";

/** How many suggestions the summary names before "and N more". */
const NAMED = 8;

const nameOf = (release: Release) => release.name || "Untitled version";

/**
 * A draft's Decide step in focus mode (UX rebuild plan, phase 2): the
 * suggestions a person must decide, one question at a time, beside the tree
 * of what waits for what. Answers are kept here until the summary, which lists
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
  // The tree beside the questions: only what they touch, with the answers so far.
  const kept = useMemo(() => touching(all, asked), [all, asked]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, DecideAnswer>>({});
  const mark = useCallback((item: Suggestion): NodeMark | undefined => {
    const answer = answers[item.id];
    if (answer) return answer.accept ? { status: "You accept it", tone: "ready" } : { status: "You reject it", tone: "muted" };
    return { status: stateWords(item) };
  }, [answers]);
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
    <DecisionTree
      suggestions={all}
      words={words}
      keep={kept}
      current={atSummary ? undefined : current?.suggestion.id}
      mark={mark}
      caption="Decided here, these follow: each card waits for the one to its left."
      legend={<DiagramLegend items={[["subject", "This question"], ["decide", "Needs your decision"], ["ready", "You accept it"], ["muted", "Dotted frame: you reject it"]]} />}
    />
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
        asideLabel="What waits for what"
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
          <Suggested basis={suggestion.basis === "inferred" ? "inferred" : "stated"} />
          {/* The tag already says a link was inferred; the line says only what else to know. */}
          {suggestion.basis === "inferred" && !suggestion.possible_matches.length ? null : <> {decideWhy(suggestion)}.</>}
          {echoed && !answers[question.id] && !choice && <> Chosen from your earlier answer about “{question.match?.writtenAs}”.</>}
        </>
      }
      source={
        <>
          <p dir="auto"><strong>{question.sentence}</strong></p>
          {citation?.quote ? (
            <EvidenceQuote
              text={citation.quote}
              lang={suggestion.change_request ? undefined : documentLang(document)}
              source={<bdi>{suggestion.change_request ? suggestion.change_request.change_request_id : citedSource(suggestion, document, citation.location)}</bdi>}
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
    const answerOf = (question: DecideQuestion): SendAnswer => {
      const answer = answers[question.id]!;
      return { suggestionId: question.id, accept: answer.accept, content: answer.content };
    };
    const byId = new Map(accepted.map((item) => [item.id, item]));
    const plan: SendPlan = {
      rejected: rejected.map(answerOf),
      accepted: inDependencyOrder(accepted.map((item) => item.suggestion)).flatMap((suggestion) => {
        const question = byId.get(suggestion.id);
        return question ? [answerOf(question)] : [];
      }),
      first: {
        accept: accepted.flatMap((item) => item.first?.accept ?? []).map((item) => item.id),
        add: accepted.flatMap((item) => item.first?.add ?? []),
      },
      withFollowing,
    };
    const port: SendPort = {
      decide: draft.decide,
      acceptReady: () => draft.acceptReady.mutateAsync(),
      settleSubject: (subject) => draft.settleSubject.mutateAsync(subject),
      refetchSuggestions: async () => (await draft.suggestions.refetch({ throwOnError: true })).data?.suggestions ?? [],
    };
    try {
      const { done, refused, systems, remaining } = await sendAnswers(port, plan);
      const parts = [
        `${count(done, "answer")} sent${systems ? `, with ${count(systems, "system")} they need` : ""}${withFollowing ? ", and what followed accepted" : ""}`,
        refused ? `${count(refused, "answer")} couldn't be taken: decide ${refused === 1 ? "it" : "them"} here` : "",
        remaining ? `${count(remaining, "suggestion")} still ${remaining === 1 ? "waits" : "wait"} for you` : "",
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
            const question = questions.find((candidate) => candidate.id === item.id);
            const systems = choice === "accept" && question ? firstSystems(question) : "";
            return (
              <>
                {sentence(item)}
                {match ? <span className="draft-quiet"> · “{match.written_as}” is {match.system_name}</span> : null}
                {systems ? <span className="draft-quiet"> · adds {systems} first</span> : null}
              </>
            );
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
