import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { LEAVES } from "./knowledge";

/**
 * A link that leaves for requirement work, or its words alone when this deployment runs
 * without requirement work (requirement-portal ADR-0104). `outbound` marks it with the
 * leaving arrow, for a link that stands on its own as an action.
 */
export function RequirementLink({ href, className, outbound = false, children }: {
  href: string | null;
  className?: string;
  outbound?: boolean;
  children: ReactNode;
}) {
  if (href === null) return <span className={className} dir="auto">{children}</span>;
  return (
    <a href={href} className={className} dir="auto">
      {children}{" "}
      {/* The space sits outside the hidden words, so the name keeps it (design system §6). */}
      <span className="ds-visually-hidden">{LEAVES.trim()}</span>
      {outbound && <ArrowUpRight size={14} aria-hidden="true" className="rk-leaves" />}
    </a>
  );
}
