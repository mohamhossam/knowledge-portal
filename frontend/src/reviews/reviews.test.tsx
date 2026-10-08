import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDocument, type Release, type Reminders, type ReviewStanding, type SystemStanding } from "../api/client";
import { ReviewsDue } from "../app/legacyMasthead";
import { AuthContext, type AuthState } from "../auth/authContext";
import { architectureOverview, libraryOverview, nameDirectory } from "../home/derive";
import { libraryRow } from "../library/libraryRow";
import { DocumentReview } from "./DocumentReview";
import { RemindersPage } from "./RemindersPage";

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

describe("the reminders page", () => {
  it("lists what the person answers for and confirms one in place, focus moving in and back", async () => {
    vi.spyOn(api, "reminders").mockResolvedValue(REMINDERS);
    vi.spyOn(api, "activeRelease").mockResolvedValue(null);
    const confirm = vi.spyOn(api, "confirmDocumentReview").mockResolvedValue(
      document({ review: { ...standing("current"), due_at: "2027-04-04T09:00:00Z" } }),
    );
    render(wrap(<RemindersPage />, ["knowledge_admin", "knowledge_maintainer"]));
    expect(await screen.findByText("2 overdue and 1 due within two weeks, of what you answer for. Each is re-confirmed every 180 days. It stays in use meanwhile; once overdue, requirement work flags citations of it.")).toBeInTheDocument();
    const row = screen.getByRole("link", { name: "Coverage policy" }).closest("tr")!;
    expect(row).toHaveClass("row--delayed");
    expect(within(row).getAllByText("Overdue since 1 Oct 2026").length).toBeGreaterThan(0);
    // Systems falling due on one day share a head, overdue first.
    expect(screen.getAllByRole("heading", { level: 3 }).map((head) => head.textContent)).toEqual([
      "Fell due 30 Jun 2026 · 1 system",
      "Falls due 15 Oct 2026 · 1 system",
    ]);

    const trigger = screen.getByRole("button", { name: "Confirm it is still right: Coverage policy" });
    fireEvent.click(trigger);
    const note = screen.getByLabelText("Note (optional)");
    expect(note).toHaveFocus();
    expect(screen.queryByLabelText(/Why you confirm/)).not.toBeInTheDocument();
    fireEvent.keyDown(note, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Still the policy." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm it" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("d1", { note: "Still the policy.", reason: null }));
    const said = await screen.findByText("Confirmed ‘Coverage policy’. It falls due again on 4 Apr 2027.");
    await waitFor(() => expect(said).toHaveFocus());
  });

  it("confirms every listed system at once for a maintainer, and hides systems from anyone else", async () => {
    vi.spyOn(api, "reminders").mockResolvedValue(REMINDERS);
    vi.spyOn(api, "activeRelease").mockResolvedValue(null);
    const confirm = vi.spyOn(api, "confirmSystemReviews").mockResolvedValue([
      { system_id: "BRM", name: "Billing and Revenue", standing: { ...standing("current"), due_at: "2027-04-04T09:00:00Z" } } as SystemStanding,
    ]);
    const sameDay = { ...REMINDERS, items: [
      ...REMINDERS.items.slice(0, 2),
      { kind: "system", id: "CRM", title: "Customer care", standing: standing("overdue", "2026-06-30T00:00:00Z") },
    ] } as Reminders;
    vi.spyOn(api, "reminders").mockResolvedValue(sameDay);
    const { unmount } = render(wrap(<RemindersPage />, ["knowledge_admin", "knowledge_maintainer"]));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm these 2 systems together: 30 Jun 2026" }));
    // The bulk form names what it confirms, and asks what was checked.
    expect(screen.getByText("Billing and Revenue and Customer care.")).toBeInTheDocument();
    const checked = screen.getByLabelText("What you checked (required)");
    expect(checked).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Confirm 2 systems" }));
    expect(screen.getByText("Say what you checked: it stands for every one of them.")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(checked, { target: { value: "Walked the landscape with the squads." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm 2 systems" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(["BRM", "CRM"], { note: "Walked the landscape with the squads.", reason: null }));
    unmount();

    vi.spyOn(api, "reminders").mockResolvedValue({ ...REMINDERS, items: REMINDERS.items.slice(0, 1) });
    vi.spyOn(api, "systemReviews").mockResolvedValue([
      { system_id: "BRM", name: "Billing and Revenue", standing: standing("overdue", "2026-06-30T00:00:00Z") },
    ] as SystemStanding[]);
    render(wrap(<RemindersPage />));
    await screen.findByRole("link", { name: "Coverage policy" });
    expect(await screen.findByText(/1 system is due for re-confirmation, 1 of them overdue/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /together/ })).not.toBeInTheDocument();
  });

  it("says when nothing is due", async () => {
    vi.spyOn(api, "reminders").mockResolvedValue({ overdue: 0, due_soon: 0, items: [] });
    render(wrap(<RemindersPage />));
    expect(await screen.findByText("Nothing you answer for falls due in the next two weeks.")).toBeInTheDocument();
  });
});

describe("the masthead count", () => {
  it("links to the reminders, says what is overdue, and is absent at zero", async () => {
    vi.spyOn(api, "reminders").mockResolvedValue(REMINDERS);
    const { unmount } = render(wrap(<ReviewsDue />));
    const link = await screen.findByRole("link", { name: "Reviews: 2 overdue · 1 due soon" });
    expect(link).toHaveAttribute("href", "/reminders");
    unmount();
    vi.spyOn(api, "reminders").mockResolvedValue({ overdue: 0, due_soon: 0, items: [] });
    const { container } = render(wrap(<ReviewsDue />));
    await waitFor(() => expect(api.reminders).toHaveBeenCalled());
    expect(container.querySelector(".masthead__reviews")).toBeEmptyDOMElement();
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
  it("ranks a document in service by its review, once nothing else needs it", () => {
    expect(libraryRow(document())).toMatchObject({ rank: "delayed", status: "Re-confirmation overdue", since: "2026-10-01T09:00:00Z" });
    expect(libraryRow(document({ review: standing("due_soon") }))).toMatchObject({
      rank: "due", status: "Re-confirmation due soon", since: "2026-09-17T09:00:00.000Z",
    });
    expect(libraryRow(document({ review: standing("current") }))).toMatchObject({ rank: "service", status: "In service" });
  });

  it("flags overdue documents and systems on the front page", () => {
    const library = libraryOverview([document()]);
    expect(library.lines).toMatchObject([{ rank: "delayed", cells: { status: "Re-confirmation overdue", since: "1 Oct 2026" } }]);
    expect(library.alert).toEqual({ rank: "delayed", text: "1 re-confirmation overdue" });
    expect(library.next.label).toBe("1 document overdue for re-confirmation by its owner");

    const active = { id: "r1", name: "Edition 7", status: "active", revision: 3, published_by: "packaged-seed", published_at: "2026-01-01T00:00:00Z", systems: [{}, {}], relationships: [] } as unknown as Release;
    const standings = [
      { system_id: "BRM", name: "Billing and Revenue", standing: standing("overdue", "2026-06-30T00:00:00Z") },
      { system_id: "CRM", name: "Customer care", standing: standing("due_soon", "2026-10-15T00:00:00Z") },
    ] as SystemStanding[];
    const catalogue = architectureOverview([active], active, new Map(), nameDirectory([]), null, standings);
    expect(catalogue.lines).toMatchObject([{
      rank: "delayed",
      name: "Edition 7",
      statusDetail: "1 more due within two weeks",
      cells: { status: "1 system: re-confirmation overdue", preparedBy: "the packaged initial catalogue" },
    }]);
    expect(catalogue.alert).toEqual({ rank: "delayed", text: "1 re-confirmation overdue" });
    expect(catalogue.next).toEqual({ to: "/reminders", label: "1 system overdue for re-confirmation" });
    expect(catalogue.notes.find((note) => note.id === "reviews")?.text).toContain("The earliest, Billing and Revenue, fell due on 30 Jun 2026.");
  });
});
