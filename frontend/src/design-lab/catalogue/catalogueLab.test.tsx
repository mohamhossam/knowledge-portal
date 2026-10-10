import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { axe } from "../../test/axe";
import CatalogueLab from "./CatalogueLab";

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[`/design-lab/catalogue${path}`]}>
      <Routes>
        <Route path="design-lab/catalogue/*" element={<CatalogueLab />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Each test renders the whole poster and runs axe on it: slow on a busy machine.
describe("the catalogue direction mock-ups, on the seeded Business Pro Plus catalogue", { timeout: 30_000 }, () => {
  it("draws the whole landscape as a TAM wheel and shows what a picked system talks to", async () => {
    const { container } = open("?view=wheel");
    expect(screen.getByRole("heading", { level: 1, name: "SMB architecture" })).toBeInTheDocument();
    expect(document.title).toMatch(/^SMB architecture · Catalogue/);
    const map = screen.getByRole("group", { name: /SMB architecture map/ });
    const systems = within(map).getAllByRole("button");
    expect(systems).toHaveLength(46);
    // One tab stop for the whole poster.
    expect(systems.filter((button) => button.tabIndex === 0)).toHaveLength(1);

    await userEvent.click(within(map).getByRole("button", { name: /^CWOM:/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(within(map).getByRole("button", { name: /^CWOM:/ })).toHaveAttribute("aria-pressed", "true");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens on the TAM layers, with each layer's groups and systems", async () => {
    const { container } = open("");
    const layers = screen.getByRole("group", { name: /SMB architecture layers/ });
    expect(within(layers).getAllByRole("button")).toHaveLength(46);
    await userEvent.click(within(layers).getByRole("button", { name: /^CWOM:/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists every product under its place in the portfolio: how it is sold, who can buy it, its terms, what is in it", async () => {
    const { container } = open("/products");
    expect(screen.getByRole("heading", { level: 1, name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Business internet bundles/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Business Pro Plus" })).toBeInTheDocument();
    // Sold through assisted and self-service channels, never a system-initiated one such as NPS.
    expect(screen.getByText("Assisted")).toBeInTheDocument();
    expect(screen.getByText("Self-service")).toBeInTheDocument();
    expect(screen.queryByText(/^NPS/)).not.toBeInTheDocument();
    // Who can buy: the customer type, flagged as inferred.
    expect(screen.getByText("SMB customers")).toBeInTheDocument();
    expect(screen.getByText("inferred")).toBeInTheDocument();
    // Commercial terms: the contract periods as one track, the exit charge from the rules, and the price as a gap.
    expect(within(screen.getByRole("list", { name: "Contract periods" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["No contract", "1 year", "2 years"]);
    expect(screen.getByText("AED 650")).toBeInTheDocument();
    expect(screen.getByText("Price not stated")).toBeInTheDocument();
    // In the bundle: short names, optional parts marked.
    expect(screen.getByText("Fibre internet")).toBeInTheDocument();
    expect(screen.getByText("optional")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter products" }), "zzz");
    expect(screen.getByText(/No product matches/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows journey coverage by order type and product", async () => {
    const { container } = open("/journeys");
    expect(screen.getByRole("heading", { level: 1, name: "Journeys" })).toBeInTheDocument();
    const matrix = screen.getByRole("table");
    expect(within(matrix).getByRole("columnheader", { name: "Business Pro Plus" })).toBeInTheDocument();
    expect(within(matrix).getByRole("link", { name: /New activation for Business Pro Plus/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says which products use a picked system, and groups its journeys by product", async () => {
    open("?system=cwom");
    expect(screen.getByRole("heading", { level: 3, name: "Used by products" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Business Pro Plus" })).toHaveAttribute("href", expect.stringContaining("/products/business-pro-plus/architecture?system=cwom"));
  });

  it("shows the same links as a matrix, read by row and column", async () => {
    const { container } = open("?view=matrix");
    const matrix = screen.getByRole("table");
    await userEvent.click(within(matrix).getByRole("button", { name: /^CWOM/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds a system by the start of its name", async () => {
    open("");
    await userEvent.type(screen.getByRole("combobox", { name: "Find a system" }), "tib{Enter}");
    expect(screen.getByRole("heading", { level: 2, name: "TIBCO" })).toBeInTheDocument();
  });

  it("opens a product with one statement, its customer value and who can buy it, through which channels", async () => {
    const { container } = open("/products/business-pro-plus");
    expect(screen.getByRole("heading", { level: 1, name: "Business Pro Plus" })).toBeInTheDocument();
    expect(screen.getByText(/Secure by default:/)).toBeInTheDocument();
    // The bundle: the device at its heart, the parts grouped by what they do, Backup 5G optional.
    expect(screen.getByText("At the heart of the bundle")).toBeInTheDocument();
    for (const capability of ["Connectivity", "Security", "In the office", "Run and manage", "Resilience"]) expect(screen.getByRole("heading", { level: 3, name: capability })).toBeInTheDocument();
    const route = screen.getAllByRole("table").find((table) => within(table).queryByRole("rowheader", { name: /New activation/ })) as HTMLElement;
    expect(within(route).getByRole("rowheader", { name: /New activation/ })).toBeInTheDocument();
    expect(within(route).getAllByRole("img", { name: "Through BCRM" }).length).toBeGreaterThan(5);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("draws where the product sits in the portfolio, down to its plans and components", async () => {
    const { container } = open("/products/business-pro-plus/hierarchy");
    for (const level of ["Enterprise", "Fixed", "SMB", "Business internet bundles"]) expect(screen.getAllByText(level).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 2, name: /Plans/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists the plans with prices left as a gap, and filters business rules by kind", async () => {
    open("/products/business-pro-plus/plans");
    expect(screen.getByRole("rowheader", { name: "Monthly price" })).toBeInTheDocument();
  });

  it("filters business rules by what they govern", async () => {
    const { container } = open("/products/business-pro-plus/rules");
    expect(screen.getAllByRole("listitem").filter((item) => /^R\d+/.test(item.textContent ?? "")).length).toBe(20);
    await userEvent.click(screen.getByRole("button", { name: /^Billing/ }));
    expect(screen.getAllByRole("listitem").filter((item) => /^R\d+/.test(item.textContent ?? "")).length).toBe(5);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows each component with the systems that deliver it", async () => {
    const { container } = open("/products/business-pro-plus/components");
    expect(screen.getByRole("heading", { level: 3, name: "Backup 5G" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("draws the product's footprint on the architecture, with each system's role for it", async () => {
    const { container } = open("/products/business-pro-plus/architecture");
    const map = screen.getByRole("group", { name: /Business Pro Plus on the SMB architecture map/ });
    expect(within(map).getByRole("button", { name: /^CWOM:.*core to the product/ })).toBeInTheDocument();
    expect(within(map).getAllByRole("button", { name: /not used by the product/ }).length).toBeGreaterThan(0);
    await userEvent.click(within(map).getByRole("button", { name: /^CWOM:/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "What it does for the product" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lights a journey's systems on the product's architecture and steps through its calls", async () => {
    const { container } = open("/products/business-pro-plus/architecture");
    await userEvent.click(screen.getByRole("button", { name: "One journey at a time" }));
    expect(screen.getByText(/Call 1 of \d+/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Call 2 of \d+/)).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText(/Call 3 of \d+/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Upgrade / downgrade" }));
    expect(screen.getByText(/Call 1 of \d+/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lays out a journey's flow in lanes and shows a picked step's calls", async () => {
    const { container } = open("/journeys/bpp-new-activation?channel=bcrm");
    expect(screen.getByRole("heading", { level: 1, name: "Business Pro Plus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /New activation · BCRM/ })).toBeInTheDocument();
    const steps = screen.getAllByRole("button", { name: /^Step \d+:/ });
    expect(steps.length).toBeGreaterThan(10);
    await userEvent.click(steps[1] as HTMLElement);
    expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists a journey's integrations, filterable by system", async () => {
    const { container } = open("/journeys/bpp-new-activation?channel=bcrm&view=integrations");
    const register = screen.getByRole("region", { name: "Integration register" });
    const all = within(register).getAllByRole("row").length;
    await userEvent.click(screen.getByRole("button", { name: /^CWOM/ }));
    expect(within(register).getAllByRole("row").length).toBeLessThan(all);
    expect(await axe(container)).toHaveNoViolations();
  });
});
