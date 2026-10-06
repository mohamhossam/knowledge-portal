import { describe, expect, it } from "vitest";

import { EXPLORED } from "./fixtures";
import { gaps, glance, involvement, listed, partsFor, performer, pickScenario, trackingFor } from "./scenario";

const scenario = (product?: string, order?: string, channel?: string) => pickScenario(EXPLORED, product, order, channel)!;

describe("pickScenario", () => {
  it("opens on the first order type that has a journey", () => {
    const opened = scenario();
    expect([opened.offering.id, opened.orderType.code, opened.journey?.id]).toEqual(["bpp", "NEW", "bpp-new"]);
  });

  it("keeps the order type asked for, in any case, even without a journey", () => {
    const cease = scenario("bpp", "cease");
    expect([cease.orderType.code, cease.journey]).toEqual(["CEASE", null]);
  });

  it("falls back to a real offering when the one asked for is gone", () => {
    expect(scenario("gone").offering.id).toBe("bpp");
  });

  it("has nothing to open when no offering has an order type", () => {
    expect(pickScenario({ ...EXPLORED, products: [] }, null, null)).toBeNull();
  });
});

describe("involvement", () => {
  it("lists the journey's systems in step order, then those named only for a part", () => {
    const taking = involvement(scenario());
    expect(taking.map((item) => item.systemId)).toEqual(["web", "rtf", "cwom", "wfm"]);
    expect(taking[0]).toMatchObject({ performs: ["1"], supports: ["2"] });
    expect(taking[2]!.parts.map((item) => item.part.id)).toEqual(["bb"]);
    expect(taking[3]).toMatchObject({ performs: [], supports: [] });
  });

  it("names only the responsibilities that hold for the order type", () => {
    const cease = partsFor(scenario("bpp", "CEASE"));
    expect(cease[0]!.responsibilities.map((item) => item.system_id)).toEqual(["cwom", "bscs"]);
  });
});

describe("gaps", () => {
  it("says which steps and parts name no system, and how many facts are gaps", () => {
    expect(gaps(scenario())).toEqual([
      "Step 4 names no system that performs it.",
      "No system is named as responsible for Firewall in New Activation.",
      "How Firewall is realised is not recorded.",
      "Availability is not defined by any source.",
      "2 conflicts between its sources need a decision before New Activation can be relied on.",
      "Tracking’s ‘Installation done’ is marked in the sources as a gap.",
      "1 fact is marked in its source as a gap.",
    ]);
  });

  it("says when an offering records no non-functional requirement", () => {
    const bare = { ...EXPLORED, products: EXPLORED.products!.map((item) => ({ ...item, nfrs: [] })) };
    expect(gaps(pickScenario(bare, "bpp", "NEW")!)).toContain("No non-functional requirement is recorded for Business Pro Plus.");
  });

  it("says so when no journey or channel is recorded", () => {
    expect(gaps(scenario("bpp", "CEASE"))).toEqual([
      "No channel is recorded for Cease, so the steps of every channel are shown together.",
      "No journey is recorded for Cease, so no step or hand-over can be shown.",
      "No system is named as responsible for Firewall in Cease.",
      "How Firewall is realised is not recorded.",
      "Availability is not defined by any source.",
      "Lifecycle note ‘Renewal’ carries over content from another source, to re-verify.",
      // A conflict over every order type concerns Cease too; one over New Activation does not.
      "1 conflict between its sources needs a decision before Cease can be relied on.",
      "1 fact is marked in its source as a gap.",
    ]);
  });

  it("says which lifecycle notes carry over content to re-verify, for the notes that concern the scenario", () => {
    expect(gaps(scenario("bpp", "NEW", "shop"))).toContain("Lifecycle note ‘Renewal’ carries over content from another source, to re-verify.");
    expect(gaps(scenario())).not.toContain("Lifecycle note ‘Renewal’ carries over content from another source, to re-verify.");
  });

  it("says when the channel's entry system performs a step but the channel names none", () => {
    expect(gaps(scenario("bpp", "NEW", "shop"))).toContain(
      "Step 1 is performed by the channel’s entry system, but Shop names no entry system.",
    );
  });

  it("lists in words", () => {
    expect([listed(["3"]), listed(["3", "5"]), listed(["3", "5", "9"])]).toEqual(["3", "3 and 5", "3, 5 and 9"]);
  });
});

