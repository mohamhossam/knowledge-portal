import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api, type CatalogueSystem, type Release } from "../api/client";
import {
  Button, EmptyState, GapBadge, ListFilter, ListFind, ListTools, RecordList, type RecordGroup,
  RecordPlaceholder, Status, Tabs, Workbench,
} from "../design/components";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { domainPath, findSystems } from "./catalogue";
import { SystemEdit } from "./DraftEdits";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useFindParam } from "./frame/useFindParam";
import { type ConceptIndex, conceptIndex, interfacesOf, systemConcepts, systemDomains } from "./ontology";
import { SystemRecord } from "./SystemRecord";
import { type MatrixView, SystemsMatrices } from "./systems/SystemsMatrices";
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
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const record = adding ? (
    <SystemEdit onDone={() => setAdding(false)} />
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
      <MapLine />
    </RecordPlaceholder>
  );

  // The systems one at a time (their records), or read across as a matrix (catalogue merge, step 5).
  const view: View = systemId === undefined && (params.get("view") === "interfaces" || params.get("view") === "delivery") ? (params.get("view") as View) : "records";
  const chooseView = (next: View) =>
    setParams((previous) => {
      const query = new URLSearchParams(previous);
      if (next === "records") query.delete("view");
      else query.set("view", next);
      query.delete("system");
      return query;
    }, { replace: true });

  return (
    <>
      <CatalogueHeader page="systems" chosen={chosen?.name} />
      <Tabs label="Ways to read the systems" tabs={VIEWS} selected={view} onSelect={(next) => (systemId !== undefined && next !== "records" ? navigate(`${base}?view=${next}`) : chooseView(next))}>
        {view === "records" ? (
          <Workbench
            listLabel="Systems"
            chosen={Boolean(chosen) || adding}
            list={<SystemsList index={index} current={chosen?.id} onAdd={editable && !adding ? () => setAdding(true) : undefined} />}
            record={record}
          />
        ) : (
          <SystemsMatrices view={view} />
        )}
      </Tabs>
    </>
  );
}

type View = "records" | MatrixView;

const VIEWS: { id: View; label: string }[] = [
  { id: "records", label: "Records" },
  { id: "interfaces", label: "Who calls whom" },
  { id: "delivery", label: "What they deliver" },
];

function SystemsList({ index, current, onAdd }: { index: ConceptIndex; current?: string; onAdd?: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const [params, setParams] = useSearchParams();
  const area = params.get("area") ?? ALL;
  const [find, setFind] = useFindParam();
  // Who runs a system is Ownership's word, as the record says: the squads of today.
  const organisation = useQuery({ queryKey: ["organisation"], queryFn: api.organisation });
  const run = useMemo(
    () => (organisation.data ? new Set(organisation.data.squads.flatMap((squad) => squad.resources.map((seat) => seat.system_id))) : undefined),
    [organisation.data],
  );
  const gaps = useMemo(() => versionGaps(release, index, run), [release, index, run]);

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
            name: system.deprecated ? <span className="cat-retired">{system.name}</span> : system.name,
            bidi: true,
            detail: why ?? (place.split(" › ").slice(1).join(" › ") || undefined),
            meta: system.deprecated ? <span className="cat-quiet">Retired</span> : <GapBadge gaps={(gaps.bySystem.get(system.id) ?? []).filter((gap) => !gaps.common.has(gap))} />,
          })),
      }));
  }, [rows, params, base, gaps]);

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
      <ListTools
        count={area === ALL && !find.trim() ? count(release.systems.length, "system") : `${count(rows.length, "system")} of ${release.systems.length}`}
        note={gaps.note}
      >
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

type Gap = "concept" | "interfaces" | "squad" | "source";

/** A gap in the words the row's badge uses ("Missing: …"). */
const GAP_WORD: Record<Gap, string> = { concept: "concept", interfaces: "interfaces", squad: "squad", source: "source" };

/**
 * The facts each system's record is missing, in the words its record uses.
 * A gap more than half the systems share is `common`: the list says it once,
 * in `note`, and a row's badge shows only what sets that system apart.
 * Squads (`run`) are left out until Ownership has answered.
 */
function versionGaps(release: Release, index: ConceptIndex, run: Set<string> | undefined) {
  const bySystem = new Map<string, Gap[]>();
  const tally = new Map<Gap, number>();
  for (const system of release.systems) {
    const { exposes, uses } = interfacesOf(release, system.id);
    const gaps: Gap[] = [];
    if (!systemConcepts(system, index).length && !system.capabilities.some((item) => item.unlinked_reason)) gaps.push("concept");
    if (!exposes.length && !uses.length) gaps.push("interfaces");
    if (run && !run.has(system.id)) gaps.push("squad");
    if (!system.confidence) gaps.push("source");
    bySystem.set(system.id, gaps);
    for (const gap of gaps) tally.set(gap, (tally.get(gap) ?? 0) + 1);
  }
  const total = release.systems.length;
  const common = new Set([...tally].filter(([, many]) => total > 1 && many * 2 > total).map(([gap]) => gap));
  const said = [...common].map((gap) => {
    const many = tally.get(gap)!;
    return `${GAP_WORD[gap]} (${many === total ? "all" : many})`;
  });
  const note = said.length ? `Missing on most systems: ${said.join(", ")}.` : undefined;
  return { bySystem, common, note };
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

/** With no system chosen: how many connections there are, and the way to read them across. */
function MapLine() {
  const { book, base } = useCatalogueContext();
  const connections = book.release.relationships.length;
  return (
    <p className="cat-lead">
      {connections ? `${count(connections, "connection")} between systems in this version.` : "No system depends on another in this version."}{" "}
      <RouterLink href={`${base}?view=interfaces`}>See who calls whom across every system</RouterLink>
    </p>
  );
}
