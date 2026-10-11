import { describe, expect, it } from "vitest";

import { excerpt, rank, score } from "./search";

describe("global search matching", () => {
  it("needs every word, in any order and case", () => {
    expect(score(["XGPON coverage rules"], "coverage xgpon")).toBeGreaterThan(0);
    expect(score(["XGPON coverage rules"], "coverage fibre")).toBe(0);
    expect(score(["XGPON coverage rules"], "  ")).toBe(0);
  });

  it("ranks a name that starts with the query, then a word that does, then the rest", () => {
    const names = ["Billing gateway", "Order billing", "Rebilling engine"];
    expect(rank(names, "billing", (name) => [name], 5).items).toEqual(["Billing gateway", "Order billing", "Rebilling engine"]);
  });

  it("matches aliases and codes, and Arabic without its diacritics", () => {
    expect(score(["Customer portal", "CRM-X"], "crm")).toBeGreaterThan(0);
    expect(score(["سِياسة التحقق"], "سياسة")).toBeGreaterThan(0);
  });

  it("says how many matched beyond the limit", () => {
    const result = rank(["a1", "a2", "a3"], "a", (name) => [name], 2);
    expect(result).toEqual({ items: ["a1", "a2"], total: 3 });
  });

  it("shortens a passage to one line", () => {
    expect(excerpt("one\n\ntwo   three", 50)).toBe("one two three");
    expect(excerpt("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
