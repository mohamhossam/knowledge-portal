/**
 * What the Landscape and Systems pages share: the "Find a system" search and
 * the drawer that opens over the board with the picked system's details. The
 * picked system itself lives in the URL (see systemHooks). The drawer is about
 * the architecture, so it holds for any product: it names the products that
 * use the system rather than one product's figures.
 */
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { CatalogueData } from "../../architecture/adapter";
import { journeyHref, LAB } from "./labData";
import { plural } from "./labUtil";
import { allViews, partnersOf, reachOf } from "./posterModel";

/** "Find a system": an exact name picks it as you type; Enter takes the first name that starts with, then contains, the text. */
export function FindSystem({ data, onFound }: { data: CatalogueData; onFound: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);
  const find = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim().toLowerCase();
    if (!text) return;
    const match =
      data.systems.find((item) => item.name.toLowerCase() === text) ??
      data.systems.find((item) => item.name.toLowerCase().startsWith(text)) ??
      data.systems.find((item) => item.name.toLowerCase().includes(text) || item.aliases.some((alias) => alias.toLowerCase().includes(text)));
    setNotFound(match ? null : query.trim());
    if (match) {
      onFound(match.id);
      setQuery(match.name);
    }
  };
  return (
    <>
      <form className="cl-find lx-find" role="search" onSubmit={find}>
        <svg className="cl-view-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3.5 3.5" />
        </svg>
        <label className="ds-visually-hidden" htmlFor="cl-find">
          Find a system
        </label>
        <input
          id="cl-find"
          name="system"
          type="search"
          className="cl-field"
          list="cl-systems"
          autoComplete="off"
          spellCheck={false}
          placeholder="Find a system…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setNotFound(null);
            const exact = data.systems.find((item) => item.name.toLowerCase() === event.target.value.trim().toLowerCase());
            if (exact) onFound(exact.id);
          }}
        />
        <datalist id="cl-systems">
          {data.systems.map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>
        <button type="submit" className="ds-visually-hidden">
          Find
        </button>
      </form>
      <p className="cl-status lx-status" role="status">
        {notFound ? `No system called “${notFound}”.` : ""}
      </p>
    </>
  );
}

/** The picked system's details, in a drawer over the board's right side. Close or Escape lets it go. */
export function SystemDrawer({ data, systemId, linkCounts, onSelect }: { data: CatalogueData; systemId: string | null; linkCounts: Map<string, number>; onSelect: (id: string | null) => void }) {
  const views = useMemo(() => allViews(data), [data]);
  const reach = useMemo(() => new Map(data.offerings.map((offering) => [offering.id, reachOf(data, offering.id)])), [data]);
  const systemById = useMemo(() => new Map(data.systems.map((system) => [system.id, system])), [data]);
  const system = systemId ? (systemById.get(systemId) ?? null) : null;
  const partners = system ? partnersOf(system.id, linkCounts) : [];
  const live = <p className="ds-visually-hidden" aria-live="polite">{system ? `${system.name} selected: ${plural(partners.length, "linked system")}.` : ""}</p>;
  if (!system) return live;

  const journeysThrough = data.journeys.filter((journey) => views.some((item) => item.id === journey.id && (item.steps.some((step) => step.lane === system.id) || item.integrations.some((call) => [call.from, call.to, call.via].includes(system.id)))));
  // Which products use the picked system, and how centrally.
  const productUse = data.offerings
    .map((offering) => {
      const set = reach.get(offering.id)?.get(system.id);
      const total = data.journeys.filter((journey) => journey.offeringId === offering.id).length;
      return { offering, count: set?.size ?? 0, total, core: (set?.size ?? 0) >= Math.max(2, Math.ceil(total / 2)) };
    })
    .filter((item) => item.count > 0);
  const steps = new Set(views.flatMap((item) => item.steps.filter((step) => step.kind === "task" && step.lane === system.id).map((step) => `${item.id}:${step.id}`))).size;
  const domain = data.domains.find((item) => item.id === system.domain);
  const group = domain?.groups.find((item) => item.id === system.group);
  // The linked systems, in map order: layer by layer.
  const linked = data.domains.flatMap((layer) => partners.map((item) => systemById.get(item.id)).filter((item) => item?.domain === layer.id));

  return (
    <>
      {live}
      <aside
        className="lx-drawer"
        aria-labelledby="cl-insp-h"
        onKeyDown={(event) => {
          if (event.key === "Escape") onSelect(null);
        }}
      >
        <div className="cl-insp-head">
          <h2 id="cl-insp-h" translate="no">
            {system.name}
          </h2>
          <button type="button" className="cl-close" onClick={() => onSelect(null)} aria-label={`Close the details of ${system.name}`}>
            Close
          </button>
        </div>
        <p className="cl-sub">{[domain?.name, group?.name, system.owner, system.external ? "External" : ""].filter(Boolean).join(" · ")}</p>
        <p className="cl-body">{system.function || "Its sources don't describe what it does."}</p>
        {system.proposedMove && (
          <p className="cl-note">
            <strong>Placement proposed.</strong> Its source places it in {system.proposedMove.from}. {system.proposedMove.reason}
          </p>
        )}
        <dl className="cl-stats cl-stats--3">
          <div>
            <dt>Linked</dt>
            <dd>{partners.length}</dd>
          </div>
          <div>
            <dt>Journeys</dt>
            <dd>{journeysThrough.length}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{steps}</dd>
          </div>
        </dl>
        {linked.length > 0 && (
          <>
            <h3>Linked systems</h3>
            <p className="lx-pills">
              {linked.map((item) =>
                item ? (
                  <button key={item.id} type="button" className="cl-pill" onClick={() => onSelect(item.id)} translate="no">
                    {item.name}
                  </button>
                ) : null,
              )}
            </p>
          </>
        )}
        {productUse.length > 0 && (
          <>
            <h3>Used by products</h3>
            <ul className="cl-uses">
              {productUse.map((item) => (
                <li key={item.offering.id}>
                  <Link to={`${LAB}/products/${item.offering.id}/architecture?system=${system.id}`}>{item.offering.name}</Link>
                  <span className={`cl-use-tier${item.core ? " is-core" : ""}`}>{item.core ? "Core" : "Used"}</span>
                  <small>
                    in {item.count} of {plural(item.total, "journey")}
                  </small>
                </li>
              ))}
            </ul>
          </>
        )}
        {journeysThrough.length > 0 && (
          <>
            <h3>Journeys through it</h3>
            <p className="lx-pills">
              {journeysThrough.map((journey) => (
                <Link key={journey.id} className="cl-pill" to={journeyHref(journey.id, journey.channels[0])}>
                  {journey.name}
                </Link>
              ))}
            </p>
          </>
        )}
        {system.roadmap && (
          <>
            <h3>Roadmap</h3>
            <p className="cl-body">{system.roadmap}</p>
          </>
        )}
      </aside>
    </>
  );
}
