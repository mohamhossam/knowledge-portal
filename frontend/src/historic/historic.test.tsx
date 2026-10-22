import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type HistoricDetail, type HistoricSummary, type RequirementCorpus } from "../api/client";
import { requirementOverview } from "../home/derive";
import { HistoricPage } from "./HistoricPage";
import { nextStep, parseIds, standing } from "./historic";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const ada = { id: "ada", display_name: "Ada Admin" };
const CORPUS = {
  requirements: 4, current: 4, waiting: 0, failed: 0, retired: 0, duplicates: 0, rebuild_required: false,
  open_findings: { under_7_days: 0, from_7_to_30_days: 0, over_30_days: 0 },
} as unknown as RequirementCorpus;

beforeEach(() => {
  vi.spyOn(api, "requirementCorpus").mockResolvedValue(CORPUS);
  vi.spyOn(api, "historicList").mockResolvedValue({ items: [summary()], next_offset: null, counts: { draft: 1, published: 0, withdrawn: 0, refresh_waiting: 0 } });
  vi.spyOn(api, "historicSharedRoots").mockResolvedValue({ items: [] });
  vi.spyOn(api, "historicCitedBy").mockResolvedValue({ total: 0, items: [], next_offset: null });
});

function summary(extra: Partial<HistoricSummary> = {}): HistoricSummary {
  return {
    id: "h1", title: "XGPON bundles", status: "draft", version: 3, created_at: "2026-10-06T09:00:00Z", created_by: ada,
    brds: 1, brds_reading: 0, brds_failed: 0, work_items: 0, run_status: null, run_failure: null,
    refresh_waiting: false, published_at: null, withdrawn_at: null, ...extra,
  } as HistoricSummary;
}

const STORY = {
  id: 48216, type: "user_story", title: "As a sales agent, I choose an XGPON bundle", state: "Closed", revision: 7,
  url: "https://dev.azure.com/x/_workitems/edit/48216", description: "Only covered addresses.", acceptance_criteria: "",
  area_path: "SMB\\Fixed", iteration_path: "SMB\\2025\\Q2", tags: [], parent_id: 48214,
};
const BREAKDOWN = {
  root_ids: [48213], fetched_at: "2026-10-06T09:05:00Z", epics: 1, features: 1, stories: 1,
  not_imported: [{ type: "Task", count: 1 }], errors: [],
  lineage: [{
    item: { ...STORY, id: 48213, type: "epic", title: "XGPON fibre bundles", parent_id: null, description: "" },
    children: [{
      item: { ...STORY, id: 48214, type: "feature", title: "Order an XGPON bundle", parent_id: 48213, description: "" },
      children: [{ item: STORY, children: [] }],
    }],
  }],
};

// The newer read: the story moved from Closed to Resolved.
const NEWER = structuredClone(BREAKDOWN);
NEWER.lineage[0]!.children[0]!.children[0]!.item.state = "Resolved";

function detail(extra: Partial<HistoricDetail> = {}): HistoricDetail {
  return {
    ...summary(),
    brd_files: [{
      id: "b1", filename: "XGPON_bundles.docx", mime_type: "application/pdf", size_bytes: 10, checksum: "c",
      uploaded_at: "2026-10-06T09:00:00Z", uploaded_by: ada, stage: "read", error: null, warnings: [],
      passages: [{ block_id: "p1", label: "paragraph 1", section_path: [], text: "Delivered as Epic 48213." }],
    }],
    root_ids: [],
    suggestions: [{ work_item_id: 48213, block_id: "p1", label: "paragraph 1", quote: "Delivered as Epic 48213." }],
    run: null, breakdown: null, pending_refresh: null, publications: [], withdrawal: null,
    blockers: ["Its breakdown has not been read from Azure DevOps."],
    ...extra,
  } as HistoricDetail;
}

