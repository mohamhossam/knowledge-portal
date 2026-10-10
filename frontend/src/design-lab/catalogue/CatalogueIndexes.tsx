/**
 * The catalogue's two indexes, built for any number of products.
 *
 * Products: every offering grouped under its place in the portfolio (business
 * unit › line of business › segment › family), each a card answering how it
 * is sold, who can buy it and what is in it, with its size and its pages.
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
import { firstSentence, monogram, plural, useTitle } from "./labUtil";
import { capabilityOf, DEVICE_ICON, shortComponentName } from "./capabilities";
import { reachOf } from "./posterModel";
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

const ROW_ICONS = {
  sold: (
    <>
      <path d="M2.5 6.5 3.5 2.5h9l1 4" />
      <path d="M2.5 6.5a1.9 1.9 0 0 0 3.7 0 1.9 1.9 0 0 0 3.6 0 1.9 1.9 0 0 0 3.7 0" />
      <path d="M3.5 8.5v5h9v-5M6.5 13.5v-3h3v3" />
    </>
  ),
  who: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 14c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8" />
    </>
  ),
  bundle: PRODUCT_ICON,
};

const CHANNEL_KIND_WORDS: Record<string, string> = { assisted: "Assisted", "self-service": "Self-service" };

/** The part of a condition worth a chip: the text before its first bracket, semicolon or full stop. */
function headline(text: string): string {
  return (text.split(/\s*[(;.]/)[0] ?? text).trim();
}

/**
 * A product at a glance, as the questions a reader brings: how it is sold
 * (assisted and self-service channels), who can buy it (customer type and
 * terms), and what is in it (the device first, optional parts dashed), then
 * its size and its pages. Everything is read from the catalogue, so any
 * product fills the same card.
 */
function ProductCard({ offering }: { offering: Offering }) {
  const data = useLabData();
  const reach = useMemo(() => reachOf(data, offering.id), [data, offering.id]);
  const journeys = data.journeys.filter((journey) => journey.offeringId === offering.id);
  const base = `${LAB}/products/${offering.id}`;

  // Sold through: the channels its joining order types (new sale, migration, port in) arrive by, people-facing ones only.
  const joining = offering.orderTypes.filter((type) => stageOfCode(type.code) === "join");
  const sellingIds = new Set((joining.length ? joining : offering.orderTypes).flatMap((type) => type.channels));
  const selling = data.channels.filter((channel) => sellingIds.has(channel.id) && channel.kind in CHANNEL_KIND_WORDS);
  const kinds = Object.keys(CHANNEL_KIND_WORDS)
    .map((kind) => ({ kind, channels: selling.filter((channel) => channel.kind === kind) }))
    .filter((item) => item.channels.length);
  const tone = (systemId: string) => data.systems.find((system) => system.id === systemId)?.domain ?? "customer";

  // Who can buy: the customer type, then the terms, each cut to its headline; terms listed as alternatives become one chip each.
  const who = offering.eligibility.filter((point) => /segment|customer|audience/i.test(point.title));
  const terms = offering.eligibility.filter((point) => /commitment|contract|term/i.test(point.title));
  const termChips = terms.flatMap((point) => {
    const parts = headline(point.detail).split(/\s*,\s*|\s+or\s+/).filter(Boolean);
    return (parts.every((part) => part.length <= 24) ? parts : [headline(point.detail)]).map((label) => ({ label, evidence: point.evidence }));
  });

  // In the bundle: the device first, then the rest, optional parts last.
  const hub = offering.components.find((item) => /device|router/i.test(item.name)) ?? offering.components.find((item) => /\bcpe\b/i.test(item.name));
  const parts = [...(hub ? [hub] : []), ...offering.components.filter((item) => item !== hub).sort((a, b) => Number(a.mandatory === false) - Number(b.mandatory === false))];

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
      <dl className="cl-glance-rows">
        <div>
          <dt>
            <Icon>{ROW_ICONS.sold}</Icon>
            Sold through
          </dt>
          <dd className="cl-sold">
            {kinds.length ? (
              kinds.map((item) => (
                <span key={item.kind} className="cl-sold-group">
                  <small>{CHANNEL_KIND_WORDS[item.kind]}</small>
                  {item.channels.map((channel) => (
                    <span key={channel.id} className="cl-chanchip">
                      <span className={`am-mono cl-systile tone--${tone(channel.systemId)} am-mono--${monogram(channel.name).length}`} aria-hidden="true" translate="no">
                        {monogram(channel.name)}
                      </span>
                      {channel.name.replace(/\s*\(.*\)\s*$/, "")}
                    </span>
                  ))}
                </span>
              ))
            ) : (
              <span className="cl-none">No selling channel stated</span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Icon>{ROW_ICONS.who}</Icon>
            Who can buy
          </dt>
          <dd className="cl-chips-wrap">
            {who.map((point) => (
              <span key={point.title} className={`cl-fact-chip is-strong is-${point.evidence.status}`} title={`${point.title}: ${point.detail}`}>
                <i aria-hidden="true" />
                {headline(point.detail)}
                {point.evidence.status !== "confirmed" && <span className="ds-visually-hidden"> ({point.evidence.status})</span>}
              </span>
            ))}
            {termChips.map((chip) => (
              <span key={chip.label} className={`cl-fact-chip is-${chip.evidence.status}`}>
                <i aria-hidden="true" />
                {chip.label}
              </span>
            ))}
            {who.length + termChips.length === 0 && <span className="cl-none">No condition stated</span>}
          </dd>
        </div>
        <div>
          <dt>
            <Icon>{ROW_ICONS.bundle}</Icon>
            In the bundle
          </dt>
          <dd className="cl-chips-wrap">
            {parts.map((component) => {
              const capability = capabilityOf(component.name);
              const isHub = component === hub;
              return (
                <span key={component.id} className={`cl-part-chip${isHub ? " is-hub" : ""}${component.mandatory === false ? " is-optional" : ""}`} title={component.name}>
                  <Icon>{isHub ? DEVICE_ICON : (capability?.icon ?? <path d="M4 8h8" />)}</Icon>
                  {shortComponentName(component.name)}
                  {component.mandatory === false && <small>optional</small>}
                </span>
              );
            })}
          </dd>
        </div>
      </dl>
      <div className="cl-prodcard-foot">
        <p className="cl-prodcard-stats">
          <span>
            <b>{offering.plans.length}</b> plans
          </span>
          <span>
            <b>{offering.orderTypes.length}</b> order types
          </span>
          <span>
            <b>{journeys.length}</b> journeys
          </span>
          <span>
            <b>{reach.size}</b>/{data.systems.length} systems
          </span>
        </p>
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
      </div>
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