describe("channels", () => {
  it("reads the order type's first channel, or the one asked for", () => {
    expect(scenario().channel?.id).toBe("online");
    expect(scenario("bpp", "NEW", "shop").channel?.id).toBe("shop");
    expect(scenario("bpp", "NEW", "gone").channel?.id).toBe("online");
    expect(scenario("bpp", "CEASE").channel).toBeNull();
  });

  it("keeps a channel's own steps and the shared ones, and the arrows between them", () => {
    const online = scenario().journey!;
    expect(online.activities.map((step) => step.number)).toEqual(["1", "2", "3", "4"]);
    expect(online.edges.some((edge) => edge.to_activity === "5")).toBe(false);
    expect(scenario("bpp", "NEW", "shop").journey!.activities.map((step) => step.number)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("has the channel's entry system perform the steps given to it", () => {
    expect(performer(scenario(), scenario().journey!.activities[0]!)).toBe("web");
    expect(performer(scenario("bpp", "NEW", "shop"), scenario().journey!.activities[0]!)).toBeNull();
    expect(involvement(scenario("bpp", "NEW", "shop")).map((item) => item.systemId)).toEqual(["rtf", "web", "cwom", "bscs", "wfm"]);
  });
});

describe("tracking", () => {
  it("reads the channel's correlation and adds its screen's read path to the shared flows", () => {
    const tracked = trackingFor(scenario())!;
    expect(tracked.applies).toBe(true);
    expect(tracked.entry?.ui_system_id).toBe("web");
    expect(tracked.flows.map((flow) => `${flow.from_system_id}>${flow.to_system_id}`)).toEqual(["cwom>rtf", "rtf>rtf", "rtf>web"]);
    expect(tracked.flows.at(-1)).toMatchObject({ label: "getRealTimeOrderDetails", readFor: "Online" });
  });

  it("says what a channel leaves undefined", () => {
    expect(trackingFor(scenario("bpp", "NEW", "shop"))!.gaps).toEqual([
      "Shop’s tracking screen is not named.",
      "Shop has no correlation key tying its order to the fulfilment order.",
      "Tracking’s ‘Installation done’ is marked in the sources as a gap.",
    ]);
  });

  it("is not specified for an order type it does not name, and says nothing is missing there", () => {
    const cease = trackingFor(scenario("bpp", "CEASE"))!;
    expect([cease.applies, cease.flows, cease.gaps]).toEqual([false, [], []]);
  });

  it("marks the systems that carry or show the order's tracking", () => {
    const taking = involvement(scenario());
    expect(taking.filter((item) => item.tracks).map((item) => item.systemId)).toEqual(["web", "rtf", "cwom"]);
  });

  it("says when an offering records no tracking", () => {
    const bare = { ...EXPLORED, products: EXPLORED.products!.map((item) => ({ ...item, tracking: null })) };
    expect(gaps(pickScenario(bare, "bpp", "NEW")!)).toContain("No order tracking is recorded for Business Pro Plus.");
  });
});

describe("glance", () => {
  it("sizes the scenario for the chosen channel", () => {
    const online = glance(scenario("bpp", "NEW", "online"));
    expect(online.steps).toEqual({ total: 4, someChannels: 0 });
    expect([online.systems, online.parts, online.channels.map((item) => item.name)]).toEqual([4, 2, ["Online", "Shop"]]);
    expect(glance(scenario("bpp", "NEW", "shop")).steps).toEqual({ total: 5, someChannels: 1 });
  });

  it("counts how sure the sources are, a fact that does not say as not stated, never as confirmed", () => {
    expect(glance(scenario("bpp", "NEW", "online")).sureness).toEqual({ confirmed: 1, inferred: 1, gap: 1, unstated: 11, total: 14 });
  });

  it("counts the same gap facts the gaps section names", () => {
    const opened = scenario("bpp", "NEW", "online");
    expect(gaps(opened)).toContain(`${glance(opened).sureness.gap} fact is marked in its source as a gap.`);
  });

  it("has no steps to size without a journey", () => {
    const cease = glance(scenario("bpp", "CEASE"));
    expect([cease.steps, cease.channels]).toEqual([null, []]);
  });
});
