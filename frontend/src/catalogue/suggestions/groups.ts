/** The galley's groups: a suggestion listed under its system or its section. */
import type { CatalogueSystem, Release, Suggestion } from "../../api/client";
import type { Lexicon } from "./lexicon";
import { KIND_ORDER } from "./state";

export type SuggestionGroup = {
  key: string;
  /** A system the draft does not have yet, which these suggestions would add. */
  isNew: boolean;
  label: string;
  /** The draft system's id, when it has one, for a link to its sheet. */
  systemId?: string;
  suggestions: Suggestion[];
};

const SECTION = {
  sources: "Sources",
  conflicts: "Conflicts between sources",
  areas: "Business areas",
  realisations: "Realisations",
  portfolio: "Portfolio",
  domains: "Landscape domains",
  interfaces: "Interfaces",
  channels: "Channels",
  offerings: "Offerings",
  questions: "Questions for offerings",
  journeys: "Journeys",
  vocabulary: "Vocabulary terms",
} as const;

/** The galley's groups: new systems first, then the systems the draft has, then domains, offerings and journeys. */
export function suggestionGroups(release: Release, suggestions: Suggestion[], words: Lexicon): SuggestionGroup[] {
  const byName = new Map<string, CatalogueSystem>(release.systems.map((system) => [system.name, system]));
  const groups = new Map<string, SuggestionGroup>();
  for (const suggestion of suggestions) {
    const { content } = suggestion;
    let key: string;
    let group: Omit<SuggestionGroup, "suggestions">;
    if (content.kind === "capability_domain") {
      key = "section:areas";
      group = { key, isNew: false, label: SECTION.areas };
    } else if (content.kind === "source") {
      key = "section:sources";
      group = { key, isNew: false, label: SECTION.sources };
    } else if (content.kind === "conflict") {
      key = "section:conflicts";
      group = { key, isNew: false, label: SECTION.conflicts };
    } else if (content.kind === "realisation_record") {
      key = "section:realisations";
      group = { key, isNew: false, label: SECTION.realisations };
    } else if (content.kind === "portfolio_node") {
      key = "section:portfolio";
      group = { key, isNew: false, label: SECTION.portfolio };
    } else if (content.kind === "landscape_domain") {
      key = "section:domains";
      group = { key, isNew: false, label: SECTION.domains };
    } else if (content.kind === "interface") {
      key = "section:interfaces";
      group = { key, isNew: false, label: SECTION.interfaces };
    } else if (content.kind === "channel") {
      key = "section:channels";
      group = { key, isNew: false, label: SECTION.channels };
    } else if (content.kind === "product" || content.kind === "offering_rule") {
      key = "section:offerings";
      group = { key, isNew: false, label: SECTION.offerings };
    } else if (content.kind === "question") {
      key = "section:questions";
      group = { key, isNew: false, label: SECTION.questions };
    } else if (content.kind === "journey") {
      key = "section:journeys";
      group = { key, isNew: false, label: SECTION.journeys };
    } else if (content.kind === "vocabulary_term") {
      key = "section:vocabulary";
      group = { key, isNew: false, label: SECTION.vocabulary };
    } else {
      // Keyed by the system's name, so a new system keeps its group once accepted into the draft.
      const label = suggestion.system_name ?? words.system(content.system_id);
      key = `system:${label.toLocaleLowerCase()}`;
      group = { key, isNew: !suggestion.system_name, label, systemId: byName.get(label)?.id };
    }
    const existing = groups.get(key);
    if (existing) {
      existing.suggestions.push(suggestion);
      // A group is new while any of its suggestions names a system the draft does not have.
      if (!suggestion.system_name && !group.key.startsWith("section:")) existing.isNew = existing.isNew || group.isNew;
      if (group.systemId) existing.systemId = group.systemId;
    } else groups.set(key, { ...group, suggestions: [suggestion] });
  }
  for (const group of groups.values()) {
    if (group.systemId && group.suggestions.every((item) => item.system_name)) group.isNew = false;
  }
  const rank = (group: SuggestionGroup) =>
    group.key.startsWith("section:") ? 2 + Object.keys(SECTION).indexOf(group.key.slice(8)) : group.isNew ? 0 : 1;
  const sorted = [...groups.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
  );
  for (const group of sorted) group.suggestions.sort(bySuggestionOrder);
  return sorted;
}

function bySuggestionOrder(a: Suggestion, b: Suggestion): number {
  return KIND_ORDER.indexOf(a.content.kind) - KIND_ORDER.indexOf(b.content.kind)
    || (a.content.name || a.content.text).localeCompare(b.content.name || b.content.text, "en", { sensitivity: "base" })
    || a.id.localeCompare(b.id);
}
