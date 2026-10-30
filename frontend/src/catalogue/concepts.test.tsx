import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { checkAxeAfterEach } from "../test/axe";
import { catalogue } from "./catalogue";
import { ConceptsPage } from "./ConceptsPage";
import type { CatalogueContext } from "./useCatalogue";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const concept = (id: string, pref_label: string, extra: object = {}) => ({
  id, pref_label, alt_labels: [], close_match: [], deprecated: false, accepted: [], ...extra,
});

const draft = (extra: Partial<Release> = {}) => ({
  id: "d", name: "October", revision: 5, built_revision: 5, status: "draft", documents: [], index_profile: "p",
  capability_domains: [{ id: "sales", name: "Sales", accepted: [] }, { id: "billing", name: "Billing", accepted: [] }],
  business_capabilities: [
    concept("cap-order-capture", "Order capture", { domain_id: "sales", alt_labels: ["Order entry"] }),
    concept("cap-quoting", "Quoting", { broader_id: "cap-order-capture" }),
    concept("cap-billing", "Billing", { domain_id: "billing" }),
  ],
  systems: [{
    id: "cwom", name: "CWOM", aliases: [], components: [], constraints: [],
    capabilities: [{ id: "quote", name: "Quote orders", triggers: ["quote"], concept_id: "cap-quoting", domain_id: "sales", accepted: [] }],
  }],
  relationships: [],
  ...extra,
}) as unknown as Release;

