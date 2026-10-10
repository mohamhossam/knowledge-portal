/**
 * The product's other tabs: its place in the portfolio drawn as a tree, its
 * plans, its business rules and its components. Every fact keeps its evidence.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import type { Offering } from "../../architecture/model";
import { EvidenceTag } from "./CatalogueLab";
import { firstJourneyHref, journeyHref, LAB, useLabData, useOffering } from "./labData";
import { leadingNumber, plural, useTitle } from "./labUtil";
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
            <p className="cl-sub">
              {offering.orderTypes.length - journeys.filter((journey) => journey.orderType).length} more order types are listed but not modelled as journeys yet.
            </p>
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

/** The components: what each is, whether it is always included, its codes and the systems that deliver it. */
export function ProductComponents() {
  const data = useLabData();
  const offering = useOffering();
  useTitle(offering ? `${offering.name} components` : "Components");
  if (!offering) return <Missing what="No such product" />;
  const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
  const groups = [
    { id: "always", label: "Always included", items: offering.components.filter((item) => item.mandatory !== false) },
    { id: "optional", label: "Optional", items: offering.components.filter((item) => item.mandatory === false) },
  ].filter((group) => group.items.length);
  return (
    <>
      <ProductHeader offering={offering} current="components" />
      {groups.map((group) => (
        <section key={group.id} className="cl-section" aria-labelledby={`cl-comp-${group.id}`}>
          <h2 id={`cl-comp-${group.id}`} className="cl-section-h">
            {group.label} <small>{group.items.length}</small>
          </h2>
          <ul className="cl-compcards">
            {group.items.map((component) => (
              <li key={component.id} className={component.mandatory === false ? "optional" : undefined}>
                <h3>{component.name}</h3>
                <p>{component.description || "Its sources don't describe it."}</p>
                {(component.offerCode || component.specCode) && (
                  <dl className="cl-pairs">
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
                  <ul className="cl-delivers" aria-label="Systems that deliver it">
                    {component.systems.map((item) => (
                      <li key={item.systemId}>
                        <b translate="no">{name(item.systemId)}</b>
                        {item.responsibility && <span>{item.responsibility}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <EvidenceTag evidence={component.evidence} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
