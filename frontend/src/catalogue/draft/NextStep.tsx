import type { ReactNode } from "react";

import { ActionGroup, Button } from "../../design/components";
import { count } from "../../home/format";
import { ButtonLink } from "../../shell/links";
import type { Blocker } from "../suggestions";

/** How many dead ends the panel spells out; the rest are counted. */
const SHOWN = 3;

/**
 * The decide desk's first word: the one thing to do next, always. Questions only a
 * person can answer come first, then accepting the ready ones; a wait no decision
 * here can lift (a dead end) is settled on the spot: a name suggestions wait for is
 * suggested as a system or said to be a product offering, or what waits is rejected.
 */
export function NextStep({
  questions, bulk, bulkLabel, waiting, blockers, focusTo, changesTo, busy, settling, onAcceptReady, onSettle, onShow, onReject,
}: {
  questions: number;
  bulk: number;
  bulkLabel: string;
  waiting: number;
  blockers: Blocker[];
  focusTo: string;
  changesTo: string;
  busy: boolean;
  settling: boolean;
  onAcceptReady: () => void;
  onSettle: (blocker: Blocker, kind: "system" | "offering") => void;
  onShow: (blocker: Blocker) => void;
  onReject: (blocker: Blocker) => void;
}) {
  const [first] = blockers;
  const accept = (variant: "primary" | "secondary") => (
    <Button variant={variant} busy={busy} onClick={onAcceptReady}>{bulkLabel}</Button>
  );
  let lead: ReactNode;
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
  } else if (first?.kind === "other") {
    lead = <>Nothing can move until <bdi>{first.label}</bdi> is in the draft. Edit what waits for it to name what the draft has, or reject it.</>;
  } else if (first) {
    lead = <>Nothing can move until you say what <bdi>{first.name}</bdi> is.</>;
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
      {action && <ActionGroup label="Next step">{action}</ActionGroup>}
      {blockers.length > 0 && (
        <ul className="draft-blockers" aria-label="Waits nothing here can lift">
          {blockers.slice(0, SHOWN).map((blocker) => (
            <li key={blocker.key} className="draft-blocker">
              <p>
                <strong>{count(blocker.waiting.length, "suggestion")}</strong> {blocker.waiting.length === 1 ? "waits" : "wait"} for{" "}
                <bdi>{blocker.label}</bdi>, which neither the draft nor any suggestion adds.{blocker.kind === "system" && <> What is <bdi>{blocker.name}</bdi>?</>}
              </p>
              <ActionGroup label={blocker.kind === "other" ? `What waits for ${blocker.name}` : `What is ${blocker.name}?`}>
                {blocker.kind === "system" && (
                  <>
                    <Button busy={settling} onClick={() => onSettle(blocker, "system")}>It is a system: suggest it</Button>
                    <Button busy={settling} onClick={() => onSettle(blocker, "offering")}>It is a product offering</Button>
                  </>
                )}
                {blocker.kind === "offering" && (
                  <Button busy={settling} onClick={() => onSettle(blocker, "offering")}>Suggest the offering</Button>
                )}
                <Button busy={busy} onClick={() => onReject(blocker)}>Reject {blocker.waiting.length === 1 ? "it" : `the ${blocker.waiting.length}`}…</Button>
                <Button variant="link" onClick={() => onShow(blocker)}>Show {blocker.waiting.length === 1 ? "it" : "them"}</Button>
              </ActionGroup>
            </li>
          ))}
          {blockers.length > SHOWN && (
            <li className="draft-quiet">and {count(blockers.length - SHOWN, "more thing")} nothing adds; find them under Waits for another.</li>
          )}
        </ul>
      )}
    </section>
  );
}
