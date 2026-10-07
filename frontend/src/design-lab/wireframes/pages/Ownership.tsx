import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { Organisation } from "../../../api/client";
import { gaps, suggestedSquad, useActiveRelease, useOrganisation } from "../data";
import { useFocusAfterRender } from "../hooks";
import { useLab, wf } from "../lab-context";
import { Empty, Note, Page, Skeleton, Status, SubNav } from "../ui";

const SUB = [
  { to: wf("/ownership"), label: "Gaps", end: true },
  { to: wf("/ownership/products"), label: "Products and systems" },
  { to: wf("/ownership/squads"), label: "Squads" },
  { to: wf("/ownership/people"), label: "People" },
  { to: wf("/ownership/history"), label: "History" },
];

/** Queue archetype: every system with no squad or no contact, one decision each, then the next. */
export function OwnershipGaps() {
  const active = useActiveRelease();
  const organisation = useOrganisation();
  const lab = useLab();
  const [openId, setOpenId] = useState<string | null>(null);
  const focusLater = useFocusAfterRender();
  const all = useMemo(() => gaps(active.data, organisation.data), [active.data, organisation.data]);
  const remaining = all.filter((gap) => !lab.writes[`give:${gap.system.id}`]);

  if (active.isPending || organisation.isPending) return <Skeleton label="Reading ownership" rows={6} />;
  return (
    <Page
      title="Ownership"
      archetype="Queue"
      lead={remaining.length ? `${remaining.length} systems in service have no squad or no contact.` : "Every system in service has a squad and a contact."}
      head={<SubNav label="Ownership" items={SUB} />}
    >
      {remaining.length === 0 ? (
        <Empty title="No gaps." why="Every system in service has a squad and a contact." />
      ) : (
        <ul className="wf-queue" aria-label="Gaps">
          {remaining.map((gap, index) => (
            <li key={gap.system.id} className="wf-queue__item">
              <p>
                <bdi>{gap.system.name}</bdi> · {gap.kind === "no-squad" ? <strong>No squad</strong> : <>Run by {gap.squad}, <strong>no contact</strong></>}
              </p>
              {openId === gap.system.id ? (
                <GivePanel
                  systemId={gap.system.id}
                  systemName={gap.system.name}
                  organisation={organisation.data!}
                  onDone={(text) => {
                    lab.announce(text);
                    const next = remaining[index + 1] ?? remaining[index - 1];
                    setOpenId(null);
                    focusLater(() => document.getElementById(next ? `give-${next.system.id}` : "wf-page-title"));
                  }}
                  onCancel={() => {
                    setOpenId(null);
                    focusLater(() => document.getElementById(`give-${gap.system.id}`));
                  }}
                />
              ) : (
                <button id={`give-${gap.system.id}`} type="button" className="wf-button" aria-expanded={false} onClick={() => setOpenId(gap.system.id)}>
                  Give <bdi>{gap.system.name}</bdi> to a squad…
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Note>Gaps lead (the check-in job); the value streams and products come second. After a save, focus moves to the next gap.</Note>
    </Page>
  );
}

/** One decision with context: a suggested squad and a contact list filtered to that squad's people. */
function GivePanel({ systemId, systemName, organisation, onDone, onCancel }: { systemId: string; systemName: string; organisation: Organisation; onDone: (text: string) => void; onCancel: () => void }) {
  const lab = useLab();
  const id = useId();
  const suggestion = suggestedSquad(systemId, organisation);
  const [squadId, setSquadId] = useState(suggestion?.squad.id ?? "");
  const [personId, setPersonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const squad = organisation.squads.find((item) => item.id === squadId);
  const members = new Set([squad?.scrum_master_person_id, ...(squad?.systems.map((item) => item.person_id) ?? [])].filter(Boolean));
  const people = [...organisation.people.filter((person) => person.active)].sort((a, b) => Number(members.has(b.id)) - Number(members.has(a.id)));
  return (
    <form
      className="wf-flowpanel"
      aria-labelledby={`${id}-t`}
      onKeyDown={(event) => event.key === "Escape" && onCancel()}
      onSubmit={(event) => {
        event.preventDefault();
        if (!squadId) return setError("Choose a squad.");
        lab.simulate(`give:${systemId}`, { squadId, personId }).then(
          () => onDone(`${systemName} is run by ${squad?.name}.`),
          (failure: unknown) => setError(failure instanceof Error ? failure.message : "Couldn't save. Try again."),
        );
      }}
    >
      <h3 id={`${id}-t`}>Give <bdi>{systemName}</bdi> to a squad</h3>
      <div className="wf-field">
        <label htmlFor={`${id}-s`}>Squad</label>
        <select id={`${id}-s`} value={squadId} onChange={(event) => setSquadId(event.target.value)} autoFocus>
          <option value="">Choose a squad</option>
          {organisation.squads.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {suggestion && <p className="wf-hint">Suggested: {suggestion.squad.name} runs {suggestion.shared} other {suggestion.shared === 1 ? "system" : "systems"} in '{suggestion.product.name}'.</p>}
      </div>
      <div className="wf-field">
        <label htmlFor={`${id}-p`}>Contact for it</label>
        <select id={`${id}-p`} value={personId} onChange={(event) => setPersonId(event.target.value)}>
          <option value="">No contact yet</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}{members.has(person.id) ? " (in this squad)" : ""}</option>)}
        </select>
      </div>
      {error && <p className="wf-field__error" role="status">{error}</p>}
      <div className="wf-actions">
        <button type="submit" className="wf-button wf-button--primary">Give it to {squad?.name ?? "the squad"}</button>
        <button type="button" className="wf-button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** The other Ownership pages, as Browse wireframes over real data. */
export function OwnershipBrowse({ what }: { what: "products" | "squads" | "people" | "history" }) {
  const organisation = useOrganisation();
  const title = { products: "Products and systems", squads: "Squads", people: "People", history: "History" }[what];
  const data = organisation.data;
  return (
    <Page title={title} archetype="Browse" head={<SubNav label="Ownership" items={SUB} />}>
      {!data ? <Skeleton label={`Reading ${title.toLowerCase()}`} /> : what === "products" ? (
        data.value_streams.map((stream) => (
          <section key={stream.id} className="wf-section" aria-labelledby={`vs-${stream.id}`}>
            <h2 id={`vs-${stream.id}`}><bdi>{stream.name}</bdi></h2>
            <ul className="wf-lines">
              {data.products.filter((product) => product.value_stream_id === stream.id).map((product) => (
                <li key={product.id}><bdi>{product.name}</bdi> · {product.system_ids.length} systems</li>
              ))}
            </ul>
          </section>
        ))
      ) : what === "squads" ? (
        <ul className="wf-lines">{data.squads.map((squad) => <li key={squad.id}><bdi>{squad.name}</bdi> · runs {squad.systems.length} systems</li>)}</ul>
      ) : what === "people" ? (
        <ul className="wf-lines">{data.people.map((person) => <li key={person.id}><bdi>{person.name}</bdi>{person.active ? "" : <> · <Status state="stopped">Inactive</Status></>}</li>)}</ul>
      ) : (
        <>
          <p>Each event links to what it changed. "What changed" in detail needs the backend (BG5).</p>
          <Link to={wf("/ownership")}>Back to gaps</Link>
        </>
      )}
    </Page>
  );
}
