import { useMemo } from "react";

import { flowchart, flowEdges, nextWords, performer, performerWords } from "./layout";
import { ArrowHeads, Diagram, Legend, MarkIcons, type ViewProps } from "./parts";
import { useSvgId } from "./words";

/**
 * The flowchart: each step a box, top to bottom along the flow. Branches and
 * parallel tracks sit side by side, a diamond marks a decision, bars mark where
 * tracks fork and rejoin, and returns run up the right-hand side.
 */
export function Flowchart({ journey, systemName, entry }: ViewProps) {
  const layout = useMemo(() => flowchart(journey), [journey]);
  const edges = useMemo(() => flowEdges(journey), [journey]);
  const id = useSvgId();
  const { nodes, arrows, bars, labels, width, height } = layout;
  const steps = new Map(layout.steps.map((step) => [step.number, step]));
  const decisions = nodes.filter((node) => node.decision).length;
  const forks = nodes.filter((node) => node.fork).length;

  return (
    <Diagram
      title={`Flowchart of ${journey.name}`}
      caption={
        <>
          <bdi>{journey.name}</bdi> as a flowchart: {layout.steps.length.toLocaleString("en")} steps on {layout.levels.toLocaleString("en")} levels, top to bottom
          {decisions ? `, ${decisions.toLocaleString("en")} with a decision` : ""}
          {forks ? `, ${forks.toLocaleString("en")} starting parallel tracks` : ""}.
          {journey.edges.length === 0 && journey.flow_rules.length === 0 && journey.activities.length > 1 && " No flow is recorded, so the steps follow their numbers."}
        </>
      }
      legend={
        <Legend kinds={[...new Set(arrows.map((arrow) => arrow.kind))]} steps={layout.steps}>
          {decisions > 0 && (
            <li>
              <svg className="journey-swatch" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path d="M 8 1 L 15 8 L 8 15 L 1 8 Z" className="journey-diamond" />
              </svg>
              A decision
            </li>
          )}
          {bars.length > 0 && (
            <li>
              <svg className="journey-swatch" width="32" height="12" viewBox="0 0 32 12" aria-hidden="true" focusable="false">
                <line x1="2" y1="6" x2="30" y2="6" className="journey-bar" />
              </svg>
              Tracks fork or rejoin
            </li>
          )}
        </Legend>
      }
    >
      <div className="journey-canvas journey-canvas--flow" dir="ltr" style={{ inlineSize: width, blockSize: height }}>
        <svg className="journey-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
          <ArrowHeads id={id} />
          {arrows.map((arrow) => (
            <path key={`${arrow.from}>${arrow.to}`} d={arrow.path} className={`journey-arrow journey-arrow--${arrow.kind}`} markerEnd={`url(#${id}-${arrow.kind})`} />
          ))}
          {bars.map((bar) => (
            <line key={`${bar.x1}:${bar.y}`} x1={bar.x1} y1={bar.y} x2={bar.x2} y2={bar.y} className="journey-bar" />
          ))}
          {nodes.filter((node) => node.decision).map((node) => {
            const cx = node.x + node.width / 2;
            const cy = node.y + node.height + 14;
            return <path key={node.number} d={`M ${cx} ${cy - 9} L ${cx + 9} ${cy} L ${cx} ${cy + 9} L ${cx - 9} ${cy} Z`} className="journey-diamond" />;
          })}
          {labels.map((label) => (
            <text key={`${label.x}:${label.y}`} x={label.x} y={label.y} textAnchor={label.anchor} className="journey-label">{label.text}</text>
          ))}
        </svg>
        <ol className="journey-boxes" aria-label="Steps, in order">
          {nodes
            .slice()
            .sort((a, b) => layout.steps.indexOf(steps.get(a.number)!) - layout.steps.indexOf(steps.get(b.number)!))
            .map((node) => {
              const step = steps.get(node.number)!;
              const who = performer(step, entry);
              const said = nextWords(edges, node.number);
              return (
                <li
                  key={node.number}
                  className="journey-box journey-box--flow"
                  data-confidence={step.confidence ?? undefined}
                  style={{ insetInlineStart: node.x, insetBlockStart: node.y, inlineSize: node.width, blockSize: node.height }}
                >
                  <span className="journey-box__meta">
                    <span className="journey-num">{step.number}</span>
                    <span aria-hidden="true">·</span>
                    <span className="journey-box__who" dir="auto">{performerWords(who, systemName, entry)}</span>
                    <MarkIcons step={step} />
                  </span>
                  <span className="journey-box__name" dir="auto">{step.name}</span>
                  <span className="ds-visually-hidden">{said.length ? `Then ${said.join("; ")}` : "The journey ends here"}</span>
                </li>
              );
            })}
        </ol>
      </div>
    </Diagram>
  );
}
