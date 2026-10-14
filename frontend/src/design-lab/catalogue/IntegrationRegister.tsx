/** A journey's calls: the sequence of who calls whom, or the register as a table, with the picked call's details beside it. */
import { type CSSProperties, useMemo, useState } from "react";

import { type ActivityStep, type Integration, type JourneyView, type Lane, laneKey, type Step, systemOf } from "../../architecture/model";
import { EvidenceTag } from "./labChrome";
import { useLabData } from "./labData";
import { SystemMonogram } from "./SystemMonogram";
import { laneName, MODE_WORDS, NOT_STATED, operationName, styleName, systemName } from "./words";

/** A call's end: a lane, or the integration layer it goes through (a system id). */
type End = Lane | string;

const endKey = (end: End) => (typeof end === "string" ? end : laneKey(end));

const isActivity = (step: Step | undefined): step is ActivityStep => step?.kind === "task";

/**
 * The journey's calls, in two views. Sequence (the default): the systems and
 * parties as lifelines in the order the journey first reaches them, every call
 * an arrow between two lifelines in the order it is made (through the
 * integration layer when it goes via it), and the picked call's details beside
 * it. Table: the same calls as a register, for reading and export. A system
 * can be picked to bring its calls forward (sequence) or keep only its calls
 * (table). How the calls are made reads as one slim bar.
 */
