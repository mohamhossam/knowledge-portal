import { describe, expect, it } from "vitest";

import { fromRelease } from "../../architecture/adapter";
import release from "../../architecture/fixtures/smb-release.json";
import type { Evidence, Integration, Lane, TamDomain } from "../../architecture/model";
import { asRelease } from "../../architecture/sample";
import { allIntegrations, allViews, distinctInterfaces, layerOrder, layerRank, linkKey, links, mapRows, partnersOf, reachOf } from "./posterModel";

const data = fromRelease(asRelease(release));
const evidence: Evidence = { status: "inferred" };
const system = (systemId: string): Lane => ({ kind: "system", systemId });
const call = (from: string, to: string, extra: Partial<Integration> = {}): Integration => ({ id: `${from}-${to}`, step: "1", from: system(from), to: system(to), purpose: "", mode: "not-stated", evidence, ...extra });
const domain = (id: string, groups = 1): Pick<TamDomain, "id" | "groups"> => ({ id, groups: Array.from({ length: groups }, (_, index) => ({ id: `${id}.${index}`, name: `${id} ${index}` })) });

describe("the poster's model", () => {
  it("reads the layers in the version's order, with the bus under the customer layer", () => {
    // The sample lists both cross-cutting layers last.
    expect(data.domains.map((item) => item.id).slice(-2)).toEqual(["enterprise", "integration"]);
    expect(layerOrder(data.domains)).toEqual(["market-sales", "product", "customer", "integration", "service", "resource", "engaged-party", "enterprise"]);
    // With no customer layer, or no bus, the version's order stands.
    expect(layerOrder([domain("b"), domain("customer"), domain("a")])).toEqual(["b", "customer", "a"]);
    expect(layerOrder([domain("a"), domain("integration"), domain("b")])).toEqual(["a", "integration", "b"]);
    const rank = layerRank(data.domains);
    expect(rank("customer")).toBeLessThan(rank("integration"));
    expect(rank("integration")).toBeLessThan(rank("service"));
    expect(rank("not-a-layer")).toBe(8);
  });

  it("lays the map out in rows: pairs, a wide layer alone, the bus alone, the side layers last", () => {
    const has = (id: string) => data.systems.some((item) => item.domain === id);
    expect(mapRows(data.domains, has)).toEqual([["market-sales", "product"], ["customer"], ["integration"], ["service", "resource"], ["engaged-party", "enterprise"]]);
    // A layer with no systems leaves its partner to pair with the next; no pair crosses the bus.
    expect(mapRows(data.domains, (id) => has(id) && id !== "product")).toEqual([["market-sales"], ["customer"], ["integration"], ["service", "resource"], ["engaged-party", "enterprise"]]);
    expect(mapRows([domain("a"), domain("b"), domain("c"), domain("d", 5), domain("e")], () => true)).toEqual([["a", "b"], ["c"], ["d"], ["e"]]);
  });

  it("sees every journey through every channel it serves, and keeps each call once", () => {
    const views = allViews(data);
    expect(views.length).toBe(data.journeys.reduce((sum, journey) => sum + Math.max(1, journey.channels.length), 0));
    const calls = allIntegrations(data);
    expect(calls.length).toBeLessThanOrEqual(views.reduce((sum, view) => sum + view.integrations.length, 0));
    expect(distinctInterfaces(calls).length).toBeLessThanOrEqual(calls.length);
  });

  it("counts an interface once, whoever makes the call, and tells operations apart", () => {
    const same = [call("a", "b", { operation: "get" }), call("a", "b", { operation: "get", id: "again" }), call("a", "b", { operation: "put" }), call("a", "b", { via: "bus", operation: "get" })];
    expect(distinctInterfaces(same)).toHaveLength(3);
  });

  it("links systems either way round, with a call through the bus as two hops", () => {
    expect(linkKey("b", "a")).toBe(linkKey("a", "b"));
    const known = { ...data, systems: ["a", "b", "c", "bus"].map((id) => ({ ...data.systems[0]!, id })) };
    const found = links(known, [call("a", "b"), call("b", "a"), call("a", "c", { via: "bus" }), call("a", "a"), call("a", "ghost")]);
    expect(found.get(linkKey("a", "b"))).toEqual({ a: "a", b: "b", count: 2 });
    expect(found.get(linkKey("a", "bus"))?.count).toBe(1);
    expect(found.get(linkKey("bus", "c"))?.count).toBe(1);
    expect(found.size).toBe(3);
    expect(partnersOf("a", found)).toEqual([
      { id: "b", count: 2 },
      { id: "bus", count: 1 },
    ]);
    expect(partnersOf("ghost", found)).toEqual([]);
  });

  it("finds which of a product's journeys reach each system", () => {
    const offering = data.offerings[0]!;
    const reach = reachOf(data, offering.id);
    expect(reach.size).toBeGreaterThan(0);
    const journeys = new Set(data.journeys.filter((journey) => journey.offeringId === offering.id).map((journey) => journey.id));
    for (const [id, reached] of reach) {
      expect(data.systems.some((item) => item.id === id)).toBe(true);
      for (const journey of reached) expect(journeys.has(journey)).toBe(true);
    }
    expect(reachOf(data, "no-such-product").size).toBe(0);
  });
});
