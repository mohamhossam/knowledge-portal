import { describe, expect, it } from "vitest";

import { SYSTEMS, TEAMS, systemById } from "./data/landscape";
import { FINDINGS, JOURNEYS, TRACKING } from "./data/journeys";
import { CHANNELS, OFFERINGS, ORDER_TYPES, PORTFOLIO } from "./data/portfolio";
import { toBpmn, toCsv, toMermaid, toPlantUml } from "./exports";
import { layoutFlow } from "./flowLayout";
import { impactOf } from "./impact";

const known = new Set([...SYSTEMS.map((system) => system.id), ...TEAMS.map((team) => team.id)]);

describe("the catalogue model", () => {
  it("names only known systems and teams in every lane and call", () => {
    for (const journey of JOURNEYS) {
      for (const step of journey.steps) expect(known, `${journey.id}/${step.id} lane`).toContain(step.lane);
      for (const call of journey.integrations) {
        for (const id of [call.from, call.to, call.via].filter(Boolean)) expect(known, `${journey.id}/${call.id}`).toContain(id);
        expect(journey.steps.map((step) => step.id), `${journey.id}/${call.id} step`).toContain(call.step);
      }
    }
    for (const flow of TRACKING) for (const message of flow.messages) for (const id of [message.from, message.to]) expect(known).toContain(id);
  });

  it("links every flow to a step that exists, from one start to at least one end", () => {
    for (const journey of JOURNEYS) {
      const ids = new Set(journey.steps.map((step) => step.id));
      expect(ids.size, `${journey.id} has unique step ids`).toBe(journey.steps.length);
      for (const step of journey.steps) for (const next of step.next) expect(ids, `${journey.id}/${step.id} → ${next.to}`).toContain(next.to);
      expect(journey.steps.filter((step) => step.kind === "start")).toHaveLength(1);
      expect(journey.steps.some((step) => step.kind === "end")).toBe(true);
    }
  });

  it("keeps the portfolio, channels and order types consistent with the offerings", () => {
    const nodes = new Set(PORTFOLIO.map((node) => node.id));
    for (const node of PORTFOLIO) if (node.parentId) expect(nodes).toContain(node.parentId);
    for (const offering of OFFERINGS) {
      expect(nodes).toContain(offering.nodeId);
      for (const support of offering.orderTypes) {
        expect(ORDER_TYPES.map((type) => type.code)).toContain(support.code);
        for (const channel of support.channels) expect(CHANNELS.map((item) => item.id)).toContain(channel);
      }
      for (const component of offering.components) for (const item of component.systems) expect(known).toContain(item.systemId);
    }
    for (const channel of CHANNELS) expect(systemById(channel.systemId)).toBeDefined();
  });

  it("never states a price the sources don't give", () => {
    for (const offering of OFFERINGS) for (const plan of offering.plans) expect(plan.price).toBeUndefined();
    expect(FINDINGS.some((finding) => finding.title === "Plan prices")).toBe(true);
  });
});

describe("the impact lens", () => {
  it("names the systems a product, order type and channel touch, with their strongest role", () => {
    const { journeys, systems } = impactOf({ offeringId: "business-pro-plus", orderType: "NEW", channel: "b2b-web" });
    expect(journeys.map((journey) => journey.id)).toEqual(["bpp-new-digital"]);
    expect(systems.get("cwom")?.roles[0]).toBe("orchestrate");
    expect(systems.get("b2b-web")?.roles).toContain("capture");
    expect(systems.get("tibco")?.carriesOnly).toBe(true);
    expect(systems.has("bcrm")).toBe(false);
    // Teams take part in flows but aren't systems on the landscape.
    expect(systems.has("mss")).toBe(false);
  });

  it("is empty, not zero-filled, for a combination without a journey", () => {
    const { journeys, systems } = impactOf({ offeringId: "business-pro-plus", orderType: "CESSREQ", channel: "bcrm" });
    expect(journeys).toHaveLength(0);
    expect(systems.size).toBe(0);
  });
});

describe("the BPMN layout and exports", () => {
  it("never puts two steps of one lane in the same cell", () => {
    for (const journey of JOURNEYS) {
      const cells = [...layoutFlow(journey).placed.values()].map((place) => `${place.lane}:${place.column}`);
      expect(new Set(cells).size, journey.id).toBe(cells.length);
    }
  });

  it("writes BPMN 2.0 XML with a shape for every step and an edge for every flow", () => {
    for (const journey of JOURNEYS) {
      const doc = new DOMParser().parseFromString(toBpmn(journey), "application/xml");
      expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
      const flows = journey.steps.reduce((sum, step) => sum + step.next.length, 0);
      expect(doc.getElementsByTagName("bpmn:sequenceFlow")).toHaveLength(flows);
      expect(doc.getElementsByTagName("bpmndi:BPMNEdge")).toHaveLength(flows);
      // One shape per step, plus the pool and its lanes.
      const lanes = new Set(journey.steps.map((step) => step.lane)).size;
      expect(doc.getElementsByTagName("bpmndi:BPMNShape")).toHaveLength(journey.steps.length + lanes + 1);
      expect(doc.getElementsByTagName("bpmn:lane")).toHaveLength(lanes);
    }
  });

  it("writes the integrations as PlantUML, Mermaid and a CSV register", () => {
    const journey = JOURNEYS[0]!;
    const plantuml = toPlantUml(journey.name, journey.integrations);
    expect(plantuml.startsWith("@startuml")).toBe(true);
    expect(plantuml).toContain("rtf -> cwom : createShoppingCart");
    expect(plantuml).toContain(`participant "CWOM" as cwom`);
    expect(toMermaid(journey.name, journey.integrations).startsWith("sequenceDiagram")).toBe(true);
    const csv = toCsv(journey.integrations).replace(/^\uFEFF/, "").split("\r\n");
    expect(csv).toHaveLength(journey.integrations.length + 1);
    expect(csv[0]).toContain("TMF equivalent (hypothesis)");
  });
});
