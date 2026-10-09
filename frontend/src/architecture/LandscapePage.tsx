import { ArrowRightLeft, Download, Globe, Route } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button, type Column, DataTable, Facts, Section, Tabs } from "../design/components";
import { DOMAINS, SYSTEMS, systemById } from "./data/landscape";
import { JOURNEYS } from "./data/journeys";
import { channelById, offeringById, orderTypeByCode } from "./data/portfolio";
import { download, evidenceText } from "./exports";
import { type Impacted, impactOf } from "./impact";
import { ROLE_WORDS, type System, type TamDomain } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, RecordDrawer, SystemLink } from "./parts";
import { scopeQuery, useScope } from "./scope";

type View = "map" | "list";

function roleWords(item: Impacted | undefined): string | null {
  if (!item) return null;
  const strongest = item.roles[0];
  if (strongest) return ROLE_WORDS[strongest];
  return item.carriesOnly ? "Carries the calls" : "Called";
}

function Tile({ system, impacted, lens, selected, href }: { system: System; impacted?: Impacted; lens: boolean; selected: boolean; href: string }) {
  const role = roleWords(impacted);
  const state = lens ? (impacted ? "impacted" : "quiet") : "plain";
  return (
    <li>
      <Link className={`arch-tile arch-tile--${state}`} to={href} aria-current={selected ? "true" : undefined}>
        <span className="arch-tile__name" dir="auto">{system.name}</span>
        {role && <span className="arch-tile__role">{role}</span>}
        {lens && !impacted && <span className="ds-visually-hidden">Not in this scope</span>}
        <span className="arch-tile__marks">
          {system.external && <Globe size={14} aria-label="External" role="img" />}
          {system.proposedMove && <ArrowRightLeft size={14} aria-label="Placement proposed" role="img" />}
          {system.roadmap && <Route size={14} aria-label="On the roadmap" role="img" />}
        </span>
      </Link>
    </li>
  );
}

