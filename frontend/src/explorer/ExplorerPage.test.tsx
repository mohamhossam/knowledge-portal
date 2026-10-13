import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type CatalogPlans } from "../api/client";
import { ExplorerPage, NOT_YET } from "./ExplorerPage";
import { EXPLORED, PLANS } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.search}</p>;
}

function open(path = "/explorer", linkSystems = false, plans: () => Promise<CatalogPlans> = async () => PLANS, release = EXPLORED) {
  vi.spyOn(api, "explorerRelease").mockResolvedValue(release);
  vi.spyOn(api, "explorerPlans").mockImplementation(plans);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="explorer" element={<><ExplorerPage linkSystems={linkSystems} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ExplorerPage", () => {
  it("opens on the first scenario with a journey and names the version it reads", async () => {
    open();
    expect(await screen.findByRole("heading", { level: 2, name: "Business Pro Plus: New Activation, through Online" })).toBeInTheDocument();
    expect(screen.getByText("‘October’")).toBeInTheDocument();
    expect(screen.getByText("Business Pro Plus new activation")).toBeInTheDocument();
  });

  it("lists the systems in the order, what each does, and how many steps", async () => {
    open();
    const table = within(await screen.findByRole("table", { name: /Systems that take part/ }));
    const rows = table.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getByRole("rowheader").textContent)).toEqual(["B2B Web", "RTF", "CWOM", "WFM"]);
    expect(rows[0]).toHaveTextContent("Performs step 1");
    expect(rows[0]).toHaveTextContent("Supports step 2");
    expect(rows[3]).toHaveTextContent("Responsible for a part; no step names it");
    expect(rows[3]).toHaveTextContent("Fulfilment for Broadband");
  });

  it("draws the journey as swimlanes by default, with its steps as a table too", async () => {
    open();
    expect(await screen.findByRole("tab", { name: "Swimlane", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: /Steps of Business Pro Plus new activation/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Flowchart" }));
    expect(screen.getByTestId("where")).toHaveTextContent("view=flowchart");
  });

  it("says what the catalogue does not say, as due lines", async () => {
    open();
    const section = within((await screen.findByRole("heading", { name: /^What the catalogue does not say yet/ })).closest("section")!);
    expect(section.getByText(NOT_YET)).toBeInTheDocument();
    expect(section.getByText("Step 4 names no system that performs it.")).toHaveClass("explorer-gap");
  });

  it("folds the sections with nothing recorded into what the catalogue does not say", async () => {
    const offering = EXPLORED.products![0];
    const sparse = {
      ...offering!,
      lifecycle_notes: [], tracking: undefined, sources: [], questions: [], decisions: [], boundaries: [], not_used: [], nfrs: [], components: [],
    };
    open("/explorer", false, undefined, { ...EXPLORED, products: [sparse] } as typeof EXPLORED);
    const section = within((await screen.findByRole("heading", { name: /^What the catalogue does not say yet/ })).closest("section")!);
    for (const title of ["Order tracking", /^Lifecycle notes/, /^Parts, and who/, /^Non-functional/, /^Open questions/, /^Architecture decisions/, "Sources and boundaries"]) {
      expect(screen.queryByRole("heading", { name: title })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: /^Systems in this order/ })).toBeInTheDocument();
    for (const line of [
      "No order tracking is recorded for Business Pro Plus.",
      "No lifecycle note concerns New Activation through Online.",
      "No part of Business Pro Plus is recorded.",
      "No non-functional requirement is recorded for Business Pro Plus.",
      "No open question is recorded for Business Pro Plus.",
      "No architecture decision is recorded for Business Pro Plus.",
      "No source is named for Business Pro Plus.",
    ]) expect(section.getByText(line)).toHaveClass("explorer-gap");
  });

  it("says how each part is realised and who delivers it in this order", async () => {
    open();
    const parts = within(await screen.findByRole("table", { name: /Parts of Business Pro Plus/ }));
    expect(parts.getByRole("row", { name: /Broadband/ })).toHaveTextContent("GPON internet CFS");
    expect(parts.getByRole("row", { name: /Broadband/ })).toHaveTextContent("GPON line");
    // Layer by layer, missing records and the key are the Realisation sections' own tests (realisation.test.tsx).
    expect(screen.getByText(/what the customer is sold/)).toBeInTheDocument();
  });

  it("lists the offering's non-functional requirements, saying how many are not defined", async () => {
    open();
    const table = within(await screen.findByRole("table", { name: "Non-functional requirements of Business Pro Plus" }));
    expect(table.getByRole("row", { name: /Availability/ })).toHaveTextContent("Not defined");
    expect(table.getByRole("row", { name: /Security/ })).toHaveTextContent("SAML SSO for the portal.");
    expect(screen.getByText(/1 quality is not defined/)).toBeInTheDocument();
  });

  it("reads the order's tracking through the chosen channel, with its screen's read path", async () => {
    open();
    const section = within((await screen.findByRole("heading", { name: "Order tracking" })).closest("section")!);
    expect(section.getByText("Specified for New Activation.")).toBeInTheDocument();
    const correlation = within(section.getByRole("table", { name: "How Online tracks its orders of Business Pro Plus" }));
    const online = correlation.getByRole("row", { name: /Online/ });
    expect(online).toHaveTextContent("Digital Order ID ↔ CWOM Order ID");
    expect(online).toHaveTextContent("Reads its status from RTF over getRealTimeOrderDetails");
    const flows = within(section.getByRole("table", { name: /Flows that carry/ })).getAllByRole("row").slice(1);
    expect(flows).toHaveLength(3);
    expect(flows[2]).toHaveTextContent("How Online's tracking screen reads the order's status");
    expect(section.getByText("Installation done")).toBeInTheDocument();
    expect(section.getByRole("row", { name: /Rejected by business rules/ })).toHaveTextContent("Back to the channel");
  });

  it("says what a channel leaves undefined, as needing attention", async () => {
    open("/explorer?product=bpp&order=NEW&channel=shop");
    const section = within((await screen.findByRole("heading", { name: "Order tracking" })).closest("section")!);
    const shop = section.getByRole("row", { name: /Shop/ });
    expect(within(shop).getByText("Not defined")).toBeInTheDocument();
    expect(within(shop).getByText("Not named")).toBeInTheDocument();
  });

  it("says when tracking is not specified for the order type, as a fact rather than a gap", async () => {
    open("/explorer?product=bpp&order=CEASE");
    const section = within((await screen.findByRole("heading", { name: "Order tracking" })).closest("section")!);
    expect(section.getByText("Not specified for Cease. Tracking is not specified for a cease.")).toBeInTheDocument();
    expect(section.queryByRole("table", { name: /Flows that carry/ })).not.toBeInTheDocument();
    expect(section.getByRole("table", { name: /fall out/ })).toBeInTheDocument();
  });

  it("reads the offering's plans and prices from the product catalog, saying which and when", async () => {
    open();
    const table = within(await screen.findByRole("table", { name: /Plans of Business Pro Plus/ }));
    expect(api.explorerPlans).toHaveBeenCalledWith("bpp");
    const section = within((await screen.findByRole("heading", { name: "Plans and prices" })).closest("section")!);
    expect(section.getByText(/From the sample product catalog, by the code/)).toHaveTextContent(
      "read at 09:30, 5 Oct 2026. The catalog holds the prices; the knowledge catalogue keeps no copy. Sold with: No contract · 24 months.",
    );
    const monthly = table.getByRole("row", { name: /Monthly, with a contract/ });
    expect(monthly).toHaveTextContent("Every month");
    expect(monthly).toHaveTextContent("AED 2,740.00");
    expect(table.getByRole("row", { name: /Installation/ })).toHaveTextContent("Once");
    expect(table.getByRole("row", { name: /300Mbps \(sample\)/ })).toHaveTextContent("RetiredSold with: 12 months");
    expect(table.getByText("The catalog states no price for this plan.")).toBeInTheDocument();
    expect(screen.getByText(NOT_YET)).not.toHaveTextContent("Plans");
  });

  it.each([
    [{ status: "not_configured" }, "This portal reads no product catalog, so plans and prices are not shown."],
    [{ status: "no_code", catalog: "the product catalog" }, "Business Pro Plus has no code in the catalogue, so its plans cannot be looked up in the product catalog."],
    [{ status: "not_in_catalog", code: "BPP", catalog: "the product catalog" }, "The product catalog has no offering with the code BPP."],
  ])("says why no plan is shown: %o", async (answer, line) => {
    open("/explorer", false, async () => ({ terms: [], plans: [], ...answer }) as CatalogPlans);
    const title = await screen.findByRole("heading", { name: "Plans and prices" });
    const quiet = await within(title.closest("section")!).findByText((_, node) => node?.tagName === "P" && node.textContent === line);
    expect(quiet).toBeInTheDocument();
  });

  it("says when the product catalog cannot be read, with a way to try again", async () => {
    open("/explorer", false, () => Promise.reject(new Error("The product catalog service is unavailable (503).")));
    const section = within((await screen.findByRole("heading", { name: "Plans and prices" })).closest("section")!);
    expect(await section.findByRole("alert")).toHaveTextContent("The product catalog service is unavailable (503).");
    expect(section.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("reads the lifecycle notes of the order type and channel, and counts the others", async () => {
    open();
    const section = within((await screen.findByRole("heading", { name: /^Lifecycle notes for New Activation/ })).closest("section")!);
    expect(section.getAllByRole("article")).toHaveLength(1);
    // A lone note opens by itself.
    const matrix = within(section.getByRole("article", { name: "Up / Downgrade matrix" }));
    expect(matrix.getByRole("button", { name: "Up / Downgrade matrix" })).toHaveAttribute("aria-expanded", "true");
    // The note's source names a registered source, so it says its level.
    expect(matrix.getByText("Change · SDD (L2) §10")).toBeInTheDocument();
    const table = matrix.getByRole("table");
    expect(table).toHaveTextContent("200Mbps300Mbps");
    expect(within(table).getByText("Workflows are in the annexure.")).toBeInTheDocument();
    expect(section.getByText("2 more notes concern other order types or channels.")).toBeInTheDocument();
    expect(screen.getByText(NOT_YET)).toHaveTextContent("Information objects");
  });

  it("closes notes to an index when there are several, each saying what it holds", async () => {
    open("/explorer?product=bpp&order=NEW&channel=shop");
    const section = within((await screen.findByRole("heading", { name: /^Lifecycle notes for New Activation/ })).closest("section")!);
    const toggle = section.getByRole("button", { name: "Renewal" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const renewal = within(section.getByRole("article", { name: "Renewal" }));
    expect(renewal.getByText("Commercial · Only in Shop")).toBeInTheDocument();
    expect(renewal.getByText("Holds a list of 1 item.")).toBeInTheDocument();
    expect(renewal.getByText("Carries over content to re-verify.")).toBeInTheDocument();
    expect(renewal.queryByRole("listitem")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(renewal.getByText("v8.2 carry-over (re-verify)")).toBeInTheDocument();
    expect(renewal.getByText("Carried over from another source: to re-verify before anyone relies on it.")).toBeInTheDocument();
    expect(renewal.getByText(/inferred, not stated in the source/)).toBeInTheDocument();
    expect(renewal.getByRole("listitem")).toHaveTextContent("Inherit tenure");

    fireEvent.click(section.getByRole("button", { name: "Open every note" }));
    expect(section.getByRole("button", { name: "Up / Downgrade matrix" })).toHaveAttribute("aria-expanded", "true");
    expect(section.getByRole("button", { name: "Close every note" })).toBeInTheDocument();
  });

  it("changes scenario from the choices and keeps it in the address", async () => {
    open();
    fireEvent.change(await screen.findByLabelText("Order type"), { target: { value: "CEASE" } });
    expect(screen.getByRole("heading", { level: 2, name: "Business Pro Plus: Cease" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("?product=bpp&order=CEASE");
    expect(screen.queryByLabelText("Channel")).not.toBeInTheDocument();
    expect(screen.getByText("No journey fulfils it yet")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cease (no journey yet)" })).toBeInTheDocument();
  });

  it("reads one channel at a time, with its entry system performing the steps given to it", async () => {
    open();
    const steps = await screen.findByRole("table", { name: /Steps of/ });
    expect(steps).toHaveTextContent("The entry system of Online");
    expect(within(steps).queryByText("Book a shop visit")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "shop" } });

    expect(screen.getByRole("heading", { level: 2, name: "Business Pro Plus: New Activation, through Shop" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("?product=bpp&order=NEW&channel=shop");
    const shop = await screen.findByRole("table", { name: /Steps of/ });
    expect(within(shop).getByText("Book a shop visit")).toBeInTheDocument();
    expect(shop).toHaveTextContent("Only in Shop");
    expect(shop).toHaveTextContent("The entry system of Shop, not named");
    expect(screen.getByRole("option", { name: "Shop (no entry system)" })).toBeInTheDocument();
  });

  it("opens the scenario in the address", async () => {
    open("/explorer?product=bpp&order=CEASE");
    expect(await screen.findByRole("heading", { level: 2, name: "Business Pro Plus: Cease" })).toBeInTheDocument();
  });

  it("gives a reader the names of systems, not links into the catalogue", async () => {
    open();
    await screen.findByRole("heading", { level: 2 });
    expect(screen.queryByRole("link", { name: "CWOM" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "The journey in the catalogue" })).not.toBeInTheDocument();
  });

  it("links systems, the offering and the journey for an admin", async () => {
    open("/explorer", true);
    await screen.findByRole("heading", { level: 2 });
    expect(screen.getAllByRole("link", { name: "CWOM" })[0]).toHaveAttribute("href", "/architecture/systems/cwom");
    expect(screen.getByRole("link", { name: "The journey in the catalogue" })).toHaveAttribute("href", "/architecture/journeys/bpp-new");
  });

  it("says so when the version cannot be read, with a way to try again", async () => {
    vi.spyOn(api, "explorerRelease").mockRejectedValue(new Error("The knowledge service is unavailable."));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/explorer"]}>
          <ExplorerPage linkSystems={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("The knowledge service is unavailable.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("the Solution Architecture download", () => {
  function saving() {
    const saved: { name: string; blob: Blob }[] = [];
    const blobs = new Map<string, Blob>();
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        const url = `blob:${blobs.size}`;
        blobs.set(url, blob);
        return url;
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: blobs.get(this.href)! });
    });
    return saved;
  }

  it("writes the scenario as a Word document for any reader, reading the plans it already read", async () => {
    const saved = saving();
    open("/explorer?product=bpp&order=NEW&channel=online");
    const button = await screen.findByRole("button", { name: "Download the Solution Architecture (.docx)" });
    expect(button).toHaveAccessibleDescription(/eighteen sections, for architecture review/);

    fireEvent.click(button);

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe("Business_Pro_Plus_New_Activation_Online_Solution_Architecture.docx");
    expect(saved[0]!.blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(api.explorerPlans).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Download the Solution Architecture (.docx)" })).not.toHaveAttribute("aria-disabled");
  });

  it("says when the document could not be written, and offers it again", async () => {
    const saved = saving();
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
      throw new Error("No room to save it.");
    });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Download the Solution Architecture (.docx)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The document could not be written: No room to save it.");
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    // The retry takes "Try again" away; focus lands on the download, never on the page.
    expect(screen.getByRole("button", { name: /Solution Architecture|Writing the document/ })).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    // The retry runs to the end before the test does, so no write lands after teardown.
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Download the Solution Architecture (.docx)" })).not.toHaveAttribute("aria-disabled");
  });
});
