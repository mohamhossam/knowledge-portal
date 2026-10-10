import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Layers, Package, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, type Release } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { ActionGroup, Button, Facts, LiveMessage, Section, Select, TextArea, TextField } from "../design/components";
import type { CatalogueData } from "./adapter";
import type { Offering, PortfolioNode } from "./model";
import { ArchitectureFrame, BASE, RecordDrawer } from "./parts";
import { childrenOf, pathTo, subtree } from "./portfolio";
import { useScope, withScope } from "./scope";

type ApiNode = NonNullable<Release["portfolio"]>[number];

/** The level a new child gets: the next one down the usual path, or a generic name. */
const LEVELS = ["Business unit", "Line of business", "Segment", "Product family"];

function nextLevel(level: string): string {
  const at = LEVELS.indexOf(level);
  return (at >= 0 ? LEVELS[at + 1] : undefined) ?? "Group";
}

/**
 * Saves the portfolio to the draft, against the revision read: if someone else
 * saved in between, the save is refused rather than overwriting their work.
 */
function usePortfolioSave(data: CatalogueData) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (portfolio: ApiNode[]) =>
      api.saveDraft(data.releaseId, {
        expected_revision: data.revision,
        systems: data.release.systems,
        relationships: data.release.relationships,
        portfolio,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["architecture", "release", data.releaseId], saved);
      void queryClient.invalidateQueries({ queryKey: ["architecture", "releases"] });
    },
  });
}

const failure = (error: unknown) =>
  error instanceof ApiError && error.status === 409
    ? "Someone saved this draft in the meantime. Reload the page to see their changes, then make yours again."
    : errorMessage(error);

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

