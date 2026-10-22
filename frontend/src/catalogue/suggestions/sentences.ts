/** A suggestion, and why it needs a person, said as sentences in the documents' names. */
import type { Offering, RelationshipKind, Suggestion } from "../../api/client";
import { COVERAGE, LAYERS } from "../catalogue";
import type { Lexicon } from "./lexicon";
import { draftedForRequirement, fromCatalogue } from "./state";

const VERB: Record<RelationshipKind, string> = {
  calls_api: "Calls the API of",
  publishes_events_to: "Sends events to",
  transfers_data_to: "Sends data to",
  orchestrates: "Orchestrates",
  unspecified: "Depends on",
};

const quoted = (items: string[]) => items.map((item) => `“${item}”`).join(", ");
/** "A", "A and B", "A, B and C". */
export const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] ?? "");
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const realisedParts = (product: Offering) => product.components.filter((part) => (part.realisation ?? []).length > 0).length;

/** What a suggested offering holds beyond its parts and order types (ADR-0101, step 4), so a reviewer sees it. */
function details(product: Offering | null | undefined): string[] {
  if (!product) return [];
  return [
    realisedParts(product) ? `realisation for ${count(realisedParts(product), "part")}` : "",
    product.nfrs?.length ? count(product.nfrs.length, "NFR") : "",
    product.tracking ? "order tracking" : "",
    product.lifecycle_notes?.length ? count(product.lifecycle_notes.length, "lifecycle note") : "",
    product.plans?.length ? count(product.plans.length, "plan") : "",
  ].filter(Boolean);
}

