import { AlertTriangle, Clock, ListTodo, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useReminders } from "../data";
import { useLab, wf } from "../lab-context";
import { type Entry, SIMULATED_DUE, useWorkQueue } from "../queue";
import { Empty, Note, Page, RovingList, Skeleton } from "../ui";

type Item = { id: string; text: ReactNode; action: string; to: string; mine: boolean };

function words(entry: Entry): { text: ReactNode; action: string } {
  switch (entry.kind) {
    case "unreadable":
      return { text: <>Couldn't read '<bdi>{entry.subject}</bdi>'. Upload a new version or try reading again.</>, action: "Open the document" };
    case "job-failed":
      return { text: <>{entry.job} failed: '<bdi>{entry.subject}</bdi>'. {entry.cause}</>, action: "See Jobs" };
    case "review":
      return { text: <>'<bdi>{entry.subject}</bdi>' is waiting for your review.</>, action: "Review it" };
    case "suggestions":
      return { text: <>{entry.count} suggestions need a decision in the draft '<bdi>{entry.subject}</bdi>'.</>, action: "Decide them" };
    case "due":
      return { text: <>Re-confirm '<bdi>{entry.subject}</bdi>' ({entry.what}). {entry.when}.{entry.simulated && <span className="wf-sim"> Simulated</span>}</>, action: "Re-confirm" };
    case "gaps":
      return { text: <>{entry.count} systems in service have no squad or no contact. Next: <bdi>{entry.subject}</bdi>.</>, action: "Fill the gaps" };
  }
}

/** Queue archetype (IA §3): one ranked list of next decisions, Mine or Everyone's. */
export function YourWork() {
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") === "everyone" ? "everyone" : "mine";
  const queue = useWorkQueue();
  const loading = queue.loading;
  const toItems = (entries: Entry[]): Item[] =>
    entries.filter((entry) => scope === "everyone" || entry.mine).map((entry) => ({ ...entry, ...words(entry) }));

  const sections = [
    { key: "attention", title: "Needs attention", icon: AlertTriangle, items: toItems(queue.sections.attention) },
    { key: "decisions", title: "Decisions waiting on you", icon: ListTodo, items: toItems(queue.sections.decisions) },
    { key: "due", title: "Re-confirmations due", icon: Clock, items: toItems(queue.sections.due) },
    { key: "gaps", title: "Gaps", icon: UsersRound, items: toItems(queue.sections.gaps) },
  ];
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <Page
      title="Your work"
      archetype="Queue"
      lead={loading ? "Reading what needs you…" : total === 0 ? "Nothing needs you." : `${total} ${total === 1 ? "thing needs" : "things need"} ${scope === "mine" ? "you" : "the team"}.`}
      head={
        <div className="wf-segmented" role="group" aria-label="Whose work">
          {(["mine", "everyone"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => {
                if (value === "everyone") params.set("scope", "everyone");
                else params.delete("scope");
                setParams(params, { replace: true });
              }}
            >
              {value === "mine" ? "Mine" : "Everyone's"}
            </button>
          ))}
        </div>
      }
    >
      <Note>
        One ranked list shared with the rail's count; severity order is Needs attention → Decisions → Re-confirmations → Gaps, carried by
        position, icon and words, never colour. ↑ ↓ move within a section, Enter opens.
      </Note>
      {loading ? (
        <Skeleton label="Reading what needs you" rows={6} />
      ) : (
        sections.map((section) => (
          <section key={section.key} className="wf-section" aria-labelledby={`yw-${section.key}`}>
            <h2 id={`yw-${section.key}`}>
              <section.icon size={16} aria-hidden="true" /> {section.title}{" "}
              <span className="wf-quiet">{section.items.length}</span>
            </h2>
            {section.items.length === 0 ? (
              <p className="wf-quiet">{section.key === "due" ? "No re-confirmations are due." : "None."}</p>
            ) : (
              <RovingList label={section.title}>
                {section.items.map((item, index) => (
                  <li key={item.id} className="wf-queue__item">
                    <p>{item.text}</p>
                    <Link to={item.to} data-roving tabIndex={index === 0 ? 0 : -1} className="wf-button">
                      {item.action}
                    </Link>
                  </li>
                ))}
              </RovingList>
            )}
          </section>
        ))
      )}
      {!loading && total === 0 && <Empty title="Nothing else needs you." why="No re-confirmations are due. Switch to Everyone's to see the team's work." />}
      <section className="wf-section" aria-labelledby="yw-areas">
        <h2 id="yw-areas">Areas</h2>
        <ul className="wf-lines">
          <li><Link to={wf("/library")}>Library</Link>: {queue.summary.inService} documents in service</li>
          <li><Link to={wf("/architecture")}>Catalogue</Link>: in service '<bdi>{queue.summary.activeName}</bdi>'{queue.summary.hasDraft ? <>, a draft in preparation</> : null}</li>
          <li><Link to={wf("/ownership")}>Ownership</Link>: {queue.summary.squads} squads</li>
          <li><Link to={wf("/requirement-knowledge")}>Requirements</Link>: held by Requirement AI</li>
        </ul>
      </section>
    </Page>
  );
}

/** Re-confirmations: a filtered Queue, always reachable; says plainly when nothing is due. */
export function ReConfirmations() {
  const lab = useLab();
  const reminders = useReminders();
  const items = [
    ...(reminders.data?.items ?? []).map((item) => ({ id: item.id, title: item.title, kind: item.kind, when: item.standing.due_at.slice(0, 10), sim: false })),
    ...(lab.scenario === "due-items" ? SIMULATED_DUE.map((item) => ({ ...item, sim: true })) : []),
  ];
  return (
    <Page title="Re-confirmations" archetype="Queue" lead="Documents and systems that must be confirmed as still right.">
      {items.length === 0 ? (
        <Empty title="Nothing is due." why="No document or system needs re-confirming now. Set the scenario to 'Re-confirmations due' to walk this path." />
      ) : (
        <ConfirmList items={items} />
      )}
    </Page>
  );
}

function ConfirmList({ items }: { items: { id: string; title: string; kind: string; when: string; sim: boolean }[] }) {
  const lab = useLab();
  return (
    <RovingList label="Due for re-confirmation">
      {items.map((item, index) => {
        const done = lab.writes[`confirm:${item.id}`];
        return (
          <li key={item.id} className="wf-queue__item">
            <p>
              '<bdi>{item.title}</bdi>' ({item.kind}) · {item.when}
              {item.sim && <span className="wf-sim"> Simulated</span>}
            </p>
            {done ? (
              <p className="wf-outcome" role="status">Confirmed as still right. Next due in 6 months.</p>
            ) : (
              <button
                type="button"
                className="wf-button"
                data-roving
                tabIndex={index === 0 ? 0 : -1}
                onClick={() => void lab.simulate(`confirm:${item.id}`, true).then(() => lab.announce(`Confirmed '${item.title}'.`), () => lab.announce("Couldn't confirm. Try again."))}
              >
                Confirm it is still right
              </button>
            )}
          </li>
        );
      })}
    </RovingList>
  );
}
