import "./work.css";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, ListTodo, UsersRound } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api, type ConfirmReview, type Reminder } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, ConsequencePanel, EmptyState, FilterStrip, PageHeader, Section, Skeleton, Status } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { type JobAction, useJobActions } from "../library/actions";
import { FileButton } from "../library/FileButton";
import { REVIEW_READS } from "../reviews/review";
import { useConfirmSystems } from "../reviews/useReviews";
import { ButtonLink, RouterLink } from "../shell/links";
import { type Entry, type SectionKey, useWorkQueue } from "./queue";

type Ranked = Exclude<SectionKey, "gaps">;

const SECTIONS: { key: Ranked; title: string; teamTitle?: string; icon: typeof AlertTriangle; clear: string; source: string }[] = [
  { key: "attention", title: "Needs attention", icon: AlertTriangle, clear: "nothing has failed or is held", source: "the documents" },
  { key: "decisions", title: "Decisions waiting on you", teamTitle: "Decisions waiting", icon: ListTodo, clear: "no review or suggestion is waiting", source: "the documents and the draft's suggestions" },
  { key: "due", title: "Re-confirmations due", icon: Clock, clear: "no re-confirmations are due", source: "your re-confirmations" },
];

/** How many names a confirmation of several systems spells out before "and N more". */
const NAMED = 12;

const DAY = 86_400_000;

