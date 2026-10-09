import { Building2, Layers, Package, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ActionGroup, Button, Section, Select, TextArea, TextField } from "../design/components";
import { OFFERINGS } from "./data/portfolio";
import type { Offering, PortfolioNode } from "./model";
import { ArchitectureFrame, BASE, RecordDrawer } from "./parts";
import { childrenOf, pathTo, portfolio, subtree, usePortfolio } from "./portfolioStore";
import { scopeQuery, useScope } from "./scope";

/** The level a new child gets: the next one down the existing path, or a generic name. */
const LEVELS = ["Business unit", "Line of business", "Segment", "Product family"];

function nextLevel(level: string): string {
  const at = LEVELS.indexOf(level);
  return (at >= 0 ? LEVELS[at + 1] : undefined) ?? "Group";
}

function OfferingLeaf({ offering, href }: { offering: Offering; href: string }) {
  return (
    <li className="arch-tree__item arch-tree__item--leaf">
      <Link className="arch-node arch-node--offering" to={href}>
        <span className="arch-node__level"><Package size={14} aria-hidden="true" /> Product offering</span>
        <span className="arch-node__name">{offering.name}</span>
        <span className="arch-node__meta">{offering.components.length} components · {offering.orderTypes.length} order types</span>
      </Link>
    </li>
  );
}

function Branch({ node, all, selectedId, onSelect, offeringHref }: { node: PortfolioNode; all: PortfolioNode[]; selectedId: string | null; onSelect: (id: string) => void; offeringHref: (id: string) => string }) {
  const children = childrenOf(all, node.id);
  const offerings = OFFERINGS.filter((offering) => offering.nodeId === node.id);
  const Icon = node.parentId === null ? Building2 : Layers;
  return (
    <li className="arch-tree__item">
      <button type="button" className="arch-node" aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)}>
        <span className="arch-node__level"><Icon size={14} aria-hidden="true" /> {node.level}</span>
        <span className="arch-node__name" dir="auto">{node.name}</span>
      </button>
      {(children.length > 0 || offerings.length > 0) && (
        <ul className="arch-tree__children">
          {children.map((child) => (
            <Branch key={child.id} node={child} all={all} selectedId={selectedId} onSelect={onSelect} offeringHref={offeringHref} />
          ))}
          {offerings.map((offering) => (
            <OfferingLeaf key={offering.id} offering={offering} href={offeringHref(offering.id)} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Editor({ node, all, onSelect }: { node: PortfolioNode; all: PortfolioNode[]; onSelect: (id: string | null) => void }) {
  const below = subtree(all, node.id);
  const parents = all.filter((candidate) => !below.has(candidate.id));
  const holds = childrenOf(all, node.id).length + OFFERINGS.filter((offering) => offering.nodeId === node.id).length;
  return (
    <div className="arch-record">
      <p className="arch-quiet">{pathTo(all, node.id).map((item) => item.name).join(" › ")}</p>
      <TextField label="Name" autoComplete="off" value={node.name} onChange={(event) => portfolio.update(node.id, { name: event.target.value })} />
      <TextField label="Level" autoComplete="off" hint="Levels are data: rename them to fit any portfolio." value={node.level} onChange={(event) => portfolio.update(node.id, { level: event.target.value })} />
      <TextArea label="Description" value={node.description ?? ""} onChange={(event) => portfolio.update(node.id, { description: event.target.value })} />
      <Select label="Sits under" value={node.parentId ?? ""} onChange={(event) => portfolio.update(node.id, { parentId: event.target.value || null })}>
        <option value="">Nothing (top level)</option>
        {parents.map((parent) => (
          <option key={parent.id} value={parent.id}>{pathTo(all, parent.id).map((item) => item.name).join(" › ")}</option>
        ))}
      </Select>
      <ActionGroup label={`Change ${node.name}`}>
        <Button icon={<Plus size={16} />} onClick={() => onSelect(portfolio.add(node.id, nextLevel(node.level)))}>Add a level under it</Button>
        <Button
          variant="danger"
          icon={<Trash2 size={16} />}
          unavailableReason={holds ? `It holds ${holds} ${holds === 1 ? "item" : "items"}; move or remove them first.` : undefined}
          onClick={() => {
            portfolio.remove(node.id);
            onSelect(node.parentId);
          }}
        >
          Remove
        </Button>
      </ActionGroup>
    </div>
  );
}

/**
 * The portfolio as an architecture hierarchy, laid out left to right:
 * business unit › line of business › segment › family › offerings. Levels are
 * data, so any telecom portfolio fits. Select a level to edit it in place.
 */
export function PortfolioPage() {
  const [scope] = useScope();
  const [params, setParams] = useSearchParams();
  const { nodes, edited, removed } = usePortfolio();
  // The service doesn't store the portfolio yet: leaving or reloading with changes asks first.
  useEffect(() => {
    if (!edited) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited]);
  const selectedId = params.get("node");
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const [notice, setNotice] = useState<string | null>(null);
  const select = (id: string | null) =>
    setParams((previous) => {
      const merged = new URLSearchParams(previous);
      if (id) merged.set("node", id);
      else merged.delete("node");
      return merged;
    }, { replace: true });
  const query = scopeQuery(scope);
  const offeringHref = (id: string) => `${BASE}/offerings/${id}${query}`;
  const roots = childrenOf(nodes, null);

  return (
    <ArchitectureFrame
      title="Portfolio"
      lead="Where each product sits: Enterprise › Fixed › SMB › product family › product offerings. Select a level to rename it, move it or add a level under it."
      actions={
        edited ? (
          <Button icon={<RotateCcw size={16} />} onClick={() => {
            portfolio.reset();
            setNotice("The portfolio is back to the sources' structure.");
          }}>
            Undo my changes
          </Button>
        ) : undefined
      }
    >
      <p className="arch-note">
        Changes here are kept in this browser session only: the catalogue service stores the portfolio in the next build step.
        {notice && <span role="status"> {notice}</span>}
      </p>
      {removed && (
        <p className="arch-callout" role="status">
          <span>Removed {removed.level.toLowerCase()} “{removed.name}”.</span>
          <span className="arch-actions"><Button variant="link" onClick={() => portfolio.restore()}>Put it back</Button></span>
        </p>
      )}
      <div className="arch-portfolio">
        <Section title="Hierarchy">
          <div className="arch-tree-scroll">
            <ul className="arch-tree" aria-label="Portfolio hierarchy">
              {roots.map((node) => (
                <Branch key={node.id} node={node} all={nodes} selectedId={selectedId} onSelect={select} offeringHref={offeringHref} />
              ))}
            </ul>
          </div>
          <div className="arch-actions">
            <Button icon={<Plus size={16} />} onClick={() => select(portfolio.add(null, "Business unit"))}>Add a business unit</Button>
          </div>
        </Section>
        {selected && (
          <RecordDrawer title={`Edit ${selected.level.toLowerCase()}`} openKey={selected.id} onClose={() => select(null)}>
            <Editor node={selected} all={nodes} onSelect={select} />
          </RecordDrawer>
        )}
      </div>
    </ArchitectureFrame>
  );
}
