/**
 * The journey catalogue: every journey of one product, by the customer's stage.
 *
 * Order types belong to a product, so the page always shows one product's.
 * The header is the catalogue's soft band: the title, how much of the product
 * is modelled, then the scope, a path through the portfolio (business unit ›
 * line of business › segment › product family) ending in the product. Every
 * level opens with a choice: Fixed › SMB, then the first family and product
 * under it. Each level stays selectable; those above the product have "Any …",
 * the product level always names one.
 *
 * Lifecycle board: the customer's stages (join, change, support, leave) as a
 * chevron ribbon, every order type of the product as a tile in its stage, with
 * its journey's size, or "No journey yet".
 *
 * Preview: the picked order type's journey: its route through the systems in
 * the order the order travels, its channels, its size, the decisions it
 * contains, and the way into the flow.
 */
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { type CatalogueData, journeyView } from "../../architecture/adapter";
import type { JourneyView, Offering, PortfolioNode } from "../../architecture/model";
import { AreaTabs } from "./CatalogueLab";
import { journeyHref, LAB, useLabData } from "./labData";
import { monogram, plural, useTitle } from "./labUtil";
import { STAGES, stageOfCode } from "./stages";

/** The portfolio path the page opens on, by name from the top: Fixed, then SMB. */
const DEFAULT_SCOPE = ["Fixed", "SMB"];

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

/**
 * The scope the page opens on: DEFAULT_SCOPE by name (the first name anywhere,
 * each next one among the previous one's children), then down through the
 * first child that holds a product, so every level opens with a choice.
 */
function defaultScope(nodes: PortfolioNode[], offerings: Offering[]): string | null {
  const holdsProduct = (node: PortfolioNode) => offerings.some((offering) => pathTo(nodes, offering.nodeId).some((item) => item.id === node.id));
  let node: PortfolioNode | undefined;
  for (const name of DEFAULT_SCOPE) {
    const found: PortfolioNode | undefined = nodes.find((item) => item.name === name && (!node || item.parentId === node.id));
    if (!found) break;
    node = found;
  }
  for (let next = node && nodes.find((item) => item.parentId === node?.id && holdsProduct(item)); next; next = nodes.find((item) => item.parentId === node?.id && holdsProduct(item))) node = next;
  return node?.id ?? null;
}