/** "today", "1 day", "12 days": how long something has waited, at a glance (the date is in its tooltip). */
function Age({ at, now }: { at: string; now: number }) {
  const time = Date.parse(at);
  if (Number.isNaN(time)) return <>—</>;
  const days = Math.max(0, Math.floor((now - time) / DAY));
  const date = new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  // The date is also said, not only in the tooltip (keyboard and touch can't reach a title).
  return (
    <time dateTime={at} title={date}>
      {days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`}
      <span className="ds-visually-hidden">, since {date}</span>
    </time>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("en")} ${count === 1 ? one : many}`;
}

type Act = (entry: Entry, action: JobAction, file?: File) => void;

/** The row's own remedy (model §6): try again where retrying can help, else the specific fix. */
function Remedy({ entry, act, busy }: { entry: Entry; act: Act; busy: boolean }) {
  if ((entry.kind !== "unreadable" && entry.kind !== "unsearchable") || !entry.document.can_edit) return <span className="work__none">—</span>;
  const named = <span className="ds-visually-hidden">: {entry.subject}</span>;
  if (entry.kind === "unsearchable") {
    return entry.document.is_owner ? <Button busy={busy} onClick={() => act(entry, "retry-indexing")}>Try indexing again{named}</Button> : <span className="work__none">—</span>;
  }
  return (
    // The fix first, the retry second: the same words and order as the document and Jobs (§6).
    <ActionGroup>
      {entry.document.is_owner && (
        <FileButton busy={busy} onFile={([file]) => file && act(entry, "upload", file)}>
          {entry.held ? "Upload a clean copy" : "Upload a new version"}{named}
        </FileButton>
      )}
      {!entry.held && <Button busy={busy} onClick={() => act(entry, "retry")}>Try reading again{named}</Button>}
    </ActionGroup>
  );
}

/** What a task card is made of: its mark, what it is, why it waits, and the next step. */
function Task({ mark, title, why, meta, action, children }: { mark: ReactNode; title: ReactNode; why?: ReactNode; meta?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <li className="work-task">
      <span className="work-task__mark" aria-hidden="true">{mark}</span>
      <div className="work-task__body">
        <h3 className="work-task__title">{title}</h3>
        {why && <p className="work-task__why">{why}</p>}
        {meta && <p className="work-task__meta">{meta}</p>}
      </div>
      {action && <div className="work-task__act">{action}</div>}
      {children && <div className="work-task__panel">{children}</div>}
    </li>
  );
}

/** "ADFS, BSCS, CNS and 20 more": the names one confirmation stands for. */
function named(items: Reminder[]): string {
  const names = items.slice(0, NAMED).map((item) => item.title);
  const rest = items.length - names.length;
  if (rest > 0) return `${names.join(", ")} and ${rest} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
}

/**
 * To do (UX rebuild plan, phase 2): one list of everything that needs you,
 * most urgent first, each a card that says what is wrong and the next step.
 * A review or a draft's decisions start in focus mode, one question at a
 * time; a re-confirmation is confirmed right here (Re-confirmations is no
 * longer an area of its own). Severity is carried by order, icon and words,
 * never colour. Empty kinds fold into one line; the standing gaps backlog
 * sits below, outside the count.
 */
export function YourWork() {
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") === "everyone" ? "everyone" : "mine";
  const team = scope === "everyone";
  const queue = useWorkQueue();
  // Ages read one clock per visit (a render must stay pure).
  const [now] = useState(() => Date.now());

  const rows = (key: SectionKey) => queue.sections[key].filter((entry) => team || entry.mine);
  const sections = SECTIONS.map((section) => ({ ...section, rows: rows(section.key), failed: queue.failed[section.key], pending: queue.pending[section.key] }));
  const shown = sections.filter((section) => section.pending || section.failed || section.rows.length > 0);
  const clear = sections.filter((section) => !section.pending && !section.failed && section.rows.length === 0);
  const needs = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const anyFailed = sections.some((section) => section.failed);
  const anyPending = sections.some((section) => section.pending);
  const settledEmpty = !queue.loading && needs === 0 && !anyFailed && !anyPending;
  const gap = queue.sections.gaps[0];
  // The page's one main action: the first card that starts in focus mode.
  const firstStart = sections.flatMap((section) => section.rows).find((entry) => entry.kind === "review" || entry.kind === "suggestions")?.id;

  // After "Try again" succeeds, its button is gone: focus goes to the section it repaired.
  // A ref, not state: the effect below runs when the reads settle and clears it, without a re-render.
  const retried = useRef<Ranked | null>(null);
  // If the repaired section is now empty, it folds into the "Also clear" line: focus goes there.
  const regions = useRef(new Map<Ranked, HTMLElement>());
  const clearLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const key = retried.current;
    if (!key || queue.failed[key] || queue.pending[key]) return;
    const region = regions.current.get(key);
    const target = region?.isConnected ? region : clearLine.current;
    target?.setAttribute("tabindex", "-1");
    target?.focus();
    retried.current = null;
  }, [queue.failed, queue.pending]);

  const lead = queue.loading || (needs === 0 && anyPending)
    ? "Reading what needs you…"
    : settledEmpty && !team
      ? undefined
      : needs === 0
        ? anyFailed ? "Some of your work couldn't be read." : "Nothing needs the team today."
        : `${plural(needs, "thing needs", "things need")} ${team ? "the team" : "you"}, most urgent first.`;

  // Acting from To do: the card's remedy or confirmation runs here; once its card has gone, focus goes to what was said.
  const actions = useJobActions();
  const said = useRef<HTMLParagraphElement>(null);
  const busyId = actions.busy ? `doc-${actions.busy.document.id}` : undefined;
  const [outcome, setOutcome] = useState<{ text: string; failed?: boolean } | null>(null);
  // Counts settled actions; each one moves focus to what was said (an effect, not a ref read in render).
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (settled > 0) said.current?.focus();
  }, [settled]);
  const act: Act = (entry, action, file) => {
    if (entry.kind !== "unreadable" && entry.kind !== "unsearchable") return;
    setOutcome(null);
    actions.act(entry.document, action, file, () => setSettled((n) => n + 1));
  };

  // Re-confirmations, confirmed in place: one panel at a time, under its card.
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const panel = useDisclosure(() => said.current);
  const confirmDocument = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConfirmReview }) => api.confirmDocumentReview(id, body),
    onSuccess: () => Promise.all(REVIEW_READS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
  const confirmSystems = useConfirmSystems();
  const confirmFailure = confirmDocument.error ?? confirmSystems.error;
  const confirmed = (text: string) => {
    setOutcome({ text });
    setConfirming(null);
    // Done: focus goes to what was said, not back to a button whose card is about to go.
    panel.closeTo(() => said.current);
    setSettled((n) => n + 1);
  };
  const confirm = (entry: Extract<Entry, { kind: "due" }>, note: string) => {
    const body: ConfirmReview = { note: note || null, reason: null };
    if (entry.what === "document") {
      confirmDocument.mutate({ id: entry.items[0]!.id, body }, {
        onSuccess: (document) => confirmed(`Confirmed ‘${entry.subject}’. It falls due again on ${formatDay(document.review?.due_at)}.`),
      });
    } else {
      confirmSystems.mutate({ systemIds: entry.items.map((item) => item.id), body }, {
        onSuccess: (result) => confirmed(entry.items.length === 1
          ? `Confirmed ${entry.subject}. It falls due again on ${formatDay(result[0]?.standing.due_at)}.`
          : `Confirmed ${plural(result.length, "system", "systems")}. They fall due again on ${formatDay(result[0]?.standing.due_at)}.`),
      });
    }
  };

  const card = (entry: Entry): ReactNode => {
    switch (entry.kind) {
      case "unreadable":
      case "unsearchable":
        return (
          <Task
            key={entry.id}
            mark={<AlertTriangle size={16} />}
            title={<RouterLink href={entry.to} className="work-task__link"><bdi>{entry.subject}</bdi></RouterLink>}
            why={entry.kind === "unsearchable"
              ? <><Status tone="attention">Couldn't make it searchable</Status> Requirement work can't cite it yet.</>
              : entry.held
                ? <><Status tone="held">Held by the malware scan</Status> It won't be read. Upload a clean copy.</>
                : <><Status tone="attention">Couldn't read</Status> {entry.cause ?? `The ${entry.fileType} file couldn't be read.`}</>}
            meta={<>Waiting <Age at={entry.sinceAt} now={now} /></>}
            action={<Remedy entry={entry} act={act} busy={busyId === entry.id} />}
          />
        );
      case "review":
        return (
          <Task
            key={entry.id}
            mark={<span className="ds-num">{entry.questions}</span>}
            title={<><RouterLink href={entry.record} className="work-task__link"><bdi>{entry.subject}</bdi></RouterLink> · {plural(entry.questions, "question", "questions")}</>}
            why={entry.first && <bdi>{entry.first}</bdi>}
            meta={
              <>
                Review version {entry.facts.number} · {entry.facts.fileType} · {plural(entry.facts.passages, "passage", "passages")}
                {entry.facts.replaces ? ` · replaces version ${entry.facts.replaces} in service` : ""}
                {team ? <> · <bdi>{entry.mine ? "yours" : entry.owner}</bdi></> : null}
                {" · waiting "}<Age at={entry.sinceAt} now={now} />
              </>
            }
            action={<ButtonLink to={entry.to} variant={entry.id === firstStart ? "primary" : "secondary"}>Start<span className="ds-visually-hidden">: {entry.subject}</span></ButtonLink>}
          />
        );
      case "suggestions":
        return (
          <Task
            key={entry.id}
            mark={<span className="ds-num">{entry.count}</span>}
            title={<><RouterLink href={entry.record} className="work-task__link"><bdi>{entry.subject}</bdi></RouterLink> · {plural(entry.count, "question", "questions")}</>}
            why={entry.first && <>{entry.first}{entry.count > 1 ? ` And ${plural(entry.count - 1, "more", "more")}.` : ""}</>}
            meta={<>Suggestions read into the draft catalogue version{team ? " · any admin" : ""}</>}
            action={<ButtonLink to={entry.to} variant={entry.id === firstStart ? "primary" : "secondary"}>Start<span className="ds-visually-hidden">: {entry.subject}</span></ButtonLink>}
          />
        );
      case "due": {
        const several = entry.items.length > 1;
        const open = panel.open && confirming === entry.id;
        const label = entry.what === "document" ? `‘${entry.subject}’` : entry.subject;
        return (
          <Task
            key={entry.id}
            mark={<Clock size={16} />}
            title={several ? <>Confirm {entry.subject} are still right</> : <>Confirm <RouterLink href={entry.to} className="work-task__link"><bdi>{label}</bdi></RouterLink> is still right</>}
            why={
              <>
                {entry.overdue ? <Status tone="attention">Overdue since {entry.when}</Status> : <>Due {entry.when}</>}
                {entry.fromPublication ? " · not confirmed since the catalogue version was published" : ""}
                {several && <> · <span dir="auto">{named(entry.items)}</span></>}
              </>
            }
            meta={entry.what === "document" ? "A library document you own. It stays in use meanwhile." : "Systems in service. Any catalogue maintainer may confirm them; they stay in use meanwhile."}
            action={
              <Button
                aria-expanded={open}
                onClick={(event) => {
                  if (open) {
                    setConfirming(null);
                    panel.close();
                    return;
                  }
                  confirmDocument.reset();
                  confirmSystems.reset();
                  setOutcome(null);
                  setConfirming(entry.id);
                  panel.show(event);
                }}
              >
                {several ? `Confirm ${plural(entry.items.length, "system", "systems")}…` : "Confirm…"}<span className="ds-visually-hidden">: {entry.subject}</span>
              </Button>
            }
          >
            {open && (
              <ConsequencePanel
                panelRef={panel.panel}
                title={several ? <>Confirm {entry.subject} are still right</> : <>Confirm <bdi>{label}</bdi> is still right</>}
                happens={entry.what === "document"
                  ? "Its version in service stays as it is. Confirming starts its review cycle again, and requirement work stops flagging citations of it as overdue."
                  : several
                    ? "One confirmation for each of them, with your note. Their sheets stay as they are, and each starts its review cycle again."
                    : "Its sheet in the version in service stays as it is. Confirming starts its review cycle again for every catalogue maintainer."}
                affects={several ? <p dir="auto">{named(entry.items)}.</p> : undefined}
                reversibility="Being due never takes anything out of use; confirming only records that you checked."
                reason={several
                  ? { label: "What you checked", hint: "It stands for every one of them, for whoever confirms them next.", maxLength: 500 }
                  : { label: "Note (optional)", hint: "What you checked, for whoever confirms it next.", maxLength: 500, optional: true }}
                confirmLabel={several ? `Confirm ${plural(entry.items.length, "system", "systems")}` : "Confirm it"}
                keepLabel="Cancel"
                busy={confirmDocument.isPending || confirmSystems.isPending}
                busyLabel="Confirming…"
                failure={confirmFailure ? errorMessage(confirmFailure) : null}
                onConfirm={(note) => confirm(entry, note)}
                onKeep={() => {
                  setConfirming(null);
                  panel.close();
                }}
              />
            )}
          </Task>
        );
      }
      default:
        return null;
    }
  };

  let body: ReactNode;
  if (queue.loading) {
    body = <Skeleton label="Reading what needs you" rows={6} />;
  } else if (settledEmpty && !team) {
    body = (
      <EmptyState title="Nothing needs you." action={<RouterLink href="/?scope=everyone">See everyone's work</RouterLink>}>
        <p>{queue.summary.nextDue ? <>Next re-confirmation: {queue.summary.nextDue}.</> : "No re-confirmations are scheduled."}</p>
      </EmptyState>
    );
  } else {
    body = (
      <>
        {shown.map((section) => (
          <div key={section.key} ref={(element) => { if (element) regions.current.set(section.key, element); }} className="work__section">
            <Section
              title={<><section.icon size={16} aria-hidden="true" /> {team && section.teamTitle ? section.teamTitle : section.title}</>}
              count={section.failed || section.pending ? undefined : section.rows.length}
            >
              {section.pending ? (
                <Skeleton label={`Reading ${section.source}`} rows={2} />
              ) : section.failed ? (
                <p className="work__none">
                  Couldn't read {section.source}.{" "}
                  <Button variant="link" busy={queue.retrying} onClick={() => { retried.current = section.key; queue.retry(); }}>Try again</Button>
                </p>
              ) : (
                <ol className="work-tasks">{section.rows.map(card)}</ol>
              )}
            </Section>
          </div>
        ))}
        {clear.length > 0 && (
          <p className="work__clear" ref={clearLine}>
            Also clear: {clear.map((section) => section.clear).join("; ")}.
            {clear.some((section) => section.key === "due") && queue.summary.nextDue ? <> Next re-confirmation: {queue.summary.nextDue}.</> : null}
          </p>
        )}
      </>
    );
  }

  const spoken = outcome ?? actions.said;
  return (
    <div className="work">
      <PageHeader
        title="To do"
        meta={lead && <span>{lead}</span>}
        actions={
          <FilterStrip
            label="Whose work"
            filters={[{ id: "mine", label: "Mine" }, { id: "everyone", label: "Everyone's" }]}
            active={scope}
            onChange={(id) => {
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                if (id === "everyone") next.set("scope", "everyone");
                else next.delete("scope");
                return next;
              }, { replace: true });
            }}
          />
        }
      />
      <p ref={said} tabIndex={-1} className="work__said" role="status">
        {spoken ? spoken.failed ? <Status tone="attention">{spoken.text}</Status> : spoken.text : null}
      </p>
      {body}
      {/* A standing backlog, not a decision waiting on you: one quiet card, outside the count. */}
      {queue.pending.gaps ? null : queue.failed.gaps ? (
        <p className="work__backlog">Couldn't read who runs the systems in service.</p>
      ) : gap?.kind === "gaps" ? (
        <section className="work__backlog" aria-labelledby="work-backlog">
          <h2 id="work-backlog" className="work__backlog-title">Standing backlog</h2>
          <ol className="work-tasks">
            <Task
              mark={<UsersRound size={16} />}
              title={<>{plural(gap.count, "system in service has", "systems in service have")} no squad or no contact</>}
              why={<>Starting with ‘<bdi>{gap.subject}</bdi>’. It isn't counted in To do: it rarely empties.</>}
              action={<ButtonLink to={gap.to}>See who runs what</ButtonLink>}
            />
          </ol>
        </section>
      ) : null}
    </div>
  );
}
