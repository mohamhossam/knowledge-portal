import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { LibraryDocument, LibraryVersion } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import {
  ActionGroup, Button, EmptyState, FocusFrame, type FocusChoice, FocusQuestion, type FocusStep, FocusTitle, Lines, Status, TextArea, TextField,
} from "../design/components";
import { formatClock } from "../home/format";
import { RouterLink } from "../shell/links";
import { useDocumentContext } from "./documentContext";
import { FileButton } from "./FileButton";
import { groupTally, questionLine, type ReviewQuestion, reviewQuestions, shortWhere, unplaced } from "./focus";
import { type Drafts, latestRevision, livePublication, newestVersion, passageProblems, reviewBody, reviewRows, whereOf } from "./model";
import { Outcome } from "./parts";
import { approveReason } from "./approval";
import { PassageText } from "./ReviewDesk";
import { plural, sheetHeadings } from "./where";

type Choice = "keep" | "exclude" | "accept" | "noted";
type Answer = { choice: Choice; reason: string };

/** How many passages a group question shows before "and N more". */
const PREVIEW = 3;
/** How many left-out passages the summary names. */
const NAMED = 8;

/**
 * A document's review in focus mode (UX rebuild plan, phase 2): what blocks
 * approval and what was flagged first, one at a time; then the rest a sheet,
 * slide or stretch at a time, accepted as it stands or left out with one
 * reason; then a summary that lists what will be published before anything
 * is. Answers change the review's working copy (the full review shows them),
 * and nothing is saved or published until the summary is confirmed.
 */
export function ReviewFocus() {
  const { document, leaveTo } = useDocumentContext();
  const version = newestVersion(document);
  const [params] = useSearchParams();
  const base = `/library/${encodeURIComponent(document.id)}`;
  const back = params.get("from") === "todo" ? "/" : base;
  if (!version || version.stage !== "ready_for_review" || !document.can_edit) {
    return (
      <FocusFrame work={<bdi>{document.title}</bdi>} place="Nothing to review" steps={[]} onLeave={() => leaveTo(back)} documentTitle={`Review · ${document.title}`}>
        <FocusTitle>Nothing here waits for your review</FocusTitle>
        <EmptyState
          title={document.can_edit ? "Its newest version isn't ready for review." : "Only its owner and the Knowledge admins review it."}
          action={<RouterLink href={base}>Open the document</RouterLink>}
        />
      </FocusFrame>
    );
  }
  return <Run document={document} version={version} back={back} base={base} />;
}

