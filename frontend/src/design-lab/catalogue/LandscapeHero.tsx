/**
 * Mock-up 1, the Landscape hero: the SMB architecture as one layered poster
 * (or, on request, as an integration matrix). No product bar: a product's
 * footprint lives on its own Architecture tab.
 */
import { type FormEvent, useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AreaTabs, EvidenceTag } from "./CatalogueLab";
import { IntegrationMatrix } from "./IntegrationMatrix";
import { journeyHref, LAB, useLabData } from "./labData";
import { firstSentence, listOf, plural, useTitle } from "./labUtil";
import { Poster } from "./poster";
import { allIntegrations, allViews, degrees as degreesOf, links, partnersOf } from "./posterModel";

const TOP = 10;

export function LandscapeHero() {
  const data = useLabData();
  useTitle("SMB architecture");
  const [params, setParams] = useSearchParams();
  const selected = params.get("system");
  const view = params.get("view") === "matrix" ? "matrix" : "map";
  const [showAll, setShowAll] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);

  const integrations = useMemo(() => allIntegrations(data), [data]);
  const linkCounts = useMemo(() => links(data, integrations), [data, integrations]);
  const degrees = useMemo(() => degreesOf(integrations), [integrations]);
  const views = useMemo(() => allViews(data), [data]);
  const systemById = useMemo(() => new Map(data.systems.map((system) => [system.id, system])), [data]);
  const recorded = useMemo(() => (data.release.journeys ?? []).reduce((sum, journey) => sum + (journey.integrations?.length ?? 0), 0), [data]);
  const domains = data.domains.filter((domain) => domain.id !== "integration").length;
  const ranked = useMemo(
    () =>
      data.systems
        .map((system) => ({ system, degree: degrees.get(system.id) }))
        .filter((item) => (item.degree?.total ?? 0) > 0)
        .sort((a, b) => (b.degree?.total ?? 0) - (a.degree?.total ?? 0)),
    [data, degrees],
  );
  const top = ranked[0];

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  const select = useCallback((id: string | null) => setParam("system", id), [setParam]);

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
      select(match.id);
      setQuery(match.name);
    }
  };

  const system = selected ? (systemById.get(selected) ?? null) : null;
  const partners = system ? partnersOf(system.id, linkCounts) : [];
  const degree = system ? degrees.get(system.id) : undefined;
  const maxPartner = Math.max(1, ...partners.map((item) => item.count));
  const journeysThrough = system
    ? data.journeys.filter((journey) => views.some((item) => item.id === journey.id && (item.steps.some((step) => step.lane === system.id) || item.integrations.some((call) => [call.from, call.to, call.via].includes(system.id)))))
    : [];
  const steps = system ? new Set(views.flatMap((item) => item.steps.filter((step) => step.kind === "task" && step.lane === system.id).map((step) => `${item.id}:${step.id}`))).size : 0;
  const domain = system ? data.domains.find((item) => item.id === system.domain) : null;
  const group = domain?.groups.find((item) => item.id === system?.group);
  const shown = everyone ? ranked : ranked.slice(0, TOP);
  const max = top?.degree?.total ?? 1;

  return (
    <>
      <AreaTabs current="landscape" />
      <header className="cl-head">
        <div className="cl-head-text">
          <h1>SMB architecture</h1>
          <p className="cl-lede">
            The SMB estate on the TM Forum application map, and how its systems call each other. {data.status === "draft" ? "A draft" : "Published"}, built only from {listOf(data.sources.map((source) => source.short))}.
          </p>
        </div>
        <dl className="cl-meta">
          <div>
            <dt>Systems</dt>
            <dd>{data.systems.length}</dd>
          </div>
          <div>
            <dt>Domains</dt>
            <dd>{domains}</dd>
          </div>
          <div>
            <dt>Calls</dt>
            <dd>{recorded}</dd>
          </div>
          <div>
            <dt>System pairs</dt>
            <dd>{linkCounts.size}</dd>
          </div>
          <div>
            <dt>Journeys</dt>
            <dd>{data.journeys.length}</dd>
          </div>
        </dl>
      </header>

      <div className="cl-toolbar">
        <div className="cl-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "map"} onClick={() => setParam("view", null)}>
            Map
          </button>
          <button type="button" aria-pressed={view === "matrix"} onClick={() => setParam("view", "matrix")}>
            Matrix
          </button>
        </div>
        {view === "map" && (
          <button type="button" className="cl-chip" aria-pressed={showAll} onClick={() => setShowAll((value) => !value)}>
            All links
          </button>
        )}
        <form className="cl-find" role="search" onSubmit={find}>
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
            placeholder="Find a system, e.g. CWOM…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setNotFound(null);
              const exact = data.systems.find((item) => item.name.toLowerCase() === event.target.value.trim().toLowerCase());
              if (exact) select(exact.id);
            }}
          />
          <datalist id="cl-systems">
            {data.systems.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          <button type="submit" className="cl-btn">
            Find
          </button>
        </form>
        <p className="cl-status" role="status">
          {notFound ? `No system called “${notFound}”.` : ""}
        </p>
        <div className="cl-legend" role="group" aria-label="Legend">
          <span>
            <i className="ext" />
            External
          </span>
          <span>
            <i className="flag" />
            Placement proposed
          </span>
          <span>
            <i className="deg" />
            Integration weight
          </span>
        </div>
      </div>

      <div className="cl-board">
        <div className="cl-board-main">
          {view === "map" ? (
            <Poster data={data} degrees={degrees} linkCounts={linkCounts} label="SMB architecture map" selected={selected} onSelect={select} showAll={showAll} />
          ) : (
            <IntegrationMatrix data={data} degrees={degrees} linkCounts={linkCounts} selected={selected} onSelect={select} />
          )}
        </div>
        <aside className="cl-insp" aria-labelledby="cl-insp-h">
          <p className="ds-visually-hidden" aria-live="polite">
            {system ? `${system.name} selected: ${plural(partners.length, "linked system")}.` : ""}
          </p>
          {system ? (
            <>
              <div className="cl-insp-head">
                <h2 id="cl-insp-h" translate="no">
                  {system.name}
                </h2>
                <button type="button" className="cl-close" onClick={() => select(null)} aria-label={`Clear the selection of ${system.name}`}>
                  Clear
                </button>
              </div>
              <p className="cl-sub">{[domain?.name, group?.name, system.owner, system.external ? "External" : ""].filter(Boolean).join(" · ")}</p>
              <p className="cl-body">{system.function || "Its sources don't describe what it does."}</p>
              <EvidenceTag evidence={system.evidence} />
              {system.proposedMove && (
                <p className="cl-note">
                  <strong>Placement proposed.</strong> Its source places it in {system.proposedMove.from}. {system.proposedMove.reason}
                </p>
              )}
              <dl className="cl-stats">
                <div>
                  <dt>Calls</dt>
                  <dd>{degree?.total ?? 0}</dd>
                </div>
                <div>
                  <dt>Linked</dt>
                  <dd>{partners.length}</dd>
                </div>
                <div>
                  <dt>Steps</dt>
                  <dd>{steps}</dd>
                </div>
                <div>
                  <dt>Journeys</dt>
                  <dd>{journeysThrough.length}</dd>
                </div>
              </dl>
              {degree && degree.total > 0 && (
                <p className="cl-sub">
                  Makes {degree.made} · receives {degree.received}
                  {degree.carried ? ` · carries ${degree.carried}` : ""}
                </p>
              )}
              {partners.length > 0 && (
                <>
                  <h3>Linked systems</h3>
                  <ul className="cl-bars">
                    {partners.map((partner) => (
                      <li key={partner.id}>
                        <button type="button" onClick={() => select(partner.id)} aria-label={`${systemById.get(partner.id)?.name ?? partner.id}: ${plural(partner.count, "call")}`}>
                          <span translate="no">{systemById.get(partner.id)?.name ?? partner.id}</span>
                          <b>{partner.count}</b>
                          <i aria-hidden="true">
                            <i style={{ width: `${(partner.count / maxPartner) * 100}%` }} />
                          </i>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {journeysThrough.length > 0 && (
                <>
                  <h3>Journeys through it</h3>
                  <ul className="cl-linklist">
                    {journeysThrough.map((journey) => (
                      <li key={journey.id}>
                        <Link to={journeyHref(journey.id, journey.channels[0])}>{journey.name}</Link>
                        <span>{journey.channels.length ? plural(journey.channels.length, "channel") : "Shared"}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {system.roadmap && (
                <>
                  <h3>Roadmap</h3>
                  <p className="cl-body">{system.roadmap}</p>
                </>
              )}
            </>
          ) : (
            <>
              <h2 id="cl-insp-h">Integration weight</h2>
              {top && (
                <p className="cl-body">
                  <strong translate="no">{top.system.name}</strong> takes part in {top.degree?.total} of {recorded} calls ({Math.round(((top.degree?.total ?? 0) / Math.max(1, recorded)) * 100)}%). Pick a system to see what it talks to.
                </p>
              )}
              <p className="cl-key" aria-hidden="true">
                <i className="made" />
                Makes
                <i className="received" />
                Receives
                <i className="carried" />
                Carries
              </p>
              <ul className="cl-bars stacked">
                {shown.map(({ system: item, degree: d }) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => select(item.id)}
                      aria-label={`${item.name}: ${plural(d?.total ?? 0, "call")}; makes ${d?.made ?? 0}, receives ${d?.received ?? 0}, carries ${d?.carried ?? 0}`}
                    >
                      <span translate="no">{item.name}</span>
                      <b>{d?.total}</b>
                      <i aria-hidden="true">
                        <i className="made" style={{ width: `${((d?.made ?? 0) / max) * 100}%` }} />
                        <i className="received" style={{ width: `${((d?.received ?? 0) / max) * 100}%` }} />
                        <i className="carried" style={{ width: `${((d?.carried ?? 0) / max) * 100}%` }} />
                      </i>
                    </button>
                  </li>
                ))}
              </ul>
              {ranked.length > TOP && (
                <button type="button" className="cl-more" aria-expanded={everyone} onClick={() => setEveryone((value) => !value)}>
                  {everyone ? `Show the top ${TOP}` : `Show all ${ranked.length} connected systems`}
                </button>
              )}
              <h3>Still open</h3>
              <dl className="cl-pairs">
                <div>
                  <dt>Placements proposed</dt>
                  <dd>{data.systems.filter((item) => item.proposedMove).length}</dd>
                </div>
                <div>
                  <dt>Findings to decide</dt>
                  <dd>{data.findings.length}</dd>
                </div>
              </dl>
            </>
          )}
        </aside>
      </div>

      <section className="cl-products" aria-labelledby="cl-products-h">
        <h2 id="cl-products-h">Products on this architecture</h2>
        <ul>
          {data.offerings.map((offering) => {
            const touched = new Set(
              views
                .filter((item) => item.offeringId === offering.id)
                .flatMap((item) => [...item.steps.map((step) => step.lane), ...item.integrations.flatMap((call) => [call.from, call.to, call.via])])
                .filter((id): id is string => typeof id === "string" && systemById.has(id)),
            );
            return (
              <li key={offering.id}>
                <Link className="cl-prod" to={`${LAB}/products/${offering.id}`}>
                  <strong>{offering.name}</strong>
                  <span>{firstSentence(offering.summary)}</span>
                  <small>
                    {plural(data.journeys.filter((journey) => journey.offeringId === offering.id).length, "journey")} · {plural(touched.size, "system")} · {plural(offering.orderTypes.length, "order type")}
                  </small>
                </Link>
              </li>
            );
          })}
          <li>
            <div className="cl-prod empty">
              <strong>Next product</strong>
              <span>Not modelled yet. The model is generic: any product's offering, plans and journeys fit.</span>
            </div>
          </li>
        </ul>
      </section>
    </>
  );
}
