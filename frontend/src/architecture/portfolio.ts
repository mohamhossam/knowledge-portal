import type { PortfolioNode } from "./model";

export function childrenOf(all: PortfolioNode[], parentId: string | null): PortfolioNode[] {
  return all.filter((node) => node.parentId === parentId);
}

/** The node and every node under it. */
export function subtree(all: PortfolioNode[], id: string): Set<string> {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of all) if (node.parentId && found.has(node.parentId) && !found.has(node.id)) {
      found.add(node.id);
      grew = true;
    }
  }
  return found;
}

export function pathTo(all: PortfolioNode[], id: string | null): PortfolioNode[] {
  const path: PortfolioNode[] = [];
  let current = all.find((node) => node.id === id);
  while (current) {
    path.unshift(current);
    current = all.find((node) => node.id === current?.parentId);
  }
  return path;
}
