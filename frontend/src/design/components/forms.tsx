import "./forms.css";

import { Upload as UploadIcon } from "lucide-react";
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
  useState,
} from "react";

import type { JobState } from "../words";
import { JobStatus } from "./feedback";

/** The props a control needs to be labelled, described and validated. */
export type ControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

/**
 * §7 field contract: a visible label, an optional hint, an error tied by
 * aria-describedby and shown only after the person has tried. The render prop
 * receives the ids so any control can sit inside.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={id}>
        {label}
        {required && <span className="ds-field__required"> (required)</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="ds-field__hint">{hint}</p>}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": required ? true : undefined })}
      {error && <p id={`${id}-error`} className="ds-field__error">{error}</p>}
    </div>
  );
}

type Common = { label: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean };

/** A text input. Content may be Arabic or English: dir="auto" always (§13). */
export function TextField({ label, hint, error, required, ...input }: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(control) => <input className="ds-input" dir="auto" {...input} {...control} />}
    </Field>
  );
}

export function TextArea({ label, hint, error, required, rows = 3, ...area }: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(control) => <textarea className="ds-input ds-input--area" dir="auto" rows={rows} {...area} {...control} />}
    </Field>
  );
}

export function Select({ label, hint, error, required, children, ...select }: Common & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(control) => <select className="ds-input ds-input--select" {...select} {...control}>{children}</select>}
    </Field>
  );
}

/** A 24 px checkbox with its label as part of the target. */
export function Checkbox({ label, hint, ...input }: { label: ReactNode; hint?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  return (
    <div className="ds-check">
      <input type="checkbox" id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="ds-check__box" {...input} />
      <label htmlFor={id} className="ds-check__label">{label}</label>
      {hint && <p id={`${id}-hint`} className="ds-field__hint ds-check__hint">{hint}</p>}
    </div>
  );
}

export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: ReactNode;
  name: string;
  value: T;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="ds-radios">
      <legend className="ds-field__label">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="ds-check">
          <input type="radio" className="ds-check__box" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span className="ds-check__label">{option.label}</span>
          {option.hint && <span className="ds-field__hint ds-check__hint">{option.hint}</span>}
        </label>
      ))}
    </fieldset>
  );
}

export type ComboOption = { id: string; label: string; hint?: string };

/**
 * §2.2 combobox: type to filter; ↓ ↑ move through matches; Enter picks; Esc
 * clears. The listbox is announced through aria-activedescendant; focus stays
 * in the input. Names may be Arabic: each option is isolated.
 */
export function Combobox({
  label,
  hint,
  options,
  onSelect,
  placeholder,
  emptyText = "No matches.",
  suggested,
  search,
}: {
  label: ReactNode;
  hint?: ReactNode;
  options: ComboOption[];
  onSelect: (option: ComboOption) => void;
  placeholder?: string;
  emptyText?: string;
  /** An option to offer first, with its reason (e.g. the squad that runs related systems). */
  suggested?: { id: string; reason: string };
  /** The caller's own matching (e.g. the catalogue's search over names, Arabic names and capabilities); replaces the label filter. */
  search?: (query: string) => ComboOption[];
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const wanted = query.trim().toLocaleLowerCase();
  const filtered = search ? search(query) : options.filter((option) => !wanted || option.label.toLocaleLowerCase().includes(wanted) || option.hint?.toLocaleLowerCase().includes(wanted));
  const ordered = suggested ? [...filtered.filter((o) => o.id === suggested.id), ...filtered.filter((o) => o.id !== suggested.id)] : filtered;
  const pick = (option: ComboOption | undefined) => {
    if (!option) return;
    onSelect(option);
    setQuery(option.label);
    setOpen(false);
  };
  return (
    <Field label={label} hint={hint}>
      {(control) => (
        <div className="ds-combobox">
          <input
            {...control}
            className="ds-input"
            dir="auto"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-activedescendant={open && ordered[index] ? `${id}-${ordered[index]!.id}` : undefined}
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setIndex((i) => Math.min(i + 1, Math.max(ordered.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter" && open) {
                event.preventDefault();
                pick(ordered[index]);
              } else if (event.key === "Escape") {
                if (open) setOpen(false);
                else setQuery("");
              }
            }}
          />
          {open && (
            <ul id={`${id}-list`} role="listbox" className="ds-combobox__list" aria-label={typeof label === "string" ? label : undefined}>
              {ordered.length === 0 ? (
                <li className="ds-combobox__empty" role="presentation">{emptyText}</li>
              ) : (
                ordered.map((option, i) => (
                  <li
                    key={option.id}
                    id={`${id}-${option.id}`}
                    role="option"
                    aria-selected={i === index}
                    className="ds-combobox__option"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(option);
                    }}
                  >
                    <bdi>{option.label}</bdi>
                    {suggested?.id === option.id ? (
                      <span className="ds-combobox__hint"> · Suggested: {suggested.reason}</span>
                    ) : option.hint ? (
                      <span className="ds-combobox__hint"> · {option.hint}</span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          )}
          <p className="ds-visually-hidden" role="status">{open && wanted ? `${ordered.length} matches` : ""}</p>
        </div>
      )}
    </Field>
  );
}

export type UploadItem = { name: string; state: JobState; note?: string };

/**
 * Upload with scan state: a labelled file control, then each file's state
 * (Waiting → Working (scan, read) → Done, or Held / Needs attention with why).
 */
export function Upload({
  label = "Files",
  hint,
  accept,
  multiple = true,
  items,
  onFiles,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  items: UploadItem[];
  onFiles: (files: File[]) => void;
}) {
  const id = useId();
  return (
    <div className="ds-upload">
      <label htmlFor={id} className="ds-upload__drop">
        <UploadIcon size={18} aria-hidden="true" />
        <span className="ds-field__label">{label}</span>
        {hint && <span className="ds-field__hint">{hint}</span>}
        <input
          id={id}
          type="file"
          className="ds-upload__input"
          accept={accept}
          multiple={multiple}
          onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
        />
      </label>
      {items.length > 0 && (
        <ul className="ds-upload__list" aria-label="Uploaded files">
          {items.map((item) => (
            <li key={item.name} className="ds-upload__item">
              <bdi>{item.name}</bdi>
              <JobStatus state={item.state}>{item.note}</JobStatus>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
