import { describe, expect, it } from "vitest";

import type { Release, Suggestion } from "../api/client";
import { formatClock } from "../home/format";
import { decideChoices, decideQuestions } from "./draft/questions";
import {
  bulkAcceptable, changeSentence, decideWhy, dependencyEdges, inWords, lexicon, needsOneByOne, reading, suggestionGroups, suggestionState, tally,
  typedFile, offeringHolds, waitsFor, waitsForMany, warningInWords,
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

  it("keeps an offering and journey drafted for a requirement to be decided alone, once it can be", () => {
    const cited = { change_request: { change_request_id: "CR-1", feature_id: "FT-1" } } as Partial<Suggestion>;
    const offering = suggestion({ kind: "product", system_id: "cloud-voice", name: "Cloud Voice" }, cited);
    const journey = suggestion({ kind: "journey", system_id: "cloud-voice-new", name: "New activation" }, { ...cited, match: "needs_offering" });
    const question = suggestion({ kind: "question", system_id: "cloud-voice" }, cited);

    expect(suggestionState(offering)).toBe("decide");
    expect(decideWhy(offering)).toBe("Drafted for a new offering: review what it holds");
    expect(suggestionState(journey)).toBe("waits");
    expect(suggestionState(question)).toBe("ready");
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

  describe("a reading under way", () => {
    const started = "2026-10-12T06:00:00Z";
    const at = (minutes: number) => Date.parse(started) + minutes * 60_000;
    const running = (values: object) =>
      ({ status: "running", attempts: 1, started_at: started, lease_until: new Date(at(30)).toISOString(), ...values }) as never;

    it("names the part it is on, when it started and roughly how long is left", () => {
      const state = reading(running({ stage: "reading", progress_done: 3, progress_total: 12 }), at(6));
      expect(state).toMatchObject({ label: "Reading part 4 of 12", busy: true, stalled: false, part: { done: 3, total: 12 } });
      expect(state.details).toEqual([`Started ${formatClock(started)}, 6 min 0 s so far; about 18 min left.`]);
    });

    it("says each stage before and after the parts", () => {
      expect(reading(running({ stage: "opening" }), at(0)).label).toBe("Opening the file");
      expect(reading(running({ stage: "matching" }), at(9)).label).toBe("Matching names to the catalogue");
      expect(reading(running({ stage: "saving" }), at(9)).label).toBe("Saving its suggestions");
      expect(reading(running({ stage: "reading", progress_done: 0, progress_total: 5 }), at(1)).details[0]).not.toMatch(/left/);
    });

    it("says when an attempt is a repeat", () => {
      expect(reading(running({ attempts: 2 }), at(1)).details).toContain("Attempt 2 of 3: the last one stopped before it finished.");
    });

    it("says the reader stopped responding once its lease lapsed", () => {
      const state = reading(running({ attempts: 1, lease_until: new Date(at(10)).toISOString() }), at(12));
      expect(state).toMatchObject({ label: "Stopped responding", busy: true, stalled: true });
      expect(state.details[0]).toBe(`No word from the reader since ${formatClock(new Date(at(5)))} (7 min 0 s ago).`);
      expect(state.details[1]).toMatch(/again by itself, as attempt 2 of 3/);
      expect(reading(running({ attempts: 3, lease_until: new Date(at(10)).toISOString() }), at(12)).details[1]).toMatch(/last of 3 attempts/);
    });

    it("says how long a document has waited for the reader", () => {
      const state = reading({ status: "queued", attempts: 0, queued_at: started } as never, at(2));
      expect(state).toMatchObject({ label: "Waiting to be read", busy: true, stalled: false });
      expect(state.details[0]).toBe(`Waiting since ${formatClock(started)} (2 min 0 s).`);
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
        id: "office", name: "Office Connect", rules: [], components: [], values: [], audiences: [], nfrs: [], lifecycle_notes: [],
        sources: [], questions: [], decisions: [], boundaries: [], not_used: [], plans: [], business_rules: [],
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

  it("lifts an offering naming a channel as the document writes it, once that channel is added", () => {
    const written = suggestion(
      { ...office.content, product: { ...office.content.product!, order_types: [{ code: "NEW", name: "New", enabled: true, channels: ["business WEB"] }] } },
      { match: "needs_channel" },
    );
    expect(bulkAcceptable(release, [web, written]).lifted).toEqual([written]);
  });
});

describe("offering detail suggestions", () => {
  const detailed = (match: Suggestion["match"], tracking = true) =>
    suggestion(
      {
        kind: "product", system_id: "office", name: "Office Connect",
        product: {
          id: "office", name: "Office Connect", rules: [], values: [], audiences: [],
          sources: [], questions: [], decisions: [], boundaries: [], not_used: [], plans: [], business_rules: [],
          order_types: [{ code: "NEW", name: "New", enabled: true, channels: [] }],
          components: [{ id: "fibre", name: "Fibre", responsibilities: [], realisation: [{ layer: "cfs", name: "Fibre CFS" }], capability_ids: [] }],
          nfrs: [{ quality: "Availability", coverage: "defined" }, { quality: "Security", coverage: "missing" }],
          tracking: tracking
            ? {
                order_types: [], flows: [{ from_system_id: "cwom", to_system_id: "Order Store", label: "Events" }],
                channels: [{ channel_id: "Business Web", ui_system_id: "Order Portal" }], milestones: [], statuses: [], fallout: [],
              }
            : null,
          lifecycle_notes: [{ id: "renewal", title: "Renewal", order_types: [], channels: ["Shop"], blocks: [] }],
        },
      },
      { match },
    );

  it("says what an offering holds beyond its parts, whether it adds or replaces one", () => {
    const words = lexicon(release, []);
    expect(changeSentence(detailed("new"), words)).toBe(
      "Adds the offering Office Connect, with realisation for 1 part, 2 NFRs, order tracking and 1 lifecycle note",
    );
    expect(changeSentence(detailed("updates_existing", false), words)).toBe(
      "Replaces the offering Office Connect with the document's version, which includes realisation for 1 part, 2 NFRs and 1 lifecycle note",
    );
  });

  it("names the systems and channels it waits for, and what it holds", () => {
    const store = suggestion({ kind: "system", system_id: "Order Store", name: "Order Store" });
    const words = lexicon(release, [store]);
    const waiting = detailed("needs_system");
    expect(waitsFor(waiting, words)).toBe("Waits for the systems Order Store, Order Portal, and the channels Business Web, Shop");
    expect(waitsForMany(waiting, words)).toBe(true);
    expect(offeringHolds(waiting.content.product, words)).toEqual([
      { label: "Realised as", text: "Fibre (CFS)" },
      { label: "NFRs", text: "Availability (defined); Security (not defined)" },
      { label: "Order tracking", text: "Channels Business Web; 1 flow" },
      { label: "Lifecycle notes", text: "Renewal" },
    ]);
  });

  it("lists the plans a reading found, each with its stated facts", () => {
    const words = lexicon(release, []);
    const product = detailed("new").content.product!;
    const planned = {
      ...product,
      plans: [
        { name: "PO1", characteristics: [{ name: "Offer Description", value: "Unlimited 100Mbps" }, { name: "IN Offer ID", value: "860" }] },
        { name: "PO2", characteristics: [] },
      ],
    };
    expect(offeringHolds(planned, words)).toContainEqual({ label: "Plans", text: "PO1 (Offer Description Unlimited 100Mbps, IN Offer ID 860); PO2" });
  });

  it("waits for the channels its order tracking and lifecycle notes name", () => {
    expect(waitsFor(detailed("needs_channel"), lexicon(release, []))).toBe("Waits for the channels Business Web, Shop");
  });

  it("is lifted only once the systems its order tracking names are added", () => {
    const store = suggestion({ kind: "system", system_id: "Order Store", name: "Order Store" });
    const portal = suggestion({ kind: "system", system_id: "Order Portal", name: "Order Portal" });
    const offering = detailed("needs_system");
    const channels = [
      suggestion({ kind: "channel", system_id: "Business Web", name: "Business Web", channel: { id: "Business Web", name: "Business Web" } }),
      suggestion({ kind: "channel", system_id: "Shop", name: "Shop", channel: { id: "Shop", name: "Shop" } }),
    ];
    expect(bulkAcceptable(release, [store, ...channels, offering]).lifted).toEqual([]);
    expect(bulkAcceptable(release, [store, portal, ...channels, offering]).lifted).toEqual([offering]);
  });
});

describe("vocabulary suggestions", () => {
  const ref = { field: "activity_etom", owner_id: "bpp-new", value: "Fulfillment · Order Handling", item: "10" } as const;
  const orders = suggestion(
    {
      kind: "vocabulary_term", system_id: "etom-order-handling",
      term: { id: "etom-order-handling", scheme: "etom_process", pref_label: "Order Handling", alt_labels: [] },
      value_refs: [ref, { ...ref, item: "20" }],
    },
    { match: "updates_existing" },
  );
  const saml = suggestion(
    {
      kind: "vocabulary_term", system_id: "role-saml",
      term: { id: "role-saml", scheme: "responsibility_role", pref_label: "SAML", alt_labels: [] },
      value_refs: [{ field: "responsibility_role", owner_id: "bpp", value: "SAML", item: "selfservice", part: "b2b-web" }],
    },
  );
  const api = suggestion({
    kind: "vocabulary_term", system_id: "api-tmf681",
    term: { id: "api-tmf681", scheme: "open_api", pref_label: "Communication", notation: "TMF681", alt_labels: [] },
    value_refs: [],
  });
  const termWords = lexicon(release, [orders, saml, api]);

  it("says which term it adds or links, and how many values", () => {
    expect(changeSentence(orders, termWords)).toBe("Links 2 values to the eTOM process Order Handling");
    expect(changeSentence(saml, termWords)).toBe("Adds the role SAML, linking 1 value");
    expect(changeSentence(api, termWords)).toBe("Adds the Open API Communication (TMF681)");
  });

  it("leaves a new term, a flagged value, for a person to decide alone", () => {
    expect(suggestionState(orders)).toBe("ready");
    expect(suggestionState(saml)).toBe("decide");
    expect(suggestionGroups(release, [orders, saml], termWords).map((group) => group.label)).toEqual(["Vocabulary terms"]);
  });
});

describe("what waits on what (focus mode)", () => {
  it("draws an edge from what a suggestion adds to each suggestion that needs it", () => {
    const edges = dependencyEdges(all);
    expect(edges).toContainEqual({ from: hub.id, to: api.id });
    expect(edges).toContainEqual({ from: hub.id, to: inferred.id });
    expect(edges.some((edge) => edge.to === hub.id)).toBe(false);
  });

  it("counts what a person said they accept as added, so what waits on it follows", () => {
    const portal = suggestion({ kind: "component", system_id: "dynamics-crm", component_id: "portal", name: "Portal" }, { match: "needs_system" });
    expect(bulkAcceptable(release, [crm, portal]).lifted).toEqual([]);
    expect(bulkAcceptable(release, [crm, portal], [crm]).lifted).toEqual([portal]);
  });

  it("asks the decisions in the order accepting them works, each answer saying what it does", () => {
    const questions = decideQuestions(all, words);
    // The system first, then its placement, then the link that names a system it could be.
    expect(questions.map((item) => item.id)).toEqual([crm.id, placement.id, inferred.id]);
    expect(questions[1]!.prompt).toMatch(/^Replace what the draft has\? /);
    const name = questions.find((item) => item.id === crm.id)!;
    expect(name.prompt).toBe("Is “Dynamics CRM” a system the draft already has?");
    expect(decideChoices(name).map((choice) => [choice.label, choice.answer.accept])).toEqual([
      ["Yes, it is BCRM", true],
      ["No, it is a new system", true],
      ["Reject it", false],
    ]);
    expect(decideChoices(name)[0]!.consequence).toBe("Similar name to BCRM. Adds “Dynamics CRM” as another name of BCRM.");
    const link = questions.find((item) => item.id === inferred.id)!;
    expect(decideChoices(link)[0]!.consequence).toContain("The link was inferred, not stated.");
  });
});
