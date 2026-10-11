import { useMemo } from "react";

import { performer, performerWords, stages } from "./layout";
import { Diagram, Legend, MarkLines, type ViewProps } from "./parts";

/**
 * The stage timeline: the journey's phases left to right along one line, each
 * with its steps and who performs them; the steps the customer sees and the
 * points of no return are marked.
 */
export function Timeline({ journey, systemName, system, channelName, entry }: ViewProps) {
  const list = useMemo(() => stages(journey, entry), [journey, entry]);
  const phased = list.some((stage) => stage.phase !== null);

  return (
    <Diagram
      title={`Stage timeline of ${journey.name}`}
      caption={
        phased ? (
          <><bdi>{journey.name}</bdi> by stage: {list.length.toLocaleString("en")} {list.length === 1 ? "stage" : "stages"}, left to right in the order the journey reaches them.</>
        ) : (
          <><bdi>{journey.name}</bdi> by stage: no phase is recorded, so every step sits in one stage.</>
        )
      }
      legend={<Legend kinds={[]} steps={list.flatMap((stage) => stage.steps)} />}
    >
      <ol className="journey-stages" dir="ltr" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(15rem, 1fr))`, minInlineSize: `${list.length * 15}rem` }}>
        {list.map((stage, index) => {
          const seen = stage.steps.filter((step) => step.customer_visible).length;
          return (
            <li key={stage.phase ?? ""} className="journey-stage">
              <span className="journey-stage__dot" aria-hidden="true" />
              <p className="journey-stage__name" dir="auto">
                <span className="journey-num">{index + 1}</span>
                {" "}
                {stage.phase ? <bdi>{stage.phase}</bdi> : phased ? "No phase named" : "All steps"}
              </p>
              <p className="journey-quiet" dir="auto">
                {stage.steps.length.toLocaleString("en")} {stage.steps.length === 1 ? "step" : "steps"}
                {" · "}
                {stage.performers.map((who) => performerWords(who, systemName, entry)).join(", ")}
                {seen > 0 && ` · ${seen.toLocaleString("en")} seen by the customer`}
              </p>
              <ol className="journey-stage__steps" aria-label={`Steps in ${stage.phase ?? (phased ? "no phase" : "the journey")}`}>
                {stage.steps.map((step) => {
                  const who = performer(step, entry);
                  return (
                    <li key={step.number} className="journey-stage__step" data-confidence={step.confidence ?? undefined}>
                      <span className="journey-num">{step.number}</span>
                      <span className="journey-stage__body">
                        <span className="journey-box__name" dir="auto">{step.name}</span>
                        <span className="journey-line" dir="auto">
                          {who.systemId ? system(who.systemId) : performerWords(who, systemName, entry)}
                          {who.kind === "entry" && who.systemId && entry && <span className="journey-quiet">{" "}(the entry system of <bdi>{entry.channel}</bdi>)</span>}
                        </span>
                        {step.track && step.track.toLowerCase() !== "main" && <span className="journey-line" dir="auto">On the <bdi>{step.track}</bdi> track</span>}
                        <MarkLines step={step} channelName={channelName} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    </Diagram>
  );
}
