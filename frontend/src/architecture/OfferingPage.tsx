import { CircleCheck, CircleDashed, Minus } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { type Column, DataTable, EmptyState, Facts, Section, Tabs } from "../design/components";
import { DOMAINS, systemById } from "./data/landscape";
import { journeysFor } from "./data/journeys";
import { CHANNELS, ORDER_TYPES, offeringById } from "./data/portfolio";
import { impactOf } from "./impact";
import { type Component, type Plan, ROLE_WORDS, type Rule } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, SystemLink } from "./parts";
import { pathTo, usePortfolio } from "./portfolioStore";
import { scopeQuery, useImpliedScope, useScope } from "./scope";

type Tab = "overview" | "plans" | "rules" | "components" | "journeys" | "impact";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plans", label: "Plans & prices" },
  { id: "rules", label: "Business rules" },
  { id: "components", label: "Components" },
  { id: "journeys", label: "Journeys" },
  { id: "impact", label: "Impact" },
];

const RULE_WORDS: Record<Rule["kind"], string> = {
  composition: "Composition",
  eligibility: "Eligibility",
  dependency: "Dependency",
  lifecycle: "Lifecycle",
  fulfilment: "Fulfilment",
  billing: "Billing",
};

/**
 * One product offering: what it is for, the value it adds, who it can be sold
 * to, its plans, rules and components, its journeys by order type and channel,
 * and the systems they touch.
 */
