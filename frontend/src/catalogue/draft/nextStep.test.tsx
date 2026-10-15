import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Release, Suggestion } from "../../api/client";
import { blockers, bulkAcceptable, changeSentence, lexicon, waitsFor } from "../suggestions";
import { NextStep } from "./NextStep";
import { decideChoices, decideQuestions } from "./questions";

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

  it("waits only for the systems the service says are missing, not for a name the draft answers to", () => {
    // The reported draft: OM-E2ESO was confirmed as ESESO, but matched by id alone it stayed waited for.
    const journey = (id: string, missing: string[]) =>
      suggestion(id, {
        kind: "journey",
        system_id: id,
        name: id,
        journey: { id, name: id, activities: [{ number: "1", name: "Configure", performing_system_id: "om-e2eso", supporting_system_ids: ["om-enrm"] }], flow_rules: [], integrations: [] },
      }, { match: "needs_system", missing_systems: missing });
    const suggestions = [journey("wf-1", ["om-enrm"]), journey("wf-2", ["om-enrm"])];
    const words = lexicon(draft, suggestions);

    const found = blockers(draft, suggestions, words);

    expect(found.map((item) => [item.reference, item.name, item.waiting.length])).toEqual([["om-enrm", "OM Enrm", 2]]);
    expect(waitsFor(suggestions[0]!, words)).toBe("Waits for the system OM Enrm");
  });

  it("says which system an inferred link is from when it is asked on its own", () => {
    const link = suggestion(
      "link",
      { kind: "relationship", system_id: "nps", target_system_id: "rtf", relationship_kind: "transfers_data_to", text: "Sends requests" },
      { basis: "inferred", match: "needs_system", missing_systems: ["rtf"], system_name: "NPS", rationale: "Channels submit requests to RTF." },
    );
    const words = lexicon(draft, [link]);

    const [question] = decideQuestions([link], words);
    const accept = decideChoices(question!).find((item) => item.value === "accept");

    expect(question!.prompt).toBe("Accept a link the reading inferred? NPS sends data to RTF");
    // The service refuses a link to a system the draft lacks: accepting adds it first, said so.
    expect(accept?.label).toBe("Accept the link, adding the system RTF");
    expect(accept?.consequence).toBe("Adds the system RTF first, then: NPS sends data to RTF.");
    expect(question!.first?.add).toEqual([{ id: "rtf", name: "RTF" }]);
  });

  it("accepts a system already suggested before the link that needs it, unless it is a question of its own", () => {
    const link = suggestion(
      "link",
      { kind: "relationship", system_id: "nps", target_system_id: "vcpe-do", relationship_kind: "transfers_data_to", text: "Sends requests" },
      { basis: "inferred", match: "needs_system", missing_systems: ["vcpe-do"], system_name: "NPS", rationale: "Implied." },
    );
    const system = suggestion("vcpe", { kind: "system", system_id: "vcpe-do", name: "vCPE DO", aliases: [] });
    const words = lexicon(draft, [link, system]);

    const [question] = decideQuestions([link, system], words);
    expect(question!.first).toEqual({ accept: [system], add: [] });
    expect(decideChoices(question!).find((item) => item.value === "accept")?.consequence).toBe("Adds the system vCPE DO first, then: NPS sends data to vCPE DO.");

    // Asked about itself, the system is answered there; the link waits for that answer.
    const asked = { ...system, possible_matches: [{ system_id: "vcpe", system_name: "vCPE", role: "system", written_as: "vCPE DO", reason: null }] } as unknown as Suggestion;
    const linkQuestion = decideQuestions([link, asked], lexicon(draft, [link, asked])).find((item) => item.id === "link");
    expect(linkQuestion!.first).toBeUndefined();
    expect(linkQuestion!.waits).toBe("Waits for the system vCPE DO");
  });

  it("says an offering waits for nothing once its systems are added first, unless it also names a channel the draft lacks", () => {
    const offering = (orderTypes: object[]) =>
      suggestion(
        "offer",
        { kind: "product", system_id: "bpp", name: "Business Pro Plus", product: { id: "bpp", name: "Business Pro Plus", order_types: orderTypes, components: [{ name: "Router", responsibilities: [{ system_id: "rtf" }] }] } },
        // Inferred, so it is asked on its own.
        { basis: "inferred", match: "needs_system", missing_systems: ["rtf"] },
      );

    const onlySystems = offering([]);
    const [settled] = decideQuestions([onlySystems], lexicon(draft, [onlySystems]));
    expect(settled!.first?.add).toEqual([{ id: "rtf", name: "RTF" }]);
    expect(settled!.waits).toBeUndefined();

    const withChannel = offering([{ id: "new", name: "New connection", channels: ["b2b-web"] }]);
    const [waiting] = decideQuestions([withChannel], lexicon(draft, [withChannel]));
    expect(waiting!.first?.add).toEqual([{ id: "rtf", name: "RTF" }]);
    expect(waiting!.waits).toBeDefined();
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
