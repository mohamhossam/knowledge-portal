import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Offering } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { fieldsInWords } from "./drafting";
import { offeringProblem } from "./editing";
import { OfferingEditor } from "./OfferingEditor";

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
