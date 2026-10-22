import { useEffect, useId, useRef, useState } from "react";

import type { Channel, Journey, Offering, RelationshipKind, Release, Suggestion, SuggestionContent } from "../api/client";
import { ActionGroup, Button } from "../design/components";
import { finishedOffering, journeyProblem, lines, offeringProblem, slug } from "./editing";
import { AreaField, LinesField, SelectField, SystemField, TextField } from "./forms";
import { JourneyEditor } from "./JourneyEditor";
import { OfferingEditor, QuestionFields } from "./OfferingEditor";
import type { Lexicon } from "./suggestions";

type Contract = NonNullable<SuggestionContent["interface"]>;
type Area = NonNullable<SuggestionContent["capability_domain"]>;
type PortfolioPlace = NonNullable<SuggestionContent["portfolio_node"]>;
type Realised = NonNullable<SuggestionContent["realisation"]>;
type Source = NonNullable<SuggestionContent["knowledge_source"]>;
type Conflict = NonNullable<SuggestionContent["conflict"]>;

/** A tree's parents to choose from, with one the document named that the draft lacks, as written. */
function parentOptions(nodes: { id: string; name: string }[], self: string, current: string | null | undefined) {
  const options = [
    { value: "", label: "At the top" },
    ...nodes.filter((node) => node.id !== self).map((node) => ({ value: node.id, label: node.name })),
  ];
  return current && !nodes.some((node) => node.id === current) ? [...options, { value: current, label: `${current} (as the document names it)` }] : options;
}

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
  id: slug(name), name, activities: [], flow_rules: [], integrations: [], edges: [], channel_edges: [], shared_edges: [], accepted: [], former_ids: [],
});

/**
 * Edits a suggestion before it is accepted: every kind, offerings and journeys
 * whole. The edit keeps the kind; the service rejects anything else. It opens
 * with focus on its title, starts from the edits kept earlier, and reports each
 * change so stopping never loses them.
 */
