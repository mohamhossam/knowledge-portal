import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Release, Suggestion } from "../../api/client";
import { blockers, bulkAcceptable, changeSentence, lexicon, waitsFor } from "../suggestions";
import { NextStep } from "./NextStep";

const suggestion = (id: string, content: object, extra: object = {}) =>
  ({ id, status: "proposed", match: "new", basis: "stated", possible_matches: [], system_name: null, content: { name: "", text: "", ...content }, ...extra }) as unknown as Suggestion;

const draft = { systems: [], channels: [], landscape_domains: [], products: [] } as unknown as Release;

const constraint = (id: string, text: string) =>
  suggestion(id, { kind: "constraint", system_id: "business-pro-plus", text }, { match: "needs_system" });

describe("blockers", () => {
  it("finds the name waiting suggestions need that nothing adds, most waited-for first", () => {
    const suggestions = [
      constraint("a", "B.Pro+ bundles get only Fortinet 90G"),
      constraint("b", "No order amendment from the SMB App"),
      suggestion("c", { kind: "placement", system_id: "crm", landscape_domain_id: "engaged-party" }, { match: "needs_system" }),
      suggestion("crm", { kind: "system", system_id: "crm", name: "CRM" }),
    ];
    const found = blockers(draft, suggestions, lexicon(draft, suggestions));
    // The CRM placement waits for a suggestion on this page: not a dead end.
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "system", reference: "business-pro-plus", name: "Business Pro Plus", label: "the system Business Pro Plus" });
    expect(found[0]?.waiting.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("lets an offering rule wait for an offering suggested by another spelling of its name", () => {
    const suggestions = [
      suggestion("rule", { kind: "offering_rule", system_id: "business-pro-plus", text: "Up to 300 users" }, { match: "needs_offering" }),
      suggestion("offer", { kind: "product", system_id: "bpp", name: "Business Pro Plus", product: { id: "bpp", name: "Business Pro Plus", order_types: [], components: [] } }),
    ];
    const words = lexicon(draft, suggestions);
    expect(blockers(draft, suggestions, words)).toEqual([]);
    expect(bulkAcceptable(draft, suggestions).lifted.map((item) => item.id)).toEqual(["rule"]);
    expect(changeSentence(suggestions[0]!, words)).toBe("Adds the rule “Up to 300 users” to the offering Business Pro Plus");
    expect(waitsFor(suggestions[0]!, words)).toBe("Waits for the offering Business Pro Plus");
  });
});

describe("NextStep", () => {
  const props = {
    questions: 0, bulk: 0, bulkLabel: "Accept the ready ones", waiting: 12, focusTo: "/focus", changesTo: "/changes", busy: false, settling: false,
    onAcceptReady: vi.fn(), onShow: vi.fn(), onReject: vi.fn(),
  };

  it("turns a dead end into a decision on the spot", async () => {
    const suggestions = [constraint("a", "Fortinet only"), constraint("b", "No amendment")];
    const found = blockers(draft, suggestions, lexicon(draft, suggestions));
    const onSettle = vi.fn();
    render(<MemoryRouter><NextStep {...props} blockers={found} onSettle={onSettle} /></MemoryRouter>);

    expect(screen.getByText(/Nothing can move until you say what/)).toHaveTextContent("Nothing can move until you say what Business Pro Plus is.");
    expect(screen.getByText(/which neither the draft nor any suggestion adds/)).toHaveTextContent("2 suggestions wait for the system Business Pro Plus");
    await userEvent.click(screen.getByRole("button", { name: "It is a product offering" }));
    expect(onSettle).toHaveBeenCalledWith(found[0], "offering");
    await userEvent.click(screen.getByRole("button", { name: "Reject the 2…" }));
    expect(props.onReject).toHaveBeenCalledWith(found[0]);
  });

  it("says the questions come first, and the changes once nothing is left", () => {
    const { rerender } = render(<MemoryRouter><NextStep {...props} questions={3} bulk={2} blockers={[]} onSettle={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(/only you can decide/)).toHaveTextContent("Answer the 3 questions only you can decide, then accept the ready ones.");
    expect(screen.getByRole("link", { name: "Answer the 3 questions" })).toHaveAttribute("href", "/focus");

    rerender(<MemoryRouter><NextStep {...props} waiting={0} blockers={[]} onSettle={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "See the changes" })).toHaveAttribute("href", "/changes");
  });
});
