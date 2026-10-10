/**
 * Mock-up 2: a product's page (its value proposition, bundle, customer
 * value, plans) and the header every product tab shares, so the product's
 * tabs stay in the same place. The Architecture tab is ProductArchitecture.tsx.
 */
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";

import { type Component, type Offering } from "../../architecture/model";
import { AreaTabs, EvidenceTag, PathBar } from "./CatalogueLab";
import { firstJourneyHref, journeyHref, LAB, useLabData, useOffering } from "./labData";
import { leadingNumber, listOf, monogram, plural, useTitle } from "./labUtil";
import { allViews } from "./posterModel";
import { CAPABILITIES, DEVICE_ICON } from "./capabilities";
import { STAGES, stageOfCode } from "./stages";

export function Missing({ what }: { what: string }) {
  return (
    <div className="cl-empty">
      <h1>{what}</h1>
      <p>
        It isn't in this catalogue version. <Link to={LAB}>Back to the landscape</Link>.
      </p>
    </div>
  );
}

export type ProductSection = "overview" | "hierarchy" | "plans" | "rules" | "components" | "journeys" | "architecture";

/** The product's header: where it sits, what it is for (one statement), and its tabs. */
export function ProductHeader({ offering, current, actions, compact = false }: { offering: Offering; current: ProductSection; actions?: ReactNode; compact?: boolean }) {
  const data = useLabData();
  const path: { id: string; name: string; level: string }[] = [];
  let node = data.portfolio.find((item) => item.id === offering.nodeId);
  while (node) {
    path.unshift({ id: node.id, name: node.name, level: node.level });
    const parent = node.parentId;
    node = parent ? data.portfolio.find((item) => item.id === parent) : undefined;
  }
  const views = useMemo(() => allViews(data).filter((view) => view.offeringId === offering.id), [data, offering]);
  const systems = new Set(
    views
      .flatMap((view) => [...view.steps.map((step) => step.lane), ...view.integrations.flatMap((call) => [call.from, call.to, call.via])])
      .filter((id): id is string => typeof id === "string" && data.systems.some((system) => system.id === id)),
  );
  const journeys = data.journeys.filter((journey) => journey.offeringId === offering.id);
  const base = `${LAB}/products/${offering.id}`;
  const tabs: { id: ProductSection; label: string; to: string }[] = [
    { id: "overview", label: "Overview", to: base },
    { id: "hierarchy", label: "Hierarchy", to: `${base}/hierarchy` },
    { id: "plans", label: "Plans", to: `${base}/plans` },
    { id: "rules", label: "Business rules", to: `${base}/rules` },
    { id: "components", label: "Components", to: `${base}/components` },
    { id: "journeys", label: "Journeys", to: firstJourneyHref(data, offering.id) },
    { id: "architecture", label: "Architecture", to: `${base}/architecture` },
  ];
  // One statement of what the product is for; the bundle drawing carries what is in it.
  const statement = offering.purpose || offering.summary;
  return (
    <>
      <AreaTabs current="products" />
      <PathBar
        label="Where it sits in the portfolio"
        items={[{ level: "Catalogue", name: "SMB architecture", to: LAB }, ...path.map((item) => ({ level: item.level, name: item.name, to: `${base}/hierarchy` })), { level: "Offering", name: offering.name }]}
      />
      <header className="cl-head">
        <div className="cl-head-text">
          <h1>{offering.name}</h1>
          {!compact && <p className="cl-lede">{statement}</p>}
          {!compact && <p className="cl-meta-line">
            {plural(offering.plans.length, "plan")} · {plural(offering.components.length, "component")} · {plural(offering.orderTypes.length, "order type")} · {plural(journeys.length, "journey")} modelled ·{" "}
            {plural(systems.size, "system")} touched
          </p>}
          {!compact && <EvidenceTag evidence={offering.evidence} />}
        </div>
        {actions && <div className="cl-head-actions">{actions}</div>}
      </header>
      <nav className="cl-tabs cl-tabs--sub" aria-label={`${offering.name} sections`}>
        {tabs.map((tab) => (
          <Link key={tab.id} to={tab.to} aria-current={tab.id === current ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/**
 * What the customer gets, drawn as the bundle's anatomy: the device at the
 * heart (its models as chips), then the components grouped by what they do
 * for the customer, joined to the device by one spine. Each component names
 * the systems that deliver it as the same monogram tiles the architecture map
 * uses, so the bundle reads straight into the architecture. Optional parts are
 * dashed. The grouping is this catalogue's reading, by keyword, so it works
 * for any product; anything it can't place falls under "More".
 */
function Glyph({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="cl-glyph" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {children}
    </svg>
  );
}

/** The systems that deliver a component, as the map's monogram tiles in their layer colours. */
function SystemTiles({ component, max = 3 }: { component: Component; max?: number }) {
  const data = useLabData();
  const systems = component.systems.map((item) => data.systems.find((system) => system.id === item.systemId)).filter((system) => system !== undefined);
  if (!systems.length) return <span className="cl-nosys">No system stated</span>;
  const shown = systems.slice(0, max);
  return (
    <span className="cl-systiles">
      <span className="ds-visually-hidden">Delivered by {listOf(systems.map((system) => system.name))}</span>
      {shown.map((system) => (
        <span key={system.id} className={`am-mono cl-systile tone--${system.domain} am-mono--${monogram(system.name).length}`} title={system.name} aria-hidden="true" translate="no">
          {monogram(system.name)}
        </span>
      ))}
      {systems.length > max && (
        <span className="cl-systile-more" aria-hidden="true">
          +{systems.length - max}
        </span>
      )}
    </span>
  );
}

function Bundle({ offering }: { offering: Offering }) {
  const hub = offering.components.find((item) => /device|router/i.test(item.name)) ?? offering.components.find((item) => /cpe/i.test(item.name)) ?? offering.components[0];
  const rest = offering.components.filter((item) => item !== hub);
  const hubName = hub ? hub.name.replace(/\s*\(.*\)\s*$/, "") : "";
  const hubModels = hub ? (/\((.*)\)/.exec(hub.name)?.[1] ?? "").split(/\s*\/\s*/).filter(Boolean) : [];
  // "Fortinet 90G / 120G": the second model takes the first one's maker.
  const maker = hubModels[0]?.split(/\s+/).slice(0, -1).join(" ") ?? "";
  const models = hubModels.map((model, index) => (index && maker && !model.includes(" ") ? `${maker} ${model}` : model));
  // The rule that says which model goes with which speed, when the offering has one.
  const modelRule = hub ? offering.rules.find((rule) => models.length > 1 && models.every((model) => rule.statement.includes(model.split(" ").at(-1) ?? model))) : undefined;
  const groups = [
    ...CAPABILITIES.map((capability) => ({
      ...capability,
      items: rest.filter((component) => {
        const first = CAPABILITIES.find((item) => item.test.test(component.name));
        return first?.id === capability.id;
      }),
    })),
    { id: "more", name: "More", blurb: "Other parts of the bundle", test: /$^/, icon: <path d="M3 8h.01M8 8h.01M13 8h.01" />, items: rest.filter((component) => !CAPABILITIES.some((item) => item.test.test(component.name))) },
  ].filter((group) => group.items.length);
  const always = offering.components.filter((item) => item.mandatory !== false).length;
  const optional = offering.components.length - always;

  return (
    <section className="cl-card cl-bundle" aria-labelledby="cl-bundle-h">
      <h2 id="cl-bundle-h">
        What's in the bundle{" "}
        <small>
          {plural(offering.components.length, "component")} · {always} always included{optional ? ` · ${optional} optional` : ""}
        </small>
      </h2>
      {hub && (
        <div className="cl-device">
          <span className="cl-device-icon">
            <Glyph size={22}>{DEVICE_ICON}</Glyph>
          </span>
          <div className="cl-device-text">
            <small>At the heart of the bundle</small>
            <strong>{hubName}</strong>
            {models.length > 0 && (
              <ul className="cl-models" aria-label="Models">
                {models.map((model) => (
                  <li key={model} translate="no">
                    {model}
                  </li>
                ))}
              </ul>
            )}
            {modelRule && <p className="cl-device-rule">{modelRule.statement}</p>}
          </div>
          <SystemTiles component={hub} />
        </div>
      )}
      <div className="cl-caps">
        {groups.map((group) => {
          const optionalOnly = group.items.every((item) => item.mandatory === false);
          return (
            <section key={group.id} className={`cl-cap${group.id === "resilience" ? " cl-cap--wide" : ""}${optionalOnly ? " is-optional" : ""}`} aria-labelledby={`cl-cap-${group.id}`}>
              <header>
                <span className="cl-cap-icon">
                  <Glyph>{group.icon}</Glyph>
                </span>
                <span>
                  <h3 id={`cl-cap-${group.id}`}>{group.name}</h3>
                  <small>{group.blurb}</small>
                </span>
                {optionalOnly && <span className="cl-tag-optional">Optional</span>}
              </header>
              <ul>
                {group.items.map((component) => (
                  <li key={component.id} className={component.mandatory === false ? "is-optional" : undefined}>
                    <span className="cl-part" title={component.description}>
                      {component.name}
                    </span>
                    <SystemTiles component={component} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="cl-sub">Grouped by what each part does for the customer: this catalogue's reading. The tiles are the systems that deliver each part.</p>
      <details className="cl-codes">
        <summary>
          Offer and service codes <small>{offering.components.length}</small>
        </summary>
        <table className="cl-codes-table" aria-label="Offer and service codes">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">Offer code</th>
              <th scope="col">Service code</th>
            </tr>
          </thead>
          <tbody>
            {offering.components.map((component) => (
              <tr key={component.id}>
                <th scope="row">{component.name}</th>
                <td translate="no">{component.offerCode || "Not stated"}</td>
                <td translate="no">{component.specCode || "Not stated"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** Plans side by side, differences first; what every plan shares is said once. */
export function Plans({ offering }: { offering: Offering }) {
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

/** Eligibility grouped by what it answers: who, where, on what terms, through which route. */
const ELIGIBILITY_GROUPS: { id: string; label: string; question: string; match: RegExp; icon: ReactNode }[] = [
  {
    id: "who",
    label: "Who",
    question: "Which customers",
    match: /segment|customer|audience|business/i,
    icon: (
      <>
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 14c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8" />
      </>
    ),
  },
  {
    id: "where",
    label: "Where",
    question: "Which locations",
    match: /location|area|site|coverage/i,
    icon: (
      <>
        <path d="M8 14.5s-4.5-4.2-4.5-7.8a4.5 4.5 0 0 1 9 0c0 3.6-4.5 7.8-4.5 7.8z" />
        <circle cx="8" cy="6.7" r="1.6" />
      </>
    ),
  },
  {
    id: "terms",
    label: "On what terms",
    question: "Contract and account",
    match: /commitment|contract|term|portal|account/i,
    icon: <path d="M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5M6 13h2.5" />,
  },
  {
    id: "how",
    label: "Through which route",
    question: "How the order arrives",
    match: /activation|migration|port|channel|order/i,
    icon: (
      <>
        <circle cx="3.5" cy="12.5" r="1.5" />
        <circle cx="12.5" cy="3.5" r="1.5" />
        <path d="M5 12.5h4.5a2 2 0 0 0 0-4h-3a2 2 0 0 1 0-4H11" />
      </>
    ),
  },
];

const CHANNEL_KINDS: Record<string, string> = { assisted: "Assisted", "self-service": "Self-service", system: "Systems" };

/**
 * Who can buy the offering and how its orders arrive. On the left, the
 * conditions answer four questions, each a card with its own icon; every
 * condition sits on a checklist line whose node shows how sure the catalogue is
 * (filled: confirmed, ring: inferred, dashed: a gap). On the right, every order
 * type against every ordering channel: rows grouped by the customer's stage
 * (join, change, support, leave), channels grouped by kind, each channel with
 * its monogram tile and how many order types it takes.
 */
function WhoCanBuy({ offering }: { offering: Offering }) {
  const data = useLabData();
  const grouped = new Map<string, Offering["eligibility"]>();
  for (const point of offering.eligibility) {
    const group = ELIGIBILITY_GROUPS.find((item) => item.match.test(point.title))?.id ?? "other";
    grouped.set(group, [...(grouped.get(group) ?? []), point]);
  }
  const groups = [...ELIGIBILITY_GROUPS, { id: "other", label: "Also", question: "Other conditions", match: /./, icon: <path d="M3 8h.01M8 8h.01M13 8h.01" /> }].filter((group) => grouped.has(group.id));
  const sure = { confirmed: 0, inferred: 0, gap: 0 };
  for (const point of offering.eligibility) sure[point.evidence.status] += 1;

  const channels = data.channels.filter((channel) => offering.orderTypes.some((type) => type.channels.includes(channel.id)));
  const kinds = [...new Set(channels.map((channel) => channel.kind))].map((kind) => ({ kind, channels: channels.filter((channel) => channel.kind === kind) }));
  const ordered = kinds.flatMap((item) => item.channels);
  const takes = (channelId: string) => offering.orderTypes.filter((type) => type.channels.includes(channelId)).length;
  const tone = (systemId: string) => data.systems.find((system) => system.id === systemId)?.domain ?? "customer";
  const stages = STAGES.map((stage) => ({ ...stage, types: offering.orderTypes.filter((type) => stageOfCode(type.code) === stage.id) })).filter((stage) => stage.types.length);
  const journeyFor = (code: string) => data.journeys.find((journey) => journey.offeringId === offering.id && journey.orderType === code);

  return (
    <section className="cl-card cl-span-12" aria-labelledby="cl-who-h">
      <h2 id="cl-who-h">
        Who can buy it, and how{" "}
        <small>
          {plural(offering.eligibility.length, "condition")} · {plural(offering.orderTypes.length, "order type")} · {plural(channels.length, "channel")}
        </small>
        <span className="cl-sure">
          <span className="cl-sure-item confirmed">
            <i aria-hidden="true" />
            {sure.confirmed} confirmed
          </span>
          {sure.inferred > 0 && (
            <span className="cl-sure-item inferred">
              <i aria-hidden="true" />
              {sure.inferred} inferred
            </span>
          )}
          {sure.gap > 0 && (
            <span className="cl-sure-item gap">
              <i aria-hidden="true" />
              {sure.gap} {sure.gap === 1 ? "gap" : "gaps"}
            </span>
          )}
        </span>
      </h2>
      <div className="cl-who">
        <div className="cl-elig">
          {groups.map((group) => (
            <section key={group.id} className="cl-elig-card" aria-labelledby={`cl-who-${group.id}`}>
              <header>
                <span className="cl-cap-icon">
                  <Glyph>{group.icon}</Glyph>
                </span>
                <span>
                  <h3 id={`cl-who-${group.id}`}>{group.label}</h3>
                  <small>{group.question}</small>
                </span>
              </header>
              <ul>
                {(grouped.get(group.id) ?? []).map((point) => (
                  <li key={point.title} className={`is-${point.evidence.status}`}>
                    <i className="cl-elig-node" aria-hidden="true" />
                    <strong>{point.title}</strong>
                    <p>{point.detail}</p>
                    <EvidenceTag evidence={point.evidence} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="cl-route">
          <h3>
            Ordering channels for each order type <small>grouped by the customer's stage</small>
          </h3>
          <div className="cl-tablewrap" role="region" aria-label="Channels by order type (scrolls sideways when narrow)" tabIndex={0}>
            <table className="cl-route-table">
              <thead>
                <tr className="cl-route-kinds">
                  <td />
                  {kinds.map((item) => (
                    <th key={item.kind} scope="colgroup" colSpan={item.channels.length}>
                      {CHANNEL_KINDS[item.kind] ?? item.kind}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th scope="col">Order type</th>
                  {ordered.map((channel) => (
                    <th key={channel.id} scope="col" className="cl-route-ch">
                      <span className={`am-mono cl-systile tone--${tone(channel.systemId)} am-mono--${monogram(channel.name).length}`} aria-hidden="true" translate="no">
                        {monogram(channel.name)}
                      </span>
                      <span className="cl-route-chname">{channel.name.replace(/\s*\(.*\)\s*$/, "")}</span>
                      <small>{takes(channel.id)}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              {stages.map((stage) => (
                <tbody key={stage.id}>
                  <tr className="cl-route-stage">
                    <th scope="rowgroup" colSpan={ordered.length + 1}>
                      {stage.name} <small>{stage.blurb} · {stage.types.length}</small>
                    </th>
                  </tr>
                  {stage.types.map((type) => {
                    const journey = journeyFor(type.code);
                    return (
                      <tr key={type.code}>
                        <th scope="row">
                          <span>{type.name}</span>
                          {journey && (
                            <Link className="cl-tag" to={journeyHref(journey.id, journey.channels[0])} aria-label={`${type.name} journey`}>
                              Journey
                            </Link>
                          )}
                        </th>
                        {type.channels.length === 0 ? (
                          <td className="cl-route-none" colSpan={ordered.length}>
                            No ordering channel stated
                          </td>
                        ) : (
                          ordered.map((channel) => (
                            <td key={channel.id}>
                              {type.channels.includes(channel.id) ? <span className="cl-dot" role="img" aria-label={`Through ${channel.name}`} /> : <span className="ds-visually-hidden">Not through {channel.name}</span>}
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Each plan's speeds, at a glance; the full comparison is on the Plans tab. */
function PlansAtAGlance({ offering }: { offering: Offering }) {
  const speed = (plan: Offering["plans"][number], name: RegExp) => plan.characteristics.find((item) => name.test(item.name))?.value;
  const max = Math.max(1, ...offering.plans.map((plan) => leadingNumber(speed(plan, /download/i) ?? "") ?? 0));
  return (
    <section className="cl-card cl-span-12" aria-labelledby="cl-glance-h">
      <h2 id="cl-glance-h">
        Plans at a glance <small>Prices are a gap: the SDD states none</small>
        <Link className="cl-h2-link" to={`${LAB}/products/${offering.id}/plans`}>
          Compare every characteristic
        </Link>
      </h2>
      <ul className="cl-glance">
        {offering.plans.map((plan) => {
          const down = speed(plan, /download/i);
          const up = speed(plan, /upload/i);
          const n = leadingNumber(down ?? "") ?? 0;
          return (
            <li key={plan.name}>
              <span className="cl-glance-name">{plan.name.replace(offering.name, "").trim() || plan.name}</span>
              <span className="cl-glance-speed">
                <b>{down ?? "Not stated"}</b> down{up ? ` · ${up} up` : ""}
              </span>
              <i className="cl-spark wide" aria-hidden="true">
                <i style={{ width: `${(n / max) * 100}%` }} />
              </i>
            </li>
          );
        })}
      </ul>
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
          <ul className="cl-phrases">
            {offering.values.map((value) => (
              <li key={value.title}>
                <p>
                  <strong>{value.title}:</strong> {value.detail}
                </p>
                <EvidenceTag evidence={value.evidence} />
              </li>
            ))}
          </ul>
        </section>
        <WhoCanBuy offering={offering} />
        <PlansAtAGlance offering={offering} />
      </div>
    </>
  );
}
