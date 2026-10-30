/**
 * The registers every offering draws on, read and edited on the Offerings page: the portfolio
 * offerings sit in, and the realisation records (CFSS, RFSS, resources) their parts are realised
 * as. Each is edited whole, like the landscape and the channels, and keeps what still names it.
 */
import { useState } from "react";

import type { Release, SourceConfidence } from "../api/client";
import { Button, type Column, DataTable, Section } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { count } from "../home/format";
import { CONFIDENCE_OPTIONS, LAYERS, systemName } from "./catalogue";
import { draftBody } from "./drafting";
import { EditPanel } from "./DraftEdits";
import { BELOW, finishedPortfolio, finishedRecords, portfolioIssue, portfolioRemoveReason, recordRemoveReason, recordsIssue, type RowIssue, savedSame } from "./editing";
import { AreaField, CheckField, LinesField, PickField, Rows, SelectField, TextField } from "./forms";
import { SourceField } from "./SourceField";
import { useCatalogueContext } from "./useCatalogue";
import { useEditing } from "./useEditing";

type PortfolioNode = NonNullable<Release["portfolio"]>[number];
type RealisationRecord = NonNullable<Release["realisations"]>[number];

const layerName = (layer: RealisationRecord["layer"]) => LAYERS.find((entry) => entry.layer === layer)?.short ?? layer;
const LAYER_OPTIONS = LAYERS.map(({ layer, short, long }) => ({ value: layer, label: short === long ? long : `${short}: ${long}` }));

/** A portfolio node's path from the top, "Business unit › Family". */
function pathOf(nodes: Map<string, PortfolioNode>, id: string): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let node = nodes.get(id); node && !seen.has(node.id); node = node.parent_id ? nodes.get(node.parent_id) : undefined) {
    seen.add(node.id);
    names.unshift(node.name);
  }
  return names.join(" › ");
}

/**
 * A register's problem, said at the row's field once Save has been tried: the verb points there,
 * and a problem no field holds (something still naming a row) is said beside the verb.
 */
function useRowIssue(issue: RowIssue | null) {
  const [attempted, setAttempted] = useState(false);
  return {
    problem: issue ? (issue.at ? `Correct ${issue.field} first.` : issue.message) : null,
    errorAt: (index: number, field: string) => (attempted && issue?.at === `${index}.${field}` ? issue.message : null),
    onAttempt: () => setAttempted(true),
  };
}

/** Opening one register's edit in place of its list, and giving focus back to its button on close. */
function useRegisterEdit(id: string) {
  const [editing, setEditing] = useState(false);
  const focusLater = useFocusAfterRender();
  const close = () => {
    focusLater(() => document.getElementById(id));
    setEditing(false);
  };
  return { editing, open: () => setEditing(true), close };
}

/** The portfolio: where each offering sits, from business unit down. */
export function PortfolioRegister() {
  const { book, editable } = useCatalogueContext();
  const release = book.release;
  const nodes = release.portfolio ?? [];
  const { editing, open, close } = useRegisterEdit("register-edit-portfolio");
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const offerings = release.products ?? [];
  type Row = PortfolioNode & { path: string };
  const rows: Row[] = nodes.map((node) => ({ ...node, path: pathOf(byId, node.id) })).sort((a, b) => a.path.localeCompare(b.path));
  // Whether a node is this one or sits somewhere inside it.
  const within = (id: string, ancestor: string) => {
    const seen = new Set<string>();
    for (let node = byId.get(id); node && !seen.has(node.id); node = node.parent_id ? byId.get(node.parent_id) : undefined) {
      if (node.id === ancestor) return true;
      seen.add(node.id);
    }
    return false;
  };
  const columns: Column<Row>[] = [
    { id: "node", header: "Node", rowHeader: true, bidi: true, cell: (row) => <>{row.path}{row.deprecated && <span className="cat-detail">Retired</span>}</> },
    { id: "level", header: "Level", bidi: true, cell: (row) => row.level },
    // Counted with the nodes inside it, so a business unit says what all its families hold.
    { id: "offerings", header: "Offerings in it", numeric: true, cell: (row) => offerings.filter((item) => item.portfolio_node_id && within(item.portfolio_node_id, row.id)).length },
  ];
  return (
    <Section
      title="Portfolio"
      count={nodes.length}
      headingLevel={2}
      actions={editable && !editing ? <Button id="register-edit-portfolio" variant="quiet" onClick={open}>Edit the portfolio</Button> : undefined}
    >
      {editing ? (
        <PortfolioEdit onDone={close} />
      ) : rows.length ? (
        <DataTable caption="The portfolio, from the top down" captionHidden columns={columns} rows={rows} rowId={(row) => row.id} />
      ) : (
        <p className="cat-quiet">This version has no portfolio yet{editable ? "; add its business units and families here." : "."}</p>
      )}
    </Section>
  );
}

