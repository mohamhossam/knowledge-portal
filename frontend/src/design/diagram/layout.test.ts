import { describe, expect, it } from "vitest";

import { CWOM_EDGES, CWOM_LANES, CWOM_NODES, OWNERSHIP_EDGES, OWNERSHIP_NODES } from "../../design-lab/gallery/diagramExamples";
import { DIAGRAM, diagramRows, fit, layered, longestPathLevels, nearest, nodeHeightFor, nodeLines, readingOrder, textWidth, tree, wrap } from "./layout";
import type { DiagramLayout, DiagramNode, PlacedNode } from "./types";

const nodes = (...ids: string[]): DiagramNode[] => ids.map((id) => ({ id, label: id.toUpperCase() }));
const at = (layout: DiagramLayout, id: string): PlacedNode => layout.nodes.find((node) => node.id === id)!;

function overlaps(a: PlacedNode, b: PlacedNode) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function noOverlaps(layout: DiagramLayout) {
  for (const [i, a] of layout.nodes.entries()) for (const b of layout.nodes.slice(i + 1)) expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
}

function inside(layout: DiagramLayout) {
  for (const node of layout.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
    expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
  }
}

describe("longestPathLevels", () => {
  it("puts each node one column after the longest path to it", () => {
    const levels = longestPathLevels(nodes("a", "b", "c", "d"), [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "d", to: "c" },
    ]);
    expect(Object.fromEntries(levels)).toEqual({ a: 0, b: 1, c: 2, d: 0 });
  });

  it("ignores the edge that closes a cycle instead of looping", () => {
    const levels = longestPathLevels(nodes("a", "b", "c"), [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ]);
    expect(Object.fromEntries(levels)).toEqual({ a: 0, b: 1, c: 2 });
  });
});

