import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { catalogue } from "./catalogue";
import { sourceUses } from "./drafting";
import { conflictsFor, namedSource, questionProblem, SourcesContext, withLevel } from "./governance";
import { GovernancePage } from "./GovernancePage";
import { OfferingPage } from "./OfferingsPage";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const RELEASE = { ...EXPLORED, revision: 3, status: "draft", documents: [] } as unknown as Release;
const SOURCES = RELEASE.sources ?? [];
const OFFERING = RELEASE.products![0]!;

function open(path: string, editable = true) {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: !editable, editable, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <SourcesContext.Provider value={SOURCES}>
          <Routes>
            <Route path="architecture" element={<Outlet context={context} />}>
              <Route path="governance" element={<GovernancePage />} />
              <Route path="offerings/:offeringId" element={<OfferingPage />} />
            </Route>
          </Routes>
        </SourcesContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("source levels on facts", () => {
  it("finds the registered source a fact's source text begins with, the longest name first", () => {
    expect(namedSource("BPP SDD §11.1.3", SOURCES)?.id).toBe("SDD");
    expect(namedSource("SDDX §1", SOURCES)).toBeNull();
    expect(withLevel("BPP SDD §10", SOURCES)).toBe("BPP SDD (L2) §10");
    expect(withLevel("v8.2 OrderEvaluate", SOURCES)).toBe("v8.2 (L3, not supplied) OrderEvaluate");
    expect(withLevel("SDD", SOURCES)).toBe("SDD (L2)");
    expect(withLevel("An email", SOURCES)).toBe("An email");
  });

  it("reads the conflicts of an offering and of one of its order types", () => {
    const conflicts = RELEASE.conflicts ?? [];
    expect(conflictsFor(conflicts, "bpp").map((item) => item.id)).toEqual(["CF-01", "CF-02"]);
    expect(conflictsFor(conflicts, "bpp", "CEASE").map((item) => item.id)).toEqual(["CF-02"]);
  });
});

describe("GovernancePage", () => {
  it("lists the sources by level, the unsupplied one as due, and each conflict with what it affects", () => {
    open("/architecture/governance", false);

    const sources = within(screen.getByRole("table", { name: "Sources, by level" })).getAllByRole("row").slice(1);
    expect(sources.map((row) => row.querySelector("th")!.firstChild!.textContent)).toEqual([
      "SMB Value Stream — Architecture Reference",
      "Business Pro Plus Solution Design",
      "Explorer v8.2",
    ]);
    expect(sources[2]).toHaveClass("row--due");
    expect(sources[2]).toHaveTextContent("Not supplied: carried forward unread");
    expect(sources[2]).toHaveTextContent("Cannot tell: Workflow images are not machine-readable.");

    const conflicts = within(screen.getByRole("table", { name: "Conflicts between sources" })).getAllByRole("row").slice(1);
    expect(conflicts[0]).toHaveTextContent("CF-01 Up / Downgrade channel scope");
    expect(conflicts[0]).toHaveTextContent("BPP SDD (L2) §11.1.3");
    expect(conflicts[0]).toHaveTextContent("Affects Business Pro Plus: New Activation, raises OQ-01");
    expect(conflicts[1]).toHaveTextContent("Business Pro Plus, every order type");
    expect(screen.queryByRole("button", { name: "Edit the sources" })).not.toBeInTheDocument();

    const history = within(screen.getByRole("table", { name: "Change requests applied to this version" })).getAllByRole("row").slice(1);
    expect(history[0]).toHaveTextContent("CR-20261003-Business_Pro_Plus");
    expect(history[0]).toHaveTextContent("From Requirement AI");
    expect(history[0]).not.toHaveTextContent("asked by");
    expect(history[0]).toHaveTextContent("REQ-2026-0412, revision 3, approved by Layla Haddad on 3 Oct 2026");
    expect(history[0]).toHaveTextContent("4 Oct 2026to Business Pro Plus");
    expect(history[0]).toHaveTextContent("FT-1 Asks of Business Pro Plus: Offer Microsoft 365");
  });

  it("will not drop a source an offering or a conflict still names", () => {
    open("/architecture/governance");
    fireEvent.click(screen.getByRole("button", { name: "Edit the sources" }));
    const panel = screen.getByRole("form", { name: "Edit the sources" });
    expect(within(panel).getByRole("heading", { name: "Edit the sources" })).toHaveFocus();

    fireEvent.click(within(panel).getByRole("button", { name: /Remove source SMB Ref/ }));

    expect(within(panel).getByText(/Still named: SMB Ref \(the offering Business Pro Plus\), SMB Ref \(the conflict Commitment model\)/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Save the sources" })).toBeDisabled();
    expect(sourceUses(RELEASE, "CANON")).toEqual(["the offering Business Pro Plus", "the conflict Commitment model"]);
  });

  it("adds a conflict once both sides say who says what, with an id made for it", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    open("/architecture/governance");
    fireEvent.click(screen.getByRole("button", { name: "Edit the conflicts" }));
    const panel = screen.getByRole("form", { name: "Edit the conflicts between sources" });
    fireEvent.click(within(panel).getByRole("button", { name: /^Add (a|another) conflict$/ }));
    const row = within(panel).getByRole("group", { name: "Conflict 3" });
    fireEvent.change(within(row).getByLabelText(/^Title/), { target: { value: "FortiAP threshold" } });
    expect(within(panel).getByText("Each side of a conflict needs its source and what it says.")).toBeInTheDocument();

    const [first, second] = within(row).getAllByRole("group", { name: /says$/ });
    fireEvent.change(within(first!).getByLabelText("Source"), { target: { value: "SDD" } });
    fireEvent.change(within(first!).getByLabelText(/^What it says/), { target: { value: "300 Mbps." } });
    fireEvent.change(within(second!).getByLabelText("Source"), { target: { value: "V82" } });
    fireEvent.change(within(second!).getByLabelText(/^What it says/), { target: { value: "500 Mbps." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save the conflicts" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const sent = save.mock.calls[0]![1].conflicts!;
    expect(sent.map((item) => item.id)).toEqual(["CF-01", "CF-02", "CF"]);
    expect(sent[2]!.b).toEqual({ source_id: "V82", statement: "500 Mbps." });
  });
});

describe("an offering's governance", () => {
  it("shows the decisions it needs, its open questions with the conflict that raises one, and its sources", () => {
    open(`/architecture/offerings/${OFFERING.id}`, false);

    const needed = within(screen.getByRole("heading", { name: /^Decisions needed/ }).closest("section")!);
    expect(needed.getAllByRole("row")).toHaveLength(3);
    expect(needed.getByText(/Raises the question/)).toHaveTextContent("Raises the question OQ-01");
    // A question a conflict raises is said with it; the rest stand alone.
    const questions = within(screen.getByRole("heading", { name: /^Open questions/ }).closest("section")!);
    expect(questions.getByText("1 more is raised by the decisions needed, and named with them.")).toBeInTheDocument();
    expect(questions.getAllByRole("listitem").map((item) => item.querySelector(".governance__id")!.textContent)).toEqual(["OQ-02"]);
    expect(questions.getAllByRole("listitem")[0]).toHaveTextContent("Asked for New Activation");
    const decisions = within(screen.getByRole("heading", { name: /^Architecture decisions/ }).closest("section")!);
    expect(decisions.getByText("BPP SDD (L2) §11.2")).toBeInTheDocument();
    const sources = within(screen.getByRole("heading", { name: "Sources and boundaries" }).closest("section")!);
    expect(sources.getAllByRole("listitem")[0]).toHaveTextContent("Business Pro Plus Solution Design · its primary source");
    expect(sources.getByText("No longer uses: Siebel CRM")).toBeInTheDocument();
  });

  it("will not drop a question a conflict still raises", () => {
    open(`/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the open questions" }));
    const panel = screen.getByRole("form", { name: "Edit the open questions of Business Pro Plus" });

    fireEvent.click(within(panel).getByRole("button", { name: /Remove question OQ-01/ }));

    expect(within(panel).getByText("The conflict Up / Downgrade channel scope raises the question OQ-01; change the conflict first.")).toBeInTheDocument();
    expect(questionProblem({ ...OFFERING, questions: [] }, RELEASE.conflicts ?? [])).toMatch(/raises the question OQ-01/);
  });

  it("chooses its sources from the register, its primary one among them", () => {
    open(`/architecture/offerings/${OFFERING.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Edit the sources and boundaries" }));
    const panel = screen.getByRole("form", { name: "Edit the sources and boundaries of Business Pro Plus" });

    fireEvent.click(within(panel).getByRole("checkbox", { name: "BPP SDD (L2)" }));

    // Unticking the primary source leaves none named.
    expect((within(panel).getByLabelText("Its primary source") as HTMLSelectElement).value).toBe("");
    expect(within(panel).getByRole("checkbox", { name: "v8.2 (L3)" })).not.toBeChecked();
  });
});
