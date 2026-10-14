/**
 * Mock-up 2: a product's page (its value proposition, bundle, customer
 * value, plans) and the header every product tab shares, so the product's
 * tabs stay in the same place. The Architecture tab is ProductArchitecture.tsx.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Component, Offering } from "../../architecture/model";
import { EvidenceTag } from "./labChrome";
import { LabIcon } from "./labIcon";
import { Missing, ProductHeader } from "./productParts";
import { channelKindName, type EligibilityGroup, eligibilityGroup, hubOf } from "./catalogueRules";
import { firstJourneyHref, journeyHref, LAB, useLabData, useOffering } from "./labData";
import { leadingNumber, listOf, plural, useTitle } from "./labUtil";
import { CAPABILITIES, DEVICE_ICON } from "./capabilities";
import { STAGES, stageOfCode } from "./stages";
import { SystemMonogram } from "./SystemMonogram";

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
        <SystemMonogram key={system.id} name={system.name} tone={system.domain} title={system.name} />
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
  const hub = hubOf(offering);
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
    <section className="cl-card cl-span-7 pv-sec" aria-labelledby="cl-bundle-h">
      <h2 id="cl-bundle-h">
        What's in the bundle{" "}
        <small>
          {plural(offering.components.length, "component")} · {always} always included{optional ? ` · ${optional} optional` : ""}
        </small>
      </h2>
      <div className="pv-panel cl-bundle">
        {hub && (
          <div className="cl-device">
            <span className="cl-device-icon">
              <LabIcon size={22}>{DEVICE_ICON}</LabIcon>
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
                    <LabIcon>{group.icon}</LabIcon>
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
      </div>
    </section>
  );
}

/** Eligibility grouped by what it answers (eligibilityGroup): who, where, on what terms, through which route. */
const ELIGIBILITY_GROUPS: { id: EligibilityGroup; label: string; question: string; icon: ReactNode }[] = [
  {
    id: "who",
    label: "Who",
    question: "Which customers",
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
    icon: <path d="M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5M6 13h2.5" />,
  },
  {
    id: "how",
    label: "Through which route",
    question: "How the order arrives",
    icon: (
      <>
        <circle cx="3.5" cy="12.5" r="1.5" />
        <circle cx="12.5" cy="3.5" r="1.5" />
        <path d="M5 12.5h4.5a2 2 0 0 0 0-4h-3a2 2 0 0 1 0-4H11" />
      </>
    ),
  },
];


/**
 * Who can buy the offering and how its orders arrive, as two full-width
 * sections. First the conditions, four cards side by side, one per question,
 * each with its own icon; every condition sits on a checklist line whose node
 * shows how sure the catalogue is (filled: confirmed, ring: inferred, dashed: a
 * gap). Then every order type against every ordering channel: rows grouped by the customer's stage
 * (join, change, support, leave), channels grouped by kind, each channel with
 * its monogram tile and how many order types it takes.
 */
function WhoCanBuy({ offering }: { offering: Offering }) {
  const data = useLabData();
  const grouped = new Map<string, Offering["eligibility"]>();
  for (const point of offering.eligibility) {
    const group = eligibilityGroup(point.title);
    grouped.set(group, [...(grouped.get(group) ?? []), point]);
  }
  const groups = [...ELIGIBILITY_GROUPS, { id: "other" as const, label: "Also", question: "Other conditions", icon: <path d="M3 8h.01M8 8h.01M13 8h.01" /> }].filter((group) => grouped.has(group.id));
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
    <>
      <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cl-who-h">
        <h2 id="cl-who-h">
          Who can buy it <small>{plural(offering.eligibility.length, "condition")}, by the question each answers</small>
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
        <div className="cl-elig">
          {groups.map((group) => (
            <section key={group.id} className="cl-elig-card" aria-labelledby={`cl-who-${group.id}`}>
              <header>
                <span className="cl-cap-icon">
                  <LabIcon>{group.icon}</LabIcon>
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
      </section>
      <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cl-route-h">
        <h2 id="cl-route-h">
          How each order type is placed{" "}
          <small>
            {plural(offering.orderTypes.length, "order type")} · {plural(channels.length, "ordering channel")} · grouped by the customer's stage
          </small>
        </h2>
        <div className="pv-panel cl-route">
          <div className="cl-tablewrap" role="region" aria-label="Channels by order type (scrolls sideways when narrow)" tabIndex={0}>
            <table className="cl-route-table">
              <thead>
                <tr className="cl-route-kinds">
                  <td />
                  {kinds.map((item) => (
                    <th key={item.kind} scope="colgroup" colSpan={item.channels.length}>
                      {channelKindName(data, item.kind)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th scope="col">Order type</th>
                  {ordered.map((channel) => (
                    <th key={channel.id} scope="col" className="cl-route-ch">
                      <SystemMonogram name={channel.name} tone={tone(channel.systemId)} />
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
      </section>
    </>
  );
}

/** Each plan's speeds, at a glance; the full comparison is on the Plans tab. */
function PlansAtAGlance({ offering }: { offering: Offering }) {
  const speed = (plan: Offering["plans"][number], name: RegExp) => plan.characteristics.find((item) => name.test(item.name))?.value;
  const max = Math.max(1, ...offering.plans.map((plan) => leadingNumber(speed(plan, /download/i) ?? "") ?? 0));
  return (
    <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cl-glance-h">
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
        <section className="cl-card cl-span-5 pv-sec" aria-labelledby="cl-values-h">
          <h2 id="cl-values-h">
            Customer value <small>{plural(offering.values.length, "reason")} a business buys it</small>
          </h2>
          <div className="pv-panel">
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
          </div>
        </section>
        <WhoCanBuy offering={offering} />
        <PlansAtAGlance offering={offering} />
      </div>
    </>
  );
}
