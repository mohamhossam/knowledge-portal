/**
 * Mock-up 1, the Landscape: the SMB architecture as one picture. Each TAM
 * layer is a calm band of its groups and systems, hung from the integration
 * bus. The page is about the architecture only, so it holds for any product
 * and version. It fits one screen. The header is a soft band: the title with
 * a one-line subtitle, the search and a Key, then a strip of the layers in
 * their own colours that shows one layer at a time (`?layer=`) and doubles as
 * the colour legend. The map takes the full width, with a drawer over its
 * right side only while a system is picked. Every integration, pair by pair,
 * is on the Systems page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AreaTabs } from "./CatalogueLab";
import { ArchitectureMap, LayerIcon } from "./ArchitectureMap";
import { useLabData } from "./labData";
import { useTitle } from "./labUtil";
import { domainRank } from "./posterModel";
import { useLinkCounts, useSystemParam } from "./systemHooks";
import { FindSystem, SystemDrawer } from "./SystemTools";

export function LandscapeHero() {
  const data = useLabData();
  useTitle("SMB architecture");
  const [params, setParams] = useSearchParams();
  const [selected, select] = useSystemParam();
  const [showLinks, setShowLinks] = useState(false);
  const { linkCounts } = useLinkCounts(data);
  // The layers that hold systems, in map order.
  const layers = useMemo(() => data.domains.filter((domain) => data.systems.some((system) => system.domain === domain.id)).sort((a, b) => domainRank(a.id) - domainRank(b.id)), [data]);
  const wanted = params.get("layer");
  const focus = layers.some((layer) => layer.id === wanted) ? wanted : null;
  const showLayer = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("layer", id);
    else next.delete("layer");
    setParams(next, { replace: true });
  };
  // The Key opens as a small menu and closes on a click anywhere else.
  const keyMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (keyMenu.current?.open && !keyMenu.current.contains(event.target as Node)) keyMenu.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  return (
    <>
      <AreaTabs current="landscape" />
      <header className="lx-head lx-band">
        <div className="lx-band-row">
          <span className="lx-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="18" height="18">
              <path d="M8 2 14 5 8 8 2 5z" />
              <path d="m2 8 6 3 6-3" />
              <path d="m2 11 6 3 6-3" />
            </svg>
          </span>
          <div className="lx-title">
            <h1 id="cl-hero-h">SMB architecture</h1>
            <p className="lx-lede">TM Forum application map of every SMB system, by layer and group</p>
          </div>
          <div className="lx-tools">
            <FindSystem data={data} onFound={select} />
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
                <button type="button" className="cl-chip" aria-pressed={showLinks} onClick={() => setShowLinks((value) => !value)}>
                  Show every link
                </button>
              </div>
            </details>
          </div>
        </div>
        <div className="lx-layers" role="group" aria-labelledby="lx-layers-h">
          <span id="lx-layers-h" className="lx-layers-label">
            Layers
          </span>
          <button type="button" className="lx-layer-all" aria-pressed={focus === null} onClick={() => showLayer(null)}>
            All layers
          </button>
          {layers.map((layer) => (
            <button key={layer.id} type="button" className={`lx-layer tone--${layer.id}`} aria-pressed={focus === layer.id} onClick={() => showLayer(focus === layer.id ? null : layer.id)}>
              <LayerIcon id={layer.id} />
              {layer.name}
            </button>
          ))}
        </div>
      </header>

      <div className="lx-board">
        <ArchitectureMap data={data} label="SMB architecture layers" linkCounts={linkCounts} selected={selected} onSelect={select} showLinks={showLinks} focusLayer={focus} compact />
        <SystemDrawer data={data} systemId={selected} linkCounts={linkCounts} onSelect={select} />
      </div>
    </>
  );
}
