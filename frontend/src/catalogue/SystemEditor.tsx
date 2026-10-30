import { useId, useMemo } from "react";

import type { CatalogueSystem, Release } from "../api/client";
import { RadioGroup } from "../design/components";
import { systemUses } from "./drafting";
import { conceptDomain } from "./editing";
import { AreaField, CheckField, LinesField, Rows, SelectField, TextField } from "./forms";
import { SourceField, SurenessField } from "./SourceField";

type Capability = CatalogueSystem["capabilities"][number];
type Component = CatalogueSystem["components"][number];
type Option = { value: string; label: string; group?: string };

/** The concept choice that says none fits; no concept id starts with "*". */
const NONE_FITS = "*none-fits";

/** Concepts to link a capability to, under their business areas, the area each sits in, and whether any has one. */
function conceptChoices(release: Release): { options: Option[]; domains: Map<string, string | null>; placed: boolean } {
  const areas = new Map((release.capability_domains ?? []).map((domain) => [domain.id, domain.name]));
  const domains = new Map((release.business_capabilities ?? []).map((concept) => [concept.id, conceptDomain(release, concept.id)]));
  const group = (id: string) => areas.get(domains.get(id) ?? "") ?? "No business area";
  const options = (release.business_capabilities ?? [])
    .filter((concept) => !concept.deprecated)
    .map((concept) => ({ value: concept.id, label: concept.pref_label, group: group(concept.id) }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  return { options, domains, placed: [...domains.values()].some(Boolean) };
}

/**
 * A whole system: its names, where it sits, where its facts come from, what it
 * does and by which phrases requirement work finds it, the information it
 * masters and reads, its components and its constraints. Controlled.
 */
export function SystemEditor({ value, onChange, release }: {
  value: CatalogueSystem;
  onChange: (value: CatalogueSystem) => void;
  release: Release;
}) {
  const set = (patch: Partial<CatalogueSystem>) => onChange({ ...value, ...patch });
  const concepts = useMemo(() => conceptChoices(release), [release]);
  const roles = useId();
  const conceptOptions = (item: Capability): Option[] => {
    const chosen = item.concept_id;
    // A retired concept, or one the version no longer has, stays shown while a capability names it.
    const kept = chosen && !concepts.options.some((option) => option.value === chosen)
      ? [{ value: chosen, label: `${release.business_capabilities?.find((concept) => concept.id === chosen)?.pref_label ?? chosen} (retired or gone)` }]
      : [];
    return [{ value: "", label: "Not linked yet" }, { value: NONE_FITS, label: "None fits (say why)" }, ...kept, ...concepts.options];
  };
  const chooseConcept = (choice: string, item: Capability): Partial<Capability> => {
    if (choice === NONE_FITS) return { concept_id: null, unlinked_reason: item.unlinked_reason ?? "" };
    const held = choice ? concepts.domains.get(choice) : null;
    // A capability sits in its concept's business area (the service refuses any other).
    return { concept_id: choice || null, unlinked_reason: null, ...(held ? { domain_id: held } : {}) };
  };
  // A version saved before systems carried their data roles has neither list.
  const masters = value.masters ?? [];
  const reads = value.reads ?? [];
  const entities = (() => {
    const terms = (release.vocabulary ?? []).filter((term) => term.scheme === "information_entity");
    const named = [...masters, ...reads];
    const known = terms
      .filter((term) => !term.deprecated || named.includes(term.id))
      .map((term) => ({ id: term.id, name: term.pref_label }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const unknown = named.filter((id) => !terms.some((term) => term.id === id)).map((id) => ({ id, name: `${id} (not in the vocabulary)` }));
    return [...known, ...unknown];
  })();
  // An entity is mastered, read, or neither: choosing one side takes it off the other.
  const setData = (id: string, role: "masters" | "reads" | null) =>
    set({
      masters: [...masters.filter((item) => item !== id), ...(role === "masters" ? [id] : [])],
      reads: [...reads.filter((item) => item !== id), ...(role === "reads" ? [id] : [])],
    });
  const notes = value.mastery_notes ?? [];
  const setNote = (id: string, note: string) =>
    set({ mastery_notes: [...notes.filter((item) => item.entity_id !== id), ...(note ? [{ entity_id: id, note }] : [])] });
  const places = [
    { value: "", label: "Not placed in the landscape" },
    ...(release.landscape_domains ?? []).map((domain) => ({ value: domain.id, label: domain.name })),
  ];
  const areas = [
    { value: "", label: "No business area" },
    ...(release.capability_domains ?? []).map((domain) => ({ value: domain.id, label: domain.name })),
  ];
  // ADR-0121: what can stand in for a retired system is one still in service.
  const successors = [
    { value: "", label: "Nothing replaces it" },
    ...release.systems.filter((item) => item.id !== value.id && !item.deprecated).map((item) => ({ value: item.id, label: item.name })),
  ];
  const components = [
    { value: "", label: "No component named" },
    ...value.components.filter((item) => item.name.trim()).map((item) => ({ value: item.id || item.name, label: item.name })),
  ];
  // Retiring shows its consequence beside the box (PRODUCT.md, principle 2): what still names it.
  const namedBy = value.id ? systemUses(release, value.id) : [];
  const linked = value.id ? release.relationships.filter((item) => item.source_system_id === value.id || item.target_system_id === value.id).length : 0;
  const stillNamed = [...namedBy, ...(linked ? [`${linked} ${linked === 1 ? "dependency" : "dependencies"}`] : [])];
  return (
    <div className="cat-form">
      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">The system</legend>
        <div className="cat-form__grid">
          <TextField label="Name" value={value.name} required onChange={(name) => set({ name })} />
          <SelectField
            label="Sits in"
            value={value.landscape_domain_id ?? ""}
            options={places}
            onChange={(id) => set({ landscape_domain_id: id || null })}
          />
          {/* Where a source puts it otherwise, as the source writes it (a domain the draft may not have), and why it sits here. */}
          <TextField
            label="Where a source places it instead"
            value={value.placement_from}
            hint="As the source writes it; the draft's places are offered. The map says so."
            suggestions={places.filter((place) => place.value).map((place) => place.label)}
            error={!value.placement_from?.trim() && value.placement_reason?.trim() ? "Say where a source places it, or leave why it sits here empty." : null}
            onChange={(placement_from) => set({ placement_from: placement_from || null })}
          />
          <TextField
            label="Why it sits here"
            value={value.placement_reason}
            wide
            error={value.placement_from?.trim() && !value.placement_reason?.trim() ? "Say why it sits here rather than where a source places it." : null}
            onChange={(placement_reason) => set({ placement_reason: placement_reason || null })}
          />
        </div>
        <LinesField label="Also called" value={value.aliases} onChange={(aliases) => set({ aliases })} />
        <AreaField label="What it is" value={value.description} onChange={(description) => set({ description: description || null })} />
        <CheckField
          label="Outside the operator: another party runs it, such as a government body or a vendor platform"
          checked={value.external}
          onChange={(external) => set({ external })}
        />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Where its facts come from</legend>
        <div className="cat-form__grid">
          <TextField
            label="Owner in the source"
            value={value.owner}
            hint="As its source names one; Ownership decides who runs it."
            onChange={(owner) => set({ owner: owner || null })}
          />
          <SourceField value={value.source} onChange={(source) => set({ source })} />
          <SurenessField source={value.source} value={value.confidence} onChange={(confidence) => set({ confidence })} />
        </div>
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">What lies ahead</legend>
        <AreaField
          label="Roadmap"
          value={value.roadmap}
          hint="A planned change, such as Replaced by Netcracker CSRD over time."
          onChange={(roadmap) => set({ roadmap: roadmap || null })}
        />
        <CheckField
          label="Retired: still readable, never matched again"
          checked={value.deprecated}
          onChange={(deprecated) => set({ deprecated, replaced_by: deprecated ? value.replaced_by : null })}
        />
        {value.deprecated && (
          <>
            <p className="ds-field__hint">
              Once the draft is published, requirement work stops mapping to it.{" "}
              {stillNamed.length ? `Still named by ${stillNamed.join(", ")}.` : "Nothing else in the draft names it."}
            </p>
            <SelectField label="Replaced by" value={value.replaced_by ?? ""} options={successors} onChange={(id) => set({ replaced_by: id || null })} />
          </>
        )}
      </fieldset>

      <Rows<Capability>
        legend="What it does"
        one="capability"
        labelled
        items={value.capabilities}
        onChange={(capabilities) => set({ capabilities })}
        blank={() => ({ id: "", name: "", triggers: [], accepted: [] })}
        itemLabel={(item, index) => `capability ${item.name || index + 1}`}
        render={(item, update, index) => (
          <>
            <TextField label="Capability" value={item.name} required onChange={(name) => update({ name })} />
            <SelectField label="Business area" value={item.domain_id ?? ""} options={areas} wide onChange={(id) => update({ domain_id: id || null })} />
            <SelectField
              label="Concept it realises"
              value={item.concept_id ?? (item.unlinked_reason != null ? NONE_FITS : "")}
              options={conceptOptions(item)}
              hint={concepts.placed ? "Choosing a concept puts the capability in its business area." : undefined}
              onChange={(choice) => update(chooseConcept(choice, item))}
            />
            {item.unlinked_reason != null && !item.concept_id && (
              <TextField
                label="Why no concept fits"
                value={item.unlinked_reason}
                required
                wide
                error={item.unlinked_reason.trim() ? null : "Say why no concept fits, so the gap is not taken for one nobody checked."}
                onChange={(unlinked_reason) => update({ unlinked_reason })}
              />
            )}
            <SelectField
              label="Delivered by the component"
              value={item.component_id ?? ""}
              options={components}
              onChange={(id) => update({ component_id: id || null })}
            />
            <LinesField
              label="Matched by"
              value={item.triggers}
              required
              hint="One phrase per line. Requirement work maps a requirement here when it uses one."
              onChange={(triggers) => update({ triggers })}
            />
            <SourceField value={item.source} previous={value.capabilities[index - 1]} onCopy={update} onChange={(source) => update({ source })} />
            <SurenessField source={item.source} value={item.confidence} onChange={(confidence) => update({ confidence })} />
          </>
        )}
      />

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Information</legend>
        {entities.length ? (
          <>
            <p className="ds-field__hint">For each kind of information: it masters it (it is the system of record), reads it, or neither. Never both.</p>
            <ul className="cat-form__roles">
              {entities.map((item) => {
                const role = masters.includes(item.id) ? "masters" : reads.includes(item.id) ? "reads" : "neither";
                return (
                  <li key={item.id} className="cat-form__role">
                    <RadioGroup
                      legend={item.name}
                      name={`${roles}-${item.id}`}
                      value={role}
                      options={[
                        { value: "masters", label: "Masters" },
                        { value: "reads", label: "Reads" },
                        { value: "neither", label: "Neither" },
                      ]}
                      onChange={(next) => setData(item.id, next === "neither" ? null : next)}
                    />
                    {role === "masters" && (
                      <AreaField
                        label={`Its share of ${item.name}`}
                        value={notes.find((note) => note.entity_id === item.id)?.note}
                        hint="Optional: when it masters only part of it. Kept only while it masters it."
                        onChange={(note) => setNote(item.id, note)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="ds-field__hint">This version names no information entity to choose from.</p>
        )}
      </fieldset>

      <Rows<Component>
        legend="Components"
        one="component"
        labelled
        items={value.components}
        onChange={(next) => set({ components: next })}
        blank={() => ({ id: "", name: "", aliases: [], accepted: [] })}
        itemLabel={(item, index) => `component ${item.name || index + 1}`}
        render={(item, update, index) => (
          <>
            <TextField label="Component" value={item.name} required onChange={(name) => update({ name })} />
            <TextField label="Built with" value={item.technology} onChange={(technology) => update({ technology: technology || null })} />
            <LinesField label="Also called" value={item.aliases} onChange={(aliases) => update({ aliases })} />
            <AreaField label="What it does" value={item.description} onChange={(description) => update({ description: description || null })} />
            <SourceField value={item.source} previous={value.components[index - 1]} onCopy={update} onChange={(source) => update({ source })} />
            <SurenessField source={item.source} value={item.confidence} onChange={(confidence) => update({ confidence })} />
          </>
        )}
      />

      <LinesField
        label="Constraints"
        value={value.constraints}
        hint="One constraint per line."
        onChange={(constraints) => set({ constraints })}
      />
    </div>
  );
}
