import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, RotateCcw } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";

import { api } from "../api/client";
import { errorMessage } from "../api/errors";
import type { Draft, Row } from "./model";

const STATUS: Record<Row["change"], string> = {
  same: "Kept",
  edited: "Edited",
  excluded: "Excluded",
  new: "New",
  removed: "Removed",
};

export type Focus = { key: string; open: boolean; target?: "text" | "reason" | "original" };

type Props = {
  documentId: string;
  versionId: string;
  versionNumber: number;
  rows: Row[];
  shown: number;
  onMore: () => void;
  basisLabel: string;
  workingLabel: string;
  focus: Focus | null;
  onFocus: (focus: Focus | null) => void;
  onChange: (blockId: string, patch: Partial<Draft>) => void;
};

/**
 * The passages, one aligned row each: the comparison text, the working text,
 * and what is decided about it. The focused row opens in place.
 *
 * Keys on a row: j or ↓ next, k or ↑ previous, Enter open or close,
 * x exclude (and give the reason), i include, e edit the text, o show the
 * original, Esc close.
 */
export function PassageTable({
  documentId, versionId, versionNumber, rows, shown, onMore, basisLabel, workingLabel, focus, onFocus, onChange,
}: Props) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const visible = rows.slice(0, shown);
  const focusedIndex = focus ? visible.findIndex((row) => row.key === focus.key) : -1;

  useEffect(() => {
    if (!focus || focus.target) return;
    const element = rowRefs.current.get(focus.key);
    if (element && document.activeElement !== element) {
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest" });
    }
  }, [focus]);

  const move = (step: number) => {
    const index = Math.min(rows.length - 1, Math.max(0, (focusedIndex < 0 ? -1 : focusedIndex) + step));
    if (index >= shown) onMore();
    const next = rows[index];
    if (next) onFocus({ key: next.key, open: focus?.open ?? false });
  };

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const editable = row.draft !== null && row.block !== null;
    const key = event.key;
    const handled = (() => {
      if (key === "j" || key === "ArrowDown") return move(1), true;
      if (key === "k" || key === "ArrowUp") return move(-1), true;
      if (key === "Enter") return onFocus({ key: row.key, open: !(focus?.key === row.key && focus.open) }), true;
      if (key === "Escape") return onFocus({ key: row.key, open: false }), true;
      if (key === "o" && row.block) return onFocus({ key: row.key, open: true, target: "original" }), true;
      if (!editable) return false;
      if (key === "x") {
        onChange(row.key, { included: false });
        return onFocus({ key: row.key, open: true, target: "reason" }), true;
      }
      if (key === "i") return onChange(row.key, { included: true }), true;
      if (key === "e") return onFocus({ key: row.key, open: true, target: "text" }), true;
      return false;
    })();
    if (handled) event.preventDefault();
  };

  return (
    <table className="passages">
      <caption className="visually-hidden">
        Passages of version {versionNumber}: {basisLabel} against {workingLabel}
      </caption>
      <thead>
        <tr>
          <th scope="col" className="cell cell--end passages__number">No.</th>
          <th scope="col" className="cell cell--p3 passages__where">Where</th>
          <th scope="col" className="cell cell--p2 passages__basis">{basisLabel}</th>
          <th scope="col" className="cell passages__working">{workingLabel}</th>
          <th scope="col" className="cell passages__status">Status</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((row) => {
          const isFocused = focus?.key === row.key;
          const open = isFocused && focus.open;
          return (
            <PassageRows
              key={row.key}
              row={row}
              open={open}
              focusable={isFocused || (focusedIndex < 0 && row === visible[0])}
              target={open ? focus.target : undefined}
              documentId={documentId}
              versionId={versionId}
              versionNumber={versionNumber}
              rowRef={(element) => {
                if (element) rowRefs.current.set(row.key, element);
                else rowRefs.current.delete(row.key);
              }}
              onKeyDown={(event) => onRowKey(event, row)}
              onEnter={() => {
                // Tab or a click made this the current row; keys now move from here.
                if (!isFocused) onFocus({ key: row.key, open: false });
              }}
              onSelect={() => onFocus({ key: row.key, open: !open })}
              onOpen={() => onFocus({ key: row.key, open: true })}
              onClose={() => onFocus({ key: row.key, open: false })}
              onChange={(patch) => onChange(row.key, patch)}
            />
          );
        })}
        {rows.length > shown && (
          <tr className="row row--more">
            <td colSpan={5}>
              Showing {shown} of {rows.length} passages.{" "}
              <button type="button" className="text-button" onClick={onMore}>Show {Math.min(200, rows.length - shown)} more</button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function PassageRows({
  row, open, focusable, target, documentId, versionId, versionNumber, rowRef, onKeyDown, onEnter, onSelect, onOpen, onClose,
  onChange,
}: {
  row: Row;
  open: boolean;
  focusable: boolean;
  target?: Focus["target"];
  documentId: string;
  versionId: string;
  versionNumber: number;
  rowRef: (element: HTMLTableRowElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
  onEnter: () => void;
  onSelect: () => void;
  onOpen: () => void;
  onClose: () => void;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const blocking = row.blocking;
  const flagged = row.warnings.length > 0;
  return (
    <>
      <tr
        ref={rowRef}
        tabIndex={focusable ? 0 : -1}
        className={[
          "passage",
          `passage--${row.change}`,
          blocking ? "passage--blocking" : "",
          open ? "is-open" : "",
        ].filter(Boolean).join(" ")}
        aria-expanded={open}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.target === event.currentTarget) onEnter();
        }}
        onClick={onSelect}
      >
        <th scope="row" className="cell cell--end passages__number">{row.ordinal}</th>
        <td className="cell cell--p3 passages__where">{row.where}</td>
        <td className="cell cell--p2 passages__basis" dir="auto"><span className="clamp">{row.basis ?? "—"}</span></td>
        <td className="cell passages__working" dir="auto">
          <span className="clamp">{row.draft ? row.draft.text : "—"}</span>

          {row.draft && !row.draft.included && row.draft.reason && (
            <span className="passages__reason">Excluded: {row.draft.reason}</span>
          )}
        </td>
        <td className="cell passages__status">
          <span className="status">{STATUS[row.change]}</span>
          {row.change === "edited" && (
              <sup className="mark-wrap mark-wrap--button">
                <button
                  type="button"
                  className="mark mark--button"
                  aria-label={`Show what passage ${row.ordinal} was edited from`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen();
                  }}
                >
                  e
                </button>
              </sup>
          )}
          {flagged && (
            <span className={blocking ? "passages__flag passages__flag--blocking" : "passages__flag"}>
              {blocking
                ? "Blocking warning"
                : row.warnings.some((item) => item.severity === "blocking")
                  ? "Blocking warning, excluded"
                  : row.warnings.some((item) => item.severity === "warning") ? "Warning" : "Note"}
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="passage-detail">
          <td colSpan={5}>
            <PassageDetail
              row={row}
              target={target}
              documentId={documentId}
              versionId={versionId}
              versionNumber={versionNumber}
              onClose={onClose}
              onChange={onChange}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function PassageDetail({ row, target, documentId, versionId, versionNumber, onClose, onChange }: {
  row: Row;
  target?: Focus["target"];
  documentId: string;
  versionId: string;
  versionNumber: number;
  onClose: () => void;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (target === "text") textRef.current?.focus();
    if (target === "reason") reasonRef.current?.focus();
  }, [target]);

  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  if (!row.block || !row.draft) {
    return (
      <p className="detail__removed">
        This passage is in service now and has no counterpart in version {versionNumber}. Requirement work keeps
        citing it until version {versionNumber} is approved.
      </p>
    );
  }
  const { block, draft } = row;
  const extracted = block.text ?? null;
  const id = `passage-${block.id}`;
  return (
    <div className="detail" onKeyDown={escape}>
      <div className="detail__source">
        <SourcePreview
          documentId={documentId}
          versionId={versionId}
          blockId={block.id}
          location={block.label}
          autoload={target === "original"}
        />
        {row.basis !== null && row.basis.trim() !== draft.text.trim() && (
          <div className="detail__extracted">
            <p className="detail__label">Edited from</p>
            <p dir="auto">{row.basis}</p>
          </div>
        )}
        {extracted !== null && extracted.trim() !== draft.text.trim() && extracted !== row.basis && (
          <div className="detail__extracted">
            <p className="detail__label">As extracted</p>
            <p dir="auto">{extracted}</p>
          </div>
        )}
        {row.warnings.length > 0 && (
          <ul className="detail__warnings">
            {row.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`} className={warning.severity === "blocking" ? "is-blocking" : undefined}>
                <span className="status">{warning.severity === "blocking" ? "Blocking" : warning.severity === "warning" ? "Warning" : "Note"}</span>{" "}
                {warning.message}
                {warning.severity === "blocking" && " Exclude this passage with a reason and save, or upload a new version."}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="detail__decision">
        <label className="check">
          <input
            type="checkbox"
            checked={draft.included}
            onChange={(event) => onChange({ included: event.target.checked })}
          />
          Include in the publication
        </label>
        {!draft.included && (
          <label className="field" htmlFor={`${id}-reason`}>
            <span className="field__label">Why it is excluded</span>
            <input
              id={`${id}-reason`}
              ref={reasonRef}
              className="field__input"
              value={draft.reason}
              maxLength={10000}
              onChange={(event) => onChange({ reason: event.target.value })}
            />
          </label>
        )}
        <label className="field" htmlFor={`${id}-text`}>
          <span className="field__label">Text to publish</span>
          <textarea
            id={`${id}-text`}
            ref={textRef}
            className="field__input field__input--text"
            dir="auto"
            rows={Math.min(12, Math.max(3, Math.ceil(draft.text.length / 90)))}
            value={draft.text}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        </label>
        {extracted !== null && extracted !== draft.text && (
          <button type="button" className="text-button" onClick={() => onChange({ text: extracted })}>
            <RotateCcw size={14} aria-hidden="true" />
            Restore the extracted text
          </button>
        )}
      </div>
    </div>
  );
}

/** The passage in the original file, rendered by the service, on request. */
function SourcePreview({ documentId, versionId, blockId, location, autoload }: {
  documentId: string;
  versionId: string;
  blockId: string;
  location: string;
  autoload: boolean;
}) {
  const preview = useQuery({
    queryKey: ["library", "preview", versionId, blockId],
    queryFn: () => api.originalPreview(documentId, versionId, blockId),
    enabled: autoload,
    staleTime: Infinity,
    retry: false,
  });
  if (!preview.data && !preview.isFetching && !preview.isError) {
    return (
      <button type="button" className="text-button" onClick={() => void preview.refetch()}>
        <ImageIcon size={14} aria-hidden="true" />
        Show the original at {location}
      </button>
    );
  }
  if (preview.isFetching) return <p className="detail__note" role="status">Rendering the original…</p>;
  if (preview.isError) {
    return (
      <p className="detail__note detail__note--failed" role="alert">
        The original could not be shown: {errorMessage(preview.error)}{" "}
        <button type="button" className="text-button" onClick={() => void preview.refetch()}>Try again</button>
      </p>
    );
  }
  return (
    <figure className="detail__original">
      {preview.data?.image_data ? (
        <img src={preview.data.image_data} alt={`The original at ${preview.data.location}`} />
      ) : null}
      <figcaption>{preview.data?.explanation}</figcaption>
    </figure>
  );
}
