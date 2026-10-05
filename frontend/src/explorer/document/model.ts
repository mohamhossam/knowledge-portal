/**
 * A Solution Architecture document for one scenario (requirement-portal
 * ADR-0101, step 6), with the original explorer's document control and
 * eighteen sections, filled from the catalogue version in service. A pure
 * function of what the explorer already reads: nothing is filled in that the
 * version does not hold, and a section the catalogue cannot hold yet says so.
 */
import type { CatalogPlans, ExplorerRelease, Journey, SourceConfidence } from "../../api/client";
import { CONFIDENCE, COVERAGE, LAYERS, concerns, orderedSteps, roleLabel, sentenceCase } from "../../catalogue/catalogue";
import { byLevel, questionOf, withLevel } from "../../catalogue/governance";
import { count } from "../../home/format";
import { falling, formatAmount } from "../plans";
import { gaps, involvement, journeyFor, listed, partsFor, performer, trackingFor, type Involvement, type Scenario } from "../scenario";
import { stages, trackingChain } from "./overview";
import type { DocBlock, DocCell, DocColumn, DocModel, DocTable } from "./wordml";

type Step = Journey["activities"][number];
type Link = Journey["integrations"][number];

/** What a document is read from: the scenario on screen, and the plans read with it. */
export type DocumentInput = {
  release: ExplorerRelease;
  scenario: Scenario;
  /** The plans read live from the product catalog; null when they could not be read. */
  plans: CatalogPlans | null;
  at: Date;
  /** Who generated it, when the page knows. */
  by?: string | null;
  /** The overview diagram, when the browser could draw it. */
  overview?: { png: Uint8Array; w: number; h: number } | null;
};

export type SolutionDocument = DocModel & {
  /** What the document covers, for tests and the file name. */
  meta: { systems: string[]; handOvers: number; interfaces: string[]; systemSections: string[] };
};

/** The document's status, said the same way on the cover, in Document Control and in the footer. */
export const STATUS = "DRAFT: generated from the catalogue; not approved until the architecture authority reviews it.";
/** Steps no system performs, said one way everywhere: "2 steps: no system (gap)". */
export const NO_SYSTEM = (n: number) => `${n} ${n === 1 ? "step" : "steps"}: no system (gap)`;
/** Where a source is cited: its name, level and section, without the section's title after "›". */
const citation = (text: string | null | undefined) => text?.split(" › ")[0]?.trim() || null;
const NOT_HELD = (what: string) => `The catalogue does not hold ${what} yet, so this is a gap; nothing is filled in.`;
const SHORT: Record<SourceConfidence, string> = { confirmed: "Confirmed", inferred: "Inferred", gap: "Gap" };
const VALIDATE = /validat|check|eligib|verif|feasib/i;

