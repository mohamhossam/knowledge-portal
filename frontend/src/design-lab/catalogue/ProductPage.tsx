/**
 * Mock-ups 2 and 3: a product's page (its value proposition, bundle, customer
 * value, plans) and its Architecture tab (the landscape poster with one
 * journey's systems lit and its calls stepped through in order). Both share
 * one header, so the product's tabs stay in the same place.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { journeyView } from "../../architecture/adapter";
import { impactOf } from "../../architecture/impact";
import { type Component, type Offering, ROLE_WORDS } from "../../architecture/model";
import { AreaTabs, EvidenceTag } from "./CatalogueLab";
import { firstJourneyHref, journeyHref, LAB, useLabData } from "./labData";
import { leadingNumber, plural, useTitle } from "./labUtil";
import { Poster } from "./poster";
import { allIntegrations, allViews, degrees as degreesOf, links } from "./posterModel";

function useOffering(): Offering | null {
  const data = useLabData();
  const { offeringId } = useParams();
  return data.offerings.find((item) => item.id === offeringId) ?? null;
}

function Missing({ what }: { what: string }) {
  return (
    <div className="cl-empty">
      <h1>{what}</h1>
      <p>
        It isn't in this catalogue version. <Link to={LAB}>Back to the landscape</Link>.
      </p>
    </div>
  );
}

/** The product's header: where it sits, what it is, and its tabs. */
function ProductHeader({ offering, current, actions }: { offering: Offering; current: "overview" | "architecture"; actions?: ReactNode }) {
  const data = useLabData();
  const path: { id: string; name: string }[] = [];
  let node = data.portfolio.find((item) => item.id === offering.nodeId);
  while (node) {
    path.unshift({ id: node.id, name: node.name });
    const parent = node.parentId;
    node = parent ? data.portfolio.find((item) => item.id === parent) : undefined;
  }
  const views = useMemo(() => allViews(data).filter((view) => view.offeringId === offering.id), [data, offering]);
  const systems = new Set(views.flatMap((view) => [...view.steps.map((step) => step.lane), ...view.integrations.flatMap((call) => [call.from, call.to, call.via])]).filter((id): id is string => typeof id === "string" && data.systems.some((system) => system.id === id)));
  const journeys = data.journeys.filter((journey) => journey.offeringId === offering.id);
  const tabs: { id: string; label: string; to?: string }[] = [
    { id: "overview", label: "Overview", to: `${LAB}/products/${offering.id}` },
    { id: "plans", label: `Plans · ${offering.plans.length}` },
    { id: "rules", label: `Business rules · ${offering.rules.length}` },
    { id: "components", label: `Components · ${offering.components.length}` },
    { id: "journeys", label: `Journeys · ${journeys.length}`, to: firstJourneyHref(data, offering.id) },
    { id: "architecture", label: "Architecture", to: `${LAB}/products/${offering.id}/architecture` },
  ];
  return (
    <>
      <AreaTabs current="products" />
      <nav className="cl-crumbs" aria-label="Where it sits in the portfolio">
        <ol>
          <li>
            <Link to={LAB}>Catalogue</Link>
          </li>
          {path.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
          <li aria-current="page">{offering.name}</li>
        </ol>
      </nav>
      <header className="cl-head">
        <div className="cl-head-text">
          <h1>{offering.name}</h1>
          <p className="cl-lede">{offering.summary}</p>
          <p className="cl-meta-line">
            {plural(offering.plans.length, "plan")} · {plural(offering.components.length, "component")} · {plural(offering.orderTypes.length, "order type")} · {plural(journeys.length, "journey")} modelled · {plural(systems.size, "system")} touched
          </p>
          <EvidenceTag evidence={offering.evidence} />
        </div>
        {actions && <div className="cl-head-actions">{actions}</div>}
      </header>
      <nav className="cl-tabs cl-tabs--sub" aria-label={`${offering.name} sections`}>
        {tabs.map((tab) =>
          tab.to ? (
            <Link key={tab.id} to={tab.to} aria-current={tab.id === current ? "page" : undefined}>
              {tab.label}
            </Link>
          ) : (
            <span key={tab.id} className="cl-tab-off">
              {tab.label}
              <span className="ds-visually-hidden"> (on the Overview in these mock-ups)</span>
            </span>
          ),
        )}
      </nav>
    </>
  );
}

/**
 * The bundle drawn in the poster's notation: the device at the hub, every
 * component on a branch of one bus, the systems that deliver it beside it.
 * Optional components hang on dashed branches; codes sit in a disclosure.
 */
function Bundle({ offering }: { offering: Offering }) {
  const data = useLabData();
  const hub = offering.components.find((item) => /device|router/i.test(item.name)) ?? offering.components.find((item) => /cpe/i.test(item.name)) ?? offering.components[0];
  const rest = offering.components.filter((item) => item !== hub).sort((a, b) => Number(a.mandatory === false) - Number(b.mandatory === false));
  const systems = (component: Component) => component.systems.map((item) => data.systems.find((system) => system.id === item.systemId)?.name ?? item.systemId);
  const hubName = hub ? hub.name.replace(/\s*\(.*\)\s*$/, "") : "";
  const hubModel = hub ? (/\((.*)\)/.exec(hub.name)?.[1] ?? "") : "";
  return (
    <section className="cl-card cl-bundle" aria-labelledby="cl-bundle-h">
      <h2 id="cl-bundle-h">
        What's in the bundle <small>{plural(offering.components.length, "component")}</small>
      </h2>
      {hub && (
        <div className="cl-hub">
          <strong>{hubName}</strong>
          {hubModel && <span>{hubModel}</span>}
          <span className="cl-sysline" translate="no">
            {systems(hub).join(" · ")}
          </span>
        </div>
      )}
      <ul className="cl-branches">
        {rest.map((component) => (
          <li key={component.id} className={component.mandatory === false ? "optional" : undefined}>
            <strong>
              {component.name}
              {component.mandatory === false && <em> · optional</em>}
            </strong>
            <span className="cl-sysline" translate="no">
              {systems(component).slice(0, 3).join(" · ") || "No system stated"}
            </span>
          </li>
        ))}
      </ul>
      <details className="cl-details">
        <summary>Offer and service codes</summary>
        <ul className="cl-points">
          {offering.components.map((component) => (
            <li key={component.id}>
              <span>
                <strong>{component.name}.</strong> <span translate="no">{[component.offerCode, component.specCode].filter(Boolean).join(" · ") || "No code stated"}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Plans side by side, differences first; what every plan shares is said once. */
function Plans({ offering }: { offering: Offering }) {
  const names = [...new Set(offering.plans.flatMap((plan) => plan.characteristics.map((item) => item.name)))];
  const value = (plan: Offering["plans"][number], name: string) => plan.characteristics.find((item) => item.name === name)?.value;
  const rows = names.map((name) => {
    const values = offering.plans.map((plan) => value(plan, name));
    const same = values.every((item) => item !== undefined && item === values[0]);
    const numbers = values.map((item) => (item ? leadingNumber(item) : null));
    const max = Math.max(0, ...numbers.map((n) => n ?? 0));
    return { name, values, same, numbers, max };
  });
  const differs = rows.filter((row) => !row.same);
  const shared = rows.filter((row) => row.same);
  const priced = names.some((name) => /price|fee|aed/i.test(name));
  const short = (name: string) => name.replace(offering.name, "").trim() || name;
  return (
    <section className="cl-card" aria-labelledby="cl-plans-h">
      <h2 id="cl-plans-h">
        Plans compared <small>{plural(offering.plans.length, "plan")}</small>
      </h2>
      <div className="cl-tablewrap" role="region" aria-label="Plans table (scrolls sideways when narrow)" tabIndex={0}>
        <table className="cl-table">
          <thead>
            <tr>
              <th scope="col">Characteristic</th>
              {offering.plans.map((plan) => (
                <th key={plan.name} scope="col" className="num">
                  {short(plan.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {differs.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                {row.values.map((item, index) => {
                  const n = row.numbers[index];
                  return (
                    <td key={offering.plans[index]?.name ?? index} className="num">
                      {item ?? <span className="gap">Not stated</span>}
                      {n !== null && n !== undefined && row.max > 0 && (
                        <i className="cl-spark" aria-hidden="true">
                          <i style={{ width: `${(n / row.max) * 100}%` }} />
                        </i>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {shared.length > 0 && (
              <tr className="cl-table-group">
                <th scope="rowgroup" colSpan={offering.plans.length + 1}>
                  The same on every plan
                </th>
              </tr>
            )}
            {shared.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td colSpan={offering.plans.length}>{row.values[0]}</td>
              </tr>
            ))}
            {!priced && (
              <tr>
                <th scope="row">Monthly price</th>
                <td colSpan={offering.plans.length} className="gap">
                  Gap: the SDD states no prices
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProductOverview() {
  const data = useLabData();
  const offering = useOffering();
  useTitle(offering?.name ?? "Product");
  if (!offering) return <Missing what="No such product" />;
  return (
    <>
      <ProductHeader
        offering={offering}
        current="overview"
        actions={
          <>
            <Link className="cl-btn primary" to={`${LAB}/products/${offering.id}/architecture`}>
              See its architecture
            </Link>
            <Link className="cl-btn" to={firstJourneyHref(data, offering.id)}>
              Open a journey flow
            </Link>
          </>
        }
      />
      <div className="cl-grid">
        <Bundle offering={offering} />
        <section className="cl-card cl-span-7" aria-labelledby="cl-values-h">
          <h2 id="cl-values-h">
            Customer value <small>{plural(offering.values.length, "reason")} a business buys it</small>
          </h2>
          <div className="cl-values">
            {offering.values.map((value) => (
              <article key={value.title} className="cl-value">
                <h3>{value.title}</h3>
                <p>{value.detail}</p>
                <EvidenceTag evidence={value.evidence} />
              </article>
            ))}
          </div>
        </section>
        <div className="cl-span-8">
          <Plans offering={offering} />
        </div>
        <section className="cl-card cl-span-4" aria-labelledby="cl-elig-h">
          <h2 id="cl-elig-h">
            Who it can be sold to <small>{plural(offering.eligibility.length, "condition")}</small>
          </h2>
          <ul className="cl-points">
            {offering.eligibility.map((point) => (
              <li key={point.title}>
                <span>
                  <strong>{point.title}.</strong> {point.detail}
                </span>
                <EvidenceTag evidence={point.evidence} />
              </li>
            ))}
          </ul>
        </section>
        <section className="cl-card cl-span-12" aria-labelledby="cl-purpose-h">
          <h2 id="cl-purpose-h">What it's for</h2>
          <p className="cl-reading">{offering.purpose}</p>
        </section>
      </div>
    </>
  );
}

export function ProductArchitecture() {
  const data = useLabData();
  const offering = useOffering();
  useTitle(offering ? `${offering.name} architecture` : "Architecture");
  const [params, setParams] = useSearchParams();
  const journeys = useMemo(() => data.journeys.filter((journey) => journey.offeringId === offering?.id), [data, offering]);
  const def = journeys.find((journey) => journey.id === params.get("journey")) ?? journeys[0];
  const wanted = params.get("channel");
  const channel = def && wanted && def.channels.includes(wanted) ? wanted : (def?.channels[0] ?? null);
  const view = useMemo(() => (def ? journeyView(data, def.id, channel) : null), [data, def, channel]);
  const calls = useMemo(() => view?.integrations ?? [], [view]);
  const scopeKey = `${view?.id ?? ""}:${view?.channel ?? ""}`;
  const [position, setPosition] = useState({ key: scopeKey, index: 0 });
  const current = position.key === scopeKey ? Math.min(position.index, Math.max(0, calls.length - 1)) : 0;
  const go = (index: number) => setPosition({ key: scopeKey, index: Math.max(0, Math.min(calls.length - 1, index)) });

  const integrations = useMemo(() => allIntegrations(data), [data]);
  const linkCounts = useMemo(() => links(data, calls), [data, calls]);
  const degrees = useMemo(() => degreesOf(integrations), [integrations]);
  const impact = useMemo(() => (offering && def ? impactOf(data, { offeringId: offering.id, orderType: def.orderType, channel }) : null), [data, offering, def, channel]);
  const systemById = useMemo(() => new Map(data.systems.map((system) => [system.id, system])), [data]);
  const entry = Object.keys(view?.laneLabels ?? {})[0];
  const lit = useMemo(() => {
    const ids = new Set<string>();
    for (const call of calls) for (const id of [call.from, call.to, call.via]) if (id && systemById.has(id)) ids.add(id);
    for (const step of view?.steps ?? []) if (systemById.has(step.lane)) ids.add(step.lane);
    if (entry && systemById.has(entry)) ids.add(entry);
    return ids;
  }, [calls, view, systemById, entry]);
  const footprint = useMemo(
    () =>
      data.domains
        .map((domain) => {
          const all = data.systems.filter((system) => system.domain === domain.id);
          return { domain, total: all.length, lit: all.filter((system) => lit.has(system.id)).length };
        })
        .filter((row) => row.total > 0),
    [data, lit],
  );
  const journeyProp = useMemo(() => ({ lit, entry, calls, current }), [lit, entry, calls, current]);

  // ← / → step through the calls when focus isn't in a field.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest("input, textarea, select, [role='group'][aria-label*='map']")) return;
      if (event.key === "ArrowRight") setPosition((value) => ({ key: scopeKey, index: Math.min(calls.length - 1, (value.key === scopeKey ? value.index : 0) + 1) }));
      else if (event.key === "ArrowLeft") setPosition((value) => ({ key: scopeKey, index: Math.max(0, (value.key === scopeKey ? value.index : 0) - 1) }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calls.length, scopeKey]);

  const list = useRef<HTMLOListElement>(null);
  // Keep the current call in view inside the aside only; never scroll the page.
  useEffect(() => {
    const item = list.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const pane = item?.closest<HTMLElement>(".cl-insp");
    if (!item || !pane) return;
    const top = item.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    if (top < pane.scrollTop + 40 || top + item.offsetHeight > pane.scrollTop + pane.clientHeight - 16) pane.scrollTop = Math.max(0, top - pane.clientHeight / 2);
  }, [current, scopeKey]);

  if (!offering) return <Missing what="No such product" />;
  if (!def || !view) return <Missing what="No journey is modelled for this product yet" />;
  const name = (id?: string) => (id ? (systemById.get(id)?.name ?? (id.startsWith("team:") ? id.slice(5) : id === "channel" ? "Ordering channel" : id)) : "");
  const call = calls[current];
  const step = call ? view.steps.find((item) => item.id === call.step) : undefined;
  const setScope = (journey: string, nextChannel: string | null) => {
    const next = new URLSearchParams(params);
    next.set("journey", journey);
    if (nextChannel) next.set("channel", nextChannel);
    else next.delete("channel");
    setParams(next, { replace: true });
  };
  const channelName = (id: string) => data.channels.find((item) => item.id === id)?.name ?? id;
  const roles = (id: string) => impact?.systems.get(id)?.roles ?? [];
  const pick = (id: string | null) => {
    if (!id) return;
    const index = calls.findIndex((item) => [item.from, item.to, item.via].includes(id));
    if (index >= 0) go(index);
  };

  return (
    <>
      <ProductHeader
        offering={offering}
        current="architecture"
        actions={
          <Link className="cl-btn" to={journeyHref(def.id, channel)}>
            Open this journey's flow
          </Link>
        }
      />
      <div className="cl-toolbar">
        <div className="cl-chips" role="group" aria-label="Journey">
          <span className="cl-chiplabel" aria-hidden="true">
            Journey
          </span>
          {journeys.map((journey) => (
            <button key={journey.id} type="button" className="cl-chip" aria-pressed={journey.id === def.id} onClick={() => setScope(journey.id, journey.channels[0] ?? null)}>
              {journey.name}
            </button>
          ))}
        </div>
        {def.channels.length > 0 && (
          <div className="cl-chips" role="group" aria-label="Channel">
            <span className="cl-chiplabel" aria-hidden="true">
              Channel
            </span>
            {def.channels.map((item) => (
              <button key={item} type="button" className="cl-chip" aria-pressed={item === channel} onClick={() => setScope(def.id, item)}>
                {channelName(item)}
              </button>
            ))}
          </div>
        )}
        <div className="cl-stepper" role="group" aria-label="Step through the calls">
          <button type="button" className="cl-btn" aria-disabled={current === 0} aria-keyshortcuts="ArrowLeft" onClick={() => current > 0 && go(current - 1)}>
            Previous
          </button>
          <output aria-live="polite">{calls.length ? `Call ${current + 1} of ${calls.length}` : "No calls modelled"}</output>
          <button type="button" className="cl-btn primary" aria-disabled={current >= calls.length - 1} aria-keyshortcuts="ArrowRight" onClick={() => current < calls.length - 1 && go(current + 1)}>
            Next
          </button>
        </div>
      </div>
      <p className="cl-hint">
        {plural(lit.size, "system")} of {data.systems.length} lit · {plural(calls.length, "call")} for {def.name}
        {channel ? ` through ${channelName(channel)}` : ""}. Click a system to jump to its first call; ← and → step.
      </p>
      <div className="cl-board">
        <div className="cl-board-main">
          <Poster data={data} degrees={degrees} linkCounts={linkCounts} label={`${def.name} on the SMB architecture map`} selected={null} onSelect={pick} journey={journeyProp} />
        </div>
        <aside className="cl-insp" aria-labelledby="cl-call-h">
          {call ? (
            <>
              <p className="cl-sub">Call {current + 1}</p>
              <h2 id="cl-call-h">
                <span translate="no">{name(call.from)}</span> → <span translate="no">{name(call.to)}</span>
              </h2>
              <p className="cl-sub">
                {call.via ? `Through ${name(call.via)}. ` : ""}
                {step ? `During “${step.name}”.` : ""}
              </p>
              <p className="cl-body">{call.purpose}</p>
              <dl className="cl-pairs">
                <div>
                  <dt>Interface</dt>
                  <dd translate="no">{call.operation || "Not stated"}</dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>
                    {call.style}
                    {call.mode !== "not stated" ? ` · ${call.mode}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>TM Forum equivalent</dt>
                  <dd translate="no">{call.tmf ?? "None suggested"}</dd>
                </div>
              </dl>
              <EvidenceTag evidence={call.evidence} />
              {roles(call.to).length > 0 && (
                <ul className="cl-roles" aria-label={`${name(call.to)}'s roles in this journey`}>
                  {roles(call.to).map((role) => (
                    <li key={role} className="cl-role">
                      {ROLE_WORDS[role]}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <h2 id="cl-call-h">No calls modelled</h2>
          )}
          <h3>Footprint by layer</h3>
          <ul className="cl-bars">
            {footprint.map((row) => (
              <li key={row.domain.id}>
                <div className="cl-bar-row">
                  <span>{row.domain.name}</span>
                  <b>
                    {row.lit}/{row.total}
                  </b>
                  <i aria-hidden="true">
                    <i style={{ width: `${(row.lit / row.total) * 100}%` }} />
                  </i>
                </div>
              </li>
            ))}
          </ul>
          <h3>Every call, in order</h3>
          <ol className="cl-calls" ref={list}>
            {calls.map((item, index) => (
              <li key={item.id}>
                <button type="button" aria-current={index === current ? "step" : undefined} onClick={() => go(index)}>
                  <span className="n" aria-hidden="true">
                    {index + 1}
                  </span>
                  <strong>
                    <span translate="no">{name(item.from)}</span> → <span translate="no">{name(item.to)}</span>
                  </strong>
                  <span translate="no">{item.operation || item.purpose}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
