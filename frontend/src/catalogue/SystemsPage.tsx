import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import type { CatalogueSystem, Relationship, Release } from "../api/client";
import {
  Button, type Column, DataTable, EmptyState, FilterStrip, GapBadge, Section, type Sort, SplitPane, Status,
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
 * The systems of a version (redesign phase 5): a ledger of every system, what
 * it does in the ontology's words and how it connects, beside the record of
 * the one chosen. Without a choice, every connection follows the table.
 */
export function SystemsPage() {
  const { systemId } = useParams();
  const { book, base, editable } = useCatalogueContext();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const [adding, setAdding] = useState(false);
  const chosen = systemId !== undefined ? book.systems.get(systemId) : undefined;
  const index = useMemo(() => conceptIndex(book.release), [book.release]);

  const list = (
    <>
      {notice && !adding && <p role="status" className="cat-notice"><Status tone="done">{notice}</Status></p>}
      {editable && !adding && (
        <p className="cat-actions">
          <Button icon={<Plus size={16} />} onClick={() => setAdding(true)}>Add a system</Button>
        </p>
      )}
      {adding && (
        <div className="ds-legacy cat-legacy">
          <SystemEdit onDone={() => setAdding(false)} />
        </div>
      )}
      <SystemsTable index={index} current={chosen?.id} />
    </>
  );

  return (
    <>
      <CatalogueHeader page="systems" />
      {systemId !== undefined && !chosen ? (
        <>
          <EmptyState
            title={`This version has no system “${systemId}”.`}
            action={<RouterLink href={base}>See every system</RouterLink>}
          />
          {list}
        </>
      ) : chosen ? (
        <SplitPane list={list} pane={<SystemRecord key={chosen.id} system={chosen} index={index} />} paneLabel={`System: ${chosen.name}`} />
      ) : (
        <>
          {list}
          <AllConnections />
        </>
      )}
    </>
  );
}

function SystemsTable({ index, current }: { index: ConceptIndex; current?: string }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<Sort>({ id: "place", direction: "ascending" });
  const area = params.get("area") ?? ALL;
  const [find, setFind] = useFindParam();
  const set = (key: string, value: string, empty: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === empty) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });

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

  const sorted = useMemo(() => {
    const key = (row: Row) => (sort.id === "place" ? `${row.place || "~"}\u0000${row.system.name}` : row.system.name);
    const order = [...rows].sort((a, b) => key(a).localeCompare(key(b), "en", { sensitivity: "base" }));
    return sort.direction === "descending" ? order.reverse() : order;
  }, [rows, sort]);

  const areas = release.capability_domains ?? [];
  const filters = [
    { id: ALL, label: "All", count: release.systems.length },
    ...areas.map((domain) => ({ id: domain.id, label: domain.name, count: release.systems.filter((system) => systemDomains(system).includes(domain.id)).length })),
  ];

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "System",
      rowHeader: true,
      sortable: true,
      bidi: true,
      cell: ({ system, why }) => (
        <>
          <Link
            to={`${base}/systems/${encodeURIComponent(system.id)}${params.size ? `?${params}` : ""}`}
            className="cat-name"
            aria-current={system.id === current ? "page" : undefined}
          >
            {system.name}
          </Link>
          {why && <span className="cat-detail">{why}</span>}
        </>
      ),
    },
    { id: "place", header: "Sits in", sortable: true, bidi: true, cell: ({ place }) => place || <span className="cat-quiet">Not placed</span> },
    {
      id: "concepts",
      header: "Does (concept)",
      cell: ({ system }) => <ConceptChips system={system} index={index} />,
    },
    // What the system's record doesn't say yet: one badge, not a column of "Not stated" per field.
    { id: "gaps", header: "Gaps", cell: ({ system }) => <GapBadge gaps={systemGaps(release, system, index)} /> },
  ];
  // Beside a chosen system's record the list narrows to what finds a system; the record says the rest.
  const shown = current ? columns.filter((column) => ["name", "place", "concepts"].includes(column.id)) : columns;

  return (
    <div className="cat-list">
      <FilterStrip
        label="Systems by capability domain"
        filters={filters}
        active={area}
        onChange={(id) => set("area", id, ALL)}
        find={{ label: "Find a system", value: find, onChange: setFind, placeholder: "Name, alias or capability" }}
        onClear={
          area !== ALL || find
            ? () => {
                setFind("");
                setParams({}, { replace: true });
              }
            : undefined
        }
      />
      <p className="cat-count" aria-live="polite">
        {area === ALL && !find.trim() ? count(release.systems.length, "system") : `${count(rows.length, "system")} of ${release.systems.length}`}
      </p>
      <DataTable
        caption="Systems in this version"
        captionHidden
        columns={shown}
        rows={sorted}
        rowId={(row) => row.system.id}
        sort={sort}
        onSort={setSort}
        emptyText={find.trim() ? `No system is known by “${find.trim()}”.` : "No system works in this capability domain."}
      />
    </div>
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
