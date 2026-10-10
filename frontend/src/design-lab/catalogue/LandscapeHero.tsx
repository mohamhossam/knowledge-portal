/**
 * Mock-up 1, the Landscape: the SMB architecture in three views of the same
 * estate. Layers (the default) draws each TAM layer as a calm band of its
 * groups and systems, hung from the integration bus; the TAM wheel puts the
 * domains round the integration layer with the calls bundled through it;
 * Matrix reads the links by row and column. The page is about the
 * architecture only, so it holds for any product and version. It fits one
 * screen: a one-line header with the controls and a Key, the map at full
 * width, and a drawer over its right side only while a system is picked.
 */
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AreaTabs } from "./CatalogueLab";
import { ArchitectureMap } from "./ArchitectureMap";
import { IntegrationMatrix } from "./IntegrationMatrix";
import { journeyHref, LAB, useLabData } from "./labData";
import { plural, useTitle } from "./labUtil";
import { allIntegrations, allViews, degrees as degreesOf, links, partnersOf, reachOf } from "./posterModel";
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
  const reach = useMemo(() => new Map(data.offerings.map((offering) => [offering.id, reachOf(data, offering.id)])), [data]);
  const systemById = useMemo(() => new Map(data.systems.map((system) => [system.id, system])), [data]);
  const layers = useMemo(() => data.domains.map((domain) => ({ domain, systems: data.systems.filter((system) => system.domain === domain.id) })).filter((item) => item.systems.length), [data]);
  // The Key opens as a small menu and closes on a click anywhere else.
  const keyMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (keyMenu.current?.open && !keyMenu.current.contains(event.target as Node)) keyMenu.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

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
  // Which products use the picked system, how centrally, and through which of their journeys.
  const productUse = system
    ? data.offerings
        .map((offering) => {
          const set = reach.get(offering.id)?.get(system.id);
          const total = data.journeys.filter((journey) => journey.offeringId === offering.id).length;
          return { offering, count: set?.size ?? 0, total, core: (set?.size ?? 0) >= Math.max(2, Math.ceil(total / 2)), journeys: journeysThrough.filter((journey) => journey.offeringId === offering.id) };
        })
        .filter((item) => item.count > 0)
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
      <header className="lx-head">
        <div className="lx-title">
          <h1 id="cl-hero-h">SMB architecture</h1>
          <p className="lx-lede">A TM Forum application map: every SMB system by layer and group, joined by the integration layer.</p>
        </div>
        <div className="lx-tools">
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
          <form className="cl-find lx-find" role="search" onSubmit={find}>
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
              placeholder="Find a system…"
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
            <button type="submit" className="ds-visually-hidden">
              Find
            </button>
          </form>
          <details ref={keyMenu} className="lx-key">
            <summary className="cl-btn">Key</summary>
            <div className="lx-key-panel" role="group" aria-label="Key">
              <p>
                <i className="ext" aria-hidden="true" />
                External system
              </p>
              <p>
                <i className="flag" aria-hidden="true" />
                Placement proposed
              </p>
              <p>
                <i className="sel" aria-hidden="true" />
                Selected
              </p>
              <p>
                <i className="lnk" aria-hidden="true" />
                Linked to the selected system
              </p>
              {view === "layers" && (
                <button type="button" className="cl-chip" aria-pressed={showLinks} onClick={() => setShowLinks((value) => !value)}>
                  Show every link
                </button>
              )}
            </div>
          </details>
        </div>
        <p className="cl-status lx-status" role="status">
          {notFound ? `No system called “${notFound}”.` : ""}
        </p>
      </header>

      <div className="lx-board">
        <p className="ds-visually-hidden" aria-live="polite">
          {system ? `${system.name} selected: ${plural(partners.length, "linked system")}.` : ""}
        </p>
        {view === "wheel" ? (
          <TamWheel data={data} label="SMB architecture map" linkCounts={linkCounts} selected={selected} onSelect={select} focusDomain={focusLayer} onFocusDomain={setFocusLayer} />
        ) : view === "layers" ? (
          <ArchitectureMap data={data} label="SMB architecture layers" linkCounts={linkCounts} selected={selected} onSelect={select} showLinks={showLinks} focusLayer={focusLayer} compact />
        ) : (
          <IntegrationMatrix data={data} degrees={degrees} linkCounts={linkCounts} selected={selected} onSelect={select} />
        )}
        {system && (
          <aside
            className="lx-drawer"
            aria-labelledby="cl-insp-h"
            onKeyDown={(event) => {
              if (event.key === "Escape") select(null);
            }}
          >
            <div className="cl-insp-head">
              <h2 id="cl-insp-h" translate="no">
                {system.name}
              </h2>
              <button type="button" className="cl-close" onClick={() => select(null)} aria-label={`Close the details of ${system.name}`}>
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
            {partnerLayers.length > 0 && (
              <>
                <h3>Linked systems</h3>
                <p className="lx-pills">
                  {partnerLayers.flatMap(({ items }) =>
                    items.map((item) =>
                      item ? (
                        <button key={item.id} type="button" className="cl-pill" onClick={() => select(item.id)} translate="no">
                          {item.name}
                        </button>
                      ) : null,
                    ),
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
        )}
      </div>

    </>
  );
}
