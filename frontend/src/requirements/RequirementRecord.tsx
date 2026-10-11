import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { api, type CorpusRequirement } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { ActionGroup, Button, Facts, RecordView, Section, Status } from "../design/components";
import { count, formatDay } from "../home/format";
import { RouterLink } from "../shell/links";
import { CorpusActionForm, type CorpusActionKind } from "./CorpusActionForm";
import { CORPUS_KEY, FINDINGS_PATH, REQUIREMENTS_PATH, findingHref, knowledgeStepHref } from "./knowledge";
import { RequirementLink } from "./RequirementLink";
import { KIND_WORDS, STATE_WORDS, standingOf } from "./corpus";

/**
 * One requirement of the corpus, beside the list: whose it is, how its index stands, when it
 * was last screened and its open findings. Its owners act on it in requirement work, where its
 * Knowledge step leads; from here it is retired, reinstated or indexed again.
 */
export function RequirementRecord({ item, takeFocus, onChanged }: { item: CorpusRequirement; takeFocus: boolean; onChanged: () => Promise<unknown> }) {
  const actor = useAuth()?.actor;
  const me = actor?.id;
  const [acting, setActing] = useState<CorpusActionKind | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; failed: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const kind: CorpusActionKind | null = item.retired ? "reinstate" : item.duplicate ? null : "retire";
  const standing = standingOf(item);

  /** Back to the record's action once it is read again, or to what was said when that has gone. */
  const refocus = () =>
    window.requestAnimationFrame(() => (root.current?.querySelector<HTMLElement>("[data-corpus-action]") ?? said.current)?.focus());

  const act = useMutation({
    mutationFn: ({ kind, reason }: { kind: CorpusActionKind; reason: string }) =>
      kind === "retire" ? api.retireRequirement(item.requirement_id, reason) : api.reinstateRequirement(item.requirement_id, reason),
    onSuccess: async (result, { kind }) => {
      const told = result.notified ? ` ${result.notified === actor?.display_name ? "You were" : `${result.notified} was`} told.` : "";
      const closed = result.closed_findings ? ` ${count(result.closed_findings, "finding")} closed as “source retired”.` : "";
      setOutcome({
        text: kind === "retire" ? `Retired ‘${item.title}’ from the corpus.${closed}${told}` : `Returned ‘${item.title}’ to the corpus.${told}`,
        failed: false,
      });
      setActing(null);
      await onChanged();
      refocus();
    },
  });
  const reindex = useMutation({
    mutationFn: () => api.reindexCorpus("requirements", [item.requirement_id]),
    onSuccess: async () => {
      setOutcome({ text: `‘${item.title}’ will be indexed again. Its state here updates once it is done.`, failed: false });
      await onChanged();
    },
    onError: (error) => setOutcome({ text: `Not done: ${errorMessage(error)}`, failed: true }),
  });
  const open = (next: CorpusActionKind) => {
    act.reset();
    setOutcome(null);
    setActing(next);
  };
  const cancel = () => {
    setActing(null);
    refocus();
  };

  return (
    <div ref={root} className="rk-record">
      <RecordView
        title={item.title}
        takeFocus={takeFocus}
        meta={
          <>
            {standing ? <Status tone={standing.tone}>{standing.words}</Status> : <Status tone="done">{STATE_WORDS.current}</Status>}
            {item.open_findings > 0 && <span>{count(item.open_findings, "open finding")}</span>}
          </>
        }
        actions={
          <ActionGroup label={`Act on ${item.title}`}>
            {knowledgeStepHref(item.requirement_id) !== null && (
              <RequirementLink href={knowledgeStepHref(item.requirement_id)} className="ds-button ds-button--secondary" outbound>
                Open its Knowledge step
              </RequirementLink>
            )}
            {kind && (
              <Button
                variant="tertiary"
                data-corpus-action
                aria-expanded={acting === kind}
                onClick={() => (acting ? cancel() : open(kind))}
              >
                {kind === "retire" ? "Retire from the corpus…" : "Reinstate…"}
              </Button>
            )}
          </ActionGroup>
        }
        lead="Its owners act on it in requirement work, where its Knowledge step lists its findings."
      >
        <p ref={said} tabIndex={-1} className="rk-said" role="status">
          {outcome && <Status tone={outcome.failed ? "attention" : "done"}>{outcome.text}</Status>}
        </p>
        {acting && (
          <CorpusActionForm
            item={item}
            kind={acting}
            me={me}
            busy={act.isPending}
            error={act.error ? errorMessage(act.error) : null}
            onSubmit={(reason) => act.mutate({ kind: acting, reason })}
            onCancel={cancel}
          />
        )}
        <Facts
          items={[
            [
              "Owner",
              item.owner ? (
                <span className="rk-inline">
                  <bdi>{item.owner.display_name}</bdi>
                  <RouterLink href={`${REQUIREMENTS_PATH}?owner=${encodeURIComponent(item.owner.id)}`}>
                    {item.owner.id === me ? "List only yours" : "List only theirs"}
                  </RouterLink>
                </span>
              ) : <span className="rk-quiet">No owner</span>,
            ],
            ["Index", <IndexWords key="index" item={item} />],
            ["Last screened", item.last_screened_at ? formatDay(item.last_screened_at) : <span className="rk-quiet">Never</span>],
            ["In the corpus", <Membership key="corpus" item={item} />],
          ]}
        />
        <Findings item={item} />
        {!item.retired && (
          <Section title="Its index" headingLevel={3}>
            <p className="rk-lead">
              Indexing it again rebuilds how it is found in screening and knowledge search. Text that has not changed is
              not sent to the model again.
            </p>
            <ActionGroup>
              <Button busy={reindex.isPending} onClick={() => { setOutcome(null); reindex.mutate(); }}>
                {reindex.isPending ? "Asking…" : item.index_state === "failed" ? "Retry indexing it" : "Index it again"}
              </Button>
            </ActionGroup>
          </Section>
        )}
      </RecordView>
    </div>
  );
}

