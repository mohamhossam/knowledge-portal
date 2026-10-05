import { describe, expect, it } from "vitest";

import type { Release, Suggestion } from "../api/client";
import {
  bulkAcceptable, changeSentence, inWords, lexicon, needsOneByOne, reading, suggestionGroups, suggestionState, tally, typedFile,
  waitsFor, warningInWords,
} from "./suggestions";

const release = {
  id: "d", revision: 3, status: "draft", documents: [], relationships: [],
  systems: [
    { id: "cwom", name: "CWOM", aliases: [], capabilities: [], components: [], constraints: [] },
    { id: "bcrm", name: "BCRM", aliases: [], capabilities: [], components: [], constraints: [] },
  ],
  landscape_domains: [{ id: "channels", name: "Channels" }],
} as unknown as Release;

let n = 0;
const suggestion = (content: Partial<Suggestion["content"]>, extra: Partial<Suggestion> = {}): Suggestion => ({
  id: `s${++n}`, document_version_id: "v1", citations: [{ location: "line 1", quote: "q" }], match: "new", status: "proposed",
  edited: false, model: "fake", prompt_version: "1", created_at: "", decided_by: null, decided_at: null, basis: "stated",
  rationale: null, possible_matches: [], system_name: null, target_system_name: null,
  content: { kind: "system", system_id: "x", name: "", aliases: [], triggers: [], text: "", ...content },
  ...extra,
}) as Suggestion;

const hub = suggestion({ kind: "system", system_id: "order-hub", name: "Order Hub" });
const api = suggestion({ kind: "component", system_id: "order-hub", component_id: "order-api", name: "Order API", technology: "Microservice" }, { match: "needs_system" });
const crm = suggestion({ kind: "system", system_id: "dynamics-crm", name: "Dynamics CRM" }, {
  possible_matches: [{ role: "system", written_as: "Dynamics CRM", system_id: "bcrm", system_name: "BCRM", reason: "Similar name to BCRM." }],
});
const inferred = suggestion(
  { kind: "relationship", system_id: "order-hub", target_system_id: "cwoms", relationship_kind: "transfers_data_to", text: "Sends work orders" },
  {
    basis: "inferred", match: "needs_system", rationale: "It says so in passing.",
    possible_matches: [{ role: "target", written_as: "CWOMS", system_id: "cwom", system_name: "CWOM", reason: "Similar name to CWOM." }],
  },
);
const fault = suggestion(
  { kind: "capability", system_id: "cwom", component_id: "ticket-engine", name: "Fault intake", triggers: ["raise fault"] },
  { match: "needs_component", system_name: "CWOM" },
);
const domain = suggestion({ kind: "landscape_domain", system_id: "partner", name: "Partner channels" });
const resellers = suggestion(
  { kind: "landscape_domain", system_id: "resellers", landscape_domain_id: "resellers", parent_domain_id: "partner", name: "Resellers" },
  { match: "needs_domain" },
);
const placement = suggestion({ kind: "placement", system_id: "cwom", landscape_domain_id: "channels" }, { match: "updates_existing", system_name: "CWOM" });
const accepted = suggestion({ kind: "constraint", system_id: "cwom", text: "Nights only" }, { status: "accepted", edited: true, system_name: "CWOM" });
const all = [hub, api, crm, inferred, fault, domain, placement, accepted];
const words = lexicon(release, all);

describe("suggestion state", () => {
  it("tells ready, waiting and needing a person apart, as accept-all does", () => {
    expect(suggestionState(hub)).toBe("ready");
    expect(suggestionState(api)).toBe("waits");
    expect(suggestionState(crm)).toBe("decide");
    expect(suggestionState(inferred)).toBe("decide");
    expect(needsOneByOne(placement)).toBe(true);
    expect(suggestionState(accepted)).toBe("accepted");
    expect(tally(all)).toMatchObject({ waiting: 7, ready: 2, decide: 3, waits: 2, accepted: 1, all: 8 });
  });

  it("says what each would change, and what a waiting one waits for, in the documents' names", () => {
    expect(changeSentence(api, words)).toBe("Adds the component Order API, built with Microservice");
    expect(changeSentence(inferred, words)).toBe("Sends data to CWOMS");
    expect(changeSentence(placement, words)).toBe("Places it in Channels");
    expect(waitsFor(api, words)).toBe("Waits for the system Order Hub");
    expect(waitsFor(fault, words)).toBe("Waits for the component Ticket Engine");
  });
});

