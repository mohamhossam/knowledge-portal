import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { api, type CatalogueSystem, type Relationship } from "../api/client";
import { errorMessage } from "../api/errors";
import { connections, dependsHow, domainPath, sentenceCase, systemName, systemRoles, usedHow } from "./catalogue";
import { ConnectionEdit, ConnectionRemove, EditButton, SystemEdit, SystemRemove } from "./DraftEdits";
import { SystemReview } from "../reviews/SystemReview";
import { roleLabel } from "../squads/organisation";
import { useCatalogueContext } from "./useCatalogue";

/** Where a sheet was reached from, so the way back can be lit and retraced. */
type Trail = { from?: string };

/** One system's sheet: what it is called, what it does, how it connects, who owns it and where it plays a part. */
export function SystemSheet({ system }: { system: CatalogueSystem }) {
  const { book, base, editable } = useCatalogueContext();
  const [editing, setEditing] = useState<"system" | "remove" | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as Trail | null)?.from;
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const place = domainPath(book.landscape, system.landscape_domain_id);
  const { dependsOn, usedBy } = connections(book, system.id);

  // Arriving from elsewhere in the portal moves focus to the sheet; a fresh page load leaves it be.
  useEffect(() => {
    if (location.key === "default") return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [location.key]);

  return (
    <article className="sheet" aria-labelledby={`${id}-name`}>
      <header className="sheet__head">
        <p className="sheet__trail">
          {from && book.systems.has(from) && (
            <button type="button" className="text-button" onClick={() => navigate(-1)}>
              <ArrowLeft size={14} aria-hidden="true" />
              Back to <span dir="auto">{systemName(book, from)}</span>
            </button>
          )}
          <Link to={base} className="sheet__all">All systems and connections</Link>
        </p>
        <h2 id={`${id}-name`} ref={heading} tabIndex={-1} className="sheet__title" dir="auto">{system.name}</h2>
        {system.name_ar && <p className="sheet__arabic" lang="ar" dir="rtl">{system.name_ar}</p>}
        <SystemReview system={system} />
        <dl className="sheet__facts">
          <div>
            <dt>Also called</dt>
            <dd dir="auto">{system.aliases.length ? system.aliases.join(", ") : <span className="secondary">No other names</span>}</dd>
          </div>
          <div>
            <dt>Sits in</dt>
            <dd dir="auto">
              {place.length ? (
                <Link to={`${base}/domains`}>{place.join(" › ")}</Link>
              ) : (
                <span className="secondary">Not placed in the landscape</span>
              )}
            </dd>
          </div>
        </dl>
        {system.description && <p className="sheet__description" dir="auto">{system.description}</p>}
        {editable && (
          <p className="docpage__actions">
            <EditButton expanded={editing === "system"} onClick={() => setEditing(editing === "system" ? null : "system")}>
              Edit this system
            </EditButton>
            <EditButton expanded={editing === "remove"} onClick={() => setEditing(editing === "remove" ? null : "remove")}>
              Remove this system
            </EditButton>
          </p>
        )}
      </header>

      {editing === "system" && <SystemEdit system={system} onDone={() => setEditing(null)} />}
      {editing === "remove" && <SystemRemove system={system} onDone={() => setEditing(null)} />}
      {editing !== "system" && (
        <>
      <Capabilities system={system} />

      <div className="sheet__connections">
        <Connections
          title="Depends on"
          rows={dependsOn}
          other={(row) => row.target_system_id}
          how={(row) => dependsHow(row.kind, system.name)}
          from={from}
          system={system}
          empty="It depends on no other system in this version."
          editable={editable}
        />
        <Connections
          title="Used by"
          rows={usedBy}
          other={(row) => row.source_system_id}
          how={(row) => usedHow(row.kind, system.name)}
          from={from}
          system={system}
          empty="No system depends on it in this version."
        />
      </div>

      <Owners system={system} />
      <Roles system={system} />
      <Components system={system} />

      <section className="govsection" aria-labelledby={`${id}-constraints`}>
        <h3 id={`${id}-constraints`} className="govsection__title">Constraints</h3>
        {system.constraints.length ? (
          <ul className="sheet__list">
            {system.constraints.map((item) => <li key={item} dir="auto">{item}</li>)}
          </ul>
        ) : (
          <p className="timetable__quiet">No constraint is recorded.</p>
        )}
      </section>
        </>
      )}
    </article>
  );
}