export function SuggestionEditor({ suggestion, release, words, busy, kept, onChange, onAccept, onCancel }: {
  suggestion: Suggestion;
  release: Release;
  words: Lexicon;
  busy: boolean;
  kept?: SuggestionContent;
  onChange: (content: SuggestionContent) => void;
  onAccept: (content: SuggestionContent) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const original = suggestion.content;
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const [content, setContent] = useState<SuggestionContent>(() => kept ?? ({
    ...original,
    system_id: original.kind === "landscape_domain" || original.kind === "product" || original.kind === "journey" || original.kind === "channel" || original.kind === "interface" || original.kind === "capability_domain" || original.kind === "portfolio_node" || original.kind === "realisation_record" || original.kind === "source" || original.kind === "conflict" || original.kind === "offering_rule"
      ? original.system_id
      : startingSystem(release, suggestion.system_name, original.system_id),
    target_system_id: original.target_system_id
      ? startingSystem(release, suggestion.target_system_name, original.target_system_id)
      : original.target_system_id,
  }));
  const touched = useRef(false);
  const set = (patch: Partial<SuggestionContent>) => {
    touched.current = true;
    setContent((current) => ({ ...current, ...patch }));
  };
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  });
  useEffect(() => {
    if (touched.current) report.current(content);
  }, [content]);
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
    if (content.kind === "interface" && content.interface) return { ...base, name: content.interface.name };
    if (content.kind === "capability_domain" && content.capability_domain) return { ...base, name: content.capability_domain.name };
    if (content.kind === "portfolio_node" && content.portfolio_node) return { ...base, name: content.portfolio_node.name };
    if (content.kind === "realisation_record" && content.realisation) return { ...base, name: content.realisation.name };
    if (content.kind === "source" && content.knowledge_source) return { ...base, name: content.knowledge_source.title };
    if (content.kind === "conflict" && content.conflict) return { ...base, name: content.conflict.title };
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
      case "offering_rule":
        return content.text.trim() ? null : "Say what the rule is.";
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
      case "interface":
        if (!content.interface?.name.trim()) return "Give the interface a name.";
        return content.interface.system_id ? null : "Choose the system that exposes it.";
      case "capability_domain":
        return content.capability_domain?.name.trim() ? null : "Give the business area a name.";
      case "portfolio_node":
        if (!content.portfolio_node?.name.trim()) return "Give it a name.";
        return content.portfolio_node.level.trim() ? null : "Say what level of the portfolio it is.";
      case "realisation_record":
        return content.realisation?.name.trim() ? null : "Give it a name.";
      case "source":
        return content.knowledge_source?.title.trim() ? null : "Give the source its title.";
      case "conflict":
        return content.conflict?.title.trim() ? null : "Give the conflict a title.";
      case "question":
        if (!content.system_id.trim()) return "Choose the offering it asks.";
        return content.question?.text.trim() ? null : "Say what it asks.";
      case "concept":
        return content.concept?.pref_label.trim() ? null : "Give the concept a label.";
      case "component_link":
        return content.concept_ids.length ? null : "Choose at least one concept.";
      case "vocabulary_term":
        return content.term?.pref_label.trim() ? null : "Give the term a label.";
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
            <TextField label="Arabic name" value={content.name_ar} dir="rtl" lang="ar" onChange={(name_ar) => set({ name_ar: name_ar || null })} />
            <LinesField label="Also called" value={content.aliases} onChange={(aliases) => set({ aliases })} />
            <AreaField label="What it is" value={content.description} onChange={(description) => set({ description: description || null })} />
          </>
        );
      case "component":
        return (
          <>
            <SystemField label="Part of" value={content.system_id} systems={systems} writtenAs={writtenAs} onChange={(system_id) => set({ system_id })} />
            <TextField label="Name" value={content.name} required onChange={(name) => set({ name })} />
            <TextField label="Arabic name" value={content.name_ar} dir="rtl" lang="ar" onChange={(name_ar) => set({ name_ar: name_ar || null })} />
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
      case "offering_rule": {
        const offerings = release.products ?? [];
        const chosen = offerings.find((item) => item.id === content.system_id);
        return (
          <>
            <SelectField
              label="Of the offering"
              value={content.system_id}
              wide
              options={[
                ...(!chosen && original.system_id
                  ? [{ value: original.system_id, label: `${words.offering(original.system_id)} (not in the draft yet)` }]
                  : []),
                ...offerings.map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(system_id) => set({ system_id })}
            />
            <AreaField label="Rule" value={content.text} required onChange={(text) => set({ text })} />
          </>
        );
      }
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
            <TextField label="Arabic name" value={content.name_ar} dir="rtl" lang="ar" onChange={(name_ar) => set({ name_ar: name_ar || null })} />
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
        const channel: Channel = content.channel ?? { id: content.system_id, name: content.name, accepted: [] };
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
      case "capability_domain": {
        const area = content.capability_domain;
        if (!area) return null;
        const change = (patch: Partial<Area>) => set({ capability_domain: { ...area, ...patch } });
        return (
          <>
            <TextField label="Name" value={area.name} required onChange={(name) => change({ name })} />
            <SelectField
              label="Inside"
              value={area.parent_id ?? ""}
              options={parentOptions(release.capability_domains ?? [], area.id, area.parent_id)}
              onChange={(parent) => change({ parent_id: parent || null })}
            />
            <AreaField label="What it covers" value={area.description} onChange={(description) => change({ description: description || null })} />
          </>
        );
      }
      case "portfolio_node": {
        const place = content.portfolio_node;
        if (!place) return null;
        const change = (patch: Partial<PortfolioPlace>) => set({ portfolio_node: { ...place, ...patch } });
        return (
          <>
            <TextField label="Name" value={place.name} required onChange={(name) => change({ name })} />
            <TextField label="Level" value={place.level} required hint="In the business's own words, such as Segment." onChange={(level) => change({ level })} />
            <SelectField
              label="Under"
              value={place.parent_id ?? ""}
              options={parentOptions(release.portfolio ?? [], place.id, place.parent_id)}
              onChange={(parent) => change({ parent_id: parent || null })}
            />
            <AreaField label="What it is" value={place.description} onChange={(description) => change({ description: description || null })} />
          </>
        );
      }
      case "source": {
        const source = content.knowledge_source;
        if (!source) return null;
        const change = (patch: Partial<Source>) => set({ knowledge_source: { ...source, ...patch } });
        return (
          <>
            <TextField label="Title" value={source.title} required onChange={(title) => change({ title })} />
            <TextField label="Cited as" value={source.short} hint="The short name other sources use, such as BPP SDD." onChange={(short) => change({ short: short || null })} />
            <TextField label="Version" value={source.version} onChange={(version) => change({ version: version || null })} />
            <SelectField
              label="Level"
              value={source.level}
              options={[
                { value: "L1", label: "L1, the enterprise landscape" },
                { value: "L2", label: "L2, a primary source for its scope" },
                { value: "L3", label: "L3, a baseline carried forward" },
              ]}
              onChange={(level) => change({ level: level as Source["level"] })}
            />
            <AreaField label="The authority for" value={source.authority} onChange={(authority) => change({ authority: authority || null })} />
          </>
        );
      }
      case "conflict": {
        const conflict = content.conflict;
        if (!conflict) return null;
        const change = (patch: Partial<Conflict>) => set({ conflict: { ...conflict, ...patch } });
        const affected = (conflict.scope ?? []).map((item) => words.offering(item.product_id));
        return (
          <>
            <TextField label="Title" value={conflict.title} required onChange={(title) => change({ title })} />
            <AreaField label="What differs" value={conflict.difference} onChange={(difference) => change({ difference: difference || null })} />
            <AreaField label="What it holds up" value={conflict.impact} onChange={(impact) => change({ impact: impact || null })} />
            <AreaField label="The decision it needs" value={conflict.decision} onChange={(decision) => change({ decision: decision || null })} />
            <p className="cat-quiet">
              {`${words.source(conflict.a.source_id)} says “${conflict.a.statement}”; ${words.source(conflict.b.source_id)} says “${conflict.b.statement}”, as the document says.`}
              {affected.length ? ` It affects ${affected.join(", ")}.` : ""}
            </p>
          </>
        );
      }
      case "realisation_record": {
        const record = content.realisation;
        if (!record) return null;
        const change = (patch: Partial<Realised>) => set({ realisation: { ...record, ...patch } });
        const delivered = record.system_ids ?? [];
        const below = record.realised_by ?? [];
        return (
          <>
            <TextField label="Name" value={record.name} required onChange={(name) => change({ name })} />
            <SelectField
              label="Layer"
              value={record.layer}
              options={[
                { value: "cfs", label: "Customer-facing service (CFS)" },
                { value: "rfs", label: "Resource-facing service (RFS)" },
                { value: "resource", label: "Resource" },
              ]}
              onChange={(layer) => change({ layer: layer as Realised["layer"], realised_by: layer === "resource" ? [] : below })}
            />
            <AreaField label="What it is" value={record.description} onChange={(description) => change({ description: description || null })} />
            <p className="cat-quiet">
              {delivered.length
                ? `${record.layer === "resource" ? "Held" : "Delivered"} by ${delivered.map(words.system).join(", ")}`
                : `The document names no system that ${record.layer === "resource" ? "holds" : "delivers"} it`}
              {record.layer === "resource" ? "." : below.length ? `; realised by ${below.map(words.realisation).join(", ")}, as the document says.` : "; the document names nothing that realises it."}
            </p>
          </>
        );
      }
      case "interface": {
        const contract = content.interface;
        if (!contract) return null;
        const change = (patch: Partial<Contract>) => set({ interface: { ...contract, ...patch } });
        const consumers = contract.consumer_ids ?? [];
        return (
          <>
            <TextField label="Name" value={contract.name} required onChange={(name) => change({ name })} />
            <SystemField
              label="Exposed by"
              value={contract.system_id}
              systems={systems}
              writtenAs={contract.system_id ? words.system(contract.system_id) : undefined}
              onChange={(exposer) => change({ system_id: exposer })}
            />
            <SelectField
              label="How it is called"
              value={contract.style ?? "unspecified"}
              options={[
                { value: "api", label: "An API" },
                { value: "event", label: "Events" },
                { value: "file", label: "Files" },
                { value: "unspecified", label: "Not said" },
              ]}
              onChange={(style) => change({ style: style as Contract["style"] })}
            />
            <AreaField label="What it carries" value={contract.description} onChange={(description) => change({ description: description || null })} />
            <p className="cat-quiet">
              {consumers.length ? `Consumed by ${consumers.map(words.system).join(", ")}, as the document says.` : "The document names no system that consumes it."}
            </p>
          </>
        );
      }
      case "question": {
        const question = content.question ?? { id: "", text: "", order_types: [] };
        const offerings = release.products ?? [];
        const chosen = offerings.find((item) => item.id === content.system_id);
        return (
          <>
            <SelectField
              label="Asked of the offering"
              value={content.system_id}
              wide
              options={[
                ...(!chosen && original.system_id
                  ? [{ value: original.system_id, label: `${words.offering(original.system_id)} (not in the draft yet)` }]
                  : []),
                ...offerings.map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(system_id) => set({ system_id, question: { ...question, order_types: [] } })}
            />
            <QuestionFields
              item={question}
              orders={(chosen?.order_types ?? []).map((type) => ({ code: type.code, name: type.name || type.code }))}
              change={(patch) => set({ question: { ...question, ...patch } })}
            />
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
            interfaces={release.interfaces ?? []}
            names={words}
            onChange={(journey) => set({ journey })}
          />
        );
    }
  })();

  const whole = content.kind === "product" || content.kind === "journey";
  return (
    <form
      className="cat-form"
      noValidate
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && !busy) onAccept(finished());
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <h3 ref={title} id={`${id}-title`} className="cat-edit__title" tabIndex={-1}>Edit, then accept</h3>
      {whole ? fields : <div className="cat-form__grid">{fields}</div>}
      <div className="cat-edit__foot cat-edit__foot--flush">
        <ActionGroup>
          <Button type="submit" variant="primary" busy={busy} unavailableReason={busy ? null : problem}>
            {busy ? "Accepting…" : "Accept as edited"}
          </Button>
          <Button variant="tertiary" onClick={onCancel}>Stop editing</Button>
        </ActionGroup>
      </div>
    </form>
  );
}