describe("suggestionGroups", () => {
  it("gathers by system: new systems first, then the draft's, then domains", () => {
    const groups = suggestionGroups(release, all, words);
    expect(groups.map((group) => [group.label, group.isNew])).toEqual([
      ["Dynamics CRM", true], ["Order Hub", true], ["CWOM", false], ["Landscape domains", false],
    ]);
    // Inside a system, the system first, then what hangs on it.
    expect(groups[1]!.suggestions.map((item) => item.content.kind)).toEqual(["system", "component", "relationship"]);
    expect(groups[2]!.systemId).toBe("cwom");
  });
});

describe("bulkAcceptable", () => {
  it("counts the ready ones and the waits they lift, never one waiting on something nothing adds", () => {
    const { ready, lifted } = bulkAcceptable(release, [...all, resellers]);
    expect(ready.map((item) => item.content.name)).toEqual(["Order Hub", "Partner channels"]);
    // A sub-domain waits on its parent, not on itself.
    expect(lifted.map((item) => item.content.name)).toEqual(["Order API", "Resellers"]);
  });

  it("keeps a new system's group once it is accepted", () => {
    const before = suggestionGroups(release, [hub, api], words).map((group) => group.key);
    const after = suggestionGroups(
      { ...release, systems: [...release.systems, { id: "order-hub", name: "Order Hub", aliases: [], capabilities: [], components: [], constraints: [] }] } as Release,
      [{ ...hub, status: "accepted", system_name: "Order Hub" }, { ...api, system_name: "Order Hub", match: "new" }],
      words,
    );
    expect(after.map((group) => group.key)).toEqual(before);
    expect(after[0]).toMatchObject({ isNew: false, systemId: "order-hub" });
  });
});

describe("in words", () => {
  it("says the service's counted warnings as English", () => {
    expect(warningInWords("1 suggestion(s) already in the draft were left out.")).toBe("1 suggestion already in the draft was left out.");
    expect(warningInWords("7 table row(s) were read directly")).toBe("7 table rows were read directly");
  });

  it("names raw ids in dependency errors as the documents wrote them", () => {
    expect(inWords("Accept or add system 'order-hub' before items that belong to it.", words))
      .toBe("Accept or add the system Order Hub before items that belong to it.");
  });

  it("says how a document's reading stands", () => {
    expect(reading(undefined).label).toBe("Not read yet");
    expect(reading({ status: "running" } as never)).toMatchObject({ label: "Being read", busy: true });
    expect(reading({ status: "failed", error_category: "attempts_exhausted" } as never)).toMatchObject({
      label: "Reading failed: it stopped after three attempts", failed: true,
    });
  });

  it("types a loosely typed file by its extension", () => {
    expect(typedFile(new File(["x"], "notes.md", { type: "" })).type).toBe("text/markdown");
  });
});

describe("channel suggestions", () => {
  const web = suggestion(
    { kind: "channel", system_id: "business-web", name: "Business Web", channel: { id: "business-web", name: "Business Web", entry_system_id: "bcrm" } },
  );
  const till = suggestion(
    { kind: "channel", system_id: "shop", name: "Shop", channel: { id: "shop", name: "Shop", entry_system_id: "shop-till" } },
    { match: "needs_system" },
  );
  const office = suggestion(
    {
      kind: "product", system_id: "office", name: "Office Connect",
      product: {
        id: "office", name: "Office Connect", rules: [], components: [], values: [], audiences: [], nfrs: [],
        order_types: [{ code: "NEW", name: "New", enabled: true, channels: ["business-web", "Partner Feed"] }],
      },
    },
    { match: "needs_channel" },
  );
  const channelWords = lexicon(release, [web, till, office]);

  it("says what a channel adds and what it waits for, in the documents' names", () => {
    expect(changeSentence(web, channelWords)).toBe("Adds the channel Business Web, its orders entering through BCRM");
    expect(waitsFor(till, channelWords)).toBe("Waits for the system Shop Till");
    expect(waitsFor(office, channelWords)).toBe("Waits for the channels Business Web, Partner Feed");
    expect(inWords("Accept or add channel 'business-web' before the journey X that names them.", channelWords)).toBe(
      "Accept or add the channel Business Web before the journey X that names them.",
    );
  });

  it("sets channels in their own section, before offerings", () => {
    const labels = suggestionGroups(release, [office, web], channelWords).map((group) => group.label);
    expect(labels).toEqual(["Channels", "Offerings"]);
  });

  it("lifts an offering only once every channel it names is added", () => {
    expect(bulkAcceptable(release, [web, office]).lifted).toEqual([]);
    const named = suggestion(
      { ...office.content, product: { ...office.content.product!, order_types: [{ code: "NEW", name: "New", enabled: true, channels: ["business-web"] }] } },
      { match: "needs_channel" },
    );
    expect(bulkAcceptable(release, [web, named]).lifted).toEqual([named]);
  });
});
