import { describe, expect, it } from "vitest";

import type { Release } from "../api/client";
import { fromRelease, journeyView, journeyViews, laneName, parseEvidence } from "./adapter";
import { toBpmn, toCsv, toMermaid, toPlantUml } from "./exports";
import { layoutFlow } from "./flowLayout";
import { impactOf } from "./impact";
import release from "./fixtures/smb-release.json";

// The draft seeded from catalogues/smb-architecture.yaml, as the API returns it.
const data = fromRelease(release as unknown as Release);

describe("a catalogue version as the views read it", () => {
  it("places every system in a TAM domain and group, with the bands below the columns", () => {
    expect(data.domains.map((domain) => domain.id)).toEqual(["market-sales", "product", "customer", "service", "resource", "engaged-party", "enterprise", "integration"]);
    expect(data.domains.filter((domain) => domain.band).map((domain) => domain.id)).toEqual(["enterprise", "integration"]);
    for (const system of data.systems) {
      const domain = data.domains.find((item) => item.id === system.domain);
      expect(domain, system.id).toBeDefined();
      expect(domain?.groups.some((group) => group.id === system.group), system.id).toBe(true);
    }
    expect(data.systems.find((system) => system.id === "bscs")?.proposedMove?.from).toBe("Resource");
  });

  it("reads evidence from a fact's confidence and source line", () => {
    expect(parseEvidence("confirmed", "SDD v2.3 · §P1 · a note", data.sources)).toEqual({ status: "confirmed", source: "sdd", where: "§P1", note: "a note" });
    expect(parseEvidence("gap", "Somewhere else", data.sources)).toEqual({ status: "gap", where: "Somewhere else" });
    expect(parseEvidence(null, null, data.sources)).toEqual({ status: "inferred" });
  });

  it("keeps the portfolio, and an offering's plans as named characteristics with no price", () => {
    expect(data.portfolio.map((node) => node.name)).toEqual(["Enterprise", "Fixed", "SMB", "Business internet bundles"]);
    const offering = data.offerings[0]!;
    expect(offering.nodeId).toBe("business-internet");
    expect(offering.plans[0]?.characteristics.map((item) => item.name)).toEqual(["Download", "Upload", "CPE", "Access point", "Backup 5G"]);
    expect(offering.plans.flatMap((plan) => plan.characteristics).some((item) => /price/i.test(item.name))).toBe(false);
    expect(offering.orderTypes.find((type) => type.code === "UPDOWNGRD")?.priority).toBe("P2 / P3");
  });
});

describe("a journey seen through one channel", () => {
  it("keeps the channel's own steps and the shared ones, and drops the other channels'", () => {
    const digital = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const assisted = journeyView(data, "bpp-new-activation", "bcrm")!;
    const names = (view: typeof digital) => view.steps.filter((step) => step.kind === "task").map((step) => step.name);
    expect(names(digital)).toContain("Browse and configure the bundle");
    expect(names(digital)).not.toContain("Capture the order from the bundle definition");
    expect(names(assisted)).toContain("Capture the order from the bundle definition");
    expect(names(assisted)).not.toContain("Browse and configure the bundle");
    // The channel's entry system performs its entry steps.
    expect(digital.steps.find((step) => step.name === "Submit the order with the summary-order flags")?.lane).toBe("b2b-web");
    expect(journeyView(data, "bpp-new-activation", "smb-app")!.steps.find((step) => step.name === "Submit the order with the summary-order flags")?.lane).toBe("smb-app");
  });

  it("draws decisions, the parallel split and join, and start and end events", () => {
    const view = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const decision = view.steps.find((step) => step.kind === "exclusive" && step.name === "Business rules passed?");
    expect(decision?.next.map((next) => next.label).sort()).toEqual(["No", "Yes"]);
    const split = view.steps.find((step) => step.id.endsWith("~split"));
    expect(split?.next).toHaveLength(6);
    const join = view.steps.find((step) => step.id.endsWith("~join"));
    expect(view.steps.filter((step) => step.next.some((next) => next.to === join?.id))).toHaveLength(6);
    expect(view.steps.filter((step) => step.kind === "start")).toHaveLength(1);
    expect(view.steps.some((step) => step.kind === "error-end" && step.name === "Order returned for correction")).toBe(true);
    // Every arrow leads to a step of the view.
    const ids = new Set(view.steps.map((step) => step.id));
    for (const step of view.steps) for (const next of step.next) expect(ids.has(next.to), `${step.id} → ${next.to}`).toBe(true);
  });

  it("names who calls whom, through which layer, in the register", () => {
    const view = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const evaluate = view.integrations.find((call) => call.operation === "evaluateOrder" && call.to === "cbcm");
    expect(evaluate).toMatchObject({ from: "rtf", style: "API", tmf: "TMF679 Product Offering Qualification" });
    const notify = view.integrations.find((call) => call.operation === "NotifyOrderCreationRequest");
    expect(notify).toMatchObject({ from: "rtf", to: "ibm-bpm", via: "tibco" });
    const ticket = view.integrations.find((call) => call.operation === "Service onboarding ticket");
    expect(ticket?.to).toBe("team:MSS team");
    expect(laneName(data, "team:MSS team")).toBe("MSS team");
  });

  it("offers one view per channel its order type is sold through", () => {
    expect(journeyViews(data, "business-pro-plus", "NEW").map((view) => view.channel)).toEqual(["bcrm", "b2b-web", "smb-app"]);
    expect(journeyViews(data, "business-pro-plus", "UPDOWNGRD", "b2b-web")).toEqual([]);
    expect(journeyViews(data, "business-pro-plus", "CESSREQ").map((view) => view.channel)).toEqual(["bcrm", "b2b-web", "smb-app"]);
  });
});

