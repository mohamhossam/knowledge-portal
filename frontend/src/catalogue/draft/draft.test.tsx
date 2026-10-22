import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type DocumentExtraction, type Release, type Suggestion } from "../../api/client";
import { CataloguePage } from "../CataloguePage";
import { ChangesStep } from "./ChangesStep";
import { CheckStep } from "./CheckStep";
import { DecideStep } from "./DecideStep";
import { PublishStep } from "./PublishStep";
import { SourcesStep } from "./SourcesStep";
import { checkAxeAfterEach } from "../../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const draft = (extra: Partial<Release> = {}) => ({
  id: "d", name: "October", revision: 3, built_revision: 3, status: "draft", relationships: [], index_profile: "p", created_by: "fake-owner",
  documents: [{ id: "v1", title: "Integration design", filename: "design.txt", language: "en", mime_type: "text/plain", uploaded_by: "fake-owner" }],
  systems: [
    { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [{ id: "milestones", name: "Milestone tracker", aliases: [] }], constraints: [] },
    { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
  ...extra,
}) as unknown as Release;

const base = (id: string, content: Partial<Suggestion["content"]>, extra: Partial<Suggestion> = {}) => ({
  id, document_version_id: "v1", citations: [{ location: "line 1", quote: "System: x" }], match: "new", status: "proposed",
  edited: false, model: "fake", prompt_version: "1", created_at: "", decided_by: null, decided_at: null, basis: "stated",
  rationale: null, possible_matches: [], system_name: null, target_system_name: null,
  content: { kind: "system", system_id: "x", name: "", aliases: [], triggers: [], text: "", ...content },
  ...extra,
}) as Suggestion;

const SUGGESTIONS = [
  base("hub", { kind: "system", system_id: "order-hub", name: "Order Hub" }),
  base("store", { kind: "constraint", system_id: "cwom", text: "Nights only" }, { system_name: "CWOM" }),
  base("cap", { kind: "capability", system_id: "cwom", capability_id: "tracking", name: "Tracking", triggers: ["track orders"] }, { system_name: "CWOM" }),
  base("crm", { kind: "system", system_id: "dynamics-crm", name: "Dynamics CRM" }, {
    possible_matches: [{ role: "system", written_as: "Dynamics CRM", system_id: "bcrm", system_name: "BCRM", reason: "Similar name to BCRM." }],
  }),
];

