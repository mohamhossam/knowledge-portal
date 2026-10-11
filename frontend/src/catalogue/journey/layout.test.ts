import { describe, expect, it } from "vitest";

import type { Journey } from "../../api/client";
import { ACTIVATION, BARE, ORDERING } from "./fixtures";
import { clip, flowchart, flowEdges, flowLevels, lanes, nextWords, performer, phaseSpans, stages, swimlane } from "./layout";
import { orderedSteps } from "../catalogue";

const pairs = (journey: Journey) => flowEdges(journey).map((edge) => `${edge.from}>${edge.to}:${edge.kind}`);

describe("the flow", () => {
  it("reads the service's arrows, with the interface each hand-over uses", () => {
    const edges = flowEdges(ACTIVATION);
    expect(edges.map((edge) => `${edge.from}>${edge.to}`)).toEqual(["1>2", "2>3", "3>4", "4>5"]);
    expect(edges.find((edge) => edge.from === "2")?.via).toBe("RTF SR");
  });

  it("derives the arrows from the order and the rules when the journey carries none", () => {
    expect(pairs(ORDERING)).toEqual([
      "300>320:sequence", "340>370:sequence", "460>470:sequence", "470>480:sequence",
      "320>340:decision", "320>330:decision", "330>300:loop",
      "370>380:parallel", "380>460:rejoin", "370>400:parallel", "400>460:rejoin",
    ]);
  });

  it("falls back to step order when there is no flow at all", () => {
    expect(pairs(BARE)).toEqual(["10>20:sequence", "20>30:sequence"]);
  });

  it("drops arrows to steps the journey does not have", () => {
    const broken = { ...ACTIVATION, integrations: [], edges: [{ from_activity: "1", to_activity: "99", kind: "sequence" }] } as Journey;
    expect(flowEdges(broken)).toEqual([]);
  });

  it("says where a step goes next, in words", () => {
    const edges = flowEdges(ORDERING);
    expect(nextWords(edges, "320")).toEqual(["340 if Passes evaluation", "330 if Rejected"]);
    expect(nextWords(edges, "330")).toEqual(["back to 300 if Correct and resubmit"]);
    expect(nextWords(edges, "370")).toEqual(["380 alongside", "400 alongside"]);
    expect(nextWords(edges, "380")).toEqual(["rejoins at 460"]);
    expect(nextWords(edges, "300")).toEqual(["320 via RTF Submit Order"]);
    expect(nextWords(edges, "480")).toEqual([]);
  });
});

describe("who performs a step", () => {
  const [entryStep, submit] = orderedSteps(ACTIVATION);

  it("is the performing system, then the channel's entry system, then nobody named", () => {
    expect(performer(submit!)).toMatchObject({ kind: "system", systemId: "rtf" });
    expect(performer(entryStep!)).toMatchObject({ kind: "entry", systemId: null });
    expect(performer(entryStep!, { channel: "Online", systemId: "web" })).toMatchObject({ kind: "entry", systemId: "web", key: "system:web" });
    expect(performer(orderedSteps(BARE)[2]!)).toMatchObject({ kind: "none" });
  });
});

