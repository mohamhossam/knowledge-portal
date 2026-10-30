import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { checkAxeAfterEach } from "../test/axe";
import { catalogue } from "./catalogue";
import type { CatalogueContext } from "./useCatalogue";
import { VocabularyPage } from "./VocabularyPage";
import { schemeIssue, termIdFor } from "./vocabularyEditing";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

const term = (id: string, scheme: string, pref_label: string, extra: object = {}) => ({
  id, scheme, pref_label, alt_labels: [], close_match: [], deprecated: false, accepted: [], ...extra,
});

/** A draft with roles, information entities and a vocabulary a curator defined for offerings' NFR quality. */
const RELEASE = {
  id: "draft-1", name: "October", revision: 4, status: "draft", documents: [],
  systems: [
    { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [], constraints: [], masters: ["entity-customer"], reads: [] },
  ],
  relationships: [],
  journeys: [
    {
      id: "new", name: "New activation", activities: [{ number: "10", name: "Orchestrate", role_id: "role-orchestrate", supporting_system_ids: [], component_ids: [], channels: [], channel_entry: false, main_track: true }],
      flow_rules: [], integrations: [], edges: [], channel_edges: [], shared_edges: [], accepted: [], former_ids: [],
    },
  ],
  schemes: [{ id: "nfr_quality", name: "NFR quality", definition: "How well an offering must work.", fields: ["nfr_quality"] }],
  vocabulary: [
    term("role-orchestrate", "responsibility_role", "Orchestrate", { rank: 1 }),
    term("role-activate", "responsibility_role", "Activate", { rank: 2 }),
    term("role-bill", "responsibility_role", "Bill", { rank: 3 }),
    term("entity-customer", "information_entity", "Customer", { alt_labels: ["Party"], definition: "Who buys from us." }),
    term("entity-order", "information_entity", "Order"),
    term("api-tmf622", "open_api", "Product Ordering", { notation: "TMF622" }),
    term("nfr-quality-availability", "nfr_quality", "Availability"),
    term("doctype-hld", "document_type", "High-level design", { alt_labels: ["HLD"] }),
  ],
} as unknown as Release;

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
}

function open(path = "/architecture/vocabulary") {
  vi.spyOn(api, "changeRequests").mockResolvedValue([] as never);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({ outdated_requirements: 0 } as never);
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="vocabulary" element={<VocabularyPage />} />
            <Route path="vocabulary/:termId" element={<VocabularyPage />} />
          </Route>
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sentVocabulary = (save: ReturnType<typeof vi.spyOn>) => (save.mock.calls[0]![1] as { vocabulary: { id: string; rank?: number | null }[] }).vocabulary;

describe("the vocabulary, read", () => {
  it("lists every vocabulary, a curator's too, with how many terms each holds and the fields it covers", () => {
    open();
    const table = screen.getByRole("table", { name: "The vocabularies of this version" });
    const nfr = within(table).getByRole("row", { name: /NFR quality/ });
    expect(within(nfr).getByText("Defined in this version")).toBeInTheDocument();
    expect(within(nfr).getByText("An offering's NFR quality")).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /^Role/ })).getByText("3")).toBeInTheDocument();
  });

  it("reads a term: its labels, what it means, and what in the version uses it", () => {
    open("/architecture/vocabulary/entity-customer");
    expect(screen.getByRole("heading", { name: "Customer", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Who buys from us.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Labels of Customer" })).getByText("Party")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The system CWOM" })).toHaveAttribute("href", "/architecture/systems/cwom");
  });

  it("finds a term by its code", () => {
    open();
    fireEvent.change(screen.getByLabelText("Find a term by any label or code"), { target: { value: "tmf622" } });
    expect(screen.getByRole("link", { name: /Product Ordering/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Customer/ })).not.toBeInTheDocument();
  });

  it("says a role's strength, strongest first", () => {
    open("/architecture/vocabulary/role-activate");
    expect(screen.getByText("2nd of 3 roles, strongest first")).toBeInTheDocument();
  });
});

