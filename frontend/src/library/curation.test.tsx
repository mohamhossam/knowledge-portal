import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDocument, type ReviewStanding } from "../api/client";
import { ApiError } from "../api/errors";
import { checkAxeAfterEach } from "../test/axe";
import { ActAsAdmin, ActingBanner } from "./AdminGrant";
import { LibraryPage } from "./LibraryPage";
import { LibraryRetry } from "./LibraryRetry";

checkAxeAfterEach();

class NoResize {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", NoResize));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const amina = { id: { value: "fake-owner" }, display_name: "Amina Owner", email: null };
const ravi = { id: { value: "fake-reviewer" }, display_name: "Ravi Reviewer", email: null };

/** Someone else's document as an admin who doesn't own it sees it: its state, not its content. */
function outline(extra: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id: "d1", title: "Coverage policy", owner: amina, version: 3, can_edit: false, is_owner: false,
    published_id: null, review_fingerprint: null, build_fingerprint: null, versions: [], publications: [],
    acting_as_admin: null, citations: 2,
    newest: { id: "v1", number: 1, stage: "ready_for_review", uploaded_at: "2026-10-05T09:00:00Z", uploaded_by: amina },
    ...extra,
  } as unknown as LibraryDocument;
}

function wrap(children: ReactNode, path = "/library") {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <main>{children}</main>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const overdue = { state: "overdue", due_at: "2026-10-01T09:00:00Z", last_reviewed_at: "2026-04-04T09:00:00Z", reviewer: amina } as unknown as ReviewStanding;

describe("the library list", () => {
  it("groups the documents by where they stand, what needs someone first", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([
      outline(),
      outline({ id: "d2", title: "Billing rules", citations: null, newest: { ...outline().newest!, id: "v2", stage: "failed", error: "Row 2 is short." } }),
      outline({ id: "d3", title: "Old tariffs", citations: 0, newest: { ...outline().newest!, id: "v3", stage: "queued" } }),
    ]);
    render(wrap(<LibraryPage />));
    const ready = await screen.findByRole("list", { name: /^Ready for review/ });
    // Another owner's document: its owner's name, never "Yours".
    expect(within(ready).getByRole("link", { name: /^Coverage policy/ })).toHaveTextContent("Amina Owner");
    const attention = screen.getByRole("list", { name: /^Needs attention/ });
    expect(within(attention).getByRole("link", { name: /^Billing rules/ })).toHaveTextContent("Row 2 is short.");
    expect(within(screen.getByRole("list", { name: /^Being read/ })).getByRole("link", { name: /^Old tariffs/ })).toBeInTheDocument();
    // What needs someone comes first.
    const groups = screen.getAllByRole("list").map((list) => list.getAttribute("aria-labelledby") && list.textContent);
    expect(groups.findIndex((text) => text?.includes("Billing rules"))).toBeLessThan(groups.findIndex((text) => text?.includes("Coverage policy")));
    expect(screen.getByRole("button", { name: "Try reading it again…" })).toBeInTheDocument();
  });

  it("shows the chosen document's summary, with how many requirements cite it and the way into its review", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([
      outline(),
      outline({ id: "d2", title: "Billing rules", citations: null, newest: { ...outline().newest!, id: "v2", stage: "failed", error: "Row 2 is short." } }),
    ]);
    render(wrap(<LibraryPage />, "/library?doc=d1"));
    const record = await screen.findByRole("article", { name: "Coverage policy" });
    expect(within(record).getByRole("link", { name: "2 requirements" })).toHaveAttribute("href", "/library/d1/cited-by");
    expect(within(record).getByRole("link", { name: "Open the review" })).toHaveAttribute("href", "/library/d1");
    expect(screen.getByRole("link", { name: /^Coverage policy/ })).toHaveAttribute("aria-current", "page");
  });

  it("says why a document needs attention, and that Requirement AI couldn't count its citations", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([
      outline({ id: "d2", title: "Billing rules", citations: null, newest: { ...outline().newest!, id: "v2", stage: "failed", error: "Row 2 is short." } }),
    ]);
    render(wrap(<LibraryPage />, "/library?doc=d2"));
    const record = await screen.findByRole("article", { name: "Billing rules" });
    expect(within(record).getByText("Row 2 is short.")).toBeInTheDocument();
    // Unknown, never "None".
    expect(within(record).getByText("Requirement AI didn't say")).toBeInTheDocument();
  });

  it("filters by state and owner from the address", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([
      outline(),
      outline({ id: "d2", title: "Billing rules", is_owner: true, can_edit: true, newest: { ...outline().newest!, id: "v2", stage: "failed" } }),
    ]);
    render(wrap(<LibraryPage />, "/library?status=attention"));
    expect(await screen.findByRole("link", { name: /^Billing rules/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Coverage policy/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("State")).toHaveValue("attention");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("link", { name: /^Coverage policy/ })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Owner"), "mine");
    expect(screen.queryByRole("link", { name: /^Coverage policy/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Billing rules/ })).toHaveTextContent("Yours");
  });

  it("says a document in service is overdue for re-confirmation", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([
      outline({
        published_id: "p1", review: overdue,
        newest: { ...outline().newest!, stage: "ready_for_review" },
        publications: [{ id: "p1", version_id: "v1", activated_at: "2026-04-04T09:00:00Z", approved_at: "2026-04-04T09:00:00Z", withdrawn_at: null, requires_activation: false, indexing_attempts: 1 }],
      } as unknown as Partial<LibraryDocument>),
    ]);
    render(wrap(<LibraryPage />));
    const row = await screen.findByRole("link", { name: /^Coverage policy/ });
    expect(within(screen.getByRole("list", { name: /^In service/ })).getByRole("link", { name: /^Coverage policy/ })).toBe(row);
    expect(row).toHaveTextContent("Re-confirmation overdue");
  });

  it("says when the library couldn't be read, and tries again", async () => {
    const read = vi.spyOn(api, "libraryDocuments").mockRejectedValue(new ApiError(503, "The service is busy."));
    render(wrap(<LibraryPage />));
    expect(await screen.findByText("Couldn't read the library.")).toBeInTheDocument();
    read.mockResolvedValue([outline()]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /^Coverage policy/ })).toBeInTheDocument();
  });
});