/** The change a suggestion would make, said as a sentence about its system. */
export function changeSentence(suggestion: Suggestion, words: Lexicon): string {
  const { content } = suggestion;
  const replaces = suggestion.match === "updates_existing";
  switch (content.kind) {
    case "system": {
      const others = content.aliases.length ? `, also called ${content.aliases.join(", ")}` : "";
      return replaces && suggestion.system_name
        ? `Adds what the document calls it: ${[content.name, ...content.aliases].join(", ")}`
        : `Adds the system ${content.name}${others}`;
    }
    case "component":
      return `Adds the component ${content.name}${content.technology ? `, built with ${content.technology}` : ""}`;
    case "capability": {
      const within = content.component_id ? `, in ${words.component(content.system_id, content.component_id)}` : "";
      const concept = content.concept_ids?.[0];
      const realises = concept ? `, realising the concept ${concept}` : "";
      return `Adds the capability ${content.name}${within}${realises}, matched by ${quoted(content.triggers)}`;
    }
    case "constraint":
      return `Adds the constraint “${content.text}”`;
    case "offering_rule":
      return `Adds the rule “${content.text}” to the offering ${words.offering(content.system_id)}`;
    case "relationship":
      return `${VERB[content.relationship_kind ?? "unspecified"]} ${targetName(suggestion, words)}`;
    case "placement":
      return `Places it in ${words.domain(content.landscape_domain_id ?? "")}`;
    case "landscape_domain":
      return `Adds the landscape domain ${content.name}${content.parent_domain_id ? `, inside ${words.domain(content.parent_domain_id)}` : ""}`;
    case "capability_domain": {
      const parent = content.capability_domain?.parent_id;
      const inside = parent ? `, inside ${words.area(parent)}` : "";
      return replaces ? `Adds what the document says about the business area ${content.name}` : `Adds the business area ${content.name}${inside}`;
    }
    case "source": {
      const source = content.knowledge_source;
      const cited = source?.short ? ` (${source.short})` : "";
      const level = source ? `, level ${source.level}` : "";
      return replaces
        ? `Adds what the document says about the source ${content.name}${cited}`
        : `Registers the source ${content.name}${cited}${level}`;
    }
    case "conflict": {
      const conflict = content.conflict;
      if (!conflict) return `Records the conflict ${content.name}`;
      const sides = `${words.source(conflict.a.source_id)} says “${conflict.a.statement}”; ${words.source(conflict.b.source_id)} says “${conflict.b.statement}”`;
      return replaces ? `Adds to the conflict ${content.name}: ${sides}` : `Records the conflict ${content.name}: ${sides}`;
    }
    case "realisation_record": {
      const record = content.realisation;
      const layer = record ? LAYER[record.layer] : "realisation record";
      const delivered = (record?.system_ids ?? []).map(words.system);
      const below = (record?.realised_by ?? []).map(words.realisation);
      const by = delivered.length ? `, ${record?.layer === "resource" ? "held" : "delivered"} by ${listed(delivered)}` : "";
      const realised = below.length ? `, realised by ${listed(below)}` : "";
      return replaces
        ? `Adds what the document says about the ${layer} ${content.name}`
        : `Adds the ${layer} ${content.name}${by}${realised}`;
    }
    case "portfolio_node": {
      const node = content.portfolio_node;
      const level = node?.level ? ` (${node.level})` : "";
      const under = node?.parent_id ? `, under ${words.portfolio(node.parent_id)}` : "";
      return replaces
        ? `Adds what the document says about ${content.name} in the portfolio`
        : `Adds ${content.name}${level} to the portfolio${under}`;
    }
    case "product": {
      const held = listed(details(content.product));
      if (replaces) return `Replaces the offering ${content.name} with the document's version${held ? `, which includes ${held}` : ""}`;
      return `Adds the offering ${content.name}${held ? `, with ${held}` : ""}`;
    }
    case "journey":
      return replaces
        ? `Replaces the journey ${content.journey?.name ?? content.name} with the document's`
        : `Adds the journey ${content.journey?.name ?? content.name}`;
    case "question": {
      const orders = (content.question?.order_types ?? []).map((code) => words.orderType(content.system_id, code));
      const of = `${words.offering(content.system_id)}${orders.length ? ` (${orders.join(", ")})` : ""}`;
      return replaces
        ? `Rewords the question it asks of ${of}: ${content.question?.text ?? ""}`
        : `Asks of ${of}: ${content.question?.text ?? ""}`;
    }
    case "interface": {
      const consumers = (content.interface?.consumer_ids ?? []).map(words.system);
      const of = content.interface ? ` of ${words.system(content.interface.system_id)}` : "";
      const used = consumers.length ? `, consumed by ${consumers.join(", ")}` : "";
      return replaces
        ? `Adds what the document says about the interface ${content.name}${of}${used}`
        : `Adds the interface ${content.name}${of}${used}`;
    }
    case "channel": {
      const entry = content.channel?.entry_system_id;
      const through = entry ? `, its orders entering through ${words.system(entry)}` : "";
      return replaces
        ? `Adds what the document says about the channel ${content.name}${through}`
        : `Adds the channel ${content.name}${through}`;
    }
    case "concept": {
      const label = content.concept?.pref_label ?? content.system_id;
      const covered = content.capability_refs.length;
      const linking = covered ? `, linking ${covered === 1 ? "1 capability" : `${covered} capabilities`}` : "";
      return replaces ? `Adds to the capability concept ${label}${linking}` : `Adds the capability concept ${label}${linking}`;
    }
    case "component_link":
      return `Links ${words.offering(content.system_id)} › ${content.component_id ?? ""} to ${listed(content.concept_ids)}`;
    case "vocabulary_term": {
      const term = content.term;
      const scheme = term ? words.vocabulary(term.scheme) : "term";
      const label = term ? `${term.pref_label}${term.notation ? ` (${term.notation})` : ""}` : content.system_id;
      const covered = content.value_refs.length;
      const values = covered === 1 ? "1 value" : `${covered} values`;
      if (replaces) return `Links ${values} to the ${scheme} ${label}`;
      return `Adds the ${scheme} ${label}${covered ? `, linking ${values}` : ""}`;
    }
  }
}

/** What each realisation layer is called in a sentence. */
const LAYER: Record<NonNullable<Suggestion["content"]["realisation"]>["layer"], string> = {
  cfs: "CFS",
  rfs: "RFS",
  resource: "resource",
};

/** Kinds whose sentence is said about a system ("Sends data to RTF"), which a list shows it under. */
const ABOUT_A_SYSTEM = new Set(["relationship", "capability", "component", "constraint", "placement"]);

/**
 * The change as a sentence that stands on its own, naming the system it is about: a
 * question asked one at a time has no system heading above it, so "Sends data to RTF"
 * alone did not say which of fourteen systems sends it.
 */
export function standaloneSentence(suggestion: Suggestion, words: Lexicon): string {
  const sentence = changeSentence(suggestion, words);
  const { content } = suggestion;
  if (!ABOUT_A_SYSTEM.has(content.kind)) return sentence;
  const subject = suggestion.system_name ?? words.system(content.system_id);
  return content.kind === "relationship"
    ? `${subject} ${sentence.charAt(0).toLocaleLowerCase()}${sentence.slice(1)}`
    : `${subject}: ${sentence}`;
}

function targetName(suggestion: Suggestion, words: Lexicon): string {
  return suggestion.target_system_name ?? words.system(suggestion.content.target_system_id ?? "");
}

/**
 * What a suggested offering holds beyond its parts and order types, one line each, so a
 * reviewer can check it against the document without opening the editor.
 */
