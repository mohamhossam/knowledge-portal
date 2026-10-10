/**
 * Mock-up 1, the Landscape hero: the SMB architecture in three views of the
 * same estate. Layers (the default) draws each TAM layer as a block with its
 * groups and system cards, hung from the integration bus; the TAM wheel puts
 * the domains round the integration layer with the calls bundled through it;
 * Matrix reads the links by row and column. The side panel is a domain navigator
 * at rest and the picked system's card when one is chosen. No product bar: a
 * product's footprint lives on its own Architecture tab.
 */
import { type FormEvent, type ReactNode, useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AreaTabs, EvidenceTag } from "./CatalogueLab";
import { ArchitectureMap } from "./ArchitectureMap";
import { IntegrationMatrix } from "./IntegrationMatrix";
import { journeyHref, LAB, useLabData } from "./labData";
import { firstSentence, plural, useTitle } from "./labUtil";
import { allIntegrations, allViews, degrees as degreesOf, links, partnersOf } from "./posterModel";
import { TamWheel } from "./TamWheel";

const VIEW_ICONS = {
  layers: <path d="M8 2 14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3" />,
  wheel: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="1.8" />
      <path d="M8 2v4.2M8 9.8V14M2 8h4.2M9.8 8H14" />
    </>
  ),
  matrix: <path d="M2.5 2.5h11v11h-11zM2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </>
  ),
};

function ViewIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="cl-view-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {children}
    </svg>
  );
}

