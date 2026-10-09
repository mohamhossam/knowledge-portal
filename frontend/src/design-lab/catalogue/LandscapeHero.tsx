/**
 * Mock-up 1, the Landscape hero: the SMB architecture as one layered poster.
 * No product bar: a product's footprint lives on its own Architecture tab.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Poster } from "./poster";
import { allIntegrations, allViews, integrationCounts, layoutPoster, links, partnersOf } from "./posterModel";
import { AreaTabs, EvidenceTag } from "./CatalogueLab";
import { LAB, useLabData } from "./labData";

const LEGEND: { id: string; label: string }[] = [
  { id: "market", label: "Market & product" },
  { id: "customer", label: "Customer" },
  { id: "service", label: "Service" },
  { id: "resource", label: "Resource" },
  { id: "party", label: "Engaged party" },
  { id: "enterprise", label: "Enterprise" },
  { id: "spine", label: "Integration layer" },
];

export function LandscapeHero() {
  const data = useLabData();
  const [params, setParams] = useSearchParams();
  const selected = params.get("system");
  const [showLines, setShowLines] = useState(true);
  const [query, setQuery] = useState("");

  const layout = useMemo(() => layoutPoster(data), [data]);
  const integrations = useMemo(() => allIntegrations(data), [data]);
  const linkCounts = useMemo(() => links(data, integrations), [data, integrations]);
  const counts = useMemo(() => integrationCounts(integrations), [integrations]);
  const views = useMemo(() => allViews(data), [data]);
  const domains = data.domains.filter((domain) => domain.id !== "integration").length;
  // As the sources record them: a call made from several channels counts once.
  const recorded = (data.release.journeys ?? []).reduce((sum, journey) => sum + (journey.integrations?.length ?? 0), 0);
  const busiest = [...counts.entries()].filter(([id]) => data.systems.some((system) => system.id === id)).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const top = busiest[0]?.[1] ?? 1;

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id && id !== selected) next.set("system", id);
    else next.delete("system");
    setParams(next, { replace: true });
  };
  const system = data.systems.find((item) => item.id === selected) ?? null;
  const partners = system ? partnersOf(system.id, linkCounts) : [];
  const name = (id: string) => data.systems.find((item) => item.id === id)?.name ?? id;
  const journeysThrough = system
    ? data.journeys.filter((journey) => views.some((view) => view.id === journey.id && (view.steps.some((step) => step.lane === system.id) || view.integrations.some((call) => [call.from, call.to, call.via].includes(system.id)))))
    : [];
  const domain = system ? data.domains.find((item) => item.id === system.domain) : null;
  const group = domain?.groups.find((item) => item.id === system?.group);

  return (
    <>
      <div className="cl-head">
        <div>
          <h1>SMB architecture</h1>
          <p className="cl-lede">
            <strong>{data.systems.length} systems</strong> in {domains} TM Forum domains, joined by the integration layer. <strong>{recorded} integrations</strong> across {data.journeys.length} modelled journeys. {data.status === "draft" ? "A draft" : "Published"}, built only from {data.sources.map((source) => source.short).join(" and ")}.
          </p>
        </div>
        <div className="cl-head-actions">
          <label className="cl-visually-hidden" htmlFor="cl-find" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Find a system
          </label>
          <input
            id="cl-find"
            className="cl-field"
            list="cl-systems"
            placeholder="Find a system, e.g. CWOM"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              const match = data.systems.find((item) => item.name.toLowerCase() === event.target.value.toLowerCase());
              if (match) select(match.id);
            }}
          />
          <datalist id="cl-systems">
            {data.systems.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </div>
      </div>
      <AreaTabs current="landscape" />
      <div className="cl-toolbar">
        <div className="cl-chips" role="group" aria-label="Show on the map">
          <button type="button" className="cl-chip" aria-pressed={showLines} onClick={() => setShowLines((value) => !value)}>
            Integrations <small>{linkCounts.size} links</small>
          </button>
          {selected && (
            <button type="button" className="cl-chip" onClick={() => select(null)}>
              Clear selection
            </button>
          )}
        </div>
        <div className="cl-legend" aria-label="Legend">
          {LEGEND.map((item) => (
            <span key={item.id}>
              <i style={{ background: `var(--cl-${item.id})` }} />
              {item.label}
            </span>
          ))}
          <span>
            <i className="ext" />
            External
          </span>
          <span>
            <i style={{ background: "var(--cl-ochre)" }} />
            Placement proposed
          </span>
        </div>
      </div>
      <div className="cl-board">
        <Poster layout={layout} linkCounts={showLines ? linkCounts : new Map()} counts={counts} selected={selected} onSelect={(id) => select(id)} label="SMB architecture map" />
        <aside className="cl-insp" aria-live="polite">
          {system ? (
            <>
              <h2>{system.name}</h2>
              <p className="cl-sub">
                {domain?.name}
                {group ? ` · ${group.name}` : ""}
                {system.owner ? ` · ${system.owner}` : ""}
                {system.external ? " · external" : ""}
              </p>
              <p>{system.function || "Its sources don't describe what it does."}</p>
              <div style={{ marginTop: 10 }}>
                <EvidenceTag evidence={system.evidence} />
              </div>
              {system.proposedMove && (
                <p style={{ marginTop: 8 }}>
                  <strong>Placement proposed.</strong> Its source places it in {system.proposedMove.from}. {system.proposedMove.reason}
                </p>
              )}
              <h3>Integrations</h3>
              <div className="cl-kv">
                <span>Calls, is called or carries</span>
                <b>{counts.get(system.id) ?? 0}</b>
              </div>
              <div className="cl-kv">
                <span>Linked systems</span>
                <b>{partners.length}</b>
              </div>
              <div className="cl-kv">
                <span>Journeys through it</span>
                <b>{journeysThrough.length || "None modelled"}</b>
              </div>
              {journeysThrough.map((journey) => (
                <div className="cl-kv" key={journey.id} style={{ paddingLeft: 12 }}>
                  <Link to={`${LAB}/journeys/${journey.id}`}>{journey.name}</Link>
                  <b>{journey.channels.length ? `${journey.channels.length} channels` : "shared"}</b>
                </div>
              ))}
              {system.roadmap && (
                <div className="cl-kv">
                  <span>Roadmap</span>
                  <b>{system.roadmap}</b>
                </div>
              )}
              {partners.length > 0 && (
                <>
                  <h3>Linked systems</h3>
                  {partners.map((partner) => (
                    <div className="cl-kv" key={partner.id}>
                      <button type="button" onClick={() => select(partner.id)}>
                        {name(partner.id)}
                      </button>
                      <b>{partner.count}</b>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <h2>How it fits together</h2>
              <p className="cl-sub">Pick a system on the map to see what it talks to.</p>
              <h3>Busiest systems</h3>
              <div className="cl-rank">
                {busiest.map(([id, count]) => (
                  <div key={id} style={{ display: "contents" }}>
                    <div className="cl-kv" style={{ borderTop: 0, minHeight: 26 }}>
                      <button type="button" onClick={() => select(id)}>
                        {name(id)}
                      </button>
                    </div>
                    <b style={{ fontStretch: "78%", fontVariantNumeric: "tabular-nums" }}>{count}</b>
                    <span className="cl-bar" aria-hidden="true">
                      <i style={{ width: `${(count / top) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
              <h3>Still open</h3>
              <div className="cl-kv">
                <span>Placements proposed</span>
                <b>{data.systems.filter((item) => item.proposedMove).length}</b>
              </div>
              <div className="cl-kv">
                <span>Findings to decide</span>
                <b>{data.findings.length}</b>
              </div>
            </>
          )}
        </aside>
      </div>
      <section className="cl-products" aria-labelledby="cl-products-h">
        <h2 id="cl-products-h">Products on this architecture</h2>
        {data.offerings.map((offering) => {
          const touched = new Set(views.filter((view) => view.offeringId === offering.id).flatMap((view) => [...view.steps.map((step) => step.lane), ...view.integrations.flatMap((call) => [call.from, call.to, call.via])]).filter((id): id is string => Boolean(id) && data.systems.some((item) => item.id === id)));
          return (
            <Link key={offering.id} className="cl-prod" to={`${LAB}/products/${offering.id}`}>
              <span className="cl-mono" aria-hidden="true">
                {offering.name
                  .split(/\s+/)
                  .map((word) => word[0])
                  .join("")
                  .slice(0, 3)}
              </span>
              <strong>{offering.name}</strong>
              <span>{offering.summary.split(". ")[0]}.</span>
              <span>
                {data.journeys.filter((journey) => journey.offeringId === offering.id).length} journeys · {touched.size} systems · {offering.orderTypes.length} order types
              </span>
            </Link>
          );
        })}
        <div className="cl-prod empty">
          <span className="cl-mono" aria-hidden="true">+</span>
          <strong>Next product</strong>
          <span>Not modelled yet. The model is generic: any product's offering, plans and journeys fit.</span>
        </div>
      </section>
    </>
  );
}
