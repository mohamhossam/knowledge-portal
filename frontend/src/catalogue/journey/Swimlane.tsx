import { useMemo } from "react";

import { LANE, type Lane, nextWords, swimlane } from "./layout";
import { ArrowHeads, Diagram, Legend, MarkIcons, type ViewProps } from "./parts";
import { useSvgId } from "./words";

/**
 * The swimlane: one lane per system, steps left to right in step order under
 * their phases, with the hand-overs between them. The default view.
 */
export function Swimlane({ journey, systemName, system, channelName, entry }: ViewProps) {
  const layout = useMemo(() => swimlane(journey, entry), [journey, entry]);
  const id = useSvgId();
  const { lanes, phases, boxes, arrows, width, height } = layout;
  const steps = new Map(layout.steps.map((step) => [step.number, step]));
  const named = lanes.filter((lane) => lane.systemId).length;

  const laneName = (lane: Lane) =>
    lane.systemId ? system(lane.systemId)
      : lane.kind === "entry" ? (entry ? <>The entry system of <bdi>{entry.channel}</bdi>, not named</> : "The channel’s entry system")
        : "No system named";

  return (
    <Diagram
      title={`Swimlane of ${journey.name}`}
      caption={
        <>
          <bdi>{journey.name}</bdi> as a swimlane: {count(layout.steps.length, "step")} across {count(lanes.length, "lane")}
          {named !== lanes.length ? ` (${count(named, "named system")})` : ""}, left to right in step order.
        </>
      }
      legend={<Legend kinds={[...new Set(arrows.map((arrow) => arrow.kind))]} steps={layout.steps} />}
    >
      <div
        className="journey-lanes"
        dir="ltr"
        style={{
          // The names column narrows on a small screen (journey.css), so the steps start sooner.
          gridTemplateColumns: `var(--journey-lane-names, ${LANE.labelWidth}px) ${width}px`,
          gridTemplateRows: layout.hasPhases ? `${LANE.phaseHeight}px ${height}px` : `${height}px`,
        }}
      >
        {layout.hasPhases && (
          <>
            <div className="journey-lanes__corner" aria-hidden="true" />
            <ol className="journey-lanes__phases" aria-label="Phases">
              {phases.map((span) => (
                <li
                  key={`${span.phase ?? "none"}:${span.start}`}
                  className="journey-lanes__phase"
                  dir="auto"
                  style={{ insetInlineStart: span.start * LANE.column + PHASE_GAP, inlineSize: span.span * LANE.column - 2 * PHASE_GAP }}
                >
                  {span.phase ? (span.again ? <>Back to <bdi>{span.phase}</bdi></> : <bdi>{span.phase}</bdi>) : <span className="journey-quiet">No phase</span>}
                </li>
              ))}
            </ol>
          </>
        )}
        <ul className="journey-lanes__names" aria-label="Lanes, one per system">
          {lanes.map((lane) => (
            <li key={lane.key} className="journey-lanes__name" style={{ blockSize: LANE.height }}>
              <span className="journey-lanes__system" dir="auto">{laneName(lane)}</span>
              {lane.entry && lane.systemId && entry && <span className="journey-quiet" dir="auto">The entry system of <bdi>{entry.channel}</bdi></span>}
              <span className="journey-quiet">{count(lane.steps.length, "step")}</span>
            </li>
          ))}
        </ul>
        <div className="journey-canvas" style={{ inlineSize: width, blockSize: height }}>
          <svg className="journey-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
            <ArrowHeads id={id} />
            {lanes.map((lane, index) => (
              <rect key={lane.key} x={0} y={index * LANE.height} width={width} height={LANE.height} className={`journey-band journey-band--${index % 2 ? "even" : "odd"}`} />
            ))}
            {arrows.map((arrow) => (
              <path key={`${arrow.from}>${arrow.to}`} d={arrow.path} className={`journey-arrow journey-arrow--${arrow.kind}`} markerEnd={`url(#${id}-${arrow.kind})`} />
            ))}
          </svg>
          <ol className="journey-boxes" aria-label="Steps, in order">
            {boxes.map((box) => {
              const step = steps.get(box.number)!;
              const lane = lanes[layout.place.get(box.number)!.lane]!;
              const next = arrows.filter((arrow) => arrow.from === box.number && (arrow.kind !== "sequence" || arrow.via || arrow.back));
              const said = nextWords(next, box.number);
              return (
                <li
                  key={box.number}
                  className="journey-box"
                  data-confidence={step.confidence ?? undefined}
                  style={{ insetInlineStart: box.x, insetBlockStart: box.y, inlineSize: box.width, blockSize: box.height }}
                >
                  <span className="journey-box__meta">
                    <span className="journey-num">{step.number}</span>
                    <MarkIcons step={step} />
                  </span>
                  <span className="journey-box__name" dir="auto">{step.name}</span>
                  <span className="ds-visually-hidden">
                    {lane.systemId ? `Performed by ${systemName(lane.systemId)}` : lane.kind === "entry" ? "Performed by the channel’s entry system" : "No system named"}
                  </span>
                  {step.supporting_system_ids.length > 0 && (
                    <span className="journey-box__with" dir="auto">
                      with {step.supporting_system_ids.map((systemId, index) => (
                        <span key={systemId}>{index > 0 && ", "}<bdi>{systemName(systemId)}</bdi></span>
                      ))}
                    </span>
                  )}
                  {channelName && (step.channels ?? []).length > 0 && (
                    <span className="journey-box__with" dir="auto">Only in {(step.channels ?? []).map(channelName).join(", ")}</span>
                  )}
                  {said.length > 0 && <span className="journey-box__next" dir="auto">Then {said.join("; ")}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Diagram>
  );
}

/** The space between two phases' heads, so each ledger rule reads as its own. */
const PHASE_GAP = 8;

function count(n: number, noun: string): string {
  return `${n.toLocaleString("en")} ${noun}${n === 1 ? "" : "s"}`;
}
