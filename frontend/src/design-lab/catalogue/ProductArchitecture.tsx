/**
 * Mock-up 3, a product's Architecture tab. By default it shows the product's
 * footprint on the architecture map: every system its journeys reach, in
 * three calm tiers (core to most journeys, used by some, carrying calls only),
 * with each system's role for the product on its card and a dot meter per
 * layer. "One journey at a time" lights a single journey and steps through its
 * calls in order.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { journeyView } from "../../architecture/adapter";
import { impactOf } from "../../architecture/impact";
import { ROLE_WORDS } from "../../architecture/model";
import { ArchitectureMap, type Foot } from "./ArchitectureMap";
import { EvidenceTag } from "./CatalogueLab";
import { JourneyPicker } from "./JourneyPicker";
import { journeyHref, useLabData, useOffering } from "./labData";
import { plural, useTitle } from "./labUtil";
import { allViews, links } from "./posterModel";
import { Missing, ProductHeader } from "./ProductPage";

export function ProductArchitecture() {
  const data = useLabData();
  const offering = useOffering();
  useTitle(offering ? `${offering.name} architecture` : "Architecture");
  const [params, setParams] = useSearchParams();
  const mode = params.get("view") === "journey" ? "journey" : "product";
  const journeys = useMemo(() => data.journeys.filter((journey) => journey.offeringId === offering?.id), [data, offering]);
  const systemById = useMemo(() => new Map(data.systems.map((system) => [system.id, system])), [data]);

  // The whole product: which journeys reach each system, its roles, and its tier.
  const views = useMemo(() => allViews(data).filter((view) => view.offeringId === offering?.id), [data, offering]);
  const impact = useMemo(() => (offering ? impactOf(data, { offeringId: offering.id }) : null), [data, offering]);
  const footprint = useMemo(() => {
    const reach = new Map<string, Set<string>>();
    const add = (id: string | undefined, journey: string) => {
      if (!id || !systemById.has(id)) return;
      reach.set(id, (reach.get(id) ?? new Set()).add(journey));
    };
    for (const view of views) {
      for (const step of view.steps) if (step.kind === "task") add(step.lane, view.id);
      for (const call of view.integrations) for (const id of [call.from, call.to, call.via]) add(id, view.id);
    }
    const core = Math.max(2, Math.ceil(journeys.length / 2));
    const out = new Map<string, Foot>();
    for (const [id, set] of reach) {
      const item = impact?.systems.get(id);
      out.set(id, { tier: item?.carriesOnly ? "carries" : set.size >= core ? "core" : "used", roles: item?.roles ?? [], journeys: set.size });
    }
    return out;
  }, [views, journeys.length, impact, systemById]);
  const productLinks = useMemo(() => links(data, views.flatMap((view) => view.integrations)), [data, views]);
  // A system picked elsewhere (the landscape's "Used by products") arrives as ?system=.
  const [picked, setPicked] = useState<string | null>(() => params.get("system"));

  // One journey: the journey, its channel, its calls and the current one.
  const def = journeys.find((journey) => journey.id === params.get("journey")) ?? journeys[0];
  const wanted = params.get("channel");
  const channel = def && wanted && def.channels.includes(wanted) ? wanted : (def?.channels[0] ?? null);
  const view = useMemo(() => (def ? journeyView(data, def.id, channel) : null), [data, def, channel]);
  const calls = useMemo(() => view?.integrations ?? [], [view]);
  const scopeKey = `${view?.id ?? ""}:${view?.channel ?? ""}`;
  const [position, setPosition] = useState({ key: scopeKey, index: 0 });
  const current = position.key === scopeKey ? Math.min(position.index, Math.max(0, calls.length - 1)) : 0;
  const go = (index: number) => setPosition({ key: scopeKey, index: Math.max(0, Math.min(calls.length - 1, index)) });
  const journeyLinks = useMemo(() => links(data, calls), [data, calls]);
  const roles = useMemo(() => (offering && def ? impactOf(data, { offeringId: offering.id, orderType: def.orderType, channel }) : null), [data, offering, def, channel]);
  const entry = Object.keys(view?.laneLabels ?? {})[0];
  const lit = useMemo(() => {
    const ids = new Set<string>();
    for (const call of calls) for (const id of [call.from, call.to, call.via]) if (id && systemById.has(id)) ids.add(id);
    for (const step of view?.steps ?? []) if (systemById.has(step.lane)) ids.add(step.lane);
    if (entry && systemById.has(entry)) ids.add(entry);
    return ids;
  }, [calls, view, systemById, entry]);
  const journeyProp = useMemo(() => ({ lit, entry, calls, current }), [lit, entry, calls, current]);

  // ← / → step through the calls when focus isn't in a field or on the map.
  useEffect(() => {
    if (mode !== "journey") return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest("input, textarea, select, .am")) return;
      if (event.key === "ArrowRight") setPosition((value) => ({ key: scopeKey, index: Math.min(calls.length - 1, (value.key === scopeKey ? value.index : 0) + 1) }));
      else if (event.key === "ArrowLeft") setPosition((value) => ({ key: scopeKey, index: Math.max(0, (value.key === scopeKey ? value.index : 0) - 1) }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, calls.length, scopeKey]);

  const list = useRef<HTMLOListElement>(null);
  // Keep the current call in view inside the aside only; never scroll the page.
  useEffect(() => {
    const item = list.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const pane = item?.closest<HTMLElement>(".cl-insp");
    if (!item || !pane) return;
    const top = item.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    if (top < pane.scrollTop + 40 || top + item.offsetHeight > pane.scrollTop + pane.clientHeight - 16) pane.scrollTop = Math.max(0, top - pane.clientHeight / 2);
  }, [current, scopeKey]);

  if (!offering) return <Missing what="No such product" />;
  if (!def || !view) return <Missing what="No journey is modelled for this product yet" />;

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  const name = (id?: string) => (id ? (systemById.get(id)?.name ?? (id.startsWith("team:") ? id.slice(5) : id === "channel" ? "Ordering channel" : id)) : "");
  const channelName = (id: string) => data.channels.find((item) => item.id === id)?.name ?? id;
  const layers = data.domains
    .map((domain) => {
      const all = data.systems.filter((system) => system.domain === domain.id);
      return { domain, all, used: all.filter((system) => footprint.has(system.id)) };
    })
    .filter((row) => row.all.length);
  const tiers = { core: 0, used: 0, carries: 0 };
  for (const foot of footprint.values()) tiers[foot.tier] += 1;
  const coreSystems = [...footprint.entries()].filter(([, foot]) => foot.tier === "core").sort((a, b) => b[1].journeys - a[1].journeys);
  const pickedSystem = picked ? systemById.get(picked) : undefined;
  const pickedFoot = picked ? footprint.get(picked) : undefined;
  const pickedJourneys = picked ? journeys.filter((journey) => views.some((item) => item.id === journey.id && (item.steps.some((step) => step.lane === picked) || item.integrations.some((call) => [call.from, call.to, call.via].includes(picked))))) : [];

  const switcher = (
    <div className="cl-seg" role="group" aria-label="What to show">
      <button type="button" aria-pressed={mode === "product"} onClick={() => setParam({ view: null })}>
        Whole product
      </button>
      <button type="button" aria-pressed={mode === "journey"} onClick={() => setParam({ view: "journey" })}>
        One journey at a time
      </button>
    </div>
  );

  if (mode === "product") {
    return (
      <>
        <ProductHeader offering={offering} current="architecture" compact />
        <div className="cl-toolbar">
          {switcher}
          <div className="cl-legend" role="group" aria-label="Legend">
            <span>
              <i className="tier core" />
              Core: in half the journeys or more
            </span>
            <span>
              <i className="tier used" />
              Used by some
            </span>
            <span>
              <i className="tier carries" />
              Carries calls only
            </span>
            <span>
              <i className="tier none" />
              Not used
            </span>
          </div>
        </div>
        <dl className="cl-impact" aria-label={`${offering.name}'s footprint`}>
          <div>
            <dt>Systems reached</dt>
            <dd>
              {footprint.size}
              <small> of {data.systems.length}</small>
            </dd>
          </div>
          <div>
            <dt>Core systems</dt>
            <dd>{tiers.core}</dd>
          </div>
          <div>
            <dt>Layers touched</dt>
            <dd>
              {layers.filter((row) => row.used.length).length}
              <small> of {layers.length}</small>
            </dd>
          </div>
          <div>
            <dt>Journeys drawn from</dt>
            <dd>{journeys.length}</dd>
          </div>
        </dl>
        <div className="cl-board">
          <div className="cl-board-main">
            <ArchitectureMap data={data} label={`${offering.name} on the SMB architecture map`} linkCounts={productLinks} selected={picked} onSelect={setPicked} footprint={footprint} />
          </div>
          <aside className="cl-insp" aria-labelledby="cl-foot-h">
            <p className="ds-visually-hidden" aria-live="polite">
              {pickedSystem ? `${pickedSystem.name} selected.` : ""}
            </p>
            {pickedSystem ? (
              <>
                <div className="cl-insp-head">
                  <h2 id="cl-foot-h" translate="no">
                    {pickedSystem.name}
                  </h2>
                  <button type="button" className="cl-close" onClick={() => setPicked(null)} aria-label={`Clear the selection of ${pickedSystem.name}`}>
                    Clear
                  </button>
                </div>
                <p className="cl-sub">
                  {pickedFoot
                    ? `${pickedFoot.tier === "core" ? "Core to" : pickedFoot.tier === "carries" ? "Carries calls for" : "Used by"} ${offering.name}: ${plural(pickedFoot.journeys, "journey")} of ${journeys.length}.`
                    : `Not used by ${offering.name}.`}
                </p>
                <p className="cl-body">{pickedSystem.function || "Its sources don't describe what it does."}</p>
                <EvidenceTag evidence={pickedSystem.evidence} />
                {pickedFoot && pickedFoot.roles.length > 0 && (
                  <>
                    <h3>What it does for the product</h3>
                    <ul className="cl-roles">
                      {pickedFoot.roles.map((role) => (
                        <li key={role} className="cl-role">
                          {ROLE_WORDS[role]}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {pickedJourneys.length > 0 && (
                  <>
                    <h3>Journeys that reach it</h3>
                    <ul className="cl-linklist">
                      {pickedJourneys.map((journey) => (
                        <li key={journey.id}>
                          <Link to={`?view=journey&journey=${journey.id}${journey.channels[0] ? `&channel=${journey.channels[0]}` : ""}`}>{journey.name}</Link>
                          <span>{journey.channels.length ? plural(journey.channels.length, "channel") : "Shared"}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <>
                <h2 id="cl-foot-h">Footprint by layer</h2>
                <p className="cl-body">Every system {offering.name}'s journeys reach. Pick one to see its role and the journeys behind it.</p>
                <ul className="cl-footlayers">
                  {layers.map(({ domain, all, used }) => (
                    <li key={domain.id} className={`cl-linked--${domain.id}`}>
                      <span>{domain.name}</span>
                      <span className="am-meter" aria-label={`${used.length} of ${all.length} used`}>
                        <span aria-hidden="true">
                          {all.map((system) => (
                            <i key={system.id} className={footprint.has(system.id) ? "on" : undefined} />
                          ))}
                        </span>
                        <b>
                          {used.length}/{all.length}
                        </b>
                      </span>
                    </li>
                  ))}
                </ul>
                <h3>Core systems</h3>
                <ul className="cl-core">
                  {coreSystems.map(([id, foot]) => (
                    <li key={id}>
                      <button type="button" onClick={() => setPicked(id)}>
                        <strong translate="no">{name(id)}</strong>
                        <span>{foot.roles.length ? foot.roles.slice(0, 2).map((role) => ROLE_WORDS[role]).join(" · ") : "Carries calls"}</span>
                        <small>
                          {foot.journeys}/{journeys.length}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </>
    );
  }

  const call = calls[current];
  const step = call ? view.steps.find((item) => item.id === call.step) : undefined;
  const callRoles = (id: string) => roles?.systems.get(id)?.roles ?? [];
  const pick = (id: string | null) => {
    if (!id) return;
    const index = calls.findIndex((item) => [item.from, item.to, item.via].includes(id));
    if (index >= 0) go(index);
  };

  return (
    <>
      <ProductHeader
        offering={offering}
        current="architecture"
        compact
        actions={
          <Link className="cl-btn" to={journeyHref(def.id, channel)}>
            Open this journey's flow
          </Link>
        }
      />
      <div className="cl-toolbar">
        {switcher}
        <JourneyPicker journeys={journeys} current={def} onPick={(journey) => setParam({ journey: journey.id, channel: journey.channels[0] ?? null })} />
        {def.channels.length > 0 && (
          <div className="cl-chips" role="group" aria-label="Channel">
            <span className="cl-chiplabel" aria-hidden="true">
              Channel
            </span>
            {def.channels.map((item) => (
              <button key={item} type="button" className="cl-chip" aria-pressed={item === channel} onClick={() => setParam({ channel: item })}>
                {channelName(item)}
              </button>
            ))}
          </div>
        )}
        <div className="cl-stepper" role="group" aria-label="Step through the calls">
          <button type="button" className="cl-btn" aria-disabled={current === 0} aria-keyshortcuts="ArrowLeft" onClick={() => current > 0 && go(current - 1)}>
            Previous
          </button>
          <output aria-live="polite">{calls.length ? `Call ${current + 1} of ${calls.length}` : "No calls modelled"}</output>
          <button type="button" className="cl-btn primary" aria-disabled={current >= calls.length - 1} aria-keyshortcuts="ArrowRight" onClick={() => current < calls.length - 1 && go(current + 1)}>
            Next
          </button>
        </div>
      </div>
      <p className="cl-hint">
        {plural(lit.size, "system")} of {data.systems.length} in {def.name}
        {channel ? ` through ${channelName(channel)}` : ""} · {plural(calls.length, "call")}. Click a system to jump to its first call; ← and → step.
      </p>
      <div className="cl-board">
        <div className="cl-board-main">
          <ArchitectureMap data={data} label={`${def.name} on the SMB architecture map`} linkCounts={journeyLinks} selected={null} onSelect={pick} journey={journeyProp} />
        </div>
        <aside className="cl-insp" aria-labelledby="cl-call-h">
          {call ? (
            <>
              <p className="cl-sub">Call {current + 1}</p>
              <h2 id="cl-call-h">
                <span translate="no">{name(call.from)}</span> → <span translate="no">{name(call.to)}</span>
              </h2>
              <p className="cl-sub">
                {call.via ? `Through ${name(call.via)}. ` : ""}
                {step ? `During “${step.name}”.` : ""}
              </p>
              <p className="cl-body">{call.purpose}</p>
              <dl className="cl-pairs">
                <div>
                  <dt>Interface</dt>
                  <dd translate="no">{call.operation || "Not stated"}</dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>
                    {call.style}
                    {call.mode !== "not stated" ? ` · ${call.mode}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>TM Forum equivalent</dt>
                  <dd translate="no">{call.tmf ?? "None suggested"}</dd>
                </div>
              </dl>
              <EvidenceTag evidence={call.evidence} />
              {callRoles(call.to).length > 0 && (
                <ul className="cl-roles" aria-label={`${name(call.to)}'s roles in this journey`}>
                  {callRoles(call.to).map((role) => (
                    <li key={role} className="cl-role">
                      {ROLE_WORDS[role]}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <h2 id="cl-call-h">No calls modelled</h2>
          )}
          <h3>Every call, in order</h3>
          <ol className="cl-calls" ref={list}>
            {calls.map((item, index) => (
              <li key={item.id}>
                <button type="button" aria-current={index === current ? "step" : undefined} onClick={() => go(index)}>
                  <span className="n" aria-hidden="true">
                    {index + 1}
                  </span>
                  <strong>
                    <span translate="no">{name(item.from)}</span> → <span translate="no">{name(item.to)}</span>
                  </strong>
                  <span translate="no">{item.operation || item.purpose}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
