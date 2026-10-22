import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import release from "../../catalogue/model/fixtures/smb-release.json";
import { asRelease } from "../../catalogue/model/sample";
import { axe } from "../../test/axe";
import CatalogueLab from "./CatalogueLab";
import { type CatalogueSource, catalogueSource } from "./catalogueSource";
import { checkAxeAfterEach } from "../../test/axe";

checkAxeAfterEach();

/** Renders the lab at `path`; with the sample, waits until it has arrived (it loads on demand). */
async function open(path: string, source: CatalogueSource = "sample") {
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/design-lab/catalogue${path}`]}>
        <Routes>
          <Route path="design-lab/catalogue/*" element={<CatalogueLab source={source} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  if (source === "sample") await waitFor(() => expect(screen.queryByRole("status", { name: "Reading the catalogue" })).not.toBeInTheDocument());
  return view;
}

// What the expectations count, read from the fixture rather than written in.
const sample = asRelease(release);
const offering = sample.products!.find((product) => product.id === "business-pro-plus")!;
const SYSTEMS = sample.systems.length;
const RULES = offering.business_rules.length;
const BILLING_RULES = offering.business_rules.filter((rule) => rule.kind === "billing").length;

afterEach(() => {
  vi.restoreAllMocks();
});

// These render the whole poster too, and one runs axe on it: slow on a busy machine.
describe("where the catalogue lab reads its catalogue", { timeout: 30_000 }, () => {
  it("reads the API unless the bundled sample is asked for by name", () => {
    expect(catalogueSource(undefined)).toBe("api");
    expect(catalogueSource("api")).toBe("api");
    expect(catalogueSource("anything else")).toBe("api");
    expect(catalogueSource("sample")).toBe("sample");
  });

  it("draws the version in service from the API, after a skeleton", async () => {
    const active = vi.spyOn(api, "activeRelease").mockResolvedValue(asRelease(release));
    await open("", "api");
    expect(screen.getByRole("status", { name: "Reading the catalogue" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "SMB architecture" })).toBeInTheDocument();
    expect(active).toHaveBeenCalledOnce();
  });

  it("never calls the API when it reads the bundled sample", async () => {
    const active = vi.spyOn(api, "activeRelease");
    await open("", "sample");
    expect(screen.getByRole("heading", { level: 1, name: "SMB architecture" })).toBeInTheDocument();
    expect(active).not.toHaveBeenCalled();
  });

  it("says when the API can't be read, and tries again", async () => {
    const active = vi.spyOn(api, "activeRelease").mockRejectedValueOnce(new Error("The knowledge service is not answering.")).mockResolvedValue(asRelease(release));
    await open("", "api");
    expect(await screen.findByText("The catalogue couldn't be read")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Architecture catalogue" })).toBeInTheDocument();
    expect(screen.getByText("The knowledge service is not answering.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "SMB architecture" })).toBeInTheDocument();
    expect(active).toHaveBeenCalledTimes(2);
  });

  it("switches to the bundled sample and back with the Data source switch, saying when the sample is shown", async () => {
    vi.spyOn(api, "activeRelease").mockResolvedValue(asRelease(release));
    const { container } = await open("", "api");
    await screen.findByRole("heading", { level: 1, name: "SMB architecture" });
    const switcher = screen.getByRole("group", { name: "Data source" });
    expect(within(switcher).getByRole("button", { name: "Live API" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Showing the bundled sample/)).not.toBeInTheDocument();
    await userEvent.click(within(switcher).getByRole("button", { name: "Sample JSON" }));
    // The sample loads on demand: wait for it, past the skeleton.
    expect(await screen.findByText("Showing the bundled sample (smb-release.json), not the catalogue version in service.")).toHaveAttribute("role", "status");
    expect(within(screen.getByRole("group", { name: "Data source" })).getByRole("button", { name: "Sample JSON" })).toHaveAttribute("aria-pressed", "true");
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(within(screen.getByRole("group", { name: "Data source" })).getByRole("button", { name: "Live API" }));
    expect(screen.queryByText(/Showing the bundled sample/)).not.toBeInTheDocument();
  });

  it("offers the sample when the API can't be read", async () => {
    vi.spyOn(api, "activeRelease").mockRejectedValue(new Error("The knowledge service is not answering."));
    await open("", "api");
    expect(await screen.findByText("The catalogue couldn't be read")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("group", { name: "Data source" })).getByRole("button", { name: "Sample JSON" }));
    expect(await screen.findByRole("heading", { level: 1, name: "SMB architecture" })).toBeInTheDocument();
  });

  it("says when an address under the lab has no page, with the lab's sections and the way back", async () => {
    const { container } = await open("/no-such-page");
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(document.title).toMatch(/^Page not found · Catalogue/);
    expect(screen.getByRole("navigation", { name: "Catalogue sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the landscape" })).toHaveAttribute("href", "/design-lab/catalogue");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says so when no version is in service yet", async () => {
    vi.spyOn(api, "activeRelease").mockResolvedValue(null);
    await open("", "api");
    expect(await screen.findByText("No catalogue version is in service yet")).toBeInTheDocument();
  });
});

// Each test renders the whole poster and runs axe on it: slow on a busy machine.
describe("the catalogue direction mock-ups, on the seeded Business Pro Plus catalogue", { timeout: 30_000 }, () => {
  it("draws the landscape as TAM layers, one picture with no other views, and shows what a picked system talks to", async () => {
    const { container } = await open("");
    expect(screen.getByRole("heading", { level: 1, name: "SMB architecture" })).toBeInTheDocument();
    expect(document.title).toMatch(/^SMB architecture · Catalogue/);
    // One picture: no view switch on the landscape.
    expect(screen.queryByRole("group", { name: "View" })).not.toBeInTheDocument();
    const layers = screen.getByRole("group", { name: /SMB architecture layers/ });
    const systems = within(layers).getAllByRole("button");
    expect(systems).toHaveLength(SYSTEMS);
    // One tab stop for the whole map.
    expect(systems.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    await userEvent.click(within(layers).getByRole("button", { name: /^CWOM:/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(within(layers).getByRole("button", { name: /^CWOM:/ })).toHaveAttribute("aria-pressed", "true");
    // The header's layer strip shows one layer at a time.
    const strip = screen.getByRole("group", { name: "Layers" });
    await userEvent.click(within(strip).getByRole("button", { name: "Customer" }));
    expect(within(strip).getByRole("button", { name: "Customer" })).toHaveAttribute("aria-pressed", "true");
    expect(within(strip).getByRole("button", { name: "All layers" })).toHaveAttribute("aria-pressed", "false");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists every product under its place in the portfolio: how it is sold, who can buy it, its terms, what is in it", async () => {
    const { container } = await open("/products");
    expect(screen.getByRole("heading", { level: 1, name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Business internet bundles/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Business Pro Plus" })).toBeInTheDocument();
    // Sold through assisted and self-service channels, never a system-initiated one such as NPS.
    expect(screen.getByText("Assisted")).toBeInTheDocument();
    expect(screen.getByText("Self-service")).toBeInTheDocument();
    expect(screen.queryByText(/^NPS/)).not.toBeInTheDocument();
    // Who can buy: the customer type, with no review notes on the card.
    expect(screen.getByText("SMB customers")).toBeInTheDocument();
    expect(screen.queryByText(/inferred|to confirm/i)).not.toBeInTheDocument();
    // Commercial terms: the contract periods as one track.
    expect(within(screen.getByRole("list", { name: "Contract periods" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["No contract", "1 year", "2 years"]);
    // The page is a catalogue of many products: no one product's counts in the hero.
    expect(screen.queryByText("Order types")).not.toBeInTheDocument();
    // In the bundle: short names, optional parts marked.
    expect(screen.getByText("Fibre internet")).toBeInTheDocument();
    expect(screen.getByText("optional")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Filter products" }), "zzz");
    expect(screen.getByText(/No product matches/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lays journeys out by the customer's stage, scoped by the portfolio hierarchy, with a preview", async () => {
    const { container } = await open("/journeys");
    expect(screen.getByRole("heading", { level: 1, name: "Journeys" })).toBeInTheDocument();
    // Every order type sits under its stage; the first is picked and previewed.
    const board = screen.getByRole("region", { name: "Order types by the customer's stage" });
    expect(within(board).getByRole("list", { name: "Leave" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "New activation" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /^Route: / })).toBeInTheDocument();
    // Picking another order type previews its journey.
    await userEvent.click(within(board).getByRole("button", { name: /^Cessation:/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Cessation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the journey flow" })).toHaveAttribute("href", expect.stringContaining("/journeys/bpp-cessation"));
    // Every level opens with a choice, Fixed › SMB and down to one product: order types belong to a product.
    const scope = screen.getByRole("navigation", { name: "Scope" });
    expect(within(scope).getByLabelText(/^Line of business: Fixed/)).toBeInTheDocument();
    expect(within(scope).getByLabelText(/^Segment: SMB/)).toBeInTheDocument();
    expect(within(scope).getByLabelText(/^Product family: Business internet bundles/)).toBeInTheDocument();
    expect(within(scope).getByLabelText(/^Product: Business Pro Plus/)).toBeInTheDocument();
    // Widening the scope keeps a product named.
    await userEvent.click(within(scope).getByLabelText(/^Business unit: Enterprise/));
    await userEvent.click(within(scope).getByRole("button", { name: "Any business unit" }));
    expect(within(scope).getByLabelText(/^Business unit: Any business unit/)).toBeInTheDocument();
    expect(within(scope).getByLabelText(/^Product: Business Pro Plus/)).toBeInTheDocument();
    expect(within(board).getByRole("list", { name: "Leave" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("respects that not every channel takes every order type", async () => {
    const { container } = await open("/journeys?channel=b2b-web");
    const board = screen.getByRole("region", { name: "Order types by the customer's stage" });
    // Seen through B2B Web, the order types it can't take go quiet and say so.
    expect(within(board).getByRole("button", { name: /^Renewal: .*not through B2B Web$/ })).toBeInTheDocument();
    expect(within(board).getByRole("button", { name: /^New activation: \d+ steps$/ })).toBeInTheDocument();
    // The preview names the channels the order type is, and isn't, ordered through.
    expect(screen.getByRole("heading", { level: 3, name: "Ordered through" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Not through" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("marks a product's selling channel that doesn't take every way to join", async () => {
    await open("/products");
    expect(screen.getByText(/for new activation and port in only/)).toBeInTheDocument();
  });

  it("says which products use a picked system, and groups its journeys by product", async () => {
    await open("?system=cwom");
    expect(screen.getByRole("heading", { level: 3, name: "Used by products" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Business Pro Plus" })).toHaveAttribute("href", expect.stringContaining("/products/business-pro-plus/architecture?system=cwom"));
  });

  it("shows on the Systems page who calls whom, product-neutral, and which systems deliver which capability", async () => {
    const { container } = await open("/systems");
    expect(screen.getByRole("heading", { level: 1, name: "Systems" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Systems" })).toHaveAttribute("aria-current", "page");
    // Interfaces, each counted once whatever uses it, never journey calls.
    expect(screen.getByText("Distinct interfaces")).toBeInTheDocument();
    expect(screen.queryByText(/Busiest/)).not.toBeInTheDocument();
    const matrix = screen.getByRole("table");
    await userEvent.click(within(matrix).getByRole("button", { name: /^CWOM/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    // Capabilities: systems against the kinds of bundle part, across every product.
    await userEvent.click(screen.getByRole("button", { name: "Capabilities" }));
    const grid = screen.getByRole("table");
    expect(within(grid).getByRole("columnheader", { name: /Security/ })).toBeInTheDocument();
    expect(within(grid).getByRole("img", { name: /^CWOM, Security: 2 components/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("finds a system by the start of its name", async () => {
    await open("");
    await userEvent.type(screen.getByRole("combobox", { name: "Find a system" }), "tib{Enter}");
    expect(screen.getByRole("heading", { level: 2, name: "TIBCO" })).toBeInTheDocument();
  });

  it("opens a product with one statement, its customer value and who can buy it, through which channels", async () => {
    const { container } = await open("/products/business-pro-plus");
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
    const { container } = await open("/products/business-pro-plus/hierarchy");
    for (const level of ["Enterprise", "Fixed", "SMB", "Business internet bundles"]) expect(screen.getAllByText(level).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 2, name: /Plans/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists the plans with prices left as a gap, and filters business rules by kind", async () => {
    await open("/products/business-pro-plus/plans");
    expect(screen.getByRole("rowheader", { name: "Monthly price" })).toBeInTheDocument();
  });

  it("filters business rules by what they govern", async () => {
    const { container } = await open("/products/business-pro-plus/rules");
    expect(screen.getAllByRole("listitem").filter((item) => /^R\d+/.test(item.textContent ?? "")).length).toBe(RULES);
    await userEvent.click(screen.getByRole("button", { name: /^Billing/ }));
    expect(screen.getAllByRole("listitem").filter((item) => /^R\d+/.test(item.textContent ?? "")).length).toBe(BILLING_RULES);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows who delivers what, then each component with the systems that deliver it", async () => {
    const { container } = await open("/products/business-pro-plus/components");
    const grid = screen.getByRole("table");
    expect(within(grid).getByRole("rowheader", { name: /Backup 5G/ })).toBeInTheDocument();
    expect(within(grid).getAllByRole("img", { name: /^CWOM:/ }).length).toBeGreaterThan(3);
    expect(screen.getByRole("heading", { level: 3, name: "Backup 5G" })).toBeInTheDocument();
    // The cards narrow by group, and by the system a column heading names.
    await userEvent.click(screen.getByRole("button", { name: /^Security/ }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((item) => item.textContent)).toEqual(["Firewall", "SD-WAN"]);
    await userEvent.click(screen.getByRole("button", { name: /^All/ }));
    await userEvent.click(within(grid).getByRole("button", { name: /^vEDA:/ }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((item) => item.textContent)).toEqual(["Backup 5G"]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("draws the product's footprint on the architecture, with each system's role for it", async () => {
    const { container } = await open("/products/business-pro-plus/architecture");
    const map = screen.getByRole("group", { name: /Business Pro Plus on the SMB architecture map/ });
    expect(within(map).getByRole("button", { name: /^CWOM:.*core to the product/ })).toBeInTheDocument();
    expect(within(map).getAllByRole("button", { name: /not used by the product/ }).length).toBeGreaterThan(0);
    await userEvent.click(within(map).getByRole("button", { name: /^CWOM:/ }));
    expect(screen.getByRole("heading", { level: 2, name: "CWOM" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "What it does for the product" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lights a journey's systems on the product's architecture and steps through its calls", async () => {
    const { container } = await open("/products/business-pro-plus/architecture");
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
    const { container } = await open("/journeys/bpp-new-activation?channel=bcrm");
    expect(screen.getByRole("heading", { level: 1, name: "Business Pro Plus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /New activation · BCRM/ })).toBeInTheDocument();
    const steps = screen.getAllByRole("button", { name: /^Step \d+:/ });
    expect(steps.length).toBeGreaterThan(10);
    await userEvent.click(steps[1] as HTMLElement);
    expect(screen.getByText(/Step 2 of/)).toBeInTheDocument();
    expect(screen.queryByText(/isn't offered through/)).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says when a journey isn't offered through the channel asked for, and shows its first", async () => {
    const { container } = await open("/journeys/bpp-new-activation?channel=no-such-channel");
    expect(screen.getByText("New activation isn't offered through “no-such-channel”; it is shown through BCRM instead.")).toHaveAttribute("role", "status");
    expect(screen.getByRole("heading", { level: 2, name: /New activation · BCRM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BCRM" })).toHaveAttribute("aria-pressed", "true");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("draws a journey's calls as a sequence with the picked call's details, and as a table filterable by system", async () => {
    const { container } = await open("/journeys/bpp-new-activation?channel=bcrm&view=integrations");
    const register = screen.getByRole("region", { name: "Integration register" });
    const calls = within(within(register).getByRole("list", { name: /^Calls in order/ })).getAllByRole("button");
    expect(calls.length).toBeGreaterThan(10);
    await userEvent.click(calls[1] as HTMLElement);
    expect(within(register).getByText(/^Call 2 of/)).toBeInTheDocument();
    await userEvent.click(within(register).getByRole("button", { name: "Table" }));
    const all = within(register).getAllByRole("row").length;
    await userEvent.selectOptions(within(register).getByRole("combobox", { name: "System" }), "cwom");
    expect(within(register).getAllByRole("row").length).toBeLessThan(all);
    expect(await axe(container)).toHaveNoViolations();
  });
});
