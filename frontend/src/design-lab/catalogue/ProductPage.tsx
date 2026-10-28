/**
 * Mock-up 2: a product's page (its value proposition, bundle, customer
 * value, plans) and the header every product tab shares, so the product's
 * tabs stay in the same place. The Architecture tab is ProductArchitecture.tsx.
 */
import { Link } from "react-router-dom";

import type { Component, Offering } from "../../catalogue/model/model";
import { EvidenceTag } from "./labChrome";
import { LabIcon } from "./labIcon";
import { Missing, ProductHeader } from "./productParts";
import { hubOf, isPriced, planFigures } from "./catalogueRules";
import { firstJourneyHref, LAB, toneOf, useLabData, useOffering } from "./labData";
import { listOf, plural, useTitle } from "./labUtil";
import { DEVICE_ICON, kindOf, partKinds } from "./capabilities";
import { SystemMonogram } from "./SystemMonogram";

import { WhoCanBuy } from "./WhoCanBuy";
import { gapSource } from "./words";
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
        <SystemMonogram key={system.id} name={system.name} tone={toneOf(data, system.domain)} title={system.name} />
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
  const data = useLabData();
  const hub = hubOf(offering);
  const rest = offering.components.filter((item) => item !== hub);
  const groups = partKinds(data)
    .map((kind) => ({ ...kind, items: rest.filter((component) => kindOf(data, component).id === kind.id) }))
    .filter((group) => group.items.length);
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
              <strong>{hub.name}</strong>
              {hub.description && <p className="cl-device-rule">{hub.description}</p>}
            </div>
            <SystemTiles component={hub} />
          </div>
        )}
        <div className="cl-caps">
          {groups.map((group) => {
            const optionalOnly = group.items.every((item) => item.mandatory === false);
            return (
              <section key={group.id} className={`cl-cap${groups.length % 2 && group === groups.at(-1) ? " cl-cap--wide" : ""}${optionalOnly ? " is-optional" : ""}`} aria-labelledby={`cl-cap-${group.id}`}>
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
        <p className="cl-sub">Grouped by each part's kind, as the catalogue states it. The tiles are the systems that deliver each part.</p>
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

/** Each plan's headline figures, at a glance; the full comparison is on the Plans tab. */
function PlansAtAGlance({ offering }: { offering: Offering }) {
  const data = useLabData();
  const max = Math.max(1, ...offering.plans.map((plan) => planFigures(plan)[0]?.amount ?? 0));
  const priced = isPriced(offering);
  return (
    <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cl-glance-h">
      <h2 id="cl-glance-h">
        Plans at a glance {!priced && <small>Prices are a gap: {gapSource(data, offering)} states none</small>}
        <Link className="cl-h2-link" to={`${LAB}/products/${offering.id}/plans`}>
          Compare every characteristic
        </Link>
      </h2>
      <ul className="cl-glance">
        {offering.plans.map((plan) => {
          const [first, second] = planFigures(plan);
          const n = first?.amount ?? 0;
          return (
            <li key={plan.name}>
              <span className="cl-glance-name">{plan.name.replace(offering.name, "").trim() || plan.name}</span>
              <span className="cl-glance-speed">
                {first ? (
                  <>
                    <b>{first.value}</b> {first.name.toLocaleLowerCase()}
                    {second ? ` · ${second.value} ${second.name.toLocaleLowerCase()}` : ""}
                  </>
                ) : (
                  "No figures stated"
                )}
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
