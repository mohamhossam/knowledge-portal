import { describe, expect, it } from "vitest";

import type { Offering } from "../../catalogue/model/model";
import { channelKindName, contractPeriods, coreThreshold, eligibilityGroup, hubOf, isPriced } from "./catalogueRules";

const offering = (parts: Partial<Offering>): Offering => ({ components: [], eligibility: [], plans: [], ...parts }) as unknown as Offering;
const part = (name: string) => ({ id: name, name }) as unknown as Offering["components"][number];

describe("the catalogue lab's shared rules", () => {
  it.each([
    [["Fibre line", "CPE device (Fortinet 90G / 120G)"], "CPE device (Fortinet 90G / 120G)"],
    [["Fibre line", "Business router"], "Business router"],
    [["Fibre line", "CPE"], "CPE"],
    // "cpe" inside another word isn't a CPE, and with no device the bundle has no hub.
    [["Fibre line", "SCPE licence"], undefined],
    [["Fibre line", "Backup 5G"], undefined],
  ])("takes the hub of %j as %j", (names, hub) => {
    expect(hubOf(offering({ components: names.map(part) }))?.name).toBe(hub);
  });

  it("takes the part the version marks as its hub over any name", () => {
    const parts = ["Business router", "Managed switch"].map(part);
    parts[1] = { ...parts[1]!, hub: true };
    expect(hubOf(offering({ components: parts }))?.name).toBe("Managed switch");
  });

  it.each([
    ["system", { system: "System" }, "System"],
    ["assisted", { assisted: "Assisted" }, "Assisted"],
    // No term: the kind as written.
    ["partner", {}, "partner"],
  ])("names the channel kind %s from the vocabulary", (kind, terms, name) => {
    expect(channelKindName({ channelKindTerms: terms }, kind)).toBe(name);
  });

  it.each([
    ["Segment", "who"],
    ["Business customers", "who"],
    ["Location", "where"],
    ["Commitment", "terms"],
    ["FortiPortal account", "terms"],
    ["New activation", "how"],
    ["Port in", "how"],
    ["Credit check", "other"],
  ])("puts the eligibility point %s under %s", (title, group) => {
    expect(eligibilityGroup(title)).toBe(group);
  });

  it("reads the contract periods from the commitment point only", () => {
    const headline = (text: string) => text.split(/[.;(]/)[0]!.trim();
    const point = (title: string, detail: string) => ({ title, detail }) as unknown as Offering["eligibility"][number];
    expect(contractPeriods(offering({ eligibility: [point("FortiPortal", "An account per customer"), point("Commitment", "No contract, 12 or 24 months. Renewable")] }), headline)).toEqual(["No contract", "12", "24 months"]);
    expect(contractPeriods(offering({ eligibility: [point("Segment", "SMB")] }), headline)).toEqual([]);
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

  it("says plans are priced only when a characteristic names a price", () => {
    const plan = (...names: string[]) => ({ name: "Plan", characteristics: names.map((name) => ({ name, value: "1" })) });
    expect(isPriced(offering({ plans: [plan("Download", "Upload")] } as Partial<Offering>))).toBe(false);
    expect(isPriced(offering({ plans: [plan("Download"), plan("Monthly fee")] } as Partial<Offering>))).toBe(true);
    expect(isPriced(offering({ plans: [plan("Price (AED)")] } as Partial<Offering>))).toBe(true);
    expect(isPriced(offering({ plans: [plan("Monthly (EUR)")] } as Partial<Offering>))).toBe(true);
    expect(isPriced(offering({ plans: [plan("SLA", "Static IP", "All sites", "Top speed")] } as Partial<Offering>))).toBe(false);
  });
});
