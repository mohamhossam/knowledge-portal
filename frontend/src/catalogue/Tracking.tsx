import type { ReactNode } from "react";

import type { Offering } from "../api/client";
import { CONFIDENCE } from "./catalogue";

type Tracking = NonNullable<Offering["tracking"]>;
type Flow = Tracking["flows"][number];
type TrackingChannel = Tracking["channels"][number];

/** A flow as one row: the read path a channel's tracking screen takes is marked as such. */
export type TrackingRow = Flow & { readFor?: string };

/** Who is reading: the explorer reads one order type through one channel; a sheet reads all. */
export type TrackingFocus = {
  orderName: string;
  applies: boolean;
  /** The channel being read, when the order type names channels. */
  channel: { id: string; name: string } | null;
  /** That channel's correlation, when tracking describes it. */
  entry: TrackingChannel | null;
  flows: TrackingRow[];
};

const due = (gap: boolean) => (gap ? "row row--due" : "row");

function Sourced({ item }: { item: { confidence?: string | null; source?: string | null } }) {
  const confidence = item.confidence && item.confidence !== "confirmed" ? CONFIDENCE[item.confidence as keyof typeof CONFIDENCE] : null;
  const line = [confidence, item.source].filter(Boolean).join(" · ");
  return line ? <span className="secondary govtable__by" dir="auto">{line}</span> : null;
}

/**
 * How an offering's orders are tracked once placed (requirement-portal ADR-0101):
 * each channel's correlation and tracking screen, the flows that carry order and
 * milestone events, what the customer sees, the internal statuses, and what
 * happens when an order falls out. What the sources leave undefined is due.
 */
export function TrackingSection({ offering, headingId, system, channelName, orderName, focus }: {
  offering: Offering;
  headingId: string;
  system: (systemId: string) => ReactNode;
  channelName: (channelId: string) => string;
  orderName: (code: string) => string;
  focus?: TrackingFocus;
}) {
  const tracking = offering.tracking;
  const title = <h3 id={headingId} className="govsection__title">Order tracking</h3>;
  if (!tracking) {
    return (
      <section className="govsection" aria-labelledby={headingId}>
        {title}
        <p className="timetable__quiet">No order tracking is recorded for {offering.name}.</p>
      </section>
    );
  }
  const scope = tracking.order_types.length
    ? `Specified for ${tracking.order_types.map(orderName).join(", ")}.`
    : "Specified for every order type.";

  if (focus && !focus.applies) {
    return (
      <section className="govsection" aria-labelledby={headingId}>
        {title}
        <p className="govsection__lead">{scope}</p>
        <p className="timetable__quiet explorer__gap" dir="auto">
          {tracking.not_applicable_note ?? `Its sources do not specify tracking for ${focus.orderName}.`}
        </p>
        <Fallout tracking={tracking} />
      </section>
    );
  }

  const channels = focus ? (focus.entry ? [focus.entry] : []) : tracking.channels;
  const flows: TrackingRow[] = focus ? focus.flows : tracking.flows;
  return (
    <section className="govsection" aria-labelledby={headingId}>
      {title}
      <p className="govsection__lead" dir="auto">
        {scope}
        {tracking.scope_note && <> {tracking.scope_note}</>}
      </p>

      <h4 className="govsection__part">{focus?.channel ? `How ${focus.channel.name} tracks its orders` : "How each channel tracks its orders"}</h4>
      {channels.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Correlation and tracking screen per channel for {offering.name}</caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col">Correlation key</th>
              <th scope="col">Tracked in</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((item) => (
              <tr key={item.channel_id} className={due(!item.correlation_key || !item.ui_system_id)}>
                <th scope="row" dir="auto">
                  {channelName(item.channel_id)}
                  {item.story && <span className="secondary govtable__by" dir="auto">{item.story}</span>}
                </th>
                <td dir="auto">
                  {item.correlation_key ?? <span className="tracking__missing">Not defined</span>}
                  <Sourced item={item} />
                </td>
                <td>
                  {item.ui_system_id ? system(item.ui_system_id) : <span className="tracking__missing">Not named</span>}
                  {item.read_system_id && (
                    <span className="secondary govtable__by">
                      Reads from {system(item.read_system_id)}
                      {item.read_interface && <> over <span dir="auto">{item.read_interface}</span></>}
                    </span>
                  )}
                  {item.ui_note && <span className="secondary govtable__by" dir="auto">{item.ui_note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet explorer__gap">
          {focus?.channel ? `Order tracking does not say how ${focus.channel.name} tracks its orders.` : "No channel's tracking is described."}
        </p>
      )}

      <h4 className="govsection__part">What carries the order's progress</h4>
      {flows.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Flows that carry order and milestone events for {offering.name}</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">What it carries</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow, index) => (
              <tr key={`${flow.from_system_id}>${flow.to_system_id}:${flow.label}:${index}`} className={due(flow.confidence === "gap")}>
                <th scope="row">{system(flow.from_system_id)}</th>
                <td>{flow.from_system_id === flow.to_system_id ? <span className="secondary">Logs it itself</span> : system(flow.to_system_id)}</td>
                <td dir="auto">
                  {flow.label}
                  {flow.readFor && <span className="secondary govtable__by">The read path of {flow.readFor}</span>}
                  {flow.interface && <span className="secondary govtable__by" dir="auto">Over {flow.interface}</span>}
                  <Sourced item={flow} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No flow is recorded.</p>
      )}

      <h4 className="govsection__part">What the customer sees</h4>
      {tracking.milestones.length ? (
        <ol className="sheet__list tracking__milestones">
          {tracking.milestones.map((item) => (
            <li key={item.label} className={item.confidence === "gap" ? "explorer__gap" : undefined}>
              <span dir="auto">{item.label}</span>
              {item.system_id && <span className="secondary"> · {system(item.system_id)}</span>}
              {item.detail && <span className="secondary govtable__by" dir="auto">{item.detail}</span>}
              <Sourced item={item} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="timetable__quiet">No milestone is recorded.</p>
      )}

      {tracking.statuses.length > 0 && (
        <>
          <h4 className="govsection__part">Internal statuses</h4>
          <ul className="sheet__list">
            {tracking.statuses.map((item) => (
              <li key={item.label}>
                <span dir="auto" className="tracking__status">{item.label}</span>
                {item.detail && <span className="secondary govtable__by" dir="auto">{item.detail}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <Fallout tracking={tracking} />
    </section>
  );
}

function Fallout({ tracking }: { tracking: Tracking }) {
  return (
    <>
      <h4 className="govsection__part">When an order falls out</h4>
      {tracking.fallout.length ? (
        <table className="govtable">
          <caption className="visually-hidden">What makes an order fall out, and how it is handled</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">What happens</th>
            </tr>
          </thead>
          <tbody>
            {tracking.fallout.map((item) => (
              <tr key={item.trigger} className={due(item.confidence === "gap")}>
                <th scope="row" dir="auto">{item.trigger}</th>
                <td dir="auto">
                  {item.handling ?? <span className="tracking__missing">Not stated</span>}
                  <Sourced item={item} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No fallout case is recorded.</p>
      )}
    </>
  );
}
