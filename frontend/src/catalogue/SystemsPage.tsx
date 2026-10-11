import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import type { CatalogueSystem, Relationship, Release } from "../api/client";
import {
  Button, type Column, DataTable, EmptyState, GapBadge, ListFilter, ListFind, ListTools, RecordList, type RecordGroup,
  RecordPlaceholder, Section, Status, Workbench,
} from "../design/components";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { LINK_VERB, allConnections, domainPath, findSystems, systemName } from "./catalogue";
import { SystemEdit } from "./DraftEdits";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useFindParam } from "./frame/useFindParam";
import { type ConceptIndex, conceptIndex, interfacesOf, systemConcepts, systemDomains } from "./ontology";
import { SystemRecord } from "./SystemRecord";
import { useCatalogueContext } from "./useCatalogue";

type Row = { system: CatalogueSystem; place: string; why: string | null };

const ALL = "all";

/**
 * The systems of a version on the workbench (UX rebuild, phase 3): every
 * system in a narrow list, grouped by where it sits, beside the record of the
 * one chosen. With none chosen, the record side shows every connection.
 */
export function SystemsPage() {
  const { systemId } = useParams();
  const { book, base, editable } = useCatalogueContext();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [adding, setAdding] = useState(false);
  const chosen = systemId !== undefined ? book.systems.get(systemId) : undefined;
  const index = useMemo(() => conceptIndex(book.release), [book.release]);

  const record = adding ? (
    <div className="ds-legacy cat-legacy">
      <SystemEdit onDone={() => setAdding(false)} />
    </div>
  ) : chosen ? (
    <SystemRecord key={chosen.id} system={chosen} index={index} />
  ) : systemId !== undefined ? (
    <EmptyState
      title={`This version has no system “${systemId}”.`}
      action={<RouterLink href={base}>See every system</RouterLink>}
    />
  ) : (
    <RecordPlaceholder title={`${count(book.release.systems.length, "system")}. Choose one to read its record.`}>
      {notice && <p role="status" className="cat-notice"><Status tone="done">{notice}</Status></p>}
      <AllConnections />
    </RecordPlaceholder>
  );

  return (
    <>
      <CatalogueHeader page="systems" />
      <Workbench
        listLabel="Systems"
        chosen={Boolean(chosen) || adding}
        list={<SystemsList index={index} current={chosen?.id} onAdd={editable && !adding ? () => setAdding(true) : undefined} />}
        record={record}
      />
    </>
  );
}

function SystemsList({ index, current, onAdd }: { index: ConceptIndex; current?: string; onAdd?: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const [params, setParams] = useSearchParams();
  const area = params.get("area") ?? ALL;
  const [find, setFind] = useFindParam();

  const rows = useMemo<Row[]>(() => {
    const found = findSystems(book, find);
    return release.systems
      .filter((system) => area === ALL || systemDomains(system).includes(area))
      .filter((system) => !find.trim() || found.has(system.id))
      .map((system) => ({
        system,
        place: domainPath(book.landscape, system.landscape_domain_id).join(" › "),
        why: found.get(system.id) ?? null,
      }));
  }, [book, release.systems, area, find]);

  // Grouped by the landscape's top level, the unplaced last; by name inside each.
  const groups = useMemo<RecordGroup[]>(() => {
    const byTop = new Map<string, Row[]>();
    for (const row of rows) {
      const top = row.place.split(" › ")[0] || "";
      byTop.set(top, [...(byTop.get(top) ?? []), row]);
    }
    const query = params.size ? `?${params}` : "";
    return [...byTop.entries()]
      .sort(([a], [b]) => (a ? (b ? a.localeCompare(b, "en", { sensitivity: "base" }) : -1) : 1))
      .map(([top, members]) => ({
        id: top || "unplaced",
        label: top ? <bdi>{top}</bdi> : "Not placed in the landscape",
        items: members
          .sort((a, b) => a.system.name.localeCompare(b.system.name, "en", { sensitivity: "base" }))
          .map(({ system, place, why }) => ({
            id: system.id,
            href: `${base}/systems/${encodeURIComponent(system.id)}${query}`,
            name: system.name,
            bidi: true,
            detail: why ?? (place.split(" › ").slice(1).join(" › ") || undefined),
            meta: <GapBadge gaps={systemGaps(release, system, index)} />,
          })),
      }));
  }, [rows, params, base, release, index]);

  const areas = release.capability_domains ?? [];
  const filters = [
    { id: ALL, label: "Any capability", count: release.systems.length },
    ...areas.map((domain) => ({ id: domain.id, label: domain.name, count: release.systems.filter((system) => systemDomains(system).includes(domain.id)).length })),
  ];
  const set = (value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === ALL) next.delete("area");
      else next.set("area", value);
      return next;
    }, { replace: true });

  return (
    <>
      <ListTools count={area === ALL && !find.trim() ? count(release.systems.length, "system") : `${count(rows.length, "system")} of ${release.systems.length}`}>
        <ListFind label="Find a system" value={find} onChange={setFind} placeholder="Name, alias or capability" />
        <ListFilter label="Capability domain" value={area} options={filters} onChange={set} />
        {onAdd && <Button variant="tertiary" icon={<Plus size={16} />} onClick={onAdd}>Add a system</Button>}
      </ListTools>
      <RecordList
        label="Systems in this version"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={find.trim() ? `No system is known by “${find.trim()}”.` : "No system works in this capability domain."}
      />
    </>
  );
}