function DomainBlock({ domain, impacted, lens, selectedId, hrefFor }: { domain: TamDomain; impacted: Map<string, Impacted>; lens: boolean; selectedId: string | null; hrefFor: (id: string) => string }) {
  const systems = SYSTEMS.filter((system) => system.domain === domain.id);
  const touched = systems.filter((system) => impacted.has(system.id)).length;
  return (
    <section className={`arch-domain arch-domain--${domain.id}${domain.band ? " arch-domain--band" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      <header className="arch-domain__head">
        <h2 id={`domain-${domain.id}`}>{domain.name}</h2>
        <span className="arch-domain__count">{lens ? `${touched} of ${systems.length}` : systems.length}<span className="ds-visually-hidden"> systems{lens ? " in this scope" : ""}</span></span>
      </header>
      <p className="arch-domain__scope">{domain.scope}</p>
      {domain.groups.map((group) => {
        const members = systems.filter((system) => system.group === group.id);
        if (!members.length) return null;
        return (
          <div key={group.id} className="arch-group">
            {domain.groups.length > 1 && <h3 className="arch-group__name">{group.name}</h3>}
            <ul className="arch-tiles" aria-label={domain.groups.length > 1 ? group.name : domain.name}>
              {members.map((system) => (
                <Tile key={system.id} system={system} impacted={impacted.get(system.id)} lens={lens} selected={selectedId === system.id} href={hrefFor(system.id)} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/** Every call a system makes or receives, across all journeys, once per operation and counterpart. */
function connections(systemId: string) {
  const seen = new Map<string, { direction: "out" | "in"; other: string; operation: string; journeys: string[] }>();
  for (const journey of JOURNEYS) {
    for (const integration of journey.integrations) {
      const out = integration.from === systemId;
      if (!out && integration.to !== systemId && integration.via !== systemId) continue;
      const other = out ? integration.to : integration.from;
      const key = `${out ? "out" : "in"}:${other}:${integration.operation}`;
      const item = seen.get(key) ?? { direction: out ? "out" : "in", other, operation: integration.operation, journeys: [] };
      if (!item.journeys.includes(journey.name)) item.journeys.push(journey.name);
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

function SystemRecord({ system, impacted }: { system: System; impacted?: Impacted }) {
  const domain = DOMAINS.find((item) => item.id === system.domain);
  const group = domain?.groups.find((item) => item.id === system.group);
  const calls = connections(system.id);
  const steps = JOURNEYS.flatMap((journey) => journey.steps.filter((step) => step.lane === system.id && step.kind === "task").map((step) => ({ journey, step })));
  return (
    <div className="arch-record">
      {system.aliases.length > 0 && <p className="arch-quiet">Also called {system.aliases.join(", ")}</p>}
      <p>{system.function}</p>
      <Facts
        items={[
          ["TAM domain", `${domain?.name ?? system.domain}${group ? ` · ${group.name}` : ""}`],
          ["Owner", system.owner ?? "Not stated"],
          ["Evidence", <EvidenceMark key="e" evidence={system.evidence} />],
          ...(system.external ? ([["Party", "External to the operator"]] as [string, string][]) : []),
          ...(system.roadmap ? ([["Roadmap", system.roadmap]] as [string, string][]) : []),
        ]}
      />
      {system.proposedMove && (
        <div className="arch-callout">
          <p className="arch-strong">Placement proposed: {domain?.name} instead of {system.proposedMove.from}</p>
          <p>{system.proposedMove.reason}</p>
          <p className="arch-quiet">Waiting for an architect in <Link to={`${BASE}/governance`}>Governance</Link>.</p>
        </div>
      )}
      {impacted && (
        <Section title="In this scope" headingLevel={3}>
          <ul className="arch-list">
            {impacted.steps.filter(({ step }) => step.kind === "task").map(({ journey, step }) => (
              <li key={`${journey.id}-${step.id}`}>
                <Link to={`${BASE}/journeys/${journey.id}?step=${step.id}`}>{step.name}</Link>
                <span className="arch-quiet"> · {journey.name}</span>
              </li>
            ))}
            {!impacted.steps.length && <li>Takes part through integrations only.</li>}
          </ul>
        </Section>
      )}
      <Section title="Integrations" count={calls.length} headingLevel={3}>
        {calls.length ? (
          <ul className="arch-list">
            {calls.map((call) => (
              <li key={`${call.direction}-${call.other}-${call.operation}`}>
                {call.direction === "out" ? "Calls " : "Called by "}
                <SystemLink id={call.other} />: {call.operation}
              </li>
            ))}
          </ul>
        ) : (
          <p className="arch-quiet">No integration is modelled for this system yet.</p>
        )}
      </Section>
      {!impacted && steps.length > 0 && (
        <Section title="Journey steps" count={steps.length} headingLevel={3}>
          <ul className="arch-list">
            {steps.map(({ journey, step }) => (
              <li key={`${journey.id}-${step.id}`}>
                <Link to={`${BASE}/journeys/${journey.id}?step=${step.id}`}>{step.name}</Link>
                <span className="arch-quiet"> · {journey.name}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/**
 * The TAM landscape: every SMB system in its TM Forum TAM domain, with the
 * integration layer and enterprise services as bands beneath. With a product
 * chosen, it becomes the impact lens: the systems that product's journeys
 * touch, with their role; the rest recede.
 */
export function LandscapePage() {
  const [scope] = useScope();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "list" ? "list" : "map";
  const selected = systemById(params.get("system") ?? "");
  const lens = Boolean(scope.product);
  const impact = useMemo(() => (scope.product ? impactOf({ offeringId: scope.product, orderType: scope.order, channel: scope.channel }) : null), [scope.product, scope.order, scope.channel]);
  const impacted = impact?.systems ?? new Map<string, Impacted>();
  const query = scopeQuery(scope);
  const hrefFor = (id: string) => `${BASE}${query}${query ? "&" : "?"}${view === "list" ? "view=list&" : ""}system=${id}`;

  const offering = offeringById(scope.product);
  const words = [offering?.name, orderTypeByCode(scope.order)?.name, channelById(scope.channel)?.name].filter(Boolean).join(" · ");
  const domainsTouched = new Set([...impacted.keys()].map((id) => systemById(id)?.domain)).size;

  const rows = SYSTEMS.filter((system) => !lens || impacted.has(system.id));
  const columns: Column<System>[] = [
    { id: "name", header: "System", rowHeader: true, bidi: true, cell: (system) => <Link to={hrefFor(system.id)}>{system.name}</Link> },
    { id: "domain", header: "TAM domain", cell: (system) => DOMAINS.find((domain) => domain.id === system.domain)?.name },
    { id: "group", header: "Group", cell: (system) => DOMAINS.find((domain) => domain.id === system.domain)?.groups.find((group) => group.id === system.group)?.name },
    lens
      ? { id: "role", header: "Role in this scope", cell: (system) => roleWords(impacted.get(system.id)) }
      : { id: "owner", header: "Owner", cell: (system) => system.owner ?? "Not stated" },
    { id: "evidence", header: "Evidence", cell: (system) => <EvidenceMark evidence={system.evidence} compact /> },
  ];

  const exportImpact = () => {
    const header = "System,TAM domain,Role,Steps,Integrations,Evidence";
    const lines = [...impacted.values()].map((item) => {
      const system = systemById(item.systemId);
      return [system?.name, DOMAINS.find((domain) => domain.id === system?.domain)?.name, roleWords(item), item.steps.filter(({ step }) => step.kind === "task").length, item.integrations.length, system ? evidenceText(system.evidence) : ""]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    download(`impact-${[scope.product, scope.order, scope.channel].filter(Boolean).join("-")}.csv`, "\uFEFF" + [header, ...lines].join("\r\n"), "text/csv;charset=utf-8");
  };

  const columnsOf = DOMAINS.filter((domain) => !domain.band);
  const bands = DOMAINS.filter((domain) => domain.band);

  return (
    <ArchitectureFrame
      title="Architecture landscape"
      lead="Every SMB system in its TM Forum TAM domain. Choose a product, an order type and a channel to see which systems they touch, and how."
    >
      <div className="arch-lens" role="status">
        {lens ? (
          <>
            <p>
              <span className="arch-strong">{words}</span> touches <span className="arch-strong">{impacted.size} systems</span> in {domainsTouched} domains, through {impact?.journeys.length ?? 0} {impact?.journeys.length === 1 ? "journey" : "journeys"}.
              {impact && impact.journeys.length === 0 && " No journey is modelled for this combination yet."}
            </p>
            {impacted.size > 0 && (
              <Button icon={<Download size={16} />} onClick={exportImpact}>Export impacted systems (CSV)</Button>
            )}
          </>
        ) : (
          <p>No product chosen: showing the whole landscape.</p>
        )}
      </div>
      <Tabs<View>
        label="Show the landscape as"
        tabs={[{ id: "map", label: "Map" }, { id: "list", label: "List" }]}
        selected={view}
        onSelect={(next) => setParams((previous) => {
          const merged = new URLSearchParams(previous);
          if (next === "list") merged.set("view", "list");
          else merged.delete("view");
          return merged;
        }, { replace: true })}
      >
        <div className="arch-landscape">
          {view === "map" ? (
            <div className="arch-map">
              <div className="arch-map__columns">
                {columnsOf.map((domain) => (
                  <DomainBlock key={domain.id} domain={domain} impacted={impacted} lens={lens} selectedId={selected?.id ?? null} hrefFor={hrefFor} />
                ))}
              </div>
              {bands.map((domain) => (
                <DomainBlock key={domain.id} domain={domain} impacted={impacted} lens={lens} selectedId={selected?.id ?? null} hrefFor={hrefFor} />
              ))}
              <p className="arch-legend">
                <span><Globe size={14} aria-hidden="true" /> External</span>
                <span><ArrowRightLeft size={14} aria-hidden="true" /> Placement proposed</span>
                <span><Route size={14} aria-hidden="true" /> On the roadmap</span>
              </p>
            </div>
          ) : (
            <DataTable caption={lens ? `Systems in this scope: ${rows.length}` : `All systems: ${rows.length}`} columns={columns} rows={rows} rowId={(system) => system.id} />
          )}
          {selected && (
            <RecordDrawer title={selected.name} openKey={selected.id} onClose={() => setParams((previous) => {
              const merged = new URLSearchParams(previous);
              merged.delete("system");
              return merged;
            }, { replace: true })}>
              <SystemRecord system={selected} impacted={impacted.get(selected.id)} />
            </RecordDrawer>
          )}
        </div>
      </Tabs>
    </ArchitectureFrame>
  );
}
