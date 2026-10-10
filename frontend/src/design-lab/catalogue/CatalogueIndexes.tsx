/**
 * The catalogue's two indexes, built for any number of products.
 *
 * Products: every offering grouped under its place in the portfolio (business
 * unit › line of business › segment › family), each a card with its size, a
 * reach ring (systems reached out of the map) and its footprint by layer as
 * dot meters, the same language as the product's Architecture tab.
 *
 * Journeys: a coverage matrix, order types down (grouped by the customer's
 * stage) and products across; a cell is a modelled journey, an order type the
 * product offers but nobody has modelled yet, or one it doesn't offer.
 */
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { journeyView } from "../../architecture/adapter";
import type { Offering, PortfolioNode } from "../../architecture/model";
import { AreaTabs } from "./CatalogueLab";
import { journeyHref, LAB, useLabData } from "./labData";
import { firstSentence, plural, useTitle } from "./labUtil";
import { domainRank, reachOf } from "./posterModel";
import { STAGES, stageOfCode } from "./stages";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="cl-view-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {children}
    </svg>
  );
}

const PRODUCT_ICON = <path d="M2.5 4.5 8 2l5.5 2.5v7L8 14l-5.5-2.5zM2.5 4.5 8 7l5.5-2.5M8 7v7" />;

/** The portfolio path from the top level down to a node. */
function pathTo(nodes: PortfolioNode[], nodeId: string | null): PortfolioNode[] {
  const path: PortfolioNode[] = [];
  let node = nodes.find((item) => item.id === nodeId);
  while (node) {
    path.unshift(node);
    const parent = node.parentId;
    node = parent ? nodes.find((item) => item.id === parent) : undefined;
  }
  return path;
}

/** A ring for "reached out of total", one maroon arc on a sand track: maroon means this product's footprint, as on its Architecture tab. */
function ReachRing({ reached, total }: { reached: number; total: number }) {
  const r = 34;
  const length = 2 * Math.PI * r;
  const share = total ? reached / total : 0;
  return (
    <svg className="cl-ring" viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">
      <circle className="track" cx="42" cy="42" r={r} />
      <circle className="arc" cx="42" cy="42" r={r} strokeDasharray={`${(share * length).toFixed(1)} ${length.toFixed(1)}`} transform="rotate(-90 42 42)" />
      <text x="42" y="40" textAnchor="middle" className="num">
        {Math.round(share * 100)}%
      </text>
      <text x="42" y="55" textAnchor="middle" className="cap">
        of the map
      </text>
    </svg>
  );
}

const CARD_LINK_ICONS = {
  overview: <path d="M3 3.5h10M3 8h10M3 12.5h6" />,
  architecture: <path d="M8 2 14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3" />,
  journeys: (
    <>
      <circle cx="3.5" cy="12.5" r="1.5" />
      <circle cx="12.5" cy="3.5" r="1.5" />
      <path d="M5 12.5h4.5a2 2 0 0 0 0-4h-3a2 2 0 0 1 0-4H11" />
    </>
  ),
};

