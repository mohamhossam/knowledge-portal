import { describe, expect, it } from "vitest";

import type { Release } from "../../api/client";
import { laneName, viewTitle } from "./words";
import { edgesFor, fromRelease, journeyView, journeyViews, modeOf, parseEvidence } from "./adapter";
import { toBpmn, toCsv, toMermaid, toPlantUml } from "./exports";
import { GEOMETRY, layoutFlow, waysBack } from "./flowLayout";
import { type ActivityStep, type JourneyView, laneKey, type Step } from "./model";
import { impactOf } from "./impact";
import release from "./fixtures/smb-release.json";
import { asRelease } from "./sample";

// The draft seeded from catalogues/smb-architecture.yaml, as the API returns it.
const data = fromRelease(asRelease(release));

const tasks = (view: JourneyView) => view.steps.filter((step): step is ActivityStep => step.kind === "task");

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

  it("places a system set deeper than a group in its top domain, in the group under it, and leaves an unplaced one unplaced", () => {
    const nested = asRelease(release);
    nested.landscape_domains = [
      ...(nested.landscape_domains ?? []),
      { id: "resource.inventory.network", name: "Network inventory", parent_id: "resource.inventory" } as never,
    ];
    const [placed, loose] = nested.systems;
    nested.systems = [{ ...placed!, landscape_domain_id: "resource.inventory.network" }, { ...loose!, landscape_domain_id: null }, ...nested.systems.slice(2)];
    const read = fromRelease(nested);
    expect([read.systems[0]?.domain, read.systems[0]?.group]).toEqual(["resource", "resource.inventory"]);
    expect([read.systems[1]?.domain, read.systems[1]?.group]).toEqual(["", ""]);
  });

  it("reads evidence from a fact's confidence and source line, as the service read the line", () => {
    // What the service sends for these lines (citations.source_reference).
    const lines = new Map([
      ["SDD v2.3 · §P1 · a note", { text: "SDD v2.3 · §P1 · a note", source_id: "sdd", cited: "SDD v2.3", rest: "· §P1 · a note", where: "§P1 · a note" }],
      ["Somewhere else", { text: "Somewhere else", source_id: null, cited: null, rest: null, where: "Somewhere else" }],
    ]);
    expect(parseEvidence("confirmed", "SDD v2.3 · §P1 · a note", lines)).toEqual({ status: "confirmed", source: "sdd", where: "§P1", note: "a note" });
    expect(parseEvidence("gap", "Somewhere else", lines)).toEqual({ status: "gap", where: "Somewhere else" });
    expect(parseEvidence(null, null, lines)).toEqual({ status: "inferred" });
    // The committed catalogue's facts name their sources through the service's readings.
    expect(data.offerings.flatMap((offering) => offering.components).some((part) => part.evidence?.source === "sdd")).toBe(true);
  });

  it("keeps the portfolio, and an offering's plans as named characteristics with no price", () => {
    expect(data.portfolio.map((node) => node.name)).toEqual(["Enterprise", "Fixed", "SMB", "Business internet bundles"]);
    const offering = data.offerings[0]!;
    expect(offering.nodeId).toBe("business-internet");
    expect(offering.plans[0]?.characteristics.map((item) => item.name)).toEqual(["Download", "Upload", "CPE", "Access point", "Backup 5G"]);
    expect(offering.plans.flatMap((plan) => plan.characteristics).some((item) => /price/i.test(item.name))).toBe(false);
    expect(offering.orderTypes.find((type) => type.code === "UPDOWNGRD")?.priority).toBe("P2 / P3");
  });

  it("reads an offering saved before plans and business rules as having none", () => {
    const older = structuredClone(asRelease(release)) as Release;
    for (const product of older.products ?? []) {
      delete (product as Partial<typeof product>).plans;
      delete (product as Partial<typeof product>).business_rules;
    }
    const offering = fromRelease(older).offerings[0]!;
    expect(offering.plans).toEqual([]);
    expect(offering.rules).toEqual([]);
  });

  it("holds the journeys' activities, flow and calls, and not the release it was read from", () => {
    expect("release" in data).toBe(false);
    const journey = data.journeys.find((item) => item.id === "bpp-new-activation")!;
    expect(journey.activities.length).toBeGreaterThan(0);
    expect(journey.flow.all.length).toBeGreaterThan(0);
    expect(Object.keys(journey.flow.byChannel).sort()).toEqual(["b2b-web", "bcrm", "smb-app"]);
    expect(journey.calls.length).toBeGreaterThan(0);
    expect(journey.activities.find((item) => item.number === "330")?.mainTrack).toBe(false);
    expect(journey.activities.find((item) => item.number === "10")?.mainTrack).toBe(true);
  });

  it("reads the delivery drop and the cross-cutting domains the service sends", () => {
    const orders = data.offerings[0]!.orderTypes;
    expect(orders.find((type) => type.code === "NEW")).toMatchObject({ priority: "P1", note: "A new Business Pro Plus subscription on a new or existing account." });
    expect(data.orderTypes.every((type) => !type.description.includes("Delivered in drop"))).toBe(true);
  });

  it("reads them from the prose of a version saved before the service sent them", () => {
    const older = structuredClone(asRelease(release));
    for (const product of older.products ?? [])
      for (const type of product.order_types) {
        if (type.delivery_drop) type.description = `${type.description ?? ""} Delivered in drop ${type.delivery_drop}.`.trim();
        type.delivery_drop = null;
      }
    for (const domain of older.landscape_domains ?? []) domain.cross_cutting = false;
    const read = fromRelease(older);
    expect(read.offerings).toEqual(data.offerings);
    expect(read.orderTypes).toEqual(data.orderTypes);
    expect(read.domains).toEqual(data.domains);
  });

  it("reads the purpose, question titles, hub and stages the service sends, and the prose of an older version alike", () => {
    const offering = data.offerings[0]!;
    expect(offering.purpose).toMatch(/^Gives a small or medium business/);
    expect(offering.components.filter((part) => part.hub).map((part) => part.id)).toEqual(["cpe"]);
    expect(offering.orderTypes.find((type) => type.code === "PORTOUT")?.stage).toBe("leave");
    const older = structuredClone(asRelease(release));
    for (const product of older.products ?? []) {
      product.proposition = `${product.proposition ?? ""}\n\n${product.purpose ?? ""}`;
      product.purpose = null;
      for (const question of product.questions) {
        question.text = `${question.title}: ${question.text}`;
        question.title = null;
      }
    }
    const read = fromRelease(older);
    expect(read.offerings.map(({ summary, purpose }) => ({ summary, purpose }))).toEqual(data.offerings.map(({ summary, purpose }) => ({ summary, purpose })));
    expect(read.findings).toEqual(data.findings);
  });

  it("takes the domains the service marks cross-cutting, not their ids, once any is marked", () => {
    const marked = structuredClone(asRelease(release));
    for (const domain of marked.landscape_domains ?? []) domain.cross_cutting = domain.id === "customer";
    expect(fromRelease(marked).domains.filter((domain) => domain.band).map((domain) => domain.id)).toEqual(["customer"]);
  });
});

