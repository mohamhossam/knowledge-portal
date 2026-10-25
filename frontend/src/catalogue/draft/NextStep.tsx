import { type ReactNode, useState } from "react";

import { ActionGroup, Button } from "../../design/components";
import { count } from "../../home/format";
import { ButtonLink } from "../../shell/links";
import type { Blocker } from "../suggestions";
import { type Answer, type DraftChoices, MissingThings } from "./MissingThings";

/**
 * The decide desk's first word: the one thing to do next, always. Questions only a
 * person can answer come first, then accepting the ready ones. When all that is left
 * waits on things no document describes (the dead ends, common in a first version),
 * the way on is said plainly: publishing leaves them out. The dead ends themselves are
 * one list, opened on request (MissingThings), where each is settled on the spot.
 */
export function NextStep({
  questions, bulk, bulkLabel, waiting, accepted, blockers, choices, focusTo, changesTo, busy, settling, onAcceptReady, onAnswer, onShow, onReject,
}: {
  questions: number;
  bulk: number;
  bulkLabel: string;
  waiting: number;
  accepted: number;
  blockers: Blocker[];
  /** What the draft already holds, for saying a missing name is one of them. */
  choices: DraftChoices;
  focusTo: string;
  changesTo: string;
  busy: boolean;
  settling: boolean;
  onAcceptReady: () => void;
  onAnswer: (blocker: Blocker, answer: Answer) => void;
  onShow: (blocker: Blocker) => void;
  onReject: (blocker: Blocker) => void;
}) {
  const [open, setOpen] = useState(false);
  const stuck = new Set(blockers.flatMap((blocker) => blocker.waiting.map((item) => item.id))).size;
  const things = count(blockers.length, "thing");
  const toggle = blockers.length > 0 && (
    <Button aria-expanded={open} aria-controls="draft-missing" onClick={() => setOpen((shown) => !shown)}>
      {open ? "Hide the missing things" : `See the ${count(blockers.length, "missing thing")}`}
    </Button>
  );
  const accept = (variant: "primary" | "secondary") => (
    <Button variant={variant} busy={busy} onClick={onAcceptReady}>{bulkLabel}</Button>
  );
  let lead: ReactNode;
  let detail: ReactNode = null;
  let action: ReactNode = null;
  if (questions > 0) {
    lead = <>Answer the {count(questions, "question")} only you can decide{bulk > 0 && ", then accept the ready ones"}.</>;
    action = (
      <>
        <ButtonLink to={focusTo} variant="primary">Answer the {count(questions, "question")}</ButtonLink>
        {bulk > 0 && accept("secondary")}
      </>
    );
  } else if (bulk > 0) {
    lead = <>{bulkLabel}: none of them needs a decision.</>;
    action = accept("primary");
  } else if (blockers.length > 0) {
    lead = (
      <>
        {accepted > 0 && <>{accepted.toLocaleString("en")} accepted. </>}
        {stuck === waiting ? `The ${count(waiting, "suggestion")} left` : count(stuck, "suggestion")} {stuck === 1 ? "waits" : "wait"} on {things} no document describes.
      </>
    );
    detail = <>Settle them now, or go on: publishing leaves them out of this version, and a later version can add them.</>;
    action = <ButtonLink to={changesTo} variant="primary">Go on to the changes</ButtonLink>;
  } else if (waiting > 0) {
    lead = <>Open a waiting suggestion and edit it to name what the draft has, or reject it.</>;
  } else {
    lead = <>Every suggestion is decided. Next, read what the draft changes.</>;
    action = <ButtonLink to={changesTo} variant="primary">See the changes</ButtonLink>;
  }
  return (
    <section className="draft-next-step" aria-labelledby="draft-next-step-title">
      <h2 id="draft-next-step-title" className="draft-next-step__title">What to do next</h2>
      <p className="draft-next-step__lead">{lead}</p>
      {detail && <p className="draft-next-step__detail">{detail}</p>}
      {(action || toggle) && <ActionGroup label="Next step">{action}{toggle}</ActionGroup>}
      {open && (
        <MissingThings blockers={blockers} choices={choices} busy={busy} settling={settling} onAnswer={onAnswer} onShow={onShow} onReject={onReject} />
      )}
    </section>
  );
}
