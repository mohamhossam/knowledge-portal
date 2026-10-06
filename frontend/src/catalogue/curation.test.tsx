import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type CatalogueDiff, type Release } from "../api/client";
import { ComparePage } from "./ComparePage";
import { DraftDocuments } from "./DraftDocuments";
import type { DraftHook, UploadLine } from "./useDraft";

afterEach(() => vi.restoreAllMocks());

const release = (id: string, extra: Partial<Release> = {}): Release => ({
  id, name: id, revision: 1, status: "published", published_at: "2026-09-01T00:00:00Z",
  systems: [], relationships: [], documents: [], ...extra,
}) as unknown as Release;

function Where() {
  const location = useLocation();
  return <p data-testid="address">{location.search}</p>;
}

describe("comparing two catalogue versions", () => {
  it("compares the two named in the address, and swaps them", async () => {
    vi.spyOn(api, "releases").mockResolvedValue([
      release("spring", { published_at: "2026-04-01T00:00:00Z" }),
      release("summer", { published_at: "2026-07-01T00:00:00Z" }),
      release("next", { status: "draft", published_at: null }),
    ]);
    const changes = vi.spyOn(api, "releaseChanges").mockResolvedValue({
      base_release_id: "spring", draft_release_id: "summer", changes: [],
    } as CatalogueDiff);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/architecture/compare?from=spring&to=summer"]}>
          <Routes>
            <Route element={<Outlet context={{ book: { release: { id: "summer" } } }} />}>
              <Route path="/architecture/compare" element={<><ComparePage /><Where /></>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(changes).toHaveBeenCalledWith("summer", "spring"));
    expect(await screen.findByText("Nothing differs.")).toBeInTheDocument();
    const from = screen.getByRole("combobox", { name: "From" });
    expect(from).toHaveValue("spring");
    // The draft first, then by when each was published; the one in service says so.
    expect([...screen.getByRole("combobox", { name: "To" }).querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "next (in preparation)",
      "summer (in service, 1 Jul 2026)",
      "spring (replaced, 1 Apr 2026)",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent("?from=summer&to=spring"));
    await waitFor(() => expect(changes).toHaveBeenCalledWith("spring", "summer"));
    fireEvent.change(screen.getByRole("combobox", { name: "To" }), { target: { value: "summer" } });
    expect(await screen.findByText("Choose two different versions.")).toBeInTheDocument();
  });
});

describe("adding several documents to a draft", () => {
  it("adds them in one go and says what became of each", async () => {
    const lines: UploadLine[] = [
      { filename: "billing.md", state: "reading", versionId: "v1" },
      { filename: "crm.txt", state: "unread", versionId: "v2", reason: "The model budget for this minute is spent." },
      { filename: "legacy.doc", state: "refused", reason: "Word 97–2003 (.doc) files can't be read." },
    ];
    const read = vi.fn();
    const addDocuments = vi.fn((_input: unknown, options: { onSuccess: (value: UploadLine[]) => void }) => options.onSuccess(lines));
    const idle = { mutate: vi.fn(), isPending: false, isError: false, error: null };
    const draft = {
      extractions: { data: [] }, suggestions: { data: { runs: [], suggestions: [] } },
      read: { ...idle, mutate: read }, cancel: idle, retry: idle, removeDocument: idle,
      addDocument: idle, addDocuments: { ...idle, mutate: addDocuments },
    } as unknown as DraftHook;
    render(<DraftDocuments release={release("next", { status: "draft" })} draft={draft} actorName={() => "Amina"} />);
    const files = [
      new File(["# Billing"], "billing.md", { type: "text/markdown" }),
      new File(["CRM"], "crm.txt", { type: "text/plain" }),
      new File(["x"], "legacy.doc", { type: "application/msword" }),
    ];
    fireEvent.change(screen.getByLabelText("Files"), { target: { files } });
    expect(screen.getByText("3 files chosen; each is titled by its file name.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add the 3 files and read them" }));
    expect(addDocuments).toHaveBeenCalledWith({ files, language: "en" }, expect.anything());
    // The outcome takes focus, and only its summary is announced.
    const summary = screen.getByRole("status");
    expect(summary).toHaveTextContent("2 of 3 files added. Some wait to be read.");
    expect(summary).toHaveFocus();
    expect(screen.getByText("Added; reading started")).toBeInTheDocument();
    expect(screen.getByText("The model budget for this minute is spent.")).toBeInTheDocument();
    expect(screen.getByText("Not added")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect(read).toHaveBeenCalledWith("v2");
  });

  it("moves focus into the form when it opens, and back when it is cancelled", () => {
    const idle = { mutate: vi.fn(), isPending: false, isError: false, error: null };
    const draft = {
      extractions: { data: [] }, suggestions: { data: { runs: [], suggestions: [] } },
      read: idle, cancel: idle, retry: idle, removeDocument: idle, addDocument: idle, addDocuments: idle,
    } as unknown as DraftHook;
    const withOne = release("next", {
      status: "draft",
      documents: [{ id: "v1", title: "Billing", filename: "billing.md", mime_type: "text/markdown", language: "en", checksum: "c", uploaded_by: "fake-owner", uploaded_at: "2026-10-06T09:00:00Z" }],
    } as Partial<Release>);
    render(<DraftDocuments release={withOne} draft={draft} actorName={() => "Amina"} />);
    fireEvent.click(screen.getByRole("button", { name: "Add more documents" }));
    expect(screen.getByRole("heading", { name: "Add documents" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add more documents" })).toHaveFocus();
  });
});