describe("the impact lens", () => {
  it("names the systems a product, order type and channel touch, with their strongest role", () => {
    const { journeys, systems } = impactOf(data, { offeringId: "business-pro-plus", orderType: "NEW", channel: "b2b-web" });
    expect(journeys).toHaveLength(1);
    expect(systems.get("cwom")?.roles[0]).toBe("orchestrate");
    expect(systems.get("b2b-web")?.roles).toContain("capture");
    expect(systems.get("tibco")?.carriesOnly).toBe(true);
    expect(systems.has("bcrm")).toBe(false);
    expect([...systems.keys()].some((id) => id.startsWith("team:"))).toBe(false);
  });

  it("is empty, not zero-filled, for a combination without a journey", () => {
    const { journeys, systems } = impactOf(data, { offeringId: "business-pro-plus", orderType: "UPDOWNGRD", channel: "b2b-web" });
    expect(journeys).toHaveLength(0);
    expect(systems.size).toBe(0);
  });
});

describe("the BPMN layout and exports", () => {
  const views = data.journeys.flatMap((journey) => (journey.channels.length ? journey.channels : [null]).map((channel) => journeyView(data, journey.id, channel)!));

  it("never puts two steps of one lane in the same cell", () => {
    for (const view of views) {
      const cells = [...layoutFlow(view).placed.values()].map((place) => `${place.lane}:${place.column}`);
      expect(new Set(cells).size, `${view.id} ${view.channel}`).toBe(cells.length);
    }
  });

  it("writes BPMN 2.0 XML with a shape for every step and an edge for every flow", () => {
    for (const view of views) {
      const doc = new DOMParser().parseFromString(toBpmn(data, view), "application/xml");
      expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
      const flows = view.steps.reduce((sum, step) => sum + step.next.length, 0);
      expect(doc.getElementsByTagName("bpmn:sequenceFlow")).toHaveLength(flows);
      expect(doc.getElementsByTagName("bpmndi:BPMNEdge")).toHaveLength(flows);
      const lanes = new Set(view.steps.map((step) => step.lane)).size;
      expect(doc.getElementsByTagName("bpmndi:BPMNShape")).toHaveLength(view.steps.length + lanes + 1);
    }
  });

  it("writes the integrations as PlantUML, Mermaid and a CSV register", () => {
    const view = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const plantuml = toPlantUml(data, view.name, view.integrations);
    expect(plantuml.startsWith("@startuml")).toBe(true);
    expect(plantuml).toContain("rtf -> cwom : createShoppingCart");
    expect(toMermaid(data, view.name, view.integrations).startsWith("sequenceDiagram")).toBe(true);
    const csv = toCsv(data, view.integrations).replace(/^\uFEFF/, "").split("\r\n");
    expect(csv).toHaveLength(view.integrations.length + 1);
    expect(csv[0]).toContain("TMF equivalent (hypothesis)");
  });
});
