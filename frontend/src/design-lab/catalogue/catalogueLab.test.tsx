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

describe("the catalogue direction mock-ups, on the seeded Business Pro Plus catalogue", () => {
  it("draws the whole landscape as a poster and shows what a picked system talks to", async () => {
    const { container } = open("");
    expect(screen.getByRole("heading", { level: 1, name: "SMB architecture" })).toBeInTheDocument();
    expect(screen.getByText(/57 integrations/)).toBeInTheDocument();
    const map = screen.getByRole("region", { name: /SMB architecture map/ });
    expect(within(map).getAllByRole("button")).toHaveLength(46);

    await userEvent.click(within(map).getByRole("button", { name: /^CWOM,/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(within(map).getByRole("button", { name: /^CWOM,/ })).toHaveAttribute("aria-pressed", "true");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens a product with its customer value and its plans compared, prices left as a gap", async () => {
    const { container } = open("/products/business-pro-plus");
    expect(screen.getByRole("heading", { level: 1, name: "Business Pro Plus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Secure by default" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Monthly price" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lights a journey's systems on the product's architecture and steps through its calls", async () => {
    const { container } = open("/products/business-pro-plus/architecture");
    expect(screen.getByText(/Call 1 of \d+/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next call" }));
    expect(screen.getByText(/Call 2 of \d+/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Upgrade / downgrade" }));
    expect(screen.getByText(/Call 1 of \d+/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lays out a journey's flow in lanes and shows a picked step's calls", async () => {
    const { container } = open("/journeys/bpp-new-activation?channel=bcrm");
    expect(screen.getByRole("heading", { level: 1, name: /New activation · BCRM/ })).toBeInTheDocument();
    const steps = screen.getAllByRole("button", { name: /^Step \d+:/ });
    expect(steps.length).toBeGreaterThan(10);
    await userEvent.click(steps[1] as HTMLElement);
    expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
