import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { CatalogueDiff, Release } from "../../../api/client";
import { catalogue, findSystems, systemName, usedHow } from "../../../catalogue/catalogue";
import {
  Button,
  type Change,
  type Column,
  Combobox,
  ConsequencePanel,
  DataTable,
  DiffView,
  EmptyState,
  PageHeader,
  ProvenanceLine,
  Section,
  Select,
  Skeleton,
  SplitPane,
  StateLine,
  Status,
  SubNav,
} from "../../../design/components";
import { useFocusAfterRender } from "../../../design/hooks";
import { useActiveRelease, useActorName, useChanges, useRelease, useReleases } from "../../wireframes/data";
import { useLab } from "../../wireframes/lab-context";
import { proto } from "../paths";
import { Lines, Outcome, RouterLink } from "../ui";

function sub(current: "systems" | "versions", systemsHref = proto("/architecture")) {
  return [
    { href: systemsHref, label: "Systems", current: current === "systems" },
    { href: proto("/architecture/versions"), label: "Versions", current: current === "versions" },
  ];
}

/** Browse + Record: the systems index beside one system (the version in service, or any version read as "proof"). */
export function CatalogueSystems({ proof }: { proof?: boolean }) {
  const { systemId, releaseId } = useParams();
  const active = useActiveRelease();
  const other = useRelease(proof ? releaseId : undefined);
  const release = proof ? other.data : active.data;
  const name = useActorName();
  if (active.isPending || (proof && other.isPending)) return <Skeleton label="Reading the catalogue" rows={8} />;
  if (!release) {
    return (
      <>
        <PageHeader title="Catalogue" />
        <EmptyState title="No catalogue version is in service."><p>Publish a draft to put one in service.</p></EmptyState>
      </>
    );
  }
  const base = proof ? proto(`/architecture/versions/${release.id}`) : proto("/architecture");
  const isActive = release.id === active.data?.id;
  const draft = proof && release.status === "draft";
  const replaced = proof && !isActive && !draft;

  return (
    <>
      <PageHeader
        title={draft ? `Edit the draft '${release.name}'` : replaced ? `Catalogue version '${release.name}'` : "Catalogue"}
        provenance={!proof || isActive ? <>In service: '<bdi>{release.name}</bdi>' · published {release.published_at?.slice(0, 10) ?? "—"} by <bdi>{name(release.published_by, "the packaged import")}</bdi></> : undefined}
      >
        {draft && (
          <StateLine>
            Editing the draft '<bdi>{release.name}</bdi>' by hand · <RouterLink href={proto(`/architecture/versions/${release.id}/sources`)}>Back to the draft's steps</RouterLink>
          </StateLine>
        )}
        {replaced && (
          <StateLine tone="proof">
            You're reading a replaced version, '<bdi>{release.name}</bdi>', published {release.published_at?.slice(0, 10)}. ·{" "}
            <RouterLink href={proto("/architecture")}>Read the version in service</RouterLink> ·{" "}
            <RouterLink href={proto(`/architecture/versions?put-back=${release.id}`)}>Put it back…</RouterLink>
          </StateLine>
        )}
        <SubNav label="Catalogue" link={RouterLink} items={sub("systems", base)} />
      </PageHeader>
      <SplitPane
        paneLabel={systemId ? "System" : "No system chosen"}
        list={<SystemIndex release={release} base={base} current={systemId} />}
        pane={systemId ? <SystemRecord release={release} systemId={systemId} base={base} /> : <p className="proto-quiet">Choose a system. Its description, connections and capabilities appear here.</p>}
      />
    </>
  );
}

