import { describe, expect, it } from "vitest";

import type { Catalogue, Evidence, Integration, Lane, Step } from "../../architecture/model";
import { channelMissingText, laneKindName, laneName, MODE_WORDS, operationName, stepName, styleName, systemName, viewTitle } from "./words";

const data = {
  systems: [{ id: "cbcm", name: "CBCM" }],
  channels: [{ id: "b2b-web", name: "B2B Web", systemId: "b2b-web", kind: "self-service" }],
} as unknown as Catalogue;

const evidence: Evidence = { status: "inferred" };
const base: { id: string; lane: Lane; next: Step["next"]; evidence: Evidence } = { id: "x", lane: { kind: "channel" }, next: [], evidence };
const call: Integration = { id: "1", step: "10", from: { kind: "channel" }, to: { kind: "system", systemId: "cbcm" }, purpose: "", mode: "not-stated", evidence };

describe("the lab's words for the model's kinds", () => {
  it("names a lane: a system, a team or party, the ordering channel", () => {
    expect(laneName(data, { kind: "system", systemId: "cbcm" })).toBe("CBCM");
    expect(laneName(data, { kind: "system", systemId: "unknown" })).toBe("unknown");
    expect(laneName(data, { kind: "team", name: "MSS team" })).toBe("MSS team");
    expect(laneName(data, { kind: "channel" })).toBe("Ordering channel");
    expect(systemName(data, "cbcm")).toBe("CBCM");
    expect(laneKindName({ kind: "team", name: "Customer" })).toBe("Team or party");
    expect(laneKindName({ kind: "channel" })).toBe("Channel");
  });

  it("names the events and gateways a flow implies, and keeps an activity's own name", () => {
    const steps: Step[] = [
      { ...base, kind: "start" },
      { ...base, kind: "end" },
      { ...base, kind: "parallel", gateway: "split" },
      { ...base, kind: "parallel", gateway: "join" },
      { ...base, kind: "exclusive" },
      { ...base, kind: "exclusive", question: "Business rules passed?" },
      { ...base, kind: "task", name: "Capture the order" },
    ];
    expect(steps.map(stepName)).toEqual(["Start", "End", "In parallel", "All tracks done", "Decision", "Business rules passed?", "Capture the order"]);
  });

  it("names a hand-over, an unstated style and each mode", () => {
    expect(operationName(call)).toBe("Hand-over");
    expect(operationName({ ...call, operation: "evaluateOrder" })).toBe("evaluateOrder");
    expect(styleName(call)).toBe("Not stated");
    expect(styleName({ ...call, style: "API" })).toBe("API");
    expect(MODE_WORDS).toEqual({ sync: "sync", async: "async", "not-stated": "not stated" });
  });

  it("composes a journey's name with its channel, and says when the channel asked for is missing", () => {
    const view = { id: "j", offeringId: null, orderType: null, name: "New activation", summary: "", channels: ["b2b-web"], steps: [], integrations: [] };
    expect(viewTitle(data, { ...view, channel: "b2b-web" })).toBe("New activation · B2B Web");
    expect(viewTitle(data, { ...view, channel: null })).toBe("New activation");
    expect(channelMissingText("New activation", "Shop", "B2B Web")).toBe("New activation isn't offered through “Shop”; it is shown through B2B Web instead.");
  });
});
