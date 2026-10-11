import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { BASE } from "../auth/paths";
import { Diagram, type DiagramProps } from "../design/diagram";
import type { LinkLike } from "../design/components";

const appPath = (href: string) => (BASE && href.startsWith(`${BASE}/`) ? href.slice(BASE.length) : href);

/** The table's names: router links, from the same addresses the drawing uses. */
const TableLink: LinkLike = ({ href, className, children }) => (
  <Link to={appPath(href)} className={className}>{children}</Link>
);

/**
 * The kit's `Diagram` inside the app: nodes carry real addresses (`diagramHref`),
 * so a link opens in a new tab as any link does, while a plain click or Enter
 * stays in the app (the router takes over) instead of loading the page again.
 */
export function RoutedDiagram(props: Omit<DiagramProps, "link">) {
  const navigate = useNavigate();
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest?.("a[data-node]");
    const href = anchor?.getAttribute("href");
    if (!href || !href.startsWith(`${BASE}/`)) return;
    event.preventDefault();
    navigate(appPath(href));
  };
  return (
    // The click is the link's own (a pointer or Enter on it): this only hands it to the router.
    <div className="routed-diagram" onClick={onClick}>
      <Diagram {...props} link={TableLink} />
    </div>
  );
}
