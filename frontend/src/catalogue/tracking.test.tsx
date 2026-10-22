import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Offering } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { fieldsInWords } from "./drafting";
import { offeringProblem } from "./editing";
import { OfferingEditor } from "./OfferingEditor";
import { TrackingSection } from "./Tracking";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

const OFFERING = EXPLORED.products![0]!;
const TRACKING = OFFERING.tracking!;

function Editing({ start, seen }: { start: Offering; seen: (value: Offering) => void }) {
  const [value, setValue] = useState<Offering>(start);
  return (
    <OfferingEditor
      value={value}
      onChange={(next) => { setValue(next); seen(next); }}
      systems={EXPLORED.systems}
      channels={EXPLORED.channels ?? []}
    />
  );
}

describe("order tracking in the offering editor", () => {
  it("describes tracking for an offering that has none, and takes it away again", () => {
    let last: Offering = { ...OFFERING, tracking: null };
    render(<Editing start={last} seen={(value) => (last = value)} />);

    const group = screen.getByRole("group", { name: "Order tracking" });
    fireEvent.click(within(group).getByRole("button", { name: "Describe how its orders are tracked" }));
    expect(last.tracking).toEqual({ order_types: [], flows: [], channels: [], milestones: [], statuses: [], fallout: [] });

    const flows = screen.getByRole("group", { name: "What carries the order's progress" });
    fireEvent.click(within(flows).getByRole("button", { name: "Add a flow" }));
    fireEvent.change(within(flows).getByLabelText("From"), { target: { value: "cwom" } });
    fireEvent.change(within(flows).getByLabelText(/^What it carries/), { target: { value: "Milestones" } });
    expect(last.tracking!.flows).toEqual([{ from_system_id: "cwom", to_system_id: "web", label: "Milestones" }]);

    fireEvent.click(screen.getByRole("button", { name: "Remove its order tracking" }));
    expect(last.tracking).toBeNull();
  });

  it("picks the next channel not yet described, and the order types it is specified for", () => {
    let last = OFFERING;
    render(<Editing start={{ ...OFFERING, tracking: { ...TRACKING, channels: [TRACKING.channels[0]!] } }} seen={(value) => (last = value)} />);

    const channels = screen.getByRole("group", { name: "How each channel tracks its orders" });
    fireEvent.click(within(channels).getByRole("button", { name: "Add another channel's tracking" }));
    expect(last.tracking!.channels.map((item) => item.channel_id)).toEqual(["online", "shop"]);

    fireEvent.click(within(screen.getByRole("group", { name: /^Specified for/ })).getByRole("checkbox", { name: "Cease" }));
    expect(last.tracking!.order_types).toEqual(["NEW", "CEASE"]);
  });

  it("says why tracking cannot be sent yet", () => {
    const with_ = (patch: Partial<typeof TRACKING>) => offeringProblem({ ...OFFERING, tracking: { ...TRACKING, ...patch } });
    expect(with_({})).toBeNull();
    expect(with_({ channels: [...TRACKING.channels, { channel_id: "online" }] })).toBe("Order tracking: each channel is described once.");
    expect(with_({ channels: [{ channel_id: "" }] })).toBe("Order tracking: choose the channel of each channel's tracking.");
    expect(with_({ flows: [{ from_system_id: "web", to_system_id: "rtf", label: " " }] })).toBe(
      "Order tracking: every flow needs its two systems and what it carries.",
    );
    expect(with_({ statuses: [{ label: "A" }, { label: "a" }] })).toBe("Order tracking: each status is named once.");
    expect(with_({ fallout: [{ trigger: "" }] })).toBe("Order tracking: every fallout case needs what makes it fall out.");
  });

  it("says a change to it in words", () => {
    expect(fieldsInWords(["tracking"])).toBe("order tracking");
  });
});

