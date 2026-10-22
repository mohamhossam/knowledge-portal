import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type CorpusFinding, type CorpusRequirement, type RequirementCorpus } from "../api/client";
import { ApiError } from "../api/errors";
import { FindingsPage } from "./FindingsPage";
import { RequirementKnowledgeIndex, RequirementsPage } from "./RequirementsPage";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const summary: RequirementCorpus = {
  requirements: 12, duplicates: 1, current: 9, waiting: 2, failed: 1, rebuild_required: false,
  open_findings: { under_7_days: 3, from_7_to_30_days: 1, over_30_days: 2 },
  as_of: "2026-10-06T09:00:00Z",
  retired: 0,
};

const amina = { id: "fake-owner", display_name: "Amina Owner" };
const ravi = { id: "fake-reviewer", display_name: "Ravi Reviewer" };

const requirement = (overrides: Partial<CorpusRequirement> = {}): CorpusRequirement => ({
  requirement_id: "REQ-1", title: "XGPON bundles", duplicate: false, owner: amina,
  index_state: "current", last_screened_at: "2026-10-01T09:00:00Z", open_findings: 0, retired: null, ...overrides,
});

const finding = (overrides: Partial<CorpusFinding> = {}): CorpusFinding => ({
  finding_id: "kf-1",
  kind: "possible_duplicate",
  rationale: "Both order XGPON bundles through BCRM.",
  raised_at: "2026-08-27T09:00:00Z",
  age: "over_30_days",
  subject: { requirement_id: "REQ-2", title: "XGPON for offices", owner: amina },
  related: { requirement_id: "REQ-1", title: "XGPON bundles", owner: ravi },
  last_nudge: null,
  next_nudge_at: null,
  ...overrides,
});

function Where() {
  const location = useLocation();
  return <p data-testid="address">{location.pathname + location.search}</p>;
}

