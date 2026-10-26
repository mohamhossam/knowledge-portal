/**
 * An offering's footprint (catalogue merge, step 3, from the lab's Architecture
 * page): every system its journeys reach, lit on the layered map in three calm
 * tiers (core to most journeys, used by some, carrying calls only), each card
 * naming the system's role for the offering. One journey can be lit on its own.
 * Picking a system shows its summary beside the map, as on the Landscape.
 */
import "../landscape/landscape.css";

import { type ReactNode, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { Release } from "../../api/client";
import { Facts, Section, Select } from "../../design/components";
import { count } from "../../home/format";
import { ArchitectureMap, type Foot } from "../landscape/ArchitectureMap";
import { SystemSummary } from "../landscape/LandscapePoster";
import { allViews, links, reachOf } from "../landscape/posterModel";
import { useSystemParam } from "../landscape/systemHooks";
import { fromRelease } from "../model/adapter";
import { coreThreshold } from "../model/catalogueRules";
import { impactOf } from "../model/impact";

const TIER_WORDS: Record<Foot["tier"], string> = {
  core: "Core: in half its journeys or more",
  used: "Used by some of its journeys",
  carries: "Carries calls only",
};

export function OfferingFootprint({ release, offeringId, base }: { release: Release; offeringId: string; base: string }) {
  const data = useMemo(() => fromRelease(release), [release]);
  const offering = data.offerings.find((item) => item.id === offeringId);
  const journeys = useMemo(() => data.journeys.filter((journey) => journey.offeringId === offeringId), [data, offeringId]);
  const [params, setParams] = useSearchParams();
  const [selected, select] = useSystemParam();
  // One journey lit on its own (`?journey=`), or all of them.
  const wanted = params.get("journey");
  const journey = journeys.find((item) => item.id === wanted) ?? null;
  const showJourney = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("journey", id);
    else next.delete("journey");
    setParams(next, { replace: true });
  };

  const views = useMemo(() => allViews(data).filter((view) => view.offeringId === offeringId && (!journey || view.id === journey.id)), [data, offeringId, journey]);
  const impact = useMemo(() => impactOf(data, { offeringId }), [data, offeringId]);
  const footprint = useMemo(() => {
    const reach = reachOf(data, offeringId);
    const core = coreThreshold(journeys.length);
    const out = new Map<string, Foot>();
    for (const [id, set] of reach) {
      if (journey && !set.has(journey.id)) continue;
      const item = impact.systems.get(id);
      const tier: Foot["tier"] = item?.carriesOnly ? "carries" : journey || set.size < core ? "used" : "core";
      out.set(id, { tier, roles: item?.roles ?? [], journeys: set.size });
    }
    return out;
  }, [data, offeringId, journeys.length, impact, journey]);
  const linkCounts = useMemo(() => links(data, views.flatMap((view) => view.integrations)), [data, views]);

  if (!offering) return null;
  const tiers = { core: 0, used: 0, carries: 0 };
  for (const foot of footprint.values()) tiers[foot.tier] += 1;
  const picked = selected ? data.systems.find((system) => system.id === selected) ?? null : null;
  const pickedFoot = picked ? footprint.get(picked.id) : undefined;
  const reached: [string, ReactNode][] = pickedFoot
    ? [["For this offering", `${TIER_WORDS[pickedFoot.tier]}, in ${count(pickedFoot.journeys, "journey")}`]]
    : picked
      ? [["For this offering", <span key="none" className="cat-quiet">Not reached by its journeys</span>]]
      : [];

  return (
    <Section title="Footprint" count={footprint.size} headingLevel={3}>
      {journeys.length === 0 ? (
        <p className="cat-quiet">No journey of this offering is modelled yet, so nothing says which systems it reaches.</p>
      ) : (
        <div className="lsc">
          <p className="cat-lead">
            {journey ? <>The systems <bdi>{journey.name}</bdi> reaches.</> : <>Every system the offering's {count(journeys.length, "journey")} reach, by how central it is.</>}
          </p>
          <div className="lsc-tools">
            <div className="lsc-find">
              <Select label="Journeys" value={journey?.id ?? ""} onChange={(event) => showJourney(event.target.value)}>
                <option value="">Every journey</option>
                {journeys.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
            </div>
            <Facts
              items={[
                ["Systems reached", `${footprint.size.toLocaleString("en")} of ${data.systems.length.toLocaleString("en")}`],
                ...(journey ? [] : [["Core", tiers.core.toLocaleString("en")] as [string, ReactNode]]),
                ["Used", tiers.used.toLocaleString("en")],
                ["Carry calls only", tiers.carries.toLocaleString("en")],
              ]}
            />
          </div>
          <div className={`lsc-board${picked ? " lsc-board--picked" : ""}`}>
            <div className="lsc-map">
              <ArchitectureMap data={data} label={`${offering.name}'s footprint`} linkCounts={linkCounts} selected={selected} onSelect={select} footprint={footprint} />
              <ul className="lsc-key" aria-label="Key">
                {(journey ? (["used", "carries"] as const) : (["core", "used", "carries"] as const)).map((tier) => (
                  <li key={tier}>
                    <span className={`lsc-key__mark lsc-key__mark--${tier}`} aria-hidden="true" />
                    {TIER_WORDS[tier]}
                  </li>
                ))}
                <li>
                  <span className="lsc-key__mark" aria-hidden="true" />
                  Not reached
                </li>
              </ul>
            </div>
            {picked && <SystemSummary data={data} system={picked} linkCounts={linkCounts} base={base} onSelect={select} facts={reached} />}
          </div>
        </div>
      )}
    </Section>
  );
}
