import { Fragment, useState } from "react";

import type { Person } from "../api/client";
import { EditButton } from "../catalogue/DraftEdits";
import { count } from "../home/format";
import { PersonEdit } from "./OrgEdits";
import { rolesOf } from "./organisation";
import { useOrgContext } from "./useOrganisation";

/** Everyone the catalogue names, with the roles each holds. People are never deleted, only made inactive. */
export function PeoplePage() {
  const { org } = useOrgContext();
  const [editing, setEditing] = useState<{ person?: Person } | null>(null);
  const [find, setFind] = useState("");
  const wanted = find.trim().toLocaleLowerCase();
  const shown = [...org.people]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
    .filter((person) => !wanted || [person.name, person.team, person.email].some((text) => text?.toLocaleLowerCase().includes(wanted)));
  const done = () => setEditing(null);
  return (
    <section className="govsection catalogue__first" aria-labelledby="people-title">
      <h2 id="people-title" className="govsection__title">People</h2>
      <p className="govsection__lead">
        Leads, scrum masters and contacts. Someone who holds no role can be marked inactive; nobody is deleted, so history keeps their name.
      </p>
      <div className="filters">
        <p className="govsection__actions">
          <EditButton expanded={editing !== null && !editing.person} onClick={() => setEditing(editing && !editing.person ? null : {})}>
            Add a person
          </EditButton>
        </p>
        <label className="field field--inline">
          <span className="field__label">Find a person</span>
          <input type="search" className="field__input" value={find} onChange={(event) => setFind(event.target.value)} />
        </label>
      </div>
      {editing && !editing.person && <PersonEdit onDone={done} />}
      {shown.length ? (
        <table className="govtable">
          <caption className="visually-hidden">People and the roles they hold</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="people__roles">Roles</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((person) => {
              const roles = rolesOf(org, person.id);
              const words = [
                ...roles.leads.map((stream) => `Leads ${stream.name}`),
                ...roles.scrumMaster.map((squad) => `Scrum master of ${squad.name}`),
                ...(roles.resource.length ? [`Contact for ${count(roles.resource.length, "system")}`] : []),
              ];
              const open = editing?.person?.id === person.id;
              return (
                <Fragment key={person.id}>
                  <tr className={`row${person.active ? "" : " row--past"}${open ? " is-open" : ""}`}>
                    <th scope="row">
                      <span dir="auto">{person.name}</span>
                      <span className="secondary govtable__by people__meta" dir="auto">
                        {[person.active ? null : "Inactive", person.team, person.email]
                          .filter((item): item is string => !!item)
                          .map((item, index) => (
                            <span key={item}>
                              {index > 0 && " · "}
                              {item.includes("@") ? <>{item.split("@")[0]}@<wbr />{item.split("@").slice(1).join("@")}</> : item}
                            </span>
                          ))}
                        {!person.team && !person.email && person.active && "No team or email recorded"}
                      </span>
                      <span className="secondary govtable__by people__roles-phone" dir="auto">{words.length ? words.join("; ") : "No role"}</span>
                      <span className="sheet__row-actions">
                        <EditButton onClick={() => setEditing({ person })}>
                          Edit<span className="visually-hidden"> {person.name}</span>
                        </EditButton>
                      </span>
                    </th>
                    <td dir="auto" className="people__roles">{words.length ? words.join("; ") : <span className="secondary">No role</span>}</td>
                  </tr>
                  {open && (
                    <tr className="runs__detail">
                      <td colSpan={2}>
                        <PersonEdit person={person} onDone={done} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">{find ? "No one matches." : "No one yet."}</p>
      )}
    </section>
  );
}
