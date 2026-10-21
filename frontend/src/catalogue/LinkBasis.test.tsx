import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { LinkBasis } from "./LinkBasis";
import type { SystemLink } from "./links";

const link = (over: Partial<SystemLink>): SystemLink => ({
  source_system_id: "web",
  target_system_id: "crm",
  kind: "calls_api",
  description: "",
  stated: null,
  interfaces: [],
  journeys: [],
  ...over,
});

const show = (value: SystemLink) =>
  render(
    <MemoryRouter>
      <LinkBasis link={value} base="/architecture" />
    </MemoryRouter>,
  );

describe("where a link is known from", () => {
  it("opens an interface at the system that exposes it, and a journey at the journey", () => {
    show(link({ interfaces: [{ id: "if-crm", name: "CRM API", systemId: "crm" }], journeys: [{ id: "new", name: "New activation", steps: 2 }] }));
    expect(screen.getByRole("link", { name: "CRM API" })).toHaveAttribute("href", "/architecture/systems/crm");
    expect(screen.getByRole("link", { name: "New activation" })).toHaveAttribute("href", "/architecture/journeys/new");
    expect(screen.getByText(/^Interface/).textContent).toBe("Interface CRM API\u00a0· Journey New activation");
  });

  it("counts more than two of a kind, and the count opens their list", () => {
    const journeys = ["a", "b", "c"].map((id) => ({ id, name: `Journey ${id}`, steps: 1 }));
    show(link({ stated: { source_system_id: "web", target_system_id: "crm", kind: "calls_api", description: "Reads" }, journeys }));
    const toggle = screen.getByRole("button", { name: "3 journeys" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Journey a" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link").map((item) => item.getAttribute("href"))).toEqual(["/architecture/journeys/a", "/architecture/journeys/b", "/architecture/journeys/c"]);
    expect(screen.getByText(/^Stated/)).toBeInTheDocument();
  });
});
