import "./offering/offering.css";

import type { ReactNode } from "react";

import type { Offering } from "../api/client";
import { type Column, DataTable, Lines, Section, Status } from "../design/components";
import { PartHeading, Provenance } from "./GovernanceSections";

type Tracking = NonNullable<Offering["tracking"]>;
type Flow = Tracking["flows"][number];
type TrackingChannel = Tracking["channels"][number];
type Fallout = Tracking["fallout"][number];

/** A flow as one row: the read path a channel's tracking screen takes is marked as such. */
type TrackingRow = Flow & { readFor?: string };

/** Who is reading: the explorer reads one order type through one channel; a sheet reads all. */
type TrackingFocus = {
  orderName: string;
  applies: boolean;
  /** The channel being read, when the order type names channels. */
  channel: { id: string; name: string } | null;
  /** That channel's correlation, when tracking describes it. */
  entry: TrackingChannel | null;
  flows: TrackingRow[];
};

/** What the sources leave undefined is due (the Weight Is Rank Rule): an icon and its words. */
const Due = ({ children }: { children: ReactNode }) => <Status tone="attention">{children}</Status>;

/**
 * How an offering's orders are tracked once placed (requirement-portal ADR-0101):
 * each channel's correlation and tracking screen, the flows that carry order and
 * milestone events, what the customer sees, the internal statuses, and what
 * happens when an order falls out. What the sources leave undefined is due.
 */