function renderAt(path: string) {
  vi.spyOn(api, "requirementCorpus").mockResolvedValue(summary);
  vi.spyOn(api, "historicList").mockResolvedValue({ items: [], next_offset: null, counts: { draft: 0, published: 0, withdrawn: 0, refresh_waiting: 0 } });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="requirement-knowledge" element={<><RequirementKnowledgeIndex /><Where /></>} />
          <Route path="requirement-knowledge/requirements" element={<><RequirementsPage /><Where /></>} />
          <Route path="requirement-knowledge/requirements/:requirementId" element={<><RequirementsPage /><Where /></>} />
          <Route path="requirement-knowledge/findings" element={<><FindingsPage /><Where /></>} />
          <Route path="requirement-knowledge/findings/:findingId" element={<><FindingsPage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const list = () => screen.getByRole("region", { name: "Requirements" });
const record = (name: string | RegExp) => screen.getByRole("article", { name });

describe("RequirementsPage", () => {
  it("lists requirements with their owner, index and screening, and marks which are disrupted", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({
      items: [
        requirement({ requirement_id: "REQ-9", title: "Archive", owner: null, index_state: "failed", last_screened_at: null }),
        requirement({ open_findings: 2 }),
        requirement({ requirement_id: "REQ-3", title: "Old fibre", duplicate: true }),
      ],
      next_offset: null,
    });
    renderAt("/requirement-knowledge/requirements");

    const archive = await within(list()).findByRole("link", { name: /^Archive/ });
    expect(archive).toHaveAttribute("href", "/requirement-knowledge/requirements/REQ-9");
    expect(archive).toHaveTextContent("No owner · never screened");
    expect(within(archive).getByText("Stopped indexing").closest(".ds-status")).toHaveClass("ds-status--attention");
    const bundles = within(list()).getByRole("link", { name: /^XGPON bundles/ });
    expect(bundles).toHaveTextContent("Amina Owner · screened 1 Oct 2026");
    expect(within(bundles).getByText("2 findings")).toBeInTheDocument();
    expect(within(within(list()).getByRole("link", { name: /^Old fibre/ })).getByText("Duplicate")).toBeInTheDocument();
    // "Current" is the quiet default: a current row carries no state pill.
    expect(within(bundles).queryByText("Current")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Requirements");
    const pages = screen.getByRole("navigation", { name: "Requirement knowledge" });
    expect(within(pages).getByRole("link", { name: /^Requirements/ })).toHaveAttribute("aria-current", "page");
    expect(within(pages).getByRole("link", { name: /^Findings/ })).toHaveTextContent("Findings 6");
    expect(await screen.findByRole("option", { name: "Stopped indexing (1)" })).toBeInTheDocument();
  });

  it("keeps the overview's address, and says what needs someone when no requirement is chosen", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement()], next_offset: null });
    renderAt("/requirement-knowledge");

    expect(await screen.findByText("12 requirements in requirement work's corpus. Choose one to read its record.")).toBeInTheDocument();
    // In place, not redirected: a redirect would move focus to the h1 on a typed address.
    expect(screen.getByTestId("address")).toHaveTextContent(/^\/requirement-knowledge$/);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Requirements/);
    expect(screen.getByRole("navigation", { name: "Requirement knowledge" }).querySelector("[aria-current=page]")).toHaveTextContent(/^Requirements/);
    expect(screen.getByRole("link", { name: "Ask the owners to decide the 2 overdue findings" })).toHaveAttribute(
      "href", "/requirement-knowledge/findings?age=over_30_days",
    );
    expect(screen.getByRole("link", { name: "Requirements that stopped indexing" })).toHaveAttribute("href", "/requirement-knowledge/requirements?state=failed");
  });

  it("opens a requirement's record beside the list, with the way to requirement work", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement({ open_findings: 1 })], next_offset: null });
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding(), finding({ finding_id: "kf-9", subject: { requirement_id: "REQ-7", title: "Seven", owner: amina }, related: { requirement_id: "REQ-8", title: "Eight", owner: amina } })], next_offset: null });
    renderAt("/requirement-knowledge/requirements/REQ-1");

    const view = await screen.findByRole("article", { name: "XGPON bundles" });
    expect(within(list()).getByRole("link", { name: /^XGPON bundles/ })).toHaveAttribute("aria-current", "page");
    expect(within(view).getByRole("link", { name: /^Open its Knowledge step\s*\(opens requirement work\)$/ })).toHaveAttribute(
      "href", "/requirements/REQ-1/knowledge",
    );
    // Its own finding, among its owner's: the other requirement named, opening on the Findings page.
    expect(await within(view).findByRole("link", { name: "Possible duplicate of ‘XGPON for offices’" })).toHaveAttribute(
      "href", "/requirement-knowledge/findings/kf-1",
    );
    expect(within(view).queryByText(/Seven/)).not.toBeInTheDocument();
    expect(within(view).getByRole("link", { name: "List only theirs" })).toHaveAttribute("href", "/requirement-knowledge/requirements?owner=fake-owner");
  });

  it("keeps its filters in the address and asks requirement work with them", async () => {
    const read = vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement()], next_offset: null });
    renderAt("/requirement-knowledge/requirements?state=failed&open=1");

    const row = await within(list()).findByRole("link", { name: /^XGPON bundles/ });
    // A record keeps the list as filtered.
    expect(row).toHaveAttribute("href", "/requirement-knowledge/requirements/REQ-1?state=failed&open=1");
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ indexState: "failed", openFindingsOnly: true, notScreenedForDays: undefined }),
      0,
    );
    expect(screen.getByRole("combobox", { name: "Index" })).toHaveValue("failed");

    fireEvent.click(screen.getByRole("checkbox", { name: "Not screened in 30 days" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Index" }), { target: { value: "all" } });

    expect(screen.getByTestId("address")).toHaveTextContent("/requirement-knowledge/requirements?open=1&stale=1");
    await waitFor(() =>
      expect(read).toHaveBeenLastCalledWith(
        expect.objectContaining({ indexState: undefined, openFindingsOnly: true, notScreenedForDays: 30 }),
        0,
      ),
    );
  });

  it("narrows to one owner from a record, and shows more on request", async () => {
    const read = vi.spyOn(api, "corpusRequirements")
      .mockResolvedValueOnce({ items: [requirement()], next_offset: 50 })
      .mockResolvedValue({ items: [requirement({ requirement_id: "REQ-51", title: "Zeta" })], next_offset: null });
    renderAt("/requirement-knowledge/requirements/REQ-1");

    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await within(list()).findByRole("link", { name: /^Zeta/ })).toBeInTheDocument();
    expect(read).toHaveBeenLastCalledWith(expect.anything(), 50);

    fireEvent.click(within(record("XGPON bundles")).getByRole("link", { name: "List only theirs" }));
    expect(screen.getByTestId("address")).toHaveTextContent("/requirement-knowledge/requirements?owner=fake-owner");
  });

  it("says requirement work did not answer, and offers to try again", async () => {
    vi.spyOn(api, "corpusRequirements").mockRejectedValue(new ApiError(503, "Requirement work is unavailable."));
    renderAt("/requirement-knowledge/requirements");

    expect(await screen.findByRole("alert")).toHaveTextContent("Requirement work did not answer: Requirement work is unavailable.");
    expect(within(list()).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says when the requirement asked for is not in the list", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement()], next_offset: null });
    renderAt("/requirement-knowledge/requirements/REQ-404?state=failed");

    expect(await screen.findByText("“REQ-404” is not in this list.")).toBeInTheDocument();
    expect(screen.getByText("It may not match these filters, or it has left the corpus.")).toBeInTheDocument();
  });
});

