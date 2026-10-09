import { type KeyboardEvent, useMemo } from "react";

import { laneName } from "./data/landscape";
import { GEOMETRY, layoutFlow } from "./flowLayout";
import type { Integration, Journey, Step } from "./model";

/** Splits a label into lines of at most `width` characters, at most `lines` lines. */
function wrap(text: string, width: number, lines: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width && line) {
      out.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) out.push(line);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${(kept[lines - 1] ?? "").replace(/[.,;:]?$/, "")}…`;
    return kept;
  }
  return out;
}

function stepLabel(step: Step, calls: number): string {
  const kind = { start: "Start", end: "End", "error-end": "Error end", exclusive: "Decision", parallel: "Parallel gateway", task: "Step" }[step.kind];
  return `${kind}: ${step.name}. ${laneName(step.lane)}.${calls ? ` ${calls} ${calls === 1 ? "integration" : "integrations"}.` : ""}${step.ponr ? " Point of no return." : ""}`;
}

/**
 * A journey as BPMN 2.0 swimlanes: one lane per system, tasks, decisions (×),
 * parallel gateways (+), start and end events, and sequence flows. Every
 * element is a keyboard stop; Enter or Space selects it. The steps table is
 * the same content for screen readers and high zoom.
 */
export function FlowDiagram({ journey, selectedId, onSelect }: { journey: Journey; selectedId: string | null; onSelect: (id: string) => void }) {
  const layout = useMemo(() => layoutFlow(journey), [journey]);
  const calls = (id: string) => journey.integrations.filter((integration) => integration.step === id).length;
  const keyDown = (id: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };
  return (
    <svg className="arch-flow" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={`${journey.name}, BPMN flow`}>
      <defs>
        <marker id="arch-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="arch-flow__arrowhead" />
        </marker>
      </defs>
      {layout.lanes.map((lane, index) => (
        <g key={lane} aria-hidden="true">
          <rect className={`arch-flow__lane${index % 2 ? " arch-flow__lane--alt" : ""}`} x={0} y={index * GEOMETRY.laneHeight} width={layout.width} height={GEOMETRY.laneHeight} />
          {wrap(journey.laneLabels?.[lane] ?? laneName(lane), 20, 3).map((line, row, lines) => (
            <text key={row} className="arch-flow__lane-name" x={16} y={index * GEOMETRY.laneHeight + GEOMETRY.laneHeight / 2 + (row - (lines.length - 1) / 2) * 16 + 5}>
              {line}
            </text>
          ))}
        </g>
      ))}
      <line className="arch-flow__lane-rule" x1={GEOMETRY.laneHeader} x2={GEOMETRY.laneHeader} y1={0} y2={layout.height} aria-hidden="true" />
      {layout.edges.map((edge) => {
        const [sx, sy] = edge.points[0] ?? [0, 0];
        return (
          <g key={`${edge.from}-${edge.to}`} aria-hidden="true">
            <polyline className="arch-flow__edge" points={edge.points.map((point) => point.join(",")).join(" ")} markerEnd="url(#arch-arrow)" />
            {edge.label && (
              <text className="arch-flow__edge-label" x={sx + 6} y={sy - 6}>{edge.label}</text>
            )}
          </g>
        );
      })}
      {[...layout.placed.values()].map((place) => {
        const { step, x, y, width, height } = place;
        const selected = selectedId === step.id;
        const cx = x + width / 2;
        const cy = y + height / 2;
        const count = calls(step.id);
        return (
          <g
            key={step.id}
            className={`arch-flow__node arch-flow__node--${step.kind}${selected ? " is-selected" : ""}`}
            tabIndex={0}
            role="button"
            aria-pressed={selected}
            aria-label={stepLabel(step, count)}
            onClick={() => onSelect(step.id)}
            onKeyDown={keyDown(step.id)}
          >
            {step.kind === "task" && (
              <>
                <rect className="arch-flow__shape" x={x} y={y} width={width} height={height} rx={4} />
                {wrap(step.name, 21, 3).map((line, row, lines) => (
                  <text key={row} className="arch-flow__text" x={cx} y={cy + (row - (lines.length - 1) / 2) * 15 + 4} textAnchor="middle">{line}</text>
                ))}
                {count > 0 && <text className="arch-flow__calls" x={x} y={y + height + 12}>{count} {count === 1 ? "call" : "calls"}</text>}
                {step.ponr && <text className="arch-flow__ponr" x={x + width - 6} y={y + 12} textAnchor="end">PONR</text>}
              </>
            )}
            {(step.kind === "exclusive" || step.kind === "parallel") && (
              <>
                <polygon className="arch-flow__shape" points={`${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}`} />
                {step.kind === "exclusive" ? (
                  <path className="arch-flow__glyph" d={`M ${cx - 8} ${cy - 8} L ${cx + 8} ${cy + 8} M ${cx + 8} ${cy - 8} L ${cx - 8} ${cy + 8}`} />
                ) : (
                  <path className="arch-flow__glyph" d={`M ${cx} ${cy - 10} L ${cx} ${cy + 10} M ${cx - 10} ${cy} L ${cx + 10} ${cy}`} />
                )}
                {wrap(step.name, 24, 2).map((line, row) => (
                  <text key={row} className="arch-flow__small" x={cx} y={y - 8 - (wrap(step.name, 24, 2).length - 1 - row) * 13} textAnchor="middle">{line}</text>
                ))}
              </>
            )}
            {(step.kind === "start" || step.kind === "end" || step.kind === "error-end") && (
              <>
                <circle className={`arch-flow__shape arch-flow__event--${step.kind}`} cx={cx} cy={cy} r={width / 2} />
                {step.kind === "error-end" && <path className="arch-flow__glyph" d={`M ${cx - 6} ${cy + 7} L ${cx - 2} ${cy - 6} L ${cx + 2} ${cy + 2} L ${cx + 6} ${cy - 7}`} />}
                {wrap(step.name, 22, 2).map((line, row) => (
                  <text key={row} className="arch-flow__small" x={cx} y={y + height + 14 + row * 13} textAnchor="middle">{line}</text>
                ))}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const SEQ = { column: 168, head: 52, row: 46, pad: 20, numberGutter: 36 };

/**
 * Integrations as a UML sequence diagram: one lifeline per system, one arrow
 * per call in order. Solid arrow with a filled head: synchronous or not
 * stated; open head: asynchronous; dashed: callback. The register table is the
 * same content for screen readers.
 */
export function SequenceDiagram({ name, messages, selectedId, onSelect }: { name: string; messages: Integration[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const lanes: string[] = [];
  for (const message of messages) for (const lane of [message.from, message.to]) if (!lanes.includes(lane)) lanes.push(lane);
  const width = SEQ.numberGutter + lanes.length * SEQ.column + SEQ.pad;
  const height = SEQ.head + messages.length * SEQ.row + SEQ.pad * 2;
  const x = (lane: string) => SEQ.numberGutter + lanes.indexOf(lane) * SEQ.column + SEQ.column / 2;
  return (
    <svg className="arch-seq" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${name}, sequence diagram`}>
      <defs>
        <marker id="arch-seq-filled" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="arch-flow__arrowhead" />
        </marker>
        <marker id="arch-seq-open" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10" className="arch-seq__open-head" />
        </marker>
      </defs>
      {lanes.map((lane) => (
        <g key={lane} aria-hidden="true">
          <rect className="arch-seq__head" x={x(lane) - SEQ.column / 2 + 8} y={4} width={SEQ.column - 16} height={SEQ.head - 16} rx={4} />
          {wrap(laneName(lane), 20, 2).map((line, row, lines) => (
            <text key={row} className="arch-seq__name" x={x(lane)} y={4 + (SEQ.head - 16) / 2 + (row - (lines.length - 1) / 2) * 14 + 4} textAnchor="middle">{line}</text>
          ))}
          <line className="arch-seq__lifeline" x1={x(lane)} x2={x(lane)} y1={SEQ.head - 12} y2={height - SEQ.pad / 2} />
        </g>
      ))}
      {messages.map((message, index) => {
        const y = SEQ.head + SEQ.pad + index * SEQ.row;
        const x1 = x(message.from);
        const x2 = x(message.to);
        const callback = message.style === "Callback";
        const marker = callback || message.mode === "async" ? "url(#arch-seq-open)" : "url(#arch-seq-filled)";
        const label = `${message.operation}${message.via ? ` · via ${laneName(message.via)}` : ""}`;
        const selected = selectedId === message.id;
        const interactive = Boolean(onSelect);
        return (
          <g
            key={message.id}
            className={`arch-seq__message${selected ? " is-selected" : ""}`}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : undefined}
            aria-pressed={interactive ? selected : undefined}
            aria-label={interactive ? `${index + 1}. ${laneName(message.from)} to ${laneName(message.to)}: ${label}. ${message.style}, ${message.mode}.` : undefined}
            aria-hidden={interactive ? undefined : true}
            onClick={onSelect ? () => onSelect(message.id) : undefined}
            onKeyDown={onSelect ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(message.id);
              }
            } : undefined}
          >
            <rect className="arch-seq__hit" x={Math.min(x1, x2) - 4} y={y - 26} width={Math.abs(x2 - x1) + 8} height={SEQ.row - 6} />
            <text className="arch-seq__number" x={14} y={y + 4}>{index + 1}</text>
            <line className={`arch-seq__arrow${callback ? " arch-seq__arrow--callback" : ""}`} x1={x1} x2={x2 + (x2 > x1 ? -2 : 2)} y1={y} y2={y} markerEnd={marker} />
            <text className="arch-seq__label" x={(x1 + x2) / 2} y={y - 8} textAnchor="middle">{wrap(label, Math.max(18, Math.floor(Math.abs(x2 - x1) / 7)), 1)[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}
