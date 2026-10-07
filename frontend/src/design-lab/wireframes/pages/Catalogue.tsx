import { useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { CatalogueDiff, Release } from "../../../api/client";
import { catalogue, findSystems, systemName, usedHow } from "../../../catalogue/catalogue";
import { useActiveRelease, useActorName, useChanges, useRelease, useReleases } from "../data";
import { useFocusAfterRender, useStickySize } from "../hooks";
import { useLab, wf } from "../lab-context";
import { ConsequencePanel, Empty, Note, Outcome, Page, ProvenanceLine, Skeleton, StateLine, Status, SubNav } from "../ui";

const SUB = (base: string) => [
  { to: base, label: "Systems", end: false },
  { to: wf("/architecture/versions"), label: "Versions", end: true },
];

/** Browse + Record: the systems index beside one system (version in service, or any version read in "proof"). */
export function CatalogueSystems({ proof }: { proof?: boolean }) {
  const { systemId, releaseId } = useParams();
  const active = useActiveRelease();
  const other = useRelease(proof ? releaseId : undefined);
  const release = proof ? other.data : active.data;
  const top = useRef<HTMLDivElement>(null);
  const name = useActorName();
  useStickySize(top, "--wf-sticky-state");
  if (active.isPending || (proof && other.isPending)) return <Skeleton label="Reading the catalogue" rows={8} />;
  if (!release) return <Empty title="No catalogue version is in service." why="Publish a draft to put one in service." />;
  const base = proof ? wf(`/architecture/versions/${release.id}`) : wf("/architecture");
  const isActive = release.id === active.data?.id;

  return (
    <Page
      title={proof && release.status === "draft" ? `Edit the draft '${release.name}'` : proof && !isActive ? `Catalogue version '${release.name}'` : "Catalogue"}
      archetype="Browse + Record"
      head={
        <>
          {proof && release.status === "draft" ? (
            <StateLine innerRef={top}>
              Editing the draft '<bdi>{release.name}</bdi>' by hand · <Link to={wf(`/architecture/versions/${release.id}/sources`)}>Back to the draft's steps</Link>
            </StateLine>
          ) : proof && !isActive ? (
            <StateLine tone="proof" innerRef={top}>
              You're reading a replaced version, '<bdi>{release.name}</bdi>', published {release.published_at?.slice(0, 10)}. · <Link to={wf("/architecture")}>Read the version in service</Link> ·{" "}
              <Link to={wf(`/architecture/versions?put-back=${release.id}`)}>Put it back…</Link>
            </StateLine>
          ) : (
            <ProvenanceLine>In service: '<bdi>{release.name}</bdi>' · published {release.published_at?.slice(0, 10) ?? "—"} by {name(release.published_by, "the packaged import")}</ProvenanceLine>
          )}
          <SubNav label="Catalogue" items={SUB(base)} />
        </>
      }
    >
      <div className="wf-split">
        <SystemIndex release={release} base={base} current={systemId} />
        {systemId ? <SystemRecord release={release} systemId={systemId} base={base} /> : <Empty title="Choose a system." why="Its description, connections and owner appear here." />}
      </div>
      <Note>A replaced version reads on a distinct tint with a sticky state line, so nobody mistakes it for the version in service.</Note>
    </Page>
  );
}

/** §2.2 combobox find: ↓ ↑ move through matches, Enter opens one, Esc clears. */
function SystemIndex({ release, base, current }: { release: Release; base: string; current?: string }) {
  const book = useMemo(() => catalogue(release), [release]);
  const navigate = useNavigate();
  const id = useId();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const found = useMemo(() => findSystems(book, query), [book, query]);
  const matches = [...found.entries()];
  const systems = [...release.systems].sort((a, b) => a.name.localeCompare(b.name));
  const open = query.trim() !== "" && matches.length > 0;
  return (
    <section className="wf-index" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Systems <span className="wf-quiet">{release.systems.length}</span></h2>
      <a className="wf-skip wf-skip--local" href="#wf-record">Skip to the details</a>
      <div className="wf-combobox">
        <label htmlFor={`${id}-q`}>Find a system</label>
        <input
          id={`${id}-q`}
          data-wf-find
          dir="auto"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open ? `${id}-opt-${index}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setIndex((i) => Math.min(i + 1, matches.length - 1)); }
            else if (event.key === "ArrowUp") { event.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (event.key === "Enter" && matches[index]) { event.preventDefault(); navigate(`${base}/systems/${matches[index]![0]}`); setQuery(""); }
            else if (event.key === "Escape") setQuery("");
          }}
        />
        {open && (
          <ul id={`${id}-list`} role="listbox" aria-label="Matching systems" className="wf-listbox">
            {matches.map(([systemId, why], i) => (
              <li key={systemId} id={`${id}-opt-${i}`} role="option" aria-selected={i === index} onMouseDown={(event) => { event.preventDefault(); navigate(`${base}/systems/${systemId}`); setQuery(""); }}>
                <bdi>{systemName(book, systemId)}</bdi>{why && <span className="wf-quiet"> · {why}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="wf-quiet" role="status">{query.trim() ? `${matches.length} matches` : ""}</p>
      </div>
      <ul className="wf-index__list">
        {systems.map((system) => (
          <li key={system.id}>
            <Link to={`${base}/systems/${system.id}`} aria-current={system.id === current ? "page" : undefined}><bdi>{system.name}</bdi></Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SystemRecord({ release, systemId, base }: { release: Release; systemId: string; base: string }) {
  const book = useMemo(() => catalogue(release), [release]);
  const system = book.systems.get(systemId);
  if (!system) return <Empty title="This version has no such system." why="It may have been added or removed in another version." />;
  const out = release.relationships.filter((item) => item.source_system_id === systemId);
  const into = release.relationships.filter((item) => item.target_system_id === systemId);
  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  return (
    <section id="wf-record" className="wf-record" aria-labelledby="wf-sys" tabIndex={-1}>
      <h2 id="wf-sys"><bdi>{system.name}</bdi></h2>
      {system.name_ar && <p lang="ar" dir="rtl" className="wf-ar">{system.name_ar}</p>}
      <ProvenanceLine>
        In '<bdi>{release.name}</bdi>'. Introduced and changed: one step away in Versions › Compare.{" "}
        <span className="wf-quiet">(Per-version provenance; published facts carry no per-fact passage.)</span>
      </ProvenanceLine>
      {system.description && <p dir="auto">{system.description}</p>}
      <h3>Connections</h3>
      {out.length + into.length === 0 ? (
        <p className="wf-quiet">No connections recorded.</p>
      ) : (
        <ul className="wf-lines">
          {out.map((item) => (
            <li key={`o-${item.target_system_id}-${item.kind}`}>
              <bdi>{system.name}</bdi> {lower(usedHow(item.kind, ""))}<Link to={`${base}/systems/${item.target_system_id}`}><bdi>{systemName(book, item.target_system_id)}</bdi></Link>
              {item.description && <span className="wf-quiet"> · for {item.description}</span>}
            </li>
          ))}
          {into.map((item) => (
            <li key={`i-${item.source_system_id}-${item.kind}`}>
              <Link to={`${base}/systems/${item.source_system_id}`}><bdi>{systemName(book, item.source_system_id)}</bdi></Link> {lower(usedHow(item.kind, ""))}<bdi>{system.name}</bdi>
            </li>
          ))}
        </ul>
      )}
      <h3>Capabilities</h3>
      <ul className="wf-lines">{system.capabilities.map((capability) => <li key={capability.id}>{capability.name}</li>)}</ul>
    </section>
  );
}

/** Browse + Compare: every version; compare any two with from → to values; put one back. */
export function CatalogueVersions() {
  const releases = useReleases();
  const active = useActiveRelease();
  const [params, setParams] = useSearchParams();
  const lab = useLab();
  const from = params.get("from") ?? active.data?.id ?? "";
  const to = params.get("to") ?? releases.data?.find((release) => release.id !== from)?.id ?? "";
  const putBackId = params.get("put-back");
  const focusLater = useFocusAfterRender();
  const changes = useChanges(to || undefined, from || undefined);
  const fromRelease = releases.data?.find((release) => release.id === from);
  const toRelease = releases.data?.find((release) => release.id === to);
  const [outcome, setOutcome] = useState<string | null>(null);
  const target = releases.data?.find((release) => release.id === putBackId && release.id !== active.data?.id);
  const closePutBack = (id: string) => {
    params.delete("put-back");
    setParams(params, { replace: true });
    focusLater(() => document.getElementById(`putback-${id}`));
  };
  if (releases.isPending) return <Skeleton label="Reading the versions" />;
  const set = (key: string, value: string) => { params.set(key, value); setParams(params, { replace: true }); };

  return (
    <Page title="Catalogue versions" archetype="Browse + Compare" head={<SubNav label="Catalogue" items={SUB(wf("/architecture"))} />}>
      <table className="wf-table">
        <caption>Every version</caption>
        <thead><tr><th scope="col">Version</th><th scope="col">State</th><th scope="col">Published</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          {(releases.data ?? []).map((release) => {
            const state = release.status === "draft" ? "Draft" : release.id === active.data?.id ? "In service" : "Replaced";
            return (
              <tr key={release.id}>
                <th scope="row">
                  <Link to={release.status === "draft" ? wf(`/architecture/versions/${release.id}/sources`) : wf(`/architecture/versions/${release.id}`)}><bdi>{release.name}</bdi></Link>
                </th>
                <td>{state === "In service" ? <Status state="done">In service</Status> : state === "Draft" ? <Status state="waiting">Draft</Status> : "Replaced"}</td>
                <td className="wf-num">{release.published_at?.slice(0, 10) ?? "—"}</td>
                <td>
                  {state === "Replaced" && (
                    <button id={`putback-${release.id}`} type="button" className="wf-button" aria-expanded={putBackId === release.id} onClick={() => set("put-back", release.id)}>Put back in service…</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {target && (
        <ConsequencePanel
          title={`Put '${target.name}' back in service`}
          happens={<>'<bdi>{target.name}</bdi>' goes back in service at once, replacing '<bdi>{active.data?.name}</bdi>'.</>}
          affects={<p>Requirement work maps new requirements against it from then on. {lab.scenario === "rp-unreachable" ? "Mapping impact is unknown (Requirement AI didn't answer)." : "Mapping impact is checked when you confirm."}</p>}
          reversible="You can put the current version back later from this page."
          reasonLabel="Why put it back?"
          reasonHint="Recorded in the catalogue's history."
          confirm={`Put '${target.name}' back in service`}
          keep={`Keep '${active.data?.name}' in service`}
          onConfirm={() => lab.simulate(`putback:${target.id}`, true).then(() => { setOutcome(`'${target.name}' is in service.`); closePutBack(target.id); }, () => setOutcome("Couldn't put it back. Try again."))}
          onKeep={() => closePutBack(target.id)}
        />
      )}
      <Outcome text={outcome} />

      <section className="wf-section" aria-labelledby="cmp">
        <h2 id="cmp">Compare two versions</h2>
        <div className="wf-actions">
          <label className="wf-inline">From <select value={from} onChange={(event) => set("from", event.target.value)}>{(releases.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="wf-inline">To <select value={to} onChange={(event) => set("to", event.target.value)}>{(releases.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        {changes.data && fromRelease && toRelease ? <DiffList diff={changes.data} from={fromRelease} to={toRelease} /> : <Skeleton label="Comparing" rows={4} />}
      </section>
    </Page>
  );
}

/** Compare archetype body: counts by kind, then each change with from → to and its kind in words. */
export function DiffList({ diff, from, to, origin }: { diff: CatalogueDiff; from: Release; to: Release; origin?: (key: string) => string }) {
  if (diff.changes.length === 0) return <Empty title="No differences." why="These two versions hold the same catalogue." />;
  const kinds = ["added", "changed", "removed"] as const;
  const fromSystems = new Map(from.systems.map((system) => [system.id, system]));
  const toSystems = new Map(to.systems.map((system) => [system.id, system]));
  const value = (key: string, field: string, side: "from" | "to") => {
    const system = (side === "from" ? fromSystems : toSystems).get(key);
    if (!system) return null;
    const raw = (system as Record<string, unknown>)[field];
    if (raw === null || raw === undefined || raw === "") return "—";
    return Array.isArray(raw) ? `${raw.length} items` : String(raw);
  };
  return (
    <>
      <p role="status">
        {kinds.map((kind) => `${diff.changes.filter((c) => c.change === kind).length} ${kind}`).join(" · ")}
      </p>
      <table className="wf-table">
        <caption className="visually-hidden">Changes from '{from.name}' to '{to.name}'</caption>
        <thead><tr><th scope="col">Change</th><th scope="col">What</th><th scope="col">From → to</th>{origin && <th scope="col">Origin</th>}</tr></thead>
        <tbody>
          {diff.changes.map((change) => (
            <tr key={`${change.item}-${change.key}-${change.change}`}>
              <td>{change.change === "added" ? "+ Added" : change.change === "removed" ? "− Removed" : "~ Changed"}</td>
              <th scope="row">{change.item.replace(/_/g, " ")}: <bdi>{change.label}</bdi></th>
              <td>
                {change.change === "changed" && change.item === "system"
                  ? change.fields.map((field) => (
                      <span key={field} className="wf-fromto">{field.replace(/_/g, " ")}: <bdi>{value(change.key, field, "from")}</bdi> → <bdi>{value(change.key, field, "to")}</bdi></span>
                    ))
                  : change.fields.length ? change.fields.join(", ").replace(/_/g, " ") : "—"}
              </td>
              {origin && <td>{origin(change.key)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