function wrap(children: ReactNode, at = "/requirement-knowledge/historic/h1") {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/requirement-knowledge/historic" element={children} />
          <Route path="/requirement-knowledge/historic/:historicId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("historic wording", () => {
  it("reads typed ids once each, and names what is not an id", () => {
    expect(parseIds("48213, #48300 48213;48301")).toEqual({ ids: [48213, 48300, 48301], invalid: [] });
    expect(parseIds("epic 12, 0").invalid).toEqual(["epic", "0"]);
  });

  it("ranks a record by what it waits on", () => {
    expect(standing(summary())).toMatchObject({ rank: "due", status: "Link its work items" });
    expect(standing(summary({ brds_reading: 1 }))).toMatchObject({ rank: "running" });
    expect(standing(summary({ run_status: "failed", run_failure: "ado_not_configured" }))).toMatchObject({
      rank: "delayed", status: "Breakdown not read",
    });
    expect(standing(summary({ status: "published", refresh_waiting: true }))).toMatchObject({ rank: "due", status: "Refresh waiting" });
    expect(standing(summary({ status: "withdrawn" }))).toMatchObject({ rank: "past" });
  });

  it("counts historic requirements on Table 4 and points to the drafts", () => {
    const overview = requirementOverview(CORPUS, "/", { draft: 2, published: 5, withdrawn: 1, refresh_waiting: 0 });
    expect(overview.totals.at(-1)).toEqual({ key: "historic", label: "Historic requirements published", value: "5" });
    expect(overview.lines).toMatchObject([{ rank: "due", name: "Historic requirements in draft", cells: { count: "2" } }]);
    // The next decision and the index say the drafts too; nothing claims all is quiet.
    expect(overview.next).toEqual({
      to: "/requirement-knowledge/historic?status=draft",
      label: "Link and publish the 2 historic requirements in draft",
    });
    expect(overview.alert).toEqual({ rank: "due", text: "2 historic in draft" });
  });

  it("puts a waiting refresh before the drafts", () => {
    const overview = requirementOverview(CORPUS, "/", { draft: 1, published: 5, withdrawn: 0, refresh_waiting: 1 });
    expect(overview.lines.map((line) => line.name)).toEqual([
      "Historic requirements in draft",
      "Historic requirements with a newer read",
    ]);
    expect(overview.next.label).toBe("Accept or discard the newer read of 1 historic requirement");
    expect(overview.alert?.text).toBe("1 historic in draft, 1 historic refresh waiting");
    const quiet = requirementOverview(CORPUS, "/", { draft: 0, published: 5, withdrawn: 0, refresh_waiting: 0 });
    expect(quiet.next.label).toBe("Nothing in requirement knowledge awaits anyone.");
  });

  it("names the one decision a record waits on", () => {
    expect(nextStep(detail())).toEqual({ target: "historic-work-items", label: "Link its work items" });
    expect(nextStep(detail({ breakdown: BREAKDOWN, blockers: [] } as never))?.target).toBe("historic-publish");
    expect(nextStep(detail({ brds_reading: 1 }))).toBeNull();
    expect(nextStep(detail({ status: "published" }))).toBeNull();
  });
});

