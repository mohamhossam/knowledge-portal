/**
 * The catalogue's form kit, on the design system's fields: labelled fields on
 * a wrapping grid, lists edited one item per line, and repeating rows. Shared
 * by the suggestion editors and the hand editors.
 */
import "./frame/forms.css";

import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";

import type { CatalogueSystem } from "../api/client";
import { Button, Checkbox, Field } from "../design/components";

export function TextField({ label, value, onChange, required, dir = "auto", lang, wide, hint, error }: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  required?: boolean;
  dir?: "auto" | "ltr" | "rtl";
  /** The content language, so screen readers switch pronunciation (lang="ar" on Arabic names). */
  lang?: string;
  wide?: boolean;
  hint?: string;
  /** What is wrong with the value, under the field and tied to it. */
  error?: string | null;
}) {
  return (
    <div className={wide ? "cat-form__cell cat-form__wide" : "cat-form__cell"}>
      <Field label={label} hint={hint} error={error} required={required}>
        {(control) => (
          <input
            className="ds-input"
            {...control}
            value={value ?? ""}
            dir={dir}
            lang={lang}
            required={required}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

export function AreaField({ label, value, onChange, rows = 2, hint, required }: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  rows?: number;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="cat-form__cell cat-form__wide">
      <Field label={label} hint={hint} required={required}>
        {(control) => (
          <textarea
            className="ds-input ds-input--area"
            {...control}
            rows={rows}
            value={value ?? ""}
            dir="auto"
            required={required}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

/** A list edited one item per line: names, phrases, rules. */
export function LinesField({ label, value, onChange, hint, required }: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  required?: boolean;
}) {
  return (
    <AreaField
      label={label}
      value={value.join("\n")}
      rows={Math.min(6, Math.max(2, value.length + 1))}
      hint={hint ?? "One per line."}
      required={required}
      // Kept as typed while editing, spaces and an empty last line included; `lines` trims at submit.
      onChange={(text) => onChange(text.split("\n"))}
    />
  );
}

export function SelectField({ label, value, onChange, options, wide }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Options with a group are set under it, in an optgroup, in the order given. */
  options: { value: string; label: string; group?: string }[];
  wide?: boolean;
}) {
  const runs: { group?: string; options: typeof options }[] = [];
  for (const option of options) {
    const last = runs.at(-1);
    if (last && last.group === option.group) last.options.push(option);
    else runs.push({ group: option.group, options: [option] });
  }
  const render = (list: typeof options) => list.map((option) => <option key={option.value} value={option.value}>{option.label}</option>);
  return (
    <div className={wide ? "cat-form__cell cat-form__wide" : "cat-form__cell"}>
      <Field label={label}>
        {(control) => (
          <select className="ds-input ds-input--select" {...control} value={value} onChange={(event) => onChange(event.target.value)}>
            {runs.map((run, index) =>
              run.group ? <optgroup key={`${run.group}:${index}`} label={run.group}>{render(run.options)}</optgroup> : render(run.options),
            )}
          </select>
        )}
      </Field>
    </div>
  );
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <Checkbox label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />;
}

/** A group of checkboxes under one label: order types, sources. Long groups set in columns. */
export function Choices({ legend, hint, children }: { legend: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="cat-form__choices cat-form__wide">
      <legend className="ds-field__label">{legend}</legend>
      {hint && <p className="ds-field__hint cat-form__all">{hint}</p>}
      {children}
    </fieldset>
  );
}

/**
 * A system chosen from the draft. A name the document used that the draft does
 * not have yet stays choosable, said as written.
 */
export function SystemField({ label, value, onChange, systems, writtenAs, allowNone }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  systems: CatalogueSystem[];
  writtenAs?: string;
  allowNone?: boolean;
}) {
  const known = systems.some((system) => system.id === value);
  const options = [
    ...(allowNone ? [{ value: "", label: "No system named" }] : []),
    ...(!known && value ? [{ value, label: `${writtenAs ?? value} (not in the draft yet)` }] : []),
    ...[...systems].sort((a, b) => a.name.localeCompare(b.name)).map((system) => ({ value: system.id, label: system.name })),
  ];
  return <SelectField label={label} value={value} onChange={onChange} options={options} />;
}

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** Repeating rows: each a ruled fieldset with its own remove, and one add at the foot. */
export function Rows<T>({ legend, one, items, onChange, blank, render, itemLabel, labelled }: {
  legend: string;
  /** One of them, for the add button: "branch", "hand-over". */
  one: string;
  items: T[];
  onChange: (items: T[]) => void;
  blank: () => T;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  itemLabel: (item: T, index: number) => string;
  /** Show each row's name as its heading, for rows long enough to lose one's place in. */
  labelled?: boolean;
}) {
  return (
    <fieldset className="cat-form__rows">
      <legend className="cat-form__legend">{legend}</legend>
      {items.length === 0 && <p className="ds-field__hint">None yet.</p>}
      {items.map((item, index) => (
        <fieldset key={index} className="cat-form__row">
          <legend className={labelled ? "cat-form__row-title" : "ds-visually-hidden"}>
            {labelled ? sentence(itemLabel(item, index)) : itemLabel(item, index)}
          </legend>
          <div className="cat-form__grid">
            {render(item, (patch) => onChange(items.map((current, at) => (at === index ? { ...current, ...patch } : current))), index)}
          </div>
          <div className="cat-form__remove">
            <Button variant="tertiary" icon={<X size={14} />} onClick={() => onChange(items.filter((_, at) => at !== index))}>
              Remove {itemLabel(item, index)}
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="cat-form__remove">
        <Button variant="tertiary" icon={<Plus size={14} />} onClick={() => onChange([...items, blank()])}>
          Add {items.length ? "another" : "a"} {one}
        </Button>
      </div>
    </fieldset>
  );
}
