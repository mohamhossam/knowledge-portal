import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { LinkLike } from "../design/components";

/** The design system is router-agnostic; this hands it react-router's Link. */
export const RouterLink: LinkLike = ({ href, className, children, ...rest }) => (
  <Link to={href} className={className} aria-current={rest["aria-current"]}>
    {children}
  </Link>
);

/** A router link that looks like a button: secondary unless said. */
export function ButtonLink({
  to,
  variant = "secondary",
  children,
  ...rest
}: {
  to: string;
  variant?: "secondary" | "primary" | "quiet";
  children: ReactNode;
  tabIndex?: number;
  "data-roving"?: boolean;
}) {
  return (
    <Link to={to} className={`ds-button ds-button--${variant}`} {...rest}>
      <span>{children}</span>
    </Link>
  );
}
