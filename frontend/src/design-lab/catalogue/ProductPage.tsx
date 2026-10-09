/**
 * Mock-ups 2 and 3: a product's page (its value proposition, bundle, customer
 * value and plans) and its Architecture tab (the landscape poster with one
 * journey's systems lit and its calls stepped through in order).
 */
import { type ReactNode, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { journeyView } from "../../architecture/adapter";
import { type Component, ROLE_WORDS, type Offering } from "../../architecture/model";
import { impactOf } from "../../architecture/impact";
import { EvidenceTag } from "./CatalogueLab";
import { LAB, useLabData } from "./labData";
import { Poster } from "./poster";
import { integrationCounts, layoutPoster, links } from "./posterModel";

const VALUE_GLYPH = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.2 10.3l2.5 2.5 5.1-5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function useOffering(): Offering | null {
  const data = useLabData();
  const { offeringId } = useParams();
  return data.offerings.find((item) => item.id === offeringId) ?? null;
}

function Crumbs({ offering }: { offering: Offering }) {
  const data = useLabData();
  const path: string[] = [];
  let node = data.portfolio.find((item) => item.id === offering.nodeId);
  while (node) {
    path.unshift(node.name);
    const parent = node.parentId;
    node = parent ? data.portfolio.find((item) => item.id === parent) : undefined;
  }
  return (
    <nav className="cl-crumbs" aria-label="Where it sits in the portfolio">
      <Link to={LAB}>Catalogue</Link>
      <span aria-hidden="true">›</span>
      <span>Products</span>
      {path.map((name) => (
        <span key={name} style={{ display: "contents" }}>
          <span aria-hidden="true">›</span>
          <span>{name}</span>
        </span>
      ))}
    </nav>
  );
}

function ProductTabs({ offering, current }: { offering: Offering; current: "overview" | "architecture" }) {
  const tabs: { id: string; label: string; to?: string }[] = [
    { id: "overview", label: "Overview", to: `${LAB}/products/${offering.id}` },
    { id: "plans", label: `Plans · ${offering.plans.length}` },
    { id: "rules", label: `Business rules · ${offering.rules.length}` },
    { id: "components", label: `Components · ${offering.components.length}` },
    { id: "journeys", label: "Journeys", to: `${LAB}/journeys/bpp-new-activation?channel=bcrm` },
    { id: "architecture", label: "Architecture", to: `${LAB}/products/${offering.id}/architecture` },
  ];
  return (
    <nav className="cl-tabs" aria-label={`${offering.name} sections`}>
      {tabs.map((tab) =>
        tab.to ? (
          <Link key={tab.id} to={tab.to} aria-current={tab.id === current ? "page" : undefined}>
            {tab.label}
          </Link>
        ) : (
          <button key={tab.id} type="button" aria-disabled="true" title="Shown on the Overview in these mock-ups">
            {tab.label}
          </button>
        ),
      )}
    </nav>
  );
}

/** The bundle drawn as what the customer gets: the device at its core, what is always in it, what can be added. */
function Bundle({ offering }: { offering: Offering }) {
  const data = useLabData();
  const hub = offering.components.find((item) => /device|router/i.test(item.name)) ?? offering.components.find((item) => /cpe/i.test(item.name)) ?? offering.components[0];
  const core = offering.components.filter((item) => item !== hub && item.mandatory !== false);
  const optional = offering.components.filter((item) => item !== hub && item.mandatory === false);
  const systems = (component: Component) =>
    component.systems
      .map((item) => data.systems.find((system) => system.id === item.systemId)?.name ?? item.systemId)
      .slice(0, 3)
      .join(" · ");
  const tile = (component: Component, kind: string) => (
    <div key={component.id} className={`cl-comp ${kind}`}>
      <strong>{component.name}</strong>
      <span>{[component.offerCode, systems(component)].filter(Boolean).join(" · ") || "No code or system stated"}</span>
    </div>
  );
  return (
    <section className="cl-bundle" aria-labelledby="cl-bundle-h">
      <h2 id="cl-bundle-h">
        What's in the bundle<small>{offering.components.length} components</small>
      </h2>
      {hub && <div className="cl-bundle-core">{tile(hub, "hub")}</div>}
      <div className="cl-bundle-core">{core.map((component) => tile(component, ""))}</div>
      {optional.length > 0 && (
        <div className="cl-bundle-opt">
          <span>Optional</span>
          {optional.map((component) => tile(component, "optional"))}
        </div>
      )}
    </section>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="cl-section">
      <h2>
        {title}
        {note && <small>{note}</small>}
      </h2>
      {children}
    </section>
  );
}

export function ProductOverview() {
  const data = useLabData();
  const offering = useOffering();
  if (!offering) return <p>No such product in this catalogue version.</p>;
  const journeys = data.journeys.filter((journey) => journey.offeringId === offering.id);
  const characteristics = [...new Set(offering.plans.flatMap((plan) => plan.characteristics.map((item) => item.name)))];
  const priced = offering.plans.some((plan) => plan.characteristics.some((item) => /price|fee|aed/i.test(item.name)));
  return (
    <>
      <Crumbs offering={offering} />
      <div className="cl-hero">
        <div>
          <h1>{offering.name}</h1>
          <p className="cl-prop">{offering.summary}</p>
          <div style={{ marginTop: 10 }}>
            <EvidenceTag evidence={offering.evidence} />
          </div>
          <div className="cl-facts">
            <div>
              <span>Plans</span>
              <b>{offering.plans.length}</b>
            </div>
            <div>
              <span>Components</span>
              <b>{offering.components.length}</b>
            </div>
            <div>
              <span>Order types</span>
              <b>{offering.orderTypes.length}</b>
            </div>
            <div>
              <span>Journeys modelled</span>
              <b>{journeys.length}</b>
            </div>
          </div>
          <div className="cl-hero-actions">
            <Link className="cl-btn primary" to={`${LAB}/products/${offering.id}/architecture`}>
              See its architecture
            </Link>
            <Link className="cl-btn" to={`${LAB}/journeys/bpp-new-activation?channel=bcrm`}>
              New activation flow
            </Link>
          </div>
        </div>
        <Bundle offering={offering} />
      </div>
      <ProductTabs offering={offering} current="overview" />

      <Section title="Customer value" note={`${offering.values.length} reasons a business buys it`}>
        <div className="cl-values">
          {offering.values.map((value) => (
            <article key={value.title} className="cl-value">
              <h3>
                {VALUE_GLYPH}
                {value.title}
              </h3>
              <p>{value.detail}</p>
              <EvidenceTag evidence={value.evidence} />
            </article>
          ))}
        </div>
      </Section>

      <div className="cl-two">
        <Section title="Plans compared" note={priced ? undefined : "Prices are a gap: the SDD states none"}>
          <table className="cl-table">
            <thead>
              <tr>
                <th scope="col">Characteristic</th>
                {offering.plans.map((plan) => (
                  <th key={plan.name} scope="col" className="plan">
                    {plan.name.replace(offering.name, "").trim() || plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {characteristics.map((name) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {offering.plans.map((plan) => (
                    <td key={plan.name}>{plan.characteristics.find((item) => item.name === name)?.value ?? <span className="gap">Not stated</span>}</td>
                  ))}
                </tr>
              ))}
              {!priced && (
                <tr>
                  <th scope="row">Monthly price</th>
                  {offering.plans.map((plan) => (
                    <td key={plan.name}>
                      <span className="gap">Gap</span>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </Section>
        <Section title="Who it can be sold to" note={`${offering.eligibility.length} conditions`}>
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
        </Section>
      </div>

      <Section title="What it's for">
        <p className="cl-prop" style={{ marginTop: 12 }}>
          {offering.purpose}
        </p>
      </Section>
    </>
  );
}

export function ProductArchitecture() {
  const data = useLabData();
  const offering = useOffering();
  const [params, setParams] = useSearchParams();
  const journeys = useMemo(() => data.journeys.filter((journey) => journey.offeringId === offering?.id), [data, offering]);
  const journeyId = params.get("journey") ?? journeys[0]?.id ?? "";
  const def = journeys.find((journey) => journey.id === journeyId) ?? journeys[0];
  const channel = params.get("channel") && def?.channels.includes(params.get("channel") as string) ? params.get("channel") : def?.channels[0] ?? null;
  const view = useMemo(() => (def ? journeyView(data, def.id, channel) : null), [data, def, channel]);
  // The step-through restarts whenever the journey or channel changes.
  const scopeKey = `${view?.id ?? ""}:${view?.channel ?? ""}`;
  const [position, setPosition] = useState({ key: scopeKey, index: 0 });
  const current = position.key === scopeKey ? position.index : 0;
  const setCurrent = (next: (value: number) => number) => setPosition({ key: scopeKey, index: next(current) });

  const layout = useMemo(() => layoutPoster(data), [data]);
  const calls = useMemo(() => view?.integrations ?? [], [view]);
  const linkCounts = useMemo(() => links(data, calls), [data, calls]);
  const counts = useMemo(() => integrationCounts(calls), [calls]);
  const impact = useMemo(() => (offering && def ? impactOf(data, { offeringId: offering.id, orderType: def.orderType, channel }) : null), [data, offering, def, channel]);

  const lit = useMemo(() => {
    const order = new Map<string, { order: number; channelEntry?: boolean }>();
    const known = new Set(data.systems.map((system) => system.id));
    const add = (id?: string) => {
      if (id && known.has(id) && !order.has(id)) order.set(id, { order: order.size + 1 });
    };
    for (const key of Object.keys(view?.laneLabels ?? {})) add(key);
    for (const call of calls) {
      add(call.from);
      add(call.via);
      add(call.to);
    }
    for (const step of view?.steps ?? []) add(step.lane);
    return order;
  }, [data, view, calls]);

  if (!offering || !def || !view) return <p>No journey is modelled for this product yet.</p>;
  const name = (id?: string) => (id ? (data.systems.find((system) => system.id === id)?.name ?? (id.startsWith("team:") ? id.slice(5) : id === "channel" ? "Ordering channel" : id)) : "");
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

  return (
    <>
      <Crumbs offering={offering} />
      <div className="cl-head">
        <div>
          <h1>{offering.name}</h1>
          <p className="cl-lede">
            Its footprint on the SMB architecture: <strong>{lit.size} of {data.systems.length} systems</strong> and <strong>{calls.length} calls</strong> for {def.name.toLowerCase()}
            {channel ? ` through ${channelName(channel)}` : ""}.
          </p>
        </div>
        <div className="cl-head-actions">
          <Link className="cl-btn" to={`${LAB}/journeys/${def.id}${channel ? `?channel=${channel}` : ""}`}>
            Open the flow
          </Link>
        </div>
      </div>
      <ProductTabs offering={offering} current="architecture" />
      <div className="cl-journeybar">
        <div className="cl-chips" role="group" aria-label="Journey">
          <span className="cl-chiplabel">Journey</span>
          {journeys.map((journey) => (
            <button key={journey.id} type="button" className="cl-chip" aria-pressed={journey.id === def.id} onClick={() => setScope(journey.id, journey.channels[0] ?? null)}>
              {journey.name}
            </button>
          ))}
        </div>
        {def.channels.length > 0 && (
          <div className="cl-chips" role="group" aria-label="Channel">
            <span className="cl-chiplabel">Channel</span>
            {def.channels.map((item) => (
              <button key={item} type="button" className="cl-chip" aria-pressed={item === channel} onClick={() => setScope(def.id, item)}>
                {channelName(item)}
              </button>
            ))}
          </div>
        )}
        <div className="cl-stepper">
          <button type="button" className="cl-btn" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0} aria-label="Previous call">
            Previous
          </button>
          <output aria-live="polite">
            Call {current + 1} of {calls.length}
          </output>
          <button type="button" className="cl-btn primary" onClick={() => setCurrent((value) => Math.min(calls.length - 1, value + 1))} disabled={current >= calls.length - 1} aria-label="Next call">
            Next
          </button>
        </div>
      </div>
      <div className="cl-board journey">
        <Poster layout={layout} linkCounts={linkCounts} counts={counts} selected={null} onSelect={() => undefined} lit={lit} calls={calls} current={current} label={`${def.name} on the SMB architecture`} />
        <aside className="cl-insp">
          {call && (
            <>
              <p className="cl-sub">
                Call {current + 1}
                {step ? ` · during “${step.name}”` : ""}
              </p>
              <h2>
                {name(call.from)} → {name(call.to)}
              </h2>
              {call.via && <p className="cl-sub">through {name(call.via)}</p>}
              <p style={{ marginTop: 6 }}>{call.purpose}</p>
              <div className="cl-kv">
                <span>Interface</span>
                <b>{call.operation || "Not stated"}</b>
              </div>
              <div className="cl-kv">
                <span>Style</span>
                <b>
                  {call.style}
                  {call.mode !== "not stated" ? ` · ${call.mode}` : ""}
                </b>
              </div>
              <div className="cl-kv">
                <span>TM Forum equivalent</span>
                <b>{call.tmf ?? "None suggested"}</b>
              </div>
              <div style={{ marginTop: 8 }}>
                <EvidenceTag evidence={call.evidence} />
              </div>
              {roles(call.to).length > 0 && (
                <div className="cl-roles" aria-label={`${name(call.to)}'s roles in this journey`}>
                  {roles(call.to).map((role) => (
                    <span key={role} className="cl-role">
                      {ROLE_WORDS[role]}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <h3>Every call, in order</h3>
          <ol className="cl-calls">
            {calls.map((item, index) => (
              <li key={item.id}>
                <button type="button" aria-current={index === current ? "step" : undefined} onClick={() => setCurrent(() => index)}>
                  <span className="n">{index + 1}</span>
                  <strong>
                    {name(item.from)} → {name(item.to)}
                  </strong>
                  <span>{item.operation || item.purpose}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}

