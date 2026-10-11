import { Minus, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type { CatalogueDiff, Release } from "../../api/client";
import { type Column, DataTable, FilterStrip } from "../../design/components";
import { count } from "../../home/format";
import { RouterLink } from "../../shell/links";
import { CHANGE_WORD, DIFF_ORDER, connectionSentence, diffSections, fieldsInWords } from "../drafting";

type Row = { key: string; item: string; kind: string; change: "added" | "changed" | "removed"; what: string; detail: string; to: string | null };

const ICON = { added: Plus, changed: RefreshCw, removed: Minus } as const;

/**
 * A catalogue diff as a ledger: the counts first, then one row per change with
 * its kind of item, what happened to it (an icon and a word, never colour) and
 * what changed, filterable by kind. Removed rows keep full weight.
 */
export function ChangeTable({ diff, release, caption, systemLink }: {
  diff: CatalogueDiff;
  /** The version whose names and connection kinds the changes are said in. */
  release: Release;
  caption: string;
  /** Where a changed system's sheet is, when it still exists to read. */
  systemLink?: (key: string) => string | null;
}) {
  const [kind, setKind] = useState("all");
  const [find, setFind] = useState("");
  const sections = useMemo(() => diffSections(diff), [diff]);
  const rows = useMemo<Row[]>(
    () =>
      sections.flatMap((section) => {
        const one = DIFF_ORDER.find((order) => order.item === section.item)!.one;
        return section.changes.map((change) => {
          const said = section.item === "relationship" ? connectionSentence(change, release) : null;
          return {
            key: `${change.item}:${change.key}:${change.change}`,
            item: section.item,
            kind: one,
            change: change.change,
            what: said?.sentence ?? change.label,
            detail: [said?.forWhat ? `For what: ${said.forWhat}` : "", change.change === "changed" && change.fields.length ? `Its ${fieldsInWords(change.fields)}` : ""]
              .filter(Boolean)
              .join(". "),
            to: section.item === "system" && change.change !== "removed" ? systemLink?.(change.key) ?? null : null,
          };
        });
      }),
    [sections, release, systemLink],
  );
  const wanted = find.trim().toLocaleLowerCase();
  const shown = rows.filter((row) => (kind === "all" || row.item === kind) && (!wanted || `${row.what} ${row.detail}`.toLocaleLowerCase().includes(wanted)));
  const tally = (change: Row["change"]) => rows.filter((row) => row.change === change).length;

  if (!rows.length) return <p className="draft-quiet">Nothing differs.</p>;
  return (
    <div className="draft-changes">
      <p className="draft-changes__summary">
        <strong className="ds-num">{tally("added").toLocaleString("en")}</strong> added ·{" "}
        <strong className="ds-num">{tally("changed").toLocaleString("en")}</strong> changed ·{" "}
        <strong className="ds-num">{tally("removed").toLocaleString("en")}</strong> removed
        <span className="draft-quiet">
          {": "}
          {sections.map((section) => {
            const order = DIFF_ORDER.find((item) => item.item === section.item)!;
            return count(section.changes.length, order.one.toLocaleLowerCase(), order.many.toLocaleLowerCase());
          }).join(", ")}
        </span>
      </p>
      {(sections.length > 1 || rows.length > 8) && (
        <FilterStrip
          label="Show changes to"
          filters={[
            { id: "all", label: "Everything", count: rows.length },
            ...sections.map((section) => ({ id: section.item, label: section.label, count: section.changes.length })),
          ]}
          active={kind}
          onChange={setKind}
          find={{ label: "Find in the changes", value: find, onChange: setFind, placeholder: "A name or a word…" }}
          onClear={kind !== "all" || find ? () => { setKind("all"); setFind(""); } : undefined}
        />
      )}
      <DataTable caption={caption} captionHidden columns={COLUMNS} rows={shown} rowId={(row) => row.key} emptyText="No change matches. Change the filter or the find text." />
    </div>
  );
}

const COLUMNS: Column<Row>[] = [
  {
    id: "what",
    header: "What",
    rowHeader: true,
    bidi: true,
    cell: (row) => (
      <>
        {row.to ? <RouterLink href={row.to}>{row.what}</RouterLink> : row.what}
        {row.detail && <span className="draft-detail" dir="auto">{row.detail}</span>}
      </>
    ),
  },
  { id: "kind", header: "Kind", width: "11rem", cell: (row) => row.kind },
  {
    id: "change",
    header: "Change",
    width: "8rem",
    cell: (row) => {
      const Icon = ICON[row.change];
      return <span className="draft-change"><Icon size={14} aria-hidden="true" /> {CHANGE_WORD[row.change]}</span>;
    },
  },
];
