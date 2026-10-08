import { AlertTriangle, Clock, ListTodo, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { Button, EmptyState, FilterStrip, PageHeader, Section, Skeleton, Status } from "../../../design/components";
import { rovingKeyDown } from "../../../design/hooks";
import { useReminders } from "../../wireframes/data";
import { useLab } from "../../wireframes/lab-context";
import { type Entry, SIMULATED_DUE, useWorkQueue } from "../../wireframes/queue";
import { proto } from "../paths";
import { ButtonLink, Lines, RouterLink } from "../ui";

type Item = { id: string; text: ReactNode; action: string; to: string };

function words(entry: Entry): { text: ReactNode; action: string } {
  switch (entry.kind) {
    case "unreadable":
      return { text: <>Couldn't read '<bdi>{entry.subject}</bdi>'. Upload a new version or try reading again.</>, action: "Open the document" };
    case "job-failed":
      return { text: <>{entry.job} failed: '<bdi>{entry.subject}</bdi>'. {entry.cause}</>, action: "Open it" };
    case "review":
      return { text: <>'<bdi>{entry.subject}</bdi>' is waiting for your review.</>, action: "Review it" };
    case "suggestions":
      return { text: <>{entry.count} suggestions need a decision in the draft '<bdi>{entry.subject}</bdi>'.</>, action: "Decide them" };
    case "due":
      return { text: <>Re-confirm '<bdi>{entry.subject}</bdi>' ({entry.what}). {entry.when}.{entry.simulated && <span className="proto-sim">Simulated</span>}</>, action: "Re-confirm" };
    case "gaps":
      return { text: <>{entry.count} systems in service have no squad or no contact. Next: <bdi>{entry.subject}</bdi>.</>, action: "Fill the gaps" };
  }
}

/**
 * Queue archetype (IA §3): one ranked list of next decisions, Mine or
 * Everyone's. Severity is carried by order, icon and words, never colour.
 */
export function YourWork() {
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") === "everyone" ? "everyone" : "mine";
  const queue = useWorkQueue();
  const toItems = (entries: Entry[]): Item[] =>
    entries.filter((entry) => scope === "everyone" || entry.mine).map((entry) => ({ id: entry.id, to: entry.to, ...words(entry) }));

  const sections = [
    { key: "attention", title: "Needs attention", icon: AlertTriangle, items: toItems(queue.sections.attention), none: "Nothing has failed or is held." },
    { key: "decisions", title: "Decisions waiting on you", icon: ListTodo, items: toItems(queue.sections.decisions), none: "No review or suggestion is waiting." },
    { key: "due", title: "Re-confirmations due", icon: Clock, items: toItems(queue.sections.due), none: "No re-confirmations are due." },
    { key: "gaps", title: "Gaps", icon: UsersRound, items: toItems(queue.sections.gaps), none: "Every system in service has a squad and a contact." },
  ];
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const lead = queue.loading ? "Reading what needs you…" : total === 0 ? "Nothing needs you." : `${total} ${total === 1 ? "thing needs" : "things need"} ${scope === "mine" ? "you" : "the team"}, most urgent first.`;

  return (
    <>
      <PageHeader
        title="Your work"
        lead={lead}
        actions={
          <FilterStrip
            label="Whose work"
            filters={[{ id: "mine", label: "Mine" }, { id: "everyone", label: "Everyone's" }]}
            active={scope}
            onChange={(id) => {
              if (id === "everyone") params.set("scope", "everyone");
              else params.delete("scope");
              setParams(params, { replace: true });
            }}
          />
        }
      />
      {queue.loading ? (
        <Skeleton label="Reading what needs you" rows={6} />
      ) : (
        sections.map((section) => (
          <Section key={section.key} title={<><section.icon size={16} aria-hidden="true" /> {section.title}</>} count={section.items.length}>
            {section.items.length === 0 ? (
              <p className="proto-quiet">{section.none}</p>
            ) : (
              <ul className="proto-queue" aria-label={section.title} onKeyDown={(event) => rovingKeyDown(event, "[data-roving]")}>
                {section.items.map((item, index) => (
                  <li key={item.id} className="proto-queue__item">
                    <p>{item.text}</p>
                    <ButtonLink to={item.to} variant={section.key === "attention" && index === 0 ? "primary" : "secondary"} data-roving tabIndex={index === 0 ? 0 : -1}>
                      {item.action}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ))
      )}
      {!queue.loading && total === 0 && scope === "mine" && (
        <EmptyState title="Nothing else needs you." action={<ButtonLink to="?scope=everyone">See everyone's work</ButtonLink>}>
          <p>No review, decision, re-confirmation or gap is waiting on you.</p>
        </EmptyState>
      )}
      <Section title="Areas">
        <Lines>
          <li><RouterLink href={proto("/library")}>Library</RouterLink>: {queue.summary.inService} documents in service</li>
          <li><RouterLink href={proto("/architecture")}>Catalogue</RouterLink>: in service '<bdi>{queue.summary.activeName}</bdi>'{queue.summary.hasDraft ? ", a draft in preparation" : ""}</li>
          <li><RouterLink href={proto("/ownership")}>Ownership</RouterLink>: {queue.summary.squads} squads</li>
          <li><RouterLink href={proto("/requirement-knowledge")}>Requirements</RouterLink>: held by Requirement AI</li>
        </Lines>
      </Section>
    </>
  );
}

/** Re-confirmations: a filtered Queue, always reachable; says plainly when nothing is due. */
export function ReConfirmations() {
  const lab = useLab();
  const reminders = useReminders();
  const items = [
    ...(reminders.data?.items ?? []).map((item) => ({ id: item.id, title: item.title, kind: item.kind, when: `Due ${item.standing.due_at.slice(0, 10)}`, sim: false })),
    ...(lab.scenario === "due-items" ? SIMULATED_DUE.map((item) => ({ ...item, sim: true })) : []),
  ];
  return (
    <>
      <PageHeader title="Re-confirmations" lead="Documents and systems to confirm as still right, by their due date." />
      {reminders.isPending ? (
        <Skeleton label="Reading what is due" rows={3} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing is due.">
          <p>No document or system needs re-confirming now. In the prototype, set the scenario to 'Re-confirmations due' to walk this path.</p>
        </EmptyState>
      ) : (
        <ul className="proto-queue" aria-label="Due for re-confirmation" onKeyDown={(event) => rovingKeyDown(event, "[data-roving]")}>
          {items.map((item, index) => {
            const done = lab.writes[`confirm:${item.id}`];
            return (
              <li key={item.id} className="proto-queue__item">
                <p>
                  '<bdi>{item.title}</bdi>' ({item.kind}) · {item.when}
                  {item.sim && <span className="proto-sim">Simulated</span>}
                </p>
                {done ? (
                  <p role="status"><Status tone="done">Confirmed as still right. Next due in 6 months.</Status></p>
                ) : (
                  <Button
                    data-roving
                    tabIndex={index === 0 ? 0 : -1}
                    onClick={() => void lab.simulate(`confirm:${item.id}`, true).then(() => lab.announce(`Confirmed '${item.title}' as still right.`), () => lab.announce("Couldn't confirm. Try again."))}
                  >
                    Confirm it is still right<span className="ds-visually-hidden">: {item.title}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
