import type { Row } from "../model";
import { labelledCells, tableCells } from "../where";

/** A passage's text: a worksheet row as labelled cells (backlog O-3), else as it reads. */
export function PassageText({ row, headings }: { row: Row; headings: Map<string, Map<string, string>> }) {
  const value = row.draft?.text ?? row.basis ?? "";
  const cells = labelledCells(value, row.where, headings);
  if (cells) {
    return (
      <span className="lib-cells" dir="auto">
        {cells.map((cell, index) => (
          <span key={`${cell.label}-${index}`} className="lib-cells__cell"><span className="lib-cells__label">{cell.label}</span> <bdi>{cell.value}</bdi></span>
        ))}
      </span>
    );
  }
  const plain = tableCells(value);
  return <span>{plain ? plain.map((cell) => cell.value).join(" · ") : value}</span>;
}
