/**
 * The journey catalogue, built for many products across many families.
 *
 * Scope: a path through the portfolio hierarchy (business unit › line of
 * business › segment › product family › product), each level a small menu
 * with "Any …", so the page narrows from the whole catalogue to one product.
 *
 * Lifecycle board: the customer's stages (join, change, support, leave) as a
 * chevron ribbon, every order type in scope as a tile in its stage. A tile
 * carries one marker per product in scope: filled where that product has a
 * modelled journey, dashed where it offers the order type with no journey
 * yet. Many products read as a row of markers, not as more columns.
 *
 * Preview: the picked order type, per product when several offer it: the
 * journey's route through the systems in the order the order travels, its
 * channels, its size, the decisions it contains, a comparison across
 * products, and the way into the flow.
 */
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { type CatalogueData, journeyView } from "../../architecture/adapter";
import type { JourneyDef, JourneyView, Offering, PortfolioNode } from "../../architecture/model";
import { AreaTabs } from "./CatalogueLab";
import { journeyHref, LAB, useLabData } from "./labData";
import { monogram, plural, useTitle } from "./labUtil";
import { STAGES, stageOfCode } from "./stages";

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="cl-view-icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {children}
    </svg>
  );
}

const STAGE_ICONS: Record<string, ReactNode> = {
  join: <path d="M8 3v10M3 8h10" />,
  change: <path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5" />,
  support: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" />
      <path d="m4.1 4.1 2.3 2.3M11.9 4.1 9.6 6.4M4.1 11.9l2.3-2.3M11.9 11.9 9.6 9.6" />
    </>
  ),
  leave: <path d="M9.5 3h3.5v10H9.5M3 8h7M7.5 5.5 10 8l-2.5 2.5" />,
  across: <path d="M2 8h12M5 5 2 8l3 3M11 5l3 3-3 3" />,
};

const CHANNEL_KIND_WORDS: Record<string, string> = { assisted: "Assisted", "self-service": "Self-service", system: "System" };

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

