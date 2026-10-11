import { describe, expect, it } from "vitest";

import type { Release, Suggestion } from "../../api/client";
import { lexicon } from "../suggestions";
import { decisionTree, touching } from "./decisionTree";

const suggestion = (id: string, content: object, extra: object = {}) =>
  ({ id, status: "proposed", match: "new", basis: "stated", possible_matches: [], system_name: null, content: { name: "", text: "", ...content }, ...extra }) as unknown as Suggestion;

const draft = { systems: [], channels: [], landscape_domains: [], products: [] } as unknown as Release;

describe("decisionTree", () => {
  it("points each suggestion that adds something at the ones waiting for it", () => {
    const suggestions = [
      suggestion("hub", { kind: "system", system_id: "order-hub", name: "Order Hub" }),
      suggestion("api", { kind: "component", system_id: "order-hub", component_id: "api", name: "Order API" }, { match: "needs_system" }),
      suggestion("crm", { kind: "system", system_id: "crm", name: "Dynamics CRM" }, { possible_matches: [{ role: "subject", written_as: "CRM" }] }),
      suggestion("alone", { kind: "system", system_id: "alone", name: "Alone" }),
      suggestion("done", { kind: "system", system_id: "done", name: "Done" }, { status: "accepted" }),
    ];
    const { nodes, edges } = decisionTree(suggestions, lexicon(draft, suggestions));
    expect(edges).toEqual([{ from: "hub", to: "api" }]);
    // In a chain, or needing a person; a ready one on its own and a decided one stay in the list.
    expect(nodes.map((node) => node.id)).toEqual(["hub", "api", "crm"]);
    expect(nodes.find((node) => node.id === "api")).toMatchObject({ label: "Order API", detail: "Component of Order Hub", status: "Waits for another" });
    expect(nodes.find((node) => node.id === "crm")).toMatchObject({ tone: "decide", status: "Needs your decision" });
    expect(nodes.find((node) => node.id === "hub")).toMatchObject({ tone: "ready" });
  });

  it("draws exactly the kept open suggestions, with the screen's marks and the current one", () => {
    const suggestions = [
      suggestion("hub", { kind: "system", system_id: "order-hub", name: "Order Hub" }),
      suggestion("api", { kind: "component", system_id: "order-hub", component_id: "api", name: "Order API" }, { match: "needs_system" }),
      suggestion("alone", { kind: "system", system_id: "alone", name: "Alone" }),
      suggestion("other", { kind: "system", system_id: "other", name: "Other" }),
      suggestion("done", { kind: "system", system_id: "done", name: "Done" }, { status: "accepted" }),
    ];
    const { nodes, edges } = decisionTree(suggestions, lexicon(draft, suggestions), {
      keep: new Set(["hub", "api", "alone", "done"]),
      current: "api",
      mark: (item) => (item.id === "hub" ? { status: "You accept it", tone: "ready" } : undefined),
    });
    expect(nodes.map((node) => node.id)).toEqual(["hub", "api", "alone"]);
    expect(edges).toEqual([{ from: "hub", to: "api" }]);
    expect(nodes.find((node) => node.id === "hub")).toMatchObject({ status: "You accept it", tone: "ready" });
    expect(nodes.find((node) => node.id === "api")).toMatchObject({ tone: "subject", status: "This question" });
  });

  it("finds what a set of suggestions waits on and what waits on them", () => {
    const suggestions = [
      suggestion("hub", { kind: "system", system_id: "order-hub", name: "Order Hub" }),
      suggestion("api", { kind: "component", system_id: "order-hub", component_id: "api", name: "Order API" }, { match: "needs_system" }),
      suggestion("alone", { kind: "system", system_id: "alone", name: "Alone" }),
    ];
    expect([...touching(suggestions, ["api"])].sort()).toEqual(["api", "hub"]);
    expect([...touching(suggestions, ["alone"])]).toEqual(["alone"]);
  });
});
