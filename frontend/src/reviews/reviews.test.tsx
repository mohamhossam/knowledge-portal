import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Actor, type LibraryDocument, type Release, type Reminders, type ReviewStanding, type SystemStanding } from "../api/client";
import { AuthContext, type AuthState } from "../auth/authContext";
import { architectureOverview, libraryOverview, nameDirectory } from "../home/derive";
import { DocumentReview } from "./DocumentReview";
import { YourWork } from "../work/YourWork";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const amina = { id: "fake-owner", display_name: "Amina Owner", email: null };

function standing(state: ReviewStanding["state"], due = "2026-10-01T09:00:00Z"): ReviewStanding {
  return { state, due_at: due, last_reviewed_at: "2026-04-04T09:00:00Z", reviewer: amina } as unknown as ReviewStanding;
}

function auth(roles: string[]): AuthState {
  return {
    actor: { id: "fake-owner", display_name: "Amina Owner", email: null, roles },
    config: null, loading: false, denied: false, reader: null, error: null, sessionExpired: false,
    signIn: vi.fn(), signOut: vi.fn(), switchFakeActor: vi.fn(),
  };
}

function wrap(children: ReactNode, roles: string[] = ["knowledge_admin"]) {
  return (
    <AuthContext.Provider value={auth(roles)}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

/** A document in service, approved on 4 Apr 2026, as its owner or another admin sees it. */
function document(extra: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id: "d1", title: "Coverage policy", owner: amina, version: 4, can_edit: true, is_owner: true,
    published_id: "p1", review_fingerprint: null, build_fingerprint: null, acting_as_admin: null, citations: 1,
    versions: [{ id: "v1", number: 1, stage: "ready_for_review", uploaded_at: "2026-04-01T09:00:00Z", uploaded_by: amina, revisions: [], blocks: [] }],
    publications: [{ id: "p1", version_id: "v1", approved_at: "2026-04-04T09:00:00Z", approved_by: amina, activated_at: "2026-04-04T09:05:00Z", withdrawn_at: null }],
    newest: { id: "v1", number: 1, stage: "ready_for_review", uploaded_at: "2026-04-01T09:00:00Z", uploaded_by: amina },
    review: standing("overdue"),
    ...extra,
  } as unknown as LibraryDocument;
}

const REMINDERS: Reminders = {
  overdue: 2,
  due_soon: 1,
  items: [
    { kind: "document", id: "d1", title: "Coverage policy", standing: standing("overdue") },
    { kind: "system", id: "BRM", title: "Billing and Revenue", standing: standing("overdue", "2026-06-30T00:00:00Z") },
    { kind: "system", id: "CRM", title: "Customer care", standing: standing("due_soon", "2026-10-15T00:00:00Z") },
  ],
};

/** To do's reads, empty but for the reminders (re-confirmations are confirmed on To do, UX rebuild phase 2). */
function todo(reminders: Reminders) {
  vi.spyOn(api, "reminders").mockResolvedValue(reminders);
  vi.spyOn(api, "activeRelease").mockResolvedValue(null);
  vi.spyOn(api, "libraryDocuments").mockResolvedValue([]);
  vi.spyOn(api, "releases").mockResolvedValue([]);
  vi.spyOn(api, "organisation").mockResolvedValue({ squads: [], people: [], products: [], value_streams: [] } as never);
}

describe("re-confirmations on To do", () => {
  it("lists what the person answers for and confirms one in place, focus moving in and back", async () => {
    todo(REMINDERS);
    const confirm = vi.spyOn(api, "confirmDocumentReview").mockResolvedValue(
      document({ review: { ...standing("current"), due_at: "2027-04-04T09:00:00Z" } }),
    );
    render(wrap(<YourWork />, ["knowledge_admin", "knowledge_maintainer"]));
    const due = await screen.findByRole("region", { name: /Re-confirmations due/ });
    // Overdue first, longest overdue first; systems falling due on different days are apart.
    expect(within(due).getAllByRole("heading", { level: 3 }).map((head) => head.textContent)).toEqual([
      "Confirm Billing and Revenue is still right",
      "Confirm ‘Coverage policy’ is still right",
      "Confirm Customer care is still right",
    ]);
    expect(within(due).getAllByText("Overdue since 1 Oct 2026").length).toBe(1);

    const trigger = screen.getByRole("button", { name: "Confirm…: Coverage policy" });
    fireEvent.click(trigger);
    const note = await screen.findByLabelText("Note (optional)");
    await waitFor(() => expect(note).toHaveFocus());
    fireEvent.keyDown(note, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.change(await screen.findByLabelText("Note (optional)"), { target: { value: "Still the policy." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm it" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("d1", { note: "Still the policy.", reason: null }));
    const said = await screen.findByText("Confirmed ‘Coverage policy’. It falls due again on 4 Apr 2027.");
    await waitFor(() => expect(said).toHaveFocus());
  });

  it("confirms systems due the same day together, asking what was checked", async () => {
    const sameDay = { ...REMINDERS, items: [
      ...REMINDERS.items.slice(0, 2),
      { kind: "system", id: "CRM", title: "Customer care", standing: standing("overdue", "2026-06-30T00:00:00Z") },
    ] } as Reminders;
    todo(sameDay);
    const confirm = vi.spyOn(api, "confirmSystemReviews").mockResolvedValue([
      { system_id: "BRM", name: "Billing and Revenue", standing: { ...standing("current"), due_at: "2027-04-04T09:00:00Z" } } as SystemStanding,
      { system_id: "CRM", name: "Customer care", standing: { ...standing("current"), due_at: "2027-04-04T09:00:00Z" } } as SystemStanding,
    ]);
    render(wrap(<YourWork />, ["knowledge_admin", "knowledge_maintainer"]));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm 2 systems…: 2 systems" }));
    // The panel names what it confirms, and asks what was checked.
    expect(screen.getAllByText("Billing and Revenue and Customer care.").length).toBeGreaterThan(0);
    const checked = await screen.findByLabelText("What you checked");
    fireEvent.click(screen.getByRole("button", { name: "Confirm 2 systems" }));
    expect(await screen.findByText(/Give a reason\./)).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(checked, { target: { value: "Walked the landscape with the squads." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm 2 systems" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(["BRM", "CRM"], { note: "Walked the landscape with the squads.", reason: null }));
    expect(await screen.findByText("Confirmed 2 systems. They fall due again on 4 Apr 2027.")).toBeInTheDocument();
  });

  it("says when nothing is due", async () => {
    todo({ overdue: 0, due_soon: 0, items: [] });
    render(wrap(<YourWork />));
    expect(await screen.findByText("Nothing needs you.")).toBeInTheDocument();
    expect(screen.getByText("No re-confirmations are scheduled.")).toBeInTheDocument();
  });
});

describe("a document's review line", () => {
  it("counts the approval as a review, and asks another admin why they confirm for its owner", async () => {
    const confirm = vi.spyOn(api, "confirmDocumentReview").mockResolvedValue(document({ review: standing("current", "2027-04-04T09:00:00Z") }));
    render(wrap(<DocumentReview document={document({ is_owner: false, can_edit: false })} />));
    expect(screen.getByText(/Not confirmed since its approval/)).toBeInTheDocument();
    expect(screen.getByText("Overdue since 1 Oct 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm it is still right for Amina Owner…" }));
    const why = screen.getByLabelText("Why you confirm it for Amina Owner (required)");
    expect(why).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Confirm for Amina Owner" }));
    expect(screen.getByText("Say why: it is kept with the confirmation.")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(why, { target: { value: "Amina is away." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm for Amina Owner" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("d1", { note: null, reason: "Amina is away." }));
    expect(await screen.findByText("Confirmed. It falls due again on 4 Apr 2027.")).toBeInTheDocument();
  });

  it("says nothing for a document with nothing in service", () => {
    const { container } = render(wrap(<DocumentReview document={document({ review: null })} />));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("reviews in the tables", () => {
  // The library's row says "Re-confirmation overdue" beside its state: library/curation.test.tsx.
  it("flags overdue documents and systems on the front page", () => {
    const library = libraryOverview([document()]);
    expect(library.lines).toMatchObject([{ rank: "delayed", cells: { status: "Re-confirmation overdue", since: "1 Oct 2026" } }]);
    expect(library.alert).toEqual({ rank: "delayed", text: "1 re-confirmation overdue" });
    expect(library.next.label).toBe("1 document overdue for re-confirmation by its owner");

    const active = { id: "r1", name: "Edition 7", status: "active", revision: 3, published_by: "ana", published_at: "2026-01-01T00:00:00Z", systems: [{}, {}], relationships: [] } as unknown as Release;
    const standings = [
      { system_id: "BRM", name: "Billing and Revenue", standing: standing("overdue", "2026-06-30T00:00:00Z") },
      { system_id: "CRM", name: "Customer care", standing: standing("due_soon", "2026-10-15T00:00:00Z") },
    ] as SystemStanding[];
    const catalogue = architectureOverview([active], active, new Map(), nameDirectory([{ id: "ana", display_name: "Ana" } as Actor]), null, standings);
    expect(catalogue.lines).toMatchObject([{
      rank: "delayed",
      name: "Edition 7",
      statusDetail: "1 more due within two weeks",
      cells: { status: "1 system: re-confirmation overdue", preparedBy: "Ana" },
    }]);
    expect(catalogue.alert).toEqual({ rank: "delayed", text: "1 re-confirmation overdue" });
    expect(catalogue.next).toEqual({ to: "/", label: "1 system overdue for re-confirmation" });
    expect(catalogue.notes.find((note) => note.id === "reviews")?.text).toContain("The earliest, Billing and Revenue, fell due on 30 Jun 2026.");
  });
});
