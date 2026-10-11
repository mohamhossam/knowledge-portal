import { describe, expect, it } from "vitest";

import type { DocState } from "./docState";
import { lifecycle } from "./lifecycle";

const counts = (entries: [DocState, number][]) => new Map(entries);

describe("lifecycle", () => {
  it("draws the main path with each state's count, and a stuck reading off the first", () => {
    const { nodes, edges } = lifecycle(counts([["review", 6], ["service", 4], ["withdrawn", 1], ["attention", 1]]), "all");
    expect(nodes.map((node) => node.id)).toEqual(["reading", "review", "service", "withdrawn", "attention"]);
    expect(nodes.find((node) => node.id === "review")).toMatchObject({ status: "6 documents", pressed: false });
    expect(nodes.find((node) => node.id === "reading")).toMatchObject({ status: "0 documents" });
    expect(nodes.find((node) => node.id === "attention")).toMatchObject({ tone: "decide" });
    expect(edges).toContainEqual({ from: "review", to: "service" });
    expect(edges).toContainEqual({ from: "reading", to: "attention", label: "fails", dashed: true });
  });

  it("shows indexing and the quieter stops only while a document is there", () => {
    const { nodes, edges } = lifecycle(counts([["indexing", 1], ["held", 2]]), "held");
    expect(nodes.map((node) => node.id)).toEqual(["reading", "review", "indexing", "service", "withdrawn", "attention", "held"]);
    expect(edges).toContainEqual({ from: "indexing", to: "service" });
    expect(nodes.find((node) => node.id === "held")).toMatchObject({ tone: "subject", pressed: true });
  });
});
