import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { count } from "../home/format";
import { LINK_VERB, allConnections, findSystems, systemGroups, systemName, UNPLACED } from "./catalogue";
import { SystemSheet } from "./SystemSheet";
import { useCatalogueContext } from "./useCatalogue";

/**
 * The systems of a version: an index grouped by where each system sits, beside
 * either every connection or one system's sheet.
 */
export function SystemsPage() {
  const { systemId } = useParams();
  const { book, base } = useCatalogueContext();
  const chosen = systemId !== undefined ? book.systems.get(systemId) : undefined;
  return (
    <div className={chosen ? "catalogue__systems has-sheet" : "catalogue__systems"}>
      <SystemsIndex current={chosen?.id} />
      <div className="catalogue__main">
        {systemId !== undefined && !chosen ? (
          <p className="docpage__failure" role="alert">
            This version has no system “{systemId}”. <Link to={base}>See every system</Link>
          </p>
        ) : chosen ? (
          <SystemSheet key={chosen.id} system={chosen} />
        ) : (
          <AllConnections />
        )}
      </div>
    </div>
  );
}

function SystemsIndex({ current }: { current?: string }) {
  const { book, base } = useCatalogueContext();
  const [query, setQuery] = useState("");
  const id = useId();
  const groups = useMemo(() => systemGroups(book), [book]);
  const found = useMemo(() => findSystems(book, query), [book, query]);
  const finding = query.trim() !== "";
  const shown = groups
    .map((group) => ({ ...group, systems: finding ? group.systems.filter((system) => found.has(system.id)) : group.systems }))
    .filter((group) => group.systems.length > 0);
  const currentLink = useRef<HTMLAnchorElement>(null);
  const nav = useRef<HTMLElement>(null);

  // Following a connection keeps the new system's entry in view: the index scrolls itself, after the
  // sheet has brought its own heading into view, so neither undoes the other.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const link = currentLink.current;
      const box = nav.current;
      if (!link || !box || box.scrollHeight <= box.clientHeight) return;
      const masthead = document.querySelector(".masthead")?.getBoundingClientRect().bottom ?? 0;
      const navRect = box.getBoundingClientRect();
      const top = Math.max(navRect.top, masthead);
      const bottom = Math.min(navRect.bottom, window.innerHeight);
      const linkRect = link.getBoundingClientRect();
      if (linkRect.top >= top && linkRect.bottom <= bottom) return;
      box.scrollTop += linkRect.top + linkRect.height / 2 - (top + bottom) / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, [current]);

  return (
    <nav ref={nav} className="sysindex" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="visually-hidden">Systems in this version</h2>
      <label className="field sysindex__find" htmlFor={`${id}-find`}>
        <span className="field__label">Find a system</span>
        <input
          id={`${id}-find`}
          type="search"
          className="field__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, alias or phrase"
          aria-describedby={`${id}-count`}
        />
      </label>
      <p id={`${id}-count`} className="sysindex__count" aria-live="polite">
        {finding
          ? found.size
            ? `${count(found.size, "system")} known by “${query.trim()}”`
            : `No system is known by “${query.trim()}”.`
          : count(book.release.systems.length, "system")}
      </p>
      {shown.map((group) => (
        <section key={group.id} className="sysindex__group" aria-labelledby={`${id}-${group.id}`}>
          <h3 id={`${id}-${group.id}`} className="sysindex__place" dir="auto">
            {group.id === UNPLACED ? "Not placed in the landscape" : group.path.join(" › ")}
          </h3>
          <ul className="sysindex__list">
            {group.systems.map((system) => {
              const reason = found.get(system.id);
              const isCurrent = system.id === current;
              return (
                <li key={system.id}>
                  <Link
                    ref={isCurrent ? currentLink : undefined}
                    to={`${base}/systems/${encodeURIComponent(system.id)}`}
                    className="sysindex__link"
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    <span dir="auto">{system.name}</span>
                    {reason && <span className="sysindex__why" dir="auto">{reason}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** With no system chosen: every connection in the version, read as a sentence. */
function AllConnections() {
  const { book, base } = useCatalogueContext();
  const rows = useMemo(() => allConnections(book), [book]);
  const linked = new Set(rows.flatMap((row) => [row.source_system_id, row.target_system_id]));
  const link = (systemId: string) => (
    <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>
  );
  return (
    <section className="govsection catalogue__first" aria-labelledby="connections-title">
      <h2 id="connections-title" className="govsection__title">All connections</h2>
      <p className="govsection__lead">
        {count(rows.length, "connection")} between {count(linked.size, "system")}. Each reads from the system that
        depends to the one it depends on. Choose a system for its sheet.
      </p>
      {rows.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Every connection between systems in this version</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col" className="connections__to">To</th>
              <th scope="col">For what</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.source_system_id}>${row.target_system_id}`} className="row">
                <th scope="row" className="connections__from">
                  {link(row.source_system_id)}
                  <span className="secondary govtable__by connections__verb">{LINK_VERB[row.kind]}</span>
                  <span className="secondary govtable__by connections__inline">
                    {LINK_VERB[row.kind]} {link(row.target_system_id)}
                  </span>
                </th>
                <td className="connections__to">{link(row.target_system_id)}</td>
                <td dir="auto">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No system depends on another in this version.</p>
      )}
    </section>
  );
}
