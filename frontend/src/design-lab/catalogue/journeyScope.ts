/** The portfolio scope the journeys page opens on. */
import { type Offering, type PortfolioNode } from "../../catalogue/model/model";
import { pathTo } from "./labUtil";

/**
 * The scope the page opens on: the deepest portfolio node every product sits
 * under, then down through the first child that holds a product, so every level
 * opens with a choice. No product in the portfolio: no scope.
 */
export function defaultScope(nodes: PortfolioNode[], offerings: Offering[]): string | null {
  const paths = offerings.map((offering) => pathTo(nodes, offering.nodeId)).filter((path) => path.length);
  if (!paths.length) return null;
  const holdsProduct = (node: PortfolioNode) => paths.some((path) => path.some((item) => item.id === node.id));
  let node: PortfolioNode | undefined;
  for (const [depth, item] of paths[0]!.entries()) {
    if (!paths.every((path) => path[depth]?.id === item.id)) break;
    node = item;
  }
  const firstChild = (parent: PortfolioNode | undefined) => nodes.find((item) => (parent ? item.parentId === parent.id : !item.parentId) && holdsProduct(item));
  node ??= firstChild(undefined);
  for (let next = firstChild(node); next; next = firstChild(node)) node = next;
  return node?.id ?? null;
}
