import { Check } from "lucide-react";

import { type Column, Status } from "../../design/components";
import type { Row } from "../model";
import { humanWhere } from "../where";
import { PassageText } from "./PassageText";

export const CHANGE_WORD: Record<Row["change"], string> = { same: "Kept", edited: "Edited", excluded: "Excluded", new: "New", removed: "Removed" };

export function passageColumns(seen: ReadonlySet<string>, headings: Map<string, Map<string, string>>): Column<Row>[] {
  return [
    {
      id: "where",
      header: "Where",
      rowHeader: true,
      width: "8.5rem",
      cell: (row) => (
        <>
          {humanWhere(row.where)}
          {/* Seen is shown on the row too (a mark, never colour alone), so the reviewer sees their trail. */}
          {seen.has(row.key) ? <Check size={12} aria-hidden="true" className="lib-seen" /> : <span className="ds-visually-hidden">, not seen</span>}
        </>
      ),
    },
    {
      id: "text",
      header: "Text",
      bidi: true,
      cell: (row) => (
        <span className={`lib-cell-text${row.draft && !row.draft.included ? " lib-excluded" : ""}`}>
          <PassageText row={row} headings={headings} />
          {row.draft && !row.draft.included && row.draft.reason && <span className="lib-detail lib-detail--plain">Excluded: <bdi>{row.draft.reason}</bdi></span>}
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      width: "10rem",
      cell: (row) => (
        <span className="lib-state">
          {row.blocking ? <Status tone="attention">Blocks approval</Status> : row.warnings.length ? <Status tone="warning">Flagged</Status> : null}
          <span>{CHANGE_WORD[row.change]}</span>
        </span>
      ),
    },
  ];
}
