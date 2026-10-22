import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Journey, Release } from "../api/client";
import release from "./model/fixtures/smb-release.json";
import { JourneyEditor } from "./JourneyEditor";

const SAMPLE = release as unknown as Release;
const FULL = SAMPLE.journeys!.find((item) => item.integrations.length > 0)!;
// Two steps and one hand-over: the editor's other rows have nothing to draw.
const JOURNEY: Journey = {
  ...FULL,
  activities: FULL.activities.slice(0, 2),
  flow_rules: [],
  integrations: [{ ...FULL.integrations[0]!, from_activity: FULL.activities[0]!.number, to_activity: FULL.activities[1]!.number }],
};

describe("a hand-over's timing", () => {
  it("is chosen as Sync, Async or not said, never typed", () => {
    const onChange = vi.fn<(value: Journey) => void>();
    const journey = { ...JOURNEY, integrations: [{ ...JOURNEY.integrations[0]!, timing: null }] };
    render(<JourneyEditor value={journey} onChange={onChange} systems={SAMPLE.systems} offerings={[]} />);

    const timing = screen.getByLabelText("Timing");
    expect([...(timing as HTMLSelectElement).options].map((option) => option.value)).toEqual(["", "Sync", "Async"]);

    fireEvent.change(timing, { target: { value: "Async" } });
    expect(onChange.mock.lastCall?.[0].integrations[0]?.timing).toBe("Async");

    fireEvent.change(timing, { target: { value: "" } });
    expect(onChange.mock.lastCall?.[0].integrations[0]?.timing).toBeNull();
  });
});

describe("a hand-over's interface record (review recommendation 8)", () => {
  it("offers only the records a system of the call exposes, and links one by id", () => {
    const onChange = vi.fn<(value: Journey) => void>();
    const [from, to] = JOURNEY.activities;
    const exposer = to!.performing_system_id!;
    const interfaces = [
      { id: "if-own", name: "Order status", system_id: exposer, style: "api", consumer_ids: [], open_api_ids: [], entity_ids: [], relays: [], accepted: [] },
      { id: "if-other", name: "Elsewhere", system_id: "not-in-this-call", style: "api", consumer_ids: [], open_api_ids: [], entity_ids: [], relays: [], accepted: [] },
    ] as unknown as NonNullable<Release["interfaces"]>;
    const journey = {
      ...JOURNEY,
      integrations: [{ ...JOURNEY.integrations[0]!, from_system_id: from!.performing_system_id, to_system_id: exposer, via_system_id: null, interface_id: null }],
    };
    render(<JourneyEditor value={journey} onChange={onChange} systems={SAMPLE.systems} offerings={[]} interfaces={interfaces} />);

    const record = screen.getByLabelText("Goes through the interface record");
    expect([...(record as HTMLSelectElement).options].map((option) => option.value)).toEqual(["", "if-own"]);
    fireEvent.change(record, { target: { value: "if-own" } });
    expect(onChange.mock.lastCall?.[0].integrations[0]?.interface_id).toBe("if-own");
  });
});
