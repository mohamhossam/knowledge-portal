import { useState } from "react";

import type { GoldenRunSummary } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { Button, Select, Skeleton, Status } from "../../design/components";
import { ALL_SCORES, compareCases, percent, points, runLabel, scoreView, useGoldenRun } from "./golden";

/** Two runs of the golden set side by side: each score's change, and the cases that got better or worse. */
export function CompareRuns({ runs, current, onOpenCase }: { runs: GoldenRunSummary[]; current: GoldenRunSummary; onOpenCase: (id: string) => void }) {
  const finished = runs.filter((run) => run.result !== null);
  const [againstId, setAgainstId] = useState<string>("");
  const against = finished.find((run) => run.id === againstId);
  const before = useGoldenRun(against?.id, false);
  const after = useGoldenRun(current.id, false);
  const others = finished.filter((run) => run.id !== current.id);
  if (!others.length) return <p className="golden-muted">Compare needs a second finished run.</p>;
  const a = before.data?.result;
  const b = after.data?.result;
  const comparable = a && b && a.provider === b.provider && a.golden_set_version === b.golden_set_version;
  const cases = a && b ? compareCases(a.repetitions[0]!.cases, b.repetitions[0]!.cases) : undefined;
  return (
    <div className="golden-compare">
      <Select label="Compare this run with" value={againstId} onChange={(event) => setAgainstId(event.target.value)}>
        <option value="">Choose a run…</option>
        {others.map((run) => (
          <option key={run.id} value={run.id}>{runLabel(run)}</option>
        ))}
      </Select>
      {before.isError && <p role="alert"><Status tone="attention">{errorMessage(before.error)}</Status></p>}
      {against && (before.isPending || after.isPending) && <Skeleton label="Reading both runs" rows={4} />}
      {a && b && (
        <>
          {!comparable && (
            <p role="note"><Status tone="warning">These runs used a different kind of model or a different golden set, so their scores do not answer the same question.</Status></p>
          )}
          <table className="golden-table">
            <caption className="ds-visually-hidden">Each score in the earlier and the current run</caption>
            <thead>
              <tr>
                <th scope="col">Score</th>
                <th scope="col">Earlier</th>
                <th scope="col">This run</th>
                <th scope="col">Change in points</th>
              </tr>
            </thead>
            <tbody>
              {ALL_SCORES.map((definition) => {
                const was = scoreView(a.repetitions, "all", definition).value;
                const now = scoreView(b.repetitions, "all", definition).value;
                return (
                  <tr key={definition.key}>
                    <th scope="row">{definition.label}</th>
                    <td>{was === null ? "—" : `${percent(was)}%`}</td>
                    <td>{now === null ? "—" : `${percent(now)}%`}</td>
                    <td>{was === null || now === null ? "—" : <><span aria-hidden="true">{now > was ? "▲ " : now < was ? "▼ " : ""}</span>{points(now - was)}</>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {cases && (
            <>
              <div>
                <h4 className="golden-group__title">Cases now better ({cases.better.length})</h4>
                {cases.better.length ? <CaseLinks changes={cases.better} onOpen={onOpenCase} /> : <p className="golden-muted">None.</p>}
              </div>
              <div>
                <h4 className="golden-group__title">Cases now worse ({cases.worse.length})</h4>
                {cases.worse.length ? <CaseLinks changes={cases.worse} onOpen={onOpenCase} /> : <p className="golden-muted">None.</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function CaseLinks({ changes, onOpen }: { changes: { id: string; from: string; to: string }[]; onOpen: (id: string) => void }) {
  return (
    <ul>
      {changes.map((change) => (
        <li key={change.id}>
          <Button variant="link" onClick={() => onOpen(change.id)}>{change.id}</Button> <span className="golden-muted">{change.from} → {change.to}</span>
        </li>
      ))}
    </ul>
  );
}
