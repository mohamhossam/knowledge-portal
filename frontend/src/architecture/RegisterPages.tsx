import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { api, type Release } from "../api/client";
import { type Column, DataTable, Facts, FilterStrip, Section, Status } from "../design/components";
import { type CatalogueData, journeyViews } from "./adapter";
import { useCatalogueReleases } from "./catalogueData";
import type { Finding, System } from "./model";
import { ArchitectureFrame, BASE, EvidenceMark, SystemLink } from "./parts";
import { useScope, withScope } from "./scope";

/** Every system in one dense table: domain, owner, aliases, evidence, and where it is used. */
function SystemRegister({ data }: { data: CatalogueData }) {
  const [scope] = useScope(data);
  const [params, setParams] = useSearchParams();
  const find = params.get("q") ?? "";
  const domain = params.get("domain") ?? "all";
  const setParam = (key: string, value: string) =>
    setParams((previous) => {
      const merged = new URLSearchParams(previous);
      if (value && value !== "all") merged.set(key, value);
      else merged.delete(key);
      return merged;
    }, { replace: true });
  const views = data.offerings.flatMap((offering) => journeyViews(data, offering.id));
  const journeyCount = (id: string) =>
    new Set(views.filter((view) => view.steps.some((step) => step.lane === id) || view.integrations.some((call) => [call.from, call.to, call.via].includes(id))).map((view) => view.id)).size;
  const needle = find.trim().toLowerCase();
  const rows = data.systems.filter(
    (system) =>
      (domain === "all" || system.domain === domain) &&
      (!needle || [system.name, ...system.aliases, system.function, system.owner ?? ""].some((text) => text.toLowerCase().includes(needle))),
  );
  const columns: Column<System>[] = [
    { id: "name", header: "System", rowHeader: true, bidi: true, cell: (system) => (
      <>
        <Link to={withScope(BASE, scope, { system: system.id })}>{system.name}</Link>
        {system.aliases.length > 0 && <span className="arch-detail">{system.aliases.join(", ")}</span>}
      </>
    ) },
    { id: "domain", header: "TAM domain", cell: (system) => (
      <>
        {data.domains.find((item) => item.id === system.domain)?.name ?? "Not placed"}
        {system.proposedMove && <span className="arch-detail">Proposed; was {system.proposedMove.from}</span>}
      </>
    ) },
    { id: "function", header: "What it does", cell: (system) => system.function || <span className="arch-quiet">Not described</span> },
    { id: "owner", header: "Owner", cell: (system) => system.owner ?? <span className="arch-quiet">Not stated</span> },
    { id: "journeys", header: "Journeys", numeric: true, cell: (system) => journeyCount(system.id) },
    { id: "evidence", header: "Evidence", cell: (system) => <EvidenceMark evidence={system.evidence} /> },
  ];
  return (
    <>
      <FilterStrip
        label="Filter systems"
        filters={[{ id: "all", label: "All", count: data.systems.length }, ...data.domains.map((item) => ({ id: item.id, label: item.name, count: data.systems.filter((system) => system.domain === item.id).length }))]}
        active={domain}
        onChange={(value) => setParam("domain", value)}
        find={{ label: "Find a system", value: find, onChange: (value) => setParam("q", value), placeholder: "Name, alias, owner or function" }}
      />
      <DataTable caption={`Systems: ${rows.length}`} columns={columns} rows={rows} rowId={(system) => system.id} emptyText="No system matches. Clear the filters to see them all." />
    </>
  );
}

export function SystemsPage() {
  return (
    <ArchitectureFrame title="Systems" lead="The system register behind the landscape: every system, its TAM domain, owner and source.">
      {(data) => <SystemRegister data={data} />}
    </ArchitectureFrame>
  );
}

const KIND_WORDS: Record<Finding["kind"], string> = {
  conflict: "Sources disagree",
  gap: "Open in the sources",
  placement: "Placement",
  undefined: "Named, not defined",
};

/**
 * Governance for the whole catalogue: the sources it is built from, the TAM
 * placements waiting for an architect, and every conflict and gap found while
 * reading the sources. Each fact's own evidence sits beside it on its page.
 */