describe("retrying the library in bulk", () => {
  it("asks in place with the documents named, retries, says how many, and moves focus to what it said", async () => {
    const retry = vi.spyOn(api, "retryLibrary").mockResolvedValue({ scope: "indexing", documents: 3 });
    const done = vi.fn();
    render(wrap(<LibraryRetry stopped={{ reading: [], indexing: ["Coverage", "Billing", "Roaming"] }} onDone={done} />));
    expect(screen.queryByRole("button", { name: /reading/ })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Try indexing all 3 again…" });
    await userEvent.click(trigger);
    const panel = screen.getByRole("region", { name: "Try indexing 3 documents again" });
    expect(within(panel).getByRole("list", { name: "Documents" })).toHaveTextContent("CoverageBillingRoaming");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Try indexing 3 documents again" }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith("indexing"));
    const said = await screen.findByText("Indexing 3 documents again. Jobs shows the progress.");
    await waitFor(() => expect(said).toHaveFocus());
    expect(done).toHaveBeenCalled();
  });

  it("names the one document when only one stopped", async () => {
    render(wrap(<LibraryRetry stopped={{ reading: ["Old tariff sheet"], indexing: [] }} onDone={vi.fn()} />));
    await userEvent.click(screen.getByRole("button", { name: "Try reading it again…" }));
    expect(screen.getByRole("region", { name: "Try reading 1 document again" })).toHaveTextContent("Old tariff sheet");
  });
});

describe("acting as admin on someone else's document", () => {
  it("asks why first, then opens the grant and says until when", async () => {
    const open = vi.spyOn(api, "openAdminGrant").mockResolvedValue({
      id: "g", document_id: "d1", admin: ravi, reason: "Owner on leave.",
      granted_at: "2026-10-06T09:00:00Z", expires_at: "2026-10-06T17:00:00Z", ended_at: null,
    } as never);
    const done = vi.fn();
    render(wrap(<ActAsAdmin document={outline()} onDone={done} />));
    expect(screen.getByText(/owns this document/)).toHaveTextContent("Amina Owner owns this document");
    await userEvent.click(screen.getByRole("button", { name: "Act as admin on Amina Owner's behalf…" }));
    const why = screen.getByRole("textbox", { name: "Why" });
    expect(why).toHaveFocus();
    expect(screen.getByText(/Uploading new versions and building its search index for tables stay with Amina Owner/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Act as admin" }));
    expect(why).toHaveAttribute("aria-invalid", "true");
    expect(open).not.toHaveBeenCalled();
    await userEvent.type(why, "Owner on leave.");
    await userEvent.click(screen.getByRole("button", { name: "Act as admin" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("d1", "Owner on leave."));
    await waitFor(() => expect(done).toHaveBeenCalledWith(expect.stringMatching(/^You're acting as admin on Amina Owner's behalf until/)));
  });

  it("says a refusal in the panel and lets the admin go on from it", async () => {
    vi.spyOn(api, "openAdminGrant").mockRejectedValue(new ApiError(403, "Only a knowledge admin can act for a document's owner."));
    render(wrap(<ActAsAdmin document={outline()} onDone={vi.fn()} />));
    await userEvent.click(screen.getByRole("button", { name: /Act as admin on/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "Why" }), "Curious.");
    await userEvent.click(screen.getByRole("button", { name: "Act as admin" }));
    expect(await screen.findByText("Only a knowledge admin can act for a document's owner.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows whose document, until when and why, and stops when asked", async () => {
    const end = vi.spyOn(api, "endAdminGrant").mockResolvedValue();
    const acting = outline({
      can_edit: true,
      acting_as_admin: {
        id: "g", document_id: "d1", admin: ravi, reason: "Owner on leave.",
        granted_at: "2026-10-06T09:00:00Z", expires_at: "2026-10-06T17:00:00Z", ended_at: null,
      },
    } as Partial<LibraryDocument>);
    const done = vi.fn();
    render(wrap(<ActingBanner document={acting} onDone={done} />));
    const banner = screen.getByRole("region", { name: "Acting as admin" });
    expect(banner).toHaveTextContent("Acting as admin on Amina Owner's behalf");
    expect(banner).toHaveTextContent("Owner on leave.");
    fireEvent.click(within(banner).getByRole("button", { name: "Stop acting as admin" }));
    await waitFor(() => expect(end).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(done).toHaveBeenCalled());
  });
});