export function OfferingPage() {
  const { offeringId } = useParams();
  const offering = offeringById(offeringId);
  const [scope] = useScope();
  const [params, setParams] = useSearchParams();
  const { nodes } = usePortfolio();
  useImpliedScope({ product: offering?.id });
  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "overview") as Tab;
  const query = scopeQuery(scope);
  const impact = useMemo(
    () => (offering ? impactOf({ offeringId: offering.id, orderType: scope.product === offering.id ? scope.order : null, channel: scope.product === offering.id ? scope.channel : null }) : null),
    [offering, scope.product, scope.order, scope.channel],
  );

  if (!offering || !impact) {
    return (
      <ArchitectureFrame title="Product not found">
        <EmptyState title="There is no product at this address" action={<Link to={`${BASE}/portfolio${query}`}>Open the portfolio</Link>}>
          The portfolio lists every product offering.
        </EmptyState>
      </ArchitectureFrame>
    );
  }

  const planColumns: Column<Plan>[] = [
    { id: "name", header: "Plan", rowHeader: true, cell: (plan) => plan.name },
    { id: "speed", header: "Download / upload", cell: (plan) => `${plan.download} / ${plan.upload}` },
    { id: "cpe", header: "CPE", cell: (plan) => plan.cpe },
    { id: "ap", header: "Access point", cell: (plan) => plan.accessPoint },
    { id: "backup", header: "Backup 5G", cell: (plan) => plan.backupOffer },
    { id: "price", header: "Monthly price", cell: (plan) => plan.price ?? <span className="arch-gap"><CircleDashed size={14} aria-hidden="true" /> Not provided yet</span> },
  ];
  const ruleColumns: Column<Rule>[] = [
    { id: "id", header: "Rule", width: "4rem", cell: (rule) => rule.id },
    { id: "statement", header: "Statement", rowHeader: true, cell: (rule) => rule.statement },
    { id: "kind", header: "Kind", cell: (rule) => RULE_WORDS[rule.kind] },
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
    { id: "mandatory", header: "In every bundle", cell: (component) => (component.mandatory ? "Mandatory" : "Optional") },
    { id: "systems", header: "Systems responsible", cell: (component) => (
      <ul className="arch-inline-list">
        {component.systems.map((item) => (
          <li key={`${item.systemId}-${item.responsibility}`}><SystemLink id={item.systemId} />: {item.responsibility}</li>
        ))}
      </ul>
    ) },
    { id: "evidence", header: "Evidence", cell: (component) => <EvidenceMark evidence={component.evidence} /> },
  ];

  const supported = ORDER_TYPES.filter((type) => offering.orderTypes.some((item) => item.code === type.code));
  const channels = CHANNELS.filter((channel) => offering.orderTypes.some((item) => item.channels.includes(channel.id)));
  const byDomain = DOMAINS.map((domain) => ({
    domain,
    items: [...impact.systems.values()].filter((item) => systemById(item.systemId)?.domain === domain.id),
  })).filter((group) => group.items.length);
  const scoped = scope.product === offering.id && (scope.order || scope.channel);

  return (
    <ArchitectureFrame title={offering.name} documentTitle={`${offering.name} · Product · Catalogue`} lead={offering.summary}>
      <Facts
        items={[
          ["Portfolio", pathTo(nodes, offering.nodeId).map((node) => node.name).join(" › ") || "Not placed"],
          ["Order types", `${offering.orderTypes.length} supported · ${journeysFor(offering.id).length} journeys modelled`],
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
              <p className="arch-reading">{offering.purpose}</p>
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
            <DataTable caption={`Plans: ${offering.plans.length}, each with or without Backup 5G`} columns={planColumns} rows={offering.plans} rowId={(plan) => plan.name} />
            <p className="arch-note">
              {offering.plans[0] && <EvidenceMark evidence={offering.plans[0].evidence} />} Prices aren't in the SDD or the SMB reference. Commitment options: no contract, 1 year, 2 years (rule R10).
            </p>
          </div>
        )}
        {tab === "rules" && <DataTable caption={`Business rules: ${offering.rules.length}`} columns={ruleColumns} rows={offering.rules} rowId={(rule) => rule.id} />}
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
                  {supported.map((type) => {
                    const support = offering.orderTypes.find((item) => item.code === type.code);
                    return (
                      <tr key={type.code}>
                        <th scope="row">
                          {type.name} <code translate="no">{type.code}</code>
                          {support?.note && <span className="arch-detail">{support.note}</span>}
                        </th>
                        {channels.map((channel) => {
                          const journey = journeysFor(offering.id, type.code, channel.id)[0];
                          const offered = support?.channels.includes(channel.id);
                          return (
                            <td key={channel.id} className={journey ? "arch-matrix__modelled" : undefined}>
                              {journey ? (
                                <Link to={`${BASE}/journeys/${journey.id}${query}`}><CircleCheck size={14} aria-hidden="true" /> Open flow</Link>
                              ) : offered ? (
                                <span className="arch-gap arch-gap--cell"><CircleDashed size={14} aria-hidden="true" /> Not modelled</span>
                              ) : (
                                <span className="arch-quiet"><Minus size={14} aria-hidden="true" /><span className="ds-visually-hidden">Not offered</span></span>
                              )}
                            </td>
                          );
                        })}
                        <td>{support?.priority ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === "impact" && (
          <div className="arch-stack">
            <p>
              {scoped ? "In the scope chosen above, " : "Across every modelled journey, "}
              {offering.name} touches <span className="arch-strong">{impact.systems.size} systems</span> in {byDomain.length} TAM domains.{" "}
              <Link to={`${BASE}${scopeQuery({ product: offering.id, order: scope.product === offering.id ? scope.order : null, channel: scope.product === offering.id ? scope.channel : null })}`}>See them on the landscape</Link>
            </p>
            {byDomain.map(({ domain, items }) => (
              <Section key={domain.id} title={domain.name} count={items.length}>
                <ul className="arch-impact-list">
                  {items.map((item) => (
                    <li key={item.systemId}>
                      <SystemLink id={item.systemId} />
                      <span className="arch-quiet"> · {item.roles.length ? item.roles.map((role) => ROLE_WORDS[role]).join(", ") : item.carriesOnly ? "Carries the calls" : "Called"}</span>
                      <span className="arch-detail">{item.steps.filter(({ step }) => step.kind === "task").length} steps · {item.integrations.length} integrations</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ))}
          </div>
        )}
      </Tabs>
    </ArchitectureFrame>
  );
}