describe("layered", () => {
  it("runs left to right along the edges, and routes each edge from right side to left side", () => {
    const layout = layered(nodes("a", "b", "c"), [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(at(layout, "a").x).toBeLessThan(at(layout, "b").x);
    expect(at(layout, "b").x).toBeLessThan(at(layout, "c").x);
    const [edge] = layout.edges;
    const a = at(layout, "a");
    const b = at(layout, "b");
    expect(edge!.back).toBe(false);
    expect(edge!.path.startsWith(`M ${a.x + a.width} ${a.y + a.height / 2} C`)).toBe(true);
    expect(edge!.path.endsWith(`${b.x} ${b.y + b.height / 2}`)).toBe(true);
  });

  it("places nodes in the lanes they name, and draws each lane with its heading", () => {
    const layout = layered(CWOM_NODES, CWOM_EDGES, { lanes: CWOM_LANES });
    expect(at(layout, "rtf").level).toBe(0);
    expect(at(layout, "cwom").level).toBe(1);
    expect(["felix", "service-activation", "wfm", "bscs", "cns"].map((id) => at(layout, id).level)).toEqual([2, 2, 2, 2, 2]);
    expect(layout.lanes.map((lane) => lane.label)).toEqual(["Calls CWOM", "System", "CWOM calls"]);
    for (const node of layout.nodes) {
      const lane = layout.lanes[node.level]!;
      expect(node.x).toBeGreaterThan(lane.x);
      expect(node.x + node.width).toBeLessThan(lane.x + lane.width);
      expect(node.y).toBeGreaterThanOrEqual(DIAGRAM.pad + DIAGRAM.laneHead);
    }
    noOverlaps(layout);
    inside(layout);
  });

  it("centres a short column against the tallest", () => {
    const layout = layered(CWOM_NODES, CWOM_EDGES, { lanes: CWOM_LANES });
    const called = layout.nodes.filter((node) => node.level === 2);
    const middle = (called[0]!.y + called[called.length - 1]!.y) / 2;
    expect(at(layout, "cwom").y).toBeCloseTo(middle);
    expect(at(layout, "rtf").y).toBeCloseTo(middle);
  });

  it("gives every node one height, taller when any has a second line", () => {
    expect(new Set(layered(nodes("a", "b"), []).nodes.map((node) => node.height))).toEqual(new Set([DIAGRAM.nodeHeight]));
    const detailed = layered([{ id: "a", label: "A", detail: "System" }, { id: "b", label: "B" }], []);
    expect(new Set(detailed.nodes.map((node) => node.height))).toEqual(new Set([DIAGRAM.nodeHeightDetail]));
  });

  it("orders a column so edges cross less", () => {
    // In input order the right column is [y, x], which crosses a→x and b→y.
    const layout = layered(nodes("a", "b", "y", "x"), [
      { from: "a", to: "x" },
      { from: "b", to: "y" },
    ]);
    expect(at(layout, "a").y).toBeLessThan(at(layout, "b").y);
    expect(at(layout, "x").y).toBeLessThan(at(layout, "y").y);
  });

  it("boxes grouped nodes in containers that hold them and never meet", () => {
    const grouped: DiagramNode[] = [
      { id: "a", label: "A", group: "one" },
      { id: "b", label: "B", group: "one" },
      { id: "c", label: "C", group: "two" },
      { id: "d", label: "D" },
    ];
    const layout = layered(grouped, [{ from: "a", to: "b" }, { from: "c", to: "d" }], {
      containers: [{ id: "one", label: "One" }, { id: "two", label: "Two" }, { id: "empty", label: "Empty" }],
    });
    expect(layout.containers.map((box) => box.label)).toEqual(["One", "Two"]);
    for (const node of layout.nodes.filter((node) => node.group)) {
      const box = layout.containers.find((candidate) => candidate.id === node.group)!;
      expect(node.x).toBeGreaterThan(box.x);
      expect(node.y).toBeGreaterThan(box.y + DIAGRAM.containerHead - 1);
      expect(node.x + node.width).toBeLessThan(box.x + box.width);
      expect(node.y + node.height).toBeLessThan(box.y + box.height);
    }
    const [one, two] = layout.containers;
    expect(one!.y + one!.height).toBeLessThan(two!.y);
    expect(at(layout, "d").y).toBeGreaterThan(two!.y + two!.height);
    noOverlaps(layout);
    inside(layout);
  });

  it("routes an edge back up and over, never through the nodes between", () => {
    const layout = layered(nodes("a", "b"), [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ]);
    const back = layout.edges.find((edge) => edge.from === "b")!;
    expect(back.back).toBe(true);
    expect(back.labelAt.y).toBeLessThan(Math.min(at(layout, "a").y, at(layout, "b").y));
  });

  it("drops edges to unknown nodes, to themselves, and repeats", () => {
    const layout = layered(nodes("a", "b"), [
      { from: "a", to: "b" },
      { from: "a", to: "b" },
      { from: "a", to: "a" },
      { from: "a", to: "zz" },
    ]);
    expect(layout.edges).toHaveLength(1);
  });

  it("lays out nothing as an empty drawing", () => {
    const layout = layered([], []);
    expect(layout.nodes).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe("tree", () => {
  const layout = tree(OWNERSHIP_NODES, OWNERSHIP_EDGES);

  it("puts each depth in its own column, left to right", () => {
    expect(at(layout, "retail").level).toBe(0);
    expect(at(layout, "fibre-ordering").level).toBe(1);
    expect(at(layout, "cwom").level).toBe(2);
    expect(at(layout, "cwom:squad").level).toBe(3);
    expect(at(layout, "cwom").x).toBeLessThan(at(layout, "cwom:squad").x);
  });

  it("sits each parent level with the middle of its first and last child", () => {
    const fibre = at(layout, "fibre-ordering");
    const first = at(layout, "b2b-web");
    const last = at(layout, "bscs");
    expect(fibre.y).toBeCloseTo((first.y + last.y) / 2);
  });

  it("stacks the roots in input order without overlaps", () => {
    expect(at(layout, "retail").y).toBeLessThan(at(layout, "business").y);
    expect(at(layout, "business").y).toBeLessThan(at(layout, "unplaced").y);
    noOverlaps(layout);
    inside(layout);
  });

  it("draws parent-to-child edges as elbows that share a trunk", () => {
    const fromFibre = layout.edges.filter((edge) => edge.from === "fibre-ordering");
    const trunks = new Set(fromFibre.map((edge) => edge.path.split(" H ")[1]?.split(" ")[0]));
    expect(fromFibre).toHaveLength(5);
    expect(trunks.size).toBe(1);
    expect(fromFibre.every((edge) => / V /.test(edge.path))).toBe(true);
  });

  it("places a node with two parents once, under the first, and survives a cycle", () => {
    const shared = tree(nodes("a", "b", "c"), [
      { from: "a", to: "c" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ]);
    expect(shared.nodes).toHaveLength(3);
    expect(shared.edges).toHaveLength(3);
    noOverlaps(shared);
  });
});

describe("reading a layout", () => {
  const layout = layered(CWOM_NODES, CWOM_EDGES, { lanes: CWOM_LANES });

  it("moves to the nearest node in the arrow's direction, staying put at an edge", () => {
    expect(nearest(layout.nodes, "rtf", "right")).toBe("cwom");
    expect(nearest(layout.nodes, "cwom", "left")).toBe("rtf");
    expect(nearest(layout.nodes, "rtf", "left")).toBe("rtf");
    const called = readingOrder(layout.nodes).filter((node) => node.level === 2).map((node) => node.id);
    expect(nearest(layout.nodes, called[0]!, "down")).toBe(called[1]);
    expect(nearest(layout.nodes, called[1]!, "up")).toBe(called[0]);
    expect(nearest(layout.nodes, "cwom", "right")).toBe(called[2]);
  });

  it("reads column by column, top to bottom", () => {
    const order = readingOrder(layout.nodes).map((node) => node.id);
    expect(order.slice(0, 2)).toEqual(["rtf", "cwom"]);
    expect(order).toHaveLength(CWOM_NODES.length);
  });

  it("lists each node with its lane and what it links to and from", () => {
    const rows = diagramRows(layout);
    const cwom = rows.find((row) => row.node.id === "cwom")!;
    expect(cwom.lane).toBe("System");
    expect(cwom.from.map((item) => [item.node.label, item.label])).toEqual([["RTF", "orchestrates"]]);
    expect(cwom.to).toHaveLength(5);
    expect(cwom.to.find((item) => item.node.id === "bscs")?.label).toBe("sends data");
  });

  it("cuts a long label to the box with an ellipsis, and leaves a short one alone", () => {
    expect(fit("CWOM", 150, 15)).toBe("CWOM");
    const cut = fit("Fibre bundle ordering for business customers", 150, 15);
    expect(cut.endsWith("…")).toBe(true);
    expect(textWidth(cut, 15)).toBeLessThanOrEqual(150);
    // Between words: every word it keeps is a whole word of the text, in order.
    expect("Fibre bundle ordering for business customers".startsWith(`${cut.slice(0, -1)} `)).toBe(true);
    const dated = fit("September landscape and offerings (sample)", 230, 14);
    expect("September landscape and offerings (sample)".startsWith(`${dated.slice(0, -1)} `)).toBe(true);
    expect(textWidth(fit("WWWWWWWWWWWWWWWWWWWW", 150, 15), 15)).toBeLessThanOrEqual(150);
  });
});

describe("layered, aligned to the start", () => {
  it("tops every column instead of centring the shorter ones", () => {
    const nodes = [
      { id: "a", label: "A", lane: "one" },
      { id: "b", label: "B", lane: "one" },
      { id: "c", label: "C", lane: "two" },
    ];
    const lanes = [{ id: "one", label: "One" }, { id: "two", label: "Two" }];
    const centred = layered(nodes, [], { lanes });
    const topped = layered(nodes, [], { lanes, align: "start" });
    const y = (layout: typeof centred, id: string) => layout.nodes.find((node) => node.id === id)!.y;
    expect(y(centred, "c")).toBeGreaterThan(y(centred, "a"));
    expect(y(topped, "c")).toBe(y(topped, "a"));
  });
});


describe("fitting a layout to the screen", () => {
  const chain = (count: number) => {
    const ids = Array.from({ length: count }, (_, at) => `n${at}`);
    return { nodes: nodes(...ids), edges: ids.slice(1).map((id, at) => ({ from: ids[at]!, to: id })) };
  };

  it("closes its gaps to fit the width it has, and keeps them as they were without one", () => {
    const { nodes: four, edges } = chain(4);
    expect(layered(four, edges).width).toBeGreaterThan(800);
    const fitted = layered(four, edges, { fitWidth: 800 });
    expect(fitted.width).toBeLessThanOrEqual(800);
    noOverlaps(fitted);
    inside(fitted);
  });

  it("never closes a gap past the label on its edge", () => {
    const label = "orchestrates";
    const fitted = layered(nodes("a", "b", "c"), [{ from: "a", to: "b", label }, { from: "b", to: "c" }], { fitWidth: 480 });
    const gapAB = at(fitted, "b").x - (at(fitted, "a").x + at(fitted, "a").width);
    const gapBC = at(fitted, "c").x - (at(fitted, "b").x + at(fitted, "b").width);
    expect(gapAB).toBeGreaterThanOrEqual(textWidth(label, 14));
    expect(gapBC).toBeLessThan(gapAB);
  });

  it("narrows its nodes and wraps their words when that makes it fit", () => {
    const wide: DiagramNode[] = [
      { id: "a", label: "Business fibre bundle (sample)", detail: "Fixed broadband" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ];
    const fitted = layered(wide, [{ from: "a", to: "b" }, { from: "b", to: "c" }], { fitWidth: 520 });
    expect(fitted.width).toBeLessThanOrEqual(520);
    expect(at(fitted, "a").width).toBeLessThan(DIAGRAM.nodeWidth);
    // Its label wraps whole, never cut, and the box is tall enough for every line.
    const { label, second } = nodeLines(wide[0]!, at(fitted, "a").width);
    expect(label.join(" ")).toBe(wide[0]!.label);
    expect(at(fitted, "a").height).toBe(nodeHeightFor(label.length + second.length));
  });

  it("keeps its nodes' width when even the narrowest would not fit: it scrolls instead", () => {
    const { nodes: nine, edges } = chain(9);
    const fitted = layered(nine, edges, { fitWidth: 600 });
    expect(fitted.width).toBeGreaterThan(600);
    expect(at(fitted, "n0").width).toBe(DIAGRAM.nodeWidth);
  });

  it("widens its nodes into room to spare until their words fit on one line", () => {
    const long: DiagramNode[] = [{ id: "a", label: "A", detail: "Customer channels (sample)" }, { id: "b", label: "B" }];
    const natural = layered(long, [{ from: "a", to: "b" }], { nodeWidth: 148 });
    const fitted = layered(long, [{ from: "a", to: "b" }], { nodeWidth: 148, fitWidth: 1200 });
    expect(natural.nodes[0]!.height).toBe(nodeHeightFor(3));
    expect(at(fitted, "a").width).toBeGreaterThan(148);
    expect(at(fitted, "a").height).toBe(nodeHeightFor(2));
  });

  it("fits a tree too, its gaps kept even", () => {
    const fitted = tree(OWNERSHIP_NODES, OWNERSHIP_EDGES, { fitWidth: 640 });
    expect(fitted.width).toBeLessThanOrEqual(Math.max(640, tree(OWNERSHIP_NODES, OWNERSHIP_EDGES).width));
    noOverlaps(fitted);
  });
});

describe("nodeLines", () => {
  it("never cuts a label: it takes as many lines as it needs, and only the second line ends in an ellipsis", () => {
    const node = { id: "inv", label: "Network / SIM / Device / Number Inventory", detail: "Network and resources (sample)", status: "In this order" };
    const { label, second } = nodeLines(node, 148);
    expect(label.length).toBeGreaterThan(2);
    expect(label.join(" ")).toBe(node.label);
    expect(second).toHaveLength(2);
    expect(second[1]!.endsWith("…")).toBe(true);
  });

  it("makes every node of a layout tall enough for the longest label", () => {
    const nodes: DiagramNode[] = [{ id: "inv", label: "Network / SIM / Device / Number Inventory", detail: "System" }, { id: "b", label: "B" }];
    const { label } = nodeLines(nodes[0]!, 148);
    const placed = layered(nodes, [{ from: "inv", to: "b" }], { nodeWidth: 148 });
    expect(at(placed, "inv").height).toBe(nodeHeightFor(label.length + 1));
    expect(at(placed, "b").height).toBe(at(placed, "inv").height);
  });
});

describe("wrap", () => {
  it("breaks between words onto two lines, and ends the second in an ellipsis past that", () => {
    expect(wrap("Short", 200, 14)).toEqual(["Short"]);
    const lines = wrap("Customer channels (sample) › Digital channels › Web", 140, 14);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });
});