function PortfolioEdit({ onDone }: { onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [original] = useState<PortfolioNode[]>(() => release.portfolio ?? []);
  const [items, setItems] = useState<PortfolioNode[]>(original);
  const finished = finishedPortfolio(items, release);
  const byId = new Map(finished.map((node) => [node.id, node]));
  const { problem, errorAt, onAttempt } = useRowIssue(portfolioIssue(items, release));
  // A node sits inside any other but itself; a loop it would make is said before saving.
  const places = (self: string) => [
    { value: "", label: "At the top" },
    ...finished.filter((node) => node.id !== self && node.name).map((node) => ({ value: node.id, label: pathOf(byId, node.id) })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const successors = (self: string) => [
    { value: "", label: "Nothing replaces it" },
    ...finished.filter((node) => node.id !== self && !node.deprecated && node.name).map((node) => ({ value: node.id, label: pathOf(byId, node.id) })),
  ];
  return (
    <EditPanel
      title="Edit the portfolio"
      focusOnOpen
      action="Save the portfolio"
      busy={saveDraft.isPending}
      problem={problem}
      changes={savedSame(finishedPortfolio(original, release), finished) ? [] : ["the portfolio"]}
      onAttempt={onAttempt}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => saveDraft.mutate(draftBody(release, { portfolio: finished }), { onSuccess: onDone })}
    >
      <Rows<PortfolioNode>
        legend="Portfolio nodes"
        one="portfolio node"
        labelled
        items={items}
        onChange={setItems}
        blank={() => ({ id: "", name: "", level: "", deprecated: false, accepted: [] })}
        itemLabel={(node, index) => `node ${node.name.trim() || index + 1}`}
        // A node an offering or another node sits in stays: retiring it keeps it readable.
        removeReason={(node) => portfolioRemoveReason(node, items, release)}
        render={(node, update, index) => (
          <>
            <TextField label="Name" value={node.name} required error={errorAt(index, "name")} onChange={(name) => update({ name })} />
            <TextField
              label="Level"
              value={node.level}
              required
              hint="In the operator's words, such as business unit or family."
              error={errorAt(index, "level")}
              onChange={(level) => update({ level })}
            />
            <SelectField
              label="Inside"
              value={node.parent_id ?? ""}
              options={places(finished[index]?.id ?? "")}
              error={errorAt(index, "parent_id")}
              onChange={(parent_id) => update({ parent_id: parent_id || null })}
            />
            <AreaField label="What it covers" value={node.description} onChange={(description) => update({ description: description || null })} />
            <CheckField label="Retired: still readable, no new offering placed in it" checked={node.deprecated} onChange={(deprecated) => update({ deprecated })} />
            {node.deprecated && (
              <SelectField label="Replaced by" value={node.replaced_by ?? ""} options={successors(finished[index]?.id ?? "")} onChange={(replaced_by) => update({ replaced_by: replaced_by || null })} />
            )}
          </>
        )}
      />
    </EditPanel>
  );
}

/** The realisation records: the services and resources offering parts are realised as, and what realises each. */
export function RecordsRegister() {
  const { book, editable } = useCatalogueContext();
  const release = book.release;
  const records = release.realisations ?? [];
  const { editing, open, close } = useRegisterEdit("register-edit-records");
  const byId = new Map(records.map((record) => [record.id, record]));
  const uses = (id: string) =>
    (release.products ?? []).reduce((sum, offering) => sum + offering.components.filter((part) => (part.realisation ?? []).some((item) => item.record_id === id)).length, 0);
  const order = LAYERS.map((entry) => entry.layer);
  const rows = [...records].sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer) || a.name.localeCompare(b.name));
  const columns: Column<RealisationRecord>[] = [
    {
      id: "record",
      header: "Record",
      rowHeader: true,
      bidi: true,
      cell: (record) => (
        <>
          {record.name}
          {record.aliases.length > 0 && <span className="cat-detail">Also called <bdi>{record.aliases.join(", ")}</bdi></span>}
        </>
      ),
    },
    { id: "layer", header: "Layer", cell: (record) => layerName(record.layer) },
    {
      id: "below",
      header: "Realised by",
      bidi: true,
      cell: (record) => (record.realised_by.length ? record.realised_by.map((id) => byId.get(id)?.name ?? id).join(", ") : <span className="cat-quiet">Nothing recorded</span>),
    },
    {
      id: "systems",
      header: "Delivered by",
      bidi: true,
      cell: (record) => (record.system_ids.length ? record.system_ids.map((id) => systemName(book, id)).join(", ") : <span className="cat-quiet">No system recorded</span>),
    },
    { id: "rules", header: "Rules", numeric: true, cell: (record) => record.rules.length },
    { id: "parts", header: "Parts linked", numeric: true, cell: (record) => uses(record.id) },
  ];
  return (
    <Section
      title="Realisation records"
      count={records.length}
      headingLevel={2}
      actions={editable && !editing ? <Button id="register-edit-records" variant="quiet" onClick={open}>Edit the realisation records</Button> : undefined}
    >
      {editing ? (
        <RecordsEdit onDone={close} />
      ) : rows.length ? (
        <>
          <p className="cat-lead">{count(rows.length, "record")}: the services and resources offering parts are realised as.</p>
          <DataTable caption="Realisation records" captionHidden columns={columns} rows={rows} rowId={(record) => record.id} />
        </>
      ) : (
        <p className="cat-quiet">This version has no realisation record yet{editable ? "; add one here, then link parts to it." : "."}</p>
      )}
    </Section>
  );
}

