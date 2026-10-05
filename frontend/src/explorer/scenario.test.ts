import { describe, expect, it } from "vitest";

import { EXPLORED } from "./fixtures";
import { gaps, involvement, listed, partsFor, pickScenario } from "./scenario";

const scenario = (product?: string, order?: string) => pickScenario(EXPLORED, product, order)!;

describe("pickScenario", () => {
  it("opens on the first order type that has a journey", () => {
    const opened = scenario();
    expect([opened.offering.id, opened.orderType.code, opened.journey?.id]).toEqual(["bpp", "NEW", "bpp-new"]);
  });

  it("keeps the order type asked for, in any case, even without a journey", () => {
    const cease = scenario("bpp", "cease");
    expect([cease.orderType.code, cease.journey]).toEqual(["CEASE", null]);
  });

  it("falls back to a real offering when the one asked for is gone", () => {
    expect(scenario("gone").offering.id).toBe("bpp");
  });

  it("has nothing to open when no offering has an order type", () => {
    expect(pickScenario({ ...EXPLORED, products: [] }, null, null)).toBeNull();
  });
});

describe("involvement", () => {
  it("lists the journey's systems in step order, then those named only for a part", () => {
    const taking = involvement(scenario());
    expect(taking.map((item) => item.systemId)).toEqual(["web", "rtf", "cwom", "wfm"]);
    expect(taking[0]).toMatchObject({ performs: ["1"], supports: ["2"] });
    expect(taking[2]!.parts.map((item) => item.part.id)).toEqual(["bb"]);
    expect(taking[3]).toMatchObject({ performs: [], supports: [] });
  });

  it("names only the responsibilities that hold for the order type", () => {
    const cease = partsFor(scenario("bpp", "CEASE"));
    expect(cease[0]!.responsibilities.map((item) => item.system_id)).toEqual(["cwom", "bscs"]);
  });
});

describe("gaps", () => {
  it("says which steps and parts name no system, and how many facts are gaps", () => {
    expect(gaps(scenario())).toEqual([
      "Step 4 names no system that performs it.",
      "No system is named as responsible for Firewall in New Activation.",
      "1 fact is marked in its source as a gap.",
    ]);
  });

  it("says so when no journey is recorded", () => {
    expect(gaps(scenario("bpp", "CEASE"))[0]).toBe(
      "No journey is recorded for Cease, so no step or hand-over can be shown.",
    );
  });

  it("lists in words", () => {
    expect([listed(["3"]), listed(["3", "5"]), listed(["3", "5", "9"])]).toEqual(["3", "3 and 5", "3, 5 and 9"]);
  });
});