/** A draft's step, inside the catalogue's own frame, as the app routes it. */
function renderStep(
  step: string,
  { release = draft(), suggestions = SUGGESTIONS, extractions = [] }: { release?: Release; suggestions?: Suggestion[]; extractions?: DocumentExtraction[] } = {},
) {
  vi.spyOn(api, "activeRelease").mockResolvedValue(null);
  vi.spyOn(api, "release").mockResolvedValue(release);
  vi.spyOn(api, "releases").mockResolvedValue([release]);
  vi.spyOn(api, "knownActors").mockResolvedValue([{ id: "fake-owner", display_name: "Amina Owner" }] as never);
  vi.spyOn(api, "changeRequests").mockResolvedValue([]);
  vi.spyOn(api, "suggestions").mockResolvedValue({ release_id: "d", release_revision: release.revision, suggestions, runs: [] } as never);
  vi.spyOn(api, "extractions").mockResolvedValue(extractions);
  vi.spyOn(api, "buildJob").mockResolvedValue(null);
  // Nothing unregistered unless a test says otherwise.
  if (!vi.isMockFunction(api.citations)) vi.spyOn(api, "citations").mockResolvedValue([]);
  vi.spyOn(api, "releaseChanges").mockResolvedValue({
    base_release_id: "live", draft_release_id: "d",
    changes: [{ item: "system", key: "order-hub", label: "Order Hub", change: "added", fields: [] }],
  } as never);
  vi.spyOn(api, "mappingImpact").mockResolvedValue({
    active_release_id: "live", requirements: 7, features: 0, stories: 0, outdated_requirements: 2, outdated_features: 0, outdated_stories: 0,
  });
  vi.spyOn(api, "samples").mockResolvedValue({ revision: 1, updated_at: null, updated_by: null, items: [{ id: "s1", text: "Order Hub takes orders" }] });
  let revision = release.revision;
  const decide = vi.spyOn(api, "decide").mockImplementation(async () => ({ ...release, revision: ++revision }) as Release);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/architecture/versions/d/${step}`]}>
        <Routes>
          <Route path="architecture/versions/:releaseId" element={<CataloguePage />}>
            <Route path="sources" element={<SourcesStep />} />
            <Route path="decide" element={<DecideStep />} />
            <Route path="changes" element={<ChangesStep />} />
            <Route path="check" element={<CheckStep />} />
            <Route path="publish" element={<PublishStep />} />
          </Route>
          <Route path="architecture" element={<p>In service now</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { decide };
}

const cellOf = (text: string) => within(screen.getByRole("grid")).getByText(text).closest("[data-cell-focus]") as HTMLElement;
/** A key pressed on a suggestion in the grid, as a person would: focus on it first. */
const press = async (text: string, key: string) => {
  const cell = cellOf(text);
  cell.focus();
  // The grid takes the row as current on focus, then the key, as two events would.
  await waitFor(() => expect(cell).toHaveAttribute("tabindex", "0"));
  fireEvent.keyDown(cell, { key });
};

describe("the draft's frame", () => {
  it("names the draft and shows its five steps, each saying where it stands", async () => {
    renderStep("decide");
    expect(await screen.findByRole("heading", { level: 1, name: "October" })).toBeInTheDocument();
    const steps = screen.getByRole("navigation", { name: "Steps of this draft" });
    await waitFor(() => expect(within(steps).getAllByRole("link").map((link) => link.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "1Step 1: Sources, 1 source",
      expect.stringMatching(/^2Step 2: Decide, 4 waiting$/),
      expect.stringMatching(/^3Step 3: Changes, 1 change$/),
      "4Step 4: Check, Built",
      "5Step 5: Publish",
    ]));
    await waitFor(() => expect(within(steps).getByRole("link", { name: /Decide/ })).toHaveAttribute("aria-current", "page"));
    expect(document.title).toBe("Decide · October · Catalogue draft · Knowledge portal");
  });

  it("removes the draft only through its consequence", async () => {
    const discard = vi.spyOn(api, "discardDraft").mockResolvedValue(undefined as never);
    renderStep("sources");
    fireEvent.click(await screen.findByRole("button", { name: "Remove the draft…" }));
    const panel = screen.getByRole("region", { name: /Remove the draft ‘October’/ });
    expect(within(panel).getByText(/can't be brought back/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Keep it" }));
    expect(discard).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: /Remove the draft/ })).toBeNull();
  });
});

describe("Decide", () => {
  it("lists new systems first and accepts the ready ones in sequence from the keyboard", async () => {
    const { decide } = renderStep("decide");
    await screen.findByRole("grid");
    // New systems first, then the systems the draft has.
    const systems = within(screen.getByRole("grid")).getAllByRole("gridcell").filter((cell) => cell.textContent?.includes("New system") || cell.textContent === "CWOM");
    expect(systems[0]).toHaveTextContent("New system");
    expect(systems.at(-1)).toHaveTextContent("CWOM");

    await press("Adds the system Order Hub", "a");
    await press("Adds the constraint “Nights only”", "a");
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
    // Each decision carries the revision the one before it returned.
    expect(decide.mock.calls[0]).toEqual(["d", "hub", { expected_revision: 3, accept: true, content: null }]);
    expect(decide.mock.calls[1]).toEqual(["d", "store", { expected_revision: 4, accept: true, content: null }]);
  });

  it("shows the suggestion in hand in the pane, with its source and the mark that a model proposed it", async () => {
    renderStep("decide");
    await screen.findByRole("grid");
    cellOf("Adds the constraint “Nights only”").focus();
    await waitFor(() => expect(cellOf("Adds the constraint “Nights only”")).toHaveAttribute("tabindex", "0"));
    const pane = screen.getByRole("complementary", { name: "The suggestion" });
    expect(within(pane).getByRole("heading", { level: 2 })).toHaveTextContent("Adds the constraint “Nights only”");
    expect(within(pane).getByText(/Suggested · stated in the source/)).toBeInTheDocument();
    expect(within(pane).getByText("From the document")).toBeInTheDocument();
    // Content is English, so the quote takes the page's language rather than its own.
    expect(within(pane).getByText("System: x").closest("blockquote")).not.toHaveAttribute("lang");
  });

  it("cites a dependency derived from the draft's own catalogue by its place there, not as a document", async () => {
    const derived = base(
      "dep",
      { kind: "relationship", system_id: "bcrm", target_system_id: "cwom", relationship_kind: "calls_api", text: "Order API" },
      {
        document_version_id: "derived_dependencies", basis: "inferred", rationale: "Said by 1 interface of this catalogue.",
        citations: [{ location: "Catalogue › interface Order API of CWOM", quote: "Takes channel orders." }],
        model: "dependency-derivation", system_name: "BCRM", target_system_name: "CWOM",
      },
    );
    renderStep("decide", { suggestions: [...SUGGESTIONS, derived] });
    await screen.findByRole("grid");
    expect(screen.getByText(/from 1 document and the draft's catalogue/)).toBeInTheDocument();
    const cell = within(screen.getByRole("grid")).getByText("Catalogue › interface Order API of CWOM", { exact: false }).closest("[data-cell-focus]") as HTMLElement;
    cell.focus();
    await waitFor(() => expect(cell).toHaveAttribute("tabindex", "0"));
    const pane = screen.getByRole("complementary", { name: "The suggestion" });
    expect(within(pane).getByText("From the draft's catalogue")).toBeInTheDocument();
    expect(within(pane).getByText("Inferred from the draft's catalogue.")).toBeInTheDocument();
    expect(within(pane).getByText("Catalogue › interface Order API of CWOM")).toBeInTheDocument();
    expect(within(pane).queryByText(/A document no longer in the draft/)).not.toBeInTheDocument();
    expect(within(pane).queryByRole("button", { name: "Show the passage around it" })).not.toBeInTheDocument();
  });

  it("on a narrow screen, brings the pane into view when a row is tapped", async () => {
    renderStep("decide");
    await screen.findByRole("grid");
    // Stacked: the list ends at 400px and the pane starts under it.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const box = this.classList.contains("ds-split__list") ? { top: 0, bottom: 400, height: 400 } : { top: 420, bottom: 720, height: 300 };
      return { ...box, left: 0, right: 390, width: 390, x: 0, y: box.top, toJSON: () => ({}) } as DOMRect;
    });
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    fireEvent.click(cellOf("Adds the constraint “Nights only”"));
    const pane = screen.getByRole("complementary", { name: "The suggestion" });
    await waitFor(() => expect(within(pane).getByRole("heading", { level: 2 })).toHaveFocus());
    expect(within(pane).getByRole("heading", { level: 2 })).toHaveTextContent("Adds the constraint “Nights only”");
    expect(scrolled.mock.contexts[0]).toBe(pane);
  });

  it("sends a possible match to the pane instead of accepting it, and links the system chosen", async () => {
    const { decide } = renderStep("decide");
    await screen.findByRole("grid");
    await press("Adds the system Dynamics CRM", "a");
    expect(decide).not.toHaveBeenCalled();
    const pane = screen.getByRole("complementary", { name: "The suggestion" });
    const accept = within(pane).getByRole("button", { name: "Accept" });
    expect(accept).toHaveAttribute("aria-disabled", "true");
    expect(within(pane).getByText("Say first whether the name means a system the draft has.")).toBeInTheDocument();
    fireEvent.click(within(pane).getByLabelText(/Yes, it is/));
    fireEvent.click(accept);
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0]![2]).toMatchObject({ accept: true, content: { kind: "system", system_id: "bcrm", name: "Dynamics CRM" } });
  });

  it("edits a capability's phrases, keeps the edits when editing stops, then accepts it as edited", async () => {
    const { decide } = renderStep("decide");
    const sentence = "Adds the capability Tracking, matched by “track orders”";
    await screen.findByRole("grid");
    await press(sentence, "e");
    fireEvent.change(await screen.findByLabelText(/Matched by/), { target: { value: "track orders\n  order milestones  \n" } });
    fireEvent.click(screen.getByRole("button", { name: "Stop editing" }));
    expect(screen.getByText(/You have edits not accepted yet/)).toBeInTheDocument();
    expect(within(cellOf(sentence).closest("tr")!).getByText("Edited, not accepted yet")).toBeInTheDocument();
    // "a" with edits kept goes to the pane instead of accepting what the document said.
    await press(sentence, "a");
    expect(decide).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back to your edits" }));
    expect(await screen.findByLabelText(/Matched by/)).toHaveValue("track orders\n  order milestones  \n");
    fireEvent.change(screen.getByLabelText("Delivered by the component"), { target: { value: "milestones" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept as edited" }));
    await waitFor(() => expect(decide).toHaveBeenCalled());
    expect(decide.mock.calls[0]![2]).toMatchObject({
      accept: true,
      content: { kind: "capability", system_id: "cwom", component_id: "milestones", triggers: ["track orders", "order milestones"] },
    });
  });

  it("drops kept edits only when asked", async () => {
    renderStep("decide");
    const sentence = "Adds the capability Tracking, matched by “track orders”";
    await screen.findByRole("grid");
    await press(sentence, "e");
    fireEvent.change(await screen.findByLabelText(/Matched by/), { target: { value: "order milestones" } });
    fireEvent.click(screen.getByRole("button", { name: "Stop editing" }));
    fireEvent.click(screen.getByRole("button", { name: "Drop the edits" }));
    expect(screen.queryByText(/You have edits not accepted yet/)).toBeNull();
    expect(screen.getByText("Your edits are dropped.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit, then accept" }));
    expect(await screen.findByLabelText(/Matched by/)).toHaveValue("track orders");
  });

  it("rejects from the keyboard, and rejects a selection through its consequence", async () => {
    const reject = vi.spyOn(api, "rejectMany").mockResolvedValue({ rejected: 2 });
    const { decide } = renderStep("decide");
    await screen.findByRole("grid");
    await press("Adds the system Order Hub", "r");
    await waitFor(() => expect(decide).toHaveBeenCalledWith("d", "hub", { expected_revision: 3, accept: false, content: null }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Adds the constraint “Nights only”" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Adds the system Dynamics CRM" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 2 suggestions…" }));
    const panel = screen.getByRole("region", { name: "Reject 2 suggestions" });
    fireEvent.click(within(panel).getByRole("button", { name: "Reject 2 suggestions" }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith("d", 4, ["crm", "store"]));
  });

  it("accepts the ready ones only through a consequence that lists them, and sends exactly that set", async () => {
    const acceptAll = vi.spyOn(api, "acceptAll").mockResolvedValue({ release: draft({ revision: 4 }), remaining: 1 } as never);
    renderStep("decide");
    await screen.findByRole("grid");

    fireEvent.click(screen.getByRole("button", { name: /^Accept the 3 ready/ }));
    const panel = screen.getByRole("region", { name: "Accept 3 suggestions" });
    const listed = within(within(panel).getByRole("list", { name: "Suggestions to accept" })).getAllByRole("listitem").map((item) => item.textContent);
    expect(listed).toEqual(expect.arrayContaining(["Adds the system Order Hub", "Adds the constraint “Nights only”"]));
    expect(listed).toHaveLength(3);
    // The one with a possible match needs a person: it is not in the set.
    expect(within(panel).queryByText(/Dynamics CRM/)).toBeNull();
    expect(within(panel).getByText(/Nothing reaches requirement work until the draft is published/)).toBeInTheDocument();

    // Not yet: nothing is sent.
    fireEvent.click(within(panel).getByRole("button", { name: "Not yet" }));
    expect(acceptAll).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Accept 3 suggestions" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Accept the 3 ready/ }));
    fireEvent.click(within(screen.getByRole("region", { name: "Accept 3 suggestions" })).getByRole("button", { name: "Accept 3 suggestions" }));
    await waitFor(() => expect(acceptAll).toHaveBeenCalledOnce());
    const [releaseId, revision, ids] = acceptAll.mock.calls[0]!;
    expect([releaseId, revision]).toEqual(["d", 3]);
    expect([...ids].sort()).toEqual(["cap", "hub", "store"]);
    expect(await screen.findByText(/Accepted 3 suggestions\. 1 still wait for you\./)).toBeInTheDocument();
  });

  it("lists under Ready to accept exactly what accepting the ready ones would take", async () => {
    renderStep("decide");
    await screen.findByRole("grid");
    fireEvent.click(screen.getByRole("button", { name: /Ready to accept/ }));
    const listed = screen.getAllByRole("rowheader").map((row) => row.textContent ?? "");
    expect(listed).toHaveLength(3);
    expect(listed.some((text) => text.includes("Dynamics CRM"))).toBe(false);
  });

  it("keeps the filter in the address and finds by any word", async () => {
    renderStep("decide");
    await screen.findByRole("grid");
    fireEvent.click(screen.getByRole("button", { name: /Needs your decision/ }));
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
    expect(screen.getByRole("rowheader")).toHaveTextContent("Adds the system Dynamics CRM");
  });
});

describe("Sources", () => {
  it("adds several documents in one go and says what became of each", async () => {
    const files = [new File(["# Billing"], "billing.md", { type: "text/markdown" }), new File(["CRM"], "crm.txt", { type: "text/plain" })];
    vi.spyOn(api, "addCatalogueDocuments").mockResolvedValue({
      release: draft({ revision: 4 }),
      results: [
        { filename: "billing.md", outcome: "added", version_id: "v2" },
        { filename: "crm.txt", outcome: "refused", reason: "It can't be read." },
      ],
    } as never);
    const read = vi.spyOn(api, "readCatalogueDocument").mockResolvedValue({} as never);
    renderStep("sources");
    fireEvent.change(await screen.findByLabelText(/^Files/), { target: { files } });
    expect(screen.getByText("2 files chosen; each is titled by its file name.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add the 2 files and read them" }));
    expect(await screen.findByText("1 of 2 files added.")).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith("d", "v2");
    expect(screen.getByText(/Not added: It can't be read./)).toBeInTheDocument();
  });

  it("lists the documents with their reading as words, and the way on to Decide", async () => {
    renderStep("sources");
    const table = await screen.findByRole("table", { name: "The draft's documents and how their reading stands" });
    expect(within(table).getByText("Not read yet")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Next: decide 4 suggestions" })).toHaveAttribute("href", "/architecture/versions/d/decide");
  });

  it("suggests the dependencies the draft's interfaces and journeys say, and what came of it", async () => {
    renderStep("sources");
    const suggest = vi.spyOn(api, "suggestDerivedDependencies").mockResolvedValue({
      id: "r1", release_id: "d", document_version_id: "derived_dependencies", model: "dependency-derivation",
      prompt_version: "dependency-derivation-v1", candidate_count: 52, warnings: [], created_at: "", reading: "derived_dependencies",
    } as never);
    const section = (await screen.findByRole("heading", { name: "Dependencies from interfaces and journeys" })).closest("section")!;
    fireEvent.click(within(section).getByRole("button", { name: "Suggest dependencies" }));
    expect(await within(section).findByText("52 dependencies suggested; decide them on Decide.")).toBeInTheDocument();
    expect(suggest).toHaveBeenCalledWith("d");
  });

  it("says which part a document's reading is on, when it started and what comes next", async () => {
    const started = new Date(Date.now() - 4 * 60_000).toISOString();
    renderStep("sources", {
      suggestions: [],
      extractions: [{
        document_version_id: "v1",
        job: {
          id: "j1", kind: "extraction", subject_id: "d", fingerprint: "v1|p", actor_id: "fake-owner", status: "running", attempts: 1,
          lease_until: new Date(Date.now() + 4 * 60_000).toISOString(), started_at: started, stage: "reading", progress_done: 2, progress_total: 8,
        },
      }],
    });
    const table = await screen.findByRole("table", { name: "The draft's documents and how their reading stands" });
    expect(await within(table).findByText("Reading part 3 of 8")).toBeInTheDocument();
    expect(within(table).getByRole("progressbar", { name: "Parts of Integration design read" })).toHaveAttribute("aria-valuetext", "2 of 8 parts read");
    expect(within(table).getByText(/^Started \d\d:\d\d, 4 min \d+ s so far; about 12 min left\.$/)).toBeInTheDocument();
    expect(within(table).getByText("Its suggestions arrive on Decide when the reading ends.")).toBeInTheDocument();
    expect(within(table).getByText("Not yet")).toBeInTheDocument();
    const steps = screen.getByRole("navigation", { name: "Steps of this draft" });
    expect(within(steps).getByText("Reading part 3 of 8")).toBeInTheDocument();
  });
});

describe("Check", () => {
  it("lists data with more than one system of record, saying which owner has no note", async () => {
    const release = draft({
      vocabulary: [{ id: "entity-customer", scheme: "information_entity", pref_label: "Customer", alt_labels: [], accepted: [], deprecated: false }],
      systems: [
        { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [], constraints: [], masters: ["entity-customer"], mastery_notes: [{ entity_id: "entity-customer", note: "Customers migrated to CWOM" }] },
        { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [], masters: ["entity-customer"], mastery_notes: [] },
      ],
    } as unknown as Partial<Release>);
    renderStep("check", { release });
    const section = within((await screen.findByRole("heading", { name: /Data with more than one owner/ })).closest("section")!);
    expect(section.getByText("Customer")).toBeInTheDocument();
    expect(section.getByText("Customers migrated to CWOM")).toBeInTheDocument();
    expect(section.getByText("No note yet")).toBeInTheDocument();
    expect(section.getByText(/1 owner says nothing yet; publishing is not held for it\./)).toBeInTheDocument();
  });

  it("compares every sample and says what moves", async () => {
    vi.spyOn(api, "compareImpact").mockResolvedValue({
      query: "Order Hub takes orders",
      in_use: { release_id: "live", systems: [], uncertainty: null },
      this_version: { release_id: "d", systems: [{ id: "hub", name: "Order Hub" }], uncertainty: null },
    });
    renderStep("check");
    expect(await screen.findByText(/at revision 3/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Compare all 1" }));
    expect(await screen.findByText("Now also finds Order Hub")).toBeInTheDocument();
    expect(screen.getByText(/All compared:/)).toHaveTextContent("1 mapping would move.");
  });
});

describe("Check: sources it cites but doesn't register", () => {
  const section = async () => (await screen.findByRole("heading", { name: /Sources it cites but doesn’t register/ })).closest("section")!;

  it("lists each one with how many facts cite it and a few of them, and where to register it", async () => {
    vi.spyOn(api, "citations").mockResolvedValue([
      { cited: "Ontology plan Phase 8", facts: 68, examples: ["Realisation Fortinet HE CPE", "Realisation CFSS_ONPREM_FIREWALL_HE"] },
    ]);
    renderStep("check");
    const found = within(await section());
    expect(await found.findByText("Ontology plan Phase 8")).toBeInTheDocument();
    expect(found.getByText(/Cited by 68 facts, such as Realisation Fortinet HE CPE; Realisation CFSS_ONPREM_FIREWALL_HE/)).toBeInTheDocument();
    expect(found.getByRole("link", { name: "Register the source" })).toHaveAttribute("href", "/architecture/versions/d/governance");
  });

  it("says so when every fact names a registered source", async () => {
    renderStep("check");
    expect(await within(await section()).findByText("Every fact names a registered source.")).toBeInTheDocument();
  });

  it("says the check failed without holding up the rest of the step", async () => {
    vi.spyOn(api, "citations").mockRejectedValue(new Error("The knowledge service is unavailable."));
    renderStep("check");
    expect(await within(await section()).findByText(/couldn’t be checked: The knowledge service is unavailable\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next: publish" })).toBeInTheDocument();
  });
});

describe("Publish", () => {
  it("lists the checks first, then publishes through its consequence with what was checked", async () => {
    const publish = vi.spyOn(api, "publish").mockResolvedValue(draft({ status: "published" }));
    const build = vi.spyOn(api, "buildRelease");
    renderStep("publish");
    const checks = await screen.findByRole("list", { name: "Checks before publishing" });
    await waitFor(() => expect(within(checks).getByText("4 suggestions wait undecided")).toBeInTheDocument());
    expect(within(checks).getByText("Built for matching at this revision")).toBeInTheDocument();
    expect(within(checks).getByText("5 requirements to map again")).toBeInTheDocument();
    expect(within(checks).getByRole("link", { name: "Decide them" })).toHaveAttribute("href", "/architecture/versions/d/decide");

    fireEvent.click(screen.getByRole("button", { name: "Publish ‘October’…" }));
    const panel = screen.getByRole("region", { name: "Publish ‘October’" });
    expect(within(panel).getByText(/4 suggestions still wait undecided/)).toBeInTheDocument();
    // A reason is asked for before anything is sent.
    fireEvent.click(within(panel).getByRole("button", { name: "Publish it" }));
    expect(publish).not.toHaveBeenCalled();
    fireEvent.change(within(panel).getByLabelText("What did you check?"), { target: { value: "Compared the samples." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Publish it" }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith("d", { expected_revision: 3, rationale: "Compared the samples." }));
    expect(build).not.toHaveBeenCalled();
    expect(await screen.findByText("In service now")).toBeInTheDocument();
  });

  it("builds first when the draft is not built at its revision", async () => {
    const build = vi.spyOn(api, "buildRelease").mockResolvedValue({ id: "j", status: "succeeded", fingerprint: "3|p" } as never);
    const publish = vi.spyOn(api, "publish").mockResolvedValue(draft({ status: "published" }));
    renderStep("publish", { release: draft({ built_revision: 2 }) });
    fireEvent.click(await screen.findByRole("button", { name: "Publish ‘October’…" }));
    fireEvent.change(screen.getByLabelText("What did you check?"), { target: { value: "Checked." } });
    fireEvent.click(screen.getByRole("button", { name: "Build it, then publish" }));
    await waitFor(() => expect(publish).toHaveBeenCalled());
    expect(build).toHaveBeenCalledWith("d", 3);
  });
});
