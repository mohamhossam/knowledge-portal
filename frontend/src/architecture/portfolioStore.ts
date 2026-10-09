import { useSyncExternalStore } from "react";

import { PORTFOLIO } from "./data/portfolio";
import type { PortfolioNode } from "./model";

/**
 * The portfolio as edited in this session. The catalogue service doesn't store
 * the hierarchy yet (plan step 1, backend), so edits live in memory until it
 * does; the page says so beside the editor.
 */
let nodes: PortfolioNode[] = PORTFOLIO;
let edited = false;
const listeners = new Set<() => void>();

function emit(next: PortfolioNode[]) {
  nodes = next;
  edited = true;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePortfolio(): { nodes: PortfolioNode[]; edited: boolean } {
  const current = useSyncExternalStore(subscribe, () => nodes);
  return { nodes: current, edited };
}

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

export const portfolio = {
  update(id: string, change: Partial<Pick<PortfolioNode, "name" | "level" | "description" | "parentId">>) {
    emit(nodes.map((node) => (node.id === id ? { ...node, ...change } : node)));
  },
  add(parentId: string | null, level: string): string {
    const id = `node-${Date.now().toString(36)}`;
    emit([...nodes, { id, level, name: `New ${level.toLowerCase()}`, parentId }]);
    return id;
  },
  remove(id: string) {
    emit(nodes.filter((node) => node.id !== id));
  },
  reset() {
    nodes = PORTFOLIO;
    edited = false;
    for (const listener of listeners) listener();
  },
};