export function offeringHolds(product: Offering | null | undefined, words: Lexicon): { label: string; text: string; due?: boolean }[] {
  if (!product) return [];
  const order = (code: string) => product.order_types.find((item) => item.code === code)?.name ?? code;
  const lines: { label: string; text: string; due?: boolean }[] = [];
  const realised = product.components.filter((part) => (part.realisation ?? []).length > 0);
  if (realised.length) {
    const layers = (part: Offering["components"][number]) =>
      [...new Set((part.realisation ?? []).map((item) => LAYERS.find((layer) => layer.layer === item.layer)?.short ?? item.layer))].join(", ");
    lines.push({ label: "Realised as", text: realised.map((part) => `${part.name} (${layers(part)})`).join("; ") });
  }
  if (product.nfrs?.length) {
    lines.push({ label: "NFRs", text: product.nfrs.map((item) => `${item.quality} (${COVERAGE[item.coverage].toLocaleLowerCase()})`).join("; ") });
  }
  const tracking = product.tracking;
  if (tracking) {
    const scope = tracking.order_types.length ? ` for ${tracking.order_types.map(order).join(", ")}` : "";
    const parts = [
      tracking.channels.length ? `Channels ${tracking.channels.map((item) => words.channel(item.channel_id)).join(", ")}` : "",
      tracking.flows.length ? count(tracking.flows.length, "flow") : "",
      tracking.milestones.length ? count(tracking.milestones.length, "milestone") : "",
      tracking.statuses.length ? count(tracking.statuses.length, "internal status").replace(/statuss$/, "statuses") : "",
      tracking.fallout.length ? count(tracking.fallout.length, "fallout case") : "",
    ].filter(Boolean);
    lines.push({ label: `Order tracking${scope}`, text: parts.join("; ") || "Its scope only" });
  }
  if (product.plans?.length) {
    // A plan's stated facts beside its name: "PO1 (Offer Description Unlimited 100Mbps, IN Offer ID 860)".
    const plan = (item: Offering["plans"][number]) =>
      item.characteristics.length ? `${item.name} (${item.characteristics.map((fact) => `${fact.name} ${fact.value}`).join(", ")})` : item.name;
    lines.push({ label: "Plans", text: product.plans.map(plan).join("; ") });
  }
  if (product.lifecycle_notes?.length) {
    lines.push({ label: "Lifecycle notes", text: product.lifecycle_notes.map((note) => note.title).join("; ") });
    const carried = product.lifecycle_notes.filter((note) => note.blocks.some((block) => block.to_verify));
    if (carried.length) {
      lines.push({ label: "To re-verify", text: `${carried.map((note) => note.title).join("; ")} carries over content from another source`, due: true });
    }
  }
  return lines;
}

/** Why a person must decide, in words. */
export function decideWhy(suggestion: Suggestion): string {
  if (suggestion.possible_matches.length) {
    const names = suggestion.possible_matches.map((item) => item.written_as);
    return `“${[...new Set(names)].join("”, “")}” may be a system the draft already has`;
  }
  if (suggestion.basis === "inferred") return fromCatalogue(suggestion) ? "Inferred from the draft's catalogue" : "Inferred, not stated in the document";
  if (draftedForRequirement(suggestion) && suggestion.match !== "updates_existing") {
    return "Drafted for a new offering: review what it holds";
  }
  return "Would replace what the draft has";
}

/** A dependency error quotes raw ids; say them as the names the documents gave. */
export function inWords(message: string, words: Lexicon): string {
  return message
    .replace(/system '([^']+)'/g, (_, id: string) => `the system ${words.system(id)}`)
    .replace(/landscape domain '([^']+)'/g, (_, id: string) => `the landscape domain ${words.domain(id)}`)
    .replace(/component '([^']+)'/g, (_, id: string) => `the component ${id.replace(/[-_]+/g, " ")}`)
    .replace(/product offering '([^']+)'/g, (_, id: string) => `the offering ${words.offering(id)}`)
    .replace(/channel '([^']+)'/g, (_, id: string) => `the channel ${words.channel(id)}`)
    .replace(/interface '([^']+)'/g, (_, id: string) => `the interface ${id}`)
    .replace(/realisation record '([^']+)'/g, (_, id: string) => words.realisation(id))
    .replace(/\bsource '([^']+)'/g, (_, id: string) => `the source ${words.source(id)}`)
    .replace(/capability domain '([^']+)'/g, (_, id: string) => `the business area ${words.area(id)}`)
    .replace(/portfolio node '([^']+)'/g, (_, id: string) => `${words.portfolio(id)} in the portfolio`);
}
