/**
 * The catalogue's form kit: labelled fields in the world's field style, lists
 * edited one item per line, and repeating rows. Shared by the suggestion
 * editors and, later, the hand editors.
 */
import { Plus, X } from "lucide-react";
import { type ReactNode, useId } from "react";

import type { CatalogueSystem } from "../api/client";

export function TextField({ label, value, onChange, required, dir = "auto", wide, hint }: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  required?: boolean;
  dir?: "auto" | "ltr" | "rtl";
  wide?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className={wide ? "field form__field form__field--wide" : "field form__field"} htmlFor={id}>
      <span className="field__label">{label}{required && <span className="visually-hidden"> (required)</span>}</span>
      <input
        id={id}
        className="field__input"
        value={value ?? ""}
        dir={dir}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <span id={`${id}-hint`} className="form__hint">{hint}</span>}
    </label>
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
  const id = useId();
  return (
    <label className="field form__field form__field--wide" htmlFor={id}>
      <span className="field__label">{label}{required && <span className="visually-hidden"> (required)</span>}</span>
      <textarea
        id={id}
        className="field__input field__input--text"
        rows={rows}
        value={value ?? ""}
        dir="auto"
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <span id={`${id}-hint`} className="form__hint">{hint}</span>}
    </label>
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
  const id = useId();
  const runs: { group?: string; options: typeof options }[] = [];
  for (const option of options) {
    const last = runs.at(-1);
    if (last && last.group === option.group) last.options.push(option);
    else runs.push({ group: option.group, options: [option] });
  }
  const render = (list: typeof options) => list.map((option) => <option key={option.value} value={option.value}>{option.label}</option>);
  return (
    <label className={wide ? "field form__field form__field--wide" : "field form__field"} htmlFor={id}>
      <span className="field__label">{label}</span>
      <select id={id} className="field__input form__select" value={value} onChange={(event) => onChange(event.target.value)}>
        {runs.map((run, index) =>
          run.group ? <optgroup key={`${run.group}:${index}`} label={run.group}>{render(run.options)}</optgroup> : render(run.options),
        )}
      </select>
    </label>
  );
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check form__check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
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

/** Repeating rows: each a ruled fieldset with its own remove, and one add at the foot. */
export function Rows<T>({ legend, one, items, onChange, blank, render, itemLabel }: {
  legend: string;
  /** One of them, for the add button: "branch", "hand-over". */
  one: string;
  items: T[];
  onChange: (items: T[]) => void;
  blank: () => T;
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  itemLabel: (item: T, index: number) => string;
}) {
  return (
    <fieldset className="form__rows">
      <legend className="form__legend">{legend}</legend>
      {items.length === 0 && <p className="form__hint">None yet.</p>}
      {items.map((item, index) => (
        <fieldset key={index} className="form__row">
          <legend className="visually-hidden">{itemLabel(item, index)}</legend>
          <div className="form__grid">
            {render(item, (patch) => onChange(items.map((current, at) => (at === index ? { ...current, ...patch } : current))), index)}
          </div>
          <button type="button" className="text-button form__remove" onClick={() => onChange(items.filter((_, at) => at !== index))}>
            <X size={14} aria-hidden="true" />
            Remove {itemLabel(item, index)}
          </button>
        </fieldset>
      ))}
      <button type="button" className="text-button" onClick={() => onChange([...items, blank()])}>
        <Plus size={14} aria-hidden="true" />
        Add {items.length ? "another" : "a"} {one}
      </button>
    </fieldset>
  );
}
