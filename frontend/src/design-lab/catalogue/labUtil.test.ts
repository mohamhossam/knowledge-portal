import { describe, expect, it } from "vitest";

import type { PortfolioNode } from "../../architecture/model";
import { firstSentence, leadingNumber, listOf, monogram, pathTo, plural, shortFunction } from "./labUtil";

const node = (id: string, parentId: string | null = null): PortfolioNode => ({ id, level: "Level", name: id, parentId });

describe("the lab's small helpers", () => {
  it("makes the noun agree with its number", () => {
    expect(plural(1, "call")).toBe("1 call");
    expect(plural(0, "call")).toBe("0 calls");
    expect(plural(3, "journey")).toBe("3 journeys");
    expect(plural(2, "family", "families")).toBe("2 families");
  });

  it("lists items in plain English", () => {
    expect(listOf([])).toBe("");
    expect(listOf(["BCRM"])).toBe("BCRM");
    expect(listOf(["BCRM", "B2B Web", "SMB App"])).toBe("BCRM, B2B Web, and SMB App");
  });

  it.each([
    ["One sentence. And another.", "One sentence."],
    ["No full stop", "No full stop."],
    ["Too many...", "Too many."],
    ["  Spaced out.  Next.", "Spaced out."],
  ])("takes the first sentence of %j", (text, first) => {
    expect(firstSentence(text)).toBe(first);
  });

  it.each([
    ["200 Mbps", 200],
    ["1 Gbps", 1000],
    ["2.5 gbps", 2500],
    [" 50", 50],
    ["Unlimited", null],
    ["", null],
  ])("reads %j as %j", (value, number) => {
    expect(leadingNumber(value)).toBe(number);
  });

  it("cuts a purpose to a few words", () => {
    expect(shortFunction("Billing system: rates and invoices")).toBe("Billing system");
    expect(shortFunction("Stores orders. Then more")).toBe("Stores orders");
    expect(shortFunction("Order capture — the front door")).toBe("Order capture");
    const long = shortFunction("Receives channel orders and validates business rules before the order is decomposed");
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(45);
    expect(long).not.toMatch(/\s…$/);
  });

  it.each([
    ["Digital Catalog (BCC)", "BCC"],
    ["Netcracker CSRD", "CSRD"],
    ["B2B BFF", "BFF"],
    ["vEDA", "vEDA"],
    ["XaaS", "XaaS"],
    ["Service quality management", "Sqm"],
    ["Remedy", "Re"],
    ["SERVICENOW", "SER"],
  ])("gives %j the monogram %j", (name, mark) => {
    expect(monogram(name)).toBe(mark);
  });

  it("walks a portfolio node up to the top, and stops on a loop", () => {
    const nodes = [node("enterprise"), node("fixed", "enterprise"), node("smb", "fixed")];
    expect(pathTo(nodes, "smb").map((item) => item.id)).toEqual(["enterprise", "fixed", "smb"]);
    expect(pathTo(nodes, null)).toEqual([]);
    expect(pathTo(nodes, "missing")).toEqual([]);
    const loop = [node("a", "b"), node("b", "a")];
    expect(pathTo(loop, "a").map((item) => item.id)).toEqual(["b", "a"]);
  });
});
