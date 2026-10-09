import { useState } from "react";
import { Link } from "react-router-dom";

import { type Column, DataTable, Facts, FilterStrip, Section } from "../design/components";
import { DOMAINS, SOURCES, SYSTEMS } from "./data/landscape";
import { FINDINGS, JOURNEYS } from "./data/journeys";
import { OFFERINGS } from "./data/portfolio";
import type { Finding, System } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, SystemLink } from "./parts";
import { scopeQuery, useScope } from "./scope";

function journeyCount(id: string) {
  return JOURNEYS.filter((journey) => journey.steps.some((step) => step.lane === id) || journey.integrations.some((call) => [call.from, call.to, call.via].includes(id))).length;
}

/** Every system in one dense table: domain, owner, aliases, evidence, and where it is used. */
export function SystemsPage() {
  const [scope] = useScope();
  const [find, setFind] = useState("");
  const [domain, setDomain] = useState<string>("all");
  const needle = find.trim().toLowerCase();
  const rows = SYSTEMS.filter(
    (system) =>
      (domain === "all" || system.domain === domain) &&
      (!needle || [system.name, ...system.aliases, system.function, system.owner ?? ""].some((text) => text.toLowerCase().includes(needle))),
  );
  const query = scopeQuery(scope);
  const columns: Column<System>[] = [
    { id: "name", header: "System", rowHeader: true, bidi: true, cell: (system) => (
      <>
        <Link to={`${BASE}${query}${query ? "&" : "?"}system=${system.id}`}>{system.name}</Link>
        {system.aliases.length > 0 && <span className="arch-detail">{system.aliases.join(", ")}</span>}
      </>
    ) },
    { id: "domain", header: "TAM domain", cell: (system) => (
      <>
        {DOMAINS.find((item) => item.id === system.domain)?.name}
        {system.proposedMove && <span className="arch-detail">Proposed; was {system.proposedMove.from}</span>}
      </>
    ) },
    { id: "function", header: "What it does", cell: (system) => system.function },
    { id: "owner", header: "Owner", cell: (system) => system.owner ?? <span className="arch-quiet">Not stated</span> },
    { id: "journeys", header: "Journeys", numeric: true, cell: (system) => journeyCount(system.id) },
    { id: "evidence", header: "Evidence", cell: (system) => <EvidenceMark evidence={system.evidence} /> },
  ];
  return (
    <ArchitectureFrame title="Systems" lead="The system register behind the landscape: every system, its TAM domain, owner and source.">
      <FilterStrip
        label="Filter systems"
        filters={[{ id: "all", label: "All", count: SYSTEMS.length }, ...DOMAINS.map((item) => ({ id: item.id, label: item.name, count: SYSTEMS.filter((system) => system.domain === item.id).length }))]}
        active={domain}
        onChange={setDomain}
        find={{ label: "Find a system", value: find, onChange: setFind, placeholder: "Name, alias, owner or function" }}
      />
      <DataTable caption={`Systems: ${rows.length}`} columns={columns} rows={rows} rowId={(system) => system.id} emptyText="No system matches. Clear the filters to see them all." />
    </ArchitectureFrame>
  );
}

const KIND_WORDS: Record<Finding["kind"], string> = {
  conflict: "Sources disagree",
  gap: "Not in the sources",
  placement: "Placement",
  undefined: "Named, not defined",
};

/**
 * Governance for the whole catalogue: the sources it is built from, the TAM
 * placements waiting for an architect, and every conflict and gap found while
 * reading the sources. Each fact's own evidence sits beside it on its page.
 */
