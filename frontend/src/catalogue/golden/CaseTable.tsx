import type { GoldenCase } from "../../api/client";
import { DataTable, Drawer, FilterStrip, Status, type Column, type StatusTone } from "../../design/components";
import { count } from "../../home/format";
import { caseMatches, type CaseFilter, extraSystems, missedSystems, OUTCOME_LABEL, outcomeOf, problemsFirst, verdictLabel, type Outcome } from "./golden";

const TONE: Record<Outcome, StatusTone> = { matches: "done", partial: "warning", wrong: "attention" };

function Systems({ item }: { item: GoldenCase }) {
  const missed = missedSystems(item).length;
  const raised = extraSystems(item).length;
  if (!missed && !raised) return <span className="golden-muted">All {item.expected_systems.length} found</span>;
  return (
    <>
      {missed > 0 && <span className="golden-chip golden-chip--missed"><span aria-hidden="true">−</span>{missed} missed</span>}
      {raised > 0 && <span className="golden-chip golden-chip--raised"><span aria-hidden="true">+</span>{raised} extra</span>}
    </>
  );
}

/** Systems of one case, as matched, missed (expected, not found) and extra (named, not expected). */
function SystemChips({ item }: { item: GoldenCase }) {
  const all = [...new Set([...item.expected_systems, ...item.predicted_systems])].sort();
  return (
    <p>
      {all.map((id) => {
        const expected = item.expected_systems.includes(id);
        const predicted = item.predicted_systems.includes(id);
        return expected && predicted ? (
          <code key={id} className="golden-chip">{id}</code>
        ) : expected ? (
          <code key={id} className="golden-chip golden-chip--missed"><span aria-hidden="true">−</span> {id}<span className="golden-sr"> missed</span></code>
        ) : (
          <code key={id} className="golden-chip golden-chip--raised"><span aria-hidden="true">+</span> {id}<span className="golden-sr"> extra</span></code>
        );
      })}
    </p>
  );
}

export function CaseDetail({ item, onClose }: { item: GoldenCase; onClose: () => void }) {
  const outcome = outcomeOf(item);
  return (
    <Drawer title={`Case ${item.id}`} onClose={onClose}>
      <div className="golden-detail">
        <p><Status tone={TONE[outcome]}>{OUTCOME_LABEL[outcome]}</Status></p>
        {item.failure && <p role="alert"><Status tone="attention">The mapper gave no answer: {item.failure}</Status></p>}
        <dl>
          <dt>Set</dt>
          <dd>{item.split === "held_out" ? "Held out of tuning" : "Tuning"}</dd>
          <dt>Expected verdict</dt>
          <dd>{verdictLabel(item.expected_verdict)}</dd>
          <dt>Predicted verdict</dt>
          <dd>{item.answered ? verdictLabel(item.predicted_verdict) : "No answer"}</dd>
          <dt>Offering</dt>
          <dd>
            expected <bdi>{item.expected_offering ?? "none"}</bdi> · predicted <bdi>{item.predicted_offering ?? "none"}</bdi>
          </dd>
          <dt>Citations</dt>
          <dd>{item.citations_checked ? `${item.citations_faithful} of ${item.citations_checked} faithful` : "None checked"}</dd>
          {item.draft_offering && (
            <>
              <dt>Draft offering</dt>
              <dd>
                <bdi>{item.draft_offering}</bdi>
                {item.draft_problems?.length ? `: ${item.draft_problems.join("; ")}` : " applies cleanly"}
              </dd>
            </>
          )}
        </dl>
        <h3 className="golden-group__title">Systems</h3>
        <p className="golden-muted">Plain: matched. − expected, not found. + named, not expected.</p>
        <SystemChips item={item} />
      </div>
    </Drawer>
  );
}

const COLUMNS: Column<GoldenCase>[] = [
  { id: "id", header: "Case", rowHeader: true, cell: (item) => item.id },
  { id: "outcome", header: "How it went", cell: (item) => <Status tone={TONE[outcomeOf(item)]}>{OUTCOME_LABEL[outcomeOf(item)]}</Status> },
  {
    id: "verdict",
    header: "Verdict",
    cell: (item) =>
      item.predicted_verdict === item.expected_verdict ? (
        verdictLabel(item.expected_verdict)
      ) : (
        <>
          {verdictLabel(item.expected_verdict)} → <strong>{item.answered ? verdictLabel(item.predicted_verdict) : "no answer"}</strong>
        </>
      ),
  },
  { id: "systems", header: "Systems", cell: (item) => <Systems item={item} /> },
  { id: "split", header: "Set", cell: (item) => (item.split === "held_out" ? "Held out" : "Tuning") },
];

/** Every case, the ones that went wrong first, with the way to filter them and the detail of the one chosen. */
export function CaseTable({ cases, filter, onFilter, chosen, onChoose }: {
  cases: GoldenCase[];
  filter: CaseFilter;
  onFilter: (filter: CaseFilter) => void;
  chosen: string | undefined;
  onChoose: (id: string | undefined) => void;
}) {
  const shown = problemsFirst(cases.filter(caseMatches[filter]));
  const item = cases.find((candidate) => candidate.id === chosen);
  return (
    <>
      <FilterStrip
        label="Show cases"
        active={filter}
        onChange={(id) => onFilter(id as CaseFilter)}
        filters={[
          { id: "all", label: "All", count: cases.length },
          { id: "problems", label: "Problems", count: cases.filter(caseMatches.problems).length },
          { id: "wrong", label: "Wrong verdict", count: cases.filter(caseMatches.wrong).length },
          { id: "missed", label: "Missed systems", count: cases.filter(caseMatches.missed).length },
          { id: "raised", label: "Extra systems", count: cases.filter(caseMatches.raised).length },
        ]}
        onClear={filter === "all" ? undefined : () => onFilter("all")}
      />
      <DataTable
        caption={`${count(shown.length, "case")}, problems first`}
        captionHidden
        columns={COLUMNS}
        rows={shown}
        rowId={(row) => row.id}
        rowLabel={(row) => `case ${row.id}`}
        onActivate={(row) => onChoose(row.id)}
        currentId={chosen}
        emptyText="No case matches this filter."
      />
      {item && <CaseDetail item={item} onClose={() => onChoose(undefined)} />}
    </>
  );
}
