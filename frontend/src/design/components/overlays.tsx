import "./overlays.css";

import { CircleHelp, X } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";

import { Button } from "./actions";

/**
 * A modal dialog, used only where the interaction model allows one (§4):
 * unsaved changes on leave, session expiry, a 409 that needs a choice.
 * Native <dialog>: focus is trapped, Esc closes, focus returns to the opener.
 */
export function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      dialog.querySelector<HTMLElement>("[data-autofocus],button")?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      opener.current?.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="ds-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={`${id}-title`} className="ds-dialog__title">{title}</h2>
      <div className="ds-dialog__body">{children}</div>
      <div className="ds-actions ds-dialog__actions">{actions}</div>
    </dialog>
  );
}

/**
 * A non-modal side panel (Help, Jobs, Account, the upload flow). The page
 * stays usable beside it; Esc or Close hands focus back (pair with useDisclosure).
 */
export function Drawer({
  title,
  onClose,
  panelRef,
  children,
}: {
  title: string;
  onClose: () => void;
  panelRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <aside
      className="ds-root ds-drawer"
      aria-labelledby={`${id}-title`}
      ref={panelRef as RefObject<HTMLElement>}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="ds-drawer__head">
        <h2 id={`${id}-title`} tabIndex={-1}>{title}</h2>
        <button type="button" className="ds-icon-button" aria-label={`Close ${title}`} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="ds-drawer__body">{children}</div>
    </aside>
  );
}

/**
 * §14 inline help: a toggletip, opened by click or Enter (never hover alone),
 * announced politely, closed by Esc or pressing again.
 */
export function Toggletip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="ds-toggletip" onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      <button type="button" className="ds-icon-button ds-toggletip__button" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((on) => !on)}>
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      <span id={id} role="status" className="ds-toggletip__bubble" hidden={!open}>
        {open ? children : null}
      </span>
    </span>
  );
}

export type Shortcut = { keys: string; does: string };

/**
 * §2: the keyboard map for this page's widgets plus the page-wide keys, and
 * the on/off switch that WCAG 2.1.4 requires for single-character shortcuts.
 */
export function ShortcutHelp({
  widget,
  global,
  enabled,
  onToggle,
}: {
  widget: { title: string; shortcuts: Shortcut[] }[];
  global: Shortcut[];
  enabled: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="ds-shortcuts">
      {widget.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h4>{group.title}</h4>
          <KeyList shortcuts={group.shortcuts} />
        </section>
      ))}
      <section aria-label="Page-wide shortcuts">
        <h4>Page-wide</h4>
        <p className="ds-shortcuts__state">
          Page-wide shortcuts are {enabled ? "on" : "off"}.{" "}
          <Button variant="link" onClick={() => onToggle(!enabled)}>Turn them {enabled ? "off" : "on"}</Button>
        </p>
        <KeyList shortcuts={global} />
      </section>
    </div>
  );
}

function KeyList({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <dl className="ds-keylist">
      {shortcuts.map((shortcut) => (
        <div key={shortcut.keys}>
          <dt><kbd>{shortcut.keys}</kbd></dt>
          <dd>{shortcut.does}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * §14 consistent help (WCAG 3.2.6): the Help panel's content contract, the
 * same four parts, in the same order, on every page.
 */
export function HelpContent({
  page,
  shortcuts,
  terms,
  contact,
}: {
  page: { title: string; body: ReactNode };
  shortcuts?: ReactNode;
  terms: { term: string; meaning: string }[];
  contact: ReactNode;
}) {
  return (
    <div className="ds-help">
      <section aria-labelledby="ds-help-page">
        <h3 id="ds-help-page">{page.title}</h3>
        <div>{page.body}</div>
      </section>
      {shortcuts && (
        <section aria-labelledby="ds-help-keys">
          <h3 id="ds-help-keys">Keyboard shortcuts</h3>
          {shortcuts}
        </section>
      )}
      <section aria-labelledby="ds-help-terms">
        <h3 id="ds-help-terms">Terms on this page</h3>
        <dl className="ds-help__terms">
          {terms.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="ds-help-contact">
        <h3 id="ds-help-contact">Ask the knowledge team</h3>
        {contact}
      </section>
    </div>
  );
}