function renderAt(release: Release, path: string) {
  vi.spyOn(api, "buildJob").mockResolvedValue(null);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({
    active_release_id: "live", requirements: 0, features: 0, stories: 0, outdated_requirements: 0, outdated_features: 0, outdated_stories: 0,
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
          <Route path="architecture/versions/d" element={<Outlet context={context} />}>
            <Route path="concepts" element={<ConceptsPage />} />
            <Route path="concepts/:conceptId" element={<ConceptsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const saved = (save: ReturnType<typeof vi.spyOn>) => (save.mock.calls[0]![1] as { business_capabilities: ReturnType<typeof concept>[] }).business_capabilities;

describe("editing a concept on its record", () => {
  it("edits every fact the record shows, keeps what realises it in view, and saves it in its place", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft(), "/architecture/versions/d/concepts/cap-order-capture");
    fireEvent.click(screen.getByRole("button", { name: "Edit this concept" }));
    const form = screen.getByRole("form", { name: "Edit Order capture" });
    // The form holds the labels and the facts; what realises the concept stays beside it.
    expect(screen.queryByRole("heading", { name: /^Labels/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Systems that do this/ })).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/Other labels/), { target: { value: "Order entry\nOrder intake\n" } });
    fireEvent.change(within(form).getByLabelText("Definition"), { target: { value: " Taking an order down. " } });
    fireEvent.change(within(form).getByLabelText("Outside match"), { target: { value: "ODA: Product Order Capture" } });
    fireEvent.change(within(form).getByLabelText(/Near matches/), { target: { value: "TMF622" } });
    expect(within(form).getByText("Changed: its labels, what it means and its outside matches.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the concept" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved(save)).toEqual([
      expect.objectContaining({
        id: "cap-order-capture", alt_labels: ["Order entry", "Order intake"], definition: "Taking an order down.",
        exact_match: "ODA: Product Order Capture", close_match: ["TMF622"], domain_id: "sales",
      }),
      expect.objectContaining({ id: "cap-quoting" }),
      expect.objectContaining({ id: "cap-billing" }),
    ]);
  });

  it("will not let a label name two concepts, and says so at the field", () => {
    renderAt(draft(), "/architecture/versions/d/concepts/cap-billing");
    fireEvent.click(screen.getByRole("button", { name: "Edit this concept" }));
    const form = screen.getByRole("form", { name: "Edit Billing" });
    fireEvent.change(within(form).getByLabelText(/Other labels/), { target: { value: "order-entry" } });
    expect(within(form).getByRole("button", { name: "Save the concept" })).toHaveAttribute("aria-disabled", "true");
    expect(within(form).getByText("Correct Other labels first.")).toBeInTheDocument();
    const field = within(form).getByLabelText(/Other labels/);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(/“order-entry” already names Order capture; each label names one concept\./);
  });

  it("offers no concept under itself as its broader one, and a narrower one takes its top concept's domain", () => {
    renderAt(draft(), "/architecture/versions/d/concepts/cap-order-capture");
    fireEvent.click(screen.getByRole("button", { name: "Edit this concept" }));
    const form = screen.getByRole("form", { name: "Edit Order capture" });
    const broader = within(form).getByLabelText("Broader concept");
    expect(within(broader).queryByRole("option", { name: "Quoting" })).not.toBeInTheDocument();
    expect(within(form).getByLabelText("Capability domain")).toHaveValue("sales");
    fireEvent.change(broader, { target: { value: "cap-billing" } });
    expect(within(form).queryByLabelText("Capability domain")).not.toBeInTheDocument();
    expect(within(form).getByText(/sits in its top concept's capability domain: Billing/)).toBeInTheDocument();
    // Back to a top concept, it is where it was: the domain is not lost on the way.
    fireEvent.change(broader, { target: { value: "" } });
    expect(within(form).getByLabelText("Capability domain")).toHaveValue("sales");
    expect(within(form).getByText("Nothing changed yet.")).toBeInTheDocument();
  });

  it("leaves out broader concepts that would take one past three levels", () => {
    const deep = draft({
      business_capabilities: [
        concept("cap-a", "Alpha", { domain_id: "sales" }),
        concept("cap-b", "Beta", { broader_id: "cap-a" }),
        concept("cap-c", "Gamma", { broader_id: "cap-b" }),
        concept("cap-d", "Delta", { domain_id: "billing" }),
        concept("cap-e", "Epsilon", { broader_id: "cap-d" }),
      ],
    } as unknown as Partial<Release>);
    renderAt(deep, "/architecture/versions/d/concepts/cap-d");
    fireEvent.click(screen.getByRole("button", { name: "Edit this concept" }));
    const broader = within(screen.getByRole("form", { name: "Edit Delta" })).getByLabelText("Broader concept");
    // Delta has Epsilon under it: under Beta, Epsilon would be four levels down.
    expect(within(broader).getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(within(broader).queryByRole("option", { name: "Beta" })).not.toBeInTheDocument();
    expect(within(broader).queryByRole("option", { name: "Gamma" })).not.toBeInTheDocument();
  });

  it("will not move a concept away from the business area a linked capability sits in", () => {
    renderAt(draft(), "/architecture/versions/d/concepts/cap-quoting");
    fireEvent.click(screen.getByRole("button", { name: "Edit this concept" }));
    const form = screen.getByRole("form", { name: "Edit Quoting" });
    fireEvent.change(within(form).getByLabelText("Broader concept"), { target: { value: "cap-billing" } });
    expect(within(form).getByText(/The capability Quote orders of CWOM sits in Sales, and its concept would sit in Billing/)).toBeInTheDocument();
  });

  it("says what still names a concept it retires, and takes a successor still in use", () => {
    renderAt(draft(), "/architecture/versions/d/concepts/cap-quoting");
    fireEvent.click(screen.getByRole("button", { name: "Edit this concept" }));
    const form = screen.getByRole("form", { name: "Edit Quoting" });
    fireEvent.click(within(form).getByLabelText(/Retired/));
    expect(within(form).getByText(/Still named by the capability Quote orders of CWOM/)).toBeInTheDocument();
    const successor = within(form).getByLabelText("Replaced by");
    expect(within(successor).queryByRole("option", { name: "Quoting" })).not.toBeInTheDocument();
  });
});

describe("adding and removing concepts", () => {
  it("adds a concept from the list and opens it", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft(), "/architecture/versions/d/concepts");
    fireEvent.click(screen.getByRole("button", { name: "Add a concept" }));
    const form = screen.getByRole("form", { name: "Add a concept" });
    fireEvent.change(within(form).getByLabelText(/Preferred label/), { target: { value: "Managed Wi-Fi" } });
    fireEvent.change(within(form).getByLabelText("Capability domain"), { target: { value: "sales" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add the concept" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved(save).at(-1)).toMatchObject({ id: "cap-managed-wi-fi", pref_label: "Managed Wi-Fi", domain_id: "sales", broader_id: null });
  });

  it("removes only a concept nothing names; while something does, it links there and offers retiring", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(draft({ revision: 6 }));
    renderAt(draft(), "/architecture/versions/d/concepts/cap-order-capture");
    fireEvent.click(screen.getByRole("button", { name: "Remove this concept…" }));
    const blocked = screen.getByRole("form", { name: "Remove Order capture" });
    expect(within(blocked).getByRole("button", { name: "Remove “Order capture”" })).toHaveAttribute("aria-disabled", "true");
    expect(within(blocked).getByRole("link", { name: "The narrower concept Quoting" })).toHaveAttribute("href", "/architecture/versions/d/concepts/cap-quoting");
    fireEvent.click(within(blocked).getByRole("button", { name: "Retire it instead" }));
    const retiring = screen.getByRole("form", { name: "Edit Order capture" });
    expect(within(retiring).getByLabelText(/Retired/)).toBeChecked();
    expect(within(retiring).getByText("Changed: whether it is retired.")).toBeInTheDocument();
    fireEvent.click(within(retiring).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(retiring).getByRole("button", { name: "Discard the changes" }));

    fireEvent.click(screen.getByRole("link", { name: /Billing/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove this concept…" }));
    fireEvent.click(within(screen.getByRole("form", { name: "Remove Billing" })).getByRole("button", { name: "Remove “Billing”" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved(save).map((item) => item.id)).toEqual(["cap-order-capture", "cap-quoting"]);
  });
});

describe("where a concept sits", () => {
  it("groups and reads a narrower concept under its top concept's domain", () => {
    renderAt(draft(), "/architecture/versions/d/concepts/cap-quoting");
    expect(screen.queryByText("No capability domain")).not.toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent === "Under Order capture").length).toBeGreaterThan(0);
    expect(screen.getByText(/From its top concept,/)).toBeInTheDocument();
  });
});

describe("leaving a changed edit", () => {
  it("asks before a link elsewhere on the page throws the edit away, then follows it", async () => {
    renderAt(draft(), "/architecture/versions/d/concepts/cap-billing");
    fireEvent.click(screen.getByRole("button", { name: "Edit this concept" }));
    const form = screen.getByRole("form", { name: "Edit Billing" });
    // The record's own buttons give way while an edit is open, so they cannot drop it either.
    expect(screen.queryByRole("button", { name: "Remove this concept…" })).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Definition"), { target: { value: "Charging customers." } });
    fireEvent.click(screen.getByRole("link", { name: /^Order capture/ }));
    expect(within(form).getByText("Leave, and discard your changes to what it means?")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Keep editing" }));
    expect(within(form).getByLabelText("Definition")).toHaveValue("Charging customers.");
    fireEvent.click(screen.getByRole("link", { name: /^Order capture/ }));
    fireEvent.click(within(form).getByRole("button", { name: "Discard and leave" }));
    expect(await screen.findByRole("heading", { name: "Order capture", level: 2 })).toBeInTheDocument();
  });
});
