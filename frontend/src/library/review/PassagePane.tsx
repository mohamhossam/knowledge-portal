import { RotateCcw } from "lucide-react";

import { ActionGroup, Button, KeysHint, Status, TextArea, TextField } from "../../design/components";
import { openShortcuts } from "../../shell/shortcuts";
import type { Draft, Row } from "../model";
import { humanWhere } from "../where";
import { CHANGE_WORD } from "./columns";
import { OriginalPreview } from "./OriginalPreview";
import { PassageText } from "./PassageText";

/**
 * The current passage in full, in the pane beside the grid: its warnings, its text or the
 * editor, what it was before, and the decisions on it (plan 02 §1).
 */
export function PassagePane({
  current, documentId, versionId, versionNumber, headings, seen, comparedWithEdition, liveNumber, editing, original, saveFailed,
  onChange, onExclude, onInclude, onEdit, onEditingChange, onOriginalChange, goNext, focusRow,
}: {
  current: Row | undefined;
  documentId: string;
  versionId: string;
  versionNumber: number;
  headings: Map<string, Map<string, string>>;
  seen: ReadonlySet<string>;
  /** Compared with the version in service, not with the text as read. */
  comparedWithEdition: boolean;
  liveNumber: number | undefined;
  editing: boolean;
  /** The passage whose original is shown. */
  original: string | null;
  saveFailed: boolean | undefined;
  onChange: (key: string, patch: Partial<Draft>) => void;
  onExclude: (row: Row) => void;
  onInclude: (row: Row) => void;
  onEdit: () => void;
  onEditingChange: (editing: boolean) => void;
  onOriginalChange: (key: string | null) => void;
  goNext: (from: Row, backward: boolean) => boolean;
  focusRow: (key?: string) => void;
}) {
  if (!current) return <p className="lib-quiet">Choose a passage to see it in full.</p>;
  if (!current.draft) {
    return (
      <>
        <h2 className="ds-section__title">Passage {current.ordinal}, removed</h2>
        <p className="lib-quiet">{humanWhere(current.where)}</p>
        <p dir="auto" className="lib-passage lib-passage--muted">{current.basis}</p>
        <p>It is in service now and has no counterpart in version {versionNumber}. Requirement work keeps citing it until version {versionNumber} is published.</p>
      </>
    );
  }
  return (
    <>
      <h2 className="ds-section__title">Passage {current.ordinal}</h2>
      <p className="lib-quiet">{humanWhere(current.where)}{seen.has(current.key) ? " · seen" : ""}{current.change !== "same" ? ` · ${CHANGE_WORD[current.change].toLocaleLowerCase()}` : ""}</p>
      {current.warnings.map((warning, index) => (
        <p key={`${warning.code}-${index}`} className="lib-warning">
          <Status tone={warning.severity === "blocking" ? "attention" : "warning"}>{warning.severity === "blocking" ? (current.blocking ? "Blocks approval" : "Blocked approval, now excluded") : "Flagged"}</Status>{" "}
          {warning.message}
          {warning.severity === "blocking" && current.blocking && " Exclude this passage with a reason and save, or upload a new version."}
        </p>
      ))}
      {editing ? (
        <TextArea
          name="desk-edit"
          label="Text to publish"
          hint="Esc goes back to the passage list."
          rows={Math.min(12, Math.max(4, Math.ceil(current.draft.text.length / 70)))}
          value={current.draft.text}
          onChange={(event) => onChange(current.key, { text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onEditingChange(false);
              focusRow();
            }
          }}
        />
      ) : (
        <div className="lib-passage" dir="auto"><PassageText row={current} headings={headings} /></div>
      )}
      {current.basis !== null && current.basis.trim() !== current.draft.text.trim() && (
        <div className="lib-basis">
          <p className="lib-quiet">{comparedWithEdition ? `In service now (version ${liveNumber ?? "?"})` : "As read from the file"}</p>
          <p dir="auto" className="lib-passage lib-passage--muted">{current.basis}</p>
        </div>
      )}
      <ActionGroup label={`Decide passage ${current.ordinal}`}>
        {current.draft.included ? (
          <Button aria-keyshortcuts="x" onClick={() => onExclude(current)}>Exclude (x)</Button>
        ) : (
          <Button aria-keyshortcuts="i" onClick={() => onInclude(current)}>Include (i)</Button>
        )}
        <Button aria-keyshortcuts="e" aria-expanded={editing} onClick={() => (editing ? onEditingChange(false) : onEdit())}>{editing ? "Done editing" : "Edit (e)"}</Button>
        {current.block?.text != null && current.block.text !== current.draft.text && (
          <Button variant="quiet" icon={<RotateCcw size={14} />} onClick={() => onChange(current.key, { text: current.block!.text! })}>Restore the text as read</Button>
        )}
        <Button aria-keyshortcuts="o" aria-expanded={original === current.key} onClick={() => onOriginalChange(original === current.key ? null : current.key)}>
          {original === current.key ? "Hide the original" : "Show the original (o)"}
        </Button>
      </ActionGroup>
      {!current.draft.included && (
        <TextField
          name="desk-reason"
          label="Why exclude it?"
          hint="The document's reviewers see this. Enter goes on to the next passage to check; Esc back to this one."
          required
          maxLength={10000}
          value={current.draft.reason}
          error={saveFailed && !current.draft.reason.trim() ? "Give a reason: the document's reviewers see it." : null}
          onChange={(event) => onChange(current.key, { reason: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== "Escape" && event.key !== "Enter") return;
            event.preventDefault();
            // A decision with its reason is done: on to the next row that needs one (§1). Without
            // a reason it isn't, so focus goes back to the row; Esc always does.
            if (event.key === "Enter" && current.draft?.reason.trim() && goNext(current, false)) return;
            focusRow();
          }}
        />
      )}
      {original === current.key && current.block && <OriginalPreview documentId={documentId} versionId={versionId} blockId={current.block.id} where={humanWhere(current.where)} />}
      {/* The grid's keys, said once beside it in the record (§2.2), so the list keeps its rows. */}
      <KeysHint
        onMore={openShortcuts}
        keys={[
          { keys: ["↑", "↓", "j", "k"], does: "move" },
          { keys: ["n"], does: "next to check" },
          { keys: ["x", "i"], does: "exclude, include" },
          { keys: ["e"], does: "edit" },
          { keys: ["o"], does: "original" },
          { keys: ["Space"], does: "select" },
          { keys: ["Ctrl+Enter"], does: "save" },
        ]}
      />
    </>
  );
}
