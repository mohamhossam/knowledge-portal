/**
 * The product catalogue, built for any number of products: every offering
 * grouped under its place in the portfolio (business unit › line of business
 * › segment › family), each a card answering how it is sold, who can buy it,
 * its commercial terms and what is in it. The journey catalogue is
 * JourneysIndex.tsx.
 */
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import type { Offering, PortfolioNode } from "../../architecture/model";
import { AreaTabs } from "./CatalogueLab";
import { journeyHref, LAB, useLabData } from "./labData";
import { firstSentence, listOf, monogram, plural, useTitle } from "./labUtil";
import { capabilityOf, DEVICE_ICON, shortComponentName } from "./capabilities";
import { stageOfCode } from "./stages";

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
  terms: <path d="M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3M6 8.5h4.5M6 11h4.5" />,
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
  // Not every channel takes every way to join: the ones a channel takes, when it isn't all of them.
  const ways = joining.length ? joining : offering.orderTypes;
  const onlyFor = (channelId: string) => {
    const served = ways.filter((type) => type.channels.includes(channelId));
    return served.length < ways.length ? served.map((type) => type.name) : null;
  };
  const partial = selling.some((channel) => onlyFor(channel.id));

  // Who can buy: the customer type, cut to its headline.
  const who = offering.eligibility.filter((point) => /segment|customer|audience/i.test(point.title));

  // Commercial terms: the contract periods a customer can choose, one stop each.
  const commitment = offering.eligibility.find((point) => /commitment|contract|term/i.test(point.title));
  const periods = commitment ? headline(commitment.detail).split(/\s*,\s*|\s+or\s+/).filter(Boolean) : [];

  // In the bundle: the device first, then the rest, optional parts last.
  const hub = offering.components.find((item) => /device|router/i.test(item.name)) ?? offering.components.find((item) => /\bcpe\b/i.test(item.name));
  const parts = [...(hub ? [hub] : []), ...offering.components.filter((item) => item !== hub).sort((a, b) => Number(a.mandatory === false) - Number(b.mandatory === false))];

  return (
    <li className="cl-prodcard">
      <div className="cl-prodcard-id">
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
                  {item.channels.map((channel) => {
                    const only = onlyFor(channel.id);
                    const label = only ? `For ${listOf(only)} only` : undefined;
                    return (
                      <span key={channel.id} className={`cl-chanchip${only ? " is-partial" : ""}`} title={label}>
                        <span className={`am-mono cl-systile tone--${tone(channel.systemId)} am-mono--${monogram(channel.name).length}`} aria-hidden="true" translate="no">
                          {monogram(channel.name)}
                        </span>
                        {channel.name.replace(/\s*\(.*\)\s*$/, "")}
                        {label && <span className="ds-visually-hidden">: {label.toLowerCase()}</span>}
                      </span>
                    );
                  })}
                </span>
              ))
            ) : (
              <span className="cl-none">No selling channel stated</span>
            )}
            {partial && <small className="cl-sold-note">Dashed: not for every way to join</small>}
          </dd>
        </div>
        <div>
          <dt>
            <Icon>{ROW_ICONS.who}</Icon>
            Who can buy
          </dt>
          <dd className="cl-chips-wrap">
            {who.length ? (
              who.map((point) => (
                <span key={point.title} className="cl-fact-chip is-strong" title={`${point.title}: ${point.detail}`}>
                  {headline(point.detail)}
                </span>
              ))
            ) : (
              <span className="cl-none">No customer type stated</span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Icon>{ROW_ICONS.terms}</Icon>
            Commercial terms
          </dt>
          <dd className="cl-terms">
            {periods.length > 0 && (
              <span className="cl-term-track" role="list" aria-label="Contract periods">
                {periods.map((period) => (
                  <span key={period} role="listitem">
                    {period}
                  </span>
                ))}
              </span>
            )}
            {periods.length === 0 && <span className="cl-none">No contract period stated</span>}
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
    </li>
  );
}

const FAMILY_ICON = (
  <>
    <rect x="2" y="2.5" width="5" height="5" rx="1" />
    <rect x="9" y="2.5" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <path d="M9 11.5h5M11.5 9v5" />
  </>
);

export function ProductsIndex() {
  const data = useLabData();
  useTitle("Products");
  const [query, setQuery] = useState("");
  const text = query.trim().toLowerCase();
  const shown = data.offerings.filter((offering) => !text || offering.name.toLowerCase().includes(text) || offering.summary.toLowerCase().includes(text));
  // One group per portfolio node that holds offerings, in portfolio order.
  const families = [...new Set(shown.map((offering) => offering.nodeId ?? ""))].map((nodeId) => ({
    nodeId,
    path: pathTo(data.portfolio, nodeId || null),
    offerings: shown.filter((offering) => (offering.nodeId ?? "") === nodeId),
  }));
  const familyCount = new Set(data.offerings.map((offering) => offering.nodeId ?? "")).size;
  // The customer segments the catalogue sells to: the "segment" level of each product's portfolio path, else the level above its family.
  const segmentCount = new Set(
    data.offerings
      .map((offering) => {
        const path = pathTo(data.portfolio, offering.nodeId);
        return (path.find((node) => /segment/i.test(node.level)) ?? path.at(-2))?.id;
      })
      .filter(Boolean),
  ).size;

  return (
    <>
      <AreaTabs current="products" />
      <section className="cl-hero cl-hero--slim" aria-labelledby="cl-products-h">
        <div className="cl-hero-text">
          <p className="cl-eyebrow">Product catalogue</p>
          <h1 id="cl-products-h">Products</h1>
          <p className="cl-hero-lede">Every product offering on the architecture: how it is sold, who can buy it, its terms and what is in it.</p>
        </div>
        <div className="cl-hero-side">
          <dl className="cl-hero-tiles">
            <div>
              <dt>Products</dt>
              <dd>{data.offerings.length}</dd>
            </div>
            <div>
              <dt>Families</dt>
              <dd>{familyCount}</dd>
            </div>
            <div>
              <dt>Segments</dt>
              <dd>{segmentCount}</dd>
            </div>
          </dl>
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
      </section>
      {families.length === 0 && <p className="cl-empty-note">No product matches “{query.trim()}”.</p>}
      {families.map((family) => (
        <section key={family.nodeId} className="cl-family" aria-labelledby={`cl-family-${family.nodeId}`}>
          <header>
            <span className="cl-cap-icon">
              <Icon>{FAMILY_ICON}</Icon>
            </span>
            <div className="cl-family-title">
              <small>{family.path.at(-1)?.level ?? "Product family"}</small>
              <h2 id={`cl-family-${family.nodeId}`}>{family.path.at(-1)?.name ?? "Not placed in the portfolio"}</h2>
            </div>
            <span className="cl-family-count">{plural(family.offerings.length, "product")}</span>
            <ol className="cl-family-path" aria-label="Portfolio path">
              {family.path.slice(0, -1).map((node) => (
                <li key={node.id}>
                  <small>{node.level}</small>
                  {node.name}
                </li>
              ))}
            </ol>
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
