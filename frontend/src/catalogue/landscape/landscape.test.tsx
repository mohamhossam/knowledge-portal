import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Release } from "../../api/client";
import { checkAxeAfterEach } from "../../test/axe";
import release from "../model/fixtures/smb-release.json";
import { asRelease } from "../model/sample";
import { LandscapePoster } from "./LandscapePoster";

checkAxeAfterEach();

function Address() {
  const { search } = useLocation();
  return <output aria-label="Address">{search}</output>;
}

function open(given: Release, search = "") {
  render(
    <MemoryRouter initialEntries={[`/architecture/domains${search}`]}>
      <Routes>
        <Route path="architecture/domains" element={<><LandscapePoster release={given} base="/architecture" /><Address /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("where systems sit, drawn (catalogue merge, step 2)", () => {
  const smb = asRelease(release);

  it("draws every layer with its systems, and counts them all in the layer filter", () => {
    open(smb);
    const map = screen.getByRole("group", { name: /layers: 46 systems in/ });
    expect(within(map).getByRole("button", { name: /^BSCS:/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All layers/ })).toHaveTextContent("46");
  });

  it("lists the systems placed in no layer under the map, never leaving them out", () => {
    const loose = { ...smb, systems: smb.systems.map((system) => (system.id === "bscs" ? { ...system, landscape_domain_id: null } : system)) };
    open(loose);
    expect(screen.getByRole("button", { name: /All layers/ })).toHaveTextContent("45");
    expect(screen.getByText("1 system is in no layer yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("1 system is in no layer yet"));
    fireEvent.click(screen.getByRole("button", { name: "BSCS" }));
    expect(screen.getByRole("complementary", { name: "BSCS" })).toHaveTextContent("In no layer yet");
  });

  it("shows a picked system beside the map, with its links and the way to its full record", () => {
    open(smb);
    fireEvent.click(screen.getByRole("button", { name: /^BSCS:/ }));
    const summary = screen.getByRole("complementary", { name: "BSCS" });
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent("?system=bscs");
    expect(within(summary).getByRole("link", { name: "Open the full record of BSCS" })).toHaveAttribute("href", "/architecture/systems/bscs");
    const linked = within(summary).getByRole("list", { name: "Systems linked to BSCS" });
    const first = within(linked).getAllByRole("button")[0]!;
    const name = first.textContent ?? "";
    // A linked system opens in its place, and Escape closes the summary.
    fireEvent.click(first);
    expect(screen.getByRole("complementary", { name })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("complementary", { name }), { key: "Escape" });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("keeps one layer in focus from the filter, in the address", () => {
    open(smb);
    const filter = screen.getByRole("group", { name: "Layer" });
    const resource = within(filter).getAllByRole("button").find((button) => /^Resource/.test(button.textContent ?? ""))!;
    fireEvent.click(resource);
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent("?layer=resource");
    expect(resource).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelectorAll(".am-layer.is-dim").length).toBeGreaterThan(0);
    expect(document.querySelector(".am-layer--resource")).not.toHaveClass("is-dim");
  });
});