describe("a term, edited", () => {
  it("edits its labels and code, and says a label another term has under its field once Save is tried", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open("/architecture/vocabulary/entity-order");
    fireEvent.click(screen.getByRole("button", { name: "Edit this term" }));
    const form = screen.getByRole("form", { name: "Edit Order" });
    fireEvent.change(within(form).getByLabelText(/Other labels/), { target: { value: "Party" } });
    expect(within(form).getByText("Correct the other labels first.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the term" }));
    expect(within(form).getByText("“Party” already names Customer; each label and code names one term of the vocabulary.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText(/Other labels/), { target: { value: "Product order" } });
    fireEvent.change(within(form).getByLabelText(/^Code/), { target: { value: " PO " } });
    expect(within(form).getByText("Changed: its labels and code.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the term" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sentVocabulary(save).find((item) => item.id === "entity-order")).toMatchObject({ alt_labels: ["Product order"], notation: "PO" });
  });

  it("adds a term to the vocabulary filtered to, with an id the service would give it", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open("/architecture/vocabulary?in=information_entity");
    fireEvent.click(screen.getByRole("button", { name: "Add a term" }));
    const form = screen.getByRole("form", { name: "Add a term to Information entity" });
    expect(within(form).getByLabelText("Vocabulary")).toHaveValue("information_entity");
    fireEvent.change(within(form).getByLabelText(/Preferred label/), { target: { value: "Billing account" } });
    fireEvent.change(within(form).getByLabelText("Broader term"), { target: { value: "entity-customer" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add the term" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(sentVocabulary(save).at(-1)).toMatchObject({ id: "entity-billing-account", scheme: "information_entity", broader_id: "entity-customer" });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/architecture/vocabulary/entity-billing-account"));
  });

  it("removes only a term nothing uses, and offers to retire one something does", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open("/architecture/vocabulary/role-orchestrate");
    fireEvent.click(screen.getByRole("button", { name: "Remove this term…" }));
    const form = screen.getByRole("form", { name: "Remove Orchestrate" });
    expect(within(form).getByRole("link", { name: "The journey New activation" })).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Retire it instead" }));
    expect(screen.getByRole("form", { name: "Edit Orchestrate" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Retired/)).toBeChecked();
    expect(save).not.toHaveBeenCalled();
  });

  it("orders the roles strongest first, saving every rank from the order", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open("/architecture/vocabulary?in=responsibility_role");
    fireEvent.click(screen.getByRole("button", { name: "Order the roles" }));
    const form = screen.getByRole("form", { name: "Order the roles" });
    fireEvent.click(within(form).getByRole("button", { name: "Move up Bill" }));
    expect(within(form).getByText("Bill moved up: now 2 of 3.")).toBeInTheDocument();
    await waitFor(() => expect(within(form).getByRole("button", { name: "Move up Bill" })).toHaveFocus());
    expect(within(form).getByText("Changed: the order.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the order" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const ranks = Object.fromEntries(sentVocabulary(save).filter((item) => item.id.startsWith("role-")).map((item) => [item.id, item.rank]));
    expect(ranks).toEqual({ "role-orchestrate": 1, "role-bill": 2, "role-activate": 3 });
  });
});

describe("what the critique asked of it", () => {
  it("reads a document type against the library, and keeps one a library document has until it is retyped", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([{ id: "doc-1", title: "Order design", document_type: "doctype-hld" }] as never);
    open("/architecture/vocabulary/doctype-hld");
    expect(await screen.findByRole("link", { name: "The library document Order design" })).toHaveAttribute("href", "/library/doc-1");
    fireEvent.click(screen.getByRole("button", { name: "Remove this term…" }));
    const form = screen.getByRole("form", { name: "Remove High-level design" });
    expect(within(form).getByText("Something still names it; change it first, or retire it instead.")).toBeInTheDocument();
  });

  it("says the library was checked when no document has the type", async () => {
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([] as never);
    open("/architecture/vocabulary/doctype-hld");
    expect(await screen.findByText("Nothing in this version or the library links this term.")).toBeInTheDocument();
  });

  it("takes focus when a term's edit opens, since the button that opened it gives way", async () => {
    open("/architecture/vocabulary/entity-order");
    fireEvent.click(screen.getByRole("button", { name: "Edit this term" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit Order" })).toHaveFocus());
  });

  it("counts nothing as changed when roles that were never ranked are only opened, and says saving records their order", () => {
    const unranked = { ...RELEASE, vocabulary: RELEASE.vocabulary!.map((item) => ({ ...item, rank: null })) } as unknown as Release;
    vi.spyOn(api, "changeRequests").mockResolvedValue([] as never);
    vi.spyOn(api, "mappingImpact").mockResolvedValue({ outdated_requirements: 0 } as never);
    const context: CatalogueContext = { book: catalogue(unranked), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/architecture/vocabulary?in=responsibility_role"]}>
          <Routes>
            <Route path="architecture" element={<Outlet context={context} />}>
              <Route path="vocabulary" element={<VocabularyPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Order the roles" }));
    const form = screen.getByRole("form", { name: "Order the roles" });
    expect(within(form).getByText("Nothing changed yet.")).toBeInTheDocument();
    expect(within(form).getByText("Some roles have no saved order yet; saving records the order shown.")).toBeInTheDocument();
  });

  it("asks before throwing away a new vocabulary with only its fields chosen, and a new term says plainly what it waits for", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Add a vocabulary" }));
    const form = screen.getByRole("form", { name: "Add a vocabulary" });
    fireEvent.click(within(form).getByLabelText("An offering's family"));
    expect(within(form).getByText("Changed: the new vocabulary.")).toBeInTheDocument();
    fireEvent.keyDown(within(form).getByLabelText("An offering's family"), { key: "Escape" });
    expect(within(form).getByText("Discard your changes to the new vocabulary?")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Discard the changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a term" }));
    expect(within(screen.getByRole("form", { name: /^Add a term to/ })).getByText("Give it a preferred label to add it.")).toBeInTheDocument();
  });
});

/** What the clean-up proposed: two written roles to link to Bill, and a new role no term names. */
const PROPOSED = {
  release_id: "draft-1", release_revision: 4, runs: [],
  suggestions: [
    {
      id: "s-bill", status: "proposed", match: "updates_existing", citations: [],
      content: {
        kind: "vocabulary_term", term: term("role-bill", "responsibility_role", "Bill"),
        value_refs: [
          { field: "activity_role", owner_id: "new", value: "BILLS", item: "10" },
          { field: "responsibility_role", owner_id: "bpp", value: "BILLS", item: "billing", part: "cwom" },
        ],
      },
    },
    {
      id: "s-allocate", status: "proposed", match: "new", citations: [],
      content: { kind: "vocabulary_term", term: term("role-allocate", "responsibility_role", "Allocate"), value_refs: [{ field: "activity_role", owner_id: "new", value: "ALLOCATES", item: "10" }] },
    },
    { id: "s-decided", status: "accepted", match: "new", citations: [], content: { kind: "vocabulary_term", term: term("role-old", "responsibility_role", "Old"), value_refs: [] } },
  ],
};

describe("values the draft writes, waiting to be linked to terms", () => {
  it("says on a vocabulary's page what waits, in written values, and asks before reading the draft again", async () => {
    vi.spyOn(api, "suggestions").mockResolvedValue(PROPOSED as never);
    const run = vi.spyOn(api, "cleanUpVocabulary").mockResolvedValue({ candidate_count: 2 } as never);
    open("/architecture/vocabulary?in=responsibility_role");
    // Two values to Bill, already here; one more for the new term Allocate.
    expect(await screen.findByText("2 written values wait to be linked to 1 term; 1 new term is proposed for 1 more.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Decide the role proposals" })).toHaveAttribute("href", "/architecture/decide?vocabulary=responsibility_role");
    // Reading again replaces what still waits, so it asks first, and keeping them changes nothing.
    fireEvent.click(screen.getByRole("button", { name: "Read the draft again…" }));
    expect(screen.getByText(/replaces the 2 proposals still waiting on Decide, in every vocabulary \(3 written values\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Read the draft again…" }));
    fireEvent.click(screen.getByRole("button", { name: "Read it again" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("draft-1"));
    expect(await screen.findByText("The clean-up read the draft again.")).toBeInTheDocument();
  });

  it("counts what waits in each vocabulary on the overview, and beside each term", async () => {
    vi.spyOn(api, "suggestions").mockResolvedValue(PROPOSED as never);
    open();
    expect(await screen.findByRole("link", { name: "3 written values waiting" })).toHaveAttribute("href", "/architecture/vocabulary?in=responsibility_role");
    expect(screen.getByText("2 waiting")).toBeInTheDocument();
  });

  it("lists on a term's record each place that writes it as text, waiting to be linked", async () => {
    vi.spyOn(api, "suggestions").mockResolvedValue(PROPOSED as never);
    open("/architecture/vocabulary/role-bill");
    const waiting = await screen.findByRole("heading", { name: /Waiting to be linked/ });
    const section = waiting.closest("section")!;
    // At the step itself: the journey's steps, that row in view.
    expect(within(section).getByRole("link", { name: "Step 10 of the journey New activation" })).toHaveAttribute("href", "/architecture/journeys/new?row=10");
    expect(within(section).getByRole("link", { name: /^CWOM in the part billing/ })).toHaveAttribute("href", "/architecture/offerings/bpp?tab=components&row=billing");
    expect(within(section).getAllByText("BILLS")).toHaveLength(2);
    expect(within(section).getByRole("link", { name: "Decide the 2 links to Bill" })).toHaveAttribute(
      "href",
      "/architecture/decide?vocabulary=responsibility_role&term=role-bill",
    );
  });

  it("warns before removing a term the clean-up proposes linking values to, and says what to do", async () => {
    vi.spyOn(api, "suggestions").mockResolvedValue(PROPOSED as never);
    open("/architecture/vocabulary/role-bill");
    fireEvent.click(screen.getByRole("button", { name: "Remove this term…" }));
    expect(await screen.findByText(/The clean-up proposes linking 2 written values to it.*Reject it on Decide first, or retire the term instead\./)).toBeInTheDocument();
  });

  it("says when what the clean-up proposed could not be read, never that nothing waits", async () => {
    vi.spyOn(api, "suggestions").mockRejectedValue(new Error("down"));
    open("/architecture/vocabulary?in=responsibility_role");
    expect(await screen.findByText("What the clean-up proposed could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing waits to be linked.")).not.toBeInTheDocument();
  });

  it("says in one line that nothing waits, below what the vocabulary is, and runs the clean-up at once", async () => {
    vi.spyOn(api, "suggestions").mockResolvedValue({ ...PROPOSED, suggestions: [] } as never);
    const run = vi.spyOn(api, "cleanUpVocabulary").mockResolvedValue({ candidate_count: 0 } as never);
    open("/architecture/vocabulary?in=information_entity");
    expect(await screen.findByText("Nothing waits to be linked.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Decide/ })).not.toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings.indexOf("About")).toBeLessThan(headings.findIndex((text) => text?.startsWith("Values waiting")));
    fireEvent.click(screen.getByRole("button", { name: "Clean up the vocabulary" }));
    await waitFor(() => expect(run).toHaveBeenCalled());
  });
});

describe("the vocabulary filter", () => {
  it("only filters the list, keeping the term open beside it and saying which vocabulary it is in", async () => {
    open("/architecture/vocabulary/role-bill");
    fireEvent.change(screen.getByRole("combobox", { name: "Vocabulary" }), { target: { value: "information_entity" } });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/architecture/vocabulary/role-bill?in=information_entity"));
    expect(screen.getByRole("heading", { name: "Bill", level: 2 })).toBeInTheDocument();
    const note = screen.getByText(/open beside the list, is in/).closest("p")!;
    expect(within(note).getByRole("link", { name: "Role" })).toHaveAttribute("href", "/architecture/vocabulary/role-bill?in=responsibility_role");
  });
});

describe("a curator's vocabulary, edited", () => {
  it("adds one with its own name and the fields it covers, a field another covers left out", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Add a vocabulary" }));
    const form = screen.getByRole("form", { name: "Add a vocabulary" });
    expect(within(form).getByLabelText("An offering's NFR quality")).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: "role" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add the vocabulary" }));
    expect(within(form).getByText("Role is the name of another vocabulary; each has its own.")).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: "Offering family" } });
    fireEvent.click(within(form).getByLabelText("An offering's family"));
    fireEvent.click(within(form).getByRole("button", { name: "Add the vocabulary" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect((save.mock.calls[0]![1] as { schemes: unknown[] }).schemes.at(-1)).toMatchObject({ id: "offering_family", name: "Offering family", fields: ["offering_family"] });
  });

  it("removes one only once it holds no terms", () => {
    open("/architecture/vocabulary?in=nfr_quality");
    fireEvent.click(screen.getByRole("button", { name: "Remove this vocabulary…" }));
    const form = screen.getByRole("form", { name: "Remove the vocabulary NFR quality" });
    expect(within(form).getByText("It still holds a term; remove it first.")).toBeInTheDocument();
  });

  it("keeps a field while its terms are still linked through it", () => {
    const linked = {
      ...RELEASE,
      products: [{ id: "bpp", name: "Business Pro Plus", nfr: [{ quality_id: "nfr-quality-availability" }] }],
    } as unknown as Release;
    const scheme = linked.schemes![0]!;
    expect(schemeIssue({ ...scheme, fields: [] }, linked, scheme)).toMatchObject({ field: "fields" });
    expect(schemeIssue({ ...scheme, fields: [] }, RELEASE, scheme)).toBeNull();
  });

  it("makes a new term's id as the service does", () => {
    expect(termIdFor("etom_process", "Order Handling", new Set())).toBe("etom-order-handling");
    expect(termIdFor("nfr_quality", "Availability", new Set(["nfr-quality-availability"]))).toBe("nfr-quality-availability-2");
  });
});
