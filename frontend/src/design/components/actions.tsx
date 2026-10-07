import "./actions.css";

import { type ButtonHTMLAttributes, type ReactNode, useId, useState } from "react";

export type ButtonVariant = "secondary" | "primary" | "danger" | "quiet" | "link";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** An icon before the label; decorative (the label names the action). */
  icon?: ReactNode;
  /**
   * Interaction model §1.2: why this action can't run now. The button stays
   * focusable (`aria-disabled`), shows the reason beside it, and says it when
   * pressed. Use native `disabled` only when there's no reason worth saying.
   */
  unavailableReason?: string | null;
  /** Shows a working state and ignores presses (e.g. while a request runs). */
  busy?: boolean;
};

/** The one button: secondary by default; primary for the page's one main action. */
export function Button({ variant = "secondary", icon, unavailableReason, busy, onClick, children, className, type = "button", ...rest }: ButtonProps) {
  const id = useId();
  const [said, setSaid] = useState(false);
  const unavailable = Boolean(unavailableReason);
  const describedBy = [rest["aria-describedby"], unavailable ? `${id}-why` : null].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <button
        type={type}
        {...rest}
        className={["ds-button", `ds-button--${variant}`, className].filter(Boolean).join(" ")}
        aria-disabled={unavailable || busy ? true : undefined}
        aria-busy={busy || undefined}
        aria-describedby={describedBy}
        onClick={(event) => {
          if (busy) return;
          if (unavailable) {
            setSaid(true);
            return;
          }
          onClick?.(event);
        }}
      >
        {icon && <span className="ds-button__icon" aria-hidden="true">{icon}</span>}
        <span>{children}</span>
      </button>
      {unavailable && (
        <span id={`${id}-why`} className="ds-button__why" role={said ? "status" : undefined}>
          {unavailableReason}
        </span>
      )}
    </>
  );
}

/** A row of actions; the first primary goes first in reading order. */
export function ActionGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="ds-actions" role={label ? "group" : undefined} aria-label={label}>
      {children}
    </div>
  );
}