describe("Corpus actions on a requirement's record", () => {
  it("retires a requirement in place, with a required reason, and says what it came to", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement({ open_findings: 1 })], next_offset: null });
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [], next_offset: null });
    const retire = vi.spyOn(api, "retireRequirement").mockResolvedValue({
      requirement_id: "REQ-1", state: "retired", changed_at: "2026-10-07T09:00:00Z", closed_findings: 1, notified: "Amina Owner",
    });
    renderAt("/requirement-knowledge/requirements/REQ-1");

    const trigger = await within(await screen.findByRole("article", { name: "XGPON bundles" })).findByRole("button", { name: "Retire from the corpus…" });
    fireEvent.click(trigger);
    const form = screen.getByRole("region", { name: /Retire it from the corpus/ });
    expect(form).toHaveTextContent("Its open finding closes as “source retired”. Amina Owner is told why.");
    expect(form).toHaveTextContent("You can reinstate it later");
    const why = within(form).getByRole("textbox", { name: "Why" });
    expect(why).toHaveFocus();
    fireEvent.click(within(form).getByRole("button", { name: "Retire it" }));
    expect(retire).not.toHaveBeenCalled();
    expect(within(form).getByText(/Give a reason/)).toBeInTheDocument();
    expect(why).toHaveFocus();

    fireEvent.change(why, { target: { value: "Cancelled launch." } });
    fireEvent.click(within(form).getByRole("button", { name: "Retire it" }));

    await waitFor(() => expect(retire).toHaveBeenCalledWith("REQ-1", "Cancelled launch."));
    expect(await screen.findByText("Retired ‘XGPON bundles’ from the corpus. 1 finding closed as “source retired”. Amina Owner was told.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Retire it from the corpus/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retire from the corpus…" })).toHaveFocus());
  });

  it("shows who retired a requirement and offers to reinstate it, passing requirement work's refusal", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({
      items: [requirement({ retired: { at: "2026-10-07T09:00:00Z", by: "Omar Observer", reason: "Cancelled launch." } })],
      next_offset: null,
    });
    vi.spyOn(api, "reinstateRequirement").mockRejectedValue(new ApiError(409, "This Requirement is not retired."));
    renderAt("/requirement-knowledge/requirements/REQ-1?state=retired");

    const view = await screen.findByRole("article", { name: "XGPON bundles" });
    expect(within(view).getByText("Cancelled launch.")).toBeInTheDocument();
    expect(within(view).getByText((_, element) => element?.tagName === "DD" && /^Retired by Omar Observer on 7 Oct 2026/.test(element.textContent ?? ""))).toBeInTheDocument();
    expect(within(within(list()).getByRole("link", { name: /^XGPON bundles/ })).getByText("Retired")).toBeInTheDocument();
    // A retired requirement is not indexed, so it offers no reindex.
    expect(within(view).queryByRole("button", { name: "Index it again" })).not.toBeInTheDocument();
    fireEvent.click(within(view).getByRole("button", { name: "Reinstate…" }));
    const form = screen.getByRole("region", { name: /Return it to the corpus/ });
    fireEvent.change(within(form).getByRole("textbox", { name: "Why" }), { target: { value: "Back on." } });
    fireEvent.click(within(form).getByRole("button", { name: "Reinstate it" }));

    expect(await within(form).findByText("This Requirement is not retired.")).toBeInTheDocument();
    fireEvent.keyDown(form, { key: "Escape" });
    expect(screen.queryByRole("region", { name: /Return it to the corpus/ })).not.toBeInTheDocument();
    await waitFor(() => expect(within(view).getByRole("button", { name: "Reinstate…" })).toHaveFocus());
  });

  it("indexes one requirement again from its record", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement({ index_state: "failed" })], next_offset: null });
    const reindex = vi.spyOn(api, "reindexCorpus").mockResolvedValue({ requirements: 1 });
    renderAt("/requirement-knowledge/requirements/REQ-1");

    fireEvent.click(await screen.findByRole("button", { name: "Retry indexing it" }));
    await waitFor(() => expect(reindex).toHaveBeenCalledWith("requirements", ["REQ-1"]));
    expect(await screen.findByText("‘XGPON bundles’ will be indexed again. Its state here updates once it is done.")).toBeInTheDocument();
  });

  it("asks before retrying what stopped indexing, then says how many", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement()], next_offset: null });
    const reindex = vi.spyOn(api, "reindexCorpus").mockResolvedValue({ requirements: 1 });
    renderAt("/requirement-knowledge/requirements");

    fireEvent.click(await screen.findByRole("button", { name: /Retry the 1 requirement that stopped indexing/ }));
    const confirm = screen.getByRole("region", { name: "Retry the 1 requirement that stopped indexing?" });
    expect(within(confirm).getByRole("heading", { name: "Retry the 1 requirement that stopped indexing?" })).toHaveFocus();
    expect(reindex).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Retry it" }));

    await waitFor(() => expect(reindex).toHaveBeenCalledWith("failed", []));
    const said = await screen.findByText(/Retrying 1 requirement/);
    await waitFor(() => expect(said.closest("p")).toHaveFocus());
  });

  it("closes a bulk confirmation on Escape and returns focus to its button", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement()], next_offset: null });
    renderAt("/requirement-knowledge/requirements");

    const reindex = await screen.findByRole("button", { name: "Reindex the 1 requirement listed" });
    fireEvent.click(reindex);
    fireEvent.keyDown(screen.getByRole("region", { name: "Index this requirement again?" }), { key: "Escape" });

    expect(screen.queryByRole("region", { name: "Index this requirement again?" })).not.toBeInTheDocument();
    await waitFor(() => expect(reindex).toHaveFocus());
  });

  it("reindexes the requirements listed, leaving retired ones out", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({
      items: [
        requirement(),
        requirement({ requirement_id: "REQ-2", title: "Gone", retired: { at: "2026-10-07T09:00:00Z", by: "Omar", reason: "Old." } }),
      ],
      next_offset: null,
    });
    const reindex = vi.spyOn(api, "reindexCorpus").mockResolvedValue({ requirements: 1 });
    renderAt("/requirement-knowledge/requirements");

    fireEvent.click(await screen.findByRole("button", { name: "Reindex the 1 requirement listed" }));
    fireEvent.click(screen.getByRole("button", { name: "Reindex it" }));

    await waitFor(() => expect(reindex).toHaveBeenCalledWith("requirements", ["REQ-1"]));
  });
});

