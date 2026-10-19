import { describe, expect, it } from "vitest";

import release from "./fixtures/smb-release.json";
import { asRelease, loadSampleRelease } from "./sample";

describe("the bundled catalogue sample", () => {
  it("reads as a catalogue version, with the per-channel flows the service sends", async () => {
    const sample = await loadSampleRelease();
    expect(sample.id).toBe("smb-architecture-draft");
    expect(sample.systems.length).toBeGreaterThan(0);
    expect(sample.journeys?.some((journey) => journey.channel_edges.length > 0)).toBe(true);
    expect(asRelease(release)).toBe(release);
  });

  it("refuses something that isn't a catalogue version, saying what it lacks", () => {
    expect(() => asRelease(null)).toThrow("it has no id, revision, systems");
    expect(() => asRelease({ id: "x", revision: 1, systems: [] })).toThrow("it has no relationships, journeys");
  });
});