function Capabilities({ system }: { system: CatalogueSystem }) {
  const { book } = useCatalogueContext();
  const id = useId();
  const areas = new Map((book.release.capability_domains ?? []).map((domain) => [domain.id, domain.name]));
  const components = new Map(system.components.map((item) => [item.id, item.name]));
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="govsection__title">What it does</h3>
      {system.capabilities.length ? (
        <>
          <p className="govsection__lead">Requirement work maps a requirement to this system when it uses one of these phrases.</p>
          <table className="govtable">
            <caption className="visually-hidden">Capabilities of {system.name} and the phrases that match them</caption>
            <thead>
              <tr>
                <th scope="col">Capability</th>
                <th scope="col">Matched by</th>
              </tr>
            </thead>
            <tbody>
              {system.capabilities.map((capability) => {
                const where = [
                  capability.domain_id ? areas.get(capability.domain_id) ?? capability.domain_id : null,
                  capability.component_id ? `in ${components.get(capability.component_id) ?? capability.component_id}` : null,
                ].filter(Boolean);
                return (
                  <tr key={capability.id} className="row">
                    <th scope="row" dir="auto">
                      {capability.name}
                      {where.length > 0 && <span className="secondary govtable__by">{where.join(" · ")}</span>}
                    </th>
                    <td dir="auto">{capability.triggers.map((phrase) => `“${phrase}”`).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p className="timetable__quiet">No capability is recorded, so requirement work never maps to it by phrase.</p>
      )}
    </section>
  );
}

function Connections({ title, rows, other, how, from, system, empty, editable }: {
  title: string;
  rows: Relationship[];
  other: (row: Relationship) => string;
  how: (row: Relationship) => string;
  from?: string;
  system: CatalogueSystem;
  empty: string;
  /** A draft edits the dependencies a system has; those on it are edited on the other system's sheet. */
  editable?: boolean;
}) {
  const { book, base } = useCatalogueContext();
  const id = useId();
  const [editing, setEditing] = useState<Relationship | "new" | null>(null);
  const [removing, setRemoving] = useState<Relationship | null>(null);
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="govsection__title">
        {title} <span className="govsection__count">{rows.length}</span>
      </h3>
      {rows.length ? (
        <table className="govtable">
          <caption className="visually-hidden">{title}: {system.name}</caption>
          <thead>
            <tr>
              <th scope="col" className="connections__system">System</th>
              <th scope="col">For what</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const target = other(row);
              return (
                <tr key={`${row.source_system_id}>${row.target_system_id}`} className={target === from ? "row is-lit" : "row"}>
                  <th scope="row">
                    <Link
                      to={`${base}/systems/${encodeURIComponent(target)}`}
                      state={{ from: system.id } satisfies Trail}
                      dir="auto"
                    >
                      {systemName(book, target)}
                    </Link>
                    <span className="secondary govtable__by">{how(row)}</span>
                    {target === from && <span className="visually-hidden"> (where you came from)</span>}
                  </th>
                  <td dir="auto">
                    {row.description}
                    {editable && (
                      <span className="sheet__row-actions">
                        <EditButton onClick={() => { setRemoving(null); setEditing(row); }}>
                          Change<span className="visually-hidden"> the dependency on {systemName(book, target)}</span>
                        </EditButton>
                        <EditButton onClick={() => { setEditing(null); setRemoving(row); }}>
                          Remove<span className="visually-hidden"> the dependency on {systemName(book, target)}</span>
                        </EditButton>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">{empty}</p>
      )}
      {editable && !editing && !removing && (
        <p className="govsection__actions">
          <EditButton onClick={() => setEditing("new")}>Add a dependency</EditButton>
        </p>
      )}
      {editing && (
        <ConnectionEdit
          key={editing === "new" ? "new" : `${editing.source_system_id}>${editing.target_system_id}`}
          system={system}
          connection={editing === "new" ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {removing && <ConnectionRemove connection={removing} onDone={() => setRemoving(null)} />}
    </section>
  );
}

/** Owners come from the squad catalogue as it is today, whichever version is being read. */
function Owners({ system }: { system: CatalogueSystem }) {
  const { inService } = useCatalogueContext();
  const id = useId();
  const ownership = useQuery({
    queryKey: ["organisation", "systems", system.id, "ownership"],
    queryFn: () => api.systemOwnership(system.id),
  });
  const organisation = useQuery({ queryKey: ["organisation"], queryFn: api.organisation });
  const people = new Map((organisation.data?.people ?? []).map((person) => [person.id, person.name]));
  const streams = new Map((ownership.data?.value_streams ?? []).map((stream) => [stream.id, stream.name]));
  const squads = ownership.data?.squads ?? [];
  const products = ownership.data?.products ?? [];
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="govsection__title">Owned by</h3>
      {!inService && <p className="govsection__lead">Owners as the squad catalogue records them today.</p>}
      {ownership.isPending ? (
        <p className="timetable__quiet">Reading the squad catalogue…</p>
      ) : ownership.isError ? (
        <p className="docpage__failure" role="alert">{errorMessage(ownership.error)}</p>
      ) : squads.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Squads that own {system.name}</caption>
          <thead>
            <tr>
              <th scope="col">Squad</th>
              <th scope="col">People on it</th>
            </tr>
          </thead>
          <tbody>
            {squads.map((squad) => {
              const seats = squad.resources
                .filter((item) => item.system_id === system.id)
                .map((item) => `${roleLabel(item.role)}: ${item.person_id ? people.get(item.person_id) ?? item.person_id : "open seat"}`);
              return (
                <tr key={squad.id} className="row">
                  <th scope="row" dir="auto">
                    {squad.name}
                    <span className="secondary govtable__by" dir="auto">{streams.get(squad.value_stream_id) ?? squad.value_stream_id}</span>
                  </th>
                  <td dir="auto">{seats.join(" · ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <>
          <p className="timetable__quiet">No squad owns it.</p>
          <p className="timetable__next sheet__next">
            <Link to="/squads">
              Assign it to a squad in the squad{" "}
              <span className="nowrap">
                catalogue
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </p>
        </>
      )}
      {products.length > 0 && (
        <p className="govsection__lead">
          Part of {products.length === 1 ? "the product" : "the products"}{" "}
          {products.map((product, index) => (
            <span key={product.id}>
              {index > 0 && ", "}
              <strong dir="auto">{product.name}</strong>
            </span>
          ))}
          .
        </p>
      )}
    </section>
  );
}

function Roles({ system }: { system: CatalogueSystem }) {
  const { book, base } = useCatalogueContext();
  const id = useId();
  const { offerings, journeys } = systemRoles(book, system.id);
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="govsection__title">Offerings and journeys</h3>
      {offerings.length + journeys.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Where {system.name} plays a part</caption>
          <thead>
            <tr>
              <th scope="col">Where</th>
              <th scope="col">Its part</th>
            </tr>
          </thead>
          <tbody>
            {offerings.map((role) => (
              <tr key={`o:${role.offering.id}:${role.component}:${role.role}`} className="row">
                <th scope="row">
                  <Link to={`${base}/offerings/${encodeURIComponent(role.offering.id)}`} dir="auto">{role.offering.name}</Link>
                  <span className="secondary govtable__by" dir="auto">Offering · {role.component}</span>
                </th>
                <td dir="auto">
                  {sentenceCase(role.role)}
                  {role.orderTypes.length > 0 && <> for {role.orderTypes.join(", ")}</>}
                  {role.description && <span className="secondary govtable__by" dir="auto">{role.description}</span>}
                </td>
              </tr>
            ))}
            {journeys.map((role) => (
              <tr key={`j:${role.journey.id}:${role.activity.number}`} className="row">
                <th scope="row">
                  <Link to={`${base}/journeys/${encodeURIComponent(role.journey.id)}`} dir="auto">{role.journey.name}</Link>
                  <span className="secondary govtable__by">Journey · step {role.activity.number}</span>
                </th>
                <td dir="auto">
                  {role.performs ? "Performs" : "Supports"} “{role.activity.name}”
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No offering or journey in this version names it.</p>
      )}
    </section>
  );
}

function Components({ system }: { system: CatalogueSystem }) {
  const id = useId();
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="govsection__title">
        Components
      </h3>
      {system.components.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Components of {system.name}</caption>
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">What it is</th>
            </tr>
          </thead>
          <tbody>
            {system.components.map((component) => (
              <tr key={component.id} className="row">
                <th scope="row" dir="auto">
                  {component.name}
                  {component.name_ar && <span className="secondary govtable__by" lang="ar" dir="rtl">{component.name_ar}</span>}
                  {component.aliases.length > 0 && (
                    <span className="secondary govtable__by" dir="auto">Also called {component.aliases.join(", ")}</span>
                  )}
                </th>
                <td dir="auto">
                  {component.description ?? <span className="secondary">No description</span>}
                  {component.technology && <span className="secondary govtable__by" dir="auto">Built with {component.technology}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No component is recorded.</p>
      )}
    </section>
  );
}

