import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type CorpusFinding, type CorpusRequirement, type RequirementCorpus } from "../api/client";
import { ApiError } from "../api/errors";
import { CorpusFindingsPage } from "./CorpusFindingsPage";
import { CorpusRequirementsPage } from "./CorpusRequirementsPage";

afterEach(() => vi.restoreAllMocks());

const summary: RequirementCorpus = {
  requirements: 12, duplicates: 1, current: 9, waiting: 2, failed: 1, rebuild_required: false,
  open_findings: { under_7_days: 3, from_7_to_30_days: 1, over_30_days: 2 },
  as_of: "2026-10-06T09:00:00Z",
};

const amina = { id: "fake-owner", display_name: "Amina Owner" };
const ravi = { id: "fake-reviewer", display_name: "Ravi Reviewer" };

const requirement = (overrides: Partial<CorpusRequirement> = {}): CorpusRequirement => ({
  requirement_id: "REQ-1", title: "XGPON bundles", duplicate: false, owner: amina,
  index_state: "current", last_screened_at: "2026-10-01T09:00:00Z", open_findings: 0, ...overrides,
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

function renderAt(path: string, page: ReactNode) {
  vi.spyOn(api, "requirementCorpus").mockResolvedValue(summary);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="requirement-knowledge/requirements" element={<>{page}<Where /></>} />
          <Route path="requirement-knowledge/findings" element={<>{page}<Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CorpusRequirementsPage", () => {
  it("lists requirements with their owner, index and screening, and says which are disrupted", async () => {
    vi.spyOn(api, "corpusRequirements").mockResolvedValue({
      items: [
        requirement({ requirement_id: "REQ-9", title: "Archive", owner: null, index_state: "failed", last_screened_at: null }),
        requirement({ open_findings: 2 }),
        requirement({ requirement_id: "REQ-3", title: "Old fibre", duplicate: true }),
      ],
      next_offset: null,
    });
    renderAt("/requirement-knowledge/requirements", <CorpusRequirementsPage />);

    const archive = (await screen.findByRole("link", { name: /^Archive/ })).closest("tr")!;
    expect(archive).toHaveClass("row--delayed");
    expect(within(archive).getAllByText("Stopped indexing")[0]).toHaveClass("status");
    expect(within(archive).getAllByText("Never").length).toBeGreaterThan(0);
    expect(within(archive).getByText("No owner")).toBeInTheDocument();
    const bundles = screen.getByRole("link", { name: /^XGPON bundles\s*\(opens requirement work\)$/ });
    expect(bundles).toHaveAttribute("href", "/requirements/REQ-1/knowledge");
    expect(bundles.closest("tr")).toHaveClass("row--due");
    expect(screen.getByRole("link", { name: /^Old fibre/ }).closest("tr")).toHaveClass("row--past");
    // "Current" is the quiet default: it never takes the status weight, even on a due row.
    expect(within(bundles.closest("tr")!).getAllByText("Current")[0]).not.toHaveClass("status");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Requirement knowledge");
    expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("button", { name: /^Stopped indexing\s*,\s*1$/ })).toBeInTheDocument();
  });

  it("keeps its filters in the address and asks requirement work with them", async () => {
    const read = vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement()], next_offset: null });
    renderAt("/requirement-knowledge/requirements?state=failed&open=1", <CorpusRequirementsPage />);

    await screen.findByRole("link", { name: /^XGPON bundles/ });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ indexState: "failed", openFindingsOnly: true, notScreenedForDays: undefined }),
      0,
    );
    expect(screen.getByRole("button", { name: /Stopped indexing/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("checkbox", { name: "Not screened in 30 days" }));
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));

    expect(screen.getByTestId("address")).toHaveTextContent("/requirement-knowledge/requirements?open=1&stale=1");
    await waitFor(() =>
      expect(read).toHaveBeenLastCalledWith(
        expect.objectContaining({ indexState: undefined, openFindingsOnly: true, notScreenedForDays: 30 }),
        0,
      ),
    );
  });

  it("narrows to one owner from a row, and shows more on request", async () => {
    const read = vi.spyOn(api, "corpusRequirements")
      .mockResolvedValueOnce({ items: [requirement()], next_offset: 50 })
      .mockResolvedValue({ items: [requirement({ requirement_id: "REQ-51", title: "Zeta" })], next_offset: null });
    renderAt("/requirement-knowledge/requirements", <CorpusRequirementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("link", { name: /^Zeta/ })).toBeInTheDocument();
    expect(read).toHaveBeenLastCalledWith(expect.anything(), 50);

    fireEvent.click(screen.getAllByRole("link", { name: "Amina Owner: show only their requirements" })[0]!);
    expect(screen.getByTestId("address")).toHaveTextContent("?owner=fake-owner");
  });

  it("says requirement work did not answer, and offers to try again", async () => {
    vi.spyOn(api, "corpusRequirements").mockRejectedValue(new ApiError(503, "Requirement work is unavailable."));
    renderAt("/requirement-knowledge/requirements", <CorpusRequirementsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Requirement work did not answer: Requirement work is unavailable.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("CorpusFindingsPage", () => {
  it("shows each finding's rationale, both requirements and how long it has stood", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding()], next_offset: null });
    renderAt("/requirement-knowledge/findings?age=over_30_days", <CorpusFindingsPage />);

    const row = (await screen.findByText("Both order XGPON bundles through BCRM.")).closest("tr")!;
    expect(row).toHaveClass("row--delayed");
    expect(within(row).getByRole("rowheader")).toHaveTextContent("Possible duplicate");
    expect(within(row).getAllByText("Overdue")[0]).toHaveClass("status");
    expect(within(row).getByRole("link", { name: /^XGPON for offices\s*\(opens requirement work\)$/ })).toHaveAttribute("href", "/requirements/REQ-2/knowledge");
    expect(within(row).getByText("Not yet")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Over 30 days\s*,\s*2$/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks both owners by name and says so in the row", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding({ age: "under_7_days" })], next_offset: null });
    const nudge = vi.spyOn(api, "nudgeFinding").mockResolvedValue({
      finding_id: "kf-1", nudged_at: "2026-10-06T09:00:00Z", recipients: ["Amina Owner", "Ravi Reviewer"],
      next_nudge_at: "2026-10-13T09:00:00Z",
    });
    renderAt("/requirement-knowledge/findings", <CorpusFindingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ask Amina Owner and Ravi Reviewer" }));

    await waitFor(() => expect(nudge).toHaveBeenCalledWith("kf-1"));
    const row = screen.getByText("Both order XGPON bundles through BCRM.").closest("tr")!;
    expect(await within(row).findByText("Asked Amina Owner and Ravi Reviewer.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Asked Amina Owner and Ravi Reviewer.");
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
    renderAt("/requirement-knowledge/findings", <CorpusFindingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Ask the owners of all 2 overdue findings/ }));
    const confirm = screen.getByRole("group", { name: "Ask the owners of 2 overdue findings?" });
    expect(confirm).toHaveFocus();
    expect(within(confirm).getByText("Amina Owner, about 2 findings")).toBeInTheDocument();
    expect(within(confirm).getByText("Ravi Reviewer, about 1 finding")).toBeInTheDocument();
    expect(nudge).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Ask them" }));

    expect(await screen.findByText("Asked the owners of 2 overdue findings.")).toBeInTheDocument();
    expect(nudge.mock.calls.map((call) => call[0])).toEqual(["kf-1", "kf-2"]);
  });

  it("explains why a finding cannot be nudged yet, and keeps the button reachable", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({
      items: [finding({
        last_nudge: { at: "2026-10-04T09:00:00Z", by: "Ravi Reviewer" },
        next_nudge_at: "2026-10-11T09:00:00Z",
      })],
      next_offset: null,
    });
    const nudge = vi.spyOn(api, "nudgeFinding");
    renderAt("/requirement-knowledge/findings", <CorpusFindingsPage />);

    const button = await screen.findByRole("button", { name: "Ask Amina Owner and Ravi Reviewer" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(/again from 11 Oct 2026\.$/);
    expect(screen.getByText("by Ravi Reviewer")).toBeInTheDocument();
    fireEvent.click(button);
    expect(nudge).not.toHaveBeenCalled();
  });

  it("passes on requirement work's refusal", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding({ age: "under_7_days" })], next_offset: null });
    vi.spyOn(api, "nudgeFinding").mockRejectedValue(
      new ApiError(409, "This finding is no longer open: its owners have decided it."),
    );
    renderAt("/requirement-knowledge/findings", <CorpusFindingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ask Amina Owner and Ravi Reviewer" }));

    const row = screen.getByText("Both order XGPON bundles through BCRM.").closest("tr")!;
    expect(await within(row).findByText("Not sent: This finding is no longer open: its owners have decided it.")).toHaveClass(
      "knowledge__said--failed",
    );
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
    renderAt("/requirement-knowledge/findings", <CorpusFindingsPage />);

    expect(await screen.findByRole("button", { name: "Ask Amina Owner" })).not.toHaveAttribute("aria-disabled");
    const orphan = screen.getByText("Nobody owns these.").closest("tr")!;
    expect(within(orphan).getByRole("button", { name: "No owner to ask" })).toHaveAccessibleDescription(
      "Neither requirement has an owner to ask.",
    );
  });
});
