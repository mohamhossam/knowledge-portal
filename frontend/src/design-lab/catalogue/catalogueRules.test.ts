import { describe, expect, it } from "vitest";

import type { Offering } from "../../catalogue/model/model";
import { channelKindName, coreThreshold, eligibilityGroup, hubOf, isPriced, planFigures } from "./catalogueRules";

const offering = (parts: Partial<Offering>): Offering => ({ components: [], eligibility: [], plans: [], ...parts }) as unknown as Offering;
const part = (name: string, hub = false) => ({ id: name, name, ...(hub ? { hub } : {}) }) as unknown as Offering["components"][number];

describe("the catalogue lab's shared rules, read from the version", () => {
  it("takes the part the version marks as its hub, and never guesses one from a name", () => {
    expect(hubOf(offering({ components: [part("Business router"), part("Managed switch", true)] }))?.name).toBe("Managed switch");
    expect(hubOf(offering({ components: [part("Fibre line"), part("CPE device (Fortinet 90G / 120G)")] }))).toBeUndefined();
  });

  it.each([
    ["system", { system: "System" }, "System"],
    ["assisted", { assisted: "Assisted" }, "Assisted"],
    // No term: the kind as written.
    ["partner", {}, "partner"],
  ])("names the channel kind %s from the vocabulary", (kind, terms, name) => {
    expect(channelKindName({ channelKindTerms: terms }, kind)).toBe(name);
  });

  it("puts an eligibility point under the aspect the version gives it, and under other when it gives none", () => {
    expect(eligibilityGroup({ aspect: "who" })).toBe("who");
    expect(eligibilityGroup({ aspect: "terms" })).toBe("terms");
    expect(eligibilityGroup({})).toBe("other");
  });

  it.each([
    [1, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [20, 10],
  ])("calls a system core to %i journeys when it is in at least %i", (journeys, threshold) => {
    expect(coreThreshold(journeys)).toBe(threshold);
  });

  it("says plans are priced only when a characteristic's unit is a currency", () => {
    const plan = (...facts: [string, string | null][]) => ({ name: "Plan", characteristics: facts.map(([name, unit]) => ({ name, value: "1", amount: "1", unit })) });
    expect(isPriced(offering({ plans: [plan(["Download", "Mbps"], ["Upload", "Mbps"])] } as Partial<Offering>))).toBe(false);
    expect(isPriced(offering({ plans: [plan(["Download", "Mbps"]), plan(["Monthly", "AED"])] } as Partial<Offering>))).toBe(true);
    expect(isPriced(offering({ plans: [plan(["Monthly", "eur"])] } as Partial<Offering>))).toBe(true);
    // A price word with no currency is not a stated price.
    expect(isPriced(offering({ plans: [plan(["Monthly fee", null])] } as Partial<Offering>))).toBe(false);
  });

  it("takes a plan's figures from the characteristics the version gives an amount, in order", () => {
    const plan = {
      name: "Plan",
      characteristics: [
        { name: "CPE", value: "Fortinet 90G" },
        { name: "Download", value: "200 Mbps", amount: "200", unit: "Mbps" },
        { name: "Upload", value: "100 Mbps", amount: "100", unit: "Mbps" },
      ],
      evidence: { status: "confirmed" as const },
    };
    expect(planFigures(plan).map((item) => [item.name, item.amount])).toEqual([
      ["Download", 200],
      ["Upload", 100],
    ]);
  });
});