function day(at: Date | string | null | undefined): string {
  if (!at) return "not recorded";
  const value = typeof at === "string" ? new Date(at) : at;
  return Number.isNaN(value.getTime()) ? String(at) : value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function moment(at: Date): string {
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const lines = (items: string[], empty = "—") => (items.length ? items.join("\n") : empty);
const unique = <T,>(items: T[]) => [...new Set(items)];
const columns = (...pairs: [string, number][]): DocColumn[] => pairs.map(([label, w]) => ({ label, w }));

export function solutionDocument(input: DocumentInput): SolutionDocument {
  const { release, scenario, plans, at } = input;
  const { offering, orderType, channel, journey } = scenario;
  const sources = release.sources ?? [];
  const names = new Map(release.systems.map((item) => [item.id, item]));
  const name = (systemId: string | null | undefined) => (systemId ? names.get(systemId)?.name ?? systemId : "Not named");
  const sourced = (text: string | null | undefined) => withLevel(text, sources);
  /** How sure a fact is, and where it is said: "Confirmed · BPP SDD (L2) §10". */
  const evidence = (fact: { confidence?: SourceConfidence | null; source?: string | null } | null | undefined): DocCell => {
    const parts = [fact?.confidence ? SHORT[fact.confidence] : null, sourced(citation(fact?.source))].filter(Boolean);
    return { text: parts.join("\n") || "Not stated", confidence: fact?.confidence ?? null };
  };
  const steps = journey ? orderedSteps(journey) : [];
  const step = new Map(steps.map((item) => [item.number, item]));
  const by = (item: Step) => performer(scenario, item);
  const taking = involvement(scenario);
  const parts = partsFor(scenario);
  const missing = gaps(scenario);
  const tracked = trackingFor(scenario);
  const conflicts = scenario.conflicts ?? [];
  const questions = offering.questions ?? [];
  const links = journey?.integrations ?? [];
  const from = (link: Link) => by(step.get(link.from_activity) ?? ({} as Step));
  const to = (link: Link) => by(step.get(link.to_activity) ?? ({} as Step));
  const handOver = (link: Link) => `${name(from(link))} → ${name(to(link))}`;
  const interfaces = unique(
    [
      ...links.map((link) => link.interface),
      ...(tracked?.flows ?? []).map((flow) => ("interface" in flow ? flow.interface : null) ?? (flow.readFor ? flow.label : null)),
    ].filter((item): item is string => !!item?.trim()),
  );
  const title = `${offering.name}: ${orderType.name}${channel ? `, through ${channel.name}` : ""}`;
  const scenarioLine = `${orderType.name} · ${channel ? channel.name : "every channel"}`;
  const role = (item: Involvement): string[] => [
    ...(item.performs.length ? [`Performs ${item.performs.length === 1 ? "step" : "steps"} ${item.performs.join(", ")}`] : []),
    ...(item.supports.length ? [`Supports ${item.supports.length === 1 ? "step" : "steps"} ${item.supports.join(", ")}`] : []),
    ...unique(item.parts.map(({ part, responsibility }) => `${responsibility.role ? roleLabel(responsibility.role) : "Responsible"} for ${part.name}`)),
    ...(item.tracks ? ["Takes part in order tracking"] : []),
  ];
  const domain = (systemId: string): string => {
    const domains = new Map((release.landscape_domains ?? []).map((item) => [item.id, item]));
    const path: string[] = [];
    let current = domains.get(names.get(systemId)?.landscape_domain_id ?? "");
    while (current && path.length < 8) {
      path.unshift(current.name);
      current = current.parent_id ? domains.get(current.parent_id) : undefined;
    }
    return path.join(" › ") || "Not placed in the landscape";
  };

  /** Every fact of this scenario its source marks as a gap, with the section that shows it. */
  const markedFacts = () => {
    const found: { what: string; section: string; source?: string | null }[] = [];
    const add = (fact: { confidence?: SourceConfidence | null; source?: string | null }, what: string, section: string) => {
      if (fact.confidence === "gap") found.push({ what, section, source: fact.source });
    };
    add(offering, `The offering ${offering.name}`, "4");
    add(orderType, `The order type ${orderType.name}`, "1.3");
    for (const { part, responsibilities } of parts) {
      add(part, `The component ${part.name}`, "4.5");
      for (const item of part.realisation ?? []) add(item, `${part.name} · ${LAYERS.find((layer) => layer.layer === item.layer)?.short ?? item.layer} · ${item.name}`, "5");
      for (const item of responsibilities) add(item, `${name(item.system_id)} is responsible for ${part.name}`, "5");
    }
    if (journey) {
      add(journey, `The journey ${journey.name}`, "1.3");
      for (const each of steps) add(each, `Step ${each.number}: ${each.name}`, "17");
      for (const link of links) add(link, `Hand-over ${link.from_activity} → ${link.to_activity}`, "8.1");
      for (const rule of journey.flow_rules) add(rule, `Rule ${rule.from_activity} → ${rule.to_activity}${rule.condition ? `: ${rule.condition}` : ""}`, "17");
    }
    return found;
  };
  const blocks: DocBlock[] = [];
  /** A section; a short one (only a gap to say) runs on from the one before instead of opening a page. */
  const h1 = (text: string, short = false) => blocks.push({ t: "h1", text, short });
  const h2 = (text: string) => blocks.push({ t: "h2", text });
  const p = (text: string, muted = false) => blocks.push({ t: "p", text, muted });
  const ul = (items: string[]) => items.length && blocks.push({ t: "ul", items });
  const table = (cols: DocColumn[], rows: DocCell[][], options: Omit<DocTable, "t" | "cols" | "rows"> = {}) =>
    rows.length && blocks.push({ t: "table", cols, rows, ...options });
  const gap = (title_: string, text: string) => blocks.push({ t: "callout", kind: "gap", title: title_, text });

  /* Cover and document control */
  blocks.push({
    t: "cover",
    product: offering.name,
    scenario: scenarioLine,
    rows: [
      ["Offering", [offering.name, offering.code && `code ${offering.code}`, offering.family && `family ${offering.family}`].filter(Boolean).join(" · ")],
      ["Order type", `${orderType.name} (${orderType.code})${orderType.enabled ? "" : " · not offered"}`],
      ["Channel", channel ? channel.name : "Every channel: none is recorded for this order type"],
      ["Catalogue version", `'${release.name}', published ${day(release.published_at)}`],
      ["Generated", `${moment(at)}${input.by ? ` by ${input.by}` : ""}`],
      ["Status", STATUS],
    ],
    note: "Generated from the knowledge catalogue version in service, the same version the product architecture explorer reads. The explorer and this document are two presentations of one scenario.",
  });
  h1("Document Control");
  table(columns(["Item", 26], ["Value", 74]), [
    ["Document", `Solution Architecture: ${title}`],
    ["Purpose", "Solution architecture for one scenario (offering, order type and channel), generated from the catalogue version in service."],
    ["Scenario", [offering.id, orderType.code, channel?.id ?? "every channel"].join(" · ")],
    ["Catalogue version", `'${release.name}', published ${day(release.published_at)}`],
    ["Generated", `${moment(at)}${input.by ? ` by ${input.by}` : ""}`],
    ["Status", STATUS],
  ], { firstColShade: true });
  h2("Source documents");
  const register = byLevel(sources);
  if (register.length) {
    table(
      columns(["Level", 9], ["Source", 39], ["Version", 13], ["Supplied", 15], ["Authority", 24]),
      register.map((source) => [
        source.level,
        [source.title, [source.short, source.file].filter(Boolean).join(" · "), source.id === offering.primary_source ? "Primary source of this offering" : ""].filter(Boolean).join("\n"),
        source.version ?? "—",
        source.supplied === false ? { text: "Not supplied: carried forward unread", due: true } : "Supplied",
        [source.authority, source.boundary && `Cannot tell: ${source.boundary}`].filter(Boolean).join("\n") || "—",
      ]),
    );
  } else gap("Source documents", "The catalogue registers no source yet, so no fact below can say its level.");
  h2("Confidence");
  p("Every fact in the catalogue says how sure its source is and where it is said. A fact the sources do not give is shown as a gap, never filled in.");
  table(columns(["Confidence", 20], ["Meaning", 80]), (Object.keys(SHORT) as SourceConfidence[]).map((key) => [{ text: SHORT[key], confidence: key }, CONFIDENCE[key]]));
  h2("Assumptions");
  p("The catalogue records no fact as an assumption. A fact read but not stated in its source is marked inferred; one its source does not give is a gap.");
  h2("Architecture boundaries");
  ul([
    ...(offering.boundaries ?? []),
    ...((offering.not_used ?? []).length ? [`No longer uses: ${(offering.not_used ?? []).join(", ")}.`] : []),
    `Only the systems, hand-overs and steps of ${orderType.name}${channel ? ` through ${channel.name}` : ""} are in scope.`,
  ]);
  h2("Change history");
  // The change requests applied to this offering, as the original explorer listed them (step 7).
  const history = (release.change_history ?? []).filter((record) => record.product_id === offering.id);
  if (history.length) {
    table(
      columns(["Change request", 20], ["Applied", 12], ["Request", 38], ["What it changed", 30]),
      history.map((record) => [
        record.id,
        record.applied_at ? day(record.applied_at) : "Not recorded",
        [
          record.title,
          [record.requester && record.requester !== record.trace?.approved_by && `Requested by ${record.requester}`, record.priority && `${record.priority} priority`].filter(Boolean).join(" · "),
          record.trace
            ? `Requirement AI requirement ${record.trace.requirement_id}, revision ${record.trace.breakdown_revision}${record.trace.approved_by ? `, approved by ${record.trace.approved_by}` : ""}${record.trace.approved_at ? ` on ${day(record.trace.approved_at)}` : ""}`
            : record.origin === "explorer"
              ? "Drafted in the original explorer"
              : "",
        ]
          .filter(Boolean)
          .join("\n"),
        lines([...record.items.map((item) => item.summary), ...record.gaps.map((gap) => `Not mapped: ${gap}`)]),
      ]),
    );
  } else p("No change request has been applied to this offering.");
  blocks.push({ t: "toc" });

  /* 1 Executive summary */
  h1("1. Executive Summary");
  h2("1.1 Business context");
  p(offering.proposition || "The catalogue records no proposition for this offering.");
  if ((offering.values ?? []).length) {
    h2("1.2 Customer value");
    ul((offering.values ?? []).map((item) => (item.description ? `${item.name}: ${item.description}` : item.name)));
  }
  h2("1.3 Selected journey");
  p(`${orderType.name}: ${orderType.description || "the catalogue records no description of this order type."}`);
  p(
    channel
      ? `Entry channel: ${channel.name}${channel.description ? `: ${channel.description.replace(/\.$/, "")}` : ""}. ${channel.entry_system_id ? `Orders enter through ${name(channel.entry_system_id)}.` : "The channel names no entry system."}`
      : "No channel is recorded for this order type, so the steps of every channel are read together.",
  );
  if (journey) p(`Fulfilled by the journey ${journey.name}${journey.confidence ? ` (${CONFIDENCE[journey.confidence].toLocaleLowerCase()})` : ""}.`);
  h2("1.4 Architecture overview");
  const stageRows = stages(scenario);
  if (stageRows.length) {
    const chain = trackingChain(scenario);
    p(
      `The order runs through ${count(stageRows.length, "stage")}: ${stageRows.map((stage) => stage.phase).join(" → ")}.` +
        (chain.length ? ` Its tracking runs ${chain.map(name).join(" → ")}.` : "") +
        " Section 2 names the systems of each stage.",
    );
  } else gap("No journey", `No journey is recorded for ${orderType.name}, so no stage, step or hand-over can be shown.`);
  h2("1.5 Scenario impact");
  table(columns(["Measure", 60], ["Value", 40]), [
    ["Systems taking part", String(taking.length)],
    ["Systems performing steps", String(taking.filter((item) => item.performs.length).length)],
    ["Hand-overs between steps", String(links.length)],
    ["Named interfaces", String(interfaces.length)],
    ["What the catalogue does not say yet", String(missing.length)],
    ["Conflicts between its sources", String(conflicts.length)],
  ]);
  h2("1.6 Main systems");
  ul(taking.filter((item) => item.performs.length).map((item) => [name(item.systemId), names.get(item.systemId)?.description].filter(Boolean).join(": ")));
  h2("1.7 Key risks and gaps");
  if (missing.length) gap(`${count(missing.length, "thing", "things")} the catalogue does not say yet`, missing.slice(0, 8).join("\n") + (missing.length > 8 ? `\n… ${missing.length - 8} more in section 16.` : ""));
  else p("The catalogue leaves nothing unsaid for this scenario.");
  if (conflicts.length) {
    blocks.push({
      t: "callout",
      kind: "decision",
      title: `${count(conflicts.length, "decision is", "decisions are")} open for ${orderType.name}`,
      text: conflicts.map((item) => `${item.id} ${item.title}${item.difference ? `: ${item.difference}` : ""}`).join("\n"),
    });
  }

  /* 2 Overall solution architecture */
  h1("2. Overall Solution Architecture");
  p(`The systems of ${title}, stage by stage, left to right, with the order's tracking beneath.`);
  if (input.overview) {
    blocks.push({
      t: "image",
      png: input.overview.png,
      w: input.overview.w,
      h: input.overview.h,
      alt: `Solution overview for ${title}: ${stageRows.map((stage) => `${stage.phase}, ${stage.systems.map(name).join(", ") || "no system"}`).join("; ")}.`,
      caption: "Figure 1: Solution overview, drawn from the catalogue",
      landscape: true,
    });
  }
  const weakest = (stage: (typeof stageRows)[number]): DocCell => {
    const facts = steps.filter((item) => (item.phase?.trim() || "Not placed in a phase") === stage.phase);
    const rank: (SourceConfidence | null | undefined)[] = ["gap", "inferred", "confirmed"];
    const found = rank.find((level) => facts.some((item) => item.confidence === level));
    return found ? { text: SHORT[found], confidence: found } : "Not stated";
  };
  table(columns(["Stage", 22], ["Systems", 50], ["Weakest confidence", 28]), stageRows.map((stage) => [stage.phase, lines(stage.systems.map(name).concat(stage.unnamed ? [NO_SYSTEM(stage.unnamed)] : [])), weakest(stage)]), { firstColShade: true });
  h2("2.1 Hand-overs by interaction");
  const interactions = unique(links.map((link) => link.interaction?.trim() || "Not described"));
  if (interactions.length) {
    table(
      columns(["Interaction", 34], ["Hand-overs", 12], ["Interfaces named", 54]),
      interactions.map((kind) => {
        const these = links.filter((link) => (link.interaction?.trim() || "Not described") === kind);
        return [kind, String(these.length), lines(unique(these.map((link) => link.interface).filter((item): item is string => !!item)), "No interface named")];
      }),
    );
  } else p("The journey records no hand-over between steps.");
  h2("2.2 Journey at a glance");
  table(
    columns(["Stage", 22], ["eTOM (as the source labels it)", 34], ["Systems", 30], ["Steps", 14]),
    stageRows.map((stage) => {
      const these = steps.filter((item) => (item.phase?.trim() || "Not placed in a phase") === stage.phase);
      return [stage.phase, lines(unique(these.map((item) => item.etom).filter((item): item is string => !!item)), "Not labelled"), lines(stage.systems.map(name)), these.map((item) => item.number).join(", ")];
    }),
    { firstColShade: true },
  );

  /* 3 Scope */
  h1("3. Scope & Assumptions");
  h2("3.1 In scope");
  ul([
    `The order type ${orderType.name}${channel ? ` through ${channel.name}` : ", every channel together"}.`,
    `The offering's parts: ${parts.map(({ part }) => part.name).join(", ") || "none recorded"}.`,
    `${count(taking.length, "system")}, ${count(links.length, "hand-over")} and ${count(interfaces.length, "named interface")} (sections 6 to 8).`,
  ]);
  h2("3.2 Out of scope");
  ul([
    ...(scenario.channels.length > 1 ? [`Other channels of this order type (${scenario.channels.filter((item) => item.id !== channel?.id).map((item) => item.name).join(", ")}): each is a scenario of its own.`] : []),
    ...(offering.order_types.length > 1 ? [`Other order types of ${offering.name} (${offering.order_types.filter((item) => item.code !== orderType.code).map((item) => item.name).join(", ")}).`] : []),
  ]);
  h2("3.3 Dependencies");
  const dependencies = taking.filter((item) => !item.performs.length);
  if (dependencies.length) table(columns(["System", 30], ["Why it takes part", 70]), dependencies.map((item) => [name(item.systemId), lines(role(item))]));
  else p("Every system that takes part performs a step of the journey.");
  h2("3.4 Assumptions and source boundaries");
  p("See Document Control: Assumptions, and Architecture boundaries.");

  /* 4 Product */
  h1("4. Product Overview");
  h2("4.1 Proposition");
  p(offering.proposition || "Not recorded.");
  if ((offering.audiences ?? []).length) {
    h2("4.2 Target customers");
    ul((offering.audiences ?? []).map((item) => (item.description ? `${item.name}: ${item.description}` : item.name)));
  }
  h2("4.3 Plans and commercial terms");
  if (!plans) p("The product catalog could not be read when this document was generated, so its plans and prices are not shown.");
  else if (plans.status === "not_configured") p("This portal reads no product catalog, so plans and prices are not shown.");
  else if (plans.status === "no_code") gap("Plans", `${offering.name} has no code in the catalogue, so its plans cannot be looked up in ${plans.catalog}.`);
  else if (plans.status !== "found" || !plans.plans.length) gap("Plans", `${plans.catalog} holds no plans for the code ${plans.code ?? offering.code ?? "—"}.`);
  else {
    p(`Read live from ${plans.catalog} for the code ${plans.code}${plans.read_at ? `, at ${moment(new Date(plans.read_at))}` : ""}. The knowledge catalogue keeps no copy.${plans.terms?.length ? ` Sold with: ${plans.terms.join("; ")}.` : ""}`);
    table(
      columns(["Plan", 34], ["Price", 30], ["Falls due", 16], ["Amount", 20]),
      plans.plans.flatMap((plan) => plan.prices.map((price, index) => [index ? "" : [plan.name, plan.description].filter(Boolean).join("\n"), price.name, falling(price), formatAmount(price.amount, price.currency)])),
    );
  }
  h2("4.4 Commercial and product rules");
  if ((offering.rules ?? []).length) ul(offering.rules);
  else p("The catalogue records no rule for this offering.");
  h2("4.5 Product components");
  table(
    columns(["Component", 34], ["Kind", 16], ["Obligation", 16], ["In this order", 14], ["Confidence", 20]),
    parts.map(({ part, responsibilities }) => [
      [part.name, part.code].filter(Boolean).join("\n"),
      part.kind ? sentenceCase(part.kind) : "—",
      part.mandatory === true ? "Mandatory" : part.mandatory === false ? "Optional" : { text: "Not recorded (gap)", due: true },
      responsibilities.length || steps.some((item) => item.component_ids.includes(part.id)) ? "Yes" : "No",
      evidence(part),
    ]),
  );

  /* 5 Realisation */
  h1("5. Product → Service → Resource");
  p("Each component, the customer-facing services (CFS), resource-facing services (RFS) and resources that realise it, and the systems responsible for it in this order. A layer its sources do not name is a gap.");
  table(
    columns(["Component", 18], ["CFS", 19], ["RFS", 21], ["Resource", 16], ["Responsible in this order", 16], ["Confidence", 10]),
    parts.map(({ part, responsibilities }) => {
      const layer = (key: (typeof LAYERS)[number]["layer"]): DocCell => {
        const items = (part.realisation ?? []).filter((item) => item.layer === key);
        if (!items.length) return { text: "Not recorded (gap)", due: true };
        return { text: items.map((item) => `${item.name}${item.confidence && item.confidence !== "confirmed" ? ` [${SHORT[item.confidence]}]` : ""}`).join("\n"), confidence: items.some((item) => item.confidence === "gap") ? "gap" : null };
      };
      return [
        part.name,
        layer("cfs"),
        layer("rfs"),
        layer("resource"),
        responsibilities.length ? lines(unique(responsibilities.map((item) => `${name(item.system_id)}${item.role ? ` (${roleLabel(item.role).toLocaleLowerCase()})` : ""}`))) : { text: "None named (gap)", due: true },
        evidence(part),
      ];
    }),
    { landscape: true },
  );

  /* 6 Landscape */
  h1("6. Impacted Application Landscape");
  p("Where each system that takes part sits in the landscape, and what it does in this order.");
  table(
    columns(["System", 20], ["Sits in", 26], ["Its part in this order", 54]),
    taking.map((item) => [name(item.systemId), domain(item.systemId), lines(role(item))]),
  );
  h2("6.1 TM Forum Functional Framework alignment");
  p(NOT_HELD("an alignment of its landscape to the TM Forum Functional Framework"));

  /* 7 System by system */
  h1("7. System-by-System Design");
  p(`One section for each of the ${count(taking.length, "system")} that take part. Each says only what the catalogue holds for this scenario; anything else is a gap. Business objects (section 9), security (section 12) and non-functional requirements (section 13) are recorded for the offering, not for each system.`);
  const systemSections: string[] = [];
  taking.forEach((item, index) => {
    const system = names.get(item.systemId);
    const label = name(item.systemId);
    systemSections.push(label);
    h2(`7.${index + 1} ${label}`);
    const inbound = links.filter((link) => to(link) === item.systemId);
    const outbound = links.filter((link) => from(link) === item.systemId);
    const performed = steps.filter((each) => by(each) === item.systemId);
    const validations = performed.filter((each) => VALIDATE.test(`${each.phase ?? ""} ${each.name}`));
    const failing = (journey?.edges ?? []).filter((edge) => (edge.kind === "fail" || edge.kind === "loop") && [step.get(edge.from_activity), step.get(edge.to_activity)].some((each) => each && by(each) === item.systemId));
    const fallout = (tracked?.tracking.fallout ?? []).filter((each) => [system?.name, ...(system?.aliases ?? [])].some((alias) => alias && alias.length > 2 && `${each.trigger} ${each.handling}`.toLocaleLowerCase().includes(alias.toLocaleLowerCase())));
    const trackingFlows = (tracked?.flows ?? []).filter((flow) => flow.from_system_id === item.systemId || flow.to_system_id === item.systemId);
    const entry = tracked?.entry;
    table(
      columns(["Aspect", 22], ["Detail", 78]),
      [
        ["Purpose", system?.description || "The catalogue records no description (gap)."],
        ["Its part in this order", lines(role(item))],
        ["Sits in", domain(item.systemId)],
        ["Responsibilities", lines(item.parts.map(({ part, responsibility }) => `${responsibility.role ? roleLabel(responsibility.role) : "Responsible"} for ${part.name}${responsibility.description ? `: ${responsibility.description}` : ""}`), "No part names it as responsible in this order.")],
        ["Steps", lines([...performed.map((each) => `${each.number} ${each.name}`), ...steps.filter((each) => each.supporting_system_ids.includes(item.systemId)).map((each) => `${each.number} supports: ${each.name}`)], "No step of the journey names it.")],
        ["Components handled", lines(unique(item.parts.map(({ part }) => part.name)), "None in this order.")],
        ["Inputs", lines(unique([...inbound.map((link) => `From ${name(from(link))}: ${link.payload || link.interaction || "not described"}`), ...performed.map((each) => each.input).filter((value): value is string => !!value)]), "No hand-over reaches it in this scenario.")],
        ["Outputs", lines(unique([...outbound.map((link) => `To ${name(to(link))}: ${link.payload || link.interaction || "not described"}`), ...performed.map((each) => each.output).filter((value): value is string => !!value)]), "No hand-over leaves it in this scenario.")],
        ...(inbound.length ? [["Inbound integrations", lines(unique(inbound.map((link) => [handOver(link), link.interaction, link.interface].filter(Boolean).join(" · "))))]] : []),
        ...(outbound.length ? [["Outbound integrations", lines(unique(outbound.map((link) => [handOver(link), link.interaction, link.interface].filter(Boolean).join(" · "))))]] : []),
        ["Interfaces", lines(unique([...inbound, ...outbound].map((link) => link.interface).filter((value): value is string => !!value)), "No interface is named for it in this scenario.")],
        ["Validations", lines(validations.map((each) => `${each.number} ${each.name}`), "No step it performs validates.")],
        ["Failure handling", lines([...failing.map((edge) => `${edge.kind === "fail" ? "Rejection" : "Retry"}: ${edge.from_activity} → ${edge.to_activity}${edge.label ? ` (${edge.label})` : ""}`), ...fallout.map((each) => `${each.trigger}: ${each.handling}`)], "The catalogue records none for it.")],
        ["Tracking and correlation", lines([...trackingFlows.map((flow) => `${name(flow.from_system_id)} → ${name(flow.to_system_id)}: ${flow.label}`), ...(entry?.ui_system_id === item.systemId ? [`Correlation key: ${entry.correlation_key || "not defined (gap)"}`] : [])], "Not on the tracking path of this scenario.")],
        ["Gaps and open questions", lines([...performed.filter((each) => each.confidence === "gap").map((each) => `Step ${each.number} is marked in its source as a gap.`), ...questions.filter((question) => [label, ...(system?.aliases ?? [])].some((alias) => alias.length > 2 && question.text.includes(alias))).map((question) => `${question.id}: ${question.text}`)], "None recorded for this system.")],
      ],
      { firstColShade: true },
    );
  });

  /* 8 Integration */
  h1("8. Integration Architecture");
  p("The hand-overs between this scenario's steps, from the journey. An interface is named only where a source names it; none is made up.");
  h2("8.1 Hand-overs");
  if (links.length) {
    const timed = links.some((link) => link.timing);
    const correlated = links.some((link) => link.correlation_key);
    table(
      [
        ...columns(["Steps", 7], ["From", 11], ["To", 11], ["Interaction", 14], ["Interface", 15]),
        ...(timed ? columns(["Timing", 7]) : []),
        ...columns(["Payload", 20]),
        ...(correlated ? columns(["Correlation", 9]) : []),
        ...columns(["Confidence", 16]),
      ],
      links.map((link) => [
        `${link.from_activity} → ${link.to_activity}`,
        name(from(link)),
        name(to(link)),
        link.interaction || "Not described",
        link.interface || "Not named",
        ...(timed ? [link.timing || "Not stated"] : []),
        link.payload || "Not described",
        ...(correlated ? [link.correlation_key || "Not stated"] : []),
        evidence(link),
      ]),
      { landscape: true, small: true },
    );
    const silent = [!timed && "timing", !correlated && "a correlation key"].filter(Boolean);
    if (silent.length) p(`No source gives ${silent.join(" or ")} for these hand-overs (gap).`, true);
  } else p("The journey records no hand-over between steps.");
  h2("8.2 Named interfaces");
  if (interfaces.length) {
    table(
      columns(["Interface", 34], ["Used between", 40], ["Steps", 26]),
      interfaces.map((each) => {
        const uses = links.filter((link) => link.interface === each);
        const flows = (tracked?.flows ?? []).filter((flow) => ("interface" in flow ? flow.interface : null) === each || (flow.readFor && flow.label === each));
        return [
          each,
          lines(unique([...uses.map(handOver), ...flows.map((flow) => `${name(flow.from_system_id)} → ${name(flow.to_system_id)} (order tracking)`)])),
          lines(unique(uses.map((link) => `${link.from_activity} → ${link.to_activity}`)), "Order tracking"),
        ];
      }),
      { landscape: true },
    );
  } else p("No source names an interface for this scenario.");

  /* 9 Information */
  h1("9. Information Architecture", true);
  gap("Information objects", `${NOT_HELD("information objects or which system is the record for each")} The explorer says the same.`);

  /* 10 Tracking */
  h1("10. Tracking & Operational Architecture");
  if (!tracked) gap("Order tracking", `No order tracking is recorded for ${offering.name}.`);
  else {
    const tracking = tracked.tracking;
    if (tracking.scope_note) p(tracking.scope_note);
    if (!tracked.applies) gap("Order tracking", tracking.not_applicable_note || `Order tracking is not specified for ${orderType.name}.`);
    else {
      h2("10.1 Channel correlation");
      const entry = tracked.entry;
      table(columns(["Channel", 18], ["Correlation key", 34], ["Tracked in", 22], ["Confidence", 26]), [
        [
          channel?.name ?? "Every channel",
          entry?.correlation_key ? entry.correlation_key : { text: "Not defined (gap)", due: true },
          entry?.ui_system_id ? name(entry.ui_system_id) : { text: `Not named (gap)${entry?.ui_note ? `: ${entry.ui_note}` : ""}`, due: true },
          evidence(entry),
        ],
      ]);
      if (entry?.story) p(`Story: ${entry.story}`, true);
      h2("10.2 Tracking flows");
      table(
        columns(["From", 15], ["To", 15], ["What", 34], ["Interface", 18], ["Confidence", 18]),
        tracked.flows.map((flow) => [name(flow.from_system_id), name(flow.to_system_id), flow.from_system_id === flow.to_system_id ? `${flow.label} (logs to itself)` : flow.label, ("interface" in flow ? flow.interface : null) || (flow.readFor ? `Read for ${flow.readFor}` : "—"), evidence(flow)]),
      );
      h2("10.3 Customer-visible milestones");
      table(columns(["Milestone", 26], ["Detail", 46], ["System", 14], ["Confidence", 14]), tracking.milestones.map((item) => [item.label, item.detail || "—", item.system_id ? name(item.system_id) : "—", evidence(item)]));
      if (tracking.statuses.length) {
        h2("10.4 Internal statuses");
        table(columns(["Status", 24], ["Meaning", 56], ["Confidence", 20]), tracking.statuses.map((item) => [item.label, item.detail || "—", evidence(item)]));
      }
    }
    h2("10.5 Fallout and retry");
    if (tracking.fallout.length) table(columns(["When", 28], ["What happens", 52], ["Confidence", 20]), tracking.fallout.map((item) => [item.trigger, item.handling || "—", evidence(item)]));
    else p("The catalogue records no fallout handling.");
    if (tracked.gaps.length) gap("Tracking the catalogue does not describe", tracked.gaps.join("\n"));
  }

  /* 11 Lifecycle */
  h1("11. Lifecycle & Commercial Behaviour");
  const notes = (offering.lifecycle_notes ?? []).filter((note) => concerns(note, orderType.code, channel?.id ?? null));
  if (!notes.length) p("No lifecycle note concerns this order type.");
  notes.forEach((note, index) => {
    h2(`11.${index + 1} ${note.title}`);
    if (note.summary) p(note.summary);
    for (const block of note.blocks) {
      if (block.to_verify) blocks.push({ t: "callout", kind: "carry", title: `${block.title ?? "Carried over"}: carried over from another source, to re-verify`, text: "" });
      else if (block.title) blocks.push({ t: "h3", text: block.title });
      if (block.kind === "text" && block.text) p(block.text);
      if (block.kind === "list") ul(block.items);
      if (block.kind === "table" && block.columns.length) table(block.columns.map((label) => ({ label, w: Math.round(100 / block.columns.length) })), block.rows.map((row) => row.map((value) => String(value ?? ""))));
      if (block.source) p(`Source: ${sourced(block.source)}`, true);
    }
    p(`Confidence: ${(evidence(note) as { text: string }).text}`, true);
  });

  /* 12 to 14 */
  h1("12. Security Architecture", true);
  p(`${NOT_HELD("security attributes of their own")} Any security quality the sources state is among the non-functional requirements in section 13.`);
  h1("13. Non-Functional Requirements");
  const nfrs = offering.nfrs ?? [];
  if (nfrs.length) {
    table(
      columns(["Quality", 18], ["Coverage", 14], ["Statement", 48], ["Confidence", 20]),
      nfrs.map((item) => [item.quality, { text: COVERAGE[item.coverage], coverage: item.coverage }, item.statement || "No source defines it.", evidence(item)]),
    );
  } else gap("Non-functional requirements", `No non-functional requirement is recorded for ${offering.name}.`);
  h1("14. Deployment & Runtime", true);
  gap("Deployment & runtime", `${NOT_HELD("hosting, network or platform facts")} No deployment diagram is drawn without them.`);

  /* 15, 16 Governance */
  h1("15. Architecture Decisions");
  const decisions = offering.decisions ?? [];
  if (decisions.length) table(columns(["Id", 10], ["Decision", 28], ["What was decided", 44], ["Confidence", 18]), decisions.map((item) => [item.id, item.title, item.text || "—", evidence(item)]));
  else p("No architecture decision is recorded for this offering.");
  h1("16. Architecture Gaps & Open Questions");
  h2("16.1 What the catalogue does not say yet");
  if (missing.length) ul(missing);
  else p("Nothing: the catalogue says all of it for this scenario.");
  const marked = markedFacts();
  if (marked.length) {
    h2("16.2 Facts marked in their sources as a gap");
    table(columns(["Fact", 52], ["Section", 12], ["Source", 36]), marked.map((fact) => [{ text: fact.what, due: true }, fact.section, sourced(citation(fact.source)) ?? "Not stated"]));
  }
  h2(`16.${marked.length ? 3 : 2} Conflicts between sources`);
  if (conflicts.length) {
    for (const conflict of conflicts) {
      const side = (each: (typeof conflict)["a"]) => {
        const source = sources.find((item) => item.id === each.source_id);
        const where = [source ? sourced(source.short ?? source.title) : each.source_id, each.reference].filter(Boolean).join(" ");
        return `${where}: ${each.statement}`;
      };
      const raises = questionOf(conflict, offering.id);
      table(
        [{ label: conflict.id, w: 22 }, { label: conflict.title, w: 78 }],
        [
          ["One source says", side(conflict.a)],
          ["Another says", side(conflict.b)],
          ["What differs", conflict.difference || "—"],
          ["Meanwhile", conflict.impact || "—"],
          ["Decision needed", { text: conflict.decision || "Not stated", strong: true }],
          ...(raises ? [["Raises the question", raises] as DocCell[]] : []),
        ],
        { firstColShade: true },
      );
    }
  } else p(`No conflict between sources concerns ${orderType.name}.`);
  h2(`16.${marked.length ? 4 : 3} Open questions`);
  if (questions.length) table(columns(["Id", 10], ["Question", 52], ["Meanwhile", 22], ["Confidence", 16]), questions.map((item) => [item.id, item.text, item.impact || "—", evidence(item)]));
  else p("No open question is recorded for this offering.");

  /* 17 Journey */
  h1("17. Complete End-to-End Journey");
  const whole = journeyFor(release, offering.id, orderType.code);
  const elsewhere = (whole?.activities ?? []).map((each) => each.number).filter((number) => !step.has(number));
  p(
    "Every step of the journey for this scenario, in order, with where it goes next, its hand-overs and its conditions." +
      (elsewhere.length && channel ? ` ${elsewhere.length === 1 ? `Step ${elsewhere[0]} belongs` : `Steps ${listed(elsewhere)} belong`} to other channels of ${orderType.name} and ${elsewhere.length === 1 ? "is" : "are"} left out.` : ""),
  );
  if (journey) {
    const components = new Map(offering.components.map((part) => [part.id, part.name]));
    table(
      columns(["Step", 5], ["Stage", 9], ["System", 11], ["Activity", 23], ["Next", 6], ["Hand-over", 12], ["Component", 10], ["Condition", 10], ["Confidence", 14]),
      steps.map((each) => {
        const performing = by(each);
        // A decision that only splits the journey by channel is already taken: the scenario is one channel's.
        const byChannel = (condition: string) => channel !== null && /^channels?\b/i.test(condition.trim());
        const conditions = journey.flow_rules.filter((rule) => rule.from_activity === each.number && rule.condition && !byChannel(rule.condition)).map((rule) => `${rule.kind === "loop" ? "Retry" : rule.kind === "parallel" ? "Alongside" : "If"} → ${rule.to_activity}: ${rule.condition}`);
        return [
          each.number,
          each.phase || "—",
          performing ? name(performing) : { text: "No system (gap)", due: true },
          [each.name, each.supporting_system_ids.length ? `Supported by ${each.supporting_system_ids.map(name).join(", ")}` : ""].filter(Boolean).join("\n"),
          unique(journey.edges.filter((edge) => edge.from_activity === each.number).map((edge) => edge.to_activity)).join(", ") || "—",
          lines(unique(journey.integrations.filter((link) => link.from_activity === each.number).map((link) => link.interface || link.interaction || `to ${link.to_activity}`))),
          lines(each.component_ids.map((partId) => components.get(partId) ?? partId)),
          lines(conditions),
          evidence(each),
        ];
      }),
      { landscape: true, small: true },
    );
  } else gap("No journey", `No journey is recorded for ${orderType.name}.`);

  /* 18 Traceability */
  h1("18. Traceability Matrix");
  p("Component to steps, systems and interfaces; then system to steps, hand-overs and interfaces, for this scenario.");
  table(
    columns(["Component", 24], ["Steps", 16], ["Systems", 26], ["Interfaces", 20], ["Confidence", 14]),
    parts.map(({ part, responsibilities }) => {
      const touching = steps.filter((each) => each.component_ids.includes(part.id));
      const systems = unique([...touching.map(by).filter((value): value is string => !!value), ...responsibilities.map((item) => item.system_id)]);
      const used = unique(links.filter((link) => touching.some((each) => each.number === link.from_activity)).map((link) => link.interface).filter((value): value is string => !!value));
      return [part.name, touching.map((each) => each.number).join(", ") || "—", systems.length ? systems.map(name).join(", ") : { text: "None (gap)", due: true }, lines(used), evidence(part)];
    }),
    { landscape: true },
  );
  table(
    columns(["System", 24], ["Steps performed", 30], ["Hand-overs in / out", 18], ["Interfaces", 28]),
    taking.map((item) => {
      const inbound = links.filter((link) => to(link) === item.systemId);
      const outbound = links.filter((link) => from(link) === item.systemId);
      return [name(item.systemId), item.performs.join(", ") || "—", `${inbound.length} / ${outbound.length}`, lines(unique([...inbound, ...outbound].map((link) => link.interface).filter((value): value is string => !!value)))];
    }),
    { landscape: true },
  );

  return {
    title,
    blocks,
    subject: [offering.id, orderType.code, channel?.id ?? "every channel"].join(" · "),
    keywords: [offering.name, orderType.name, channel?.name ?? "every channel"],
    meta: { systems: taking.map((item) => item.systemId), handOvers: links.length, interfaces, systemSections },
  };
}
