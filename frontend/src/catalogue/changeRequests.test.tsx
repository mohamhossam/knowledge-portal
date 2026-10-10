import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type ChangeRequest, type Release, type Suggestion } from "../api/client";
import { ChangeRequestInbox } from "./ChangeRequests";
import { traceLine } from "./inbox";
import { changeSentence, featureWarnings, lexicon, suggestionGroups, waitsFor } from "./suggestions";

afterEach(() => vi.restoreAllMocks());

const TRACE = {
  requirement_id: "REQ-2026-0412",
  breakdown_revision: 3,
  approval_id: "APR-77",
  epic_id: "EP-1",
  epic_name: "Microsoft 365 for Business Pro Plus",
  approved_by: "Layla Haddad",
  approved_at: "2026-10-03T08:05:00Z",
  features: [{ id: "FT-1", name: "Offer Microsoft 365" }],
};
const item = (patch: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id: "CR-20261003-Business_Pro_Plus",
  title: "Microsoft 365 for Business Pro Plus",
  reason: "Customers ask for it.",
  trace: TRACE,
  features: [
    {
      id: "FT-1",
      sequence: 1,
      name: "Offer Microsoft 365",
      outcome: null,
      contexts: [{ product_id: "PO-BPP", product_name: "Business Pro Plus", order_type: "New Activation" }],
      systems: [],
    },
  ],
  received_at: "2026-10-03T09:00:00Z",
  status: "waiting",
  read_into: null,
  read_by: null,
  read_at: null,
  dismissed_by: null,
  dismissed_at: null,
  dismissal_reason: null,
  ...patch,
});
const VERSION = { id: "v1", revision: 1, status: "published", name: "October", systems: [], relationships: [], documents: [] } as unknown as Release;

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname} ${(location.state as { notice?: string } | null)?.notice ?? ""}`}</p>;
}

function open(items: ChangeRequest[], releases: Release[] = [VERSION]) {
  vi.spyOn(api, "changeRequests").mockResolvedValue(items);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/architecture/versions"]}>
        <Routes>
          <Route path="*" element={<><ChangeRequestInbox releases={releases} actorName={(id) => (id === "fake-owner" ? "Amina" : id ?? "")} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the inbox of change requests from Requirement AI", () => {
  it("says what each asks and where it comes from, and reads one into a new draft", async () => {
    const read = vi.spyOn(api, "readChangeRequest").mockResolvedValue({
      release: { ...VERSION, id: "draft-1", status: "draft", name: "CR-20261003-Business_Pro_Plus" },
      run: { id: "r", document_version_id: "CR-20261003-Business_Pro_Plus", model: "requirement-ai-export", prompt_version: "export-1", candidate_count: 1, warnings: [], created_at: "", match_model: null, match_prompt_version: null, change_request_id: "CR-20261003-Business_Pro_Plus" },
      change_request: item({ status: "read", read_into: "draft-1" }),
    } as never);
    open([item()]);

    const row = within(await screen.findByRole("table", { name: /Change requests from Requirement AI/ })).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("CR-20261003-Business_Pro_Plus");
    expect(row).toHaveTextContent("1 approved feature for Business Pro Plus");
    expect(row).toHaveTextContent("REQ-2026-0412, revision 3, approved by Layla Haddad on 3 Oct 2026");
    expect(row).toHaveTextContent("FT-1 Offer Microsoft 365");
    expect(screen.getByRole("heading", { name: /Change requests from Requirement AI 1 waiting/ })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: /^Read it into a new draft ?\(CR-20261003-Business_Pro_Plus\)$/ }));

    await waitFor(() => expect(read).toHaveBeenCalledWith("CR-20261003-Business_Pro_Plus"));
    expect(await screen.findByTestId("where")).toHaveTextContent(
      "/architecture/versions/draft-1/sources CR-20261003-Business_Pro_Plus is read into a new draft named after it: 1 suggested question below.",
    );
  });

  it("offers the draft in progress, links to the suggestions once read, and keeps a dismissal with its reason", async () => {
    const draft = { ...VERSION, id: "draft-9", status: "draft", name: "November" } as Release;
    const dismiss = vi.spyOn(api, "dismissChangeRequest").mockResolvedValue(item({ status: "dismissed" }));
    open(
      [
        item(),
        item({ id: "CR-2", status: "read", read_into: "draft-9", read_by: "fake-owner", read_at: "2026-10-04T09:00:00Z" }),
        item({ id: "CR-3", status: "dismissed", dismissed_by: "fake-owner", dismissed_at: "2026-10-04T09:00:00Z", dismissal_reason: "Covered by CR-2." }),
      ],
      [VERSION, draft],
    );
    const rows = within(await screen.findByRole("table", { name: /Change requests/ })).getAllByRole("row").slice(1);

    expect(within(rows[0]!).getByRole("button", { name: /^Read it into ‘November’ ?\(CR-20261003-Business_Pro_Plus\)$/ })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("Read into ‘November’by Amina on 4 Oct 2026");
    expect(within(rows[1]!).getByRole("link", { name: /^Its suggestions ?\(CR-2\)$/ })).toHaveAttribute("href", "/architecture/versions/draft-9/sources");
    // Read into a draft still in preparation, it is settled there: no dismissing it.
    expect(within(rows[1]!).queryByRole("button", { name: /^Dismiss it/ })).not.toBeInTheDocument();
    expect(rows[2]).toHaveClass("row--past");
    expect(rows[2]).toHaveTextContent("Dismissedby Amina on 4 Oct 2026: Covered by CR-2.");

    const dismissButton = () => within(rows[0]!).getByRole("button", { name: /^Dismiss it ?\(CR-20261003-Business_Pro_Plus\)$/ });
    fireEvent.click(dismissButton());
    fireEvent.keyDown(screen.getByLabelText("Why it is dismissed"), { key: "Escape" });
    // Closing the form hands focus back to the button that opened it.
    await waitFor(() => expect(dismissButton()).toHaveFocus());

    fireEvent.click(dismissButton());
    const form = screen.getByRole("form", { name: "Dismiss CR-20261003-Business_Pro_Plus" });
    const reason = within(form).getByLabelText("Why it is dismissed");
    expect(reason).toHaveFocus();
    expect(within(form).getByRole("button", { name: "Dismiss it" })).toHaveAttribute("aria-disabled", "true");
    expect(within(form).getByRole("button", { name: "Dismiss it" })).toHaveAccessibleDescription("Give a reason first.");
    fireEvent.change(reason, { target: { value: "Already asked." } });
    fireEvent.submit(form);
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith("CR-20261003-Business_Pro_Plus", "Already asked."));
  });

  it("says when nothing has come yet", async () => {
    open([]);
    expect(await screen.findByText("No change request has come from Requirement AI yet.")).toBeInTheDocument();
    expect(traceLine({ ...TRACE, approved_by: null, approved_at: null })).toBe("REQ-2026-0412, revision 3");
  });
});

describe("a question suggested by a change request", () => {
  const release = {
    id: "d", revision: 3, status: "draft", documents: [], relationships: [], systems: [],
    products: [{ id: "BPP", name: "Business Pro Plus", order_types: [{ code: "NEW", name: "New Activation" }], components: [] }],
  } as unknown as Release;
  const question = (system_id: string, order_types: string[], match: Suggestion["match"] = "new"): Suggestion => ({
    id: system_id, document_version_id: "CR-1", change_request: { change_request_id: "CR-1", feature_id: "FT-1" },
    citations: [{ location: "Feature FT-1", quote: "Offer Microsoft 365" }], match, status: "proposed", edited: false,
    model: "requirement-ai-export", prompt_version: "export-1", created_at: "", decided_by: null, decided_at: null,
    basis: "stated", rationale: null, possible_matches: [], system_name: null, target_system_name: null,
    content: { kind: "question", system_id, name: "", aliases: [], triggers: [], text: "", capability_refs: [], concept_ids: [], question: { id: "REQ-1/FT-1", text: "Offer Microsoft 365", order_types } },
  }) as Suggestion;

  it("says what it asks of which offering and order type, and what it waits for", () => {
    const asked = question("BPP", ["NEW"]);
    const elsewhere = question("Office Presence", ["New Activation"], "needs_offering");
    const lacking = question("BPP", ["Change plan"], "needs_offering");
    const words = lexicon(release, [asked, elsewhere, lacking]);

    expect(changeSentence(asked, words)).toBe("Asks of Business Pro Plus (New Activation): Offer Microsoft 365");
    expect(changeSentence(question("BPP", [], "updates_existing"), words)).toBe("Rewords the question it asks of Business Pro Plus: Offer Microsoft 365");
    expect(waitsFor(elsewhere, words)).toBe("Waits for the offering Office Presence");
    expect(waitsFor(lacking, words)).toBe("Waits for Business Pro Plus’s order type Change plan");
    expect(suggestionGroups(release, [asked], words).map((group) => group.label)).toEqual(["Questions for offerings"]);
  });

  it("carries what the reading said of a feature to that feature's suggestion", () => {
    const run = { change_request_id: "CR-1", warnings: [
      "The requirement was mapped against catalogue version 2026.09, not the version in service; check the systems it names.",
      "FT-2: Partner Tenant Portal is not in the draft, so the question names it as the mapping wrote it.",
      "FT-2: the offering 'Office Presence' is not in the draft; its question waits for it.",
    ] } as never;
    const notes = featureWarnings([run, { change_request_id: null, warnings: ["FT-2: not mine"] } as never]);
    expect([...notes.keys()]).toEqual(["CR-1/FT-2"]);
    expect(notes.get("CR-1/FT-2")).toEqual([
      "Partner Tenant Portal is not in the draft, so the question names it as the mapping wrote it.",
      "The offering 'Office Presence' is not in the draft; its question waits for it.",
    ]);
  });
});
