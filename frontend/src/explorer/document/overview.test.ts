import { describe, expect, it } from "vitest";

import { EXPLORED } from "../fixtures";
import { pickScenario } from "../scenario";
import { overviewSvg, stages, trackingChain } from "./overview";

const scenario = (order = "NEW", channel = "online") => pickScenario(EXPLORED, "bpp", order, channel)!;

describe("the solution overview", () => {
  it("reads the stages in journey order, with the systems that perform them and the steps no system performs", () => {
    expect(stages(scenario())).toEqual([
      { phase: "Capture", systems: ["web", "rtf"], unnamed: 0 },
      { phase: "Orchestrate", systems: ["cwom"], unnamed: 1 },
    ]);
    expect(trackingChain(scenario())).toEqual(["cwom", "rtf", "web"]);
    expect(trackingChain(scenario("CEASE", ""))).toEqual([]);
  });

  it("draws them with the scenario's title, a gap in red, and tracking beneath", () => {
    const { svg, w, h } = overviewSvg(scenario(), EXPLORED);

    expect([w, h]).toEqual([1200, expect.any(Number)]);
    expect(svg).toContain("Business Pro Plus: New Activation, through Online");
    expect(svg).toContain(">Orchestrate</text>");
    expect(svg).toMatch(/fill="#B3122B" font-weight="700">1 step: no system \(gap\)<\/text>/);
    expect(svg).toContain(">Order tracking</text>");
  });
});