export function LandscapeHero() {
  const data = useLabData();
  useTitle("SMB architecture");
  const [params, setParams] = useSearchParams();
  const selected = params.get("system");
  const wanted = params.get("view");
  const view = wanted === "matrix" || wanted === "wheel" ? wanted : "layers";
  const [showLinks, setShowLinks] = useState(false);
  const [focusLayer, setFocusLayer] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState<string | null>(null);

  const integrations = useMemo(() => allIntegrations(data), [data]);
  const linkCounts = useMemo(() => links(data, integrations), [data, integrations]);
  const degrees = useMemo(() => degreesOf(integrations), [integrations]);
  const views = useMemo(() => allViews(data), [data]);
  const systemById = useMemo(() => new Map(data.systems.map((system) => [system.id, system])), [data]);
  const layers = useMemo(() => data.domains.map((domain) => ({ domain, systems: data.systems.filter((system) => system.domain === domain.id) })).filter((item) => item.systems.length), [data]);
  const ORDER = ["market-sales", "product", "customer", "integration", "service", "resource", "engaged-party", "enterprise"];
  // The domains in the map's reading order; any other domain comes last.
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  const composition = [...layers].sort((a, b) => rank(a.domain.id) - rank(b.domain.id));
  const groups = new Set(data.systems.map((system) => `${system.domain}/${system.group}`)).size;

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
  const journeysThrough = system
    ? data.journeys.filter((journey) => views.some((item) => item.id === journey.id && (item.steps.some((step) => step.lane === system.id) || item.integrations.some((call) => [call.from, call.to, call.via].includes(system.id)))))
    : [];
  const steps = system ? new Set(views.flatMap((item) => item.steps.filter((step) => step.kind === "task" && step.lane === system.id).map((step) => `${item.id}:${step.id}`))).size : 0;
  const domain = system ? data.domains.find((item) => item.id === system.domain) : null;
  const group = domain?.groups.find((item) => item.id === system?.group);
  // The linked systems, by the layer they sit in, in map order.
  const partnerLayers = layers
    .map(({ domain: layer }) => ({ layer, items: partners.map((item) => systemById.get(item.id)).filter((item) => item?.domain === layer.id) }))
    .filter((item) => item.items.length);

  return (
    <>
      <AreaTabs current="landscape" />
      <section className="cl-hero" aria-labelledby="cl-hero-h">
        <div className="cl-hero-text">
          <p className="cl-eyebrow">TM Forum application map · SMB</p>
          <h1 id="cl-hero-h">SMB architecture</h1>
          <p className="cl-hero-lede">Every SMB system by layer and functional group, joined by the integration layer that carries their calls.</p>
          <ul className="cl-hero-facts" aria-label="About this catalogue">
            <li className={`cl-status cl-status--${data.status}`}>
              <i aria-hidden="true" />
              {data.status === "draft" ? "Draft" : "Published"} · revision {data.revision}
            </li>
            {data.sources.map((source) => (
              <li key={source.id} className="cl-source" title={source.title}>
                {source.short}
              </li>
            ))}
          </ul>
        </div>
        <div className="cl-hero-visual">
          <p className="cl-estate-head">
            <strong>{data.systems.length}</strong>
            <span>
              systems across {layers.length} domains, {groups} functional groups
            </span>
          </p>
          <div className="cl-estate-bar" role="img" aria-label={`Systems by domain: ${composition.map((item) => `${item.domain.name} ${item.systems.length}`).join(", ")}`}>
            {composition.map((item) => (
              <span key={item.domain.id} className={`cl-estate-seg bar--${item.domain.id}`} style={{ flexGrow: item.systems.length }} title={`${item.domain.name}: ${plural(item.systems.length, "system")}`} />
            ))}
          </div>
          <ul className="cl-estate-key" aria-hidden="true">
            {composition.map((item) => (
              <li key={item.domain.id} className={`bar--${item.domain.id}`}>
                <i />
                <span>{item.domain.name}</span>
                <b>{item.systems.length}</b>
              </li>
            ))}
          </ul>
          <dl className="cl-hero-stats">
            <div>
              <dt>External</dt>
              <dd>{data.systems.filter((item) => item.external).length}</dd>
            </div>
            <div>
              <dt>Journeys</dt>
              <dd>{data.journeys.length}</dd>
            </div>
            <div>
              <dt>Products</dt>
              <dd>{data.offerings.length}</dd>
            </div>
            <div>
              <dt>Findings open</dt>
              <dd>{data.findings.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="cl-toolbar">
        <div className="cl-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "layers"} onClick={() => setParam("view", null)}>
            <ViewIcon>{VIEW_ICONS.layers}</ViewIcon>
            Layers
          </button>
          <button type="button" aria-pressed={view === "wheel"} onClick={() => setParam("view", "wheel")}>
            <ViewIcon>{VIEW_ICONS.wheel}</ViewIcon>
            Wheel
          </button>
          <button type="button" aria-pressed={view === "matrix"} onClick={() => setParam("view", "matrix")}>
            <ViewIcon>{VIEW_ICONS.matrix}</ViewIcon>
            Matrix
          </button>
        </div>
        {view === "layers" && (
          <button type="button" className="cl-chip" aria-pressed={showLinks} onClick={() => setShowLinks((value) => !value)}>
            Show every link
          </button>
        )}
        <form className="cl-find" role="search" onSubmit={find}>
          <ViewIcon>{VIEW_ICONS.search}</ViewIcon>
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
          <small className="cl-legend-label">Key</small>
          <span>
            <i className="ext" />
            External
          </span>
          <span>
            <i className="flag" />
            Placement proposed
          </span>
          <span>
            <i className="sel" />
            Selected
          </span>
          <span>
            <i className="lnk" />
            Linked
          </span>
        </div>
      </div>

      <div className="cl-board">
        <div className="cl-board-main">
          {view === "wheel" ? (
            <TamWheel data={data} label="SMB architecture map" linkCounts={linkCounts} selected={selected} onSelect={select} focusDomain={focusLayer} onFocusDomain={setFocusLayer} />
          ) : view === "layers" ? (
            <ArchitectureMap data={data} label="SMB architecture layers" linkCounts={linkCounts} selected={selected} onSelect={select} showLinks={showLinks} focusLayer={focusLayer} />
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
              {partnerLayers.length > 0 && (
                <>
                  <h3>Linked systems</h3>
                  <ul className="cl-linked">
                    {partnerLayers.map(({ layer, items }) => (
                      <li key={layer.id} className={`cl-linked--${layer.id}`}>
                        <span>{layer.name}</span>
                        <div>
                          {items.map((item) =>
                            item ? (
                              <button key={item.id} type="button" className="cl-pill" onClick={() => select(item.id)} translate="no">
                                {item.name}
                              </button>
                            ) : null,
                          )}
                        </div>
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
              <h2 id="cl-insp-h">Domains</h2>
              <p className="cl-body">Point at a system to see its calls; pick it to keep them. Pick a domain to bring it forward.</p>
              <ul className="cl-layers">
                {layers.map(({ domain: layer, systems }) => (
                  <li key={layer.id}>
                    <button type="button" className={`cl-layer cl-layer--${layer.id}`} aria-pressed={focusLayer === layer.id} onClick={() => setFocusLayer((value) => (value === layer.id ? null : layer.id))}>
                      <i aria-hidden="true" />
                      <strong>{layer.name}</strong>
                      <b>{systems.length}</b>
                      <span>{layer.groups.filter((item) => systems.some((s) => s.group === item.id)).map((item) => item.name).join(" · ")}</span>
                    </button>
                    {focusLayer === layer.id && (
                      <div className={`cl-domain-systems cl-linked--${layer.id}`}>
                        {systems.map((item) => (
                          <button key={item.id} type="button" className="cl-pill" onClick={() => select(item.id)} translate="no">
                            {item.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
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
                <Link className="cl-prod" to={`${LAB}/products/${offering.id}/architecture`}>
                  <strong>{offering.name}</strong>
                  <span>{firstSentence(offering.summary)}</span>
                  <small>
                    Reaches {touched.size} of {data.systems.length} systems · {plural(data.journeys.filter((journey) => journey.offeringId === offering.id).length, "journey")} · see its footprint
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