/** One level's menu in the scope bar: its kind above, the choice in a chip, "Any …" first. */
function ScopeMenu({ level, value, options, onPick }: { level: string; value: string | null; options: { id: string; name: string }[]; onPick: (id: string | null) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const pick = (id: string | null) => {
    if (menu.current) menu.current.open = false;
    onPick(id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key === "Escape" && menu.current?.open) {
      event.preventDefault();
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  };
  const chosen = options.find((option) => option.id === value);
  const any = `Any ${level.toLowerCase()}`;
  return (
    <li className="jx-scope-level">
      <small>{level}</small>
      <details ref={menu} className="jx-scope-menu" onKeyDown={onKeyDown}>
        <summary aria-label={`${level}: ${chosen?.name ?? any}. Change`}>
          <span className={chosen ? undefined : "is-any"}>{chosen?.name ?? any}</span>
        </summary>
        <ul>
          <li>
            <button type="button" aria-current={value === null ? "true" : undefined} onClick={() => pick(null)}>
              {any}
            </button>
          </li>
          {options.map((option) => (
            <li key={option.id}>
              <button type="button" aria-current={option.id === value ? "true" : undefined} onClick={() => pick(option.id)}>
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/** A journey link that opens on its Integrations tab. */
function withView(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}view=integrations`;
}

type Variant ={ offering: Offering; journey: JourneyDef | undefined; view: JourneyView | null };

/** A journey's shape, for the preview and the comparison. */
function shapeOf(data: CatalogueData, view: JourneyView | null) {
  if (!view) return null;
  const known = new Set(data.systems.map((system) => system.id));
  const route: string[] = [];
  for (const step of view.steps) if (step.kind === "task" && !route.includes(step.lane)) route.push(step.lane);
  const systems = new Set<string>();
  for (const id of route) if (known.has(id)) systems.add(id);
  for (const call of view.integrations) for (const id of [call.from, call.to, call.via]) if (id && known.has(id)) systems.add(id);
  const decisions = [...new Set(view.steps.filter((step) => step.kind === "exclusive" && step.name !== "Decision").map((step) => step.name))];
  return { route, systems, decisions, steps: view.steps.filter((step) => step.kind === "task").length, calls: view.integrations.length };
}

export function JourneysIndex() {
  const data = useLabData();
  useTitle("Journeys");
  const [params, setParams] = useSearchParams();
  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  // Scope: the deepest portfolio node chosen, and optionally one product.
  const scopeNode = data.portfolio.some((node) => node.id === params.get("scope")) ? params.get("scope") : null;
  const scopePath = pathTo(data.portfolio, scopeNode);
  const inScope = (offering: Offering) => !scopeNode || pathTo(data.portfolio, offering.nodeId).some((node) => node.id === scopeNode);
  const scoped = data.offerings.filter(inScope);
  const productId = scoped.some((offering) => offering.id === params.get("product")) ? params.get("product") : null;
  const products = productId ? scoped.filter((offering) => offering.id === productId) : scoped;

  // The scope bar's levels: each chosen level, then the next one to choose, then the product.
  const levels: { level: string; value: string | null; options: { id: string; name: string }[]; parent: string | null }[] = [];
  let parent: string | null = null;
  for (let depth = 0; ; depth += 1) {
    const children = data.portfolio.filter((node) => node.parentId === parent && data.offerings.some((offering) => pathTo(data.portfolio, offering.nodeId).some((item) => item.id === node.id)));
    if (!children.length) break;
    const chosen = scopePath[depth];
    levels.push({ level: children[0]?.level ?? "Level", value: chosen?.id ?? null, options: children.map((node) => ({ id: node.id, name: node.name })), parent });
    if (!chosen) break;
    parent = chosen.id;
  }

  // Order types in scope, by stage; for each, every product's variant.
  const names = new Map<string, string>();
  for (const offering of products) for (const type of offering.orderTypes) if (!names.has(type.code)) names.set(type.code, type.name);
  const variantsOf = (code: string): Variant[] =>
    products
      .filter((offering) => offering.orderTypes.some((type) => type.code === code) || data.journeys.some((journey) => journey.offeringId === offering.id && journey.orderType === code))
      .map((offering) => {
        const journey = data.journeys.find((item) => item.offeringId === offering.id && item.orderType === code);
        return { offering, journey, view: journey ? journeyView(data, journey.id, journey.channels[0] ?? null) : null };
      });
  const stages = STAGES.map((stage) => ({ ...stage, codes: [...names.keys()].filter((code) => stageOfCode(code) === stage.id) })).filter((stage) => stage.codes.length);
  const shared = data.journeys.filter((journey) => !journey.orderType && products.some((offering) => offering.id === journey.offeringId));

  // The picked tile: an order type code, or a shared journey's id; the picked product among its variants.
  const pickedKey = params.get("type") && (names.has(params.get("type") ?? "") || shared.some((journey) => journey.id === params.get("type"))) ? (params.get("type") as string) : (stages[0]?.codes[0] ?? shared[0]?.id ?? null);
  const sharedPick = shared.find((journey) => journey.id === pickedKey);
  const sharedOffering = sharedPick ? data.offerings.find((item) => item.id === sharedPick.offeringId) : undefined;
  const sharedVariant: Variant[] = sharedPick && sharedOffering ? [{ offering: sharedOffering, journey: sharedPick, view: journeyView(data, sharedPick.id, sharedPick.channels[0] ?? null) }] : [];
  const variants: Variant[] = !pickedKey ? [] : sharedPick ? sharedVariant : variantsOf(pickedKey);
  const variant = variants.find((item) => item.offering.id === params.get("variant")) ?? variants.find((item) => item.journey) ?? variants[0];
  const shape = shapeOf(data, variant?.view ?? null);
  const pickedName = sharedPick?.name ?? (pickedKey ? names.get(pickedKey) : undefined);
  const pickedStage = sharedPick ? "across" : pickedKey ? stageOfCode(pickedKey) : null;

  const offered = products.reduce((sum, offering) => sum + offering.orderTypes.length, 0);
  const modelled = products.reduce((sum, offering) => sum + offering.orderTypes.filter((type) => data.journeys.some((journey) => journey.offeringId === offering.id && journey.orderType === type.code)).length, 0);
  const systemName = (id: string) => data.systems.find((system) => system.id === id)?.name ?? (id.startsWith("team:") ? id.slice(5) : id === "channel" ? "Ordering channel" : id);
  const systemTone = (id: string) => data.systems.find((system) => system.id === id)?.domain;

  const markers = (code: string) =>
    products.map((offering) => {
      const has = data.journeys.some((journey) => journey.offeringId === offering.id && journey.orderType === code);
      const offers = offering.orderTypes.some((type) => type.code === code);
      return { offering, state: has ? "on" : offers ? "gap" : "none" };
    });

  const tile = (key: string, name: string, journeyCount: { has: number; offers: number }, markerList: { offering: Offering; state: string }[], steps?: number) => (
    <li key={key}>
      <button
        type="button"
        className="jx-tile"
        aria-pressed={key === pickedKey}
        aria-label={`${name}: ${journeyCount.has} of ${plural(journeyCount.offers, "product")} with a journey`}
        onClick={() => setParam({ type: key, variant: null })}
      >
        <span className="jx-tile-name" title={name}>
          {name.replace(/\s*\(.*\)\s*$/, "") || name}
        </span>
        <span className="jx-tile-meta" aria-hidden="true">
          {products.length === 1 && steps !== undefined ? (
            <span className="jx-tile-steps">{plural(steps, "step")}</span>
          ) : (
            <span className="jx-marks">
              {markerList.slice(0, 6).map((marker) => (
                <i key={marker.offering.id} className={`is-${marker.state}`} title={`${marker.offering.name}: ${marker.state === "on" ? "journey modelled" : marker.state === "gap" ? "offered, no journey yet" : "not offered"}`} />
              ))}
              {markerList.length > 6 && <b>+{markerList.length - 6}</b>}
            </span>
          )}
        </span>
      </button>
    </li>
  );

  return (
    <>
      <AreaTabs current="journeys" />
      <header className="jx-head">
        <div>
          <p className="cl-eyebrow">Journey catalogue</p>
          <h1>Journeys</h1>
        </div>
        <p className="jx-lede">Every journey across the portfolio, by the customer&apos;s stage. Narrow it down by business unit, family or product, then pick an order type to preview its journey.</p>
      </header>

      <nav className="jx-scope" aria-label="Scope">
        <ol>
          {levels.map((item, index) => (
            <ScopeMenu key={`${item.level}-${index}`} level={item.level} value={item.value} options={item.options} onPick={(id) => setParam({ scope: id ?? item.parent, product: null, type: null, variant: null })} />
          ))}
          <ScopeMenu level="Product" value={productId} options={scoped.map((offering) => ({ id: offering.id, name: offering.name }))} onPick={(id) => setParam({ product: id, variant: null })} />
        </ol>
        <p className="jx-scope-sum" aria-live="polite">
          <b>{plural(products.length, "product")}</b>
          <span>
            {modelled} of {plural(offered, "order type")} modelled
          </span>
          <span className="jx-cover" aria-hidden="true">
            <i style={{ width: `${offered ? (modelled / offered) * 100 : 0}%` }} />
          </span>
        </p>
      </nav>

      <div className="jx">
        <section className="jx-board" aria-label="Order types by the customer's stage">
          <ol className="jx-ribbon" style={{ gridTemplateColumns: stages.map((stage) => `${Math.min(2, Math.ceil(stage.codes.length / 6))}fr`).join(" ") }}>
            {stages.map((stage, index) => (
              <li key={stage.id} className={`jx-stage${pickedStage === stage.id ? " is-on" : ""}`}>
                <span className="jx-stage-icon">
                  <Icon>{STAGE_ICONS[stage.id]}</Icon>
                </span>
                <span className="jx-stage-text">
                  <strong>
                    <span className="jx-stage-no">{String(index + 1).padStart(2, "0")}</span> {stage.name}
                  </strong>
                  <small>{stage.blurb}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className="jx-columns" style={{ gridTemplateColumns: stages.map((stage) => `${Math.min(2, Math.ceil(stage.codes.length / 6))}fr`).join(" ") }}>
            {stages.map((stage) => (
              <div key={stage.id} className="jx-colwrap">
                {/* On a narrow screen the ribbon is hidden and each stage names itself above its tiles. */}
                <p className="jx-col-head" aria-hidden="true">
                  <Icon>{STAGE_ICONS[stage.id]}</Icon>
                  {stage.name}
                  <small>{stage.blurb}</small>
                </p>
                <ul className="jx-col" aria-label={stage.name} style={{ gridTemplateColumns: `repeat(${Math.min(2, Math.ceil(stage.codes.length / 6))}, minmax(0, 1fr))` }}>
                  {stage.codes.map((code) => {
                    const list = markers(code);
                    const single = products.length === 1 ? data.journeys.find((journey) => journey.offeringId === products[0]?.id && journey.orderType === code) : undefined;
                    const steps = single ? (journeyView(data, single.id, single.channels[0] ?? null)?.steps.filter((step) => step.kind === "task").length ?? 0) : undefined;
                    return tile(code, names.get(code) ?? code, { has: list.filter((marker) => marker.state === "on").length, offers: list.filter((marker) => marker.state !== "none").length }, list, steps);
                  })}
                </ul>
              </div>
            ))}
          </div>
          {shared.length > 0 && (
            <div className="jx-across">
              <span className="jx-across-label">
                <Icon>{STAGE_ICONS.across}</Icon>
                Across the lifecycle
              </span>
              <ul>
                {[...new Map(shared.map((journey) => [journey.name, journey])).values()].map((journey) => {
                  const list = products.map((offering) => ({ offering, state: shared.some((item) => item.name === journey.name && item.offeringId === offering.id) ? "on" : "none" }));
                  const steps = journeyView(data, journey.id, journey.channels[0] ?? null)?.steps.filter((step) => step.kind === "task").length;
                  return tile(journey.id, journey.name, { has: list.filter((marker) => marker.state === "on").length, offers: list.length }, list, steps);
                })}
              </ul>
            </div>
          )}
          {products.length > 1 && (
            <p className="jx-key" aria-hidden="true">
              <i className="is-on" /> Journey modelled <i className="is-gap" /> Offered, no journey yet <i className="is-none" /> Not offered
            </p>
          )}
        </section>

        <aside className="jx-panel" aria-labelledby="jx-panel-h">
          {pickedName && variant ? (
            <>
              <p className="jx-panel-stage">
                <Icon>{STAGE_ICONS[pickedStage ?? "across"]}</Icon>
                {pickedStage === "across" ? "Across the lifecycle" : STAGES.find((stage) => stage.id === pickedStage)?.name}
              </p>
              <h2 id="jx-panel-h">{pickedName}</h2>
              {variants.length > 1 ? (
                <div className="jx-variants" role="group" aria-label="Product">
                  {variants.map((item) => (
                    <button key={item.offering.id} type="button" aria-pressed={item === variant} onClick={() => setParam({ variant: item.offering.id })}>
                      <i className={item.journey ? "is-on" : "is-gap"} aria-hidden="true" />
                      {item.offering.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="jx-panel-product">
                  <Link to={`${LAB}/products/${variant.offering.id}`}>{variant.offering.name}</Link>
                </p>
              )}
              {variant.journey && shape ? (
                <>
                  <p className="jx-panel-summary">{variant.journey.summary}</p>
                  <dl className="jx-facts">
                    <div>
                      <dt>Steps</dt>
                      <dd>{shape.steps}</dd>
                    </div>
                    <div>
                      <dt>Decisions</dt>
                      <dd>{shape.decisions.length}</dd>
                    </div>
                    <div>
                      <dt>Systems</dt>
                      <dd>{shape.systems.size}</dd>
                    </div>
                    <div>
                      <dt>Calls</dt>
                      <dd>{shape.calls}</dd>
                    </div>
                  </dl>
                  <h3>Route through the systems</h3>
                  <ol className="jx-route" aria-label={`Route: ${shape.route.map(systemName).join(", then ")}`}>
                    {shape.route.slice(0, 12).map((lane) => (
                      <li key={lane} title={systemName(lane)}>
                        <span className={`am-mono cl-systile${systemTone(lane) ? ` tone--${systemTone(lane)}` : " is-party"} am-mono--${monogram(systemName(lane)).length}`} translate="no">
                          {monogram(systemName(lane))}
                        </span>
                      </li>
                    ))}
                    {shape.route.length > 12 && <li className="jx-route-more">+{shape.route.length - 12}</li>}
                  </ol>
                  {variant.journey.channels.length > 0 && (
                    <>
                      <h3>Arrives through</h3>
                      <p className="jx-channels">
                        {variant.journey.channels.map((id) => {
                          const channel = data.channels.find((item) => item.id === id);
                          return channel ? (
                            <span key={id} className="cl-chanchip">
                              <span className={`am-mono cl-systile tone--${systemTone(channel.systemId) ?? "customer"} am-mono--${monogram(channel.name).length}`} aria-hidden="true" translate="no">
                                {monogram(channel.name)}
                              </span>
                              {channel.name.replace(/\s*\(.*\)\s*$/, "")}
                              <small>{CHANNEL_KIND_WORDS[channel.kind] ?? channel.kind}</small>
                            </span>
                          ) : null;
                        })}
                      </p>
                    </>
                  )}
                  {shape.decisions.length > 0 && (
                    <>
                      <h3>Decisions on the way</h3>
                      <ul className="jx-decisions">
                        {shape.decisions.slice(0, 5).map((decision) => (
                          <li key={decision}>
                            <i aria-hidden="true" />
                            {decision}
                          </li>
                        ))}
                        {shape.decisions.length > 5 && <li className="jx-more">{plural(shape.decisions.length - 5, "more decision")}</li>}
                      </ul>
                    </>
                  )}
                  {variants.filter((item) => item.journey).length > 1 && (
                    <>
                      <h3>Across products</h3>
                      <table className="jx-compare">
                        <thead>
                          <tr>
                            <th scope="col">Product</th>
                            <th scope="col">Steps</th>
                            <th scope="col">Decisions</th>
                            <th scope="col">Systems</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variants
                            .filter((item) => item.journey)
                            .map((item) => {
                              const other = shapeOf(data, item.view);
                              return (
                                <tr key={item.offering.id} aria-current={item === variant ? "true" : undefined}>
                                  <th scope="row">{item.offering.name}</th>
                                  <td>{other?.steps}</td>
                                  <td>{other?.decisions.length}</td>
                                  <td>{other?.systems.size}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </>
                  )}
                  <div className="jx-actions">
                    <Link className="cl-btn primary" to={journeyHref(variant.journey.id, variant.journey.channels[0])}>
                      Open the journey flow
                    </Link>
                    <Link className="cl-btn" to={withView(journeyHref(variant.journey.id, variant.journey.channels[0]))}>
                      Integrations
                    </Link>
                  </div>
                </>
              ) : (
                <div className="jx-empty">
                  <p>
                    <strong>No journey yet.</strong> {variant.offering.name} offers this order type, but its journey isn&apos;t modelled.
                  </p>
                </div>
              )}
            </>
          ) : (
            <h2 id="jx-panel-h">No order type in this scope</h2>
          )}
        </aside>
      </div>
    </>
  );
}
