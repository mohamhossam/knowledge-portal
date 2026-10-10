/**
 * Mock-up 1, the Landscape: the SMB architecture as one picture. Each TAM
 * layer is a calm band of its groups and systems, hung from the integration
 * bus. The page is about the architecture only, so it holds for any product
 * and version. It fits one screen: a one-line header with the search and a
 * Key, the map at full width, and a drawer over its right side only while a
 * system is picked. Every integration, pair by pair, is on the Systems page.
 */
import { useEffect, useRef, useState } from "react";

import { AreaTabs } from "./CatalogueLab";
import { ArchitectureMap } from "./ArchitectureMap";
import { useLabData } from "./labData";
import { useTitle } from "./labUtil";
import { useLinkCounts, useSystemParam } from "./systemHooks";
import { FindSystem, SystemDrawer } from "./SystemTools";

export function LandscapeHero() {
  const data = useLabData();
  useTitle("SMB architecture");
  const [selected, select] = useSystemParam();
  const [showLinks, setShowLinks] = useState(false);
  const { linkCounts } = useLinkCounts(data);
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
      <header className="lx-head">
        <div className="lx-title">
          <h1 id="cl-hero-h">SMB architecture</h1>
          <p className="lx-lede">A TM Forum application map: every SMB system by layer and group, joined by the integration layer.</p>
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
      </header>

      <div className="lx-board">
        <ArchitectureMap data={data} label="SMB architecture layers" linkCounts={linkCounts} selected={selected} onSelect={select} showLinks={showLinks} focusLayer={null} compact />
        <SystemDrawer data={data} systemId={selected} linkCounts={linkCounts} onSelect={select} />
      </div>
    </>
  );
}
