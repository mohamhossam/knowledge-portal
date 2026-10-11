import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api, type CorpusFinding } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { ActionGroup, Button, Facts, RecordView, Section, Status, type StatusTone } from "../design/components";
import { formatDay } from "../home/format";
import { RouterLink } from "../shell/links";
import { KIND_WORDS } from "./corpus";
import { AGE_WORDS, daysAgo, names, owners, standing } from "./findings";
import { FINDINGS_PATH, knowledgeStepHref, requirementHref } from "./knowledge";
import { RequirementLink } from "./RequirementLink";

const AGE_TONE: Record<CorpusFinding["age"], StatusTone> = {
  over_30_days: "attention",
  from_7_to_30_days: "neutral",
  under_7_days: "working",
};

/**
 * One finding in force, beside the list: what requirement work found, the two requirements
 * it stands between and whose they are, and asking their owners to decide it. Owners decide
 * it on a requirement's Knowledge step in requirement work.
 */
export function FindingRecord({ item, now, takeFocus, onChanged }: {
  item: CorpusFinding;
  now: number;
  takeFocus: boolean;
  onChanged: () => unknown;
}) {
  const actor = useAuth()?.actor;
  const me = actor?.id;
  const [said, setSaid] = useState<{ text: string; failed: boolean } | null>(null);
  const people = owners(item);
  const mine = people.length > 0 && people.every((person) => person.id === me);
  const mySide = item.subject.owner?.id === me ? item.subject : item.related;
  const waitReason = item.next_nudge_at
    ? `Asked ${item.last_nudge ? daysAgo(item.last_nudge.at, now) : "lately"}; again from ${formatDay(item.next_nudge_at)}.`
    : people.length === 0
      ? "Neither requirement has an owner to ask."
      : null;
  // Nudges are recorded by the asking admin's display name.
  const byMe = item.last_nudge !== null && actor?.display_name !== undefined && item.last_nudge.by === actor.display_name;
  const nudge = useMutation({
    mutationFn: () => api.nudgeFinding(item.finding_id),
    onSuccess: () => setSaid({ text: `Asked ${names(people, me)}.`, failed: false }),
    onError: (error) => setSaid({ text: `Not sent: ${errorMessage(error)}`, failed: true }),
    // Either way its last ask may have changed; read it again.
    onSettled: onChanged,
  });

  const ask = mine ? (
    <RequirementLink href={knowledgeStepHref(mySide.requirement_id)} className="ds-button ds-button--primary" outbound>
      Decide it yourself
    </RequirementLink>
  ) : (
    <Button
      variant="primary"
      busy={nudge.isPending}
      unavailableReason={nudge.isPending ? null : waitReason}
      onClick={() => { setSaid(null); nudge.mutate(); }}
    >
      {nudge.isPending ? "Asking…" : people.length === 0 ? "No owner to ask" : `Ask ${names(people, me)}`}
    </Button>
  );

  return (
    <RecordView
      title={<><bdi>{item.subject.title}</bdi> and <bdi>{item.related.title}</bdi></>}
      takeFocus={takeFocus}
      meta={
        <>
          <Status tone={AGE_TONE[item.age]}>{AGE_WORDS[item.age].status}</Status>
          <span>{KIND_WORDS[item.kind]}</span>
          <span>{standing(item, now)}, since {formatDay(item.raised_at)}</span>
        </>
      }
      lead={item.rationale}
    >
      <Section title="Between" count={2} headingLevel={3}>
        <ul className="rk-sides">
          <Side side={item.subject} me={me} />
          <Side side={item.related} me={me} />
        </ul>
      </Section>
      <Section title="Asking the owners" headingLevel={3}>
        <p className="rk-lead">
          {mine
            ? "Both requirements are yours, so there is no one else to ask. Decide it on the Knowledge step."
            : "Requirement work sends each owner a notification that links to the Knowledge step, at most once a week per finding."}
        </p>
        <Facts
          items={[
            [
              "Last asked",
              item.last_nudge ? (
                <>{formatDay(item.last_nudge.at)} <span className="rk-quiet">by <bdi>{item.last_nudge.by}</bdi>{byMe ? " (you)" : ""}</span></>
              ) : <span className="rk-quiet">Not yet</span>,
            ],
          ]}
        />
        <ActionGroup label="Ask them to decide it">{ask}</ActionGroup>
        <p className="rk-said" role="status">
          {said && <Status tone={said.failed ? "attention" : "done"}>{said.text}</Status>}
        </p>
      </Section>
    </RecordView>
  );
}

function Side({ side, me }: { side: CorpusFinding["subject"]; me: string | undefined }) {
  return (
    <li className="rk-side">
      <RouterLink href={requirementHref(side.requirement_id)}><bdi>{side.title}</bdi></RouterLink>
      <span className="rk-detail">
        {side.owner ? (
          <>
            Owned by <bdi>{side.owner.id === me ? `${side.owner.display_name} (you)` : side.owner.display_name}</bdi>
            {" · "}
            <RouterLink href={`${FINDINGS_PATH}?owner=${encodeURIComponent(side.owner.id)}`}>
              {side.owner.id === me ? "List only findings on yours" : "List only findings on theirs"}
            </RouterLink>
          </>
        ) : "No owner"}
      </span>
      <RequirementLink href={knowledgeStepHref(side.requirement_id)} className="rk-out" outbound>Its Knowledge step</RequirementLink>
    </li>
  );
}
