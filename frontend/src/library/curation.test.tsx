import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDocument } from "../api/client";
import { ApiError } from "../api/errors";
import { ActAsAdmin, ActingBanner } from "./AdminGrant";
import { LibraryPage } from "./LibraryPage";
import { LibraryRetry } from "./LibraryRetry";
import { libraryRow } from "./libraryRow";

afterEach(() => vi.restoreAllMocks());

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

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("the library list", () => {
  it("shows where someone else's document stands, and how many requirements cite each", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([
      outline(),
      outline({ id: "d2", title: "Billing rules", citations: null, newest: { ...outline().newest!, id: "v2", stage: "failed" } }),
      outline({ id: "d3", title: "Old tariffs", citations: 0, newest: { ...outline().newest!, id: "v3", stage: "queued" } }),
    ]);
    render(wrap(<LibraryPage />));
    const coverage = (await screen.findByRole("link", { name: "Coverage policy" })).closest("tr")!;
    expect(within(coverage).getByText("Awaiting review")).toBeInTheDocument();
    expect(within(coverage).getByText("2 requirements")).toBeInTheDocument();
    const billing = screen.getByRole("link", { name: "Billing rules" }).closest("tr")!;
    expect(within(billing).getByText("Extraction failed")).toBeInTheDocument();
    // Not in service, and requirement work could not count: both say so with a dash.
    expect(within(billing).getAllByText("—")).toHaveLength(2);
    expect(within(screen.getByRole("link", { name: "Old tariffs" }).closest("tr")!).getByText("None")).toBeInTheDocument();
    // Its owner's name, never "(you)": it is not the admin's.
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read the 1 document that failed again" })).toBeInTheDocument();
  });

  it("reads the outline's newest version for the row", () => {
    expect(libraryRow(outline()).status).toBe("Awaiting review");
    expect(libraryRow(outline({ is_owner: true, can_edit: true })).status).toBe("Awaiting your review");
  });
});

describe("retrying the library in bulk", () => {
  it("asks in place, retries, says how many, and returns focus", async () => {
    const retry = vi.spyOn(api, "retryLibrary").mockResolvedValue({ scope: "indexing", documents: 3 });
    const done = vi.fn();
    render(wrap(<LibraryRetry stopped={{ reading: [], indexing: ["Coverage", "Billing", "Roaming"] }} onDone={done} />));
    expect(screen.queryByRole("button", { name: /failed again/ })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Retry the 3 documents whose indexing stopped" });
    fireEvent.click(trigger);
    const title = screen.getByText("Index these 3 documents again?");
    expect(title).toHaveFocus();
    fireEvent.keyDown(title, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Retry them" }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith("indexing"));
    const said = await screen.findByText("Retrying 3 documents. The table updates as each is indexed.");
    await waitFor(() => expect(said).toHaveFocus());
    expect(done).toHaveBeenCalled();
  });
});

describe("acting as admin on someone else's document", () => {
  it("asks why first, then opens the grant", async () => {
    const open = vi.spyOn(api, "openAdminGrant").mockResolvedValue({
      id: "g", document_id: "d1", admin: ravi, reason: "Owner on leave.",
      granted_at: "2026-10-06T09:00:00Z", expires_at: "2026-10-06T17:00:00Z", ended_at: null,
    } as never);
    render(wrap(<ActAsAdmin document={outline()} />));
    expect(screen.getByText(/Amina Owner owns this document/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Act as admin on Amina Owner’s behalf…" }));
    const why = screen.getByRole("textbox", { name: "Why" });
    expect(why).toHaveFocus();
    expect(screen.getByText(/Uploading new versions and building its search index stay with Amina Owner/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Act as admin" }));
    expect(screen.getByText("Say why: it is kept with every change you make.")).toBeInTheDocument();
    expect(why).toHaveAttribute("aria-invalid", "true");
    expect(open).not.toHaveBeenCalled();
    fireEvent.change(why, { target: { value: "Owner on leave." } });
    fireEvent.click(screen.getByRole("button", { name: "Act as admin" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("d1", "Owner on leave."));
  });

  it("says a refusal and lets the admin go on from it", async () => {
    vi.spyOn(api, "openAdminGrant").mockRejectedValue(new ApiError(403, "Only a knowledge admin can act for a document's owner."));
    render(wrap(<ActAsAdmin document={outline()} />));
    fireEvent.click(screen.getByRole("button", { name: /Act as admin on/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Why" }), { target: { value: "Curious." } });
    fireEvent.click(screen.getByRole("button", { name: "Act as admin" }));
    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("Only a knowledge admin can act for a document's owner.");
    await waitFor(() => expect(refusal).toHaveFocus());
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
    render(wrap(<ActingBanner document={acting} />));
    const banner = screen.getByRole("region", { name: "Acting as admin" });
    expect(banner).toHaveTextContent("Acting as admin on Amina Owner’s behalf");
    expect(banner).toHaveTextContent("Owner on leave.");
    fireEvent.click(within(banner).getByRole("button", { name: "Stop acting as admin" }));
    await waitFor(() => expect(end).toHaveBeenCalledWith("d1"));
  });
});

describe("naming what a single retry touches", () => {
  it("names the one document in the confirmation", () => {
    render(wrap(<LibraryRetry stopped={{ reading: ["Old tariff sheet"], indexing: [] }} onDone={vi.fn()} />));
    fireEvent.click(screen.getByRole("button", { name: "Read the 1 document that failed again" }));
    expect(screen.getByText("Read ‘Old tariff sheet’ again?")).toHaveFocus();
  });
});
