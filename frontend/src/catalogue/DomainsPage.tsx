import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { CatalogueSystem } from "../api/client";
import { domainTree } from "./catalogue";
import { DomainsEdit, EditButton } from "./DraftEdits";
import { useCatalogueContext } from "./useCatalogue";

/** The two domain trees: where systems sit, and what they do by business area. */
export function DomainsPage() {
  const { book, base, editable } = useCatalogueContext();
  const [editing, setEditing] = useState<"landscape" | "areas" | null>(null);
  const editButton = (tree: "landscape" | "areas", label: string) =>
    editable && editing !== tree ? (
      <p className="govsection__actions">
        <EditButton onClick={() => setEditing(tree)}>{label}</EditButton>
      </p>
    ) : null;
  const landscape = useMemo(() => domainTree(book.release.landscape_domains ?? []), [book]);
  const areas = useMemo(() => domainTree(book.release.capability_domains ?? []), [book]);
  const unplaced = book.release.systems.filter(
    (system) => !system.landscape_domain_id || !book.landscape.has(system.landscape_domain_id),
  );
  const systemLink = (system: CatalogueSystem) => (
    <Link to={`${base}/systems/${encodeURIComponent(system.id)}`} dir="auto">{system.name}</Link>
  );
  const list = (systems: CatalogueSystem[]) =>
    systems.length ? (
      systems.map((system, index) => (
        <Fragment key={system.id}>
          {index > 0 && ", "}
          {systemLink(system)}
        </Fragment>
      ))
    ) : (
      <span className="secondary">None directly</span>
    );

  return (
    <>
      <section className="govsection catalogue__first" aria-labelledby="landscape-title">
        <h2 id="landscape-title" className="govsection__title">Where systems sit</h2>
        <p className="govsection__lead">The landscape: each domain with the systems placed directly in it.</p>
        {editButton("landscape", "Edit where systems sit")}
        {editing === "landscape" ? (
          <DomainsEdit tree="landscape" onDone={() => setEditing(null)} />
        ) : landscape.length ? (
          <table className="govtable">
            <caption className="visually-hidden">Landscape domains and their systems</caption>
            <thead>
              <tr>
                <th scope="col">Domain</th>
                <th scope="col">Systems</th>
              </tr>
            </thead>
            <tbody>
              {landscape.map(({ domain, depth }) => (
                <tr key={domain.id} className="row">
                  <th scope="row" className={`domain domain--${Math.min(depth, 2)}`} dir="auto">
                    {domain.name}
                    {domain.name_ar && <span className="secondary govtable__by" lang="ar" dir="rtl">{domain.name_ar}</span>}
                    {domain.description && <span className="secondary govtable__by" dir="auto">{domain.description}</span>}
                  </th>
                  <td>{list(book.release.systems.filter((system) => system.landscape_domain_id === domain.id))}</td>
                </tr>
              ))}
              {unplaced.length > 0 && (
                <tr className="row row--past">
                  <th scope="row">Not placed</th>
                  <td>{list(unplaced)}</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p className="timetable__quiet">This version places no system in a landscape.</p>
        )}
      </section>

      <section className="govsection" aria-labelledby="areas-title">
        <h2 id="areas-title" className="govsection__title">What systems do, by business area</h2>
        <p className="govsection__lead">Each business area with the capabilities filed under it, and the system that has each.</p>
        {editButton("areas", "Edit the business areas")}
        {editing === "areas" ? (
          <DomainsEdit tree="areas" onDone={() => setEditing(null)} />
        ) : areas.length ? (
          <table className="govtable">
            <caption className="visually-hidden">Business areas and their capabilities</caption>
            <thead>
              <tr>
                <th scope="col">Business area</th>
                <th scope="col">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {areas.map(({ domain, depth }) => {
                const filed = book.release.systems.flatMap((system) =>
                  system.capabilities.filter((item) => item.domain_id === domain.id).map((capability) => ({ system, capability })),
                );
                return (
                  <tr key={domain.id} className="row">
                    <th scope="row" className={`domain domain--${Math.min(depth, 2)}`} dir="auto">
                      {domain.name}
                      {domain.name_ar && <span className="secondary govtable__by" lang="ar" dir="rtl">{domain.name_ar}</span>}
                      {domain.description && <span className="secondary govtable__by" dir="auto">{domain.description}</span>}
                    </th>
                    <td>
                      {filed.length ? (
                        <ul className="domain__capabilities">
                          {filed.map(({ system, capability }) => (
                            <li key={`${system.id}:${capability.id}`}>
                              <span dir="auto">{capability.name}</span>
                              <span className="secondary"> · {systemLink(system)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="secondary">None filed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="timetable__quiet">This version files no capability under a business area.</p>
        )}
      </section>
    </>
  );
}
