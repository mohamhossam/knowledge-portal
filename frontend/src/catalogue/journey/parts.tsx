import { Eye, Flag } from "lucide-react";
import { type ReactNode, useId } from "react";

import type { Journey, JourneyActivity } from "../../api/client";
import type { EdgeKind, Entry } from "./layout";
import { CONFIDENCE } from "../catalogue";
import { SOURCE_WORD } from "../ontology";
import { KIND_WORDS } from "./words";

/** What every view is given: the journey, and how its systems and channels read. */
export type ViewProps = {
  journey: Journey;
  systemName: (systemId: string) => string;
  system: (systemId: string) => ReactNode;
  channelName?: (channelId: string) => string;
  entry?: Entry;
};

const KINDS = Object.keys(KIND_WORDS) as EdgeKind[];

/** One arrowhead per kind of arrow, filled like its line. */
export function ArrowHeads({ id }: { id: string }) {
  return (
    <defs>
      {KINDS.map((kind) => (
        <marker key={kind} id={`${id}-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 Z" className={`journey-head journey-head--${kind}`} />
        </marker>
      ))}
    </defs>
  );
}

/** A line as the legend draws it: the same stroke as the diagram's. */
function Swatch({ kind }: { kind: EdgeKind }) {
  return (
    <svg className="journey-swatch" width="32" height="12" viewBox="0 0 32 12" aria-hidden="true" focusable="false">
      <line x1="2" y1="6" x2="30" y2="6" className={`journey-arrow journey-arrow--${kind}`} />
    </svg>
  );
}

/** What the diagram's lines and marks mean, in words beside each. */
export function Legend({ kinds, steps, children }: { kinds: EdgeKind[]; steps: JourneyActivity[]; children?: ReactNode }) {
  const marked = steps.some((step) => step.customer_visible || step.point_of_no_return || step.confidence === "inferred" || step.confidence === "gap");
  if (!kinds.length && !marked && !children) return null;
  return (
    <ul className="journey-legend" aria-label="Key">
      {KINDS.filter((kind) => kinds.includes(kind)).map((kind) => (
        <li key={kind}>
          <Swatch kind={kind} />
          {KIND_WORDS[kind]}
        </li>
      ))}
      {steps.some((step) => step.customer_visible) && (
        <li>
          <Eye size={14} aria-hidden="true" className="journey-mark--seen" />
          Seen by the customer
        </li>
      )}
      {steps.some((step) => step.point_of_no_return) && (
        <li>
          <Flag size={14} aria-hidden="true" className="journey-mark--noreturn" />
          Point of no return
        </li>
      )}
      {steps.some((step) => step.confidence === "inferred" || step.confidence === "gap") && (
        <li>
          <span className="journey-tag">Inferred</span>
          A dashed frame: inferred, or its source leaves gaps
        </li>
      )}
      {children}
    </ul>
  );
}

/**
 * A diagram: a labelled figure whose drawing scrolls sideways in its own
 * labelled, focusable region (it is wider than a phone), with its key below.
 */
export function Diagram({ title, caption, legend, children }: { title: string; caption: ReactNode; legend: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <figure className="journey-figure" aria-labelledby={id}>
      <figcaption id={id} className="journey-figure__caption">
        {caption}{" "}
        {/* Every view is followed by its steps as a table, closed: the figure says it is there and how to open it. */}
        <span className="ds-visually-hidden">Every step is also in “Steps as a table”, after the drawing; press it to open the table.</span>
      </figcaption>
      <div className="journey-scroll" role="region" tabIndex={0} aria-label={`${title} (scrolls sideways)`}>
        {children}
      </div>
      {legend}
    </figure>
  );
}

/** A step's marks as small icons, each with its words for screen readers. */
export function MarkIcons({ step }: { step: JourneyActivity }) {
  return (
    <>
      {step.customer_visible && (
        <span className="journey-mark">
          <Eye size={14} aria-hidden="true" className="journey-mark--seen" />
          <span className="ds-visually-hidden">Seen by the customer</span>
        </span>
      )}
      {step.point_of_no_return && (
        <span className="journey-mark">
          <Flag size={14} aria-hidden="true" className="journey-mark--noreturn" />
          <span className="ds-visually-hidden">Point of no return</span>
        </span>
      )}
      {step.confidence && step.confidence !== "confirmed" && (
        <span className="journey-tag">
          <span aria-hidden="true">{SOURCE_WORD[step.confidence]}</span>
          {/* On a step, nothing says the tag is about the source: it is read in full. */}
          <span className="ds-visually-hidden">{CONFIDENCE[step.confidence]}</span>
        </span>
      )}
    </>
  );
}

/** A step's marks in words, for the timeline and the table. */
export function MarkLines({ step, channelName }: { step: JourneyActivity; channelName?: (channelId: string) => string }) {
  return (
    <>
      {step.customer_visible && (
        <span className="journey-line">
          <Eye size={14} aria-hidden="true" className="journey-mark--seen" />
          Seen by the customer
        </span>
      )}
      {step.point_of_no_return && (
        <span className="journey-line" dir="auto">
          <Flag size={14} aria-hidden="true" className="journey-mark--noreturn" />
          {/^(yes|true|y)$/i.test(step.point_of_no_return.trim()) ? "Point of no return" : <>Point of no return: <bdi>{step.point_of_no_return}</bdi></>}
        </span>
      )}
      {step.confidence && step.confidence !== "confirmed" && (
        <span className="journey-line">{step.confidence === "gap" ? "Its source leaves gaps" : "Inferred, not stated in its source"}</span>
      )}
      {channelName && (step.channels ?? []).length > 0 && (
        <span className="journey-line" dir="auto">Only in {(step.channels ?? []).map(channelName).join(", ")}</span>
      )}
    </>
  );
}
