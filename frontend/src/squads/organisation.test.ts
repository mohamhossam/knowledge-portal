import { describe, expect, it } from "vitest";

import type { Organisation, Release } from "../api/client";
import { freeId, gaps, historyLine, holdsRoles, rolesOf, runBy, streamSections, unnamedSystems } from "./organisation";

const release = {
  id: "live", revision: 1, status: "published", documents: [], relationships: [],
  systems: [
    { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [], landscape_domain_id: "channels" },
    { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [], constraints: [], landscape_domain_id: "orch" },
    { id: "wfm", name: "WFM", aliases: [], capabilities: [], components: [], constraints: [], landscape_domain_id: "orch" },
    { id: "eida", name: "EIDA", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
  landscape_domains: [{ id: "channels", name: "Channels" }, { id: "orch", name: "Orchestration" }],
} as unknown as Release;

const org: Organisation = {
  people: [
    { id: "layla", name: "Layla", active: true, revision: 1 },
    { id: "omar", name: "Omar", active: true, revision: 1 },
    { id: "rana", name: "Rana", active: false, revision: 2 },
  ],
  value_streams: [
    { id: "retail", name: "Retail", lead_person_id: "layla", revision: 1 },
    { id: "business", name: "Business", lead_person_id: null, revision: 1 },
  ],
  products: [{ id: "p", name: "Fibre", description: "", value_stream_id: "retail", system_ids: ["bcrm", "legacy"], revision: 1 }],
  squads: [
    { id: "sales", name: "Sales", value_stream_id: "retail", scrum_master_person_id: "layla", systems: [{ system_id: "bcrm", person_id: "layla" }], revision: 1 },
    { id: "ops", name: "Ops", value_stream_id: "business", systems: [{ system_id: "cwom", person_id: null }, { system_id: "bcrm", person_id: "omar" }], revision: 3 },
  ],
} as unknown as Organisation;

describe("the organisation through what it sells", () => {
  it("sets each value stream with its lead, products and who runs each system", () => {
    const sections = streamSections(org, release);
    expect(sections.map((section) => [section.stream.name, section.lead?.name ?? null])).toEqual([["Business", null], ["Retail", "Layla"]]);
    const rows = sections[1]!.products[0]!.rows;
    expect(rows.map((row) => [row.name, row.lapsed, row.runBy.map((item) => `${item.squad.name}/${item.contact?.name ?? "-"}`)])).toEqual([
      ["BCRM", false, ["Ops/Omar", "Sales/Layla"]],
      ["legacy", true, []],
    ]);
  });

  it("lists the systems no product names by where they sit, unplaced last", () => {
    expect(unnamedSystems(org, release).map((group) => [group.place, group.rows.map((row) => row.name)])).toEqual([
      ["Orchestration", ["CWOM", "WFM"]],
      ["Not placed in the landscape", ["EIDA"]],
    ]);
  });

  it("counts ownership across the version in service, and links no longer in it", () => {
    expect(gaps(org, release)).toEqual({ inService: 4, run: 2, noSquad: 2, lapsed: 1 });
    expect(runBy(org, "wfm")).toEqual([]);
  });
});

describe("people and their roles", () => {
  it("knows what a person holds, so a role-holder is never made inactive", () => {
    const layla = rolesOf(org, "layla");
    expect(layla.leads.map((item) => item.name)).toEqual(["Retail"]);
    expect(layla.scrumMaster.map((item) => item.name)).toEqual(["Sales"]);
    expect(layla.resource).toHaveLength(1);
    expect(holdsRoles(layla)).toBe(true);
    expect(holdsRoles(rolesOf(org, "rana"))).toBe(false);
  });

  it("chooses free ids and says history in names", () => {
    expect(freeId("Sales", ["sales", "sales-2"])).toBe("sales-3");
    expect(historyLine({ action: "save_squad", subject_id: "ops", actor_id: "a", created_at: "" }, org)).toBe("Saved the squad Ops");
    expect(historyLine({ action: "remove_squad", subject_id: "night-shift", actor_id: "a", created_at: "" }, org)).toBe(
      "Removed the squad night shift",
    );
  });
});