describe("the historic list", () => {
  it("lists records grouped by state, says where each stands, and imports BRDs with a result for each", async () => {
    vi.spyOn(api, "historicList").mockResolvedValue({
      items: [
        summary(),
        summary({ id: "h2", title: "Gulf roaming", status: "published", published_at: "2026-10-05T09:00:00Z", work_items: 4, citations: 2 }),
        summary({ id: "h3", title: "Old tariffs", status: "published", published_at: "2026-10-04T09:00:00Z", work_items: 1, citations: null, refresh_waiting: true }),
      ],
      next_offset: null,
      counts: { draft: 1, published: 2, withdrawn: 0, refresh_waiting: 1 },
    });
    const imported = vi.spyOn(api, "importHistoric").mockResolvedValue({
      results: [
        { filename: "a.docx", outcome: "added", version_id: "h3", title: "a", reason: null },
        { filename: "b.doc", outcome: "refused", version_id: null, title: null, reason: "Save it as .docx." },
      ],
    } as never);
    render(wrap(<HistoricPage />, "/requirement-knowledge/historic?status=draft"));
    const list = screen.getByRole("region", { name: "Historic requirements" });
    const draft = await within(list).findByRole("link", { name: /^XGPON bundles/ });
    expect(draft).toHaveAttribute("href", "/requirement-knowledge/historic/h1?status=draft");
    expect(within(within(list).getByRole("list", { name: /^Drafts \d+$/ })).getByText("Link its work items")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "State" })).toHaveValue("draft");
    expect(screen.getByRole("option", { name: "Drafts (1)" })).toBeInTheDocument();
    // Cited by: a count, or nothing said when requirement work could not say.
    const cited = within(list).getByRole("link", { name: /^Gulf roaming/ });
    expect(cited).toHaveTextContent("1 BRD · 4 work items · cited by 2 requirements");
    // Published and quiet carries no pill; a refresh waiting says so.
    expect(within(cited).queryByText("Published")).not.toBeInTheDocument();
    const unknown = within(list).getByRole("link", { name: /^Old tariffs/ });
    expect(unknown).not.toHaveTextContent("cited by");
    expect(within(unknown).getByText("Refresh waiting")).toBeInTheDocument();
    // With none chosen, the record side says what waits on a curator.
    expect(await screen.findByRole("link", { name: "Accept or discard the newer reads" })).toHaveAttribute("href", "/requirement-knowledge/historic?status=published");

    fireEvent.click(within(list).getByRole("button", { name: "Import BRDs" }));
    expect(screen.getByRole("heading", { name: "Import old BRDs" })).toHaveFocus();
    const input = screen.getByLabelText("BRDs");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.docx"), new File(["y"], "b.doc")] } });
    fireEvent.click(screen.getByRole("button", { name: "Import the 2 BRDs" }));
    await waitFor(() => expect(imported).toHaveBeenCalled());
    const said = await screen.findByText("1 of 2 BRDs imported; each is being read.");
    await waitFor(() => expect(said).toHaveFocus());
    expect(screen.getByText("Save it as .docx.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "a.docx" })).toHaveAttribute("href", "/requirement-knowledge/historic/h3");
  });

  it("asks for the BRDs before importing, and keeps the button reachable", async () => {
    const imported = vi.spyOn(api, "importHistoric");
    render(wrap(<HistoricPage />, "/requirement-knowledge/historic"));
    fireEvent.click(await screen.findByRole("button", { name: "Import BRDs" }));
    const button = screen.getByRole("button", { name: "Import the BRDs" });
    expect(button).toHaveAccessibleDescription("Choose the BRDs first.");
    fireEvent.click(button);
    expect(imported).not.toHaveBeenCalled();
  });

  it("says when there are none yet, and offers the import", async () => {
    vi.spyOn(api, "historicList").mockResolvedValue({ items: [], next_offset: null, counts: { draft: 0, published: 0, withdrawn: 0, refresh_waiting: 0 } });
    render(wrap(<HistoricPage />, "/requirement-knowledge/historic"));
    expect(await screen.findByText("No historic requirements yet.")).toBeInTheDocument();
    expect(screen.getByText("None yet. Import the first BRDs.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Import BRDs" }).at(-1)!);
    expect(screen.getByRole("heading", { name: "Import old BRDs" })).toBeInTheDocument();
  });
});

