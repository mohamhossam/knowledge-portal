import { useId, useState } from "react";

import type { Channel, Journey, Offering, RelationshipKind, Release, Suggestion, SuggestionContent } from "../api/client";
import { finishedOffering, journeyProblem, lines, offeringProblem, slug } from "./editing";
import { AreaField, LinesField, SelectField, SystemField, TextField } from "./forms";
import { JourneyEditor } from "./JourneyEditor";
import { OfferingEditor } from "./OfferingEditor";
import type { Lexicon } from "./suggestions";

const HOW: { value: RelationshipKind; label: string }[] = [
  { value: "calls_api", label: "Calls its API" },
  { value: "publishes_events_to", label: "Sends it events" },
  { value: "transfers_data_to", label: "Sends it data" },
  { value: "orchestrates", label: "Orchestrates it" },
  { value: "unspecified", label: "Depends on it, not said how" },
];

/** The draft system a suggestion's name resolved to, or the name as the document wrote it. */
function startingSystem(release: Release, name: string | null, id: string): string {
  return (name && release.systems.find((system) => system.name === name)?.id) || id;
}

const emptyJourney = (name: string): Journey => ({
  id: slug(name), name, activities: [], flow_rules: [], integrations: [], edges: [],
});

/**
 * Edits a suggestion before it is accepted: every kind, offerings and journeys
 * whole. The edit keeps the kind; the service rejects anything else.
 */
