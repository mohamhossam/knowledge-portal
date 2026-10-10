import { describe, expect, it } from "vitest";

import type { Release } from "../api/client";
import { buildState, connectionSentence, diffSections, fieldsInWords, impactVerdict, systemUses, withoutSystem } from "./drafting";
import { finishedSystem, systemProblem } from "./editing";

const system = (id: string, name: string, extra: object = {}) => ({ id, name, aliases: [], capabilities: [], components: [], constraints: [], external: false, ...extra });

const draft = {
  id: "d", revision: 5, built_revision: 4, status: "draft", documents: [],
  systems: [system("cwom", "CWOM", { aliases: ["fixed order orchestration"] }), system("bscs", "BSCS"), system("cns", "CNS")],
  relationships: [
    { source_system_id: "cwom", target_system_id: "bscs", kind: "transfers_data_to", description: "Closure" },
    { source_system_id: "bscs", target_system_id: "cns", kind: "publishes_events_to", description: "Bills" },
  ],
  products: [{ id: "p", name: "Fibre", rules: [], order_types: [], values: [], audiences: [], components: [
    { id: "line", name: "Line", responsibilities: [{ system_id: "bscs", role: "Bills", description: "", order_types: [] }] },
  ] }],
  journeys: [],
} as unknown as Release;

describe("a draft's hand edits", () => {
  it("takes a system's connections with it, and says what still names it", () => {
    const body = withoutSystem(draft, "cwom");
    expect(body.expected_revision).toBe(5);
    expect(body.systems.map((item) => item.id)).toEqual(["bscs", "cns"]);
    expect(body.relationships).toHaveLength(1);
    expect(systemUses(draft, "bscs")).toEqual(["the offering Fibre"]);
    expect(systemUses(draft, "cwom")).toEqual([]);
  });

  it("gives a new system, its parts and capabilities ids, and refuses a name already taken", () => {
    const value = {
      ...system("", "Order Hub", { aliases: ["  hub ", ""] }),
      components: [{ id: "", name: "Order API", aliases: [] }],
      capabilities: [{ id: "", name: "Order capture", triggers: ["capture order", " "], component_id: "Order API" }],
    };
    const finished = finishedSystem(value, draft);
    expect(finished).toMatchObject({
      id: "order-hub",
      aliases: ["hub"],
      components: [{ id: "order-api" }],
      capabilities: [{ id: "order-capture", triggers: ["capture order"], component_id: "order-api" }],
    });
    expect(systemProblem({ ...value, aliases: ["Fixed order orchestration"] }, draft)).toContain("CWOM already goes by");
    expect(systemProblem({ ...value, capabilities: [{ id: "", name: "X", triggers: [] }] }, draft)).toBe(
      "Every capability needs at least one matching phrase.",
    );
  });
});

describe("getting ready to publish", () => {
  it("knows how far the build has got at the draft's revision", () => {
    expect(buildState(draft, null)).toBe("stale");
    expect(buildState({ ...draft, built_revision: 5 } as Release, null)).toBe("built");
    expect(buildState({ ...draft, built_revision: null } as Release, null)).toBe("never");
    const job = { id: "j", status: "running", fingerprint: "5|profile" } as never;
    expect(buildState(draft, job)).toBe("building");
    expect(buildState(draft, { id: "j", status: "failed", fingerprint: "5|profile" } as never)).toBe("failed");
    // A job for an older revision says nothing about this one.
    expect(buildState(draft, { id: "j", status: "running", fingerprint: "4|profile" } as never)).toBe("stale");
  });

  it("says in words what a comparison moves", () => {
    const compared = (before: string[], after: string[]) => ({
      query: "q",
      in_use: { release_id: "a", systems: before.map((name) => ({ id: name, name })), uncertainty: null },
      this_version: { release_id: "b", systems: after.map((name) => ({ id: name, name })), uncertainty: null },
    });
    expect(impactVerdict(compared(["CWOM"], ["CWOM"]))).toEqual({ label: "Same systems", moved: false });
    expect(impactVerdict(compared([], ["Order Hub"])).label).toBe("Now also finds Order Hub");
    expect(impactVerdict(compared(["CIM", "CWOM"], ["CWOM", "BSCS"])).label).toBe("Now also finds BSCS; No longer finds CIM");
    expect(impactVerdict(compared(["CIM"], []))).toEqual({ label: "Finds no system now", moved: true });
  });

  it("lists a diff by kind, added before changed before removed, with fields in words", () => {
    const sections = diffSections({
      base_release_id: "a", draft_release_id: "b",
      changes: [
        { item: "relationship", change: "removed", key: "r", label: "CWOM → BSCS", fields: [] },
        { item: "system", change: "changed", key: "cwom", label: "CWOM", fields: ["name_ar", "landscape_domain"] },
        { item: "system", change: "added", key: "hub", label: "Order Hub", fields: [] },
      ],
    });
    expect(sections.map((section) => [section.label, section.changes.map((change) => change.change)])).toEqual([
      ["Systems", ["added", "changed"]],
      ["Connections", ["removed"]],
    ]);
    expect(fieldsInWords(["name_ar", "landscape_domain"])).toBe("Arabic name and where it sits");
    // A connection is a sentence, never an arrow.
    const added = { item: "relationship" as const, change: "added" as const, key: "cwom->bscs:closure", label: "CWOM → BSCS: Closure", fields: [] };
    expect(connectionSentence(added, draft)).toEqual({ sentence: "CWOM sends data to BSCS", forWhat: "Closure" });
    expect(connectionSentence({ ...added, change: "removed", key: "cwom->gone:old", label: "CWOM → Legacy: Old" }, draft).sentence)
      .toBe("CWOM no longer depends on Legacy");
  });
});
