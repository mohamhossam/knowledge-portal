/** Waiting suggestions in words: what each waits for, and whether that is one thing or several. */
import type { Suggestion } from "../../api/client";
import { channelsNamed, stillMissing, systemsNamed } from "./dependencies";
import type { Lexicon } from "./lexicon";
import { listed } from "./sentences";

/** What a waiting suggestion waits for, in words. */
export function waitsFor(suggestion: Suggestion, words: Lexicon): string {
  const { content } = suggestion;
  switch (suggestion.match) {
    case "needs_system": {
      if (content.kind === "channel") return `Waits for the system ${words.system(content.channel?.entry_system_id ?? "")}`;
      if (content.kind === "interface" || content.kind === "realisation_record") {
        const named = (suggestion.missing_systems ?? []).map(words.system);
        return `Waits for the ${named.length === 1 ? "system" : "systems"} ${few(named)}`;
      }
      const missing = !suggestion.system_name && content.kind !== "product" && content.kind !== "journey"
        ? content.system_id
        : content.target_system_id ?? content.system_id;
      if (content.kind === "product" || content.kind === "journey") {
        const { systems, channels } = awaited(suggestion, words);
        const parts = [
          systems.length ? `the ${systems.length === 1 ? "system" : "systems"} ${few(systems)}` : "",
          channels.length ? `the ${channels.length === 1 ? "channel" : "channels"} ${few(channels)}` : "",
        ].filter(Boolean);
        return parts.length ? `Waits for ${parts.join(", and ")}` : "Waits for the systems it names";
      }
      return `Waits for the system ${words.system(missing)}`;
    }
    case "needs_component":
      return content.kind === "journey"
        ? "Waits for the offering's parts it names"
        : `Waits for the component ${words.component(content.system_id, content.component_id ?? "")}`;
    case "needs_domain":
      if (content.kind === "capability_domain") return `Waits for the business area ${words.area(content.capability_domain?.parent_id ?? "")}`;
      return `Waits for the landscape domain ${words.domain(content.landscape_domain_id ?? content.parent_domain_id ?? "")}`;
    case "needs_portfolio_node":
      return `Waits for ${words.portfolio(content.portfolio_node?.parent_id ?? "")} in the portfolio`;
    case "needs_source": {
      const cited = content.conflict ? [content.conflict.a.source_id, content.conflict.b.source_id].map(words.source) : [];
      return `Waits for the sources ${listed([...new Set(cited)])}`;
    }
    case "needs_realisation": {
      if (content.kind === "specification_rule") return `Waits for the CFSS or RFSS ${words.realisation(content.system_id)}`;
      const below = (content.realisation?.realised_by ?? []).map(words.realisation);
      return `Waits for ${listed(below)}, which ${below.length === 1 ? "realises" : "realise"} it`;
    }
    case "needs_offering":
      if (content.kind === "offering_rule") return `Waits for the offering ${words.offering(content.system_id)}`;
      if (content.kind === "question") {
        const missing = (content.question?.order_types ?? []).filter((code) => words.orderType(content.system_id, code) === code);
        return words.hasOffering(content.system_id) && missing.length
          ? `Waits for ${words.offering(content.system_id)}’s order type ${missing.join(", ")}`
          : `Waits for the offering ${words.offering(content.system_id)}`;
      }
      if (content.kind === "conflict") {
        const affected = (content.conflict?.scope ?? []).map((item) => words.offering(item.product_id));
        return `Waits for the ${affected.length === 1 ? "offering" : "offerings"} ${listed(affected)} it affects`;
      }
      if (content.journey?.product_id && content.journey.order_type_code && words.hasOffering(content.journey.product_id)) {
        return `Waits for ${words.offering(content.journey.product_id)}’s order type ${content.journey.order_type_code}`;
      }
      return `Waits for the offering ${words.offering(content.journey?.product_id ?? "")}`;
    case "needs_channel": {
      const named = [...new Set(channelsNamed(suggestion).map(words.channel))];
      return `Waits for the ${named.length === 1 ? "channel" : "channels"} ${named.join(", ")}`;
    }
    case "needs_interface": {
      const relays = content.interface?.relays ?? [];
      return `Waits for the ${relays.length === 1 ? "interface" : "interfaces"} it relays: ${relays.join(", ")}`;
    }
    default:
      return "";
  }
}

/** At most four names, then how many more: a waits line stays a line. */
const few = (names: string[]) => (names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", "));

/** The systems and channels an offering or journey names that the draft lacks, in the documents' names. */
function awaited(suggestion: Suggestion, words: Lexicon): { systems: string[]; channels: string[] } {
  const systems = [...new Set(systemsNamed(suggestion))].filter((id) => stillMissing(suggestion, id, words)).map(words.system);
  const channels = [...new Set(channelsNamed(suggestion))].filter((id) => !words.inDraft(`channel:${id}`)).map(words.channel);
  return { systems: [...new Set(systems)], channels: [...new Set(channels)] };
}

/** Whether a waiting suggestion waits for more than one thing, so its line says "those". */
export function waitsForMany(suggestion: Suggestion, words: Lexicon): boolean {
  const { content } = suggestion;
  if (suggestion.match === "needs_channel") return new Set(channelsNamed(suggestion)).size > 1;
  if (suggestion.match !== "needs_system" || (content.kind !== "product" && content.kind !== "journey")) return false;
  const { systems, channels } = awaited(suggestion, words);
  return systems.length + channels.length !== 1;
}
