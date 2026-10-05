import { useState } from "react";

import type { KnowledgeSource, SourceConfidence, SourceConflict, SourceLevel } from "../api/client";
import { CONFIDENCE_OPTIONS } from "./catalogue";
import { draftBody, sourceUses } from "./drafting";
import { EditPanel } from "./DraftEdits";
import { slug } from "./editing";
import { AreaField, CheckField, Rows, SelectField, TextField } from "./forms";
import { LEVEL_OPTIONS, withIds } from "./governance";
import { useCatalogueContext } from "./useCatalogue";
import { useEditing } from "./useEditing";

type Scope = SourceConflict["scope"][number];
type Side = SourceConflict["a"];

const cut = (text: string, index: number, what: string) => {
  const name = text.trim();
  if (!name) return `${what} ${index + 1}`;
  return `${what} ${name.length > 40 ? `${name.slice(0, 39)}…` : name}`;
};

/** Why a register cannot be saved yet: ids and names given once each. */
function repeated(values: string[]): boolean {
  const kept = values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean);
  return new Set(kept).size !== kept.length;
}

/**
 * The source register edited whole, in place of its table (requirement-portal
 * ADR-0101, step 5). A source an offering or a conflict still names cannot go.
 */
export function SourcesEdit({ onDone }: { onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const original = release.sources ?? [];
  const [items, setItems] = useState<KnowledgeSource[]>(original);
  const finished = withIds(items, (item) => slug(item.short || item.title).toLocaleUpperCase());
  const gone = original.filter((item) => !items.some((kept) => kept.id === item.id));
  const named = gone.flatMap((item) => sourceUses(release, item.id).map((use) => `${item.short ?? item.title} (${use})`));
  const problem = items.some((item) => !item.title.trim())
    ? "Every source needs a title."
    : repeated(items.map((item) => item.id))
      ? "Two sources have the same id."
      : repeated(items.map((item) => item.short ?? ""))
        ? "Two sources have the same short name."
        : named.length
          ? `Still named: ${named.join(", ")}. Take the source off those first.`
          : null;
  return (
    <EditPanel
      title="Edit the sources"
      action="Save the sources"
      focusOnOpen
      busy={saveDraft.isPending}
      problem={problem}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => saveDraft.mutate(draftBody(release, { sources: finished }), { onSuccess: onDone })}
    >
      <Rows<KnowledgeSource>
        legend="Sources"
        one="source"
        items={items}
        onChange={setItems}
        labelled
        blank={() => ({ id: "", title: "", level: "L2", supplied: true })}
        itemLabel={(item, index) => cut(item.short || item.title, index, "source")}
        render={(item, update) => (
          <>
            <TextField label="Title" value={item.title} required wide onChange={(title) => update({ title })} />
            <TextField label="Short name, as facts cite it" value={item.short} onChange={(short) => update({ short: short || null })} />
            <TextField label="Id" value={item.id} dir="ltr" hint="Made from the short name when left empty." onChange={(id) => update({ id })} />
            <SelectField label="Level" value={item.level} options={LEVEL_OPTIONS} onChange={(level) => update({ level: level as SourceLevel })} />
            <TextField label="Version" value={item.version} onChange={(version) => update({ version: version || null })} />
            <TextField label="File" value={item.file} onChange={(file) => update({ file: file || null })} />
            <CheckField label="Supplied for this review" checked={item.supplied !== false} onChange={(supplied) => update({ supplied })} />
            <AreaField label="What it is the authority for" value={item.authority} onChange={(authority) => update({ authority: authority || null })} />
            <TextField label="What it covers" value={item.scope} wide onChange={(scope) => update({ scope: scope || null })} />
            <AreaField label="What it cannot tell" value={item.boundary} onChange={(boundary) => update({ boundary: boundary || null })} />
          </>
        )}
      />
    </EditPanel>
  );
}

/** One of a conflict's two statements: which source says it, where, and what. */
function SideFields({ legend, side, sources, onChange }: { legend: string; side: Side; sources: KnowledgeSource[]; onChange: (side: Side) => void }) {
  const known = sources.some((source) => source.id === side.source_id);
  return (
    <fieldset className="form__group form__field--wide">
      <legend className="field__label">{legend}</legend>
      <div className="form__grid">
        <SelectField
          label="Source"
          value={side.source_id}
          options={[
            { value: "", label: "Choose a source" },
            ...(!known && side.source_id ? [{ value: side.source_id, label: `${side.source_id} (not in the register)` }] : []),
            ...sources.map((source) => ({ value: source.id, label: `${source.short ?? source.title} (${source.level})` })),
          ]}
          onChange={(source_id) => onChange({ ...side, source_id })}
        />
        <TextField label="Where it says so" value={side.reference} onChange={(reference) => onChange({ ...side, reference: reference || null })} />
      </div>
      <AreaField label="What it says" value={side.statement} required onChange={(statement) => onChange({ ...side, statement })} />
    </fieldset>
  );
}