function Run({ document, version, back, base }: { document: LibraryDocument; version: LibraryVersion; back: string; base: string }) {
  const { hook, review, setReview, dirty, announce, leaveTo } = useDocumentContext();
  const navigate = useNavigate();
  const drafts = review.drafts;
  // Which passages each question holds depends on warnings and places, not on the answers.
  const questions = useMemo(() => reviewQuestions(document, version, drafts), [document, version, drafts]);
  const headings = useMemo(() => sheetHeadings(version.blocks.map((block) => ({ where: whereOf(block), text: block.text ?? null }))), [version]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  // Each question's passages as they stood before its first answer, so a changed answer starts from there.
  const before = useRef(new Map<string, Drafts>());
  const [choice, setChoice] = useState<Answer | null>(null);
  const [said, setSaid] = useState<{ text: string; failed?: boolean } | null>(null);

  const question = questions[index];
  const atSummary = index >= questions.length;
  const go = (next: number) => {
    setIndex(next);
    setChoice(null);
    setSaid(null);
  };

  const keysOf = (item: ReviewQuestion) => (item.kind === "group" ? item.rows.map((row) => row.key) : item.kind === "block" || item.kind === "flag" ? [item.row.key] : []);

  /** The answer the question opens on: the last one given, else what the working copy already says. */
  const startOf = (item: ReviewQuestion): Answer | null => {
    if (answers[item.id]) return answers[item.id]!;
    if ((item.kind === "block" || item.kind === "flag") && item.row.draft && !item.row.draft.included) return { choice: "exclude", reason: item.row.draft.reason };
    return null;
  };

  const apply = (item: ReviewQuestion, answer: Answer) => {
    const keys = keysOf(item);
    if (keys.length) {
      const saved = before.current.get(item.id) ?? Object.fromEntries(keys.map((key) => [key, drafts[key]!]));
      before.current.set(item.id, saved);
      setReview((state) => {
        const next = { ...state.drafts };
        for (const key of keys) {
          const start = saved[key];
          if (!start) continue;
          next[key] = answer.choice === "exclude"
            ? { ...start, included: false, reason: answer.reason.trim() }
            : answer.choice === "keep"
              ? { ...start, included: true, reason: "" }
              : start;
        }
        return { ...state, drafts: next };
      });
    }
    setAnswers((all) => ({ ...all, [item.id]: answer }));
    setSkipped((all) => {
      if (!all.has(item.id)) return all;
      const next = new Set(all);
      next.delete(item.id);
      return next;
    });
  };

  const nextOpen = (from: number) => {
    // On to the next question not answered yet; once all are, the summary.
    for (let at = from + 1; at < questions.length; at += 1) if (!answers[questions[at]!.id] && !skipped.has(questions[at]!.id)) return at;
    return questions.length;
  };

  const steps: FocusStep[] = questions.map((item, at) =>
    at === index ? "current" : answers[item.id] ? "answered" : skipped.has(item.id) ? "skipped" : "open");
  const work = <bdi>{document.title}</bdi>;
  const place = atSummary ? "Summary" : `Question ${index + 1} of ${questions.length}`;
  const frame = (children: ReactNode) => (
    <FocusFrame work={work} place={place} steps={steps} onLeave={() => leaveTo(back)} leaveLabel="Leave focus mode" documentTitle={`${place} · Review · ${document.title}`}>
      {children}
    </FocusFrame>
  );

  if (atSummary) {
    return frame(
      <Summary
        document={document}
        version={version}
        questions={questions}
        answers={answers}
        onBack={(at) => go(at)}
        said={said}
        onSaid={setSaid}
        onPublished={() => {
          announce("Published. It can be cited once it is indexed; Jobs shows the indexing.");
          navigate(base);
        }}
        hook={hook}
        dirty={dirty}
        summary={review.summary}
        setSummary={(value) => setReview((state) => ({ ...state, summary: value }))}
      />,
    );
  }

  const item = question!;
  const current = choice ?? startOf(item);
  const confirm = (answer: Answer) => {
    apply(item, answer);
    go(nextOpen(index));
  };
  const skip = () => {
    setSkipped((all) => new Set(all).add(item.id));
    go(nextOpen(index));
  };

  if (item.kind === "file-block" || item.kind === "file-notes") {
    const blocking = item.kind === "file-block";
    return frame(
      <div className="ds-focus__question" key={item.id}>
        <FocusTitle>{blocking ? "This version can't be approved as it is" : "First, the notes about the whole file"}</FocusTitle>
        <p className="ds-focus__lead">
          {blocking
            ? "Leaving passages out can't clear this. Upload a corrected file; meanwhile you can answer the other questions and save your review."
            : "They say how the file was read. They stay with the version; nothing here needs a change."}
        </p>
        <div className="ds-focus__source">
          <Lines label={blocking ? "Blocks approval, about the whole file" : "Notes about the whole file"}>
            {item.messages.map((message, at) => (
              <li key={at}>{blocking ? <Status tone="attention">Blocks approval</Status> : <Status tone="warning">Note</Status>} {message}</li>
            ))}
          </Lines>
        </div>
        <div className="ds-focus__actions">
          {blocking && document.is_owner && (
            <FileButton
              busy={hook.replace.isPending}
              unavailableReason={dirty > 0 ? "Save your review first, from the summary." : null}
              onFile={([file]) => file && hook.replace.mutate(file, {
                onSuccess: () => {
                  announce(`Uploaded version ${version.number + 1}. It is being read; Jobs shows the progress.`);
                  navigate(base);
                },
                onError: (error) => setSaid({ text: `Couldn't upload it: ${errorMessage(error)}`, failed: true }),
              })}
            >
              Upload a new version
            </FileButton>
          )}
          <Button variant="primary" onClick={() => confirm({ choice: "noted", reason: "" })}>{blocking ? "Go on to the other questions" : "Noted, next"}</Button>
        </div>
        <Outcome text={said?.text} failed={said?.failed} />
      </div>,
    );
  }

  const rowWhere = item.kind === "group" ? item.label : shortWhere(item.row.where);
  let title: ReactNode;
  let lead: ReactNode;
  let source: ReactNode;
  let choices: FocusChoice<Choice>[];
  if (item.kind === "group") {
    const tally = groupTally(item.rows);
    title = <>Accept {item.phrase}?</>;
    lead = (
      <>
        Nothing was flagged in {item.rows.length === 1 ? "this passage" : `these ${plural(item.rows.length, "passage")}`}:{" "}
        {[
          `${tally.kept.toLocaleString("en")} to publish`,
          tally.changed ? `${tally.changed.toLocaleString("en")} changed since the version in service` : "",
          tally.added ? `${tally.added.toLocaleString("en")} new` : "",
          tally.out ? `${tally.out.toLocaleString("en")} already left out` : "",
        ].filter(Boolean).join(", ")}.{" "}
        <RouterLink href={base}>Check them one by one in the full review</RouterLink>
      </>
    );
    source = (
      <Lines label={item.phrase === item.label ? `The first passages of ${item.label}` : "The first passages"}>
        {item.rows.slice(0, PREVIEW).map((row) => (
          <li key={row.key}><span className="lib-quiet">{shortWhere(row.where)}:</span> <PassageText row={row} headings={headings} /></li>
        ))}
        {item.rows.length > PREVIEW && <li className="lib-quiet">and {plural(item.rows.length - PREVIEW, "more passage")}</li>}
      </Lines>
    );
    choices = [
      {
        value: "accept",
        label: <>Accept them as they stand</>,
        consequence: tally.out
          ? `${plural(tally.kept, "passage")} ${tally.kept === 1 ? "is" : "are"} published as shown; the ${tally.out.toLocaleString("en")} left out stay out.`
          : `${plural(tally.kept, "passage")} ${tally.kept === 1 ? "is" : "are"} published as shown in the full review.`,
      },
      { value: "exclude", label: <>Leave them all out</>, consequence: "None of them is published with this version. Give one reason; the document's reviewers see it." },
    ];
  } else {
    const blocking = item.kind === "block";
    title = <>{rowWhere} {blocking ? "blocks approval" : "is flagged"}</>;
    lead = blocking
      ? "Approval waits until this passage is left out, or a corrected file is uploaded."
      : "The reading flagged it. Keep it as it is, or leave it out of this version.";
    source = (
      <>
        <Lines>
          {item.warnings.map((warning, at) => (
            <li key={at}><Status tone={warning.severity === "blocking" ? "attention" : "warning"}>{warning.severity === "blocking" ? "Blocks approval" : "Flagged"}</Status> {unplaced(warning.message, item.row.where)}</li>
          ))}
        </Lines>
        <div className="lib-passage" dir="auto"><PassageText row={item.row} headings={headings} /></div>
      </>
    );
    choices = blocking
      ? [
        { value: "exclude", label: <>Leave it out of this version</>, consequence: "It isn't published. Approval can go ahead once your review is saved." },
        { value: "keep", label: <>Keep it, and upload a corrected file</>, consequence: "Approval stays blocked until a new version without this problem is uploaded." },
      ]
      : [
        { value: "keep", label: <>Keep it</>, consequence: "It is published as it reads in the full review." },
        { value: "exclude", label: <>Leave it out of this version</>, consequence: "It isn't published. Give a reason; the document's reviewers see it." },
      ];
  }
  const excluding = current?.choice === "exclude";
  const missingReason = excluding && !current.reason.trim();
  return frame(
    <FocusQuestion<Choice>
      key={item.id}
      title={title}
      lead={lead}
      source={source}
      choices={choices}
      value={current?.choice}
      onChange={(value) => setChoice({ choice: value, reason: current?.reason ?? "" })}
      onNext={() => current && confirm(current)}
      onSkip={skip}
      unavailableReason={missingReason ? "Say why you leave it out." : null}
    >
      {excluding && (
        <TextField
          label={item.kind === "group" ? "Why leave them out?" : "Why leave it out?"}
          hint="The document's reviewers see it."
          required
          maxLength={10000}
          value={current.reason}
          onChange={(event) => setChoice({ choice: "exclude", reason: event.target.value })}
        />
      )}
    </FocusQuestion>,
  );
}

/** The summary a run proposes for the review, from the answers given. The reviewer edits it. */
function proposedSummary(questions: ReviewQuestion[], answers: Record<string, Answer>): string {
  // A group whose passages were all left out already (a hidden sheet) publishes nothing: not named as accepted.
  const accepted = questions.filter((item) => item.kind === "group" && answers[item.id]?.choice === "accept" && groupTally(item.rows).kept > 0);
  const out = questions.filter((item) => answers[item.id]?.choice === "exclude");
  const kept = questions.filter((item) => (item.kind === "flag" || item.kind === "block") && answers[item.id]?.choice === "keep");
  const where = (item: ReviewQuestion) => (item.kind === "group" ? item.phrase : item.kind === "block" || item.kind === "flag" ? shortWhere(item.row.where) : "");
  return [
    accepted.length ? `Accepted ${accepted.map((item) => `${where(item)} (${item.kind === "group" ? groupTally(item.rows).kept.toLocaleString("en") : 0})`).join(", ")} as read.` : "",
    kept.length ? `Kept the flagged ${kept.map(where).join(", ")}.` : "",
    ...out.map((item) => `Left out ${where(item)}: ${answers[item.id]!.reason.trim()}`),
  ].filter(Boolean).join(" ");
}

function Summary({ document, version, questions, answers, onBack, said, onSaid, onPublished, hook, dirty, summary, setSummary }: {
  document: LibraryDocument;
  version: LibraryVersion;
  questions: ReviewQuestion[];
  answers: Record<string, Answer>;
  onBack: (index: number) => void;
  said: { text: string; failed?: boolean } | null;
  onSaid: (said: { text: string; failed?: boolean } | null) => void;
  onPublished: () => void;
  hook: ReturnType<typeof useDocumentContext>["hook"];
  dirty: number;
  summary: string;
  setSummary: (value: string) => void;
}) {
  const { review } = useDocumentContext();
  const drafts = review.drafts;
  const rows = useMemo(() => reviewRows(document, version, drafts), [document, version, drafts]);
  const included = rows.filter((row) => row.draft?.included).length;
  const out = rows.filter((row) => row.draft && !row.draft.included);
  const open = questions.map((item, at) => ({ item, at })).filter(({ item }) => !answers[item.id]);
  // The summary starts from what the answers did, once; after that it is the reviewer's.
  const [proposed] = useState(() => (summary.trim() ? null : proposedSummary(questions, answers)));
  useEffect(() => {
    if (proposed) setSummary(proposed);
    // Once, on arriving at the summary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const text = summary;
  const revision = latestRevision(version);
  const unsavedReview = !revision || !document.review_fingerprint || dirty > 0;
  const needsSave = unsavedReview || text.trim() !== revision?.explanation.trim();
  const fileBlocking = version.warning_details.filter((warning) => !warning.block_id && warning.severity === "blocking").length;
  const blockingNow = rows.filter((row) => row.blocking).length + fileBlocking;
  const problems = passageProblems(version, drafts);
  const reason = open.length
    ? `Answer the ${plural(open.length, "open question")} first.`
    : !text.trim()
      ? "Write a review summary."
      : approveReason(document, version, problems, unsavedReview ? blockingNow : null);
  const live = livePublication(document);
  const liveNumber = live ? document.versions.find((item) => item.id === live.version_id)?.number : undefined;
  const behalf = !document.is_owner;
  const busy = hook.review.isPending || hook.approve.isPending;
  const failure = (error: unknown, verb: string) =>
    error instanceof ApiError && error.status === 409 ? `The document changed while you were deciding. Reload it, then ${verb} again.` : errorMessage(error);

  const save = async (): Promise<LibraryDocument | null> => {
    if (problems.length) {
      onSaid({ text: `Not saved yet: ${problems.join(" ")}`, failed: true });
      return null;
    }
    if (!text.trim()) {
      onSaid({ text: "Write a review summary first: the document's reviewers see it.", failed: true });
      return null;
    }
    try {
      const saved = await hook.review.mutateAsync({ versionId: version.id, body: reviewBody(version, drafts, text, document.version) });
      return saved;
    } catch (error) {
      onSaid({ text: `Couldn't save: ${failure(error, "save")}`, failed: true });
      return null;
    }
  };
  const publish = async () => {
    if (!needsSave && revision) {
      hook.approve.mutate({ versionId: version.id, revisionId: revision.id }, {
        onSuccess: onPublished,
        onError: (error) => onSaid({ text: failure(error, "publish"), failed: true }),
      });
      return;
    }
    const saved = await save();
    if (!saved) return;
    const savedRevision = latestRevision(saved.versions.find((item) => item.id === version.id));
    if (!savedRevision) return;
    hook.approve.mutate({ versionId: version.id, revisionId: savedRevision.id, saved }, {
      onSuccess: onPublished,
      onError: (error) => onSaid({ text: failure(error, "publish"), failed: true }),
    });
  };

  const where = (item: ReviewQuestion) => questionLine(item);
  const accepted = questions.filter((item) => item.kind === "group" && answers[item.id]?.choice === "accept" && groupTally(item.rows).kept > 0);
  return (
    <div className="ds-focus__question">
      <FocusTitle>{reason ? "Your review so far" : `Publish version ${version.number}?`}</FocusTitle>
      <p className="ds-focus__lead">Nothing is saved or published until you confirm it here. You can go back to any question first.</p>

      <section className="ds-focus__part" aria-labelledby="focus-published">
        <h2 id="focus-published" className="ds-focus__part-title">What is published</h2>
        <p>
          <strong className="ds-num">{included.toLocaleString("en")}</strong> of {plural(rows.filter((row) => row.draft).length, "passage")}, which can be cited once they are indexed.
        </p>
        {accepted.length > 0 && (
          <Lines label="Accepted as they stand">
            {accepted.map((item) => <li key={item.id}>{item.kind === "group" ? `${item.label} · ${plural(groupTally(item.rows).kept, "passage")}` : null}</li>)}
          </Lines>
        )}
        {live ? (
          <p>It replaces version {liveNumber ?? "?"} in service.</p>
        ) : (
          <p>No version of it is in service yet.</p>
        )}
      </section>

      {out.length > 0 && (
        <section className="ds-focus__part" aria-labelledby="focus-out">
          <h2 id="focus-out" className="ds-focus__part-title">Left out · {out.length.toLocaleString("en")}</h2>
          <Lines>
            {out.slice(0, NAMED).map((row) => (
              <li key={row.key}>{shortWhere(row.where)}: <bdi>{row.draft!.reason || "no reason yet"}</bdi></li>
            ))}
            {out.length > NAMED && <li>and {plural(out.length - NAMED, "more passage")}</li>}
          </Lines>
        </section>
      )}

      {open.length > 0 && (
        <section className="ds-focus__part" aria-labelledby="focus-open">
          <h2 id="focus-open" className="ds-focus__part-title">Still open · {open.length.toLocaleString("en")}</h2>
          <ul className="ds-focus__open">
            {open.map(({ item, at }) => (
              <li key={item.id}><Button variant="link" onClick={() => onBack(at)}>Question {at + 1}: {where(item)}</Button></li>
            ))}
          </ul>
        </section>
      )}

      <TextArea
        label="Review summary"
        hint="What you checked, and what you changed. The document's reviewers see it."
        required
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(event) => setSummary(event.target.value)}
      />
      <ActionGroup>
        <Button variant="tertiary" onClick={() => onBack(Math.max(0, questions.length - 1))}>Back to the questions</Button>
        <Button
          busy={hook.review.isPending && !hook.approve.isPending}
          onClick={() => void save().then((saved) => saved && onSaid({ text: `Saved at ${formatClock(new Date())}. Nothing is published yet.` }))}
        >
          Save without publishing
        </Button>
        <Button variant="primary" busy={busy} unavailableReason={reason} onClick={() => void publish()}>
          {busy ? (hook.review.isPending ? "Saving your review…" : "Publishing…") : behalf ? `Publish version ${version.number} on ${document.owner.display_name}'s behalf` : `Publish version ${version.number}`}
        </Button>
      </ActionGroup>
      <Outcome text={said?.text} failed={said?.failed} />
    </div>
  );
}