describe("a journey seen through one channel", () => {
  it("keeps the channel's own steps and the shared ones, and drops the other channels'", () => {
    const digital = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const assisted = journeyView(data, "bpp-new-activation", "bcrm")!;
    const names = (view: typeof digital) => tasks(view).map((step) => step.name);
    expect(names(digital)).toContain("Browse and configure the bundle");
    expect(names(digital)).not.toContain("Capture the order from the bundle definition");
    expect(names(assisted)).toContain("Capture the order from the bundle definition");
    expect(names(assisted)).not.toContain("Browse and configure the bundle");
    // The channel's entry system performs its entry steps.
    expect(tasks(digital).find((step) => step.name === "Submit the order with the summary-order flags")?.lane).toEqual({ kind: "system", systemId: "b2b-web" });
    expect(tasks(journeyView(data, "bpp-new-activation", "smb-app")!).find((step) => step.name === "Submit the order with the summary-order flags")?.lane).toEqual({ kind: "system", systemId: "smb-app" });
    expect(digital.entry).toBe("b2b-web");
  });

  it("names the journey alone; the view composes it with the channel", () => {
    const view = journeyView(data, "bpp-new-activation", "b2b-web")!;
    expect(view.name).toBe("New activation");
    expect(viewTitle(data, view)).toBe("New activation · B2B Web");
  });

  it("says when the journey isn't offered through the channel asked for, and shows its first", () => {
    const view = journeyView(data, "bpp-new-activation", "no-such-channel")!;
    expect(view.channelMissing).toBe("no-such-channel");
    expect(view.channel).toBe("bcrm");
    expect(journeyView(data, "bpp-new-activation", "bcrm")!.channelMissing).toBeUndefined();
    expect(journeyView(data, "bpp-new-activation", null)!.channelMissing).toBeUndefined();
    // A shared journey is the same through every channel, so no channel is missing from it.
    const shared = data.journeys.find((journey) => journey.channels.length === 0)!;
    expect(journeyView(data, shared.id, "bcrm")!.channelMissing).toBeUndefined();
  });

  it("draws decisions, the parallel split and join, and start and end events", () => {
    const view = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const decision = view.steps.find((step) => step.kind === "exclusive" && step.question === "Business rules passed?");
    expect(decision?.next.map((next) => next.label).sort()).toEqual(["No", "Yes"]);
    const split = view.steps.find((step) => step.kind === "parallel" && step.gateway === "split");
    expect(split?.next).toHaveLength(6);
    const join = view.steps.find((step) => step.kind === "parallel" && step.gateway === "join");
    expect(view.steps.filter((step) => step.next.some((next) => next.to === join?.id))).toHaveLength(6);
    expect(view.steps.filter((step) => step.kind === "start")).toHaveLength(1);
    // A side track's last step ends the flow in a plain end: nothing would catch an error end.
    const returned = view.steps.find((step) => step.kind === "task" && step.name === "Order returned for correction");
    expect(returned?.next.map((next) => view.steps.find((step) => step.id === next.to)?.kind)).toEqual(["end"]);
    expect(view.steps.map((step) => step.kind)).not.toContain("error-end");
    // Events and gateways carry kinds, not words.
    for (const step of view.steps) if (step.kind !== "task") expect("name" in step, step.id).toBe(false);
    // Every arrow leads to a step of the view.
    const ids = new Set(view.steps.map((step) => step.id));
    for (const step of view.steps) for (const next of step.next) expect(ids.has(next.to), `${step.id} → ${next.to}`).toBe(true);
  });

  it("names who calls whom, through which layer, in the register", () => {
    const view = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const evaluate = view.integrations.find((call) => call.operation === "evaluateOrder" && laneKey(call.to) === "cbcm");
    expect(evaluate).toMatchObject({ from: { kind: "system", systemId: "rtf" }, style: "API", tmf: "TMF679 Product Offering Qualification" });
    const notify = view.integrations.find((call) => call.operation === "NotifyOrderCreationRequest");
    expect(notify).toMatchObject({ from: { kind: "system", systemId: "rtf" }, to: { kind: "system", systemId: "ibm-bpm" }, via: "tibco" });
    const ticket = view.integrations.find((call) => call.operation === "Service onboarding ticket");
    expect(ticket?.to).toEqual({ kind: "team", name: "MSS team" });
    expect(laneName(data, ticket!.to)).toBe("MSS team");
    expect(laneName(data, { kind: "channel" })).toBe("Ordering channel");
  });

  it("gives each call an id that is the same in every channel's view", () => {
    const ids = (channel: string) => journeyView(data, "bpp-new-activation", channel)!.integrations.filter((call) => call.step === "320").map((call) => call.id);
    expect(ids("bcrm").length).toBeGreaterThan(1);
    expect(new Set(ids("bcrm")).size).toBe(ids("bcrm").length);
    expect(ids("b2b-web")).toEqual(ids("bcrm"));
  });

  it("reads a call's timing in any case", () => {
    expect(["Sync", "sync", "SYNC"].map(modeOf)).toEqual(["sync", "sync", "sync"]);
    expect(["Async", "async"].map(modeOf)).toEqual(["async", "async"]);
    expect([null, undefined, "", "Batch"].map(modeOf)).toEqual(["not-stated", "not-stated", "not-stated", "not-stated"]);
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
      const lanes = new Set(view.steps.map((step) => laneKey(step.lane))).size;
      expect(doc.getElementsByTagName("bpmndi:BPMNShape")).toHaveLength(view.steps.length + lanes + 1);
    }
  });

  it("draws a journey with a way back: every step kept, the way back under the lanes and in the BPMN", () => {
    // No journey loops yet: New activation with one, a corrected order sent back to be resubmitted.
    const looped = structuredClone(asRelease(release));
    const journey = looped.journeys!.find((item) => item.id === "bpp-new-activation")!;
    const loop = { from_activity: "330", to_activity: "300", kind: "loop", label: "Correct & resubmit" };
    journey.flow_rules.push({ kind: "loop", from_activity: "330", to_activity: "300", condition: "Correct & resubmit" } as (typeof journey.flow_rules)[number]);
    for (const flow of [journey.edges, journey.shared_edges, ...journey.channel_edges.map((item) => item.edges)]) flow.push(loop);
    const catalogue = fromRelease(looped);
    const view = journeyView(catalogue, "bpp-new-activation", "bcrm")!;

    const layout = layoutFlow(view);
    // Every step is placed, those of the cycle among them.
    expect(layout.placed.size).toBe(view.steps.length);
    expect(layout.placed.has("300")).toBe(true);
    expect(layout.placed.has("330")).toBe(true);
    const back = layout.edges.filter((edge) => edge.back);
    expect(back.map((edge) => [edge.from, edge.to, edge.label])).toEqual([["330", "300", "Correct & resubmit"]]);
    const lanesHeight = layout.lanes.length * GEOMETRY.laneHeight;
    expect(Math.max(...back[0]!.points.map(([, y]) => y))).toBeGreaterThan(lanesHeight);
    expect(layout.height).toBeGreaterThan(lanesHeight);

    const doc = new DOMParser().parseFromString(toBpmn(catalogue, view), "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    const flow = [...doc.getElementsByTagName("bpmn:sequenceFlow")].find((item) => item.getAttribute("sourceRef")?.endsWith("330") && item.getAttribute("targetRef")?.endsWith("300"));
    expect(flow?.getAttribute("name")).toBe("Correct & resubmit");
    const lanes = new Set(view.steps.map((step) => laneKey(step.lane))).size;
    expect(doc.getElementsByTagName("bpmndi:BPMNShape")).toHaveLength(view.steps.length + lanes + 1);
  });

  it("finds a way back that closes a cycle even when it isn't marked as a loop", () => {
    const step = (id: string, next: Step["next"]): Step => ({ id, kind: "task", name: id, lane: { kind: "team", name: "a" }, next, evidence: { status: "inferred" } });
    const steps = [step("start", [{ to: "1" }]), step("1", [{ to: "2" }]), step("2", [{ to: "3" }, { to: "1" }]), step("3", [])];
    expect([...waysBack(steps)]).toEqual(["2>1"]);
    const layout = layoutFlow({ ...journeyView(data, "bpp-new-activation", "bcrm")!, steps });
    expect(layout.placed.size).toBe(4);
  });

  it("takes the service's flow for the channel chosen, the shared one for a channel no step names", () => {
    const api = asRelease(release).journeys!.find((item) => item.id === "bpp-new-activation")! as NonNullable<Release["journeys"]>[number];
    const journey = data.journeys.find((item) => item.id === api.id)!;
    const key = (edges: { from: string; to: string }[]) => edges.map((edge) => `${edge.from}>${edge.to}`).sort();
    const shape = (edges: { from_activity: string; to_activity: string }[]) => edges.map((edge) => `${edge.from_activity}>${edge.to_activity}`).sort();
    expect(key(edgesFor(journey, null))).toEqual(shape(api.edges));
    expect(key(edgesFor(journey, "bcrm"))).toEqual(shape(api.channel_edges.find((item) => item.channel_id === "bcrm")!.edges));
    expect(key(edgesFor(journey, "no-step-names-this"))).toEqual(shape(api.shared_edges));
    expect(key(edgesFor(journey, "bcrm"))).not.toEqual(key(edgesFor(journey, "b2b-web")));
  });

  it("writes the integrations as PlantUML, Mermaid and a CSV register", () => {
    const view = journeyView(data, "bpp-new-activation", "b2b-web")!;
    const plantuml = toPlantUml(data, viewTitle(data, view), view.integrations);
    expect(plantuml.startsWith("@startuml")).toBe(true);
    expect(plantuml).toContain("rtf -> cwom : createShoppingCart");
    expect(toMermaid(data, viewTitle(data, view), view.integrations).startsWith("sequenceDiagram")).toBe(true);
    const csv = toCsv(data, view.integrations).replace(/^\uFEFF/, "").split("\r\n");
    expect(csv).toHaveLength(view.integrations.length + 1);
    expect(csv[0]).toContain("TMF equivalent (hypothesis)");
  });
});
