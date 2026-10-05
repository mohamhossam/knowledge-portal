import { describe, expect, it } from "vitest";

import type { Release } from "../api/client";
import {
  UNPLACED, allConnections, catalogue, changeSentence, connections, dependsHow, domainPath, findSystems, nextSteps,
  orderedSteps, phaseRuns, roleLabel, sentenceCase, systemGroups, systemRoles, usedHow,
} from "./catalogue";

const system = (id: string, name: string, extra: object = {}) => ({
  id, name, aliases: [], capabilities: [], components: [], constraints: [], ...extra,
});

const release = {
  id: "r2", name: "September", revision: 2, status: "published", documents: [],
  systems: [
    system("web", "B2B Web", { landscape_domain_id: "digital", aliases: ["web channel"], name_ar: "بوابة الأعمال" }),
    system("cwom", "CWOM", {
      landscape_domain_id: "orchestration",
      components: [{ id: "m", name: "Milestone tracker", aliases: [] }],
      capabilities: [{ id: "c", name: "Order milestone tracking", triggers: ["installation milestones"] }],
    }),
    system("bscs", "BSCS", { landscape_domain_id: "orchestration" }),
    system("eida", "EIDA"),
  ],
  relationships: [
    { source_system_id: "web", target_system_id: "cwom", kind: "calls_api", description: "Orders" },
    { source_system_id: "cwom", target_system_id: "bscs", kind: "transfers_data_to", description: "Closure" },
  ],
  landscape_domains: [
    { id: "channels", name: "Channels" },
    { id: "digital", name: "Digital", parent_id: "channels" },
    { id: "orchestration", name: "Orchestration" },
  ],
  products: [{
    id: "fibre", name: "Fibre", rules: [], values: [], audiences: [],
    order_types: [{ code: "NEW", name: "New connection", enabled: true }],
    components: [{ id: "line", name: "Fibre line", responsibilities: [{ system_id: "cwom", role: "FULFILS", description: "", order_types: ["NEW"] }] }],
  }],
  journeys: [{
    id: "j", name: "Ordering", flow_rules: [], integrations: [],
    activities: [
      { number: "100", name: "Bill", phase: "Billing", performing_system_id: "bscs", supporting_system_ids: [], component_ids: [] },
      { number: "20", name: "Check", phase: "Capture", performing_system_id: "web", supporting_system_ids: ["cwom"], component_ids: [] },
      { number: "30", name: "Fulfil", phase: "Fulfilment", performing_system_id: "cwom", supporting_system_ids: [], component_ids: [] },
      { number: "80", name: "Refuse", phase: "Capture", performing_system_id: "web", supporting_system_ids: [], component_ids: [] },
    ],
    edges: [
      { from_activity: "20", to_activity: "30", kind: "decision", label: "Covered" },
      { from_activity: "20", to_activity: "80", kind: "decision", label: "Not covered" },
      { from_activity: "30", to_activity: "80", kind: "sequence" },
    ],
  }],
} as unknown as Release;

const book = catalogue(release);

describe("the systems index", () => {
  it("groups systems under where they sit, in the landscape's order, with the unplaced last", () => {
    const groups = systemGroups(book);
    expect(groups.map((group) => group.path.join(" › ") || group.id)).toEqual([
      "Channels › Digital", "Orchestration", UNPLACED,
    ]);
    expect(groups[1]!.systems.map((item) => item.name)).toEqual(["BSCS", "CWOM"]);
  });

  it("finds a system by any name it is known by, and says what matched", () => {
    expect(findSystems(book, "web channel").get("web")).toBe("Also called “web channel”");
    expect(findSystems(book, "بوابة").get("web")).toBeNull();
    expect(findSystems(book, "milestone tracker").get("cwom")).toBe("Component: Milestone tracker");
    expect(findSystems(book, "installation").get("cwom")).toBe("Matched by “installation milestones”");
    expect(findSystems(book, "nothing like it").size).toBe(0);
  });

  it("reads a domain's path outermost first", () => {
    expect(domainPath(book.landscape, "digital")).toEqual(["Channels", "Digital"]);
    expect(domainPath(book.landscape, null)).toEqual([]);
  });
});

describe("connections", () => {
  it("reads both ways from a system, naming the sheet's system in each phrase", () => {
    const { dependsOn, usedBy } = connections(book, "cwom");
    expect(dependsOn.map((item) => item.target_system_id)).toEqual(["bscs"]);
    expect(usedBy.map((item) => item.source_system_id)).toEqual(["web"]);
    expect(dependsHow("transfers_data_to", "CWOM")).toBe("Gets data from CWOM");
    expect(usedHow("orchestrates", "CWOM")).toBe("Orchestrates CWOM");
  });

  it("lists every connection by the depending system's name", () => {
    expect(allConnections(book).map((item) => item.source_system_id)).toEqual(["web", "cwom"]);
  });
});

describe("offerings and journeys", () => {
  it("names the parts a system is responsible for and the steps it takes", () => {
    const roles = systemRoles(book, "cwom");
    expect(roles.offerings[0]).toMatchObject({ component: "Fibre line", role: "FULFILS", orderTypes: ["New connection"] });
    expect(roles.journeys.map((role) => [role.activity.number, role.performs])).toEqual([["20", false], ["30", true]]);
    expect(sentenceCase("FULFILS")).toBe("Fulfils");
    expect(sentenceCase("Bills")).toBe("Bills");
    expect(roleLabel("PRIMARY_ORCHESTRATOR")).toBe("Primary orchestrator");
    expect(roleLabel("Design time")).toBe("Design time");
  });

  it("orders steps by number, groups consecutive phases, and says where a step branches", () => {
    const journey = release.journeys![0]!;
    const steps = orderedSteps(journey);
    expect(steps.map((step) => step.number)).toEqual(["20", "30", "80", "100"]);
    expect(phaseRuns(steps).map((run) => run.phase)).toEqual(["Capture", "Fulfilment", "Capture", "Billing"]);
    expect(nextSteps(journey, "20")).toBe("Then 30 if Covered; 80 if Not covered");
    expect(nextSteps(journey, "30")).toBe("");
    expect(nextSteps(journey, "100")).toBe("");
  });
});

describe("changeSentence", () => {
  it("counts what a version would add, change and remove", () => {
    const sentence = changeSentence({
      base_release_id: "a", draft_release_id: "b",
      changes: [
        { item: "system", change: "changed", key: "x", label: "X", fields: [] },
        { item: "system", change: "changed", key: "y", label: "Y", fields: [] },
        { item: "relationship", change: "removed", key: "z", label: "Z", fields: [] },
        { item: "product", change: "removed", key: "p", label: "P", fields: [] },
        { item: "journey", change: "added", key: "j", label: "J", fields: [] },
      ],
    });
    expect(sentence).toBe("add 1 journey, change 2 systems, and remove 1 connection and 1 offering");
    expect(changeSentence({ base_release_id: "a", draft_release_id: "b", changes: [] })).toBeNull();
  });
});
