import type { CSSProperties } from "react";

import type { GoldenCase } from "../../api/client";
import { count } from "../../home/format";
import { confusion, OUTCOME_LABEL, outcomeOf, systemTroubles, verdictLabel, type Outcome } from "./golden";

const MARK: Record<Outcome, string> = { matches: "✓", partial: "▲", wrong: "✕" };

/** Every case as a square, in id order: the whole golden set at a glance, each one a link to its row. */
export function OutcomeStrip({ cases, onOpen }: { cases: GoldenCase[]; onOpen: (id: string) => void }) {
  const ordered = [...cases].sort((a, b) => a.id.localeCompare(b.id));
  return (
    <ul className="golden-strip" aria-label="Every case and how it went">
      {ordered.map((item) => {
        const outcome = outcomeOf(item);
        return (
          <li key={item.id}>
            <button type="button" className={`golden-square golden-square--${outcome}`} onClick={() => onOpen(item.id)}>
              <span aria-hidden="true">{MARK[outcome]}</span>
              <span className="golden-sr">{item.id}: {OUTCOME_LABEL[outcome]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** What it said (columns) against what a reviewer labelled (rows); the diagonal is right. */
export function VerdictTable({ cases }: { cases: GoldenCase[] }) {
  const rows = confusion(cases);
  const peak = Math.max(1, ...rows.flatMap((row) => row.predicted.map((cell) => cell.count)));
  const columns = rows.length ? rows[0]!.predicted.map((cell) => cell.verdict) : [];
  return (
    <div className="golden-scroll">
      <table className="golden-table">
        <caption className="golden-sr">Expected verdict against predicted verdict, in cases</caption>
        <thead>
          <tr>
            <th scope="col">Expected ↓ · Said →</th>
            {columns.map((verdict) => (
              <th key={String(verdict)} scope="col">{verdictLabel(verdict)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.expected)}>
              <th scope="row">
                {verdictLabel(row.expected)} <span className="golden-muted">· {count(row.total, "case")}</span>
              </th>
              {row.predicted.map((cell) => (
                <td
                  key={String(cell.verdict)}
                  className={cell.verdict === row.expected ? "golden-cell golden-cell--right" : "golden-cell golden-cell--wrong"}
                  style={{ "--golden-weight": cell.count ? 0.1 + (0.25 * cell.count) / peak : 0 } as CSSProperties}
                >
                  {cell.count || <span aria-label="none">·</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ranking({ title, rows, of }: { title: string; rows: { id: string; value: number; total?: number }[]; of: "missed" | "raised" }) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div>
      <h3 className="golden-group__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="golden-muted">None.</p>
      ) : (
        <ol className="golden-ranking">
          {rows.map((row) => (
            <li key={row.id}>
              <code className="golden-ranking__name">{row.id}</code>
              <span className="golden-ranking__track" aria-hidden="true">
                <span className={`golden-ranking__bar golden-ranking__bar--${of}`} style={{ inlineSize: `${(row.value / peak) * 100}%` }} />
              </span>
              <span className="golden-ranking__count">
                {row.value}
                {row.total !== undefined ? ` of ${row.total}` : ""}
                <span className="golden-sr"> {of === "missed" ? "times missed" : "times raised by mistake"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The systems it gets wrong most often, either way: where the catalogue's text or the mapping needs work. */
export function WeakSystems({ cases, limit = 8 }: { cases: GoldenCase[]; limit?: number }) {
  const troubles = systemTroubles(cases);
  const missed = troubles.filter((item) => item.missed > 0).sort((a, b) => b.missed - a.missed || b.missed / b.expected - a.missed / a.expected || a.id.localeCompare(b.id)).slice(0, limit);
  const raised = troubles.filter((item) => item.raised > 0).sort((a, b) => b.raised - a.raised || a.id.localeCompare(b.id)).slice(0, limit);
  return (
    <div className="golden-two">
      <Ranking title="Most often missed" of="missed" rows={missed.map((item) => ({ id: item.id, value: item.missed, total: item.expected }))} />
      <Ranking title="Most often raised by mistake" of="raised" rows={raised.map((item) => ({ id: item.id, value: item.raised }))} />
    </div>
  );
}
