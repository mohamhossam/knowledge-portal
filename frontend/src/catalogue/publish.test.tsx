import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { catalogue } from "./catalogue";
import { SystemsPage } from "./SystemsPage";
import type { CatalogueContext } from "./useCatalogue";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const system = (id: string, name: string, extra: object = {}) => ({ id, name, aliases: [], capabilities: [], components: [], constraints: [], ...extra });

const draft = (extra: Partial<Release> = {}) => ({
  id: "d", name: "October", revision: 5, built_revision: 5, status: "draft", documents: [], index_profile: "p",
  systems: [system("cwom", "CWOM", { description: "Orchestrates orders." }), system("bscs", "BSCS")],
  relationships: [],
  ...extra,
}) as unknown as Release;

function renderAt(release: Release, path: string, routes: ReactNode) {
  vi.spyOn(api, "systemOwnership").mockResolvedValue({ system_id: "x", squads: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "organisation").mockResolvedValue({ people: [], squads: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "buildJob").mockResolvedValue(null);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({
    active_release_id: "live", requirements: 7, features: 0, stories: 0, outdated_requirements: 2, outdated_features: 0, outdated_stories: 0,
  });
  vi.spyOn(api, "releaseChanges").mockResolvedValue({ base_release_id: "live", draft_release_id: "d", changes: [] });
  vi.spyOn(api, "suggestions").mockResolvedValue({ release_id: "d", release_revision: 5, suggestions: [], runs: [] } as never);
  const context: CatalogueContext = {
    book: catalogue(release), base: "/architecture/versions/d", inService: false, editable: true, actorName: () => "Amina Owner",
  };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture/versions/d" element={<Outlet context={context} />}>{routes}</Route>
          <Route path="architecture" element={<p>In service now</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const systemRoutes = (
  <>
    <Route index element={<SystemsPage />} />
    <Route path="systems/:systemId" element={<SystemsPage />} />
  </>
);

describe("hand edits on a system's sheet", () => {
  it("edits a system in place and saves it with the draft's revision", async () => {
    const save = vi.spyOn(api, "saveSystem").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit this system" }));
    fireEvent.change(screen.getByLabelText("What it is"), { target: { value: "Orchestrates fixed-line orders." } });
    fireEvent.click(screen.getByRole("button", { name: "Save the system" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]).toEqual([
      "d", "cwom", { expected_revision: 5, system: expect.objectContaining({ id: "cwom", description: "Orchestrates fixed-line orders." }) },
    ]);
  });

  it("keeps the rest of the record in view while the system is edited", () => {
    renderAt(draft(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit this system" }));
    expect(screen.getByRole("form", { name: "Edit CWOM" })).toBeInTheDocument();
    // What the form holds gives way to it; what it doesn't stays, read only until the edit closes.
    expect(screen.getByRole("heading", { name: /Depends on/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a dependency" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Constraints/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add a dependency" })).toBeInTheDocument();
  });

  it("asks before throwing a changed edit away, and gives focus back to its button", async () => {
    renderAt(draft(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit this system" }));
    const form = screen.getByRole("form", { name: "Edit CWOM" });
    expect(within(form).getByText("Nothing changed yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What it is"), { target: { value: "Orchestrates fixed-line orders." } });
    expect(within(form).getByText("Changed: What it is.")).toBeInTheDocument();
    screen.getByLabelText("What it is").focus();
    fireEvent.keyDown(screen.getByLabelText("What it is"), { key: "Escape" });
    expect(within(form).getByText("Discard your changes to What it is?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus());
    // Escape again, or Keep editing, goes back to the edit as it was, and to the field it left.
    fireEvent.keyDown(screen.getByRole("button", { name: "Keep editing" }), { key: "Escape" });
    expect(screen.getByLabelText("What it is")).toHaveValue("Orchestrates fixed-line orders.");
    await waitFor(() => expect(screen.getByLabelText("What it is")).toHaveFocus());
    const cancel = screen.getByRole("button", { name: "Cancel" });
    // A browser focuses a button it clicks; jsdom does not.
    cancel.focus();
    fireEvent.click(cancel);
    // The question's buttons are new ones: a reused <button> turned into Save mid-click and saved the form.
    const keep = screen.getByRole("button", { name: "Keep editing" });
    expect(keep).not.toBe(cancel);
    expect(keep).toHaveAttribute("type", "button");
    fireEvent.click(keep);
    expect(screen.getByRole("button", { name: "Save the system" })).not.toBe(keep);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard the changes" }));
    expect(screen.queryByRole("form", { name: "Edit CWOM" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit this system" })).toHaveFocus());
  });

  const linked = () =>
    draft({
      systems: [
        system("cwom", "CWOM", {
          capabilities: [{ id: "take", name: "Take orders", triggers: ["take orders"], accepted: [] }],
          masters: [], reads: [], mastery_notes: [], external: false, deprecated: false, accepted: [],
        }),
        system("bscs", "BSCS"),
      ],
      capability_domains: [{ id: "sales", name: "Sales", accepted: [] }],
      business_capabilities: [
        { id: "cap-order-capture", pref_label: "Order capture", domain_id: "sales", alt_labels: [], close_match: [], deprecated: false, accepted: [] },
      ],
      vocabulary: [
        { id: "ent-order", scheme: "information_entity", pref_label: "Order", alt_labels: [], close_match: [], deprecated: false, accepted: [] },
        { id: "ent-customer", scheme: "information_entity", pref_label: "Customer", alt_labels: [], close_match: [], deprecated: false, accepted: [] },
      ],
    } as unknown as Partial<Release>);

  it("saves where its facts come from, its concept and the information it masters and reads", async () => {
    const save = vi.spyOn(api, "saveSystem").mockResolvedValue(linked());
    renderAt(linked(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit this system" }));
    fireEvent.click(screen.getByLabelText(/Outside the operator/));
    fireEvent.change(screen.getByLabelText("Owner in the source"), { target: { value: "Order management" } });
    fireEvent.change(screen.getByLabelText("Roadmap"), { target: { value: "Replaced by CSRD over time." } });
    fireEvent.change(screen.getByLabelText("Concept it realises"), { target: { value: "cap-order-capture" } });
    // One role per kind of information: mastering what it read takes it off what it reads.
    const order = screen.getByRole("group", { name: "Order" });
    fireEvent.click(within(order).getByLabelText("Reads"));
    fireEvent.click(within(order).getByLabelText("Masters"));
    expect(within(order).getByLabelText("Reads")).not.toBeChecked();
    fireEvent.click(within(screen.getByRole("group", { name: "Customer" })).getByLabelText("Reads"));
    fireEvent.change(screen.getByLabelText("Its share of Order"), { target: { value: "Fixed-line orders only." } });
    fireEvent.click(screen.getByRole("button", { name: "Save the system" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![2].system).toMatchObject({
      external: true,
      owner: "Order management",
      roadmap: "Replaced by CSRD over time.",
      masters: ["ent-order"],
      reads: ["ent-customer"],
      mastery_notes: [{ entity_id: "ent-order", note: "Fixed-line orders only." }],
      // Its concept's business area comes with it.
      capabilities: [expect.objectContaining({ concept_id: "cap-order-capture", domain_id: "sales", unlinked_reason: null })],
    });
  });

  it("asks why when no concept fits a capability", async () => {
    const save = vi.spyOn(api, "saveSystem").mockResolvedValue(linked());
    renderAt(linked(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit this system" }));
    fireEvent.change(screen.getByLabelText("Concept it realises"), { target: { value: "*none-fits" } });
    const button = screen.getByRole("button", { name: "Save the system" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    // The field says what is missing, not only the foot.
    expect(screen.getByLabelText(/Why no concept fits/)).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText(/Why no concept fits/), { target: { value: " Too broad for one concept. " } });
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![2].system.capabilities[0]).toMatchObject({ concept_id: null, unlinked_reason: "Too broad for one concept." });
  });

  const connected = () =>
    draft({
      systems: [system("cwom", "CWOM"), system("bscs", "BSCS"), system("crm", "CRM")],
      relationships: [
        { source_system_id: "cwom", target_system_id: "bscs", kind: "calls_api", description: "Closure updates billing.", accepted: [], source: "SDD §4" },
        { source_system_id: "crm", target_system_id: "cwom", kind: "orchestrates", description: "Hands orders over.", accepted: [] },
        { source_system_id: "crm", target_system_id: "bscs", kind: "calls_api", description: "Reads balances.", accepted: [] },
      ],
    } as unknown as Partial<Release>);

  it("edits both columns of the map where it is drawn, and saves them together", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(connected());
    renderAt(connected(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit the connections" }));
    const panel = screen.getByRole("form", { name: "Edit the connections of CWOM" });
    // One edit of its connections at a time: the tables below wait.
    expect(screen.queryByRole("button", { name: "Add a dependency" })).not.toBeInTheDocument();
    const billing = within(panel).getByRole("group", { name: "dependency on BSCS" });
    fireEvent.change(within(billing).getByLabelText(/For what/), { target: { value: "Closure and refunds update billing." } });
    // The other end's side reads in its own words.
    const crm = within(panel).getByRole("group", { name: "dependency of CRM" });
    expect(within(crm).getByLabelText("How")).toHaveDisplayValue("Orchestrates CWOM");
    fireEvent.click(within(panel).getByRole("button", { name: "Remove dependency of CRM" }));
    // Focus never falls to the page: with no row left, it goes to the list's add button.
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Add a system that depends on it" })).toHaveFocus());
    fireEvent.click(within(panel).getByRole("button", { name: "Add another system it depends on" }));
    const added = within(panel).getByRole("group", { name: "dependency 2" });
    await waitFor(() => expect(within(added).getByLabelText("Depends on")).toHaveFocus());
    fireEvent.change(within(added).getByLabelText("Depends on"), { target: { value: "crm" } });
    const button = within(panel).getByRole("button", { name: "Save the connections" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(panel).getByRole("group", { name: "dependency on CRM" }).querySelector("textarea")!, { target: { value: "Looks up the customer." } });
    expect(within(panel).getByText("Changed: what depends on it and what it depends on.")).toBeInTheDocument();
    // The map above draws the edit before it is saved.
    expect(screen.getByText(/with your changes, not yet saved/)).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![1].relationships).toEqual([
      // Kept where it was, its provenance with it; a connection between two other systems untouched; the new one after.
      { source_system_id: "cwom", target_system_id: "bscs", kind: "calls_api", description: "Closure and refunds update billing.", accepted: [], source: "SDD §4" },
      { source_system_id: "crm", target_system_id: "bscs", kind: "calls_api", description: "Reads balances.", accepted: [] },
      { source_system_id: "cwom", target_system_id: "crm", kind: "calls_api", description: "Looks up the customer.", accepted: [] },
    ]);
  });

  it("lists the connections in the map's order, what depends on it first, under the map's names", () => {
    renderAt(connected(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit the connections" }));
    const panel = screen.getByRole("form", { name: "Edit the connections of CWOM" });
    const legends = [...panel.querySelectorAll("legend.cat-form__legend")].map((item) => item.textContent);
    expect(legends).toEqual(["Depend on it", "It depends on"]);
  });

  it("closes a single change open in the table when the connections are edited", () => {
    renderAt(connected(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("form", { name: "Change the dependency" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit the connections" }));
    expect(screen.queryByRole("form", { name: "Change the dependency" })).not.toBeInTheDocument();
  });

  it("edits the connections while the system itself is being edited", () => {
    renderAt(connected(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit this system" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit the connections" }));
    expect(screen.getByRole("form", { name: "Edit CWOM" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Edit the connections of CWOM" })).toBeInTheDocument();
  });

  const interfaced = (extra: Partial<Release> = {}) =>
    draft({
      systems: [system("cwom", "CWOM"), system("bscs", "BSCS"), system("crm", "CRM")],
      vocabulary: [{ id: "ent-order", scheme: "information_entity", pref_label: "Order", alt_labels: [], close_match: [], deprecated: false, accepted: [] }],
      interfaces: [
        { id: "cwom-orders", name: "Orders API", system_id: "cwom", style: "api", consumer_ids: ["crm"], entity_ids: ["ent-order"], open_api_ids: ["tmf622"], relays: [], accepted: [] },
        { id: "bscs-billing", name: "Billing API", system_id: "bscs", style: "api", consumer_ids: [], entity_ids: [], open_api_ids: [], relays: [], accepted: [] },
        { id: "crm-customer", name: "Customer API", system_id: "crm", style: "api", consumer_ids: ["cwom"], entity_ids: [], open_api_ids: [], relays: [], accepted: [] },
      ],
      ...extra,
    } as unknown as Partial<Release>);

  it("edits the interfaces it exposes and uses where the record reads them, and saves them together", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(interfaced());
    renderAt(interfaced(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit the interfaces" }));
    const panel = screen.getByRole("form", { name: "Edit the interfaces of CWOM" });
    // The panel holds both tables, so they give way to it.
    expect(screen.queryByRole("heading", { name: /^Exposes/ })).not.toBeInTheDocument();
    const orders = within(panel).getByRole("group", { name: "Interface Orders API" });
    fireEvent.change(within(orders).getByLabelText("Style"), { target: { value: "event" } });
    fireEvent.change(within(orders).getByLabelText("Used by"), { target: { value: "bscs" } });
    // Choosing adds nothing until Add is pressed: arrowing a closed select picks each option it passes.
    fireEvent.click(within(orders).getByRole("button", { name: "Add to used by" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Add another interface it exposes" }));
    const added = within(panel).getByRole("group", { name: "Interface 2" });
    fireEvent.change(within(added).getByLabelText(/^Interface/), { target: { value: " Status feed " } });
    const uses = within(panel).getByLabelText("Interfaces of other systems it calls");
    fireEvent.change(uses, { target: { value: "bscs-billing" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add to interfaces of other systems it calls" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Remove Customer API (CRM) from interfaces of other systems it calls" }));
    expect(within(panel).getByText("Changed: what it exposes and what it uses.")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Save the interfaces" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![1].interfaces).toEqual([
      // Kept in its place with what the panel does not show (its Open API terms); another system's gain or lose CWOM as a user.
      expect.objectContaining({ id: "cwom-orders", style: "event", consumer_ids: ["crm", "bscs"], entity_ids: ["ent-order"], open_api_ids: ["tmf622"] }),
      expect.objectContaining({ id: "bscs-billing", consumer_ids: ["cwom"] }),
      expect.objectContaining({ id: "crm-customer", consumer_ids: [] }),
      expect.objectContaining({ id: "cwom-status-feed", name: "Status feed", system_id: "cwom", style: "api" }),
    ]);
  });

  it("will not drop an interface a journey still goes through", () => {
    const journey = {
      id: "j", name: "Fixed order", activities: [], flow_rules: [], edges: [], channel_edges: [], shared_edges: [], accepted: [], former_ids: [],
      integrations: [{ from_activity: "1", to_activity: "2", interface_id: "cwom-orders", open_api_ids: [] }],
    };
    renderAt(interfaced({ journeys: [journey] } as unknown as Partial<Release>), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Edit the interfaces" }));
    const panel = screen.getByRole("form", { name: "Edit the interfaces of CWOM" });
    fireEvent.click(within(panel).getByRole("button", { name: "Remove interface Orders API" }));
    const button = within(panel).getByRole("button", { name: "Save the interfaces" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(within(panel).getByText("The journey Fixed order still goes through Orders API; change its hand-over first.")).toBeInTheDocument();
  });

  it("adds a dependency to the whole draft", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft(), "/architecture/versions/d/systems/cwom", systemRoutes);
    fireEvent.click(screen.getByRole("button", { name: "Add a dependency" }));
    const panel = screen.getByRole("form", { name: /Add a dependency of CWOM/ });
    const add = within(panel).getByRole("button", { name: "Add the dependency" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(panel).getByLabelText("Depends on"), { target: { value: "bscs" } });
    fireEvent.change(within(panel).getByLabelText(/For what/), { target: { value: "Order closure updates billing." } });
    fireEvent.click(add);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![1]).toMatchObject({
      expected_revision: 5,
      relationships: [{ source_system_id: "cwom", target_system_id: "bscs", kind: "calls_api", description: "Order closure updates billing." }],
    });
  });
});
