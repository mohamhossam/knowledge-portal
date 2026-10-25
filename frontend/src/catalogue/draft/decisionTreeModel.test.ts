import { describe, expect, it } from "vitest";

import type { Release, Suggestion } from "../../api/client";
import { blockers, bulkAcceptable, lexicon } from "../suggestions";
import { decisionTree, touching } from "./decisionTreeModel";

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
    expect(nodes.find((node) => node.id === "api")).toMatchObject({ label: "Order API", detail: "Component of Order Hub", status: "Waits for the system Order Hub" });
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

  it("draws what nothing adds at the left of what waits for it, as in a first version", () => {
    const suggestions = [
      suggestion("cap", { kind: "capability", system_id: "it", name: "Provisioning" }, { match: "needs_system" }),
      suggestion("rule", { kind: "constraint", system_id: "it", text: "No rollback" }, { match: "needs_system" }),
    ];
    const words = lexicon(draft, suggestions);
    const missing = blockers(draft, suggestions, words);
    expect(decisionTree(suggestions, words).nodes).toEqual([]);

    const { nodes, edges } = decisionTree(suggestions, words, { missing });
    expect(nodes[0]).toMatchObject({ id: "missing:system:it", label: "IT", tone: "gap", status: "Not in the draft, and no suggestion adds it" });
    expect(edges).toEqual([{ from: "missing:system:it", to: "cap" }, { from: "missing:system:it", to: "rule" }]);
    expect(nodes.map((node) => node.id)).toEqual(["missing:system:it", "cap", "rule"]);
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

describe("what realises a record", () => {
  const record = (id: string, layer: string, realisedBy: string[]) =>
    suggestion(id, {
      kind: "realisation_record", system_id: id, name: id,
      realisation: { id, layer, name: id, aliases: [], system_ids: [], realised_by: realisedBy, accepted: [] },
    }, { match: "needs_realisation" });

  it("is a record in a layer below, as the service finds it, not one of the same name above", () => {
    const withCfs = { ...draft, realisations: [{ id: "cfs-ddos", layer: "cfs", name: "DDoS uCPE CFS", aliases: [] }] } as unknown as Release;
    const rfs = record("rfs-ddos", "rfs", ["DDoS uCPE CFS"]);
    const cfs = record("cfs-firewall", "cfs", ["DDoS uCPE CFS"]);
    const words = lexicon(withCfs, [rfs]);

    // A CFS does not realise an RFS: accepting it now would be refused.
    expect(bulkAcceptable(withCfs, [rfs]).lifted).toEqual([]);
    expect(blockers(withCfs, [rfs], words)).toMatchObject([{ kind: "other", name: "DDoS uCPE CFS", label: "DDoS uCPE CFS as a resource" }]);
    // Below a CFS, the same record would still be in the wrong layer; a resource of that name would do.
    expect(bulkAcceptable(withCfs, [cfs]).lifted).toEqual([]);
    const withResource = { ...draft, realisations: [{ id: "res-ddos", layer: "resource", name: "DDoS uCPE CFS", aliases: [] }] } as unknown as Release;
    expect(bulkAcceptable(withResource, [rfs]).lifted.map((item) => item.id)).toEqual(["rfs-ddos"]);
  });
});
