import { describe, expect, it } from "vitest";

import type { Journey, SystemInterface } from "../api/client";
import { linksOf, styleKind, systemLinks } from "./links";

const api = (over: Partial<SystemInterface>): SystemInterface => ({
  id: "if-crm",
  name: "CRM API",
  system_id: "crm",
  style: "api",
  consumer_ids: ["web"],
  entity_ids: [],
  open_api_ids: [],
  relays: [],
  ...over,
});

const journey = {
  id: "activation",
  name: "New activation",
  activities: [
    { number: "1", name: "Capture", performing_system_id: "web" },
    { number: "2", name: "Order", performing_system_id: "om" },
  ],
  integrations: [
    { from_activity: "1", to_activity: "2", style: "XML request", interface: "Create order", open_api_ids: [] },
    { from_activity: "2", to_activity: "2", to_system_id: "crm", style: "Event / message", open_api_ids: [] },
  ],
} as unknown as Journey;

describe("systemLinks", () => {
  it("reads a consumer calling an API, and an event going out from its publisher", () => {
    const links = systemLinks({
      relationships: [],
      interfaces: [api({}), api({ id: "if-events", name: "Order events", system_id: "om", style: "event", consumer_ids: ["crm"] })],
    });
    expect(links.map((link) => [link.source_system_id, link.kind, link.target_system_id])).toEqual([
      ["web", "calls_api", "crm"],
      ["om", "publishes_events_to", "crm"],
    ]);
    expect(links[0]).toMatchObject({ stated: null, description: "CRM API", interfaces: [{ id: "if-crm", name: "CRM API", systemId: "crm" }] });
  });

  it("finds a step's system from the step when the call does not name it, and counts steps per journey", () => {
    const links = systemLinks({ relationships: [], journeys: [journey] });
    expect(links.map((link) => [link.source_system_id, link.kind, link.target_system_id])).toEqual([
      ["web", "calls_api", "om"],
      ["om", "publishes_events_to", "crm"],
    ]);
    expect(links[0]!.journeys).toEqual([{ id: "activation", name: "New activation", steps: 1 }]);
  });

  it("merges every source of one pair into one line, a stated connection's words first", () => {
    const stated = { source_system_id: "web", target_system_id: "crm", kind: "unspecified" as const, description: "Reads the customer" };
    const links = systemLinks({ relationships: [stated], interfaces: [api({})], journeys: [] });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ stated, kind: "calls_api", description: "Reads the customer" });
  });

  it("leaves out calls within one system and calls whose systems are not known", () => {
    const self = { ...journey, integrations: [{ from_activity: "1", to_activity: "1", open_api_ids: [] }, { from_activity: "1", to_activity: "9", open_api_ids: [] }] } as unknown as Journey;
    expect(systemLinks({ relationships: [], journeys: [self] })).toEqual([]);
  });

  it("names three interfaces in full and counts the rest", () => {
    const many = ["A", "B", "C", "D", "E"].map((name) => api({ id: `if-${name}`, name }));
    expect(systemLinks({ relationships: [], interfaces: many })[0]!.description).toBe("A, B, C and 2 more");
  });

  it("reads a call style in its own words", () => {
    expect(styleKind("Callback")).toBe("calls_api");
    expect(styleKind("Database")).toBe("transfers_data_to");
    expect(styleKind("Ticket")).toBe("unspecified");
    expect(styleKind(null)).toBe("unspecified");
  });
});

describe("the links the service sends", () => {
  it("are the ones worked out here, for the SMB catalogue", async () => {
    const { default: fixture } = await import("./model/fixtures/smb-release.json");
    const release = fixture as unknown as Parameters<typeof systemLinks>[0] & { connections: unknown[] };
    const key = (link: { source_system_id: string; target_system_id: string; kind: string; description: string }) =>
      [link.source_system_id, link.target_system_id, link.kind, link.description].join(" | ");
    const local = systemLinks({ ...release, connections: null });
    expect(release.connections.length).toBeGreaterThan(0);
    expect(linksOf(release).map(key)).toEqual(local.map(key));
    expect(linksOf(release).map((link) => link.interfaces)).toEqual(local.map((link) => link.interfaces));
  });
});