describe("FindingsPage", () => {
  const findings = () => screen.getByRole("region", { name: "Findings" });

  it("lists findings by how long they have stood, and opens one with its rationale and both requirements", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding(), finding({ finding_id: "kf-2", age: "under_7_days", rationale: "Recent.", subject: { requirement_id: "REQ-4", title: "Four", owner: amina } })], next_offset: null });
    renderAt("/requirement-knowledge/findings/kf-1?age=over_30_days");

    const row = await within(findings()).findByRole("link", { name: /^XGPON for offices/ });
    expect(row).toHaveAttribute("aria-current", "page");
    expect(row).toHaveTextContent("Possible duplicate of XGPON bundles");
    expect(within(findings()).getByRole("list", { name: /^Open over 30 days \d+$/ })).toContainElement(row);
    expect(within(findings()).getByRole("list", { name: /^Open under 7 days \d+$/ })).toBeInTheDocument();

    const view = screen.getByRole("article", { name: "XGPON for offices and XGPON bundles" });
    expect(within(view).getByText("Both order XGPON bundles through BCRM.")).toBeInTheDocument();
    expect(within(view).getByText("Overdue").closest(".ds-status")).toHaveClass("ds-status--attention");
    expect(within(view).getByText("Possible duplicate")).toBeInTheDocument();
    expect(within(view).getAllByRole("link", { name: /^Its Knowledge step\s*\(opens requirement work\)$/ })[0]).toHaveAttribute(
      "href", "/requirements/REQ-2/knowledge",
    );
    expect(within(view).getByText("Not yet")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Open over 30 days (2)" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Open for" })).toHaveValue("over_30_days");
  });

  it("asks both owners by name and says so on the record", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding({ age: "under_7_days" })], next_offset: null });
    const nudge = vi.spyOn(api, "nudgeFinding").mockResolvedValue({
      finding_id: "kf-1", nudged_at: "2026-10-06T09:00:00Z", recipients: ["Amina Owner", "Ravi Reviewer"],
      next_nudge_at: "2026-10-13T09:00:00Z",
    });
    renderAt("/requirement-knowledge/findings/kf-1");

    fireEvent.click(await screen.findByRole("button", { name: "Ask Amina Owner and Ravi Reviewer" }));

    await waitFor(() => expect(nudge).toHaveBeenCalledWith("kf-1"));
    const said = await within(record("XGPON for offices and XGPON bundles")).findByText("Asked Amina Owner and Ravi Reviewer.");
    expect(said.closest("[role=status]")).toBeInTheDocument();
  });

  it("asks the owners of every overdue finding after naming everyone it reaches", async () => {
    const overdue = [
      finding(),
      finding({ finding_id: "kf-2", rationale: "Second.", related: { requirement_id: "REQ-5", title: "Five", owner: amina } }),
      finding({ finding_id: "kf-3", rationale: "Asked lately.", next_nudge_at: "2026-10-11T09:00:00Z" }),
    ];
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: overdue, next_offset: null });
    const nudge = vi.spyOn(api, "nudgeFinding").mockResolvedValue({
      finding_id: "x", nudged_at: "2026-10-06T09:00:00Z", recipients: [], next_nudge_at: "2026-10-13T09:00:00Z",
    });
    renderAt("/requirement-knowledge/findings");

    fireEvent.click(await screen.findByRole("button", { name: /Ask the owners of all 2 overdue findings/ }));
    const confirm = screen.getByRole("region", { name: "Ask the owners of 2 overdue findings?" });
    expect(within(confirm).getByRole("heading", { name: "Ask the owners of 2 overdue findings?" })).toHaveFocus();
    const reached = within(confirm).getAllByRole("listitem").map((item) => item.textContent);
    expect(reached).toEqual(["Amina Owner, about 2 findings", "Ravi Reviewer, about 1 finding"]);
    expect(nudge).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Ask them" }));

    expect(await screen.findByText("Asked the owners of 2 overdue findings.")).toBeInTheDocument();
    expect(nudge.mock.calls.map((call) => call[0])).toEqual(["kf-1", "kf-2"]);
  });

  it("explains why a finding cannot be asked about yet, and keeps the button reachable", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({
      items: [finding({
        last_nudge: { at: "2026-10-04T09:00:00Z", by: "Ravi Reviewer" },
        next_nudge_at: "2026-10-11T09:00:00Z",
      })],
      next_offset: null,
    });
    const nudge = vi.spyOn(api, "nudgeFinding");
    renderAt("/requirement-knowledge/findings/kf-1");

    const button = await screen.findByRole("button", { name: "Ask Amina Owner and Ravi Reviewer" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(/again from 11 Oct 2026\.$/);
    expect(screen.getByText((_, element) => element?.tagName === "DD" && element.textContent === "4 Oct 2026 by Ravi Reviewer")).toBeInTheDocument();
    // The list marks it as asked.
    expect(within(within(findings()).getByRole("link", { name: /^XGPON for offices/ })).getByText("Asked")).toBeInTheDocument();
    fireEvent.click(button);
    expect(nudge).not.toHaveBeenCalled();
  });

  it("passes on requirement work's refusal", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding({ age: "under_7_days" })], next_offset: null });
    vi.spyOn(api, "nudgeFinding").mockRejectedValue(
      new ApiError(409, "This finding is no longer open: its owners have decided it."),
    );
    renderAt("/requirement-knowledge/findings/kf-1");

    fireEvent.click(await screen.findByRole("button", { name: "Ask Amina Owner and Ravi Reviewer" }));

    const said = await within(record("XGPON for offices and XGPON bundles")).findByText("Not sent: This finding is no longer open: its owners have decided it.");
    expect(said.closest(".ds-status")).toHaveClass("ds-status--attention");
  });

  it("asks the one owner there is, and says when there is no one to ask", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({
      items: [
        finding({ related: { requirement_id: "REQ-1", title: "XGPON bundles", owner: null } }),
        finding({
          finding_id: "kf-2",
          rationale: "Nobody owns these.",
          subject: { requirement_id: "REQ-7", title: "Seven", owner: null },
          related: { requirement_id: "REQ-8", title: "Eight", owner: null },
        }),
      ],
      next_offset: null,
    });
    renderAt("/requirement-knowledge/findings/kf-1");

    expect(await screen.findByRole("button", { name: "Ask Amina Owner" })).not.toHaveAttribute("aria-disabled");
    fireEvent.click(within(findings()).getByRole("link", { name: /^Seven/ }));
    const orphan = await screen.findByRole("article", { name: "Seven and Eight" });
    expect(within(orphan).getByRole("button", { name: "No owner to ask" })).toHaveAccessibleDescription(
      "Neither requirement has an owner to ask.",
    );
  });
});
