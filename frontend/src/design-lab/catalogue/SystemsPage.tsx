/**
 * The Systems page: every integration between SMB systems, read by row and
 * column. Where the Landscape draws where systems sit, this page answers who
 * talks to whom, exactly, for all of them at once. Its header is the
 * catalogue's soft band: the title and the search, then the figures that
 * frame the matrix (systems linked, pairs, calls, the busiest pair and the
 * busiest system). Picking a system opens the same details drawer as the
 * Landscape. Like the Landscape, it holds for any product and version.
 */
import { useMemo } from "react";

import { AreaTabs } from "./CatalogueLab";
import { IntegrationMatrix } from "./IntegrationMatrix";
import { useLabData } from "./labData";
import { useTitle } from "./labUtil";
import { degrees as degreesOf } from "./posterModel";
import { useLinkCounts, useSystemParam } from "./systemHooks";
import { FindSystem, SystemDrawer } from "./SystemTools";

export function SystemsPage() {
  const data = useLabData();
  useTitle("Systems");
  const [selected, select] = useSystemParam();
  const { integrations, linkCounts } = useLinkCounts(data);
  const degrees = useMemo(() => degreesOf(integrations), [integrations]);
  const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
  const figures = useMemo(() => {
    const linked = new Set([...linkCounts.keys()].flatMap((key) => key.split("~")));
    const calls = [...linkCounts.values()].reduce((sum, count) => sum + count, 0);
    const pair = [...linkCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const hub = [...degrees.entries()].sort((a, b) => b[1].total - a[1].total)[0];
    return { linked: linked.size, pairs: linkCounts.size, calls, pair, hub };
  }, [linkCounts, degrees]);

  return (
    <>
      <AreaTabs current="systems" />
      <header className="lx-head lx-band">
        <div className="lx-band-row">
          <span className="lx-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="18" height="18">
              <path d="M2.5 2.5h11v11h-11zM2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11" />
            </svg>
          </span>
          <div className="lx-title">
            <h1>Systems</h1>
            <p className="lx-lede">Every integration between SMB systems, by row and column, in layer order</p>
          </div>
          <div className="lx-tools">
            <FindSystem data={data} onFound={select} />
          </div>
        </div>
        <dl className="sy-figures">
          <div>
            <dt>Systems linked</dt>
            <dd>
              {figures.linked} <small>of {data.systems.length}</small>
            </dd>
          </div>
          <div>
            <dt>Linked pairs</dt>
            <dd>{figures.pairs}</dd>
          </div>
          <div>
            <dt>Calls</dt>
            <dd>{figures.calls}</dd>
          </div>
          {figures.pair && (
            <div>
              <dt>Busiest pair</dt>
              <dd translate="no">
                {figures.pair[0].split("~").map(name).join(" ↔ ")} <small>{figures.pair[1]}</small>
              </dd>
            </div>
          )}
          {figures.hub && (
            <div>
              <dt>Busiest system</dt>
              <dd translate="no">
                {name(figures.hub[0])} <small>{figures.hub[1].total}</small>
              </dd>
            </div>
          )}
        </dl>
      </header>

      <div className="lx-board">
        <IntegrationMatrix data={data} degrees={degrees} linkCounts={linkCounts} selected={selected} onSelect={select} />
        <SystemDrawer data={data} systemId={selected} linkCounts={linkCounts} onSelect={select} />
      </div>
    </>
  );
}