describe("the swimlane", () => {
  it("gives each system a lane in order of first appearance, with no system named last", () => {
    expect(lanes(orderedSteps(ACTIVATION)).map((lane) => lane.key)).toEqual(["entry", "system:rtf", "system:cwom", "system:bscs", "none"]);
  });

  it("puts a channel's entry steps in its entry system's lane when one channel is read", () => {
    const list = lanes(orderedSteps(ACTIVATION), { channel: "Online", systemId: "rtf" });
    expect(list[0]).toMatchObject({ key: "system:rtf", entry: true, steps: ["1", "2"] });
  });

  it("places one step per column, under its phase runs", () => {
    const layout = swimlane(ORDERING);
    expect(layout.boxes.map((box) => box.x)).toEqual([...layout.boxes.keys()].map((index) => index * 192 + 16));
    expect(layout.phases.map((span) => [span.phase, span.start, span.span])).toEqual([
      ["Capture", 0, 1], ["Validate", 1, 3], ["Orchestrate", 4, 1], ["Fulfil", 5, 2], ["Bill and close", 7, 3],
    ]);
    expect(layout.hasPhases).toBe(true);
    expect(layout.width).toBe(10 * 192);
  });

  it("routes a loop back over the boxes, and forward arrows between them", () => {
    const layout = swimlane(ORDERING);
    expect(layout.arrows.find((arrow) => arrow.from === "330")).toMatchObject({ back: true, kind: "loop" });
    expect(layout.arrows.find((arrow) => arrow.from === "300")?.path).toMatch(/^M 176 /);
  });

  it("marks a phase the journey comes back to", () => {
    const steps = orderedSteps({ ...BARE, activities: BARE.activities.map((step, index) => ({ ...step, phase: index === 1 ? "Stop" : "Capture" })) });
    expect(phaseSpans(steps).map((span) => span.again)).toEqual([false, false, true]);
  });

  it("has no phase row when no step names a phase", () => {
    expect(swimlane(BARE).hasPhases).toBe(false);
  });

  it("keeps a lane per system however many there are", () => {
    const many = {
      ...BARE,
      activities: Array.from({ length: 12 }, (_, index) => ({ ...BARE.activities[1]!, number: String((index + 1) * 10), performing_system_id: `s${index}` })),
    } as Journey;
    const layout = swimlane(many);
    expect(layout.lanes).toHaveLength(12);
    expect(layout.height).toBe(12 * 168);
  });
});

describe("the flowchart", () => {
  it("levels steps along the flow: branches side by side, loops not pushing levels", () => {
    const levels = flowLevels(orderedSteps(ORDERING), flowEdges(ORDERING));
    expect(Object.fromEntries(levels)).toEqual({ 300: 0, 320: 1, 330: 2, 340: 2, 370: 3, 380: 4, 400: 4, 460: 5, 470: 6, 480: 7 });
  });

  it("marks decisions, forks and joins, and labels the branches", () => {
    const chart = flowchart(ORDERING);
    const node = (number: string) => chart.nodes.find((item) => item.number === number)!;
    expect(node("320").decision).toBe(true);
    expect(node("370").fork).toBe(true);
    expect(node("460").join).toBe(true);
    expect(chart.bars).toHaveLength(2);
    expect(chart.labels.map((label) => label.text)).toEqual(expect.arrayContaining(["Back to 300: Correct…", "Passes evaluation", "Rejected"]));
    expect(node("380").y).toBe(node("400").y);
    expect(node("380").x).not.toBe(node("400").x);
  });

  it("follows the step order when no flow is recorded", () => {
    const chart = flowchart(BARE);
    expect(chart.nodes.map((node) => node.level)).toEqual([0, 1, 2]);
    expect(chart.levels).toBe(3);
  });

  it("is empty for a journey with no steps", () => {
    expect(flowchart({ ...BARE, activities: [] })).toMatchObject({ nodes: [], height: 0 });
  });

  it("clips a long label with an ellipsis", () => {
    expect(clip("Short", 10)).toBe("Short");
    expect(clip("A label far too long", 10)).toBe("A label f…");
  });
});

describe("the stage timeline", () => {
  it("gathers each phase's steps in the order the journey reaches it", () => {
    const list = stages(ORDERING);
    expect(list.map((stage) => [stage.phase, stage.steps.length])).toEqual([
      ["Capture", 1], ["Validate", 3], ["Orchestrate", 1], ["Fulfil", 2], ["Bill and close", 3],
    ]);
    expect(list[1]!.performers.map((who) => who.key)).toEqual(["system:rtf", "none"]);
  });

  it("puts every step in one stage when no phase is named", () => {
    expect(stages(BARE)).toEqual([expect.objectContaining({ phase: null, steps: expect.any(Array) })]);
    expect(stages(BARE)[0]!.steps).toHaveLength(3);
  });
});
