import type { Release, SourceConfidence } from "../api/client";
import { CONFIDENCE_OPTIONS } from "./catalogue";
import { conceptAndNarrower, conceptDomain, type ConceptField, conceptUses, fitsUnder } from "./editing";
import { AreaField, CheckField, LinesField, SelectField, TextField } from "./forms";
import { SourceField } from "./SourceField";

type Concept = NonNullable<Release["business_capabilities"]>[number];

/**
 * A whole concept: its labels and what it means, where it sits in the scheme, the same concept in
 * outside schemes, where its facts come from, and whether it is retired. Controlled; `issue` is
 * what stops it being saved, said under the field it is at.
 */
export function ConceptEditor({ value, onChange, release, issue }: {
  value: Concept;
  onChange: (value: Concept) => void;
  release: Release;
  issue?: { field: ConceptField; message: string } | null;
}) {
  const set = (patch: Partial<Concept>) => onChange({ ...value, ...patch });
  const errorAt = (field: ConceptField) => (issue?.field === field ? issue.message : null);
  const concepts = release.business_capabilities ?? [];
  const domains = new Map((release.capability_domains ?? []).map((domain) => [domain.id, domain.name]));
  // A broader concept is any other one but those under this one, and none that would take a concept past three levels;
  // a retired one only while it is already chosen.
  const under = value.id ? conceptAndNarrower(concepts, value.id) : new Set<string>();
  const broaderOptions = [
    { value: "", label: "None: a top concept" },
    ...concepts
      .filter((item) => item.id === value.broader_id || (!under.has(item.id) && !item.deprecated && fitsUnder(release, value, item.id)))
      .map((item) => ({ value: item.id, label: item.deprecated ? `${item.pref_label} (retired)` : item.pref_label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const domainOptions = [
    { value: "", label: "Not placed yet" },
    ...[...domains].map(([id, name]) => ({ value: id, label: name })),
  ];
  // ADR-0121: what takes a retired concept's place is one still in use.
  const successors = [
    { value: "", label: "Nothing replaces it" },
    ...concepts
      .filter((item) => item.id !== value.id && !item.deprecated)
      .map((item) => ({ value: item.id, label: item.pref_label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  // Under a broader concept it sits in its top concept's domain, however far up that is.
  const inherited = value.broader_id ? conceptDomain(release, value.broader_id) : null;
  const uses = value.id ? conceptUses(release, value.id) : [];
  return (
    <div className="cat-form">
      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Its labels</legend>
        <TextField label="Preferred label" value={value.pref_label} required wide error={errorAt("pref_label")} onChange={(pref_label) => set({ pref_label })} />
        <LinesField
          label="Other labels"
          value={value.alt_labels}
          hint="One per line: other words people use for it. Each label names one concept; “Wi-Fi” and “WiFi” count as the same."
          error={errorAt("alt_labels")}
          onChange={(alt_labels) => set({ alt_labels })}
        />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">What it means</legend>
        <AreaField label="Definition" value={value.definition} onChange={(definition) => set({ definition: definition || null })} />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Where it sits</legend>
        <div className="cat-form__grid">
          <SelectField
            label="Broader concept"
            value={value.broader_id ?? ""}
            options={broaderOptions}
            hint="Concepts go at most three levels deep; any that would go deeper are left out."
            error={errorAt("broader_id")}
            // The domain it had is kept while it sits under another, so choosing "None" again brings it back.
            onChange={(id) => set({ broader_id: id || null })}
          />
          {value.broader_id ? (
            <p className="ds-field__hint cat-form__wide">
              {inherited && domains.has(inherited)
                ? `Under another concept, it sits in its top concept's capability domain: ${domains.get(inherited)}.`
                : "Under another concept, it sits in its top concept's capability domain, which has none yet."}
            </p>
          ) : (
            <SelectField
              label="Capability domain"
              value={value.domain_id ?? ""}
              options={domainOptions}
              error={errorAt("domain_id")}
              onChange={(id) => set({ domain_id: id || null })}
            />
          )}
        </div>
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Its outside matches</legend>
        <TextField
          label="Outside match"
          value={value.exact_match}
          wide
          hint="The same concept in an outside scheme, such as a TM Forum ODA capability."
          onChange={(exact_match) => set({ exact_match: exact_match || null })}
        />
        <LinesField
          label="Near matches"
          value={value.close_match}
          hint="One per line: outside references close enough to read across, though not the same."
          error={errorAt("close_match")}
          onChange={(close_match) => set({ close_match })}
        />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Its source</legend>
        <div className="cat-form__grid">
          <SourceField value={value.source} onChange={(source) => set({ source })} />
          <SelectField
            label="How sure its source is"
            value={value.confidence ?? ""}
            options={CONFIDENCE_OPTIONS}
            onChange={(confidence) => set({ confidence: (confidence || null) as SourceConfidence | null })}
          />
        </div>
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Whether it is retired</legend>
        <CheckField
          label="Retired: still readable, never selected or matched again"
          checked={value.deprecated}
          onChange={(deprecated) => set({ deprecated, replaced_by: deprecated ? value.replaced_by : null })}
        />
        {value.deprecated && (
          <>
            <p className="ds-field__hint">
              Once the draft is published, requirement work stops mapping to it.{" "}
              {uses.length
                ? `Still named by ${uses.join(", ")}; ${uses.length === 1 ? "it keeps its" : "they keep their"} link until changed.`
                : "Nothing else in the draft names it."}
            </p>
            <SelectField
              label="Replaced by"
              value={value.replaced_by ?? ""}
              options={successors}
              error={errorAt("replaced_by")}
              onChange={(id) => set({ replaced_by: id || null })}
            />
          </>
        )}
      </fieldset>
    </div>
  );
}
