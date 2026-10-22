import { memo } from "react";

import { type Column, DataTable } from "../../design/components";
import type { Row } from "../model";

const rowKey = (row: Row) => row.key;
const rowName = (row: Row) => `passage ${row.ordinal}`;

/** The passage grid, memoized: typing a summary or a reason re-renders the desk, not 200 rows. */
export const PassageGrid = memo(function PassageGrid({ caption, columns, rows, total, selected, onSelectedChange, currentId, onCurrentChange, onActivate, onRowKey }: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  total: number;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  currentId: string | undefined;
  onCurrentChange: (id: string) => void;
  onActivate: () => void;
  onRowKey: (row: Row, key: string) => boolean;
}) {
  return (
    <DataTable
      caption={caption}
      captionHidden
      columns={columns}
      rows={rows}
      totalRows={total}
      rowId={rowKey}
      rowLabel={rowName}
      selected={selected}
      onSelectedChange={onSelectedChange}
      currentId={currentId}
      onCurrentChange={onCurrentChange}
      onActivate={onActivate}
      onRowKey={onRowKey}
      emptyText="No passage matches. Change the filter or the find text."
    />
  );
});
