import { describe, expect, it } from "vitest";

import type { Organisation, ReferenceFlag, Release } from "../api/client";
import {
  conceptsOf, freeId, gaps, historyLine, holdsRoles, productLinks, rolesOf, runBy, seatsLine, seatsOn, squadChecks, streamSections, unnamedSystems,
} from "./organisation";

const release = {
  id: "live", revision: 1, status: "published", documents: [], relationships: [],
  systems: [
    { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [], landscape_domain_id: "channels" },
    { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [], constraints: [], landscape_domain_id: "orch" },
    { id: "wfm", name: "WFM", aliases: [], capabilities: [], components: [], constraints: [], landscape_domain_id: "orch" },
    { id: "eida", name: "EIDA", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
  landscape_domains: [{ id: "channels", name: "Channels" }, { id: "orch", name: "Orchestration" }],
  products: [{ id: "fibre-offer", name: "Business fibre" }],
  portfolio: [{ id: "smb", name: "SMB", level: "Segment" }],
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
  products: [
    {
      id: "p", name: "Fibre", description: "", value_stream_id: "retail", system_ids: ["bcrm", "legacy"],
      offering_ids: ["fibre-offer"], portfolio_node_id: "smb", revision: 1,
    },
  ],
  squads: [
    {
      id: "sales", name: "Sales", value_stream_id: "retail", scrum_master_person_id: "layla",
      resources: [{ system_id: "bcrm", role: "system_contact", person_id: "layla" }], revision: 1,
    },
    {
      id: "ops", name: "Ops", value_stream_id: "business",
      resources: [
        { system_id: "cwom", role: "system_contact", person_id: null },
        { system_id: "bcrm", role: "tester", person_id: "omar" },
        { system_id: "bcrm", role: "developer", person_id: null },
        { system_id: "bcrm", role: "system_contact", person_id: "layla" },
      ],
      revision: 3,
    },
  ],
} as unknown as Organisation;

describe("the organisation through what it sells", () => {
  it("sets each value stream with its lead, products and who runs each system", () => {
    const sections = streamSections(org, release);
    expect(sections.map((section) => [section.stream.name, section.lead?.name ?? null])).toEqual([["Business", null], ["Retail", "Layla"]]);
    const rows = sections[1]!.products[0]!.rows;
    expect(rows.map((row) => [row.name, row.lapsed, row.runBy.map((item) => `${item.squad.name}: ${seatsLine(item.seats)}`)])).toEqual([
      ["BCRM", false, ["Ops: Contact: Layla · Developer: open seat · Tester: Omar", "Sales: Contact: Layla"]],
      ["legacy", true, []],
    ]);
  });

  it("says what a product sells, where it sits, and what to check in its links", () => {
    const product = org.products[0]!;
    expect(productLinks(product, release, undefined)).toEqual({ sells: ["Business fibre"], portfolio: "SMB (Segment)", checks: [] });
    const flag: ReferenceFlag = {
      subject: "product", subject_id: "p", retired_system_ids: ["legacy"], retired_offering_ids: ["old-offer"],
      retired_portfolio_node_id: null, retired_capabilities: [], systems_missing: ["cwom"], systems_unexplained: ["bcrm"], unlinked: false,
    };
    expect(productLinks({ ...product, offering_ids: ["fibre-offer", "old-offer"] }, release, flag).checks).toEqual([
      "old-offer: no longer an offering in service.",
      "Its offerings also name CWOM, which it does not list.",
      "It lists BCRM, which none of its offerings name.",
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
    expect(layla.resource.map((item) => `${item.squad.name}/${item.role}`)).toEqual(["Sales/system_contact", "Ops/system_contact"]);
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

describe("seats scoped to a capability", () => {
  const billing = {
    ...release,
    business_capabilities: [
      { id: "cap-billing", pref_label: "Billing", alt_labels: [] },
      { id: "cap-charging", pref_label: "Charging", alt_labels: [] },
    ],
    systems: [
      ...release.systems,
      { id: "bscs", name: "BSCS", aliases: [], components: [], constraints: [], capabilities: [{ id: "bill", name: "Bill", triggers: [], concept_id: "cap-billing" }] },
    ],
  } as unknown as Release;
  const squad = {
    id: "zeta", name: "Zeta", value_stream_id: "retail", scrum_master_person_id: null, revision: 1,
    resources: [
      { system_id: "bscs", role: "developer", person_id: "omar", capability_id: "cap-billing" },
      { system_id: "bscs", role: "developer", person_id: "layla", capability_id: null },
      { system_id: "bscs", role: "tester", person_id: null, capability_id: "cap-charging" },
    ],
  } as Organisation["squads"][number];

  it("offers the concepts a system's capabilities link to", () => {
    expect(conceptsOf(billing, "bscs")).toEqual([{ id: "cap-billing", name: "Billing" }]);
    expect(conceptsOf(billing, "bcrm")).toEqual([]);
  });

  it("names each seat's capability, whole-system seats first, and marks a lapsed scope", () => {
    expect(seatsLine(seatsOn({ ...org, squads: [squad] }, squad, "bscs", billing))).toBe(
      "Developer: Layla · Developer for Billing: Omar · Tester for Charging (no longer linked): open seat",
    );
  });

  it("says what a squad names that the version in service no longer has", () => {
    const flag: ReferenceFlag = {
      subject: "squad", subject_id: "zeta", retired_system_ids: ["gone"], retired_offering_ids: [], retired_portfolio_node_id: null,
      retired_capabilities: [{ system_id: "bscs", capability_id: "cap-charging" }], systems_missing: [], systems_unexplained: [], unlinked: false,
    };
    expect(squadChecks(flag, billing)).toEqual([
      "gone: no longer a system in service.",
      "BSCS › Charging: no capability of the system links to it any more.",
    ]);
    expect(squadChecks(undefined, billing)).toEqual([]);
  });
});
