import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import { ExplorerPage, NOT_YET } from "./ExplorerPage";
import { EXPLORED } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.search}</p>;
}

function open(path = "/explorer", linkSystems = false) {
  vi.spyOn(api, "explorerRelease").mockResolvedValue(EXPLORED);
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

  it("reads the journey as a timetable with its hand-overs", async () => {
    open();
    expect(await screen.findByRole("table", { name: /Steps of Business Pro Plus new activation/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /hand over to each other/ })).toHaveTextContent("SR request");
  });

  it("says what the catalogue does not say, as due lines", async () => {
    open();
    const section = within((await screen.findByRole("heading", { name: "What the catalogue does not say yet" })).closest("section")!);
    expect(section.getByText(NOT_YET)).toBeInTheDocument();
    expect(section.getByText("Step 4 names no system that performs it.")).toHaveClass("explorer__gap");
  });

  it("says how each part is realised, layer by layer", async () => {
    open();
    const parts = within(await screen.findByRole("table", { name: /Parts of Business Pro Plus/ }));
    const broadband = parts.getByRole("row", { name: /Broadband/ });
    const realised = within(broadband.querySelector("td.parts__realised")! as HTMLElement);
    expect(realised.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "CFS GPON internet CFSInferred, not stated in its source",
      "Resource GPON line",
    ]);
    expect(realised.getByText("CFS")).toHaveAttribute("title", "Customer-facing service");
    expect(realised.getByText("Resource").tagName).toBe("SPAN");
    // A part with nothing recorded is due, not quiet; the phone fold sits in a cell, never the row header.
    const firewall = parts.getByRole("row", { name: /^Firewall/ });
    expect(within(firewall.querySelector("td.parts__realised")! as HTMLElement).getByText("Not stated")).toHaveClass("realised__missing");
    expect(within(firewall).getByRole("rowheader").querySelector(".parts__realised-inline")).toBeNull();
    expect(screen.getByText(/what the customer is sold/)).toHaveClass("realised__key");
  });

  it("lists the offering's non-functional requirements, an undefined one as due", async () => {
    open();
    const table = within(await screen.findByRole("table", { name: "Non-functional requirements of Business Pro Plus" }));
    expect(table.getByRole("row", { name: /Availability/ })).toHaveClass("row--due");
    const availability = table.getByRole("row", { name: /Availability/ });
    expect(availability.querySelector("td.nfr__defined")).toHaveClass("nfr__missing");
    expect(availability.querySelector("td.nfr__defined")).toHaveTextContent("Not defined");
    // On phones the Defined column rides under the quality.
    expect(availability.querySelector("th .nfr__defined-inline")).toHaveTextContent("Not defined");
    expect(table.getByRole("row", { name: /Security/ }).querySelectorAll("td")[1]).toHaveTextContent("SAML SSO for the portal.SDD §11");
    expect(screen.getByText(/1 quality is not defined/)).toBeInTheDocument();
  });

  it("reads the order's tracking through the chosen channel, with its screen's read path", async () => {
    open();
    const section = within((await screen.findByRole("heading", { name: "Order tracking" })).closest("section")!);
    expect(section.getByText("Specified for New Activation.")).toBeInTheDocument();
    const correlation = within(section.getByRole("table", { name: /Correlation and tracking screen/ }));
    expect(correlation.getAllByRole("row")).toHaveLength(2);
    expect(correlation.getByRole("row", { name: /Online/ })).toHaveTextContent("Digital Order ID ↔ CWOM Order ID");
    expect(correlation.getByRole("row", { name: /Online/ })).toHaveTextContent("Reads from RTF over getRealTimeOrderDetails");
    const flows = within(section.getByRole("table", { name: /Flows that carry/ })).getAllByRole("row").slice(1);
    expect(flows.map((row) => row.textContent)).toEqual([
      "CWOMRTFSub-order milestonesOver notifyMilestone",
      "RTFLogs it itselfTimestamps",
      "B2B WebRTFgetRealTimeOrderDetailsThe read path of Online",
    ]);
    expect(section.getByText("Installation done").closest("li")).toHaveClass("explorer__gap");
    expect(section.getByRole("row", { name: /Rejected by business rules/ })).toHaveTextContent("Back to the channel");
  });

  it("says what a channel leaves undefined, as due", async () => {
    open("/explorer?product=bpp&order=NEW&channel=shop");
    const section = within((await screen.findByRole("heading", { name: "Order tracking" })).closest("section")!);
    const shop = section.getByRole("row", { name: /Shop/ });
    expect(shop).toHaveClass("row--due");
    expect(within(shop).getByText("Not defined")).toHaveClass("tracking__missing");
    expect(within(shop).getByText("Not named")).toHaveClass("tracking__missing");
  });

  it("says when tracking is not specified for the order type", async () => {
    open("/explorer?product=bpp&order=CEASE");
    const section = within((await screen.findByRole("heading", { name: "Order tracking" })).closest("section")!);
    expect(section.getByText("Tracking is not specified for a cease.")).toHaveClass("explorer__gap");
    expect(section.queryByRole("table", { name: /Flows that carry/ })).not.toBeInTheDocument();
    expect(section.getByRole("table", { name: /fall out/ })).toBeInTheDocument();
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
    const steps = within(await screen.findByRole("table", { name: /Steps of/ }));
    expect(steps.getByText("The entry system of Online")).toBeInTheDocument();
    expect(steps.queryByText("Book a shop visit")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "shop" } });

    expect(screen.getByRole("heading", { level: 2, name: "Business Pro Plus: New Activation, through Shop" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("?product=bpp&order=NEW&channel=shop");
    const shop = within(screen.getByRole("table", { name: /Steps of/ }));
    expect(shop.getByText("Book a shop visit")).toBeInTheDocument();
    expect(shop.getByText("Only in Shop")).toBeInTheDocument();
    expect(shop.getByText("The entry system of Shop, not named")).toBeInTheDocument();
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
