import type { ReactNode } from "react";

import { LEAVES } from "./knowledge";

/**
 * A link that leaves for requirement work, or its words alone when this deployment runs
 * without requirement work (requirement-portal ADR-0104).
 */
export function RequirementLink({ href, className, children }: {
  href: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (href === null) return <span className={className} dir="auto">{children}</span>;
  return (
    <a href={href} className={className} dir="auto">
      {children}
      <span className="visually-hidden">{LEAVES}</span>
    </a>
  );
}
