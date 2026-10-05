import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release, type Suggestion } from "../api/client";
import { catalogue } from "./catalogue";
import { SuggestionsPage } from "./SuggestionsPage";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const draft = {
  id: "d", name: "October", revision: 3, status: "draft", relationships: [],
  documents: [{ id: "v1", title: "Integration design", filename: "design.txt", language: "en", mime_type: "text/plain", uploaded_by: "fake-owner" }],
  systems: [
    { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [{ id: "milestones", name: "Milestone tracker", aliases: [] }], constraints: [] },
    { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
} as unknown as Release;

const base = (id: string, content: Partial<Suggestion["content"]>, extra: Partial<Suggestion> = {}) => ({
  id, document_version_id: "v1", citations: [{ location: "line 1", quote: "System: x" }], match: "new", status: "proposed",
  edited: false, model: "fake", prompt_version: "1", created_at: "", decided_by: null, decided_at: null, basis: "stated",
  rationale: null, possible_matches: [], system_name: null, target_system_name: null,
  content: { kind: "system", system_id: "x", name: "", aliases: [], triggers: [], text: "", ...content },
  ...extra,
}) as Suggestion;

const suggestions = [
  base("hub", { kind: "system", system_id: "order-hub", name: "Order Hub" }),
  base("store", { kind: "constraint", system_id: "cwom", text: "Nights only" }, { system_name: "CWOM" }),
  base("cap", { kind: "capability", system_id: "cwom", capability_id: "tracking", name: "Tracking", triggers: ["track orders"] }, { system_name: "CWOM" }),
  base("crm", { kind: "system", system_id: "dynamics-crm", name: "Dynamics CRM" }, {
    possible_matches: [{ role: "system", written_as: "Dynamics CRM", system_id: "bcrm", system_name: "BCRM", reason: "Similar name to BCRM." }],
  }),
];

function renderPage() {
  vi.spyOn(api, "suggestions").mockResolvedValue({ release_id: "d", release_revision: 3, suggestions, runs: [] } as never);
  vi.spyOn(api, "extractions").mockResolvedValue([]);
  let revision = 3;
  const decide = vi.spyOn(api, "decide").mockImplementation(async () => ({ ...draft, revision: ++revision }) as Release);
  const context: CatalogueContext = { book: catalogue(draft), base: "/architecture/versions/d", inService: false, actorName: () => "Amina Owner" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/s"]}>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="s" element={<SuggestionsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { decide };
}

// The keys are taken by each row's change, a disclosure button that is the row's one tab stop.
const rowOf = (text: string) => screen.getByText(text).closest("button")!;

describe("SuggestionsPage", () => {
  it("groups by system, new first, and accepts the ready ones in sequence from the keyboard", async () => {
    const { decide } = renderPage();
    await screen.findByText("Adds the system Order Hub");
    const heads = screen.getAllByRole("columnheader").filter((cell) => cell.closest(".galley__head")).map((cell) => cell.textContent);
    expect(heads[0]).toContain("New system");
    expect(heads.at(-1)).toContain("CWOM");

    fireEvent.keyDown(rowOf("Adds the system Order Hub"), { key: "a" });
    fireEvent.keyDown(rowOf("Adds the constraint “Nights only”"), { key: "a" });
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
    // Each decision carries the revision the one before it returned.
    expect(decide.mock.calls[0]).toEqual(["d", "hub", { expected_revision: 3, accept: true, content: null }]);
    expect(decide.mock.calls[1]).toEqual(["d", "store", { expected_revision: 4, accept: true, content: null }]);
  });

  it("opens a possible match instead of accepting it, and links the system chosen", async () => {
    const { decide } = renderPage();
    await screen.findByText("Adds the system Dynamics CRM");
    fireEvent.keyDown(rowOf("Adds the system Dynamics CRM"), { key: "a" });
    const detail = await screen.findByText("Is “Dynamics CRM” a system the draft already has?");
    const decision = detail.closest(".decision") as HTMLElement;
    const accept = within(decision).getByRole("button", { name: "Accept" });
    expect(accept).toBeDisabled();
    fireEvent.click(within(decision).getByLabelText(/Yes, it is/));
    fireEvent.click(accept);
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0]![2]).toMatchObject({ accept: true, content: { kind: "system", system_id: "bcrm", name: "Dynamics CRM" } });
  });

  it("edits a capability's phrases, then accepts it as edited", async () => {
    const { decide } = renderPage();
    await screen.findByText(/Adds the capability Tracking/);
    fireEvent.keyDown(rowOf("Adds the capability Tracking, matched by “track orders”"), { key: "e" });
    const phrases = await screen.findByLabelText(/Matched by/);
    fireEvent.change(phrases, { target: { value: "track orders\n  order milestones  \n" } });
    fireEvent.change(screen.getByLabelText("Delivered by the component"), { target: { value: "milestones" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept as edited" }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0]![2]).toMatchObject({
      accept: true,
      content: { kind: "capability", system_id: "cwom", component_id: "milestones", triggers: ["track orders", "order milestones"] },
    });
  });

  it("says a row's open state on its change button, never on the row", async () => {
    renderPage();
    await screen.findByText("Adds the system Order Hub");
    const rows = document.querySelectorAll("tr.suggestion");
    expect(rows.length).toBe(suggestions.length);
    for (const row of rows) expect(row).not.toHaveAttribute("aria-expanded");

    const change = screen.getByRole("button", { name: "Adds the system Order Hub" });
    expect(change).toHaveAttribute("aria-expanded", "false");
    expect(change).not.toHaveAttribute("aria-controls");
    // One row in the tab order: the first, until another is focused.
    const stops = [...document.querySelectorAll(".suggestion__toggle")].filter((item) => item.getAttribute("tabindex") === "0");
    expect(stops).toEqual([rowOf("Adds the system Dynamics CRM")]);

    fireEvent.keyDown(change, { key: "Enter" });
    expect(change).toHaveAttribute("aria-expanded", "true");
    const detail = document.getElementById(change.getAttribute("aria-controls")!);
    expect(detail).toHaveClass("suggestion-detail");
    expect(within(detail!).getByText("From the document")).toBeInTheDocument();

    fireEvent.keyDown(change, { key: "Escape" });
    expect(change).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".suggestion-detail")).toBeNull();

    // The keys still move between rows from the button.
    fireEvent.keyDown(change, { key: "k" });
    await waitFor(() => expect(rowOf("Adds the system Dynamics CRM")).toHaveFocus());
  });

  it("scrolls an opened row's detail into view, keeping the row in view", async () => {
    renderPage();
    await screen.findByText("Adds the system Order Hub");
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    fireEvent.keyDown(rowOf("Adds the system Order Hub"), { key: "Enter" });
    const detail = document.querySelector(".suggestion-detail")!;
    const row = rowOf("Adds the system Order Hub").closest("tr")!;
    const targets = scrolled.mock.contexts;
    expect(targets).toContain(detail);
    // The row comes after its detail, so a detail taller than the window never pushes the row out.
    expect(targets.lastIndexOf(row)).toBeGreaterThan(targets.indexOf(detail));
  });

  it("moves focus into the editor when editing starts, and keeps the edits when it stops", async () => {
    const { decide } = renderPage();
    const sentence = "Adds the capability Tracking, matched by “track orders”";
    await screen.findByText(sentence);
    const change = rowOf(sentence);
    fireEvent.keyDown(change, { key: "Enter" });
    const editButton = screen.getByRole("button", { name: "Edit, then accept" });
    editButton.focus();
    fireEvent.click(editButton);

    // Focus lands on the editor's title, so the next Tab goes into its fields.
    const title = await screen.findByRole("heading", { name: "Edit, then accept" });
    await waitFor(() => expect(title).toHaveFocus());

    // Escape anywhere in the detail stops editing, the edits kept and focus back on the button.
    fireEvent.change(screen.getByLabelText(/Matched by/), { target: { value: "track orders\norder milestones" } });
    fireEvent.keyDown(title, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Edit, then accept" })).toBeNull();
    const back = screen.getByRole("button", { name: "Back to your edits" });
    await waitFor(() => expect(back).toHaveFocus());
    expect(screen.getByText(/You have edits not accepted yet/)).toBeInTheDocument();
    // Accept then says it leaves the edits out.
    expect(screen.getByRole("button", { name: "Accept as the document said" })).toBeInTheDocument();

    // Closing the row keeps them too, and says so.
    fireEvent.keyDown(change, { key: "Enter" });
    expect(change).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Closed. Your edits are kept while this page stays open.")).toBeInTheDocument();
    expect(within(change.closest("tr")!).getByText("Edited, not accepted yet")).toBeInTheDocument();
    // The row's change is described by its state, so the kept edits are heard on the button.
    expect(document.getElementById(change.getAttribute("aria-describedby")!)).toHaveTextContent("Edited, not accepted yet");

    // "a" on a row with kept edits opens it instead of accepting it as the document said.
    fireEvent.keyDown(change, { key: "a" });
    expect(change).toHaveAttribute("aria-expanded", "true");
    expect(decide).not.toHaveBeenCalled();
    fireEvent.keyDown(change, { key: "Escape" });

    // Opening the editor again takes up the edits where they were left.
    fireEvent.keyDown(change, { key: "e" });
    expect(await screen.findByLabelText(/Matched by/)).toHaveValue("track orders\norder milestones");
    fireEvent.click(screen.getByRole("button", { name: "Accept as edited" }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0]![2]).toMatchObject({ accept: true, content: { triggers: ["track orders", "order milestones"] } });
  });

  it("drops kept edits only when asked", async () => {
    renderPage();
    const sentence = "Adds the capability Tracking, matched by “track orders”";
    await screen.findByText(sentence);
    fireEvent.keyDown(rowOf(sentence), { key: "e" });
    fireEvent.change(await screen.findByLabelText(/Matched by/), { target: { value: "order milestones" } });
    fireEvent.click(screen.getByRole("button", { name: "Stop editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Drop the edits" }));
    expect(screen.queryByText(/You have edits not accepted yet/)).toBeNull();
    expect(screen.getByText("Your edits are dropped.")).toBeInTheDocument();
    // Focus stays in the decision, on the edit button, now offering a fresh edit.
    const edit = screen.getByRole("button", { name: "Edit, then accept" });
    expect(edit).toHaveFocus();
    fireEvent.click(edit);
    expect(await screen.findByLabelText(/Matched by/)).toHaveValue("track orders");
  });

  it("rejects from the keyboard", async () => {
    const { decide } = renderPage();
    await screen.findByText("Adds the system Order Hub");
    fireEvent.keyDown(rowOf("Adds the system Order Hub"), { key: "r" });
    await waitFor(() => expect(decide).toHaveBeenCalledWith("d", "hub", { expected_revision: 3, accept: false, content: null }));
  });
});
