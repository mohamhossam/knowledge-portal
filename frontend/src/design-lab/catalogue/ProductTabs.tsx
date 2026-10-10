/**
 * The product's other tabs: its place in the portfolio drawn as a tree, its
 * plans, its business rules and its components. Every fact keeps its evidence.
 */
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import type { Offering } from "../../architecture/model";
import { EvidenceTag } from "./CatalogueLab";
import { firstJourneyHref, journeyHref, LAB, useLabData, useOffering } from "./labData";
import { CAPABILITIES, capabilityOf, DEVICE_ICON } from "./capabilities";
import { leadingNumber, monogram, plural, useTitle } from "./labUtil";
import { domainRank } from "./posterModel";
import { Missing, Plans, ProductHeader } from "./ProductPage";

/** The portfolio from the business unit down to this offering, then what the offering is made of. */
export function ProductHierarchy() {
  const data = useLabData();
  const offering = useOffering();
  useTitle(offering ? `${offering.name} hierarchy` : "Hierarchy");
  if (!offering) return <Missing what="No such product" />;
  const path: typeof data.portfolio = [];
  let node = data.portfolio.find((item) => item.id === offering.nodeId);
  while (node) {
    path.unshift(node);
    const parent = node.parentId;
    node = parent ? data.portfolio.find((item) => item.id === parent) : undefined;
  }
  const offeringsUnder = (id: string) => data.offerings.filter((item) => item.nodeId === id).length;
  const childrenOf = (id: string) => data.portfolio.filter((item) => item.parentId === id).length;
  const journeys = data.journeys.filter((journey) => journey.offeringId === offering.id);
  const unmodelled = offering.orderTypes.filter((type) => !journeys.some((journey) => journey.orderType === type.code)).length;
  const short = (name: string) => name.replace(offering.name, "").trim() || name;
  return (
    <>
      <ProductHeader offering={offering} current="hierarchy" />
      <section className="cl-tree" aria-label={`Where ${offering.name} sits in the portfolio`}>
        <ol className="cl-tree-path">
          {path.map((item, index) => {
            const below = index < path.length - 1 ? childrenOf(item.id) : offeringsUnder(item.id);
            return (
              <li key={item.id} className="cl-tree-row">
                <span className="cl-tree-level">{item.level}</span>
                <div className="cl-tree-node">
                  <strong>{item.name}</strong>
                  {item.description && <span>{item.description}</span>}
                  <small>
                    {index < path.length - 1 ? plural(below, path[index + 1]?.level.toLowerCase() ?? "level") : plural(below, "offering")} modelled under it
                  </small>
                </div>
              </li>
            );
          })}
          <li className="cl-tree-row">
            <span className="cl-tree-level">Offering</span>
            <div className="cl-tree-node current" aria-current="page">
              <strong>{offering.name}</strong>
              <span>{offering.summary}</span>
              <EvidenceTag evidence={offering.evidence} />
            </div>
          </li>
        </ol>
        <div className="cl-tree-branches">
          <section className="cl-tree-branch" aria-labelledby="cl-br-plans">
            <h2 id="cl-br-plans">
              <Link to={`${LAB}/products/${offering.id}/plans`}>Plans</Link> <small>{offering.plans.length}</small>
            </h2>
            <ul>
              {offering.plans.map((plan) => (
                <li key={plan.name}>
                  <strong>{short(plan.name)}</strong>
                  <span>{plan.characteristics.find((item) => /upload/i.test(item.name))?.value ? `${plan.characteristics.find((item) => /upload/i.test(item.name))?.value} up` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="cl-tree-branch" aria-labelledby="cl-br-comps">
            <h2 id="cl-br-comps">
              <Link to={`${LAB}/products/${offering.id}/components`}>Components</Link> <small>{offering.components.length}</small>
            </h2>
            <ul>
              {offering.components.map((component) => (
                <li key={component.id} className={component.mandatory === false ? "optional" : undefined}>
                  <strong>{component.name}</strong>
                  <span>{component.mandatory === false ? "Optional" : "Always included"}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="cl-tree-branch" aria-labelledby="cl-br-journeys">
            <h2 id="cl-br-journeys">
              <Link to={firstJourneyHref(data, offering.id)}>Journeys</Link> <small>{journeys.length}</small>
            </h2>
            <ul>
              {journeys.map((journey) => (
                <li key={journey.id}>
                  <strong>
                    <Link to={journeyHref(journey.id, journey.channels[0])}>{journey.name}</Link>
                  </strong>
                  <span>{journey.channels.length ? plural(journey.channels.length, "channel") : "Every channel"}</span>
                </li>
              ))}
            </ul>
            {unmodelled > 0 && <p className="cl-sub">{plural(unmodelled, "more order type")} listed but not modelled as journeys yet.</p>}
          </section>
        </div>
      </section>
    </>
  );
}

/** Every plan as a card, then every characteristic compared. */
export function ProductPlans() {
  const offering = useOffering();
  useTitle(offering ? `${offering.name} plans` : "Plans");
  if (!offering) return <Missing what="No such product" />;
  const value = (plan: Offering["plans"][number], name: RegExp) => plan.characteristics.find((item) => name.test(item.name))?.value;
  const max = Math.max(1, ...offering.plans.map((plan) => leadingNumber(value(plan, /download/i) ?? "") ?? 0));
  return (
    <>
      <ProductHeader offering={offering} current="plans" />
      <ul className="cl-plancards">
        {offering.plans.map((plan) => {
          const down = value(plan, /download/i);
          const up = value(plan, /upload/i);
          return (
            <li key={plan.name}>
              <h2>{plan.name.replace(offering.name, "").trim() || plan.name}</h2>
              <p className="cl-plan-speed">
                <b>{down ?? "Not stated"}</b>
                <span>down{up ? ` · ${up} up` : ""}</span>
              </p>
              <i className="cl-spark wide" aria-hidden="true">
                <i style={{ width: `${((leadingNumber(down ?? "") ?? 0) / max) * 100}%` }} />
              </i>
              <dl className="cl-pairs">
                {plan.characteristics
                  .filter((item) => !/download|upload/i.test(item.name))
                  .map((item) => (
                    <div key={item.name}>
                      <dt>{item.name}</dt>
                      <dd translate="no">{item.value}</dd>
                    </div>
                  ))}
                <div>
                  <dt>Monthly price</dt>
                  <dd className="gap">Gap</dd>
                </div>
              </dl>
              <EvidenceTag evidence={plan.evidence} />
            </li>
          );
        })}
      </ul>
      <div className="cl-section">
        <Plans offering={offering} />
      </div>
    </>
  );
}

const KIND_WORDS: Record<string, string> = {
  composition: "Composition",
  fulfilment: "Fulfilment",
  dependency: "Dependency",
  lifecycle: "Lifecycle",
  billing: "Billing",
};

/** The business rules, filterable by what they govern. */
export function ProductRules() {
  const offering = useOffering();
  useTitle(offering ? `${offering.name} business rules` : "Business rules");
  const [kind, setKind] = useState<string | null>(null);
  if (!offering) return <Missing what="No such product" />;
  const kinds = [...new Set(offering.rules.map((rule) => rule.kind ?? "other"))];
  const shown = offering.rules.filter((rule) => !kind || (rule.kind ?? "other") === kind);
  const word = (value: string) => KIND_WORDS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
  return (
    <>
      <ProductHeader offering={offering} current="rules" />
      <div className="cl-toolbar">
        <div className="cl-chips" role="group" aria-label="What the rule governs">
          <button type="button" className="cl-chip" aria-pressed={kind === null} onClick={() => setKind(null)}>
            All <small>{offering.rules.length}</small>
          </button>
          {kinds.map((item) => (
            <button key={item} type="button" className="cl-chip" aria-pressed={kind === item} onClick={() => setKind(kind === item ? null : item)}>
              {word(item)} <small>{offering.rules.filter((rule) => (rule.kind ?? "other") === item).length}</small>
            </button>
          ))}
        </div>
      </div>
      <ol className="cl-rules">
        {shown.map((rule) => (
          <li key={rule.id}>
            <span className="cl-rule-id" translate="no">
              {rule.id}
            </span>
            <div>
              <span className={`cl-kind cl-kind--${rule.kind ?? "other"}`}>{word(rule.kind ?? "other")}</span>
              <p>{rule.statement}</p>
              <EvidenceTag evidence={rule.evidence} />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * The components, in two views of the same bundle. First, who delivers what:
 * every component against every system that plays a part in it, grouped by
 * what the component does for the customer, so the bundle reads straight into
 * the architecture. Then every component's card, labelled with its group: what
 * it is, whether it is always included, its codes, the systems that deliver it
 * and their part, and its source. The grouping is this catalogue's reading
 * (capabilities.tsx); the device is at the heart, anything unplaced is "More".
 */
export function ProductComponents() {
  const data = useLabData();
  const offering = useOffering();
  useTitle(offering ? `${offering.name} components` : "Components");
  if (!offering) return <Missing what="No such product" />;
  const system = (id: string) => data.systems.find((item) => item.id === id);
  const name = (id: string) => system(id)?.name ?? id;
  const hub = offering.components.find((item) => /device|router/i.test(item.name)) ?? offering.components.find((item) => /\bcpe\b/i.test(item.name));
  const groups = [
    ...(hub ? [{ id: "device", name: "At the heart", blurb: "The device the bundle is built on", icon: DEVICE_ICON, items: [hub] }] : []),
    ...CAPABILITIES.map((capability) => ({ ...capability, items: offering.components.filter((item) => item !== hub && capabilityOf(item.name)?.id === capability.id) })),
    { id: "more", name: "More", blurb: "Other parts of the bundle", icon: <path d="M3 8h.01M8 8h.01M13 8h.01" />, items: offering.components.filter((item) => item !== hub && !capabilityOf(item.name)) },
  ].filter((group) => group.items.length);
  // The systems that deliver any component, in map order (layer by layer), the busiest first within a layer.
  const parts = new Map<string, number>();
  for (const component of offering.components) for (const item of component.systems) parts.set(item.systemId, (parts.get(item.systemId) ?? 0) + 1);
  const columns = [...parts.keys()].sort((a, b) => domainRank(system(a)?.domain ?? "") - domainRank(system(b)?.domain ?? "") || (parts.get(b) ?? 0) - (parts.get(a) ?? 0));
  const optional = offering.components.filter((item) => item.mandatory === false).length;
  const tile = (id: string) => (
    <span className={`am-mono cl-systile tone--${system(id)?.domain ?? "customer"} am-mono--${monogram(name(id)).length}`} aria-hidden="true" translate="no">
      {monogram(name(id))}
    </span>
  );
  const groupIcon = (icon: ReactNode) => (
    <span className="cl-cap-icon">
      <svg className="cl-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {icon}
      </svg>
    </span>
  );

  return (
    <>
      <ProductHeader offering={offering} current="components" />
      <div className="cl-grid">
        <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cp-who-h">
          <h2 id="cp-who-h">
            Who delivers what{" "}
            <small>
              {plural(offering.components.length, "component")}
              {optional ? `, ${optional} optional` : ""} · {plural(columns.length, "system")} · a mark where a system plays a part
            </small>
          </h2>
          <div className="pv-panel cp-panel">
            <div className="cl-tablewrap" role="region" aria-label="Systems by component (scrolls sideways when narrow)" tabIndex={0}>
              <table className="cp-matrix">
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    {columns.map((id) => (
                      <th key={id} scope="col" className="cp-col">
                        {tile(id)}
                        <span className="cp-colname" translate="no">
                          {name(id)}
                        </span>
                        <small>{parts.get(id)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.id}>
                    <tr className="cp-group">
                      <th scope="rowgroup" colSpan={columns.length + 1}>
                        <svg className="cl-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          {group.icon}
                        </svg>
                        {group.name}
                      </th>
                    </tr>
                    {group.items.map((component) => (
                      <tr key={component.id} className={component.mandatory === false ? "is-optional" : undefined}>
                        <th scope="row">
                          {component.name}
                          {component.mandatory === false && <span className="cl-tag-optional">Optional</span>}
                        </th>
                        {columns.map((id) => {
                          const part = component.systems.find((item) => item.systemId === id);
                          return (
                            <td key={id} title={part ? `${name(id)}: ${part.responsibility || "plays a part"}` : undefined}>
                              {part ? <span className="cp-mark" role="img" aria-label={`${name(id)}: ${part.responsibility || "plays a part"}`} /> : <span className="ds-visually-hidden">Not {name(id)}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </section>

        <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cp-cards-h">
          <h2 id="cp-cards-h">
            Every component <small>what it is, its codes and the systems that deliver it, by what it does for the customer</small>
          </h2>
          <ul className="cp-cards">
            {groups.flatMap((group) =>
              group.items.map((component) => (
                <li key={component.id} className={`cp-card${component.mandatory === false ? " is-optional" : ""}`}>
                  <p className="cp-kind">
                    {groupIcon(group.icon)}
                    {group.name}
                  </p>
                  <header>
                    <h3>{component.name}</h3>
                    {component.mandatory === false ? <span className="cl-tag-optional">Optional</span> : <span className="cp-always">Always included</span>}
                  </header>
                  <p className="cp-desc">{component.description || "Its sources don't describe it."}</p>
                  {(component.offerCode || component.specCode) && (
                    <dl className="cp-codes">
                      {component.offerCode && (
                        <div>
                          <dt>Offer code</dt>
                          <dd translate="no">{component.offerCode}</dd>
                        </div>
                      )}
                      {component.specCode && (
                        <div>
                          <dt>Service spec</dt>
                          <dd translate="no">{component.specCode}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {component.systems.length > 0 && (
                    <>
                      <h4>Delivered by</h4>
                      <ul className="cp-delivers" aria-label={`Systems that deliver ${component.name}`}>
                        {component.systems.map((item) => (
                          <li key={item.systemId}>
                            {tile(item.systemId)}
                            <b translate="no">{name(item.systemId)}</b>
                            {item.responsibility && <span>{item.responsibility}</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <footer>
                    <EvidenceTag evidence={component.evidence} />
                  </footer>
                </li>
              )),
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