export function TrackingSection({ offering, system, channelName, orderName, focus, action, level = 3 }: {
  offering: Offering;
  /** Kept for callers; the section names its own heading. */
  headingId: string;
  system: (systemId: string) => ReactNode;
  channelName: (channelId: string) => string;
  orderName: (code: string) => string;
  focus?: TrackingFocus;
  /** An edit offered beside the title, on a draft's sheet. */
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const tracking = offering.tracking;
  const frame = (children: ReactNode) => (
    <Section title="Order tracking" actions={action} headingLevel={level}>
      {children}
    </Section>
  );
  if (!tracking) return frame(<p className="offering-quiet">No order tracking is recorded for {offering.name}.</p>);

  const others = tracking.order_types.length - 1;
  const scope = !tracking.order_types.length
    ? "Specified for every order type."
    : focus?.applies && others > 0
      ? `Specified for ${focus.orderName} and ${others === 1 ? "1 other order type" : `${others} other order types`}.`
      : `Specified for ${tracking.order_types.map(orderName).join(", ")}.`;

  if (focus && !focus.applies) {
    return frame(
      <>
        <p className="offering-lead" dir="auto">
          Not specified for {focus.orderName}. {tracking.not_applicable_note ?? scope}
        </p>
        <FalloutPart tracking={tracking} level={level} system={system} />
      </>,
    );
  }

  const channels = focus ? (focus.entry ? [focus.entry] : []) : tracking.channels;
  const flows: TrackingRow[] = focus ? focus.flows : tracking.flows;
  const channelColumns: Column<TrackingChannel>[] = [
    {
      id: "channel",
      header: "Channel",
      rowHeader: true,
      bidi: true,
      width: "30%",
      cell: (item) => (
        <>
          {channelName(item.channel_id)}
          {item.story && <span className="offering-by" dir="auto">{item.story}</span>}
          <Provenance item={item} />
        </>
      ),
    },
    {
      id: "key",
      header: "Correlation key",
      bidi: true,
      cell: (item) => item.correlation_key ?? <Due>Not defined</Due>,
    },
    {
      id: "ui",
      header: "Tracked in",
      cell: (item) => (
        <>
          {item.ui_system_id ? system(item.ui_system_id) : <Due>Not named</Due>}
          {item.read_system_id && (
            <span className="offering-by">
              <span>
                Reads its status from {system(item.read_system_id)}
                {item.read_interface && <> over <bdi>{item.read_interface}</bdi></>}
              </span>
            </span>
          )}
          {item.ui_note && <span className="offering-by" dir="auto">{item.ui_note}</span>}
        </>
      ),
    },
  ];
  const flowColumns: Column<TrackingRow & { key: string }>[] = [
    { id: "from", header: "From", rowHeader: true, width: "22%", cell: (flow) => system(flow.from_system_id) },
    {
      id: "to",
      header: "To",
      width: "22%",
      cell: (flow) => (flow.from_system_id === flow.to_system_id ? <span className="offering-quiet">Logs it itself</span> : system(flow.to_system_id)),
    },
    {
      id: "carries",
      header: "What it carries",
      bidi: true,
      cell: (flow) => (
        <>
          {flow.label}
          {flow.readFor && <span className="offering-by">How {flow.readFor}'s tracking screen reads the order's status</span>}
          {flow.interface && <span className="offering-by" dir="auto">Over {flow.interface}</span>}
          <Provenance item={flow} />
        </>
      ),
    },
  ];
  return frame(
    <>
      <p className="offering-lead" dir="auto">
        {scope}
        {tracking.scope_note && <> {tracking.scope_note}</>}
      </p>

      <PartHeading level={level}>{focus?.channel ? `How ${focus.channel.name} tracks its orders` : "How each channel tracks its orders"}</PartHeading>
      {channels.length ? (
        <DataTable
          caption={focus?.channel ? `How ${focus.channel.name} tracks its orders of ${offering.name}` : `How each channel tracks its orders of ${offering.name}`}
          captionHidden
          columns={channelColumns}
          rows={channels}
          rowId={(item) => item.channel_id}
        />
      ) : (
        <p className="offering-quiet">
          <Due>{focus?.channel ? `Order tracking does not say how ${focus.channel.name} tracks its orders.` : "No channel's tracking is described."}</Due>
        </p>
      )}

      <PartHeading level={level}>What carries the order's progress</PartHeading>
      {flows.length ? (
        <DataTable
          caption={`Flows that carry order and milestone events for ${offering.name}`}
          captionHidden
          columns={flowColumns}
          rows={flows.map((flow, index) => ({ ...flow, key: `${flow.from_system_id}>${flow.to_system_id}:${flow.label}:${index}` }))}
          rowId={(flow) => flow.key}
        />
      ) : (
        <p className="offering-quiet">No flow is recorded.</p>
      )}

      <PartHeading level={level}>What the customer sees</PartHeading>
      {tracking.milestones.length ? (
        <ol className="offering-steps">
          {tracking.milestones.map((item) => (
            <li key={item.label}>
              <span dir="auto">{item.label}</span>
              {item.system_id && <span className="offering-quiet"> · {system(item.system_id)}</span>}
              {item.detail && <span className="offering-by" dir="auto">{item.detail}</span>}
              <Provenance item={item} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="offering-quiet">No milestone is recorded.</p>
      )}

      {tracking.statuses.length > 0 && (
        <>
          <PartHeading level={level}>Internal statuses</PartHeading>
          <Lines>
            {tracking.statuses.map((item) => (
              <li key={item.label}>
                <span dir="auto" className="offering-items__title">{item.label}</span>
                {item.detail && <span className="offering-by" dir="auto">{item.detail}</span>}
              </li>
            ))}
          </Lines>
        </>
      )}

      <FalloutPart tracking={tracking} level={level} system={system} />
    </>,
  );
}

/** What makes an order fall out, where it falls out, and how it is handled. */
const falloutColumns = (system: (systemId: string) => ReactNode): Column<Fallout>[] => [
  { id: "when", header: "When", rowHeader: true, bidi: true, width: "35%", cell: (item) => item.trigger },
  { id: "where", header: "Falls out in", bidi: true, cell: (item) => (item.system_id ? system(item.system_id) : <span className="offering-quiet">Not said</span>) },
  {
    id: "handling",
    header: "What happens",
    bidi: true,
    cell: (item) => (
      <>
        {item.handling ?? <Due>Not stated</Due>}
        <Provenance item={item} />
      </>
    ),
  },
];

function FalloutPart({ tracking, level, system }: { tracking: Tracking; level: 2 | 3; system: (systemId: string) => ReactNode }) {
  return (
    <>
      <PartHeading level={level}>When an order falls out</PartHeading>
      {tracking.fallout.length ? (
        <DataTable
          caption="What makes an order fall out, and how it is handled"
          captionHidden
          columns={falloutColumns(system)}
          rows={tracking.fallout}
          rowId={(item) => item.trigger}
        />
      ) : (
        <p className="offering-quiet">No fallout case is recorded.</p>
      )}
    </>
  );
}
