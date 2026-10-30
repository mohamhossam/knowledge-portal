import { describe, expect, it } from "vitest";

import { EXPLORED, PLANS } from "../fixtures";
import { involvement, pickScenario } from "../scenario";
import { documentName } from "./generate";
import { solutionDocument } from "./model";
import type { DocBlock, DocCell, DocTable } from "./wordml";

const AT = new Date("2026-10-05T15:00:00Z");
const scenario = (order = "NEW", channel = "online") => pickScenario(EXPLORED, "bpp", order, channel)!;
const made = (options: Partial<Parameters<typeof solutionDocument>[0]> = {}) =>
  solutionDocument({ release: EXPLORED, scenario: scenario(), plans: PLANS, at: AT, by: "Amina", ...options });

const text = (cell: DocCell) => (typeof cell === "string" ? cell : cell.text);
const headings = (blocks: DocBlock[], level: "h1" | "h2") => blocks.filter((block) => block.t === level).map((block) => (block as { text: string }).text);
/** The blocks of one top-level section, from its heading to the next. */
function section(blocks: DocBlock[], title: string): DocBlock[] {
  const start = blocks.findIndex((block) => block.t === "h1" && block.text === title);
  expect(start, title).toBeGreaterThanOrEqual(0);
  const end = blocks.findIndex((block, index) => index > start && block.t === "h1");
  return blocks.slice(start + 1, end < 0 ? undefined : end);
}
const tables = (blocks: DocBlock[]) => blocks.filter((block): block is DocTable => block.t === "table");
const words = (blocks: DocBlock[]) =>
  blocks
    .map((block) =>
      block.t === "table"
        ? block.rows.map((row) => row.map(text).join(" | ")).join("\n")
        : block.t === "ul"
          ? block.items.join("\n")
          : block.t === "callout"
            ? `${block.title}\n${block.text}`
            : "text" in block
              ? block.text
              : "",
    )
    .join("\n");