function ProductCard({ offering }: { offering: Offering }) {
  const data = useLabData();
  const reach = useMemo(() => reachOf(data, offering.id), [data, offering.id]);
  const journeys = data.journeys.filter((journey) => journey.offeringId === offering.id);
  const base = `${LAB}/products/${offering.id}`;
  const coreAt = Math.max(2, Math.ceil(journeys.length / 2));
  const core = [...reach.values()].filter((set) => set.size >= coreAt).length;
  // Footprint by layer, in the map's order: how many of each layer's systems the product reaches.
  const layers = data.domains
    .map((domain) => {
      const all = data.systems.filter((system) => system.domain === domain.id);
      return { domain, all, used: all.filter((system) => reach.has(system.id)).length };
    })
    .filter((row) => row.all.length)
    .sort((a, b) => domainRank(a.domain.id) - domainRank(b.domain.id));
  const facts = [
    { label: "Plans", value: offering.plans.length },
    { label: "Components", value: offering.components.length },
    { label: "Order types", value: offering.orderTypes.length },
    { label: "Journeys", value: journeys.length },
  ];
  return (
    <li className="cl-prodcard">
      <div className="cl-prodcard-head">
        <span className="cl-cap-icon">
          <Icon>{PRODUCT_ICON}</Icon>
        </span>
        <div>
          <h3>
            <Link to={base}>{offering.name}</Link>
          </h3>
          <p>{firstSentence(offering.purpose || offering.summary)}</p>
        </div>
      </div>
      <div className="cl-prodcard-body">
        <div className="cl-prodcard-reach">
          <ReachRing reached={reach.size} total={data.systems.length} />
          <p>
            <b>{reach.size}</b> of {data.systems.length} systems
            <span>{core} core to most journeys</span>
          </p>
        </div>
        <dl className="cl-prodcard-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="cl-prodcard-layers">
        <h4>Footprint by layer</h4>
        <ul>
          {layers.map((row) => (
            <li key={row.domain.id}>
              <span className="cl-reach-name">{row.domain.name}</span>
              <span className="cl-reach-dots" aria-hidden="true">
                {row.all.map((system) => (
                  <i key={system.id} className={reach.has(system.id) ? "on" : undefined} title={system.name} />
                ))}
              </span>
              <span className="cl-reach-count">
                {row.used}/{row.all.length}
                <span className="ds-visually-hidden"> systems reached</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <nav className="cl-prodcard-links" aria-label={`${offering.name} pages`}>
        <Link className="cl-btn" to={base}>
          <Icon>{CARD_LINK_ICONS.overview}</Icon>
          Overview
        </Link>
        <Link className="cl-btn" to={`${base}/architecture`}>
          <Icon>{CARD_LINK_ICONS.architecture}</Icon>
          Architecture
        </Link>
        {journeys[0] && (
          <Link className="cl-btn" to={journeyHref(journeys[0].id, journeys[0].channels[0])}>
            <Icon>{CARD_LINK_ICONS.journeys}</Icon>
            Journeys
          </Link>
        )}
      </nav>
    </li>
  );
}

export function ProductsIndex() {
  const data = useLabData();
  useTitle("Products");
  const [query, setQuery] = useState("");
  const text = query.trim().toLowerCase();
  const shown = data.offerings.filter((offering) => !text || offering.name.toLowerCase().includes(text) || offering.summary.toLowerCase().includes(text));
  // One section per portfolio node that holds offerings, in portfolio order.
  const families = [...new Set(shown.map((offering) => offering.nodeId ?? ""))].map((nodeId) => ({
    nodeId,
    path: pathTo(data.portfolio, nodeId || null),
    offerings: shown.filter((offering) => (offering.nodeId ?? "") === nodeId),
  }));
  const familyCount = new Set(data.offerings.map((offering) => offering.nodeId ?? "")).size;
  const orderTypes = new Set(data.offerings.flatMap((offering) => offering.orderTypes.map((type) => type.code))).size;

  return (
    <>
      <AreaTabs current="products" />
      <section className="cl-hero cl-hero--compact" aria-labelledby="cl-products-h">
        <div className="cl-hero-text">
          <p className="cl-eyebrow">Product catalogue</p>
          <h1 id="cl-products-h">Products</h1>
          <p className="cl-hero-lede">Every product offering on the architecture: where it sits in the portfolio, what it is made of, and how much of the estate its journeys reach.</p>
        </div>
        <dl className="cl-hero-stats cl-hero-stats--panel">
          <div>
            <dt>Products</dt>
            <dd>{data.offerings.length}</dd>
          </div>
          <div>
            <dt>Product families</dt>
            <dd>{familyCount}</dd>
          </div>
          <div>
            <dt>Order types</dt>
            <dd>{orderTypes}</dd>
          </div>
          <div>
            <dt>Journeys</dt>
            <dd>{data.journeys.filter((journey) => journey.offeringId).length}</dd>
          </div>
        </dl>
      </section>
      <div className="cl-toolbar">
        <div className="cl-find">
          <Icon>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3.5 3.5" />
          </Icon>
          <label className="ds-visually-hidden" htmlFor="cl-filter-products">
            Filter products
          </label>
          <input id="cl-filter-products" type="search" className="cl-field" placeholder="Filter products by name…" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
        </div>
        <p className="cl-status" role="status">
          {text ? `${plural(shown.length, "product")} match “${query.trim()}”.` : ""}
        </p>
      </div>
      {families.length === 0 && <p className="cl-empty-note">No product matches “{query.trim()}”.</p>}
      {families.map((family) => (
        <section key={family.nodeId} className="cl-family" aria-labelledby={`cl-family-${family.nodeId}`}>
          <header>
            <ol className="cl-family-path" aria-label="Portfolio path">
              {family.path.slice(0, -1).map((node) => (
                <li key={node.id}>
                  <small>{node.level}</small>
                  {node.name}
                </li>
              ))}
            </ol>
            <h2 id={`cl-family-${family.nodeId}`}>
              {family.path.at(-1)?.name ?? "Not placed in the portfolio"} <small>{plural(family.offerings.length, "product")}</small>
            </h2>
          </header>
          <ul className="cl-prodcards">
            {family.offerings.map((offering) => (
              <ProductCard key={offering.id} offering={offering} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function JourneysIndex() {
  const data = useLabData();
  useTitle("Journeys");
  const offerings = data.offerings;
  const names = new Map<string, string>();
  for (const offering of offerings) for (const type of offering.orderTypes) if (!names.has(type.code)) names.set(type.code, type.name);
  const stages = STAGES.map((stage) => ({ ...stage, codes: [...names.keys()].filter((code) => stageOfCode(code) === stage.id) })).filter((stage) => stage.codes.length);
  const shared = data.journeys.filter((journey) => journey.offeringId && !journey.orderType);
  const steps = useMemo(() => {
    const counts = new Map<string, number>();
    for (const journey of data.journeys) counts.set(journey.id, journeyView(data, journey.id, journey.channels[0] ?? null)?.steps.filter((step) => step.kind === "task").length ?? 0);
    return counts;
  }, [data]);
  const modelled = data.journeys.filter((journey) => journey.offeringId).length;
  const offered = offerings.reduce((sum, offering) => sum + offering.orderTypes.length, 0);
  const covered = offerings.reduce((sum, offering) => sum + offering.orderTypes.filter((type) => data.journeys.some((journey) => journey.offeringId === offering.id && journey.orderType === type.code)).length, 0);

  const cell = (offering: Offering, code: string) => {
    const journey = data.journeys.find((item) => item.offeringId === offering.id && item.orderType === code);
    const offers = offering.orderTypes.some((type) => type.code === code);
    if (journey)
      return (
        <Link className="cl-jcell" to={journeyHref(journey.id, journey.channels[0])}>
          <i aria-hidden="true" />
          <span>{plural(steps.get(journey.id) ?? 0, "step")}</span>
          <span className="ds-visually-hidden">: {journey.name} for {offering.name}</span>
        </Link>
      );
    if (offers)
      return (
        <span className="cl-jcell is-gap">
          <i aria-hidden="true" />
          Not modelled
        </span>
      );
    return (
      <span className="cl-jcell is-none">
        <span aria-hidden="true">—</span>
        <span className="ds-visually-hidden">Not offered</span>
      </span>
    );
  };

  return (
    <>
      <AreaTabs current="journeys" />
      <section className="cl-hero cl-hero--compact" aria-labelledby="cl-journeys-h">
        <div className="cl-hero-text">
          <p className="cl-eyebrow">Journey catalogue</p>
          <h1 id="cl-journeys-h">Journeys</h1>
          <p className="cl-hero-lede">Every modelled journey, by the customer&apos;s stage and by product: which order types are drawn end to end, and which are still to model.</p>
        </div>
        <div className="cl-hero-visual">
          <p className="cl-estate-head">
            <strong>
              {covered}/{offered}
            </strong>
            <span>order types modelled as journeys, across {plural(offerings.length, "product")}</span>
          </p>
          <div className="cl-cover-bar" role="img" aria-label={`${covered} of ${offered} order types modelled`}>
            {covered > 0 && <span style={{ flexGrow: covered }} />}
            {offered > covered && <span className="rest" style={{ flexGrow: offered - covered }} />}
          </div>
          <dl className="cl-hero-stats" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
            {stages.map((stage) => (
              <div key={stage.id}>
                <dt>{stage.name}</dt>
                <dd>{stage.codes.length}</dd>
              </div>
            ))}
          </dl>
          <p className="cl-sub">{plural(modelled, "journey")} in all, including shared ones such as order tracking.</p>
        </div>
      </section>
      <div className="cl-legend cl-legend--left" role="group" aria-label="Legend">
        <small className="cl-legend-label">Key</small>
        <span>
          <i className="jk on" />
          Modelled journey
        </span>
        <span>
          <i className="jk gap" />
          Offered, not modelled
        </span>
        <span>
          <i className="jk none" />
          Not offered
        </span>
      </div>
      <div className="cl-tablewrap cl-jmatrix" role="region" aria-label="Journeys by order type and product (scrolls sideways when narrow)" tabIndex={0}>
        <table className="cl-jtable">
          <thead>
            <tr>
              <th scope="col">Order type</th>
              {offerings.map((offering) => (
                <th key={offering.id} scope="col">
                  <Link to={`${LAB}/products/${offering.id}`}>{offering.name}</Link>
                </th>
              ))}
            </tr>
          </thead>
          {stages.map((stage) => (
            <tbody key={stage.id}>
              <tr className="cl-route-stage">
                <th scope="rowgroup" colSpan={offerings.length + 1}>
                  {stage.name} <small>{stage.blurb}</small>
                </th>
              </tr>
              {stage.codes.map((code) => (
                <tr key={code}>
                  <th scope="row">{names.get(code)}</th>
                  {offerings.map((offering) => (
                    <td key={offering.id}>{cell(offering, code)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          {shared.length > 0 && (
            <tbody>
              <tr className="cl-route-stage">
                <th scope="rowgroup" colSpan={offerings.length + 1}>
                  Across order types <small>Journeys that follow any order</small>
                </th>
              </tr>
              {[...new Set(shared.map((journey) => journey.name))].map((name) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {offerings.map((offering) => {
                    const journey = shared.find((item) => item.name === name && item.offeringId === offering.id);
                    return (
                      <td key={offering.id}>
                        {journey ? (
                          <Link className="cl-jcell" to={journeyHref(journey.id, journey.channels[0])}>
                            <i aria-hidden="true" />
                            <span>{plural(steps.get(journey.id) ?? 0, "step")}</span>
                            <span className="ds-visually-hidden">: {journey.name} for {offering.name}</span>
                          </Link>
                        ) : (
                          <span className="cl-jcell is-none">
                            <span aria-hidden="true">—</span>
                            <span className="ds-visually-hidden">Not modelled</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </>
  );
}
