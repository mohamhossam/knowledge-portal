/**
 * The Systems page: how SMB systems relate, in a way that holds for any
 * product. Two views. Interfaces (the default): who calls whom, each distinct
 * interface counted once whatever journey or product uses it. Capabilities
 * (`?view=capabilities`): which systems deliver which kind of bundle part
 * across every product. Its header is the catalogue's soft band: the title,
 * the view and the search, then the figures that frame the view and where its
 * facts come from. Picking a system opens the same details drawer as the
 * Landscape. How much one product uses each system is that product's
 * Architecture tab, not this page.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { CapabilityMatrix } from "./CapabilityMatrix";
import { PART_KINDS, systemParts } from "./capabilities";
import { AreaTabs } from "./CatalogueLab";
import { IntegrationMatrix } from "./IntegrationMatrix";
import { useLabData } from "./labData";
import { plural, useTitle } from "./labUtil";
import { useLinkCounts, useSystemParam } from "./systemHooks";
import { FindSystem, SystemDrawer } from "./SystemTools";

export function SystemsPage() {
  const data = useLabData();
  useTitle("Systems");
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "capabilities" ? "capabilities" : "interfaces";
  const setView = (next: "interfaces" | "capabilities") => {
    const query = new URLSearchParams(params);
    if (next === "capabilities") query.set("view", next);
    else query.delete("view");
    setParams(query, { replace: true });
  };
  const [selected, select] = useSystemParam();
  const { interfaces, linkCounts } = useLinkCounts(data);
  const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
  const figures = useMemo(() => {
    const partners = new Map<string, number>();
    for (const key of linkCounts.keys()) for (const id of key.split("~")) partners.set(id, (partners.get(id) ?? 0) + 1);
    const most = [...partners.entries()].sort((a, b) => b[1] - a[1])[0];
    return { linked: partners.size, pairs: linkCounts.size, interfaces: interfaces.length, layered: interfaces.filter((call) => call.via).length, most };
  }, [linkCounts, interfaces]);
  const delivery = useMemo(() => {
    const parts = systemParts(data);
    const kinds = new Set([...parts.values()].flatMap((byKind) => [...byKind.keys()]));
    return { systems: parts.size, kinds: PART_KINDS.filter((kind) => kinds.has(kind.id)).length, components: data.offerings.reduce((sum, offering) => sum + offering.components.length, 0) };
  }, [data]);

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
            <p className="lx-lede">{view === "interfaces" ? "Who calls whom across SMB systems, for any product" : "Which systems deliver which kind of bundle part, across every product"}</p>
          </div>
          <div className="lx-tools">
            <div className="cl-seg" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "interfaces"} onClick={() => setView("interfaces")}>
                Interfaces
              </button>
              <button type="button" aria-pressed={view === "capabilities"} onClick={() => setView("capabilities")}>
                Capabilities
              </button>
            </div>
            <FindSystem data={data} onFound={select} />
          </div>
        </div>
        <div className="sy-row">
          {view === "interfaces" ? (
            <dl className="sy-figures">
              <div>
                <dt>Systems linked</dt>
                <dd>
                  {figures.linked} <small>of {data.systems.length}</small>
                </dd>
              </div>
              <div>
                <dt>Distinct interfaces</dt>
                <dd>{figures.interfaces}</dd>
              </div>
              <div>
                <dt>Linked pairs</dt>
                <dd>{figures.pairs}</dd>
              </div>
              <div>
                <dt>Through the integration layer</dt>
                <dd>{figures.layered}</dd>
              </div>
              {figures.most && (
                <div>
                  <dt>Most connected</dt>
                  <dd translate="no">
                    {name(figures.most[0])} <small>talks to {plural(figures.most[1], "system")}</small>
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <dl className="sy-figures">
              <div>
                <dt>Systems delivering parts</dt>
                <dd>{delivery.systems}</dd>
              </div>
              <div>
                <dt>Kinds of part</dt>
                <dd>{delivery.kinds}</dd>
              </div>
              <div>
                <dt>Components</dt>
                <dd>
                  {delivery.components} <small>in {plural(data.offerings.length, "product")}</small>
                </dd>
              </div>
            </dl>
          )}
          <p className="sy-source">
            {view === "interfaces"
              ? "Read from the modelled journeys, each interface once, whatever uses it. The catalogue has no interface list of its own yet."
              : "Read from the products' components, grouped by what each does for the customer: this catalogue's reading."}
          </p>
        </div>
      </header>

      <div className="lx-board">
        {view === "interfaces" ? <IntegrationMatrix data={data} interfaces={interfaces} selected={selected} onSelect={select} /> : <CapabilityMatrix data={data} selected={selected} onSelect={select} />}
        <SystemDrawer data={data} systemId={selected} linkCounts={linkCounts} onSelect={select} />
      </div>
    </>
  );
}