function Governance({ data }: { data: CatalogueData }) {
  const moves = data.systems.filter((system) => system.proposedMove);
  const findingColumns: Column<Finding>[] = [
    { id: "id", header: "#", width: "3.5rem", cell: (finding) => finding.id },
    { id: "title", header: "Finding", rowHeader: true, cell: (finding) => (
      <>
        <span className="arch-strong">{finding.title}</span>
        {finding.detail && <span className="arch-detail">{finding.detail}</span>}
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
    { id: "from", header: "Placed by the source in", cell: (system) => system.proposedMove?.from },
    { id: "to", header: "Proposed", cell: (system) => data.domains.find((domain) => domain.id === system.domain)?.name },
    { id: "why", header: "Why", cell: (system) => system.proposedMove?.reason },
    { id: "state", header: "Decision", cell: () => <span className="arch-quiet">Waiting for an architect</span> },
  ];
  return (
    <>
      <Section title="Sources" count={data.sources.length}>
        <div className="arch-sources">
          {data.sources.map((source) => (
            <div key={source.id} className="arch-source">
              <h3>{source.title}</h3>
              <Facts
                items={[
                  ["Level", source.level === "L1" ? "L1 · the canonical landscape" : source.level === "L2" ? "L2 · primary for its scope" : `${source.level} · carried forward`],
                  ["Version", source.version ?? "Not stated"],
                  ["Owner", source.owner ?? "Not stated"],
                  ["File", source.file ?? "Not stated"],
                  ["Covers", source.scope ?? "Not stated"],
                ]}
              />
            </div>
          ))}
        </div>
      </Section>
      <Section title="TAM placements to decide" count={moves.length}>
        <DataTable caption="Systems placed in another TAM domain than a source puts them" captionHidden columns={moveColumns} rows={moves} rowId={(system) => system.id} emptyText="No placement waits for a decision." />
      </Section>
      <Section title="Conflicts and gaps in the sources" count={data.findings.length}>
        <DataTable caption="Findings from reading the sources" captionHidden columns={findingColumns} rows={data.findings} rowId={(finding) => finding.id} emptyText="No conflict or gap is recorded." />
      </Section>
    </>
  );
}

export function GovernancePage() {
  return (
    <ArchitectureFrame title="Governance" lead="What this catalogue is built from, what waits for a decision, and what the sources leave open.">
      {(data) => <Governance data={data} />}
    </ArchitectureFrame>
  );
}

/** Every version: the drafts being prepared, and the published ones, with the one requirement mapping reads. */
function Versions({ data }: { data: CatalogueData }) {
  const [scope] = useScope(data);
  const releases = useCatalogueReleases();
  const active = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease });
  const columns: Column<Release>[] = [
    { id: "name", header: "Version", rowHeader: true, cell: (release) => (
      <>
        <Link to={withScope(BASE, { ...scope, version: release.id })}>{release.name ?? release.id}</Link>
        {release.id === data.releaseId && <span className="arch-detail">In view now</span>}
      </>
    ) },
    { id: "state", header: "State", cell: (release) =>
      release.id === active.data?.id ? <Status tone="done">In service: requirement mapping reads it</Status>
      : release.status === "draft" ? <Status tone="working">Draft, not published</Status>
      : <Status tone="neutral">Published, replaced</Status> },
    { id: "content", header: "Holds", cell: (release) => `${release.systems.length} systems · ${(release.products ?? []).length} products · ${(release.journeys ?? []).length} journeys` },
    { id: "published", header: "Published", cell: (release) => (release.published_at ? new Date(release.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—") },
  ];
  return (
    <>
      <DataTable caption={`Versions: ${releases.length}`} columns={columns} rows={releases} rowId={(release) => release.id} />
      <p className="arch-note">
        Requirement mapping keeps reading the version in service until a draft is published and put in service. Comparing two versions and putting one back in service come with the next step of this area.
      </p>
    </>
  );
}

export function CatalogueVersionsPage() {
  return (
    <ArchitectureFrame title="Versions" lead="A version is what Requirement AI and the Explorer read. Every change is made in a draft and reaches them only when the draft is published.">
      {(data) => <Versions data={data} />}
    </ArchitectureFrame>
  );
}
