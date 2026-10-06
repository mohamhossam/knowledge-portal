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

    const archive = (await screen.findByRole("link", { name: "Archive" })).closest("tr")!;
    expect(archive).toHaveClass("row--delayed");
    expect(within(archive).getByText("Stopped indexing")).toBeInTheDocument();
    expect(within(archive).getByText("Never")).toBeInTheDocument();
    expect(within(archive).getByText("No owner")).toBeInTheDocument();
    const bundles = screen.getByRole("link", { name: "XGPON bundles" });
    expect(bundles).toHaveAttribute("href", "/requirements/REQ-1/knowledge");
    expect(bundles.closest("tr")).toHaveClass("row--due");
    expect(screen.getByRole("link", { name: "Old fibre" }).closest("tr")).toHaveClass("row--past");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Requirement knowledge");
    expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("button", { name: /Stopped indexing\s*1/ })).toBeInTheDocument();
  });

  it("keeps its filters in the address and asks requirement work with them", async () => {
    const read = vi.spyOn(api, "corpusRequirements").mockResolvedValue({ items: [requirement()], next_offset: null });
    renderAt("/requirement-knowledge/requirements?state=failed&open=1", <CorpusRequirementsPage />);

    await screen.findByRole("link", { name: "XGPON bundles" });
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
    expect(await screen.findByRole("link", { name: "Zeta" })).toBeInTheDocument();
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
    expect(within(row).getByText("Overdue")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "XGPON for offices" })).toHaveAttribute("href", "/requirements/REQ-2/knowledge");
    expect(within(row).getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Over 30 days\s*2/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("nudges both owners and says who was asked", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding()], next_offset: null });
    const nudge = vi.spyOn(api, "nudgeFinding").mockResolvedValue({
      finding_id: "kf-1", nudged_at: "2026-10-06T09:00:00Z", recipients: ["Amina Owner", "Ravi Reviewer"],
      next_nudge_at: "2026-10-13T09:00:00Z",
    });
    renderAt("/requirement-knowledge/findings", <CorpusFindingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Nudge both owners" }));

    await waitFor(() => expect(nudge).toHaveBeenCalledWith("kf-1"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Asked Amina Owner and Ravi Reviewer to decide the possible duplicate between ‘XGPON for offices’ and ‘XGPON bundles’. It can be nudged again from 13 Oct 2026.",
    );
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

    const button = await screen.findByRole("button", { name: "Nudge both owners" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(/again from 11 Oct 2026\.$/);
    expect(screen.getByText("by Ravi Reviewer")).toBeInTheDocument();
    fireEvent.click(button);
    expect(nudge).not.toHaveBeenCalled();
  });

  it("passes on requirement work's refusal", async () => {
    vi.spyOn(api, "corpusFindings").mockResolvedValue({ items: [finding()], next_offset: null });
    vi.spyOn(api, "nudgeFinding").mockRejectedValue(
      new ApiError(409, "This finding is no longer open: its owners have decided it."),
    );
    renderAt("/requirement-knowledge/findings", <CorpusFindingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Nudge both owners" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Not sent: This finding is no longer open: its owners have decided it.",
    );
  });

  it("asks one owner when only one requirement has an owner, and none when neither has", async () => {
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

    expect(await screen.findByRole("button", { name: "Nudge the owner" })).not.toHaveAttribute("aria-disabled");
    const orphan = screen.getByText("Nobody owns these.").closest("tr")!;
    expect(within(orphan).getByRole("button", { name: "Nudge both owners" })).toHaveAccessibleDescription(
      "Neither requirement has an owner to ask.",
    );
  });
});
