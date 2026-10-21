import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type ClassificationOptions, type LibraryDocument } from "../api/client";
import { ApiError } from "../api/errors";
import { checkAxeAfterEach } from "../test/axe";
import { labelOf } from "./classification";
import { ClassificationForm } from "./ClassificationForm";
import { LibraryPage } from "./LibraryPage";

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

const OPTIONS: ClassificationOptions = {
  document_types: [
    { id: "doctype-policy", label: "Policy" },
    { id: "doctype-solution-design", label: "Solution design" },
  ],
  topics: [
    { id: "cap-order-capture", label: "Order capture" },
    { id: "cap-billing", label: "Billing" },
  ],
};

function doc(extra: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id: "d1", title: "Coverage policy", owner: amina, version: 3, can_edit: true, is_owner: true,
    published_id: null, review_fingerprint: null, build_fingerprint: null, versions: [], publications: [],
    acting_as_admin: null, citations: 0, newest: null, document_type: null, topics: [],
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

describe("a library document's type and topics (ADR-0123)", () => {
  it("saves again over a version that only reading moved, but not over someone else's change", async () => {
    vi.spyOn(api, "classificationOptions").mockResolvedValue(OPTIONS);
    const classify = vi.spyOn(api, "classify")
      .mockRejectedValueOnce(new ApiError(409, "Document changed. Reload before retrying."))
      .mockResolvedValueOnce(doc({ version: 6, document_type: "doctype-policy" }));
    vi.spyOn(api, "libraryDocument").mockResolvedValue(doc({ version: 5 }));
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([]);
    const done = vi.fn();
    render(wrap(<ClassificationForm document={doc()} onDone={done} />));
    await screen.findByRole("option", { name: "Policy" });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "doctype-policy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save type and topics" }));

    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(classify).toHaveBeenLastCalledWith("d1", { expected_version: 5, document_type: "doctype-policy", topics: [] });
  });

  it("does not overwrite a type someone else set meanwhile", async () => {
    vi.spyOn(api, "classificationOptions").mockResolvedValue(OPTIONS);
    vi.spyOn(api, "classify").mockRejectedValue(new ApiError(409, "Document changed. Reload before retrying."));
    vi.spyOn(api, "libraryDocument").mockResolvedValue(doc({ version: 5, document_type: "doctype-solution-design" }));
    render(wrap(<ClassificationForm document={doc()} onDone={vi.fn()} />));
    await screen.findByRole("option", { name: "Policy" });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "doctype-policy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save type and topics" }));

    expect(await screen.findByText(/Someone changed its type or topics meanwhile/)).toBeInTheDocument();
    expect(api.classify).toHaveBeenCalledTimes(1);
  });

  it("names an id the catalogue no longer offers", () => {
    expect(labelOf(OPTIONS, "topics", "cap-billing")).toBe("Billing");
    expect(labelOf(OPTIONS, "topics", "cap-gone")).toBe("cap-gone (no longer in the catalogue)");
  });

  it("filters the library by type, and says each document's type and topics", async () => {
    vi.spyOn(api, "classificationOptions").mockResolvedValue(OPTIONS);
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([
      doc({ document_type: "doctype-policy", topics: ["cap-billing"] }),
      doc({ id: "d2", title: "Order Hub design", document_type: "doctype-solution-design" }),
    ]);
    render(wrap(<LibraryPage />, "/library?type=doctype-policy&doc=d1"));

    expect(await screen.findByRole("link", { name: /Coverage policy/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Order Hub design/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toHaveValue("doctype-policy");
    expect(await screen.findByText("Policy", { selector: "dd, dd *" })).toBeInTheDocument();
    expect(screen.getByText("Billing", { selector: "dd, dd *" })).toBeInTheDocument();
  });

  it("lets the owner choose a type and add a topic, then saves them", async () => {
    vi.spyOn(api, "classificationOptions").mockResolvedValue(OPTIONS);
    const classify = vi.spyOn(api, "classify").mockResolvedValue(doc({ version: 4, document_type: "doctype-policy", topics: ["cap-billing"] }));
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([]);
    const done = vi.fn();
    render(wrap(<ClassificationForm document={doc()} onDone={done} />));

    await screen.findByRole("option", { name: "Policy" });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "doctype-policy" } });
    const topic = screen.getByRole("combobox", { name: "Add a topic" });
    fireEvent.focus(topic);
    fireEvent.change(topic, { target: { value: "bill" } });
    fireEvent.keyDown(topic, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Remove Billing" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save type and topics" }));

    await waitFor(() => expect(done).toHaveBeenCalledWith("Its type and topics are saved."));
    expect(classify).toHaveBeenCalledWith("d1", { expected_version: 3, document_type: "doctype-policy", topics: ["cap-billing"] });
  });
});
