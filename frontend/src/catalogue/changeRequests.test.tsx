import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type ChangeRequest, type Release, type Suggestion } from "../api/client";
import { ChangeRequestInbox } from "./ChangeRequests";
import { traceLine } from "./inbox";
import { changeSentence, featureWarnings, lexicon, suggestionGroups, waitsFor } from "./suggestions";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

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
  kind: "approved_backlog",
  delivery: null,
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

const CLOSED = item({
  id: "CR-20261020-Business_Fiber",
  kind: "catalogue_change",
  title: "Static IP quota",
  trace: { ...TRACE, requirement_id: "REQ-42", breakdown_revision: 2, approved_by: null, approved_at: null },
  features: [
    { id: "FT-1", sequence: 1, name: "Order a static IP", outcome: null, contexts: [], systems: [{ id: "bcrm", name: "BCRM" }, { id: "prov", name: "Provisioning" }] },
  ],
  delivery: {
    delivery_id: "REQ-42:4711:evt-1",
    epic_external_id: "4711",
    epic_url: "https://dev.azure.com/acme/smb/_workitems/edit/4711",
    closed_at: "2026-10-20T15:30:00Z",
    release_id: "seed",
    impact_version: "ANA-1@7",
    decision: "accepted",
    suggested_verdict: "change_existing_offering",
    verdict: "change_existing_offering",
    offering_id: "offering:business-fiber",
    offering_name: "Business Fiber",
    predicted: [
      { id: "bcrm", name: "BCRM", role: "primary", change_type: "modify" },
      { id: "cim", name: "CIM", role: "supporting", change_type: "configure" },
    ],
    not_delivered: [{ id: "FT-2", name: "Show the IP on the bill", state: "Removed" }],
    changes: [
      { op: "realise_concept", concept_id: "cap:static-ip", concept_label: "Static IP", system_id: "bcrm", system_name: "BCRM", offering_id: null, offering_name: null, feature_ids: ["FT-1"] },
      { op: "offer_concept", concept_id: "cap:static-ip", concept_label: "Static IP", system_id: null, system_name: null, offering_id: "offering:business-fiber", offering_name: "Business Fiber", feature_ids: ["FT-1"] },
    ],
    hits: { predicted: ["bcrm"], unpredicted: ["prov"], undelivered: ["cim"] },
  },
});

