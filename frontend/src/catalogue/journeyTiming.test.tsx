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