describe("a historic requirement", () => {
  it("offers the ids found in its BRD, checks typed ids, and reads the breakdown", async () => {
    vi.spyOn(api, "historic").mockResolvedValue(detail());
    vi.spyOn(api, "historicSharedRoots").mockResolvedValue({
      items: [{ work_item_id: 48213, historic_id: "h9", title: "Billing statements", status: "withdrawn" }],
    });
    const link = vi.spyOn(api, "linkWorkItems").mockResolvedValue(detail({ root_ids: [48213], run_status: "queued" }));
    render(wrap(<HistoricPage />));
    expect(await screen.findByRole("heading", { name: "XGPON bundles" })).toBeInTheDocument();
    expect(screen.getByText("Delivered as Epic 48213.")).toBeInTheDocument();
    // The head says what it waits on; the link takes the reader to that section.
    fireEvent.click(screen.getByRole("link", { name: "Link its work items" }));
    expect(screen.getByRole("heading", { name: "Work items in Azure DevOps" })).toHaveFocus();
    // One Epic can serve two BRDs: said, never refused.
    expect(await screen.findByRole("link", { name: "‘Billing statements’" })).toHaveAttribute("href", "/requirement-knowledge/historic/h9");
    expect(screen.getByText("“Delivered as Epic 48213.”")).toBeInTheDocument();
    const field = screen.getByLabelText("Top-level work item ids");
    fireEvent.change(field, { target: { value: "epic" } });
    fireEvent.click(screen.getByRole("button", { name: "Read the breakdown" }));
    expect(screen.getByText("Work item ids are whole numbers; “epic” is not.")).toBeInTheDocument();
    expect(field).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Use it" }));
    expect(field).toHaveValue("48213");
    fireEvent.click(screen.getByRole("button", { name: "Read the breakdown" }));
    await waitFor(() => expect(link).toHaveBeenCalledWith("h1", [48213], 3));
    // Publishing waits, and says why; the button stays reachable so the reason is read with it.
    const publish = screen.getByRole("button", { name: "Publish it" });
    expect(publish).toHaveAttribute("aria-disabled", "true");
    expect(publish).toHaveAccessibleDescription("Its breakdown has not been read from Azure DevOps.");
    expect(screen.getByText("Its breakdown has not been read from Azure DevOps.")).toBeInTheDocument();
  });

  it("asks no one who cites a draft", async () => {
    const cited = vi.mocked(api.historicCitedBy);
    vi.spyOn(api, "historic").mockResolvedValue(detail());
    render(wrap(<HistoricPage />));
    expect(await screen.findByRole("heading", { name: "XGPON bundles" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Cited by/ })).not.toBeInTheDocument();
    expect(cited).not.toHaveBeenCalled();
  });

  it("says when requirement work cannot say who cites it", async () => {
    vi.spyOn(api, "historic").mockResolvedValue(detail({
      status: "withdrawn",
      publications: [{ number: 1, published_at: "2026-10-06T09:10:00Z", published_by: ada, fingerprint: "f" }],
    } as never));
    const cited = vi.spyOn(api, "historicCitedBy").mockRejectedValueOnce(new Error("Requirement work is unavailable."));
    render(wrap(<HistoricPage />));
    expect(await screen.findByText(/Who cites it could not be read/)).toBeInTheDocument();
    cited.mockResolvedValueOnce({ total: 0, items: [], next_offset: null });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Withdrawn, it is no longer offered as prior art/)).toBeInTheDocument();
  });

  it("warns before withdrawing even when requirement work cannot say who cites it", async () => {
    vi.spyOn(api, "historic").mockResolvedValue(detail({
      status: "published",
      publications: [{ number: 1, published_at: "2026-10-06T09:10:00Z", published_by: ada, fingerprint: "f" }],
    } as never));
    vi.spyOn(api, "historicCitedBy").mockRejectedValue(new Error("Requirement work is unavailable."));
    render(wrap(<HistoricPage />));
    expect(await screen.findByText(/Who cites it could not be read/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw from requirement work…" }));
    const warning = await screen.findByText((_, element) => element?.tagName === "P" && /could not say which Requirements cite it/.test(element.textContent ?? ""));
    expect(warning).toHaveTextContent("Requirement work stops reading it as prior art; requirement work could not say which Requirements cite it, and any that do stop showing it at once.");
  });

  it("marks citations of a withdrawn record as past, and hands focus to the rows Show more adds", async () => {
    vi.spyOn(api, "historic").mockResolvedValue(detail({
      status: "withdrawn",
      publications: [{ number: 1, published_at: "2026-10-06T09:10:00Z", published_by: ada, fingerprint: "f" }],
    } as never));
    const row = (id: string, title: string) => ({
      requirement_id: id, title, owner: "Mona Adel", checked_at: "2026-10-06T10:00:00Z", current: false, retired: false, duplicate: false,
    });
    vi.spyOn(api, "historicCitedBy")
      .mockResolvedValueOnce({ total: 2, items: [row("R-1", "Fibre bundles for clinics")], next_offset: 1 })
      .mockResolvedValueOnce({ total: 2, items: [row("R-2", "Branch fibre")], next_offset: null });
    render(wrap(<HistoricPage />));
    const first = await screen.findByText("Cited before it was withdrawn");
    expect(first.closest(".ds-status")).toHaveClass("ds-status--stopped");
    expect(first.closest("tr")).toHaveTextContent("It no longer shows it.");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /^Branch fibre/ })).toHaveFocus());
  });

  it("shows its lineage as numbered rows and publishes it", async () => {
    vi.spyOn(api, "historic").mockResolvedValue(detail({ root_ids: [48213], work_items: 3, breakdown: BREAKDOWN, blockers: [] } as never));
    const publish = vi.spyOn(api, "publishHistoric").mockResolvedValue(detail({ status: "published" }));
    render(wrap(<HistoricPage />));
    const lineage = await screen.findByRole("table", { name: /Its Epics, Features and User Stories/ });
    const numbers = within(lineage).getAllByRole("row").slice(1).map((row) => (row as HTMLTableRowElement).cells[0]?.textContent);
    expect(numbers).toEqual(["1", "1.1", "1.1.1"]);
    const ado = within(lineage).getByRole("link", { name: /#48216/ });
    expect(ado).toHaveTextContent("#48216 (opens Azure DevOps)");
    expect(ado).toHaveAttribute("href", STORY.url);
    expect(screen.getByText(/not imported: 1 Task/)).toBeInTheDocument();
    const toggle = within(lineage).getByRole("button", { name: "Show what #48216 says" });
    fireEvent.click(toggle);
    expect(screen.getByText("Only covered addresses.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish it" }));
    await waitFor(() => expect(publish).toHaveBeenCalledWith("h1", 3));
  });

  it("weighs a refresh, and withdraws only with a reason", async () => {
    const published = detail({
      status: "published", root_ids: [48213], breakdown: BREAKDOWN, blockers: [], refresh_waiting: true,
      publications: [{ number: 1, published_at: "2026-10-06T09:10:00Z", published_by: ada, fingerprint: "f" }],
      pending_refresh: {
        breakdown: NEWER,
        changes: [{ kind: "changed", work_item_id: 48216, title: STORY.title, fields: ["state", "description"] }],
      },
    } as never);
    vi.spyOn(api, "historic").mockResolvedValue(published);
    const accept = vi.spyOn(api, "acceptHistoricRefresh").mockResolvedValue({ ...published, pending_refresh: null });
    const withdraw = vi.spyOn(api, "withdrawHistoric").mockResolvedValue({ ...published, status: "withdrawn" });
    vi.spyOn(api, "historicCitedBy").mockResolvedValue({
      total: 2,
      items: [
        { requirement_id: "R-1", title: "Fibre bundles for clinics", owner: "Mona Adel", checked_at: "2026-10-06T10:00:00Z", current: true, retired: false, duplicate: false },
        { requirement_id: "R/2", title: "Branch fibre", owner: "", checked_at: "2026-10-05T10:00:00Z", current: false, retired: false, duplicate: false },
      ],
      next_offset: null,
    });
    render(wrap(<HistoricPage />));
    const changes = await screen.findByRole("table", { name: /What changed in Azure DevOps/ });
    // Who cites it, and whether that check still stands; each opens the Requirement's Knowledge step.
    expect(await screen.findByRole("heading", { name: /^Cited by\s*·\s*2 requirements$/ })).toBeInTheDocument();
    const citing = screen.getByRole("table", { name: "Requirements citing XGPON bundles" });
    const first = within(citing).getByRole("link", { name: /^Fibre bundles for clinics\s*\(opens requirement work\)$/ });
    expect(first).toHaveAttribute("href", "/requirements/R-1/knowledge");
    expect(within(citing).getByRole("link", { name: /Branch fibre/ })).toHaveAttribute("href", "/requirements/R%2F2/knowledge");
    expect(first.closest("th")).toHaveTextContent("Owned by Mona Adel");
    expect(within(citing).getByText(/^No owner/)).toBeInTheDocument();
    expect(within(citing).getByText("Older check").closest(".ds-status")).toHaveClass("ds-status--neutral");
    expect(within(citing).getByText("Checked again when its Knowledge step opens.")).toBeInTheDocument();
    // From the published read to the newer one, value by value; long fields are only named.
    const [state, description] = within(changes).getAllByRole("listitem");
    expect(state).toHaveTextContent("state Closed → became Resolved");
    expect(description).toHaveTextContent("description changed");
    expect(screen.getByText(/This is the published read; the newer one waits above./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /A newer read from Azure DevOps is waiting: 1 work item changed/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept the refresh and publish" }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith("h1", 3));

    const open = screen.getByRole("button", { name: "Withdraw from requirement work…" });
    fireEvent.click(open);
    const panel = screen.getByRole("region", { name: "Withdraw ‘XGPON bundles’ from requirement work?" });
    const why = within(panel).getByRole("textbox", { name: "Why" });
    expect(why).toHaveFocus();
    // What follows is the field's description, so it is heard on arrival.
    expect(why).toHaveAccessibleDescription(/the 2 requirements citing it stop showing it at once\. .*Withdrawing cannot be undone/);
    fireEvent.click(within(panel).getByRole("button", { name: "Withdraw it" }));
    expect(within(panel).getByText(/^Give a reason\./)).toBeInTheDocument();
    expect(why).toHaveFocus();
    expect(withdraw).not.toHaveBeenCalled();
    fireEvent.keyDown(why, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw from requirement work…" })).toHaveFocus());
  });
});
