/**
 * The Systems page: every integration between SMB systems, read by row and
 * column. Where the Landscape draws where systems sit, this page answers who
 * talks to whom, exactly, for all of them at once. Picking a system opens the
 * same details drawer as the Landscape. Like the Landscape, it holds for any
 * product and version.
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

  return (
    <>
      <AreaTabs current="systems" />
      <header className="lx-head">
        <div className="lx-title">
          <h1>Systems</h1>
          <p className="lx-lede">Every integration between SMB systems, read by row and column, in layer order.</p>
        </div>
        <div className="lx-tools">
          <FindSystem data={data} onFound={select} />
        </div>
      </header>

      <div className="lx-board">
        <IntegrationMatrix data={data} degrees={degrees} linkCounts={linkCounts} selected={selected} onSelect={select} />
        <SystemDrawer data={data} systemId={selected} linkCounts={linkCounts} onSelect={select} />
      </div>
    </>
  );
}
