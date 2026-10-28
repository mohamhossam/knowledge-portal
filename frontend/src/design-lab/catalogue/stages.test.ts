import { describe, expect, it } from "vitest";

import { STAGES, stageOf } from "./stages";

describe("where an order type sits in the customer's life, as the version states it", () => {
  it("takes the stage the version gives, and never guesses one from a code", () => {
    expect(stageOf({ stage: "support" })).toBe("support");
    expect(stageOf({ stage: "join" })).toBe("join");
    expect(stageOf({})).toBe("unstaged");
    expect(stageOf({ stage: null })).toBe("unstaged");
    expect(stageOf({ stage: "onboard" })).toBe("unstaged");
  });

  it("names the service's four stages, then the order types it states none for", () => {
    expect(STAGES.map((stage) => stage.id)).toEqual(["join", "change", "support", "leave", "unstaged"]);
  });
});
