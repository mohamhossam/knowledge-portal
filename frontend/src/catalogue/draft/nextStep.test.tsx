import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Release, Suggestion } from "../../api/client";
import { blockers, bulkAcceptable, changeSentence, lexicon, waitsFor } from "../suggestions";
import { settleRequest } from "./MissingThings";
import { NextStep } from "./NextStep";
import { decideChoices, decideQuestions } from "./questions";
import { checkAxeAfterEach } from "../../test/axe";

checkAxeAfterEach();

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
  const choices = {
    systems: [{ id: "bpp-gw", name: "Business Pro Plus Gateway", aliases: [] }, { id: "bcrm", name: "BCRM", aliases: ["Sales CRM"] }],
    specifications: [{ id: "cfs-cfss-uplink-ucpe", name: "CFSS_UPLINK_UCPE", aliases: [], layer: "cfs" as const }],
    channels: [{ id: "b2b-web", name: "Business Web" }],
    offerings: [{ id: "business-pro-plus", name: "Business Pro Plus", code: null, order_types: [{ code: "CESSATION", name: "Cessation" }] }],
  };
  const props = {
    questions: 0, bulk: 0, bulkLabel: "Accept the ready ones", waiting: 12, accepted: 0, focusTo: "/focus", changesTo: "/changes", busy: false, settling: false,
    choices, onAcceptReady: vi.fn(), onShow: vi.fn(), onReject: vi.fn(),
  };
  const open = async (found: ReturnType<typeof blockers>, onAnswer = vi.fn()) => {
    render(<MemoryRouter><NextStep {...props} waiting={2} blockers={found} onAnswer={onAnswer} /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: /^See the \d+ missing thing/ }));
    return onAnswer;
  };
  const withDraft = { ...draft, products: choices.offerings, channels: choices.channels } as unknown as Release;

  it("says the way on when only dead ends are left, and settles one on the spot", async () => {
    const suggestions = [constraint("a", "Fortinet only"), constraint("b", "No amendment")];
    const found = blockers(draft, suggestions, lexicon(draft, suggestions));
    const onAnswer = vi.fn();
    render(<MemoryRouter><NextStep {...props} waiting={2} accepted={646} blockers={found} onAnswer={onAnswer} /></MemoryRouter>);

    expect(screen.getByText(/no document describes\./)).toHaveTextContent("646 accepted. The 2 suggestions left wait on 1 thing no document describes.");
    expect(screen.getByText(/publishing leaves them out/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go on to the changes" })).toHaveAttribute("href", "/changes");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "See the 1 missing thing" }));
    const row = screen.getByRole("row", { name: /Business Pro Plus/ });
    expect(row).toHaveTextContent("Named as a system; no document describes it");
    expect(row).toHaveTextContent("2");
    await userEvent.click(screen.getByRole("button", { name: "An offering" }));
    expect(onAnswer).toHaveBeenCalledWith(found[0], { kind: "offering" });
    await userEvent.click(screen.getByRole("button", { name: "Reject what waits on Business Pro Plus…" }));
    expect(props.onReject).toHaveBeenCalledWith(found[0]);
  });

  it("says a missing name is a system the draft has, offering the likely one first", async () => {
    const suggestions = [constraint("a", "Fortinet only"), constraint("b", "No amendment")];
    const found = blockers(draft, suggestions, lexicon(draft, suggestions));
    const onAnswer = await open(found);

    await userEvent.click(screen.getByRole("button", { name: "A system the draft has…" }));
    expect(screen.getByRole("button", { name: "Use it" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("combobox", { name: /Which system of the draft is Business Pro Plus/ }));
    const [first] = screen.getAllByRole("option");
    expect(first).toHaveTextContent("Business Pro Plus Gateway");
    await userEvent.click(first!);
    await userEvent.click(screen.getByRole("button", { name: "Make Business Pro Plus a name for Business Pro Plus Gateway" }));

    expect(onAnswer).toHaveBeenCalledWith(found[0], { kind: "existing", id: "bpp-gw", name: "Business Pro Plus Gateway" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("says a name read as an offering is the CFSS in the draft, never offering to add it as an offering", async () => {
    const rule = (id: string, text: string) =>
      suggestion(id, { kind: "offering_rule", system_id: "cfss-uplink-ucpe", text }, { match: "needs_offering" });
    const suggestions = [rule("a", "One Service Order holds one to two Uplink uCPE Services."), rule("b", "It refers to a Place.")];
    const found = blockers(draft, suggestions, lexicon(draft, suggestions));
    const onAnswer = await open(found);

    expect(screen.getByRole("row", { name: /Cfss Uplink Ucpe/i })).toHaveTextContent("Read as an offering, but it is the CFSS CFSS_UPLINK_UCPE in your draft.");
    expect(screen.queryByRole("button", { name: "Suggest the offering" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "It is the CFSS CFSS_UPLINK_UCPE in the draft: move its rules there" }));
    expect(onAnswer).toHaveBeenCalledWith(found[0], { kind: "specification", id: "cfs-cfss-uplink-ucpe", name: "CFSS_UPLINK_UCPE", layer: "cfs" });
  });

  it("adds a missing order type to its offering, or says it is one the offering has", async () => {
    const journey = suggestion("j", {
      kind: "journey", system_id: "wf-1", name: "Modify the password",
      journey: { id: "wf-1", name: "Modify the password", product_id: "Business Pro Plus", order_type_code: "Modify Password", activities: [], flow_rules: [], integrations: [] },
    }, { match: "needs_offering" });
    const found = blockers(withDraft, [journey], lexicon(withDraft, [journey]));
    const onAnswer = await open(found);

    expect(screen.getByRole("row", { name: /Modify Password/ })).toHaveTextContent("Its journey is for an order type Business Pro Plus doesn't list.");
    await userEvent.click(screen.getByRole("button", { name: "Add it to Business Pro Plus" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "order_type" });

    await userEvent.click(screen.getByRole("button", { name: "One Business Pro Plus has…" }));
    await userEvent.click(screen.getByRole("combobox", { name: /Which order type of Business Pro Plus is Modify Password/ }));
    await userEvent.click(screen.getByRole("option", { name: /Cessation/ }));
    await userEvent.click(screen.getByRole("button", { name: "Use Cessation" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "existing_order_type", id: "CESSATION", name: "Cessation" });
  });

  it("suggests a missing channel, or says it is one the draft has", async () => {
    const journey = suggestion("j", {
      kind: "journey", system_id: "wf-2", name: "Order on the portal",
      journey: { id: "wf-2", name: "Order on the portal", product_id: "Business Pro Plus", order_type_code: "Cessation", activities: [{ number: "10", name: "Order", channels: ["b2b portal"] }], flow_rules: [], integrations: [] },
    }, { match: "needs_channel" });
    const found = blockers(withDraft, [journey], lexicon(withDraft, [journey]));
    const onAnswer = await open(found);

    expect(screen.getByRole("row", { name: /b2b portal/i })).toHaveTextContent("Named as a sales channel the draft doesn't have.");
    await userEvent.click(screen.getByRole("button", { name: "Suggest the channel" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "channel" });
    await userEvent.click(screen.getByRole("button", { name: "A channel the draft has…" }));
    await userEvent.click(screen.getByRole("combobox", { name: /Which channel of the draft is b2b portal/i }));
    await userEvent.click(screen.getByRole("option", { name: /Business Web/ }));
    await userEvent.click(screen.getByRole("button", { name: "Use Business Web" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "existing_channel", id: "b2b-web", name: "Business Web" });
  });

  it("suggests the CFSS or RFSS rules wait for, or moves them to one the draft has", async () => {
    const rule = suggestion("r", { kind: "specification_rule", system_id: "place", text: "It refers to a Place." }, { match: "needs_realisation" });
    const found = blockers(draft, [rule], lexicon(draft, [rule]));
    const onAnswer = await open(found);

    expect(screen.getByRole("row", { name: /place/ })).toHaveTextContent("Rules are said of it, but no CFSS or RFSS by this name is in the draft.");
    await userEvent.click(screen.getByRole("button", { name: "Suggest as an RFSS" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "new_specification", layer: "rfs" });
    await userEvent.click(screen.getByRole("button", { name: "One the draft has…" }));
    await userEvent.click(screen.getByRole("combobox", { name: /Which CFSS or RFSS of the draft is place/ }));
    await userEvent.click(screen.getByRole("option", { name: /CFSS_UPLINK_UCPE/ }));
    await userEvent.click(screen.getByRole("button", { name: "Move the rules to CFSS_UPLINK_UCPE" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "specification", id: "cfs-cfss-uplink-ucpe", name: "CFSS_UPLINK_UCPE", layer: "cfs" });
  });

  it("accepts a record without a link that is upside down", async () => {
    const withCfs = { ...draft, realisations: [{ id: "cfs-ddos", layer: "cfs", name: "DDoS uCPE CFS", aliases: [] }] } as unknown as Release;
    const rfs = suggestion("rfs", {
      kind: "realisation_record", system_id: "rfs-ddos-tp", name: "DDoS uCPE TP",
      realisation: { id: "rfs-ddos-tp", layer: "rfs", name: "DDoS uCPE TP", aliases: [], system_ids: [], realised_by: ["DDoS uCPE CFS"], accepted: [], rules: [] },
    }, { match: "needs_realisation" });
    const found = blockers(withCfs, [rfs], lexicon(withCfs, [rfs]));
    const onAnswer = await open(found);

    await userEvent.click(screen.getByRole("button", { name: "Accept without that link" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "without_link" });
  });

  it("adds a missing component to its system, or accepts what waits on the system without it", async () => {
    // The reported draft: capabilities "in Gpon Connectivity" for two systems, neither of which
    // has that component. Each system's is its own row, and Reject was the only answer.
    const capability = (id: string, systemId: string, systemName: string) =>
      suggestion(id, { kind: "capability", system_id: systemId, component_id: "gpon-connectivity", name: "Fixed service activation" }, { match: "needs_component", system_name: systemName });
    const suggestions = [capability("a", "e2eso", "E2ESO"), capability("b", "wfm", "WFM")];
    const found = blockers(draft, suggestions, lexicon(draft, suggestions));
    expect(found.map((item) => item.label)).toEqual(["the component Gpon Connectivity of E2ESO", "the component Gpon Connectivity of WFM"]);
    const onAnswer = await open(found.slice(0, 1));

    expect(screen.getByRole("row", { name: /Gpon Connectivity/ })).toHaveTextContent("Named as a component of E2ESO; E2ESO has no component by this name, and no suggestion adds one.");
    expect(screen.getByRole("row", { name: /Gpon Connectivity/ })).toHaveTextContent("Component");
    await userEvent.click(screen.getByRole("button", { name: "Add it to E2ESO" }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "component" });
    await userEvent.click(screen.getByRole("button", { name: /Accept what waits on Gpon Connectivity on E2ESO itself/ }));
    expect(onAnswer).toHaveBeenLastCalledWith(found[0], { kind: "without_component" });
  });

  it("says beside the missing things what settling one did, or why the service refused it", () => {
    const suggestions = [constraint("a", "Fortinet only")];
    const found = blockers(draft, suggestions, lexicon(draft, suggestions));
    render(
      <MemoryRouter>
        <NextStep {...props} waiting={1} blockers={found} onAnswer={vi.fn()} settled={{ text: "The draft already has the system Eseso.", failed: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("The draft already has the system Eseso.");
  });

  it("says the questions come first, and the changes once nothing is left", () => {
    const { rerender } = render(<MemoryRouter><NextStep {...props} questions={3} bulk={2} blockers={[]} onAnswer={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText(/only you can decide/)).toHaveTextContent("Answer the 3 questions only you can decide, then accept the ready ones.");
    expect(screen.getByRole("link", { name: "Answer the 3 questions" })).toHaveAttribute("href", "/focus");

    rerender(<MemoryRouter><NextStep {...props} waiting={0} blockers={[]} onAnswer={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "See the changes" })).toHaveAttribute("href", "/changes");
  });
});

describe("settleRequest", () => {
  const blocker = (key: string, reference: string, name: string) =>
    ({ key, kind: "other" as const, reference, name, label: name, waiting: [] });

  it("names an order type apart from its offering, and each chosen one by its own field", () => {
    const missing = blocker("ordertype:businessproplus/modifypassword", "Business Pro Plus", "Business Pro Plus › Modify Password");
    expect(settleRequest(missing, { kind: "order_type" })).toEqual({ system_id: "Business Pro Plus", name: "Modify Password", kind: "order_type" });
    expect(settleRequest(missing, { kind: "existing_order_type", id: "CESSATION", name: "Cessation" })).toEqual({
      system_id: "Business Pro Plus", name: "Modify Password", kind: "existing_order_type", existing_id: "CESSATION",
    });
    const channel = blocker("channel:b2bportal", "b2b portal", "b2b portal");
    expect(settleRequest(channel, { kind: "existing_channel", id: "b2b-web", name: "Business Web" })).toEqual({
      system_id: "b2b portal", name: "b2b portal", kind: "existing_channel", existing_id: "b2b-web",
    });
    const place = blocker("specification:place", "place", "place");
    expect(settleRequest(place, { kind: "new_specification", layer: "rfs" })).toEqual({ system_id: "place", name: "place", kind: "new_specification", layer: "rfs" });
    expect(settleRequest(place, { kind: "specification", id: "rfs-place", name: "PLACE", layer: "rfs" })).toEqual({
      system_id: "place", name: "place", kind: "specification", specification_id: "rfs-place",
    });
  });
});
