/**
 * The catalogue's form kit, on the design system's fields: labelled fields on
 * a wrapping grid, lists edited one item per line, and repeating rows. Shared
 * by the suggestion editors and the hand editors.
 */
import "./frame/forms.css";

import { Plus, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import type { CatalogueSystem } from "../api/client";
import { Button, Checkbox, Field } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";

export function TextField({ label, value, onChange, required, dir = "auto", wide, hint, error }: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  required?: boolean;
  dir?: "auto" | "ltr";
  wide?: boolean;
  hint?: string;
  /** What is wrong with the value, said beside the field and tied to it. */
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
            required={required}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

export function AreaField({ label, value, onChange, rows = 2, hint, required, error }: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  rows?: number;
  hint?: string;
  required?: boolean;
  /** What is wrong with the value, said beside the field and tied to it. */
  error?: string | null;
}) {
  return (
    <div className="cat-form__cell cat-form__wide">
      <Field label={label} hint={hint} error={error} required={required}>
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
export function LinesField({ label, value, onChange, hint, required, error }: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  required?: boolean;
  error?: string | null;
}) {
  return (
    <AreaField
      label={label}
      value={value.join("\n")}
      rows={Math.min(6, Math.max(2, value.length + 1))}
      hint={hint ?? "One per line."}
      required={required}
      error={error}
      // Kept as typed while editing, spaces and an empty last line included; `lines` trims at submit.
      onChange={(text) => onChange(text.split("\n"))}
    />
  );
}

export function SelectField({ label, value, onChange, options, wide, hint, error }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Options with a group are set under it, in an optgroup, in the order given. */
  options: { value: string; label: string; group?: string }[];
  wide?: boolean;
  hint?: string;
  error?: string | null;
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
      <Field label={label} hint={hint} error={error}>
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

/**
 * Several chosen from a list: the chosen ones as words, each with its own remove, and a select
 * with an Add beside it. Choosing in the select adds nothing until Add is pressed, since arrowing
 * through a closed select picks each option it passes. One chosen that the list no longer has
 * stays shown, as written.
 */
export function PickField({ label, hint, chosen, options, onChange, error }: {
  label: string;
  hint?: string;
  /** What is wrong with the choices, said under the select and tied to it. */
  error?: string | null;
  chosen: string[];
  /** Options with a group are set under it, in the order given. */
  options: { value: string; label: string; group?: string }[];
  onChange: (chosen: string[]) => void;
}) {
  const name = (value: string) => options.find((option) => option.value === value)?.label ?? value;
  const left = options.filter((option) => !chosen.includes(option.value));
  const [next, setNext] = useState("");
  const cell = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender();
  const add = () => {
    if (!next) return;
    onChange([...chosen, next]);
    setNext("");
    // Add is unavailable again once its choice is in: focus goes back to the select for the next one.
    focusLater(() => cell.current?.querySelector("select"));
  };
  return (
    <div ref={cell} className="cat-form__cell cat-form__wide">
      <div className="cat-form__pick">
        <SelectField
          label={label}
          hint={hint}
          value={left.some((option) => option.value === next) ? next : ""}
          options={[{ value: "", label: left.length ? "Choose one to add…" : "All are chosen already" }, ...left]}
          error={error}
          onChange={setNext}
        />
        <Button aria-label={`Add to ${label.toLocaleLowerCase()}`} icon={<Plus size={14} />} disabled={!next || left.length === 0} onClick={add}>
          Add
        </Button>
      </div>
      {chosen.length > 0 && (
        <ul className="cat-form__chosen" aria-label={`${label}: chosen`}>
          {chosen.map((value) => (
            <li key={value}>
              <span dir="auto">{name(value)}</span>
              <Button
                variant="tertiary"
                icon={<X size={14} />}
                aria-label={`Remove ${name(value)} from ${label.toLocaleLowerCase()}`}
                onClick={() => {
                  onChange(chosen.filter((item) => item !== value));
                  // The removed one's button goes with it: focus goes back to the select, never the page.
                  focusLater(() => cell.current?.querySelector("select"));
                }}
              >
                {null}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** Repeating rows: each a ruled fieldset with its own remove, and one add at the foot. */
export function Rows<T>({ legend, one, items, onChange, blank, render, itemLabel, labelled, removeReason }: {
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
  /** Why a row cannot be removed, such as something still naming it; its Remove then says so instead. */
  removeReason?: (item: T, index: number) => string | null;
}) {
  const group = useRef<HTMLFieldSetElement>(null);
  const focusLater = useFocusAfterRender();
  // Focus never falls to the page: a new row takes it, and a removed row hands it on.
  const rowAt = (index: number) => group.current?.querySelectorAll<HTMLElement>(":scope > .cat-form__row")[index];
  const firstControl = (row: HTMLElement | undefined) => row?.querySelector<HTMLElement>("input, select, textarea, button");
  const add = () => {
    onChange([...items, blank()]);
    focusLater(() => firstControl(rowAt(items.length)));
  };
  const remove = (index: number) => {
    onChange(items.filter((_, at) => at !== index));
    focusLater(() =>
      firstControl(rowAt(Math.min(index, items.length - 2))) ?? group.current?.querySelector<HTMLElement>(":scope > .cat-form__remove button"),
    );
  };
  return (
    <fieldset ref={group} className="cat-form__rows">
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
            <Button variant="tertiary" icon={<X size={14} />} unavailableReason={removeReason?.(item, index) ?? null} onClick={() => remove(index)}>
              Remove {itemLabel(item, index)}
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="cat-form__remove">
        <Button variant="tertiary" icon={<Plus size={14} />} onClick={add}>
          Add {items.length ? "another" : /^[aeiou]/i.test(one) ? "an" : "a"} {one}
        </Button>
      </div>
    </fieldset>
  );
}
