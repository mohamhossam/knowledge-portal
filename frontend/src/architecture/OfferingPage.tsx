import { CircleCheck, CircleDashed, Minus } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { type Column, DataTable, EmptyState, Facts, Section, Tabs } from "../design/components";
import { type CatalogueData, journeyViews } from "./adapter";
import { impactOf } from "./impact";
import { type Component, type Offering, type Plan, ROLE_WORDS, type Rule } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, SystemLink } from "./parts";
import { pathTo } from "./portfolio";
import { useImpliedScope, useScope, withScope } from "./scope";

type Tab = "overview" | "plans" | "rules" | "components" | "journeys" | "impact";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plans", label: "Plans & prices" },
  { id: "rules", label: "Business rules" },
  { id: "components", label: "Components" },
  { id: "journeys", label: "Journeys" },
  { id: "impact", label: "Impact" },
];

const sentence = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

function OfferingView({ data, offering }: { data: CatalogueData; offering: Offering }) {
  const [scope] = useScope(data);
  useImpliedScope({ product: offering.id });
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "overview") as Tab;
  const scoped = scope.product === offering.id;
  const impact = useMemo(
    () => impactOf(data, { offeringId: offering.id, orderType: scoped ? scope.order : null, channel: scoped ? scope.channel : null }),
    [data, offering.id, scoped, scope.order, scope.channel],
  );

  // A plan's columns are its characteristics, in the order the sources first state them.
  const characteristics = [...new Set(offering.plans.flatMap((plan) => plan.characteristics.map((item) => item.name)))];
  const planColumns: Column<Plan>[] = [
    { id: "name", header: "Plan", rowHeader: true, cell: (plan) => plan.name },
    ...characteristics.map((name) => ({ id: name, header: name, cell: (plan: Plan) => plan.characteristics.find((item) => item.name === name)?.value ?? "—" })),
    { id: "price", header: "Monthly price", cell: () => <span className="arch-gap"><CircleDashed size={14} aria-hidden="true" /> Not provided yet</span> },
  ];
  const ruleColumns: Column<Rule>[] = [
    { id: "id", header: "Rule", width: "4rem", cell: (rule) => rule.id },
    { id: "statement", header: "Statement", rowHeader: true, cell: (rule) => rule.statement },
    { id: "kind", header: "Kind", cell: (rule) => (rule.kind ? sentence(rule.kind) : "—") },
    { id: "evidence", header: "Evidence", cell: (rule) => <EvidenceMark evidence={rule.evidence} /> },
  ];
  const componentColumns: Column<Component>[] = [
    { id: "name", header: "Component", rowHeader: true, cell: (component) => (
      <>
        <span className="arch-strong">{component.name}</span>
        <span className="arch-detail">{component.description}</span>
      </>
    ) },
    { id: "codes", header: "Offer · specification", cell: (component) => (
      component.offerCode || component.specCode ? (
        <>
          <code translate="no">{component.offerCode ?? "—"}</code>
          <span className="arch-detail"><code translate="no">{component.specCode ?? "—"}</code></span>
        </>
      ) : <span className="arch-quiet">Codes not stated</span>
    ) },
    { id: "mandatory", header: "In every bundle", cell: (component) => (component.mandatory === null ? "Not stated" : component.mandatory ? "Mandatory" : "Optional") },
    { id: "systems", header: "Systems responsible", cell: (component) => (
      component.systems.length ? (
        <ul className="arch-inline-list">
          {component.systems.map((item) => (
            <li key={`${item.systemId}-${item.responsibility}`}><SystemLink id={item.systemId} />: {item.responsibility}</li>
          ))}
        </ul>
      ) : <span className="arch-quiet">None named</span>
    ) },
    { id: "evidence", header: "Evidence", cell: (component) => <EvidenceMark evidence={component.evidence} /> },
  ];

  const channels = data.channels.filter((channel) => offering.orderTypes.some((item) => item.channels.includes(channel.id)));
  const byDomain = data.domains
    .map((domain) => ({ domain, items: [...impact.systems.values()].filter((item) => data.systems.find((system) => system.id === item.systemId)?.domain === domain.id) }))
    .filter((group) => group.items.length);
  const narrowed = scoped && (scope.order || scope.channel);

  return (
    <>
      <Facts
        items={[
          ["Portfolio", pathTo(data.portfolio, offering.nodeId).map((node) => node.name).join(" › ") || "Not placed"],
          ["Order types", `${offering.orderTypes.length} supported · ${data.journeys.filter((journey) => journey.offeringId === offering.id && journey.orderType).length} journeys modelled`],
          ["Evidence", <EvidenceMark key="e" evidence={offering.evidence} />],
        ]}
      />
      <Tabs<Tab>
        label="Product views"
        tabs={TABS}
        selected={tab}
        onSelect={(next) => setParams((previous) => {
          const merged = new URLSearchParams(previous);
          if (next === "overview") merged.delete("tab");
          else merged.set("tab", next);
          return merged;
        }, { replace: true })}
      >
        {tab === "overview" && (
          <div className="arch-stack">
            <Section title="What it's for">
              <p className="arch-reading">{offering.purpose || "Not stated by its sources."}</p>
            </Section>
            <Section title="Customer value" count={offering.values.length}>
              <ul className="arch-points">
                {offering.values.map((point) => (
                  <li key={point.title}><span className="arch-strong">{point.title}.</span> {point.detail} <EvidenceMark evidence={point.evidence} /></li>
                ))}
              </ul>
            </Section>
            <Section title="Who it can be sold to" count={offering.eligibility.length}>
              <ul className="arch-points">
                {offering.eligibility.map((point) => (
                  <li key={point.title}><span className="arch-strong">{point.title}.</span> {point.detail} <EvidenceMark evidence={point.evidence} /></li>
                ))}
              </ul>
            </Section>
          </div>
        )}
        {tab === "plans" && (
          <div className="arch-stack">
            <DataTable caption={`Plans: ${offering.plans.length}`} columns={planColumns} rows={offering.plans} rowId={(plan) => plan.name} emptyText="Its sources describe no plans." />
            <p className="arch-note">
              {offering.plans[0] && <EvidenceMark evidence={offering.plans[0].evidence} />} Prices are read live from the product catalog and are not kept in the catalogue; the sources state none.
            </p>
          </div>
        )}
        {tab === "rules" && <DataTable caption={`Business rules: ${offering.rules.length}`} columns={ruleColumns} rows={offering.rules} rowId={(rule) => rule.id} emptyText="Its sources state no business rules." />}
        {tab === "components" && <DataTable caption={`Components: ${offering.components.length}`} columns={componentColumns} rows={offering.components} rowId={(component) => component.id} />}
        {tab === "journeys" && (
          <div className="arch-stack">
            <p>Each cell is one order type through one channel. Open a modelled journey to see its flow, integrations and tracking.</p>
            <div className="arch-matrix-scroll" role="region" aria-label="Journeys by order type and channel (scrolls sideways)" tabIndex={0}>
              <table className="arch-matrix">
                <caption className="ds-visually-hidden">Journeys of {offering.name} by order type and channel</caption>
                <thead>
                  <tr>
                    <th scope="col">Order type</th>
                    {channels.map((channel) => <th key={channel.id} scope="col">{channel.name}</th>)}
                    <th scope="col">Drop</th>
                  </tr>
                </thead>
                <tbody>
                  {offering.orderTypes.map((type) => (
                    <tr key={type.code}>
                      <th scope="row">
                        {type.name} <code translate="no">{type.code}</code>
                        {type.note && <span className="arch-detail">{type.note}</span>}
                      </th>
                      {channels.map((channel) => {
                        const journey = journeyViews(data, offering.id, type.code, channel.id)[0];
                        const offered = type.channels.includes(channel.id);
                        return (
                          <td key={channel.id} className={journey ? "arch-matrix__modelled" : undefined}>
                            {journey ? (
                              <Link to={withScope(`${BASE}/journeys/${journey.id}`, scope, { channel: channel.id })}><CircleCheck size={14} aria-hidden="true" /> Open flow</Link>
                            ) : offered ? (
                              <span className="arch-gap arch-gap--cell"><CircleDashed size={14} aria-hidden="true" /> Not modelled</span>
                            ) : (
                              <span className="arch-quiet"><Minus size={14} aria-hidden="true" /><span className="ds-visually-hidden">Not offered</span></span>
                            )}
                          </td>
                        );
                      })}
                      <td>{type.priority ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === "impact" && (
          <div className="arch-stack">
            <p>
              {narrowed ? "In the scope chosen above, " : "Across every modelled journey, "}
              {offering.name} touches <span className="arch-strong">{impact.systems.size} systems</span> in {byDomain.length} TAM domains.{" "}
              <Link to={withScope(BASE, { ...scope, product: offering.id })}>See them on the landscape</Link>
            </p>
            {byDomain.map(({ domain, items }) => (
              <Section key={domain.id} title={domain.name} count={items.length}>
                <ul className="arch-impact-list">
                  {items.map((item) => (
                    <li key={item.systemId}>
                      <SystemLink id={item.systemId} />
                      <span className="arch-quiet"> · {item.roles.length ? item.roles.map((role) => ROLE_WORDS[role]).join(", ") : item.carriesOnly ? "Carries the calls" : "Called"}</span>
                      <span className="arch-detail">{item.steps.length} steps · {item.integrations.length} integrations</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ))}
          </div>
        )}
      </Tabs>
    </>
  );
}

/**
 * One product offering: what it is for, the value it adds, who it can be sold
 * to, its plans, rules and components, its journeys by order type and channel,
 * and the systems they touch.
 */
export function OfferingPage() {
  const { offeringId } = useParams();
  const find = (data: CatalogueData) => data.offerings.find((item) => item.id === offeringId);
  return (
    <ArchitectureFrame
      title={(data) => find(data)?.name ?? "Product not found"}
      documentTitle={(data) => `${find(data)?.name ?? "Product"} · Product · Catalogue`}
      lead={(data) => find(data)?.summary}
    >
      {(data) => {
        const offering = find(data);
        return offering ? (
          <OfferingView data={data} offering={offering} />
        ) : (
          <EmptyState title="There is no product at this address" action={<Link to={`${BASE}/portfolio`}>Open the portfolio</Link>}>
            The portfolio lists every product offering in this version.
          </EmptyState>
        );
      }}
    </ArchitectureFrame>
  );
}
