import { Link } from "react-router-dom";

import type { CatalogueDiff, Release } from "../api/client";
import { count } from "../home/format";
import { CHANGE_WORD, DIFF_ORDER, connectionSentence, diffSections, fieldsInWords } from "./drafting";

/**
 * A catalogue diff read like a timetable's list of alterations: counts first,
 * then each kind's changes, added, changed, removed.
 */
export function DiffTable({ diff, caption, systemLink, release }: {
  diff: CatalogueDiff;
  caption: string;
  /** The version whose names and connection kinds the changes are said in. */
  release: Release;
  /** Where a changed system's sheet is, when it still exists to read. */
  systemLink?: (key: string) => string | null;
}) {
  const sections = diffSections(diff);
  const counts = (kind: "added" | "changed" | "removed") => diff.changes.filter((change) => change.change === kind).length;
  if (!diff.changes.length) return <p className="timetable__quiet">Nothing differs.</p>;
  return (
    <>
      <div className="notice-table">
        <dl className="notice-table__grid">
          {(["added", "changed", "removed"] as const).map((kind) => (
            <div key={kind} className="notice-table__item">
              <dt>{CHANGE_WORD[kind]}</dt>
              <dd>{counts(kind)}</dd>
            </div>
          ))}
        </dl>
        <p className="notice-table__total">
          {sections
            .map((section) => {
              const order = DIFF_ORDER.find((item) => item.item === section.item)!;
              return count(section.changes.length, order.one.toLocaleLowerCase(), order.many.toLocaleLowerCase());
            })
            .join(", ")}
          .
        </p>
      </div>
      <table className="govtable diff">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">What</th>
            <th scope="col" className="diff__change">Change</th>
          </tr>
        </thead>
        {sections.map((section) => (
          <tbody key={section.item}>
            <tr className="steps__phase">
              <th scope="colgroup" colSpan={2}>{section.label} <span className="govsection__count">{section.changes.length}</span></th>
            </tr>
            {section.changes.map((change) => {
              const to = section.item === "system" && change.change !== "removed" ? systemLink?.(change.key) : null;
              return (
                <tr key={`${change.item}:${change.key}:${change.change}`} className={change.change === "removed" ? "row row--past" : "row"}>
                  <th scope="row" dir="auto">
                    {to ? (
                      <Link to={to}>{change.label}</Link>
                    ) : section.item === "relationship" ? (
                      <ConnectionChange said={connectionSentence(change, release)} />
                    ) : (
                      change.label
                    )}
                  </th>
                  <td>
                    <span className="status">{CHANGE_WORD[change.change]}</span>
                    {change.change === "changed" && change.fields.length > 0 && (
                      <span className="secondary govtable__by">{fieldsInWords(change.fields)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </>
  );
}

function ConnectionChange({ said }: { said: { sentence: string; forWhat: string } }) {
  return (
    <>
      {said.sentence}
      {said.forWhat && <span className="secondary govtable__by" dir="auto">For what: {said.forWhat}</span>}
    </>
  );
}
