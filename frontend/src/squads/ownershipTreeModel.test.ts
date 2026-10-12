import { describe, expect, it } from "vitest";

import type { Organisation, Release } from "../api/client";
import { ownershipTree } from "./ownershipTreeModel";

const org = {
  people: [],
  value_streams: [{ id: "retail", name: "Retail" }],
  products: [{ id: "fibre", name: "Fibre ordering", value_stream_id: "retail", system_ids: ["cwom", "bscs", "gone"], offering_ids: [] }],
  squads: [{ id: "fulfilment", name: "Fulfilment squad", value_stream_id: "retail", resources: [{ system_id: "cwom", role: "developer", person_id: null }] }],
} as unknown as Organisation;

const release = {
  systems: ["cwom", "bscs", "cns", "felix"].map((id) => ({ id, name: id.toUpperCase(), capabilities: [] })),
} as unknown as Release;

describe("ownershipTree", () => {
  it("runs value stream, product, system and the squad that runs it, gaps dashed", () => {
    const { nodes, edges } = ownershipTree(org, release);
    expect(nodes.find((node) => node.id === "product:fibre/system:cwom")).toMatchObject({ label: "CWOM", href: "/architecture/systems/cwom" });
    expect(nodes.find((node) => node.id === "product:fibre/system:bscs")).toMatchObject({ tone: "gap", status: "No squad" });
    expect(nodes.find((node) => node.id === "product:fibre/system:gone")).toMatchObject({ tone: "muted", status: "Not in service" });
    expect(nodes.find((node) => node.id === "product:fibre/system:cwom/squad:fulfilment")).toMatchObject({ label: "Fulfilment squad", shape: "pill" });
    expect(edges).toContainEqual({ from: "stream:retail", to: "product:fibre" });
  });

  it("gathers the systems no product names into one node that opens the grid on them", () => {
    const unnamed = ownershipTree(org, release).nodes.find((node) => node.id === "unnamed");
    expect(unnamed).toMatchObject({ label: "2 systems in no product", status: "2 with no squad", tone: "gap", href: "/squads?product=none" });
  });
});