function RecordsEdit({ onDone }: { onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [original] = useState<RealisationRecord[]>(() => release.realisations ?? []);
  const [items, setItems] = useState<RealisationRecord[]>(original);
  const finished = finishedRecords(items, release);
  const { problem, errorAt, onAttempt } = useRowIssue(recordsIssue(items, release));
  const systems = [...release.systems].map((system) => ({ value: system.id, label: system.name })).sort((a, b) => a.label.localeCompare(b.label));
  // What realises a record is one of the layers below it; one chosen that no longer is, after a layer change, stays shown and is said to be wrong.
  const below = (self: RealisationRecord, index: number) =>
    finished
      .filter((record, at) => at !== index && record.name && (BELOW[self.layer].includes(record.layer) || self.realised_by.includes(record.id)))
      .map((record) => ({
        value: record.id,
        label: BELOW[self.layer].includes(record.layer) ? record.name : `${record.name} (not below it)`,
        group: layerName(record.layer),
      }));
  return (
    <EditPanel
      title="Edit the realisation records"
      focusOnOpen
      action="Save the realisation records"
      busy={saveDraft.isPending}
      problem={problem}
      changes={savedSame(finishedRecords(original, release), finished) ? [] : ["the realisation records"]}
      onAttempt={onAttempt}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => saveDraft.mutate(draftBody(release, { realisations: finished }), { onSuccess: onDone })}
    >
      <Rows<RealisationRecord>
        legend="Realisation records"
        one="realisation record"
        labelled
        items={items}
        onChange={setItems}
        blank={() => ({ id: "", name: "", layer: "cfs", aliases: [], system_ids: [], realised_by: [], rules: [], accepted: [] })}
        itemLabel={(record, index) => `${layerName(record.layer)} ${record.name.trim() || index + 1}`}
        // A record a part is realised as, or another record is realised by, stays until that changes.
        removeReason={(record) => recordRemoveReason(record, items, release)}
        render={(record, update, index) => (
          <>
            <SelectField
              label="Layer"
              value={record.layer}
              options={LAYER_OPTIONS}
              error={errorAt(index, "layer")}
              // What realised it stays chosen; any that no longer sits below the new layer is marked, and stops the save.
              onChange={(layer) => update({ layer: layer as RealisationRecord["layer"] })}
            />
            {record.layer === "resource" && (record.rules.some((rule) => rule.trim()) || record.realised_by.length > 0) && (
              <p className="ds-field__hint cat-form__wide">
                A resource is realised by nothing below it and holds no specification rules: saving lets go of what it had.
              </p>
            )}
            <TextField label="Name" value={record.name} required wide error={errorAt(index, "name")} onChange={(name) => update({ name })} />
            <LinesField
              label="Other names"
              value={record.aliases}
              hint="One per line: other names its sources use."
              error={errorAt(index, "aliases")}
              onChange={(aliases) => update({ aliases })}
            />
            <PickField label="Delivered by" chosen={record.system_ids} options={systems} onChange={(system_ids) => update({ system_ids })} />
            {record.layer !== "resource" && (
              <>
                <PickField
                  label="Realised by"
                  hint="Records of the layers below it."
                  chosen={record.realised_by}
                  options={below(record, index)}
                  error={errorAt(index, "realised_by")}
                  onChange={(realised_by) => update({ realised_by })}
                />
                <LinesField
                  label="Specification rules"
                  value={record.rules}
                  hint="One per line, as its sources state them."
                  error={errorAt(index, "rules")}
                  onChange={(rules) => update({ rules })}
                />
              </>
            )}
            <AreaField label="What it is" value={record.description} onChange={(description) => update({ description: description || null })} />
            <SourceField value={record.source} previous={items[index - 1]} onCopy={update} onChange={(source) => update({ source })} />
            <SelectField
              label="How sure its source is"
              value={record.confidence ?? ""}
              options={CONFIDENCE_OPTIONS}
              onChange={(confidence) => update({ confidence: (confidence || null) as SourceConfidence | null })}
            />
          </>
        )}
      />
    </EditPanel>
  );
}
