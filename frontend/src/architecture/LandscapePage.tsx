import { ArrowRightLeft, Download, Globe, Route } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button, type Column, DataTable, Facts, Section, Tabs } from "../design/components";
import { type CatalogueData, journeyViews } from "./adapter";
import { download, evidenceText } from "./exports";
import { type Impacted, impactOf } from "./impact";
import { ROLE_WORDS, type System, type TamDomain } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, RecordDrawer, SystemLink } from "./parts";
import { useScope, withScope } from "./scope";

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

function DomainBlock({ data, domain, impacted, lens, selectedId, hrefFor }: { data: CatalogueData; domain: TamDomain; impacted: Map<string, Impacted>; lens: boolean; selectedId: string | null; hrefFor: (id: string) => string }) {
  const systems = data.systems.filter((system) => system.domain === domain.id);
  const touched = systems.filter((system) => impacted.has(system.id)).length;
  const groups = domain.groups.length ? domain.groups : [{ id: "", name: domain.name }];
  return (
    <section className={`arch-domain arch-domain--${domain.id}${domain.band ? " arch-domain--band" : ""}`} aria-labelledby={`domain-${domain.id}`}>
      <header className="arch-domain__head">
        <h2 id={`domain-${domain.id}`}>{domain.name}</h2>
        <span className="arch-domain__count">{lens ? `${touched} of ${systems.length}` : systems.length}<span className="ds-visually-hidden"> systems{lens ? " in this scope" : ""}</span></span>
      </header>
      {domain.scope && <p className="arch-domain__scope">{domain.scope}</p>}
      {groups.map((group) => {
        const members = systems.filter((system) => system.group === group.id);
        if (!members.length) return null;
        return (
          <div key={group.id || domain.id} className="arch-group">
            {groups.length > 1 && <h3 className="arch-group__name">{group.name}</h3>}
            <ul className="arch-tiles" aria-label={groups.length > 1 ? group.name : domain.name}>
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

function SystemRecord({ data, system, impacted }: { data: CatalogueData; system: System; impacted?: Impacted }) {
  const [scope] = useScope(data);
  const domain = data.domains.find((item) => item.id === system.domain);
  const group = domain?.groups.find((item) => item.id === system.group);
  // Every call it makes or receives, and every step it performs, across all journeys and channels.
  const views = useMemo(() => data.offerings.flatMap((offering) => journeyViews(data, offering.id)), [data]);
  const calls = new Map<string, { direction: "out" | "in"; other: string; operation: string }>();
  for (const view of views) {
    for (const call of view.integrations) {
      const out = call.from === system.id;
      if (!out && call.to !== system.id && call.via !== system.id) continue;
      const other = out ? call.to : call.from;
      calls.set(`${out}:${other}:${call.operation}`, { direction: out ? "out" : "in", other, operation: call.operation });
    }
  }
  const steps = new Map<string, { journey: string; journeyName: string; channel: string | null; step: string; name: string }>();
  for (const view of views) {
    for (const step of view.steps) {
      if (step.kind === "task" && step.lane === system.id) steps.set(`${view.id}:${step.id}`, { journey: view.id, journeyName: view.name, channel: view.channel, step: step.id, name: step.name });
    }
  }
  const stepLink = (journey: string, channel: string | null, step: string) => withScope(`${BASE}/journeys/${journey}`, scope, { channel, step });
  return (
    <div className="arch-record">
      {system.aliases.length > 0 && <p className="arch-quiet">Also called {system.aliases.join(", ")}</p>}
      <p>{system.function || "What it does isn't described yet."}</p>
      <Facts
        items={[
          ["TAM domain", `${domain?.name ?? "Not placed"}${group ? ` · ${group.name}` : ""}`],
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
          <p className="arch-quiet">Waiting for an architect in <Link to={withScope(`${BASE}/governance`, scope)}>Governance</Link>.</p>
        </div>
      )}
      {impacted && (
        <Section title="In this scope" headingLevel={3}>
          <ul className="arch-list">
            {impacted.steps.map(({ journey, step }) => (
              <li key={`${journey.id}-${journey.channel}-${step.id}`}>
                <Link to={stepLink(journey.id, journey.channel, step.id)}>{step.name}</Link>
                <span className="arch-quiet"> · {journey.name}</span>
              </li>
            ))}
            {!impacted.steps.length && <li>Takes part through integrations only.</li>}
          </ul>
        </Section>
      )}
      <Section title="Integrations" count={calls.size} headingLevel={3}>
        {calls.size ? (
          <ul className="arch-list">
            {[...calls.values()].map((call) => (
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
      {!impacted && steps.size > 0 && (
        <Section title="Journey steps" count={steps.size} headingLevel={3}>
          <ul className="arch-list">
            {[...steps.values()].map((item) => (
              <li key={`${item.journey}-${item.channel}-${item.step}`}>
                <Link to={stepLink(item.journey, item.channel, item.step)}>{item.name}</Link>
                <span className="arch-quiet"> · {item.journeyName}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Landscape({ data }: { data: CatalogueData }) {
  const [scope] = useScope(data);
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "list" ? "list" : "map";
  const selected = data.systems.find((system) => system.id === params.get("system"));
  const lens = Boolean(scope.product);
  const impact = useMemo(() => (scope.product ? impactOf(data, { offeringId: scope.product, orderType: scope.order, channel: scope.channel }) : null), [data, scope.product, scope.order, scope.channel]);
  const impacted = impact?.systems ?? new Map<string, Impacted>();
  const hrefFor = (id: string) => withScope(BASE, scope, { view: view === "list" ? "list" : null, system: id });

  const offering = data.offerings.find((item) => item.id === scope.product);
  const words = [offering?.name, offering?.orderTypes.find((item) => item.code === scope.order)?.name, data.channels.find((item) => item.id === scope.channel)?.name].filter(Boolean).join(" · ");
  const domainsTouched = new Set([...impacted.keys()].map((id) => data.systems.find((system) => system.id === id)?.domain)).size;

  const rows = data.systems.filter((system) => !lens || impacted.has(system.id));
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? "Not placed";
  const columns: Column<System>[] = [
    { id: "name", header: "System", rowHeader: true, bidi: true, cell: (system) => <Link to={hrefFor(system.id)}>{system.name}</Link> },
    { id: "domain", header: "TAM domain", cell: (system) => domainName(system.domain) },
    { id: "group", header: "Group", cell: (system) => data.domains.find((domain) => domain.id === system.domain)?.groups.find((group) => group.id === system.group)?.name ?? "—" },
    lens
      ? { id: "role", header: "Role in this scope", cell: (system) => roleWords(impacted.get(system.id)) }
      : { id: "owner", header: "Owner", cell: (system) => system.owner ?? "Not stated" },
    { id: "evidence", header: "Evidence", cell: (system) => <EvidenceMark evidence={system.evidence} compact /> },
  ];

  const exportImpact = () => {
    const header = "System,TAM domain,Role,Steps,Integrations,Evidence";
    const lines = [...impacted.values()].map((item) => {
      const system = data.systems.find((entry) => entry.id === item.systemId);
      return [system?.name, system ? domainName(system.domain) : "", roleWords(item), item.steps.length, item.integrations.length, system ? evidenceText(data, system.evidence) : ""]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    download(`impact-${[scope.product, scope.order, scope.channel].filter(Boolean).join("-")}.csv`, "\uFEFF" + [header, ...lines].join("\r\n"), "text/csv;charset=utf-8");
  };

  const columnsOf = data.domains.filter((domain) => !domain.band);
  const bands = data.domains.filter((domain) => domain.band);
  const unplaced = data.systems.filter((system) => !data.domains.some((domain) => domain.id === system.domain));

  return (
    <>
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
                  <DomainBlock key={domain.id} data={data} domain={domain} impacted={impacted} lens={lens} selectedId={selected?.id ?? null} hrefFor={hrefFor} />
                ))}
              </div>
              {bands.map((domain) => (
                <DomainBlock key={domain.id} data={data} domain={domain} impacted={impacted} lens={lens} selectedId={selected?.id ?? null} hrefFor={hrefFor} />
              ))}
              {unplaced.length > 0 && (
                <p className="arch-callout">Not placed in a TAM domain yet: {unplaced.map((system) => system.name).join(", ")}.</p>
              )}
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
              <SystemRecord data={data} system={selected} impacted={impacted.get(selected.id)} />
            </RecordDrawer>
          )}
        </div>
      </Tabs>
    </>
  );
}

/**
 * The TAM landscape: every system in its TM Forum TAM domain, with the
 * integration layer and enterprise services as bands beneath. With a product
 * chosen, it becomes the impact lens: the systems that product's journeys
 * touch, with their role; the rest recede.
 */
export function LandscapePage() {
  return (
    <ArchitectureFrame
      title="Architecture landscape"
      lead="Every system in its TM Forum TAM domain. Choose a product, an order type and a channel to see which systems they touch, and how."
    >
      {(data) => <Landscape data={data} />}
    </ArchitectureFrame>
  );
}
