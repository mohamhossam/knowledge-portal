import { Fragment, useState } from "react";
import { Link } from "react-router-dom";

import type { Squad } from "../api/client";
import { EditButton } from "../catalogue/DraftEdits";
import { OrgRemove, SquadEdit } from "./OrgEdits";
import { people } from "./organisation";
import { useOrgContext } from "./useOrganisation";

/** The squads, by value stream: scrum master, then the systems each runs and the contact for each. */
export function SquadListPage() {
  const { org, release } = useOrgContext();
  const [editing, setEditing] = useState<{ what: "add" } | { what: "edit" | "remove"; squad: Squad } | null>(null);
  const directory = people(org);
  const name = (systemId: string) => release?.systems.find((system) => system.id === systemId)?.name;
  const streams = [...org.value_streams].sort((a, b) => a.name.localeCompare(b.name));
  const done = () => setEditing(null);
  return (
    <section className="govsection catalogue__first" aria-labelledby="squads-list-title">
      <h2 id="squads-list-title" className="govsection__title">Squads</h2>
      <p className="govsection__lead">Who runs each system, by value stream, with a contact for each system.</p>
      {streams.length ? (
        <p className="govsection__actions">
          <EditButton expanded={editing?.what === "add"} onClick={() => setEditing(editing?.what === "add" ? null : { what: "add" })}>
            Add a squad
          </EditButton>
        </p>
      ) : (
        <p className="timetable__quiet">Add a value stream on the Products page first; every squad belongs to one.</p>
      )}
      {editing?.what === "add" && <SquadEdit onDone={done} />}
      {org.squads.length > 0 && (
        <table className="govtable squadlist">
          <caption className="visually-hidden">Squads by value stream</caption>
          <thead>
            <tr>
              <th scope="col">Squad</th>
              <th scope="col">Runs</th>
            </tr>
          </thead>
          {streams.map((stream) => {
            const squads = org.squads.filter((squad) => squad.value_stream_id === stream.id).sort((a, b) => a.name.localeCompare(b.name));
            if (!squads.length) return null;
            return (
              <tbody key={stream.id}>
                <tr className="steps__phase">
                  <th scope="colgroup" colSpan={2} dir="auto">{stream.name}</th>
                </tr>
                {squads.map((squad) => {
                  const master = squad.scrum_master_person_id ? directory.get(squad.scrum_master_person_id) : undefined;
                  const open = editing && editing.what !== "add" && editing.squad.id === squad.id;
                  return (
                    <Fragment key={squad.id}>
                      <tr className={open ? "row is-open" : "row"}>
                        <th scope="row">
                          <span dir="auto">{squad.name}</span>
                          <span className="secondary govtable__by" dir="auto">
                            {master ? `Scrum master: ${master.name}` : "No scrum master named"}
                          </span>
                          <span className="sheet__row-actions">
                            <EditButton onClick={() => setEditing({ what: "edit", squad })}>
                              Edit<span className="visually-hidden"> {squad.name}</span>
                            </EditButton>
                            <EditButton onClick={() => setEditing({ what: "remove", squad })}>
                              Remove<span className="visually-hidden"> {squad.name}</span>
                            </EditButton>
                          </span>
                        </th>
                        <td>
                          {squad.systems.length ? (
                            <ul className="squadlist__systems">
                              {squad.systems.map((item) => {
                                const known = name(item.system_id);
                                const contact = item.person_id ? directory.get(item.person_id) : undefined;
                                return (
                                  <li key={item.system_id} className={known || !release ? undefined : "is-lapsed"}>
                                    {known ? (
                                      <Link to={`/architecture/systems/${encodeURIComponent(item.system_id)}`} dir="auto">{known}</Link>
                                    ) : (
                                      <span>{item.system_id} (not in the catalogue in service)</span>
                                    )}
                                    <span className="secondary" dir="auto"> · {contact ? contact.name : "no contact named"}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <span className="secondary">No system yet</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="runs__detail">
                          <td colSpan={2}>
                            {editing.what === "edit" ? <SquadEdit squad={squad} onDone={done} /> : <OrgRemove kind="squads" record={squad} onDone={done} />}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      )}
      {streams.length > 0 && org.squads.length === 0 && editing?.what !== "add" && <p className="timetable__quiet">No squad yet.</p>}
    </section>
  );
}