function SystemIndex({ release, base, current }: { release: Release; base: string; current?: string }) {
  const book = useMemo(() => catalogue(release), [release]);
  const navigate = useNavigate();
  const systems = [...release.systems].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Section title="Systems" count={release.systems.length}>
      <div className="proto-index">
        <Combobox
          label="Find a system"
          hint="By name, Arabic name, capability or connection. ↓ ↑ move through matches, Enter opens one."
          options={[]}
          search={(query) => (query.trim() ? [...findSystems(book, query).entries()].map(([id, why]) => ({ id, label: systemName(book, id), hint: why || undefined })) : [])}
          onSelect={(option) => navigate(`${base}/systems/${option.id}`)}
          placeholder="Type a name"
          emptyText="No system matches."
        />
        <ul className="proto-index__list" aria-label="Every system">
          {systems.map((system) => (
            <li key={system.id}>
              <RouterLink href={`${base}/systems/${system.id}`} aria-current={system.id === current ? "page" : undefined}><bdi>{system.name}</bdi></RouterLink>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function SystemRecord({ release, systemId, base }: { release: Release; systemId: string; base: string }) {
  const book = useMemo(() => catalogue(release), [release]);
  const system = book.systems.get(systemId);
  if (!system) return <p className="proto-quiet">This version has no such system. It may have been added or removed in another version.</p>;
  const out = release.relationships.filter((item) => item.source_system_id === systemId);
  const into = release.relationships.filter((item) => item.target_system_id === systemId);
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  return (
    <article className="proto-record" aria-labelledby="proto-system">
      <h2 id="proto-system"><bdi>{system.name}</bdi></h2>
      {system.name_ar && <p lang="ar" dir="rtl" className="proto-ar">{system.name_ar}</p>}
      <ProvenanceLine>In '<bdi>{release.name}</bdi>'. When it was introduced or changed: Versions › Compare.</ProvenanceLine>
      {system.description && <p dir="auto">{system.description}</p>}
      <h3>Connections</h3>
      {out.length + into.length === 0 ? (
        <p className="proto-quiet">No connections recorded.</p>
      ) : (
        <Lines>
          {out.map((item) => (
            <li key={`o-${item.target_system_id}-${item.kind}`}>
              <bdi>{system.name}</bdi> {lower(usedHow(item.kind, ""))}<RouterLink href={`${base}/systems/${item.target_system_id}`}><bdi>{systemName(book, item.target_system_id)}</bdi></RouterLink>
              {item.description && <span className="proto-quiet"> · for {item.description}</span>}
            </li>
          ))}
          {into.map((item) => (
            <li key={`i-${item.source_system_id}-${item.kind}`}>
              <RouterLink href={`${base}/systems/${item.source_system_id}`}><bdi>{systemName(book, item.source_system_id)}</bdi></RouterLink> {lower(usedHow(item.kind, ""))}<bdi>{system.name}</bdi>
            </li>
          ))}
        </Lines>
      )}
      <h3>Capabilities</h3>
      {system.capabilities.length ? <Lines>{system.capabilities.map((capability) => <li key={capability.id}>{capability.name}</li>)}</Lines> : <p className="proto-quiet">None recorded.</p>}
    </article>
  );
}

/** Browse + Compare: every version; compare any two with from → to values; put a replaced one back. */
export function CatalogueVersions() {
  const releases = useReleases();
  const active = useActiveRelease();
  const [params, setParams] = useSearchParams();
  const lab = useLab();
  const focusLater = useFocusAfterRender();
  const from = params.get("from") ?? active.data?.id ?? "";
  // By default: the version in service against the draft being prepared (else the newest other one).
  const to = params.get("to") ?? (releases.data?.find((release) => release.status === "draft") ?? releases.data?.find((release) => release.id !== from))?.id ?? "";
  const putBackId = params.get("put-back");
  const changes = useChanges(to || undefined, from || undefined);
  const fromRelease = releases.data?.find((release) => release.id === from);
  const toRelease = releases.data?.find((release) => release.id === to);
  const [outcome, setOutcome] = useState<string | null>(null);
  const target = releases.data?.find((release) => release.id === putBackId && release.id !== active.data?.id);
  const set = (key: string, value: string | null) => {
    if (value === null) params.delete(key);
    else params.set(key, value);
    setParams(params, { replace: true });
  };
  const closePutBack = (id: string) => {
    set("put-back", null);
    focusLater(() => document.getElementById(`putback-${id}`));
  };
  if (releases.isPending) return <Skeleton label="Reading the versions" />;
  const all = releases.data ?? [];

  const columns: Column<Release>[] = [
    {
      id: "name",
      header: "Version",
      rowHeader: true,
      bidi: true,
      cell: (release) => <RouterLink href={release.status === "draft" ? proto(`/architecture/versions/${release.id}/sources`) : proto(`/architecture/versions/${release.id}`)}>{release.name}</RouterLink>,
    },
    { id: "state", header: "State", cell: (release) => (release.status === "draft" ? <Status tone="neutral">Draft</Status> : release.id === active.data?.id ? <Status tone="done">In service</Status> : "Replaced") },
    { id: "published", header: "Published", numeric: true, cell: (release) => release.published_at?.slice(0, 10) ?? "—" },
    {
      id: "actions",
      header: <span className="ds-visually-hidden">Actions</span>,
      cell: (release) =>
        release.status !== "draft" && release.id !== active.data?.id ? (
          <Button id={`putback-${release.id}`} aria-expanded={putBackId === release.id} onClick={() => set("put-back", release.id)}>
            Put back in service…<span className="ds-visually-hidden">: {release.name}</span>
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Catalogue versions" lead="Every version of the catalogue: the one in service, drafts, and the ones it replaced.">
        <SubNav label="Catalogue" link={RouterLink} items={sub("versions")} />
      </PageHeader>
      <DataTable caption="Every version" captionHidden columns={columns} rows={all} rowId={(release) => release.id} />
      {target && (
        <ConsequencePanel
          title={`Put '${target.name}' back in service`}
          happens={<>'<bdi>{target.name}</bdi>' goes back in service at once, replacing '<bdi>{active.data?.name}</bdi>'.</>}
          affects={<p>Requirement work maps new requirements against it from then on. {lab.scenario === "rp-unreachable" ? <Status tone="attention">Mapping impact is unknown: Requirement AI didn't answer.</Status> : "Mapping impact is checked when you confirm."}</p>}
          reversibility="You can put the current version back later from this page."
          reason={{ label: "Why put it back?", hint: "Recorded in the catalogue's history." }}
          confirmLabel={`Put '${target.name}' back in service`}
          keepLabel={`Keep '${active.data?.name}' in service`}
          onConfirm={() => lab.simulate(`putback:${target.id}`, true).then(() => { setOutcome(`'${target.name}' is in service.`); closePutBack(target.id); }, () => setOutcome("Couldn't put it back. Try again."))}
          onKeep={() => closePutBack(target.id)}
        />
      )}
      <Outcome text={outcome} />
      <Section title="Compare two versions">
        <div className="proto-choices">
          <Select label="From" value={from} onChange={(event) => set("from", event.target.value)}>
            {all.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
          </Select>
          <Select label="To" value={to} onChange={(event) => set("to", event.target.value)}>
            {all.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
          </Select>
        </div>
        {changes.data && fromRelease && toRelease ? <Diff diff={changes.data} from={fromRelease} to={toRelease} /> : <Skeleton label="Comparing" rows={4} />}
      </Section>
    </>
  );
}

/** The API's diff as the design system's DiffView: kind in words, from → to values, origin when known. */
export function Diff({ diff, from, to, origin }: { diff: CatalogueDiff; from: Release; to: Release; origin?: (key: string) => string }) {
  const fromSystems = new Map(from.systems.map((system) => [system.id, system]));
  const toSystems = new Map(to.systems.map((system) => [system.id, system]));
  const value = (key: string, field: string, side: "from" | "to") => {
    const system = (side === "from" ? fromSystems : toSystems).get(key);
    if (!system) return "—";
    const raw = (system as Record<string, unknown>)[field];
    if (raw === null || raw === undefined || raw === "") return "—";
    return Array.isArray(raw) ? `${raw.length} items` : String(raw);
  };
  const changes: Change[] = diff.changes.map((change) => ({
    key: `${change.item}-${change.key}`,
    kind: change.change,
    item: change.item.replace(/_/g, " "),
    label: change.label,
    fields:
      change.change === "changed" && change.item === "system"
        ? change.fields
            .map((field) => ({ name: field.replace(/_/g, " "), from: value(change.key, field, "from"), to: value(change.key, field, "to") }))
            // A field the record doesn't carry reads "—" on both sides: say nothing rather than "— → —".
            .filter((field) => field.from !== field.to)
        : change.change === "changed" && change.fields.length
          ? [{ name: "Fields", from: "—", to: change.fields.join(", ").replace(/_/g, " ") }]
          : undefined,
    origin: origin?.(change.key),
  }));
  return <DiffView changes={changes} fromLabel={from.name ?? "—"} toLabel={to.name ?? "—"} empty="No differences. These two versions hold the same catalogue." />;
}
