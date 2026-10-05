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

function Sourced({ item }: { item: { confidence?: string | null; source?: string | null } }) {
  const confidence = item.confidence && item.confidence !== "confirmed" ? CONFIDENCE[item.confidence as keyof typeof CONFIDENCE] : null;
  const line = [confidence, item.source].filter(Boolean).join(" · ");
  return line ? <span className="secondary govtable__by" dir="auto">{line}</span> : null;
}

/** A value its source marks as a gap is due (the Weight Is Rank Rule). */
function Value({ gap, children }: { gap: boolean; children: ReactNode }) {
  return gap ? <span className="tracking__missing">{children}</span> : <>{children}</>;
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
  const others = tracking.order_types.length - 1;
  const scope = !tracking.order_types.length
    ? "Specified for every order type."
    : focus?.applies && others > 0
      ? `Specified for ${focus.orderName} and ${others === 1 ? "1 other order type" : `${others} other order types`}.`
      : `Specified for ${tracking.order_types.map(orderName).join(", ")}.`;

  if (focus && !focus.applies) {
    return (
      <section className="govsection" aria-labelledby={headingId}>
        {title}
        <p className="govsection__lead" dir="auto">
          Not specified for {focus.orderName}. {tracking.not_applicable_note ?? scope}
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
        <table className="govtable tracking__channels">
          <caption className="visually-hidden">
            {focus?.channel ? `How ${focus.channel.name} tracks its orders of ${offering.name}` : `How each channel tracks its orders of ${offering.name}`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Channel</th>
              <th scope="col" className="tracking__wide">Correlation key</th>
              <th scope="col">Tracked in</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((item) => (
              <tr key={item.channel_id} className={!item.correlation_key || !item.ui_system_id ? "row row--due" : "row"}>
                <th scope="row" dir="auto">
                  {channelName(item.channel_id)}
                  {item.story && <span className="secondary govtable__by" dir="auto">{item.story}</span>}
                  <Sourced item={item} />
                  <span className="secondary govtable__by tracking__inline" dir="auto">
                    Correlation key: {item.correlation_key ?? <span className="tracking__missing">Not defined</span>}
                  </span>
                </th>
                <td dir="auto" className="tracking__wide">
                  {item.correlation_key ?? <span className="tracking__missing">Not defined</span>}
                </td>
                <td>
                  {item.ui_system_id ? system(item.ui_system_id) : <span className="tracking__missing">Not named</span>}
                  {item.read_system_id && (
                    <span className="secondary govtable__by">
                      Reads its status from {system(item.read_system_id)}
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
        <table className="govtable tracking__flows">
          <caption className="visually-hidden">Flows that carry order and milestone events for {offering.name}</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col" className="tracking__wide">To</th>
              <th scope="col">What it carries</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow, index) => {
              const to = flow.from_system_id === flow.to_system_id ? <span className="secondary">Logs it itself</span> : system(flow.to_system_id);
              return (
                <tr key={`${flow.from_system_id}>${flow.to_system_id}:${flow.label}:${index}`} className="row">
                  <th scope="row">
                    {system(flow.from_system_id)}
                    <span className="secondary govtable__by tracking__inline">To {to}</span>
                  </th>
                  <td className="tracking__wide">{to}</td>
                  <td dir="auto">
                    <Value gap={flow.confidence === "gap"}>{flow.label}</Value>
                    {flow.readFor && <span className="secondary govtable__by">How {flow.readFor}'s tracking screen reads the order's status</span>}
                    {flow.interface && <span className="secondary govtable__by" dir="auto">Over {flow.interface}</span>}
                    <Sourced item={flow} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">No flow is recorded.</p>
      )}

      <h4 className="govsection__part">What the customer sees</h4>
      {tracking.milestones.length ? (
        <ol className="sheet__list tracking__milestones">
          {tracking.milestones.map((item) => (
            <li key={item.label}>
              <span>
                <span dir="auto"><Value gap={item.confidence === "gap"}>{item.label}</Value></span>
                {item.system_id && <span className="secondary"> · {system(item.system_id)}</span>}
                {item.detail && <span className="secondary govtable__by" dir="auto">{item.detail}</span>}
                <Sourced item={item} />
              </span>
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
              <tr key={item.trigger} className="row">
                <th scope="row" dir="auto">{item.trigger}</th>
                <td dir="auto">
                  {item.handling ? (
                    <Value gap={item.confidence === "gap"}>{item.handling}</Value>
                  ) : (
                    <span className="tracking__missing">Not stated</span>
                  )}
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
