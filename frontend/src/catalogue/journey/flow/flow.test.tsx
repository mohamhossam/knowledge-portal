import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Release } from "../../../api/client";
import { checkAxeAfterEach } from "../../../test/axe";
import { catalogue } from "../../catalogue";
import { JourneysPage } from "../../JourneysPage";
import release from "../../model/fixtures/smb-release.json";
import { asRelease } from "../../model/sample";
import type { CatalogueContext } from "../../useCatalogue";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

// The committed SMB catalogue: Business Pro Plus's new activation, 27 steps and 31 calls, through three channels.
// The views load in their own chunk: under a full run, the first one can take more than a second.
const LAZY = { timeout: 5000 };
const RELEASE = { ...asRelease(release), status: "published" } as Release;

function Address() {
  const { search } = useLocation();
  return <output aria-label="Address">{search}</output>;
}

function open(search: string) {
  cleanup();
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: true, editable: false, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/architecture/journeys/bpp-new-activation${search}`]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="journeys/:journeyId" element={<><JourneysPage /><Address /></>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the lab's journey flow in the journey record (catalogue merge, step 4)", () => {
  it("draws the process flow, and picks a step from All steps, one Tab stop per step", async () => {
    open("?view=flow");
    expect(await screen.findByRole("region", { name: "New activation, process flow (scrolls)" }, LAZY)).toBeInTheDocument();
    const all = screen.getByRole("region", { name: "New activation, process flow (scrolls)" }).closest(".jf")!;
    const steps = within(all.querySelector(".jf-allsteps") as HTMLElement).getAllByRole("button");
    // In the flow, steps answer a pointer; All steps is the keyboard's way through.
    for (const task of all.querySelectorAll(".jf-task")) expect(task).toHaveAttribute("tabindex", "-1");
    fireEvent.click(steps[2]!);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(new RegExp(`^Step 3 of ${steps.length}`))).toBeInTheDocument();
  });

  it("reads the journey in one channel at a time, in the address", async () => {
    open("?view=flow");
    const channel = (await screen.findByRole("combobox", { name: "Channel" }, LAZY)) as HTMLSelectElement;
    expect(channel.options.length).toBe(3);
    fireEvent.change(channel, { target: { value: channel.options[1]!.value } });
    expect(screen.getByRole("status", { name: "Address" })).toHaveTextContent(`channel=${channel.options[1]!.value}`);
  });

  it("steps through the calls in order, and shows them as a register", async () => {
    open("?view=integrations");
    expect(await screen.findByText(/^Call 1 of \d+$/, undefined, LAZY)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/^Call 2 of \d+$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table", { name: /^Calls of / });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(2);
  });

  it("exports the journey as BPMN, PlantUML, Mermaid and the register as CSV", async () => {
    const made = vi.fn(() => "blob:journey");
    Object.assign(URL, { createObjectURL: made, revokeObjectURL: vi.fn() });
    open("");
    fireEvent.click(await screen.findByText("Export", undefined, LAZY));
    const items = screen.getAllByRole("button", { name: /^Download / });
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent(/^Download BPMN 2\.0/);
    expect(items[3]).toHaveTextContent(/^Download the call register/);
    fireEvent.click(items[0]!);
    expect(made).toHaveBeenCalledTimes(1);
  });
});
