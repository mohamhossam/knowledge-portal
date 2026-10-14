/** The portfolio scope the journeys page opens on. */
import { type Offering, type PortfolioNode } from "../../architecture/model";
import { pathTo } from "./labUtil";

/** The portfolio path the page opens on, by name from the top: Fixed, then SMB. */
const DEFAULT_SCOPE = ["Fixed", "SMB"];

/**
 * The scope the page opens on: DEFAULT_SCOPE by name (the first name anywhere,
 * each next one among the previous one's children), then down through the
 * first child that holds a product, so every level opens with a choice.
 */
export function defaultScope(nodes: PortfolioNode[], offerings: Offering[]): string | null {
  const holdsProduct = (node: PortfolioNode) => offerings.some((offering) => pathTo(nodes, offering.nodeId).some((item) => item.id === node.id));
  let node: PortfolioNode | undefined;
  for (const name of DEFAULT_SCOPE) {
    const found: PortfolioNode | undefined = nodes.find((item) => item.name === name && (!node || item.parentId === node.id));
    if (!found) break;
    node = found;
  }
  for (let next = node && nodes.find((item) => item.parentId === node?.id && holdsProduct(item)); next; next = nodes.find((item) => item.parentId === node?.id && holdsProduct(item))) node = next;
  return node?.id ?? null;
}
