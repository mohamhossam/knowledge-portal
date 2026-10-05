import type { Channel, Offering, SourceConfidence } from "../api/client";
import { CONFIDENCE_OPTIONS } from "./catalogue";
import { AreaField, CheckField, LinesField, Rows, SelectField, TextField } from "./forms";
import { ChannelChoices } from "./OfferingEditor";

type Note = Offering["lifecycle_notes"][number];
type Block = Note["blocks"][number];

const KIND_OPTIONS = [
  { value: "text", label: "Paragraph" },
  { value: "list", label: "List" },
  { value: "table", label: "Table" },
];

/**
 * A table's cells as one line each, "|" between cells, so a table can be typed.
 * Cells keep their spaces while typing, so "From | To" reads back exactly as typed;
 * they are trimmed when the offering is sent.
 */
const toLine = (cells: string[]) => cells.join("|");
const fromLine = (line: string) => line.split("|");

const cut = (text: string, index: number, what: string) => {
  const name = text.trim();
  if (!name) return `${what} ${index + 1}`;
  return `${what} ${name.length > 40 ? `${name.slice(0, 39)}…` : name}`;
};

/** A block's content in the fields its kind needs; changing kind keeps what still fits. */
function BlockFields({ block, change }: { block: Block; change: (patch: Partial<Block>) => void }) {
  if (block.kind === "text") {
    return <AreaField label="Text" value={block.text} required onChange={(text) => change({ text: text || null })} />;
  }
  if (block.kind === "list") {
    return <LinesField label="Items" value={block.items} required hint="One item per line." onChange={(items) => change({ items })} />;
  }
  return (
    <>
      <TextField
        label="Column heads"
        value={toLine(block.columns)}
        required
        wide
        hint="Separated by |, such as From | To | Workflow."
        onChange={(line) => change({ columns: line ? fromLine(line) : [] })}
      />
      <LinesField
        label="Rows"
        value={block.rows.map(toLine)}
        hint="One row per line, cells separated by |."
        onChange={(lines) => change({ rows: lines.map(fromLine) })}
      />
      <TextField label="Caption" value={block.caption} wide onChange={(caption) => change({ caption: caption || null })} />
    </>
  );
}

/**
 * An offering's lifecycle notes in the offering editor: each a titled topic,
 * the order types and channels it concerns (none means every one), how sure
 * its source is, and its content as paragraphs, lists and tables. Controlled.
 */
export function LifecycleEditor({ value, onChange, channels, orderTypes }: {
  value: Note[];
  onChange: (value: Note[]) => void;
  channels: Channel[];
  orderTypes: { code: string; name: string }[];
}) {
  return (
    <Rows<Note>
      legend="Lifecycle notes"
      one="lifecycle note"
      items={value}
      onChange={onChange}
      blank={() => ({ id: "", title: "", order_types: [], channels: [], blocks: [] })}
      labelled
      itemLabel={(item, index) => cut(item.title, index, "note")}
      render={(note, change) => (
        <>
          <TextField label="Title" value={note.title} required wide onChange={(title) => change({ title })} />
          <TextField label="Kind, as the source groups it" value={note.kind} onChange={(kind) => change({ kind: kind || null })} />
          <SelectField
            label="How sure its source is"
            value={note.confidence ?? ""}
            options={CONFIDENCE_OPTIONS}
            onChange={(confidence) => change({ confidence: (confidence || null) as SourceConfidence | null })}
          />
          <TextField label="Source" value={note.source} onChange={(source) => change({ source: source || null })} />
          <AreaField label="Summary" value={note.summary} onChange={(summary) => change({ summary: summary || null })} />
          {orderTypes.length > 0 && (
            <fieldset className="choices form__field--wide">
              <legend className="field__label">For order types (none means all)</legend>
              {orderTypes.map((type) => (
                <CheckField
                  key={type.code}
                  label={type.name}
                  checked={note.order_types.includes(type.code)}
                  onChange={(on) => change({ order_types: on ? [...note.order_types, type.code] : note.order_types.filter((code) => code !== type.code) })}
                />
              ))}
            </fieldset>
          )}
          {channels.length > 0 && (
            <ChannelChoices legend="Only in channels (none means every channel)" channels={channels} chosen={note.channels} onChange={(chosen) => change({ channels: chosen })} />
          )}
          <Rows<Block>
            legend="What it says"
            one={`part of ${note.title.trim() || "this note"}`}
            items={note.blocks}
            onChange={(blocks) => change({ blocks })}
            blank={() => ({ kind: "text", items: [], columns: [], rows: [] })}
            itemLabel={(block, index) => `${(KIND_OPTIONS.find((item) => item.value === block.kind)?.label ?? "part").toLocaleLowerCase()} ${index + 1}${block.title ? ` (${cut(block.title, index, "").trim()})` : ""}`}
            render={(block, edit) => (
              <>
                <SelectField
                  label="Kind of part"
                  value={block.kind}
                  options={KIND_OPTIONS}
                  onChange={(kind) => edit({ kind: kind as Block["kind"] })}
                />
                <TextField label="Its own heading" value={block.title} onChange={(title) => edit({ title: title || null })} />
                <BlockFields block={block} change={edit} />
              </>
            )}
          />
        </>
      )}
    />
  );
}