describe("a closed Epic in the inbox", () => {
  it("says what it delivered, what it suggests, and how that compares with the prediction", async () => {
    open([CLOSED]);

    const row = within(await screen.findByRole("table", { name: /Change requests from connected apps/ })).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("Epic closed: 1 delivered Feature for Business Fiber");
    expect(within(row).getByRole("link", { name: /Epic 4711 closed on 20 Oct 2026/ })).toHaveAttribute(
      "href",
      "https://dev.azure.com/acme/smb/_workitems/edit/4711",
    );
    expect(within(row).getByRole("list", { name: "Delivered by CR-20261020-Business_Fiber" })).toHaveTextContent("FT-1 Order a static IP");
    expect(row).toHaveTextContent("Not delivered: FT-2 Show the IP on the bill (Removed)");
    expect(row).toHaveTextContent("Suggests: BCRM realises Static IP; Business Fiber offers Static IP.");
    expect(row).toHaveTextContent("Delivered 1 of the 2 systems predicted (CIM was not), and 1 not predicted (Provisioning).");
  });

  it("names what it delivered as suggestions when read into the draft", async () => {
    vi.spyOn(api, "readChangeRequest").mockResolvedValue({
      release: { ...VERSION, id: "draft-1", status: "draft", name: "October" },
      run: { id: "r", document_version_id: CLOSED.id, model: "requirement-ai-export", prompt_version: "export-1", candidate_count: 2, warnings: [], created_at: "", match_model: null, match_prompt_version: null, change_request_id: CLOSED.id },
      change_request: { ...CLOSED, status: "read", read_into: "draft-1" },
    } as never);
    open([CLOSED]);

    fireEvent.click(await screen.findByRole("button", { name: /Read it into a new draft/ }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("CR-20261020-Business_Fiber is read into ‘October’: 2 suggestions below."));
  });
});

const DRAFTED = item({
  id: "CR-20261011-Cloud_Voice",
  title: "Cloud voice for clinics",
  draft: {
    offering_id: "cloud-voice",
    offering_name: "Cloud Voice",
    based_on: "business-pro-plus",
    components: [
      { id: "sip", name: "SIP trunk", capability_ids: ["cap-voice"], system_ids: ["cwom"] },
      { id: "recording", name: "Call recording", capability_ids: ["cap-recording"], system_ids: [] },
    ],
    questions: ["Which system will realise Call recording?"],
    journey_id: "cloud-voice-new",
    journey_name: "New activation",
    steps: 3,
  },
});

describe("an approved backlog for a new offering", () => {
  it("says what was drafted for it, naming systems and offerings as the catalogue does", async () => {
    const named = {
      ...VERSION,
      systems: [{ id: "cwom", name: "CWOM" }],
      products: [{ id: "business-pro-plus", name: "Business Pro Plus" }],
    } as unknown as Release;
    open([DRAFTED], [named]);

    const row = within(await screen.findByRole("table", { name: /Change requests from connected apps/ })).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("Drafts a new offering, ‘Cloud Voice’, from Business Pro Plus.");
    expect(row).toHaveTextContent("Its components: SIP trunk, by CWOM; Call recording, with no system yet.");
    expect(row).toHaveTextContent("Its journey: New activation, 3 steps. 1 question is left for architecture review.");
  });

  it("counts the drafted offering and journey among the suggestions it is read into", async () => {
    vi.spyOn(api, "readChangeRequest").mockResolvedValue({
      release: { ...VERSION, id: "draft-1", status: "draft", name: "October" },
      run: { id: "r", document_version_id: DRAFTED.id, model: "requirement-ai-export", prompt_version: "export-1", candidate_count: 3, warnings: [], created_at: "", match_model: null, match_prompt_version: null, change_request_id: DRAFTED.id },
      change_request: { ...DRAFTED, status: "read", read_into: "draft-1" },
    } as never);
    open([DRAFTED]);

    fireEvent.click(await screen.findByRole("button", { name: /Read it into a new draft/ }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("CR-20261011-Cloud_Voice is read into ‘October’: 3 suggestions below."));
  });
});

describe("the inbox of change requests from connected apps", () => {
  it("says what each asks and where it comes from, and reads one into a new draft", async () => {
    const read = vi.spyOn(api, "readChangeRequest").mockResolvedValue({
      release: { ...VERSION, id: "draft-1", status: "draft", name: "CR-20261003-Business_Pro_Plus" },
      run: { id: "r", document_version_id: "CR-20261003-Business_Pro_Plus", model: "requirement-ai-export", prompt_version: "export-1", candidate_count: 1, warnings: [], created_at: "", match_model: null, match_prompt_version: null, change_request_id: "CR-20261003-Business_Pro_Plus" },
      change_request: item({ status: "read", read_into: "draft-1" }),
    } as never);
    open([item({ sent_by: "requirements" })]);

    const row = within(await screen.findByRole("table", { name: /Change requests from connected apps/ })).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("CR-20261003-Business_Pro_Plus");
    // The app that sent it, by the name it is registered under (ADR-0126).
    expect(row).toHaveTextContent("Sent by requirements");
    expect(row).toHaveTextContent("1 approved feature for Business Pro Plus");
    expect(row).toHaveTextContent("REQ-2026-0412, revision 3, approved by Layla Haddad on 3 Oct 2026");
    expect(row).toHaveTextContent("FT-1 Offer Microsoft 365");
    expect(screen.getByRole("heading", { name: /^Change requests 1 waiting/ })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: /^Read it into a new draft ?\(CR-20261003-Business_Pro_Plus\)$/ }));

    await waitFor(() => expect(read).toHaveBeenCalledWith("CR-20261003-Business_Pro_Plus"));
    expect(await screen.findByTestId("where")).toHaveTextContent(
      "/architecture/versions/draft-1/decide CR-20261003-Business_Pro_Plus is read into a new draft named after it: 1 suggested question below.",
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
    expect(within(rows[1]!).getByRole("link", { name: /^Its suggestions ?\(CR-2\)$/ })).toHaveAttribute("href", "/architecture/versions/draft-9/decide");
    // Read into a draft still in preparation, it is settled there: no dismissing it.
    expect(within(rows[1]!).queryByRole("button", { name: /^Dismiss it/ })).not.toBeInTheDocument();
    expect(within(rows[2]!).getByText("Dismissed").closest(".ds-status--stopped")).not.toBeNull();
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
    expect(await screen.findByText("No change request has come from a connected app yet.")).toBeInTheDocument();
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
    basis: "stated", rationale: null, possible_matches: [], system_name: null, target_system_name: null, missing_systems: [],
    content: { kind: "question", system_id, name: "", aliases: [], triggers: [], text: "", capability_refs: [], concept_ids: [], value_refs: [], question: { id: "REQ-1/FT-1", text: "Offer Microsoft 365", order_types } },
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
