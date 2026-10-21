import { describe, expect, it } from "vitest";

import { STAGES, stageOf, stageOfCode } from "./stages";

describe("where an order type sits in the customer's life (a business rule, kept in code)", () => {
  it("takes the stage the version gives an order type, else the one its code has", () => {
    expect(stageOf({ code: "NEW", stage: "support" })).toBe("support");
    expect(stageOf({ code: "NEW" })).toBe("join");
    expect(stageOf({ code: "NEW", stage: "onboard" })).toBe("join");
  });

  it("gives each order type code one stage", () => {
    const codes = STAGES.flatMap((stage) => stage.orderTypes);
    expect(new Set(codes).size).toBe(codes.length);
    expect(STAGES.map((stage) => stage.id)).toEqual(["join", "change", "support", "leave"]);
  });

  it.each([
    ["NEW", "join"],
    ["portin", "join"],
    ["MODSUBS", "change"],
    ["TECHVISIT", "support"],
    ["CESSREQ", "leave"],
    // A code the rule doesn't know is a change; no code at all (order tracking) is support.
    ["SOMETHINGNEW", "change"],
    [null, "support"],
    ["", "support"],
  ])("puts %j under %s", (code, stage) => {
    expect(stageOfCode(code)).toBe(stage);
  });
});
