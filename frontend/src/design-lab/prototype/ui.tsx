/**
 * The prototype's router glue and the few page pieces the design system
 * doesn't have yet. Each is a candidate for promotion in Phase 8, not a
 * second design system: tokens and component classes only.
 */
import { type ReactNode } from "react";
import { Link } from "react-router-dom";

import { type LinkLike, Status } from "../../design/components";

/** The design system is router-agnostic; this hands it react-router's Link. */
export const RouterLink: LinkLike = ({ href, className, children, ...rest }) => (
  <Link to={href} className={className} aria-current={rest["aria-current"]}>
    {children}
  </Link>
);

/** A router link that looks like a button (secondary unless said). */
export function ButtonLink({ to, variant = "secondary", children, ...rest }: { to: string; variant?: "secondary" | "primary" | "quiet"; children: ReactNode; tabIndex?: number; "data-roving"?: boolean }) {
  return (
    <Link to={to} className={`ds-button ds-button--${variant}`} {...rest}>
      <span>{children}</span>
    </Link>
  );
}

/** An outcome line under an action (§7, §15): polite; a failure carries its icon and words. */
export function Outcome({ text, failed }: { text: string | null | undefined; failed?: boolean }) {
  return (
    <p className="proto-outcome" role="status">
      {text ? failed ? <Status tone="attention">{text}</Status> : text : null}
    </p>
  );
}

/** The widget's keys, said once under it, with the way to every shortcut (§2, WCAG 3.2.6). */
export function KeysHint({ keys }: { keys: [string, string][] }) {
  return (
    <p className="proto-keys">
      <span className="proto-keys__label">Keys</span>
      {keys.map(([key, what]) => (
        <span key={key} className="proto-keys__item">
          <kbd>{key}</kbd> {what}
        </span>
      ))}
      <Link to="?help=shortcuts" className="proto-keys__more">All shortcuts</Link>
    </p>
  );
}

/** The draft's five steps: an ordered nav, the current step said with aria-current="step". */
export function StepNav({ steps, current }: { steps: { id: string; label: string; href: string; note?: string }[]; current: string }) {
  return (
    <nav className="proto-steps" aria-label="Draft steps">
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <Link to={step.href} aria-current={step.id === current ? "step" : undefined} className="proto-steps__link">
              <span className="proto-steps__n" aria-hidden="true">{index + 1}</span>
              <span className="proto-steps__label">{step.label}</span>
              {step.note && <span className="proto-steps__note">{step.note}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Label and value pairs for a record's facts. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="proto-facts">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A plain ledger list: one item per line, hair rules between. */
export function Lines({ label, children }: { label?: string; children: ReactNode }) {
  return <ul className="proto-lines" aria-label={label}>{children}</ul>;
}