describe("the Solution Architecture document", () => {
  it("names a linked interface by its record and a role by the vocabulary (review recommendation 10)", () => {
    const release = structuredClone(EXPLORED);
    const journey = release.journeys![0]!;
    journey.integrations[0]!.interface_id = "if-rtf-sr";
    release.interfaces = [{ id: "if-rtf-sr", name: "RTF service request API", system_id: "rtf", style: "api", consumer_ids: ["cwom"], open_api_ids: [], entity_ids: [], relays: [], accepted: [] }];
    release.vocabulary = [{ id: "r-1", scheme: "responsibility_role", pref_label: "Fulfil the order", alt_labels: ["Fulfilment"], close_match: [], deprecated: false, accepted: [] }];
    const model = solutionDocument({ release, scenario: pickScenario(release, "bpp", "NEW", "online")!, plans: PLANS, at: AT, by: "Amina" });

    const integration = words(section(model.blocks, "8. Integration Architecture"));
    // The hand-overs keep the text as the source wrote it; the named interfaces use the record.
    expect(integration).toMatch(/RTF \| CWOM \| SR request \| RTF SR \| Sync/);
    expect(integration).toMatch(/^RTF service request API \| /m);
    // FULFILMENT reads as the role term whose label it is.
    expect(words(model.blocks)).toMatch(/\(fulfil the order\)/);
  });

  it("keeps the original's document control and eighteen numbered sections, in order", () => {
    const model = made();

    expect(model.title).toBe("Business Pro Plus: New Activation, through Online");
    expect(headings(model.blocks, "h1")).toEqual([
      "Document Control",
      "1. Executive Summary",
      "2. Overall Solution Architecture",
      "3. Scope & Assumptions",
      "4. Product Overview",
      "5. Product → Service → Resource",
      "6. Impacted Application Landscape",
      "7. System-by-System Design",
      "8. Integration Architecture",
      "9. Information Architecture",
      "10. Tracking & Operational Architecture",
      "11. Lifecycle & Commercial Behaviour",
      "12. Security Architecture",
      "13. Non-Functional Requirements",
      "14. Deployment & Runtime",
      "15. Architecture Decisions",
      "16. Architecture Gaps & Open Questions",
      "17. Complete End-to-End Journey",
      "18. Traceability Matrix",
    ]);
    const cover = model.blocks[0] as Extract<DocBlock, { t: "cover" }>;
    expect(cover.rows).toContainEqual(["Catalogue version", "'October', published 5 October 2026"]);
    expect(cover.rows.find(([item]) => item === "Generated")![1]).toMatch(/by Amina$/);
    expect(documentName({ scenario: scenario() })).toBe("Business_Pro_Plus_New_Activation_Online_Solution_Architecture.docx");
  });

  it("lists the systems the explorer lists, one design section each, and nothing else", () => {
    const model = made();
    const expected = involvement(scenario()).map((item) => item.systemId);

    expect(model.meta.systems).toEqual(expected);
    expect(headings(section(model.blocks, "7. System-by-System Design"), "h2")).toEqual(["7.1 B2B Web", "7.2 RTF", "7.3 CWOM", "7.4 WFM"]);
    // The shop's step is another channel's: it is not in this scenario.
    expect(words(section(model.blocks, "17. Complete End-to-End Journey"))).not.toMatch(/Book a shop visit/);
    expect(words(section(model.blocks, "8. Integration Architecture"))).toMatch(/RTF \| CWOM \| SR request \| RTF SR \| Sync/);
  });

  it("files a fallout case under the system it names, whatever its words", () => {
    const release = structuredClone(EXPLORED);
    release.products![0]!.tracking!.fallout[0]!.system_id = "cwom";
    const model = solutionDocument({ release, scenario: pickScenario(release, "bpp", "NEW", "online")!, plans: PLANS, at: AT, by: "Amina" });
    let system = "";
    const handled: string[] = [];
    for (const block of model.blocks) {
      if (block.t === "h2") system = block.text;
      if (block.t !== "table") continue;
      const failure = block.rows.find((row) => text(row[0]!) === "Failure handling");
      if (failure && text(failure[1]!).includes("Rejected by business rules")) handled.push(system);
    }
    expect(handled).toEqual([expect.stringMatching(/CWOM$/)]);
  });

  it("says a section the catalogue cannot hold yet is a gap, and fills nothing in", () => {
    const model = made();

    for (const title of ["9. Information Architecture", "12. Security Architecture", "14. Deployment & Runtime"]) {
      expect(words(section(model.blocks, title))).toMatch(/does not hold .* yet, so this is a gap; nothing is filled in/);
    }
    const realised = tables(section(model.blocks, "5. Product → Service → Resource"))[0]!;
    const firewall = realised.rows.find((row) => text(row[0]!) === "Firewall")!;
    expect(firewall.slice(1, 4).map(text)).toEqual(["Not recorded (gap)", "Not recorded (gap)", "Not recorded (gap)"]);
    expect(firewall[4]).toEqual({ text: "None named (gap)", due: true });
    expect(words(section(model.blocks, "16. Architecture Gaps & Open Questions"))).toMatch(/Step 4 names no system that performs it\./);
  });

  it("says each fact's source with its level, and names the conflicts and what they raise", () => {
    const model = made();

    const decisions = tables(section(model.blocks, "15. Architecture Decisions"))[0]!;
    expect(decisions.rows[0]!.map(text)).toEqual(["AD-01", "Reuse Order to Delivery", "No new order flow.", "Confirmed\nBPP SDD (L2) §11.2"]);
    const conflicts = words(section(model.blocks, "16. Architecture Gaps & Open Questions"));
    expect(conflicts).toMatch(/One source says \| BPP SDD \(L2\) §11\.1\.3: Applicable channels are BCRM and the SMB App\./);
    expect(conflicts).toMatch(/Raises the question \| OQ-01/);
    // A decision needed is bold ink, never the red of a gap.
    const decision = tables(section(model.blocks, "16. Architecture Gaps & Open Questions")).flatMap((each) => each.rows).find((row) => text(row[0]!) === "Decision needed")!;
    expect(decision[1]).toEqual({ text: "Product owner to confirm the B2B scope.", strong: true });
    const control = words(section(model.blocks, "Document Control"));
    expect(control).toMatch(/Not supplied: carried forward unread/);
    expect(control).toMatch(/No longer uses: Siebel CRM/);
    // The change requests applied to the offering, as the original explorer listed them.
    expect(control).toMatch(/CR-20261003-Business_Pro_Plus \| 4 October 2026 \| Microsoft 365 for Business Pro Plus\nRequirement AI requirement REQ-2026-0412, revision 3, approved by Layla Haddad on 3 October 2026 \| Asks of Business Pro Plus: Offer Microsoft 365/);
    expect(control).not.toMatch(/history of change requests/);
  });

  it("prints the plans the product catalog states, or says why there are none", () => {
    const withPlans = words(section(made().blocks, "4. Product Overview"));
    expect(withPlans).toMatch(/Read live from the sample product catalog for the code BUSINESS_PRO_PLUS/);
    expect(withPlans).toMatch(/Monthly, with a contract \| Every month \| AED\s2,740\.00/);

    expect(words(section(made({ plans: null }).blocks, "4. Product Overview"))).toMatch(/could not be read when this document was generated/);
    expect(words(section(made({ plans: { ...PLANS, status: "no_code", plans: [] } }).blocks, "4. Product Overview"))).toMatch(/has no code in the catalogue/);
  });

  it("reads tracking and lifecycle for the scenario: not specified for a cease, and only its notes", () => {
    const cease = made({ scenario: scenario("CEASE", "") });

    expect(words(section(cease.blocks, "10. Tracking & Operational Architecture"))).toMatch(/Tracking is not specified for a cease\./);
    expect(headings(section(cease.blocks, "11. Lifecycle & Commercial Behaviour"), "h2")).toEqual(["11.1 Renewal", "11.2 Cessation"]);
    const online = made();
    expect(headings(section(online.blocks, "11. Lifecycle & Commercial Behaviour"), "h2")).toEqual(["11.1 Up / Downgrade matrix"]);
    expect(words(section(online.blocks, "10. Tracking & Operational Architecture"))).toMatch(/Online \| Digital Order ID ↔ CWOM Order ID \| B2B Web/);
  });

  it("says how sure a source is in the words every screen uses, never a third set", () => {
    const legend = tables(made().blocks).find((table) => table.cols[0]?.label === "Confidence");
    expect(legend?.rows.map((row) => text(row[0]!))).toEqual(["Confirmed", "Inferred", "Has gaps"]);
  });

  it("says a quality no source defines once, as Not defined, with no confidence word beside it", () => {
    const nfrs = tables(section(made().blocks, "13. Non-Functional Requirements"))[0]!;
    const availability = nfrs.rows.find((row) => text(row[0]!) === "Availability")!;
    expect(text(availability[1]!)).toBe("Not defined");
    expect(text(availability[3]!)).not.toMatch(/Has gaps|Inferred|Confirmed/);
  });

  it("lists each fact its source marks as a gap, with where the document shows it", () => {
    const gaps = section(made().blocks, "16. Architecture Gaps & Open Questions");

    expect(headings(gaps, "h2")).toEqual(["16.1 What the catalogue does not say yet", "16.2 Facts marked in their sources as a gap", "16.3 Conflicts between sources", "16.4 Open questions"]);
    const marked = tables(gaps)[0]!;
    expect(marked.rows.map((row) => row.slice(0, 2).map(text))).toEqual([["Step 4: Ticket the onboarding", "17"]]);
  });

  it("says which steps belong to another channel, and runs a section that is only a gap on from the one before", () => {
    const model = made();

    expect(words(section(model.blocks, "17. Complete End-to-End Journey"))).toMatch(/Step 5 belongs to other channels of New Activation and is left out\./);
    const short = model.blocks.filter((block) => block.t === "h1" && block.short).map((block) => (block as { text: string }).text);
    expect(short).toEqual(["9. Information Architecture", "12. Security Architecture", "14. Deployment & Runtime"]);
  });

  it("embeds the overview with words for it when the browser drew one", () => {
    const model = made({ overview: { png: new Uint8Array([1]), w: 10, h: 5 } });
    const image = model.blocks.find((block) => block.t === "image") as Extract<DocBlock, { t: "image" }>;

    expect(image.alt).toBe("Solution overview for Business Pro Plus: New Activation, through Online: Capture, B2B Web, RTF; Orchestrate, CWOM.");
    expect(made().blocks.some((block) => block.t === "image")).toBe(false);
  });
});
