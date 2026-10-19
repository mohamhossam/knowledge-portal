import { Status } from "../../design/components";
import { count } from "../../home/format";
import {
  floorState, noisePoints, percent, points, SCORE_GROUPS, scoreView, type ScoreDefinition, type ScoreKey, type ScoreView, type Split,
} from "./golden";
import type { GoldenRepetition } from "../../api/client";

type Props = {
  repetitions: GoldenRepetition[];
  split: Split;
  floors: Partial<Record<ScoreKey, number>>;
  /** The previous comparable run's repetitions, to say what moved. */
  previous?: GoldenRepetition[];
  cases: number;
};

/** What moved since the previous run, in points; a move of less than two cases is said to be within noise. */
function Movement({ now, before, cases }: { now: number; before: number | null; cases: number }) {
  if (before === null) return <span className="golden-muted">Not measured in the previous run</span>;
  const change = now - before;
  const noise = Math.abs(change * 100) < noisePoints(cases);
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "=";
  const words = change === 0 ? "No change since the previous run" : `${points(change)} points since the previous run`;
  return (
    <span className="golden-muted">
      <span aria-hidden="true">{arrow} </span>
      {words}
      {change !== 0 && noise ? " (within noise)" : ""}
    </span>
  );
}

function Bar({ definition, view, floor, label }: { definition: ScoreDefinition; view: ScoreView; floor: number | undefined; label: string }) {
  const range = view.counts?.range ?? view.spread;
  return (
    <div
      className="golden-bar"
      role="img"
      aria-label={`${definition.label}: ${percent(view.value ?? 0)} percent${floor === undefined ? "" : `, floor ${percent(floor)} percent`}${range ? `, likely between ${percent(range[0])} and ${percent(range[1])} percent` : ""}${label}`}
    >
      <span className="golden-bar__fill" style={{ inlineSize: `${(view.value ?? 0) * 100}%` }} data-state={floorState(view.value, floor)} />
      {range && <span className="golden-bar__range" style={{ insetInlineStart: `${range[0] * 100}%`, inlineSize: `${(range[1] - range[0]) * 100}%` }} />}
      {floor !== undefined && <span className="golden-bar__floor" style={{ insetInlineStart: `${floor * 100}%` }} />}
    </div>
  );
}

function ScoreCard({ definition, repetitions, split, floors, previous, cases }: Props & { definition: ScoreDefinition }) {
  const view = scoreView(repetitions, split, definition);
  const floor = floors[definition.key];
  const state = floorState(view.value, floor);
  const before = previous ? scoreView(previous, split, definition).value : undefined;
  return (
    <li className={`golden-card golden-card--${definition.size}`}>
      <h4 className="golden-card__label">{definition.label}</h4>
      {view.value === null ? (
        <p className="golden-card__value golden-card__value--none">Not measured</p>
      ) : (
        <>
          <p className="golden-card__value">
            {percent(view.value)}
            <span className="golden-card__unit">%{repetitions.length > 1 ? " (mean)" : ""}</span>
          </p>
          <Bar definition={definition} view={view} floor={floor} label="" />
          {view.counts && (
            <p className="golden-muted">
              {count(view.counts.found, view.counts.unit.replace(/s$/, ""))} of {view.counts.of.toLocaleString("en")} · likely {percent(view.counts.range[0])}–{percent(view.counts.range[1])}%
            </p>
          )}
          {view.spread && (
            <p className="golden-muted">
              Across {repetitions.length} runs: {percent(view.spread[0])}–{percent(view.spread[1])}%
            </p>
          )}
        </>
      )}
      <p className="golden-card__floor">
        {state === "none" ? (
          <Status tone="neutral">No floor set</Status>
        ) : state === "meets" ? (
          <Status tone="done">Meets the floor ({percent(floor!)}%)</Status>
        ) : (
          <Status tone="warning">Below the floor ({percent(floor!)}%)</Status>
        )}
      </p>
      {view.value !== null && previous !== undefined && <p className="golden-card__move"><Movement now={view.value} before={before ?? null} cases={cases} /></p>}
      <p className="golden-card__question">{definition.question}</p>
    </li>
  );
}

/** The scores in three groups, by the question each answers; the two core ones larger. */
export function ScoreCards(props: Props) {
  return (
    <>
      {SCORE_GROUPS.map((group) => (
        <div key={group.title} className="golden-group">
          <h3 className="golden-group__title">{group.title}</h3>
          <p className="golden-muted">{group.lead}</p>
          <ul className="golden-cards">
            {group.scores.map((definition) => (
              <ScoreCard key={definition.key} definition={definition} {...props} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
