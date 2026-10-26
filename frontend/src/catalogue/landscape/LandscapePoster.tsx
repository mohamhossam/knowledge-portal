/**
 * Where systems sit, drawn (catalogue merge, step 2): the version's landscape as
 * the layered map the catalogue lab designed, inside /architecture. Each layer is
 * a band of its groups and systems; picking a system shows what it is and what it
 * is linked to beside the map, with the way to its full record. The layer filter
 * and the picked system live in the URL (`?layer=`, `?system=`), so a view can be
 * shared. Systems placed in no layer are listed under the map, never left out.
 */
import "./landscape.css";

import { type ReactNode, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { Release } from "../../api/client";
import { Button, type ComboOption, Combobox, Facts, FilterStrip } from "../../design/components";
import { count } from "../../home/format";
import { fromRelease } from "../model/adapter";
import type { Catalogue, System } from "../model/model";
import { ArchitectureMap } from "./ArchitectureMap";
import { layerRank, partnersOf } from "./posterModel";
import { useLinkCounts, useSystemParam } from "./systemHooks";

const ALL = "all";

export function LandscapePoster({ release, base }: { release: Release; base: string }) {
  const data = useMemo(() => fromRelease(release), [release]);
  const [params, setParams] = useSearchParams();
  const [selected, select] = useSystemParam();
  const [showLinks, setShowLinks] = useState(false);
  const { linkCounts } = useLinkCounts(data);

  // The layers that hold systems, in map order; the ones placed in none, apart.
  const layers = useMemo(() => {
    const rank = layerRank(data.domains);
    return data.domains.filter((domain) => data.systems.some((system) => system.domain === domain.id)).sort((a, b) => rank(a.id) - rank(b.id));
  }, [data]);
  const unplaced = useMemo(() => data.systems.filter((system) => !layers.some((layer) => layer.id === system.domain)), [data, layers]);
  const placed = data.systems.length - unplaced.length;

  const wanted = params.get("layer");
  const focus = layers.some((layer) => layer.id === wanted) ? wanted : null;
  const showLayer = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === ALL) next.delete("layer");
    else next.set("layer", id);
    setParams(next, { replace: true });
  };
  const systemById = useMemo(() => new Map(data.systems.map((system) => [system.id, system])), [data]);
  const picked = selected ? systemById.get(selected) ?? null : null;
  const options = useMemo<ComboOption[]>(
    () => data.systems.map((system) => ({ id: system.id, label: system.name, hint: system.aliases.join(", ") || undefined })),
    [data],
  );

  if (!data.systems.length) return <p className="cat-quiet">This version has no system yet.</p>;
  return (
    <div className="lsc">
      <div className="lsc-tools">
        <FilterStrip
          label="Layer"
          filters={[{ id: ALL, label: "All layers", count: placed }, ...layers.map((layer) => ({ id: layer.id, label: layer.name, count: data.systems.filter((system) => system.domain === layer.id).length }))]}
          active={focus ?? ALL}
          onChange={showLayer}
        />
        <div className="lsc-find">
          <Combobox label="Find a system" options={options} placeholder="Name or other name" onSelect={(option) => select(option.id)} />
        </div>
        <Button variant="quiet" aria-pressed={showLinks} onClick={() => setShowLinks((on) => !on)}>
          {showLinks ? "Hide every link" : "Show every link"}
        </Button>
      </div>

      <div className={`lsc-board${picked ? " lsc-board--picked" : ""}`}>
        <div className="lsc-map">
          {placed > 0 ? (
            <ArchitectureMap data={data} label={`${release.name ?? "This version"} layers`} linkCounts={linkCounts} selected={selected} onSelect={select} showLinks={showLinks} focusLayer={focus} />
          ) : (
            <p className="cat-quiet">No system is placed in a layer yet: they are all listed below.</p>
          )}
          <PosterKey />
        </div>
        {picked && <SystemSummary data={data} system={picked} linkCounts={linkCounts} base={base} onSelect={select} />}
      </div>

      {unplaced.length > 0 && (
        <details className="lsc-unplaced">
          <summary className="lsc-unplaced__summary">
            {count(unplaced.length, "system is", "systems are")} in no layer yet
          </summary>
          <p className="cat-quiet">Placing one is an edit to its system record. Pick one to see what it is linked to.</p>
          <ul className="lsc-unplaced__list">
            {unplaced.map((system) => (
              <li key={system.id}>
                <Button variant="link" aria-pressed={selected === system.id} onClick={() => select(selected === system.id ? null : system.id)}>
                  <bdi>{system.name}</bdi>
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="ds-visually-hidden" aria-live="polite">
        {picked ? `${picked.name} picked: ${count(partnersOf(picked.id, linkCounts).length, "linked system")}.` : ""}
      </p>
    </div>
  );
}

/** What the cards' marks mean, drawn with the cards' own styles. */
function PosterKey() {
  const marks: [string, string][] = [
    ["picked", "The system you picked"],
    ["linked", "Linked to it"],
    ["external", "Outside the organisation"],
    ["proposed", "A source places it elsewhere"],
  ];
  return (
    <ul className="lsc-key" aria-label="Key">
      {marks.map(([mark, words]) => (
        <li key={mark}>
          <span className={`lsc-key__mark lsc-key__mark--${mark}`} aria-hidden="true" />
          {words}
        </li>
      ))}
    </ul>
  );
}

/**
 * The picked system, beside a map: where it sits, what it does, what it is linked to, and its
 * record. `facts` adds what the map around it knows (an offering's footprint says how much of
 * the offering reaches it).
 */
export function SystemSummary({ data, system, linkCounts, base, onSelect, facts: more = [] }: {
  data: Catalogue;
  system: System;
  linkCounts: ReturnType<typeof useLinkCounts>["linkCounts"];
  base: string;
  onSelect: (id: string | null) => void;
  facts?: [string, ReactNode][];
}) {
  const domain = data.domains.find((item) => item.id === system.domain);
  const group = domain?.groups.find((item) => item.id === system.group);
  const byId = new Map(data.systems.map((item) => [item.id, item]));
  const partners = partnersOf(system.id, linkCounts)
    .map((item) => byId.get(item.id))
    .filter((item): item is System => Boolean(item));
  const facts: [string, ReactNode][] = [
    ["Layer", domain ? [domain.name, group?.name].filter(Boolean).join(" › ") : "In no layer yet"],
    ["Owner", system.owner ?? <span className="cat-quiet">Not recorded</span>],
    ["Linked systems", partners.length.toLocaleString("en")],
    ...more,
  ];
  return (
    <aside
      className="lsc-summary"
      aria-labelledby="lsc-summary-h"
      onKeyDown={(event) => {
        if (event.key === "Escape") onSelect(null);
      }}
    >
      <div className="lsc-summary__head">
        <h3 id="lsc-summary-h" dir="auto">{system.name}</h3>
        <Button variant="quiet" onClick={() => onSelect(null)} aria-label={`Close the summary of ${system.name}`}>Close</Button>
      </div>
      <p dir="auto">{system.function || <span className="cat-quiet">Its sources don't say what it does.</span>}</p>
      {system.proposedMove && (
        <p className="lsc-summary__note">
          A source places it in {system.proposedMove.from}. {system.proposedMove.reason}
        </p>
      )}
      <Facts items={facts} />
      {partners.length > 0 && (
        <ul className="lsc-summary__links" aria-label={`Systems linked to ${system.name}`}>
          {partners.map((partner) => (
            <li key={partner.id}>
              <Button variant="link" onClick={() => onSelect(partner.id)}>
                <bdi>{partner.name}</bdi>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Link className="lsc-summary__record" to={`${base}/systems/${encodeURIComponent(system.id)}`}>
        Open the full record of <bdi>{system.name}</bdi>
      </Link>
    </aside>
  );
}