/**
 * The conflicts between sources edited whole, in place of their table: each a pair
 * of statements, what differs, the decision it needs, and the offerings and order
 * types it affects with the question it raises for each.
 */
export function ConflictsEdit({ onDone }: { onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const sources = release.sources ?? [];
  const offerings = release.products ?? [];
  const [items, setItems] = useState<SourceConflict[]>(release.conflicts ?? []);
  const finished = withIds(items, () => "CF");
  const problem = items.some((item) => !item.title.trim())
    ? "Every conflict needs a title."
    : repeated(items.map((item) => item.id))
      ? "Two conflicts have the same id."
      : items.some((item) => !item.a.source_id || !item.b.source_id || !item.a.statement.trim() || !item.b.statement.trim())
        ? "Each side of a conflict needs its source and what it says."
        : items.some((item) => item.scope.some((scope) => !scope.product_id) || repeated(item.scope.map((scope) => scope.product_id)))
          ? "Each offering a conflict affects is chosen once."
          : null;
  return (
    <EditPanel
      title="Edit the conflicts between sources"
      action="Save the conflicts"
      focusOnOpen
      busy={saveDraft.isPending}
      problem={problem}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => saveDraft.mutate(draftBody(release, { conflicts: finished }), { onSuccess: onDone })}
    >
      <Rows<SourceConflict>
        legend="Conflicts between sources"
        one="conflict"
        items={items}
        onChange={setItems}
        labelled
        blank={() => ({ id: "", title: "", a: { source_id: "", statement: "" }, b: { source_id: "", statement: "" }, scope: [] })}
        itemLabel={(item, index) => cut(item.title, index, "conflict")}
        render={(item, update) => (
          <>
            <TextField label="Title" value={item.title} required wide onChange={(title) => update({ title })} />
            <TextField label="Id" value={item.id} dir="ltr" hint="Such as CF-01; made for you when left empty." onChange={(id) => update({ id })} />
            <SelectField
              label="How sure its sources are"
              value={item.confidence ?? ""}
              options={CONFIDENCE_OPTIONS}
              onChange={(confidence) => update({ confidence: (confidence || null) as SourceConfidence | null })}
            />
            <SideFields legend="One source says" side={item.a} sources={sources} onChange={(a) => update({ a })} />
            <SideFields legend="Another says" side={item.b} sources={sources} onChange={(b) => update({ b })} />
            <AreaField label="What differs" value={item.difference} onChange={(difference) => update({ difference: difference || null })} />
            <AreaField label="What the catalogue does meanwhile" value={item.impact} onChange={(impact) => update({ impact: impact || null })} />
            <AreaField label="The decision it needs" value={item.decision} onChange={(decision) => update({ decision: decision || null })} />
            <Rows<Scope>
              legend="What it affects"
              one={`offering ${item.title.trim() || "this conflict"} affects`}
              items={item.scope}
              onChange={(scope) => update({ scope })}
              blank={() => ({ product_id: offerings.find((offering) => !item.scope.some((scope) => scope.product_id === offering.id))?.id ?? "", order_types: [] })}
              itemLabel={(scope, index) => cut(offerings.find((offering) => offering.id === scope.product_id)?.name ?? "", index, "offering")}
              render={(scope, change) => {
                const offering = offerings.find((candidate) => candidate.id === scope.product_id);
                return (
                  <>
                    <SelectField
                      label="Offering"
                      value={scope.product_id}
                      options={[{ value: "", label: "Choose an offering" }, ...offerings.map((candidate) => ({ value: candidate.id, label: candidate.name }))]}
                      onChange={(product_id) => change({ product_id, order_types: [], question_id: null })}
                    />
                    <SelectField
                      label="The question it raises"
                      value={scope.question_id ?? ""}
                      options={[
                        { value: "", label: "None named" },
                        ...(offering?.questions ?? []).map((question) => ({ value: question.id, label: cut(`${question.id} ${question.text}`, 0, "").trim() })),
                      ]}
                      onChange={(question_id) => change({ question_id: question_id || null })}
                    />
                    {offering && offering.order_types.length > 0 && (
                      <fieldset className="choices form__field--wide">
                        <legend className="field__label">For order types (none means all)</legend>
                        {offering.order_types.map((type) => (
                          <CheckField
                            key={type.code}
                            label={type.name}
                            checked={(scope.order_types ?? []).includes(type.code)}
                            onChange={(on) =>
                              change({
                                order_types: on ? [...(scope.order_types ?? []), type.code] : (scope.order_types ?? []).filter((code) => code !== type.code),
                              })
                            }
                          />
                        ))}
                      </fieldset>
                    )}
                  </>
                );
              }}
            />
          </>
        )}
      />
    </EditPanel>
  );
}
