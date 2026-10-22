import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";

import { api, type GoldenRunOptions, type GoldenRunSummary, type GoldenSetInfo } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { Button, Checkbox, Dialog, Select, Status } from "../../design/components";
import { count } from "../../home/format";
import { GOLDEN_KEY, isActive } from "./golden";

type Mapper = GoldenRunOptions["mapper"];

/** How far a waiting or running run has got, in words and as a bar. */
export function Progress({ run }: { run: GoldenRunSummary }) {
  const done = run.progress_done ?? 0;
  const total = run.progress_total ?? 0;
  return (
    <div role="status">
      <p>
        <Status tone="working">
          {run.status === "queued" ? "Waiting to start" : `${run.stage ?? "Running"}${total ? ` · ${done} of ${count(total, "case")}` : ""}`}
        </Status>
      </p>
      {total > 0 && <progress className="golden-progress" value={done} max={total} aria-label="Cases scored in this pass" />}
    </div>
  );
}

/**
 * Starts a run of the impact mapper over the golden set, in the background. A real model's run
 * asks first, saying how many assessments it makes; the page never states a cost it cannot know.
 */
export function RunPanel({ info, runs, onStarted }: { info: GoldenSetInfo; runs: GoldenRunSummary[]; onStarted: (runId: string) => void }) {
  const client = useQueryClient();
  const [mapper, setMapper] = useState<Mapper>("assess");
  const [leaveOneOut, setLeaveOneOut] = useState(false);
  const [repeats, setRepeats] = useState(1);
  const [asking, setAsking] = useState(false);
  const active = runs.find(isActive);
  const start = useMutation({
    mutationFn: (options: GoldenRunOptions) => api.startGoldenRun(options),
    onSuccess: async (run) => {
      await client.invalidateQueries({ queryKey: [...GOLDEN_KEY, "runs"] });
      onStarted(run.id);
    },
  });
  const options: GoldenRunOptions = { mapper, precedents: mapper === "assess" && leaveOneOut ? "loo" : "none", repeats };
  const assessments = info.cases * repeats;
  const run = () => {
    setAsking(false);
    start.mutate(options);
  };
  return (
    <div className="golden-run">
      <Select label="Mapper" value={mapper} onChange={(event) => setMapper(event.target.value as Mapper)}>
        <option value="assess">The assessment (the mapper in use now)</option>
        <option value="match">Today's per-item match (the older baseline)</option>
      </Select>
      <Checkbox
        label="Use leave-one-out precedents"
        hint="Every other labelled case is kept as an accepted verdict, so each case is assessed with its nearest decided neighbours, never itself."
        checked={mapper === "assess" && leaveOneOut}
        disabled={mapper !== "assess"}
        onChange={(event) => setLeaveOneOut(event.target.checked)}
      />
      <Select
        label="Times to run"
        hint="A model answers a little differently each time. Several runs give a mean and a spread."
        value={repeats}
        onChange={(event) => setRepeats(Number(event.target.value))}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </Select>
      <div>
        <Button
          variant="primary"
          icon={<Play size={16} aria-hidden="true" />}
          busy={start.isPending}
          unavailableReason={active ? "A run is already waiting or running." : null}
          onClick={() => (info.provider === "live" ? setAsking(true) : run())}
        >
          Run the evaluation
        </Button>
      </div>
      {start.isError && <p role="alert"><Status tone="attention">{errorMessage(start.error)}</Status></p>}
      <p className="golden-muted">
        Scores {count(info.cases, "case")} on a throwaway copy of the golden set's catalogue, with the {info.provider === "fake" ? "offline fake models" : `models configured for ${info.provider_name}`}. The live catalogue is never touched.
      </p>
      <Dialog
        open={asking}
        title="Run with a real model?"
        onClose={() => setAsking(false)}
        actions={
          <>
            <Button variant="primary" onClick={run}>Start the run</Button>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
          </>
        }
      >
        <p>
          This makes {count(assessments, "assessment")} ({count(info.cases, "case")} × {count(repeats, "run")}). Each one calls <bdi>{info.provider_name}</bdi> several times, which is billed to the provider account. This page cannot say what that costs.
        </p>
      </Dialog>
    </div>
  );
}