function IndexWords({ item }: { item: CorpusRequirement }) {
  if (item.retired) return <span className="rk-quiet">Not indexed while retired</span>;
  return (
    <>
      {STATE_WORDS[item.index_state]}
      {item.index_state === "failed" && <span className="rk-detail">It stopped after three attempts on the same change.</span>}
      {item.index_state === "rebuild_required" && <span className="rk-detail">The embedding model changed; requirement work rebuilds the index.</span>}
    </>
  );
}

function Membership({ item }: { item: CorpusRequirement }) {
  if (item.retired) {
    return (
      <>
        Retired by <bdi>{item.retired.by}</bdi> on {formatDay(item.retired.at)}
        <span className="rk-detail" dir="auto">{item.retired.reason}</span>
      </>
    );
  }
  if (item.duplicate) return <>Closed as a duplicate</>;
  return <>Screened against the others</>;
}

/**
 * Its open findings, as far as its owner's findings show them (requirement work answers
 * findings by owner, not by requirement). Each opens on the Findings page.
 */
function Findings({ item }: { item: CorpusRequirement }) {
  const ownerId = item.owner?.id;
  const findings = useQuery({
    queryKey: [...CORPUS_KEY, "findings", { ownerId }, 0],
    queryFn: () => api.corpusFindings({ ownerId }, 0),
    enabled: item.open_findings > 0 && Boolean(ownerId),
    select: (page) => page.items.filter((finding) => finding.subject.requirement_id === item.requirement_id || finding.related.requirement_id === item.requirement_id),
  });
  if (item.open_findings === 0) {
    return (
      <Section title="Open findings" count={0} headingLevel={3}>
        <p className="rk-quiet">No possible duplicate or contradiction stands open on it.</p>
      </Section>
    );
  }
  const found = findings.data ?? [];
  return (
    <Section title="Open findings" count={item.open_findings} headingLevel={3}>
      <p className="rk-lead">Its owners decide them on its Knowledge step in requirement work. From the Findings page you can ask them to.</p>
      {found.length > 0 ? (
        <ul className="rk-lines">
          {found.map((finding) => {
            const other = finding.subject.requirement_id === item.requirement_id ? finding.related : finding.subject;
            return (
              <li key={finding.finding_id}>
                <RouterLink href={findingHref(finding.finding_id)}>
                  {KIND_WORDS[finding.kind]} {finding.kind === "possible_duplicate" ? "of" : "with"} ‘<bdi>{other.title}</bdi>’
                </RouterLink>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rk-quiet">
          {findings.isPending && ownerId ? "Looking for them…" : <RouterLink href={FINDINGS_PATH}>See every open finding</RouterLink>}
        </p>
      )}
    </Section>
  );
}