/** The facts a system's record is missing, in the words its record uses. */
function systemGaps(release: Release, system: CatalogueSystem, index: ConceptIndex): string[] {
  const { exposes, uses } = interfacesOf(release, system.id);
  const gaps: string[] = [];
  if (!systemConcepts(system, index).length && !system.capabilities.some((item) => item.unlinked_reason)) gaps.push("concept");
  if (!exposes.length && !uses.length) gaps.push("interfaces");
  if (!system.owner) gaps.push("owner");
  if (!system.confidence) gaps.push("source");
  return gaps;
}

/** The concepts a system's capabilities name; "None fits" when a capability was looked at and none did. */
export function ConceptChips({ system, index }: { system: CatalogueSystem; index: ConceptIndex }) {
  const { base } = useCatalogueContext();
  const concepts = systemConcepts(system, index);
  if (concepts.length) {
    return (
      <ul className="cat-chips">
        {concepts.map((concept) => (
          <li key={concept.id}>
            <Link to={`${base}/concepts/${encodeURIComponent(concept.id)}`} className="cat-chip" dir="auto">{concept.pref_label}</Link>
          </li>
        ))}
      </ul>
    );
  }
  if (system.capabilities.some((item) => item.unlinked_reason)) return <span className="cat-quiet">None fits</span>;
  return <span className="cat-quiet">Not linked</span>;
}

/** With no system chosen: every connection in the version, read as a sentence. */
function AllConnections() {
  const { book, base } = useCatalogueContext();
  const rows = useMemo(() => allConnections(book), [book]);
  const linked = new Set(rows.flatMap((row) => [row.source_system_id, row.target_system_id]));
  const link = (systemId: string) => (
    <Link to={`${base}/systems/${encodeURIComponent(systemId)}`} dir="auto">{systemName(book, systemId)}</Link>
  );
  const columns: Column<Relationship>[] = [
    { id: "from", header: "From", rowHeader: true, bidi: true, cell: (row) => link(row.source_system_id) },
    { id: "how", header: "How", cell: (row) => LINK_VERB[row.kind] },
    { id: "to", header: "To", bidi: true, cell: (row) => link(row.target_system_id) },
    { id: "what", header: "For what", bidi: true, cell: (row) => row.description },
  ];
  return (
    <Section title="Connections" count={rows.length}>
      <p className="cat-lead">
        {count(rows.length, "connection")} between {count(linked.size, "system")}. Each reads from the system that depends to the one it depends on.
      </p>
      <DataTable
        caption="Every connection between systems in this version"
        captionHidden
        columns={columns}
        rows={rows}
        rowId={(row) => `${row.source_system_id}>${row.target_system_id}`}
        emptyText="No system depends on another in this version."
      />
    </Section>
  );
}
