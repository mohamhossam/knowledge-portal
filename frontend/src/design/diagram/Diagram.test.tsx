import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CWOM_EDGES, CWOM_LANES, CWOM_NODES, OWNERSHIP_EDGES, OWNERSHIP_NODES } from "../../design-lab/gallery/diagramExamples";
import { checkAxeAfterEach } from "../../test/axe";
import { Diagram, DiagramLegend } from "./Diagram";
import { layered, tree } from "./layout";

checkAxeAfterEach();

const context = layered(CWOM_NODES, CWOM_EDGES, { lanes: CWOM_LANES });
const ownership = tree(OWNERSHIP_NODES, OWNERSHIP_EDGES);

describe("Diagram with nothing to open", () => {
  it("is one named image in a figure, in a region that scrolls by keyboard", () => {
    render(<Diagram label="Who runs what" caption="Ownership tree" layout={ownership} />);
    expect(screen.getByRole("figure", { name: "Ownership tree" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Who runs what" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Who runs what (scrolls)" })).toHaveAttribute("tabindex", "0");
    expect(screen.queryAllByRole("button", { name: /squad/ })).toEqual([]);
  });

  it("draws every node, its state in words, and every edge", () => {
    const { container } = render(<Diagram label="Who runs what" layout={ownership} />);
    expect(container.querySelectorAll(".ds-diagram__node")).toHaveLength(OWNERSHIP_NODES.length);
    expect(container.querySelectorAll(".ds-diagram__line")).toHaveLength(OWNERSHIP_EDGES.length);
    const bscs = container.querySelector('[data-node="bscs"]')!;
    expect(bscs).toHaveAttribute("data-tone", "gap");
    expect(bscs.textContent).toContain("No squad");
  });
});

describe("Diagram with nodes to open", () => {
  it("is a named group whose nodes are buttons with their whole name", () => {
    render(<Diagram label="CWOM in context" layout={context} onActivate={() => {}} />);
    const group = screen.getByRole("group", { name: "CWOM in context" });
    expect(group).toHaveAttribute("aria-roledescription", "diagram");
    expect(within(group).getByRole("button", { name: "CWOM, Order orchestration" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "BSCS, Billing, No squad" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "CWOM in context" })).not.toBeInTheDocument();
  });

  it("is one tab stop, starting on the subject, and arrows move between nodes", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Diagram label="CWOM in context" layout={context} onActivate={() => {}} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Before" }));
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "CWOM, Order orchestration" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "RTF, Order orchestration" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("button", { name: /^WFM/ })).toHaveFocus();
    await user.keyboard("{End}");
    const nodes = screen.getAllByRole("button").filter((button) => button.getAttribute("data-node"));
    expect(nodes.filter((node) => node.getAttribute("tabindex") === "0")).toHaveLength(1);
    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "RTF, Order orchestration" })).toHaveFocus();
  });

  it("opens a node with Enter, Space or a click", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Diagram label="CWOM in context" layout={context} onActivate={onActivate} />);
    const cwom = screen.getByRole("button", { name: "CWOM, Order orchestration" });
    cwom.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: /^Felix/ }));
    expect(onActivate.mock.calls.map(([node]) => node.id)).toEqual(["cwom", "cwom", "felix"]);
  });

  it("makes a node with an href a link, even without onActivate", () => {
    const linked = layered([{ id: "a", label: "Order Hub", href: "/catalogue/systems/order-hub" }, { id: "b", label: "CWOM" }], [{ from: "a", to: "b" }]);
    render(<Diagram label="Two systems" layout={linked} />);
    expect(screen.getByRole("link", { name: "Order Hub" })).toHaveAttribute("href", "/catalogue/systems/order-hub");
    expect(screen.queryByRole("button", { name: "CWOM" })).not.toBeInTheDocument();
  });

  it("shows every word of a long label, and each word it shows is in the node's name, in order (WCAG 2.5.3)", () => {
    const name = "Network / SIM / Device / Number Inventory, Network and resources (sample), In this order";
    const long = layered(
      [{ id: "inv", label: "Network / SIM / Device / Number Inventory", detail: "Network and resources (sample)", status: "In this order", href: "/catalogue/systems/inv" }, { id: "b", label: "B" }],
      [{ from: "inv", to: "b" }],
      { nodeWidth: 148 },
    );
    render(<Diagram label="Inventory" layout={long} />);
    const link = screen.getByRole("link", { name });
    // The text a speech user reads off the box, as axe joins it: the drawn lines, title aside.
    const shown = [...link.childNodes].filter((child) => child.nodeName !== "title").map((child) => child.textContent).join("");
    const words = (text: string) => text.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z0-9]+/).filter(Boolean);
    expect(words(shown).slice(0, 5)).toEqual(words("Network / SIM / Device / Number Inventory"));
    expect(words(name).join(" ")).toContain(words(shown).join(" "));
  });
});

describe("Show as table", () => {
  it("swaps the drawing for a table of every node, and back", async () => {
    const user = userEvent.setup();
    render(<Diagram label="CWOM in context" layout={context} />);
    const toggle = screen.getByRole("button", { name: "Show as table" });
    expect(toggle).not.toHaveAttribute("aria-pressed");

    await user.click(toggle);
    // The same button, now naming the way back; focus stays on it.
    expect(toggle).toHaveAccessibleName("Show as drawing");
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: "CWOM in context" });
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["RTF", "CWOM", "Felix", "eVEDA", "WFM", "BSCS", "CNS"]);
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Name", "Lane", "Details", "Goes to", "Comes from"]);
    const cwom = within(table).getByRole("rowheader", { name: "CWOM" }).closest("tr")!;
    expect(cwom.textContent).toContain("BSCS (sends data)");
    expect(cwom.textContent).toContain("RTF (orchestrates)");

    await user.click(toggle);
    expect(screen.getByRole("img", { name: "CWOM in context" })).toBeInTheDocument();
  });

  it("takes its own headings, and opens nodes from the table too", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Diagram label="Who runs what" layout={ownership} startAsTable headers={{ to: "Has", from: "Part of" }} onActivate={onActivate} />);
    const table = screen.getByRole("table", { name: "Who runs what" });
    expect(within(table).getByRole("columnheader", { name: "Part of" })).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "CWOM" }));
    expect(onActivate.mock.calls[0]?.[0].id).toBe("cwom");
  });

  it("shows a screen's own table instead of its own, when given one", async () => {
    const user = userEvent.setup();
    render(<Diagram label="CWOM in context" layout={context} table={<table><caption>Every connection</caption><tbody><tr><td>For what</td></tr></tbody></table>} />);
    await user.click(screen.getByRole("button", { name: "Show as table" }));
    expect(screen.getByRole("table", { name: "Every connection" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "CWOM in context" })).not.toBeInTheDocument();
  });

  it("reads a node that toggles something as a pressed button, drawn and in the table", async () => {
    const user = userEvent.setup();
    const toggled = layered([{ id: "a", label: "On", pressed: true }, { id: "b", label: "Off", pressed: false }], []);
    render(<Diagram label="Filters" layout={toggled} onActivate={() => {}} />);
    expect(screen.getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Show as table" }));
    expect(within(screen.getByRole("table", { name: "Filters" })).getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DiagramLegend", () => {
  it("says what each mark means in words, the marks hidden from assistive tech", () => {
    const { container } = render(<DiagramLegend items={[["gap", "Dashed frame: no squad runs it"], ["dashed", "Dashed line: not stated"]]} />);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Dashed frame: no squad runs it", "Dashed line: not stated"]);
    expect(container.querySelector('[data-tone="gap"]')).not.toBeNull();
  });
});