export function SuggestionEditor({ suggestion, release, words, busy, onAccept, onCancel }: {
  suggestion: Suggestion;
  release: Release;
  words: Lexicon;
  busy: boolean;
  onAccept: (content: SuggestionContent) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const original = suggestion.content;
  const [content, setContent] = useState<SuggestionContent>(() => ({
    ...original,
    system_id: original.kind === "landscape_domain" || original.kind === "product" || original.kind === "journey" || original.kind === "channel"
      ? original.system_id
      : startingSystem(release, suggestion.system_name, original.system_id),
    target_system_id: original.target_system_id
      ? startingSystem(release, suggestion.target_system_name, original.target_system_id)
      : original.target_system_id,
  }));
  const set = (patch: Partial<SuggestionContent>) => setContent((current) => ({ ...current, ...patch }));
  const systems = release.systems;
  const system = systems.find((item) => item.id === content.system_id);
  const domains = release.landscape_domains ?? [];

  const finished = (): SuggestionContent => {
    const base = { ...content, aliases: lines(content.aliases), triggers: lines(content.triggers) };
    if (content.kind === "product" && content.product) {
      const product = finishedOffering(content.product);
      return { ...base, product, system_id: product.id, name: product.name };
    }
    if (content.kind === "journey" && content.journey) return { ...base, system_id: content.journey.id, name: content.journey.name };
    if (content.kind === "channel" && content.channel) return { ...base, name: content.channel.name };
    return base;
  };

  const problem = ((): string | null => {
    switch (content.kind) {
      case "system":
      case "component":
      case "landscape_domain":
        return content.name.trim() ? null : "Give it a name.";
      case "capability":
        if (!content.name.trim()) return "Give the capability a name.";
        return lines(content.triggers).length ? null : "Give at least one phrase that matches it.";
      case "constraint":
        return content.text.trim() ? null : "Say what the constraint is.";
      case "relationship":
        if (!content.target_system_id) return "Choose the system it depends on.";
        if (content.target_system_id === content.system_id) return "A system cannot depend on itself.";
        return content.text.trim() ? null : "Say what the dependency is for.";
      case "placement":
        return content.landscape_domain_id ? null : "Choose the landscape domain.";
      case "product":
        return content.product ? offeringProblem(content.product) : "The offering is missing.";
      case "journey":
        return content.journey ? journeyProblem(content.journey) : "The journey is missing.";
      case "channel":
        return content.channel?.name.trim() ? null : "Give the channel a name.";
    }
  })();

  const writtenAs = words.system(original.system_id);
  const fields = (() => {
    switch (content.kind) {
      case "system":
        return (
          <>
            <SystemField
              label="It is"
              value={content.system_id}
              systems={systems}
              writtenAs={`A new system: ${content.name || writtenAs}`}
              onChange={(system_id) => set({ system_id })}
            />
            <TextField label="Name" value={content.name} required onChange={(name) => set({ name })} />
            <TextField label="Arabic name" value={content.name_ar} dir="rtl" onChange={(name_ar) => set({ name_ar: name_ar || null })} />
            <LinesField label="Also called" value={content.aliases} onChange={(aliases) => set({ aliases })} />
            <AreaField label="What it is" value={content.description} onChange={(description) => set({ description: description || null })} />
          </>
        );
      case "component":
        return (
          <>
            <SystemField label="Part of" value={content.system_id} systems={systems} writtenAs={writtenAs} onChange={(system_id) => set({ system_id })} />
            <TextField label="Name" value={content.name} required onChange={(name) => set({ name })} />
            <TextField label="Arabic name" value={content.name_ar} dir="rtl" onChange={(name_ar) => set({ name_ar: name_ar || null })} />
            <TextField label="Built with" value={content.technology} onChange={(technology) => set({ technology: technology || null })} />
            <LinesField label="Also called" value={content.aliases} onChange={(aliases) => set({ aliases })} />
            <AreaField label="What it does" value={content.description} onChange={(description) => set({ description: description || null })} />
          </>
        );
      case "capability": {
        const written = original.component_id && !system?.components.some((item) => item.id === original.component_id)
          ? [{ value: original.component_id, label: `${words.component(original.system_id, original.component_id)} (not in the draft yet)` }]
          : [];
        return (
          <>
            <SystemField label="Of the system" value={content.system_id} systems={systems} writtenAs={writtenAs} onChange={(system_id) => set({ system_id })} />
            <TextField label="Capability" value={content.name} required onChange={(name) => set({ name })} />
            <SelectField
              label="Delivered by the component"
              value={content.component_id ?? ""}
              options={[
                { value: "", label: "No component named" },
                ...written,
                ...(system?.components ?? []).map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(component_id) => set({ component_id: component_id || null })}
            />
            <LinesField
              label="Matched by"
              value={content.triggers}
              required
              hint="One phrase per line. Requirement work maps a requirement here when it uses one."
              onChange={(triggers) => set({ triggers })}
            />
          </>
        );
      }
      case "constraint":
        return (
          <>
            <SystemField label="Of the system" value={content.system_id} systems={systems} writtenAs={writtenAs} onChange={(system_id) => set({ system_id })} />
            <AreaField label="Constraint" value={content.text} required onChange={(text) => set({ text })} />
          </>
        );
      case "relationship":
        return (
          <>
            <SystemField label="The system that depends" value={content.system_id} systems={systems} writtenAs={writtenAs} onChange={(system_id) => set({ system_id })} />
            <SystemField
              label="Depends on"
              value={content.target_system_id ?? ""}
              systems={systems}
              writtenAs={words.system(original.target_system_id ?? "")}
              onChange={(target_system_id) => set({ target_system_id })}
            />
            <SelectField
              label="How"
              value={content.relationship_kind ?? "unspecified"}
              options={HOW}
              onChange={(kind) => set({ relationship_kind: kind as RelationshipKind })}
            />
            <AreaField label="For what" value={content.text} required onChange={(text) => set({ text })} />
          </>
        );
      case "landscape_domain":
        return (
          <>
            <TextField label="Name" value={content.name} required onChange={(name) => set({ name })} />
            <TextField label="Arabic name" value={content.name_ar} dir="rtl" onChange={(name_ar) => set({ name_ar: name_ar || null })} />
            <SelectField
              label="Inside"
              value={content.parent_domain_id ?? ""}
              options={[
                { value: "", label: "At the top of the landscape" },
                ...(original.parent_domain_id && !domains.some((item) => item.id === original.parent_domain_id)
                  ? [{ value: original.parent_domain_id, label: `${words.domain(original.parent_domain_id)} (not in the draft yet)` }]
                  : []),
                ...domains.filter((item) => item.id !== content.system_id).map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(parent) => set({ parent_domain_id: parent || null })}
            />
            <AreaField label="What it covers" value={content.description} onChange={(description) => set({ description: description || null })} />
          </>
        );
      case "placement":
        return (
          <>
            <SystemField label="The system" value={content.system_id} systems={systems} writtenAs={writtenAs} onChange={(system_id) => set({ system_id })} />
            <SelectField
              label="Sits in"
              value={content.landscape_domain_id ?? ""}
              options={[
                ...(original.landscape_domain_id && !domains.some((item) => item.id === original.landscape_domain_id)
                  ? [{ value: original.landscape_domain_id, label: `${words.domain(original.landscape_domain_id)} (not in the draft yet)` }]
                  : []),
                ...domains.map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(landscape_domain_id) => set({ landscape_domain_id })}
            />
          </>
        );
      case "product":
        return content.product ? (
          <OfferingEditor
            value={content.product}
            systems={systems}
            channels={release.channels ?? []}
            register={release.sources ?? []}
            names={words}
            onChange={(product: Offering) => set({ product })}
          />
        ) : null;
      case "channel": {
        const channel = content.channel ?? { id: content.system_id, name: content.name };
        const change = (patch: Partial<Channel>) => set({ channel: { ...channel, ...patch } });
        return (
          <>
            <TextField label="Name" value={channel.name} required onChange={(name) => change({ name })} />
            <TextField label="Kind" value={channel.kind} onChange={(kind) => change({ kind: kind || null })} />
            <SystemField
              label="Orders enter through"
              value={channel.entry_system_id ?? ""}
              systems={systems}
              writtenAs={channel.entry_system_id ? words.system(channel.entry_system_id) : undefined}
              allowNone
              onChange={(entry) => change({ entry_system_id: entry || null })}
            />
            <AreaField label="What it is" value={channel.description} onChange={(description) => change({ description: description || null })} />
          </>
        );
      }
      case "journey":
        return (
          <JourneyEditor
            value={content.journey ?? emptyJourney(content.name)}
            systems={systems}
            offerings={release.products ?? []}
            channels={release.channels ?? []}
            names={words}
            onChange={(journey) => set({ journey })}
          />
        );
    }
  })();

  const whole = content.kind === "product" || content.kind === "journey";
  return (
    <form
      className="suggestion-editor"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem) onAccept(finished());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <h3 id={`${id}-title`} className="suggestion-detail__label">Edit, then accept</h3>
      {whole ? fields : <div className="form__grid">{fields}</div>}
      <p className="suggestion-editor__actions">
        <button type="submit" className="action-button" disabled={!!problem || busy} aria-describedby={problem ? `${id}-why` : undefined}>
          {busy ? "Accepting…" : "Accept as edited"}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>Stop editing</button>
      </p>
      {problem && <p id={`${id}-why`} className="suggestion-editor__why">{problem}</p>}
    </form>
  );
}