export function IntegrationRegister({ view }: { view: JourneyView }) {
  const data = useLabData();
  const [mode, setMode] = useState<"sequence" | "table">("sequence");
  const [system, setSystem] = useState<string | null>(null);
  const [picked, setPicked] = useState(0);
  // Another journey or channel has other calls: start again at its first call, with no system picked.
  const viewKey = `${view.id}:${view.channel ?? ""}`;
  const [shown, setShown] = useState(viewKey);
  if (shown !== viewKey) {
    setShown(viewKey);
    setPicked(0);
    setSystem(null);
  }
  const name = (end?: End) => (end === undefined ? "" : typeof end === "string" ? systemName(data, end) : laneName(data, end));
  const tone = (end: End) => {
    const id = typeof end === "string" ? end : systemOf(end);
    return data.systems.find((item) => item.id === id)?.domain;
  };
  const step = (id: string) => view.steps.find((item) => item.id === id);
  const activityName = (id: string) => {
    const found = step(id);
    return isActivity(found) ? found.name : "";
  };
  const calls = view.integrations;
  const ends = (call: Integration): End[] => [call.from, ...(call.via ? [call.via] : []), call.to];
  // The lifelines, in the order the journey first reaches them, by key.
  const lanes = useMemo(() => {
    const order = new Map<string, End>();
    for (const call of view.integrations) for (const end of ends(call)) if (!order.has(endKey(end))) order.set(endKey(end), end);
    return order;
  }, [view]);
  const keys = [...lanes.keys()];
  const involved = useMemo(() => {
    const counts = new Map<string, { end: End; count: number }>();
    for (const call of view.integrations) {
      // Each system or party once per call, the caller first.
      const once = new Map<string, End>();
      for (const end of [call.from, call.to, ...(call.via ? [call.via] : [])]) if (!once.has(endKey(end))) once.set(endKey(end), end);
      for (const [key, end] of once) counts.set(key, { end, count: (counts.get(key)?.count ?? 0) + 1 });
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [view]);
  const styles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of view.integrations) counts.set(styleName(call) || NOT_STATED, (counts.get(styleName(call) || NOT_STATED) ?? 0) + 1);
    const stated = [...counts.entries()].filter(([style]) => style !== NOT_STATED).sort((a, b) => b[1] - a[1]);
    const unstated = counts.get(NOT_STATED);
    return [...stated.map(([style, count], index) => ({ style, count, shade: `s${Math.min(index + 1, 4)}` })), ...(unstated ? [{ style: NOT_STATED, count: unstated, shade: "none" }] : [])];
  }, [view]);
  const touches = (call: Integration) => !system || ends(call).some((end) => endKey(end) === system);
  const call = calls[Math.min(picked, calls.length - 1)];
  const center = (end?: End) => (end === undefined ? 0 : ((keys.indexOf(endKey(end)) + 0.5) / keys.length) * 100);
  const tile = (end: End) => <SystemMonogram name={name(end)} tone={tone(end)} />;

  return (
    <section aria-labelledby="cl-reg-h" className="cl-register">
      <h3 id="cl-reg-h" className="ds-visually-hidden">
        Integration register
      </h3>
      <div className="ir-bar">
        <p className="ir-total">
          <b>{calls.length}</b> calls between <b>{involved.length}</b> systems and parties
        </p>
        <div className="ir-styles">
          <span className="ir-mix" aria-hidden="true">
            {styles.map((item) => (
              <i key={item.style} className={`is-${item.shade}`} style={{ flexGrow: item.count }} />
            ))}
          </span>
          <ul className="ir-legend" aria-label="Calls by how they are made">
            {styles.map((item) => (
              <li key={item.style}>
                <i className={`is-${item.shade}`} aria-hidden="true" />
                {item.style} <b>{item.count}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="ir-tools">
          <label className="ir-system">
            <span>System</span>
            <select className="cl-field" value={system ?? ""} onChange={(event) => setSystem(event.target.value || null)}>
              <option value="">Every system</option>
              {involved.map(([key, { end, count }]) => (
                <option key={key} value={key}>
                  {name(end)} ({count})
                </option>
              ))}
            </select>
          </label>
          <div className="cl-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={mode === "sequence"} onClick={() => setMode("sequence")}>
              Sequence
            </button>
            <button type="button" aria-pressed={mode === "table"} onClick={() => setMode("table")}>
              Table
            </button>
          </div>
        </div>
      </div>

      {mode === "sequence" ? (
        <div className="ir-seqwrap">
          <div className="ir-seq" style={{ "--ir-lanes": keys.length } as CSSProperties}>
            <div className="ir-heads" aria-hidden="true">
              <span className="ir-headgap" />
              <span className="ir-lanes">
                {[...lanes].map(([key, end]) => (
                  <button key={key} type="button" tabIndex={-1} className={`ir-head${system === key ? " is-on" : ""}`} onClick={() => setSystem(system === key ? null : key)} title={name(end)}>
                    {tile(end)}
                    <span>{name(end)}</span>
                  </button>
                ))}
              </span>
            </div>
            <ol className="ir-calls" aria-label={`Calls in order${system ? `, ${name(system)}'s brought forward` : ""}`}>
              {calls.map((item, index) => {
                const a = center(item.from);
                const b = center(item.to);
                const self = laneKey(item.from) === laneKey(item.to);
                const label = `${index + 1}. ${name(item.from)} to ${name(item.to)}${item.via ? ` via ${name(item.via)}` : ""}: ${operationName(item) || "interface not stated"}`;
                return (
                  <li key={item.id} className={touches(item) ? undefined : "is-quiet"}>
                    <button type="button" className="ir-call" aria-pressed={index === picked} aria-label={label} onClick={() => setPicked(index)}>
                      <span className="ir-num">{index + 1}</span>
                      <span className="ir-op" translate="no">
                        {operationName(item) || NOT_STATED}
                      </span>
                      <span className="ir-lanes ir-track" aria-hidden="true">
                        {self ? (
                          <i className="ir-self" style={{ left: `${a}%` }} />
                        ) : (
                          <i className={`ir-arrow${b < a ? " is-back" : ""}`} style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` }} />
                        )}
                        {item.via && <i className="ir-via" style={{ left: `${center(item.via)}%` }} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {call && (
            <aside className="ir-detail" aria-labelledby="ir-detail-h" aria-live="polite">
              <p className="ir-detail-count">
                Call {Math.min(picked, calls.length - 1) + 1} of {calls.length}
              </p>
              <h4 id="ir-detail-h" className="ir-detail-route" translate="no">
                {tile(call.from)}
                {name(call.from)}
                <span aria-hidden="true">→</span>
                {tile(call.to)}
                {name(call.to)}
              </h4>
              {call.via && <p className="ir-detail-via">Through {name(call.via)}</p>}
              <dl className="ir-facts">
                <div>
                  <dt>Interface</dt>
                  <dd translate="no">{operationName(call) || <span className="gap">{NOT_STATED}</span>}</dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>
                    {styleName(call)}
                    {call.mode !== "not-stated" ? ` · ${MODE_WORDS[call.mode]}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>TM Forum</dt>
                  <dd translate="no">{call.tmf ?? <span className="gap">None</span>}</dd>
                </div>
                <div>
                  <dt>Step</dt>
                  <dd>{activityName(call.step)}</dd>
                </div>
              </dl>
              <p className="ir-purpose">{call.purpose}</p>
              <EvidenceTag evidence={call.evidence} />
              <div className="ir-stepper">
                <button type="button" className="cl-btn" aria-disabled={picked === 0} onClick={() => picked > 0 && setPicked(picked - 1)}>
                  Previous
                </button>
                <button type="button" className="cl-btn primary" aria-disabled={picked >= calls.length - 1} onClick={() => picked < calls.length - 1 && setPicked(picked + 1)}>
                  Next
                </button>
              </div>
            </aside>
          )}
        </div>
      ) : (
        <div className="cl-tablewrap" role="region" aria-label="Calls table (scrolls sideways when narrow)" tabIndex={0}>
          <table className="cl-table cl-regtable">
            <thead>
              <tr>
                <th scope="col" className="num">
                  #
                </th>
                <th scope="col">From → to</th>
                <th scope="col">Interface</th>
                <th scope="col">Style</th>
                <th scope="col">TM Forum</th>
                <th scope="col">Purpose</th>
                <th scope="col">Step</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {calls
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => touches(item))
                .map(({ item, index }) => (
                  <tr key={item.id}>
                    <td className="num">{index + 1}</td>
                    <th scope="row" translate="no">
                      {name(item.from)} → {name(item.to)}
                      {item.via && <small> via {name(item.via)}</small>}
                    </th>
                    <td translate="no">{operationName(item) || <span className="gap">{NOT_STATED}</span>}</td>
                    <td>
                      {styleName(item)}
                      {item.mode !== "not-stated" ? <small> · {MODE_WORDS[item.mode]}</small> : null}
                    </td>
                    <td translate="no">{item.tmf ?? <span className="gap">None</span>}</td>
                    <td>{item.purpose}</td>
                    <td>{activityName(item.step)}</td>
                    <td>
                      <EvidenceTag evidence={item.evidence} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