/** One level's menu in the scope bar: a chip naming its kind and the choice, "Any …" first unless the level must name one. */
function ScopeMenu({ level, value, options, onPick, allowAny = true }: { level: string; value: string | null; options: { id: string; name: string }[]; onPick: (id: string | null) => void; allowAny?: boolean }) {
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
      <details ref={menu} className="jx-scope-menu" onKeyDown={onKeyDown}>
        <summary aria-label={`${level}: ${chosen?.name ?? any}. Change`}>
          <small aria-hidden="true">{level}</small>
          <span className={chosen ? undefined : "is-any"}>{chosen?.name ?? any}</span>
        </summary>
        <ul>
          {allowAny && (
            <li>
              <button type="button" aria-current={value === null ? "true" : undefined} onClick={() => pick(null)}>
                {any}
              </button>
            </li>
          )}
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

/** A journey's shape, for the preview. */
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

  // Scope: the deepest portfolio node chosen ("all" for the whole portfolio; none in the URL opens on the default path), then one product in it.
  const wantedScope = params.get("scope");
  const scopeNode = wantedScope === "all" ? null : data.portfolio.some((node) => node.id === wantedScope) ? wantedScope : defaultScope(data.portfolio, data.offerings);
  const scopePath = pathTo(data.portfolio, scopeNode);
  const scoped = data.offerings.filter((offering) => !scopeNode || pathTo(data.portfolio, offering.nodeId).some((node) => node.id === scopeNode));
  const product = scoped.find((offering) => offering.id === params.get("product")) ?? scoped[0] ?? null;

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

  // The product's order types, by stage, and its journeys that follow any order type.
  const journeyOf = (code: string) => (product ? data.journeys.find((journey) => journey.offeringId === product.id && journey.orderType === code) : undefined);
  const stepsOf = (journeyId: string, channel: string | null) => journeyView(data, journeyId, channel)?.steps.filter((step) => step.kind === "task").length ?? 0;
  const names = new Map((product?.orderTypes ?? []).map((type) => [type.code, type.name]));
  const stages = STAGES.map((stage) => ({ ...stage, codes: [...names.keys()].filter((code) => stageOfCode(code) === stage.id) })).filter((stage) => stage.codes.length);
  const shared = product ? data.journeys.filter((journey) => !journey.orderType && journey.offeringId === product.id) : [];

  // The picked tile: an order type code, or a shared journey's id.
  const typeParam = params.get("type") ?? "";
  const pickedKey = names.has(typeParam) || shared.some((journey) => journey.id === typeParam) ? typeParam : (stages[0]?.codes[0] ?? shared[0]?.id ?? null);
  const sharedPick = shared.find((journey) => journey.id === pickedKey);
  const journey = sharedPick ?? (pickedKey ? journeyOf(pickedKey) : undefined);
  const shape = shapeOf(data, journey ? journeyView(data, journey.id, journey.channels[0] ?? null) : null);
  const pickedName = sharedPick?.name ?? (pickedKey ? names.get(pickedKey) : undefined);
  const pickedStage = sharedPick ? "across" : pickedKey ? stageOfCode(pickedKey) : null;

  const offered = product?.orderTypes.length ?? 0;
  const modelled = (product?.orderTypes ?? []).filter((type) => journeyOf(type.code)).length;
  const systemName = (id: string) => data.systems.find((system) => system.id === id)?.name ?? (id.startsWith("team:") ? id.slice(5) : id === "channel" ? "Ordering channel" : id);
  const systemTone = (id: string) => data.systems.find((system) => system.id === id)?.domain;

  const tile = (key: string, name: string, steps: number | undefined) => (
    <li key={key}>
      <button type="button" className="jx-tile" aria-pressed={key === pickedKey} aria-label={`${name}: ${steps === undefined ? "no journey yet" : plural(steps, "step")}`} onClick={() => setParam({ type: key })}>
        <span className="jx-tile-name" title={name}>
          {name.replace(/\s*\(.*\)\s*$/, "") || name}
        </span>
        <span className="jx-tile-meta" aria-hidden="true">
          <span className={`jx-tile-steps${steps === undefined ? " is-gap" : ""}`}>{steps === undefined ? "No journey yet" : plural(steps, "step")}</span>
        </span>
      </button>
    </li>
  );
  const columns = stages.map((stage) => `${Math.min(2, Math.ceil(stage.codes.length / 6))}fr`).join(" ");

  return (
    <>
      <AreaTabs current="journeys" />
      <header className="lx-band jx-band">
        <div className="lx-band-row">
          <span className="lx-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="18" height="18">
              <circle cx="3.5" cy="12.5" r="1.5" />
              <circle cx="12.5" cy="3.5" r="1.5" />
              <path d="M5 12.5h3.5a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4H11" />
            </svg>
          </span>
          <div className="lx-title">
            <h1>Journeys</h1>
            <p className="lx-lede">Every order type of one product, by the customer&apos;s stage</p>
          </div>
          {product && (
            <p className="jx-scope-sum" aria-live="polite">
              <span>
                <b>{modelled}</b> of {plural(offered, "order type")} modelled
              </span>
              <span className="jx-cover" aria-hidden="true">
                <i style={{ width: `${offered ? (modelled / offered) * 100 : 0}%` }} />
              </span>
            </p>
          )}
        </div>
        <nav className="jx-scope" aria-label="Scope">
          <ol>
            {levels.map((item, index) => (
              <ScopeMenu key={`${item.level}-${index}`} level={item.level} value={item.value} options={item.options} onPick={(id) => setParam({ scope: id ?? item.parent ?? "all", product: null, type: null })} />
            ))}
            <ScopeMenu level="Product" value={product?.id ?? null} options={scoped.map((offering) => ({ id: offering.id, name: offering.name }))} onPick={(id) => setParam({ product: id, type: null })} allowAny={false} />
          </ol>
        </nav>
      </header>

      <div className="jx">
        <section className="jx-board" aria-label="Order types by the customer's stage">
          {product ? (
            <>
              <ol className="jx-ribbon" style={{ gridTemplateColumns: columns }}>
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
              <div className="jx-columns" style={{ gridTemplateColumns: columns }}>
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
                        const found = journeyOf(code);
                        return tile(code, names.get(code) ?? code, found ? stepsOf(found.id, found.channels[0] ?? null) : undefined);
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
                  <ul>{shared.map((item) => tile(item.id, item.name, stepsOf(item.id, item.channels[0] ?? null)))}</ul>
                </div>
              )}
            </>
          ) : (
            <p className="jx-empty">No product sits in this part of the portfolio yet. Widen the scope above.</p>
          )}
        </section>

        <aside className="jx-panel" aria-labelledby="jx-panel-h">
          {product && pickedName ? (
            <>
              <p className="jx-panel-stage">
                <Icon>{STAGE_ICONS[pickedStage ?? "across"]}</Icon>
                {pickedStage === "across" ? "Across the lifecycle" : STAGES.find((stage) => stage.id === pickedStage)?.name}
              </p>
              <h2 id="jx-panel-h">{pickedName}</h2>
              <p className="jx-panel-product">
                <Link to={`${LAB}/products/${product.id}`}>{product.name}</Link>
              </p>
              {journey && shape ? (
                <>
                  <p className="jx-panel-summary">{journey.summary}</p>
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
                  {journey.channels.length > 0 && (
                    <>
                      <h3>Arrives through</h3>
                      <p className="jx-channels">
                        {journey.channels.map((id) => {
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
                  <div className="jx-actions">
                    <Link className="cl-btn primary" to={journeyHref(journey.id, journey.channels[0])}>
                      Open the journey flow
                    </Link>
                    <Link className="cl-btn" to={withView(journeyHref(journey.id, journey.channels[0]))}>
                      Integrations
                    </Link>
                  </div>
                </>
              ) : (
                <div className="jx-empty">
                  <p>
                    <strong>No journey yet.</strong> {product.name} offers this order type, but its journey isn&apos;t modelled.
                  </p>
                </div>
              )}
            </>
          ) : (
            <h2 id="jx-panel-h">{product ? "No order type for this product" : "No product in this scope"}</h2>
          )}
        </aside>
      </div>
    </>
  );
}