describe("an offering read from a document, in the suggestion editor", () => {
  it("shows the channels and systems the document named that the draft does not have yet", () => {
    const read: Offering = {
      ...OFFERING,
      order_types: [{ code: "NEW", name: "New", enabled: true, channels: ["Business Web"] }],
      tracking: {
        order_types: [], statuses: [], fallout: [], milestones: [],
        flows: [{ from_system_id: "order-store", to_system_id: "order-store", label: "Milestone log" }],
        channels: [{ channel_id: "Business Web", ui_system_id: "order-portal" }],
      },
      lifecycle_notes: [{ id: "renewal", title: "Renewal", order_types: [], channels: ["Shop"], blocks: [] }],
    };
    const names = { system: (id: string) => ({ "order-store": "Order Store", "order-portal": "Order Portal" })[id] ?? id, channel: (id: string) => id };
    render(<OfferingEditor value={read} onChange={() => undefined} systems={EXPLORED.systems} channels={[]} names={names} />);

    const tracked = screen.getByRole("group", { name: "How each channel tracks its orders" });
    expect(within(tracked).getByRole("group", { name: /Business Web/ })).toBeTruthy();
    const channel = within(tracked).getByLabelText(/^Channel/) as HTMLSelectElement;
    expect(channel.selectedOptions[0]!.textContent).toBe("Business Web (not in the draft yet)");
    expect((within(tracked).getByLabelText("Tracked in") as HTMLSelectElement).selectedOptions[0]!.textContent).toBe(
      "Order Portal (not in the draft yet)",
    );
    const flows = screen.getByRole("group", { name: "What carries the order's progress" });
    expect((within(flows).getByLabelText("From") as HTMLSelectElement).selectedOptions[0]!.textContent).toBe("Order Store (not in the draft yet)");
    expect((screen.getAllByRole("checkbox", { name: "Business Web (not in the draft yet)" })[0] as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Shop (not in the draft yet)" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("order tracking read on a sheet and in the explorer", () => {
  const names: Record<string, string> = { web: "B2B Web", rtf: "RTF", cwom: "CWOM", online: "Online", shop: "Shop", NEW: "New Activation", CEASE: "Cease" };
  const name = (id: string) => names[id] ?? id;
  type Focus = Parameters<typeof TrackingSection>[0]["focus"];
  const read = (focus?: Focus) =>
    render(<TrackingSection offering={OFFERING} headingId="tracking" system={name} channelName={name} orderName={name} focus={focus} />);
  const section = () => within(screen.getByRole("heading", { name: "Order tracking" }).closest("section")!);

  it("reads the order's tracking through one channel, with its screen's read path", () => {
    read({ orderName: "New Activation", applies: true, channel: { id: "online", name: "Online" }, entry: TRACKING.channels[0]!, flows: [
      ...TRACKING.flows,
      { from_system_id: "rtf", to_system_id: "web", label: "getRealTimeOrderDetails", readFor: "Online" },
    ] });
    expect(section().getByText("Specified for New Activation.")).toBeInTheDocument();
    const online = within(section().getByRole("table", { name: "How Online tracks its orders of Business Pro Plus" })).getByRole("row", { name: /Online/ });
    expect(online.querySelectorAll("td")[0]).toHaveTextContent("Digital Order ID ↔ CWOM Order ID");
    expect(online).toHaveTextContent("Reads its status from RTF over getRealTimeOrderDetails");
    const flows = within(section().getByRole("table", { name: /Flows that carry/ })).getAllByRole("row").slice(1);
    const cells = (row: HTMLElement) => [row.querySelector("th")!.textContent, ...[...row.querySelectorAll("td")].map((cell) => cell.textContent)];
    expect(flows.map(cells)).toEqual([
      ["CWOM", "RTF", "Sub-order milestonesOver notifyMilestone"],
      ["RTF", "Logs it itself", "Timestamps"],
      ["RTF", "B2B Web", "getRealTimeOrderDetailsHow Online's tracking screen reads the order's status"],
    ]);
    // A milestone its source leaves a gap says so, with its icon.
    const milestone = section().getByText("Installation done").closest("li")!;
    expect(within(milestone).getByText("Its source leaves gaps").closest(".ds-status--attention")).not.toBeNull();
    expect(section().getByRole("row", { name: /Rejected by business rules/ })).toHaveTextContent("Back to the channel");
  });

  it("says what a channel leaves undefined, as due", () => {
    read();
    const shop = within(section().getByRole("table", { name: /How each channel tracks/ })).getByRole("row", { name: /Shop/ });
    expect(within(shop).getByText("Not defined").closest(".ds-status--attention")).not.toBeNull();
    expect(within(shop).getByText("Not named").closest(".ds-status--attention")).not.toBeNull();
  });

  it("says when tracking is not specified for the order type, as a fact rather than a gap", () => {
    read({ orderName: "Cease", applies: false, channel: null, entry: null, flows: [] });
    const note = section().getByText("Not specified for Cease. Tracking is not specified for a cease.");
    expect(note.closest(".ds-status")).toBeNull();
    expect(section().queryByRole("table", { name: /Flows that carry/ })).not.toBeInTheDocument();
    expect(section().getByRole("table", { name: /fall out/ })).toBeInTheDocument();
  });
});
