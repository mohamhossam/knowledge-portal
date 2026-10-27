/**
 * A journey's calls (catalogue merge, step 4, from the lab's integration
 * register), in two views. Sequence: the systems and parties as lifelines in the
 * order the journey first reaches them, each call an arrow between two of them
 * in the order it is made, and the picked call's details beside it, stepped with
 * Previous and Next. Table: the same calls as a register. Picking a system
 * brings its calls forward (sequence) or keeps only its calls (table).
 */
import { type CSSProperties, useMemo, useState } from "react";

import { Button, type Column, DataTable, Facts, Select } from "../../../design/components";
import { laneName, MODE_WORDS, NOT_STATED, operationName, styleName, systemName, viewTitle } from "../../model/words";
import { type ActivityStep, type Catalogue, type Integration, type JourneyView, type Lane, laneKey, type Step } from "../../model/model";
import { EvidenceLine } from "./ProcessFlow";

/** A call's end: a lane, or the integration layer it goes through (a system id). */
type End = Lane | string;

const endKey = (end: End) => (typeof end === "string" ? end : laneKey(end));
const isActivity = (step: Step | undefined): step is ActivityStep => step?.kind === "task";

type Row = { call: Integration; index: number };

export function CallRegister({ data, view }: { data: Catalogue; view: JourneyView }) {
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
  const activityName = (id: string) => {
    const found = view.steps.find((item) => item.id === id);
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
  // How the calls are made, most used first, as one slim bar and its legend.
  const styles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of view.integrations) counts.set(styleName(call) || NOT_STATED, (counts.get(styleName(call) || NOT_STATED) ?? 0) + 1);
    const stated = [...counts.entries()].filter(([style]) => style !== NOT_STATED).sort((a, b) => b[1] - a[1]);
    const unstated = counts.get(NOT_STATED);
    return [...stated.map(([style, count], index) => ({ style, count, shade: `s${Math.min(index + 1, 4)}` })), ...(unstated ? [{ style: NOT_STATED, count: unstated, shade: "none" }] : [])];
  }, [view]);
  const touches = (call: Integration) => !system || ends(call).some((end) => endKey(end) === system);
  const at = Math.min(picked, calls.length - 1);
  const call = calls[at];
  const center = (end?: End) => (end === undefined ? 0 : ((keys.indexOf(endKey(end)) + 0.5) / keys.length) * 100);

  if (!calls.length) return <p className="cat-quiet">This journey records no system-to-system call.</p>;
  const columns: Column<Row>[] = [
    { id: "number", header: "No.", numeric: true, cell: (row) => row.index + 1 },
    {
      id: "route",
      header: "From → to",
      rowHeader: true,
      cell: ({ call: item }) => (
        <span translate="no">
          {name(item.from)} → {name(item.to)}
          {item.via && <span className="cat-detail">through {name(item.via)}</span>}
        </span>
      ),
    },
    { id: "interface", header: "Interface", cell: ({ call: item }) => <span translate="no">{operationName(item) || <span className="cat-quiet">{NOT_STATED}</span>}</span> },
    { id: "style", header: "Style", cell: ({ call: item }) => <>{styleName(item)}{item.mode !== "not-stated" && <span className="cat-detail">{MODE_WORDS[item.mode]}</span>}</> },
    { id: "tmf", header: "TM Forum", cell: ({ call: item }) => <span translate="no">{item.tmf ?? <span className="cat-quiet">None</span>}</span> },
    { id: "purpose", header: "Purpose", bidi: true, cell: ({ call: item }) => item.purpose },
    { id: "step", header: "Step", bidi: true, cell: ({ call: item }) => activityName(item.step) },
    { id: "evidence", header: "Evidence", cell: ({ call: item }) => <EvidenceLine evidence={item.evidence} /> },
  ];

  return (
    <section aria-label="Integration register" className="jf-register">
      <div className="jr-bar">
        <p className="jr-total">
          <b>{calls.length}</b> {calls.length === 1 ? "call" : "calls"} between <b>{involved.length}</b> {involved.length === 1 ? "system or party" : "systems and parties"}
        </p>
        <div className="jr-styles">
          <span className="jr-mix" aria-hidden="true">
            {styles.map((item) => <i key={item.style} className={`is-${item.shade}`} style={{ flexGrow: item.count }} />)}
          </span>
          <ul className="jr-legend" aria-label="Calls by how they are made">
            {styles.map((item) => (
              <li key={item.style}>
                <i className={`is-${item.shade}`} aria-hidden="true" />
                {item.style} <b>{item.count}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="jr-tools">
          <Select label="System" value={system ?? ""} onChange={(event) => setSystem(event.target.value || null)}>
            <option value="">Every system</option>
            {involved.map(([key, { end, count }]) => (
              <option key={key} value={key}>{name(end)} ({count})</option>
            ))}
          </Select>
          <div className="jr-switch" role="group" aria-label="View">
            <Button variant={mode === "sequence" ? "secondary" : "quiet"} aria-pressed={mode === "sequence"} onClick={() => setMode("sequence")}>Sequence</Button>
            <Button variant={mode === "table" ? "secondary" : "quiet"} aria-pressed={mode === "table"} onClick={() => setMode("table")}>Table</Button>
          </div>
        </div>
      </div>

      {mode === "sequence" ? (
        <div className="jr-seqwrap">
          <div className="jr-seq" style={{ "--ir-lanes": keys.length } as CSSProperties}>
            <div className="jr-heads" aria-hidden="true">
              <span className="jr-headgap" />
              <span className="jr-lanes">
                {[...lanes].map(([key, end]) => (
                  <button key={key} type="button" tabIndex={-1} className={`jr-head${system === key ? " is-on" : ""}`} onClick={() => setSystem(system === key ? null : key)} title={name(end)}>
                    <span>{name(end)}</span>
                  </button>
                ))}
              </span>
            </div>
            <ol className="jr-calls" aria-label={`Calls in order${system ? `, ${name(system)}'s brought forward` : ""}`}>
              {calls.map((item, index) => {
                const a = center(item.from);
                const b = center(item.to);
                const self = laneKey(item.from) === laneKey(item.to);
                const label = `${index + 1}. ${name(item.from)} to ${name(item.to)}${item.via ? ` through ${name(item.via)}` : ""}: ${operationName(item) || "interface not stated"}`;
                return (
                  <li key={item.id} className={touches(item) ? undefined : "is-quiet"}>
                    <button type="button" className="jr-call" aria-pressed={index === at} aria-label={label} onClick={() => setPicked(index)}>
                      <span className="jr-num">{index + 1}</span>
                      <span className="jr-op" translate="no">{operationName(item) || NOT_STATED}</span>
                      <span className="jr-lanes jr-track" aria-hidden="true">
                        {self ? (
                          <i className="jr-self" style={{ left: `${a}%` }} />
                        ) : (
                          <i className={`jr-arrow${b < a ? " is-back" : ""}`} style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(b - a)}%` }} />
                        )}
                        {item.via && <i className="jr-via" style={{ left: `${center(item.via)}%` }} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {call && (
            // Inside the register, not beside the page: a region, not a complementary landmark.
            <div className="jr-detail" role="region" aria-labelledby="jr-detail-h" aria-live="polite">
              <p className="jr-detail-count">Call {at + 1} of {calls.length}</p>
              <h3 id="jr-detail-h" className="jr-detail-route" translate="no">
                {name(call.from)} <span aria-hidden="true">→</span> {name(call.to)}
              </h3>
              {call.via && <p className="jr-detail-via">Through {name(call.via)}</p>}
              <Facts
                items={[
                  ["Interface", <span key="interface" translate="no">{operationName(call) || <span className="cat-quiet">{NOT_STATED}</span>}</span>],
                  ["Style", `${styleName(call)}${call.mode !== "not-stated" ? ` · ${MODE_WORDS[call.mode]}` : ""}`],
                  ["TM Forum", <span key="tmf" translate="no">{call.tmf ?? <span className="cat-quiet">None</span>}</span>],
                  ["Step", activityName(call.step)],
                ]}
              />
              <p className="jr-purpose" dir="auto">{call.purpose}</p>
              <EvidenceLine evidence={call.evidence} />
              <div className="jr-stepper">
                <Button unavailableReason={at === 0 ? "This is the first call." : null} onClick={() => setPicked(at - 1)}>Previous</Button>
                <Button variant="primary" unavailableReason={at >= calls.length - 1 ? "This is the last call." : null} onClick={() => setPicked(at + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <DataTable
          caption={`Calls of ${viewTitle(data, view)}`}
          captionHidden
          columns={columns}
          rows={calls.map((item, index) => ({ call: item, index })).filter(({ call: item }) => touches(item))}
          rowId={(row) => row.call.id}
        />
      )}
    </section>
  );
}
