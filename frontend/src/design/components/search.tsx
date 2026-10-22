import "./search.css";

import { Search, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { searchShortcut } from "../words";

/** One result: where it opens, its name, and a line that says what and where it is. */
export type SearchHit = { id: string; href: string; title: string; detail?: ReactNode };

/** Results of one kind ("Documents", "Systems"), with an optional state beside its name ("searching…"). */
export type SearchGroup = { id: string; label: string; hits: SearchHit[]; note?: string };

/**
 * The masthead's way into search: a field-shaped button that says what it
 * searches and its key. It opens the search dialog; Ctrl+K (⌘K) does the same.
 */
export function SearchTrigger({ label, expanded, onClick, id }: { label: string; expanded: boolean; onClick: (event: { currentTarget: EventTarget | null }) => void; id?: string }) {
  const keys = searchShortcut();
  return (
    <button id={id} type="button" className="ds-searchtrigger" aria-haspopup="dialog" aria-expanded={expanded} aria-keyshortcuts="Control+K Meta+K" onClick={onClick}>
      <Search size={16} aria-hidden="true" />
      <span className="ds-searchtrigger__label">{label}</span>
      <kbd className="ds-searchtrigger__keys" aria-hidden="true">{keys}</kbd>
    </button>
  );
}

/**
 * Global search (interaction model §2.2, §4): a modal dialog holding one
 * combobox. Focus stays in the field; ↓ ↑ move through every result across the
 * groups (aria-activedescendant), Enter opens the one marked, Esc closes and
 * hands focus back to what opened it. Results arrive from the caller, grouped
 * by kind; one status line says what was found.
 */
export function SearchDialog({
  open,
  onClose,
  label,
  placeholder,
  query,
  onQuery,
  groups,
  status,
  hint,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  /** The field's label, which also names the dialog. */
  label: string;
  placeholder?: string;
  query: string;
  onQuery: (query: string) => void;
  groups: SearchGroup[];
  /** What the results say in words, announced politely ("4 documents and 2 systems for 'xgpon'"). */
  status: ReactNode;
  /** Shown before anything is typed: what can be found here. */
  hint?: ReactNode;
  onOpen: (hit: SearchHit) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  const [active, setActive] = useState(0);
  const shown = groups.filter((group) => group.hits.length > 0 || group.note);
  const hits = shown.flatMap((group) => group.hits);
  const current = hits[Math.min(active, hits.length - 1)];
  const optionId = (group: SearchGroup, hit: SearchHit) => `${id}-${group.id}-${hit.id}`;

  // A new query marks the first result again.
  const [markedFor, setMarkedFor] = useState(query);
  if (markedFor !== query) {
    setMarkedFor(query);
    setActive(0);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      field.current?.focus();
      field.current?.select();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      opener.current?.focus();
    }
  }, [open]);

  // The marked result stays in view as the arrows move through a long list.
  useEffect(() => {
    if (!open || !current) return;
    const group = shown.find((item) => item.hits.includes(current));
    if (group) document.getElementById(optionId(group, current))?.scrollIntoView?.({ block: "nearest" });
  });

  const move = (by: number) => {
    if (!hits.length) return;
    setActive((index) => (Math.min(index, hits.length - 1) + by + hits.length) % hits.length);
  };

  return (
    // A press on the backdrop closes it, as Esc does (onCancel); the click adds no key path.
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="ds-root ds-search"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A press on the backdrop (the dialog element itself, outside its box) closes it.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="ds-search__box">
        <div className="ds-search__head">
          <Search size={18} aria-hidden="true" className="ds-search__icon" />
          <input
            ref={field}
            id={`${id}-field`}
            className="ds-search__field"
            type="text"
            dir="auto"
            role="combobox"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={hits.length > 0}
            aria-controls={`${id}-list`}
            aria-activedescendant={current ? optionId(shown.find((group) => group.hits.includes(current))!, current) : undefined}
            autoComplete="off"
            spellCheck={false}
            maxLength={2000}
            placeholder={placeholder}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Enter" && current) {
                event.preventDefault();
                onOpen(current);
              }
            }}
          />
          <button type="button" className="ds-icon-button" aria-label={`Close ${label.toLocaleLowerCase()}`} onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div id={`${id}-list`} role="listbox" aria-label="Results" className="ds-search__results">
          {shown.map((group) => (
            <div key={group.id} role="group" aria-labelledby={`${id}-${group.id}`} className="ds-search__group">
              <div id={`${id}-${group.id}`} role="presentation" className="ds-search__grouphead">
                {group.label}
                {group.note && <>{" "}<span className="ds-search__note">· {group.note}</span></>}
              </div>
              {group.hits.map((hit) => {
                const index = hits.indexOf(hit);
                return (
                  // An option of the field's listbox: focus stays in the field, whose arrows
                  // and Enter choose (aria-activedescendant); a press is the pointer's way.
                  // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/interactive-supports-focus
                  <div
                    key={hit.id}
                    id={optionId(group, hit)}
                    role="option"
                    aria-selected={hit === current}
                    className="ds-search__option"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => index !== active && setActive(index)}
                    onClick={() => onOpen(hit)}
                  >
                    <bdi className="ds-search__title">{hit.title}</bdi>
                    {hit.detail && <span className="ds-search__detail">{hit.detail}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {query.trim() === "" && hint && <div className="ds-search__hint">{hint}</div>}
        <div className="ds-search__foot">
          <p className="ds-search__status" role="status">{status}</p>
          <p className="ds-search__keys" aria-hidden="true">
            <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
          </p>
        </div>
      </div>
    </dialog>
  );
}