export function GovernancePage() {
  const moves = SYSTEMS.filter((system) => system.proposedMove);
  const findingColumns: Column<Finding>[] = [
    { id: "id", header: "#", width: "3.5rem", cell: (finding) => finding.id },
    { id: "title", header: "Finding", rowHeader: true, cell: (finding) => (
      <>
        <span className="arch-strong">{finding.title}</span>
        <span className="arch-detail">{finding.detail}</span>
      </>
    ) },
    { id: "kind", header: "Kind", cell: (finding) => KIND_WORDS[finding.kind] },
    { id: "sources", header: "Where", cell: (finding) => (
      <ul className="arch-inline-list">
        {finding.sources.map((source, index) => <li key={index}><EvidenceMark evidence={source} /></li>)}
      </ul>
    ) },
    { id: "owner", header: "Decided by", cell: () => <span className="arch-quiet">Open</span> },
  ];
  const moveColumns: Column<System>[] = [
    { id: "name", header: "System", rowHeader: true, cell: (system) => <SystemLink id={system.id} /> },
    { id: "from", header: "SMB reference", cell: (system) => system.proposedMove?.from },
    { id: "to", header: "Proposed", cell: (system) => DOMAINS.find((domain) => domain.id === system.domain)?.name },
    { id: "why", header: "Why", cell: (system) => system.proposedMove?.reason },
    { id: "state", header: "Decision", cell: () => <span className="arch-quiet">Waiting for an architect</span> },
  ];
  return (
    <ArchitectureFrame title="Governance" lead="What this catalogue is built from, what waits for a decision, and what the sources leave open.">
      <Section title="Sources" count={SOURCES.length}>
        <div className="arch-sources">
          {SOURCES.map((source) => (
            <div key={source.id} className="arch-source">
              <h3>{source.title}</h3>
              <Facts
                items={[
                  ["Version", `${source.version}${source.date ? ` · ${source.date}` : ""}`],
                  ["Kind", source.kind],
                  ["Owner", source.owner ?? "Not stated"],
                  ["File", source.file],
                  ["Reviewed", "Read in full on 9 October 2026; findings below"],
                ]}
              />
            </div>
          ))}
        </div>
        <p className="arch-quiet">Nothing else feeds this catalogue: not the previous catalogue, not other documents.</p>
      </Section>
      <Section title="TAM placements to decide" count={moves.length}>
        <DataTable caption="Systems this catalogue places in another TAM domain than the SMB reference" captionHidden columns={moveColumns} rows={moves} rowId={(system) => system.id} />
      </Section>
      <Section title="Conflicts and gaps in the sources" count={FINDINGS.length}>
        <DataTable caption="Findings from reading the sources" captionHidden columns={findingColumns} rows={FINDINGS} rowId={(finding) => finding.id} />
      </Section>
    </ArchitectureFrame>
  );
}

/** Versions: the working draft until the catalogue service publishes it. */
export function CatalogueVersionsPage() {
  const offerings = OFFERINGS.length;
  const steps = JOURNEYS.reduce((sum, journey) => sum + journey.steps.filter((step) => step.kind === "task").length, 0);
  const calls = JOURNEYS.reduce((sum, journey) => sum + journey.integrations.length, 0);
  return (
    <ArchitectureFrame title="Versions" lead="A version is what Requirement AI and the Explorer read. Every change is made in a draft and reaches them only when the draft is published.">
      <Section title="Working draft" headingLevel={2}>
        <Facts
          items={[
            ["State", "Draft, not published"],
            ["Built from", SOURCES.map((source) => `${source.id === "sdd" ? "SDD" : "SMB reference"} v${source.version}`).join(" and ")],
            ["Holds", `${SYSTEMS.length} systems · ${offerings} product · ${JOURNEYS.length} journeys · ${steps} steps · ${calls} integrations`],
            ["Open findings", `${FINDINGS.length} conflicts and gaps · ${SYSTEMS.filter((system) => system.proposedMove).length} placements to decide`],
          ]}
        />
        <p className="arch-note">
          Publishing, comparing two versions and putting one back in service come with the catalogue service (next build step). Until then this draft is what you see here, and the version in service for requirement mapping is unchanged.
        </p>
      </Section>
    </ArchitectureFrame>
  );
}