function Branch({ data, node, selectedId, onSelect, offeringHref }: { data: CatalogueData; node: PortfolioNode; selectedId: string | null; onSelect: (id: string) => void; offeringHref: (id: string) => string }) {
  const children = childrenOf(data.portfolio, node.id);
  const offerings = data.offerings.filter((offering) => offering.nodeId === node.id);
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
            <Branch key={child.id} data={data} node={child} selectedId={selectedId} onSelect={onSelect} offeringHref={offeringHref} />
          ))}
          {offerings.map((offering) => (
            <OfferingLeaf key={offering.id} offering={offering} href={offeringHref(offering.id)} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The portfolio as the API takes it, keeping each node's evidence. */
function asApi(data: CatalogueData, nodes: PortfolioNode[]): ApiNode[] {
  return nodes.map((node) => {
    const stored = (data.release.portfolio ?? []).find((item) => item.id === node.id);
    return {
      id: node.id,
      name: node.name,
      level: node.level,
      parent_id: node.parentId,
      description: node.description ?? null,
      confidence: stored?.confidence ?? null,
      source: stored?.source ?? null,
    };
  });
}

function Editor({ data, node, onSelect, onSaved }: { data: CatalogueData; node: PortfolioNode; onSelect: (id: string | null) => void; onSaved: (message: string, removed?: PortfolioNode) => void }) {
  const save = usePortfolioSave(data);
  // Keyed by node and revision where it is used, so it starts from what was saved.
  const [form, setForm] = useState(node);
  const below = subtree(data.portfolio, node.id);
  const parents = data.portfolio.filter((candidate) => !below.has(candidate.id));
  const holds = childrenOf(data.portfolio, node.id).length + data.offerings.filter((offering) => offering.nodeId === node.id).length;
  const draft = data.status === "draft";
  const readOnly = draft ? undefined : "This version is published; edit the portfolio in a draft.";
  const changed = form.name !== node.name || form.level !== node.level || (form.description ?? "") !== (node.description ?? "") || form.parentId !== node.parentId;
  const commit = (nodes: PortfolioNode[], message: string, removed?: PortfolioNode) => save.mutate(asApi(data, nodes), { onSuccess: () => onSaved(message, removed) });
  if (!draft) {
    // A published version is read, never edited: its record, and where to edit instead.
    return (
      <div className="arch-record">
        <Facts
          items={[
            ["Path", pathTo(data.portfolio, node.id).map((item) => item.name).join(" › ")],
            ["Level", node.level],
            ["Description", node.description ?? "None"],
          ]}
        />
        <p className="arch-note">{readOnly} The Version picker above lists the drafts.</p>
      </div>
    );
  }
  return (
    <div className="arch-record">
      <p className="arch-quiet">{pathTo(data.portfolio, node.id).map((item) => item.name).join(" › ")}</p>
      <TextField label="Name" autoComplete="off" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <TextField label="Level" autoComplete="off" hint="Levels are data: rename them to fit any portfolio." value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} />
      <TextArea label="Description" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      <Select label="Sits under" value={form.parentId ?? ""} onChange={(event) => setForm({ ...form, parentId: event.target.value || null })}>
        <option value="">Nothing (top level)</option>
        {parents.map((parent) => (
          <option key={parent.id} value={parent.id}>{pathTo(data.portfolio, parent.id).map((item) => item.name).join(" › ")}</option>
        ))}
      </Select>
      {save.isError && <p className="arch-callout" role="alert">{failure(save.error)}</p>}
      <ActionGroup label={`Change ${node.name}`}>
        <Button
          variant="primary"
          icon={<Save size={16} />}
          busy={save.isPending}
          unavailableReason={readOnly ?? (changed ? (form.name.trim() && form.level.trim() ? undefined : "A level needs a name and a level.") : "Nothing has changed yet.")}
          onClick={() => commit(data.portfolio.map((item) => (item.id === node.id ? { ...form, name: form.name.trim(), level: form.level.trim() } : item)), `Saved ${form.name.trim()}.`)}
        >
          Save
        </Button>
        <Button
          icon={<Plus size={16} />}
          unavailableReason={readOnly}
          onClick={() => {
            const level = nextLevel(node.level);
            const id = `node-${Date.now().toString(36)}`;
            commit([...data.portfolio, { id, level, name: `New ${level.toLowerCase()}`, parentId: node.id }], `Added a ${level.toLowerCase()} under ${node.name}.`);
            onSelect(id);
          }}
        >
          Add a level under it
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 size={16} />}
          unavailableReason={readOnly ?? (holds ? `It holds ${holds} ${holds === 1 ? "item" : "items"}; move or remove them first.` : undefined)}
          onClick={() => {
            commit(data.portfolio.filter((item) => item.id !== node.id), `Removed ${node.level.toLowerCase()} “${node.name}”.`, node);
            onSelect(node.parentId);
          }}
        >
          Remove
        </Button>
      </ActionGroup>
    </div>
  );
}

function Portfolio({ data }: { data: CatalogueData }) {
  const [scope] = useScope(data);
  const [params, setParams] = useSearchParams();
  const save = usePortfolioSave(data);
  const selectedId = params.get("node");
  const selected = data.portfolio.find((node) => node.id === selectedId) ?? null;
  const [said, setSaid] = useState<{ message: string; removed?: PortfolioNode } | null>(null);
  const select = (id: string | null) =>
    setParams((previous) => {
      const merged = new URLSearchParams(previous);
      if (id) merged.set("node", id);
      else merged.delete("node");
      return merged;
    }, { replace: true });
  const offeringHref = (id: string) => withScope(`${BASE}/offerings/${id}`, scope);
  const roots = childrenOf(data.portfolio, null);
  const unplaced = data.offerings.filter((offering) => !offering.nodeId || !data.portfolio.some((node) => node.id === offering.nodeId));
  return (
    <>
      <LiveMessage message={said?.message ?? ""} />
      {said?.removed && (
        <p className="arch-callout">
          <span>{said.message}</span>
          <span className="arch-actions">
            <Button
              variant="link"
              busy={save.isPending}
              onClick={() => save.mutate(asApi(data, [...data.portfolio, said.removed!]), { onSuccess: () => setSaid({ message: `Put back ${said.removed!.name}.` }) })}
            >
              Put it back
            </Button>
          </span>
        </p>
      )}
      <div className="arch-portfolio">
        <Section title="Hierarchy">
          <div className="arch-tree-scroll">
            <ul className="arch-tree" aria-label="Portfolio hierarchy">
              {roots.map((node) => (
                <Branch key={node.id} data={data} node={node} selectedId={selectedId} onSelect={select} offeringHref={offeringHref} />
              ))}
            </ul>
          </div>
          {unplaced.length > 0 && (
            <p className="arch-callout">Not placed in the portfolio yet: {unplaced.map((offering) => offering.name).join(", ")}.</p>
          )}
          {data.status === "draft" && (
            <div className="arch-actions">
              <Button
                icon={<Plus size={16} />}
                busy={save.isPending}
                onClick={() => {
                  const id = `node-${Date.now().toString(36)}`;
                  save.mutate(asApi(data, [...data.portfolio, { id, level: "Business unit", name: "New business unit", parentId: null }]), { onSuccess: () => setSaid({ message: "Added a business unit." }) });
                  select(id);
                }}
              >
                Add a business unit
              </Button>
            </div>
          )}
        </Section>
        {selected && (
          <RecordDrawer title={`Edit ${selected.level.toLowerCase()}`} openKey={selected.id} onClose={() => select(null)}>
            <Editor key={`${selected.id}@${data.revision}`} data={data} node={selected} onSelect={select} onSaved={(message, removed) => setSaid({ message, removed })} />
          </RecordDrawer>
        )}
      </div>
    </>
  );
}

/**
 * The portfolio as an architecture hierarchy, laid out left to right:
 * business unit › line of business › segment › family › offerings. Levels are
 * data, so any telecom portfolio fits. Select a level to edit it; each change
 * is saved to the draft.
 */
export function PortfolioPage() {
  return (
    <ArchitectureFrame
      title="Portfolio"
      lead="Where each product sits: Enterprise › Fixed › SMB › product family › product offerings. Select a level to rename it, move it or add a level under it; each change is saved to the draft."
    >
      {(data) => <Portfolio data={data} />}
    </ArchitectureFrame>
  );
}
