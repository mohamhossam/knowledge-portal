import { describe, expect, it } from "vitest";

import type { Release } from "../api/client";
import { sharedMastery } from "./mastery";

const system = (id: string, masters: string[], notes: Record<string, string> = {}, deprecated = false) => ({
  id,
  name: id.toUpperCase(),
  masters,
  deprecated,
  mastery_notes: Object.entries(notes).map(([entity_id, note]) => ({ entity_id, note })),
});

const release = (...systems: ReturnType<typeof system>[]) =>
  ({
    systems,
    vocabulary: [{ id: "entity-customer", scheme: "information_entity", pref_label: "Customer" }],
  }) as unknown as Release;

describe("data with more than one system of record (ADR-0123)", () => {
  it("lists each shared entity with every owner's note, counting the owners without one", () => {
    const [customer] = sharedMastery(release(system("cbcm", ["entity-customer"], { "entity-customer": "Legacy customers" }), system("nc-crm", ["entity-customer"])));
    expect(customer).toEqual({
      id: "entity-customer",
      name: "Customer",
      owners: [{ id: "cbcm", name: "CBCM", note: "Legacy customers" }, { id: "nc-crm", name: "NC-CRM", note: null }],
      unexplained: 1,
    });
  });

  it("leaves out data one system masters, and retired systems", () => {
    expect(sharedMastery(release(system("cbcm", ["entity-customer"]), system("old", ["entity-customer"], {}, true)))).toEqual([]);
  });
});
