import "./diagram.css";

import { Table2 } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "../components/actions";
import type { LinkLike } from "../components/layout";
import { type Direction, diagramRows, nearest, readingOrder } from "./layout";
import { DiagramArrowHead, DiagramContainerBox, DiagramEdgeLine, DiagramLaneBand, DiagramNodeShape, type NodeAction } from "./parts";
import type { DiagramLayout, PlacedNode } from "./types";

const Anchor: LinkLike = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;

const KEYS: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

/** The table's column headings. The defaults suit a flow; a tree reads better with "Has" and "Part of". */
export type DiagramHeaders = { name: string; lane: string; container: string; detail: string; to: string; from: string };

/** A layout for the width it has on screen; `undefined` before that is known. */
export type DiagramLayoutFor = (fitWidth?: number) => DiagramLayout;

const HEADERS: DiagramHeaders = { name: "Name", lane: "Lane", container: "Group", detail: "Details", to: "Goes to", from: "Comes from" };

export type DiagramProps = {
  /** What the diagram shows, as a screen reader names it ("CWOM in context"). Also the table's caption. */
  label: string;
  /** The words above the drawing; the label when not given. */
  caption?: ReactNode;
  /**
   * The layout, or a function from the width the diagram has on screen to the
   * layout (pass it on as `fitWidth`), so the drawing fits its pane wherever it can.
   */
  layout: DiagramLayout | DiagramLayoutFor;
  /**
   * Makes every node a button (a node with an href stays a link, and this runs
   * on its click first, so a router can take over). Without it, only nodes
   * with an href can be focused.
   */
  onActivate?: (node: PlacedNode, event: MouseEvent | KeyboardEvent) => void;
  /** The router's link, for names in the table. */
  link?: LinkLike;
  /** What the marks mean, shown under the drawing. */
  legend?: ReactNode;
  headers?: Partial<DiagramHeaders>;
  /** Start on the table, for screens where the table is the better first read. */
  startAsTable?: boolean;
  /**
   * The screen's own table, shown by "Show as table" instead of the kit's: for a
   * diagram whose rows say more than its drawing (what each connection is for).
   */
  table?: ReactNode;
};

/**
 * A diagram with its table one press away. The drawing keeps its natural size
 * and scrolls in place, so no text shrinks below the floor; given its layout
 * as a function of width, it lays out again to fit whenever its width changes.
 *
 * Accessibility: a diagram with nothing to open is one image (`role="img"`,
 * named by `label`), in a focusable region so it scrolls by keyboard. A
 * diagram with links or buttons is a named group instead, since an image's
 * children are hidden from assistive tech: Tab enters it once, on the first
 * node; the arrow keys move to the nearest node that way; Home and End go to
 * the first and last; Enter opens. "Show as table" swaps the drawing for a
 * table of every node with what it links to and from.
 */
export function Diagram({ label, caption, layout: given, onActivate, link: Link = Anchor, legend, headers, startAsTable = false, table }: DiagramProps) {
  const [asTable, setAsTable] = useState(startAsTable);
  const captionId = useId();
  const arrowId = `${useId().replace(/:/g, "")}-arrow`;
  const words = { ...HEADERS, ...headers };
  const figure = useRef<HTMLElement>(null);
  const width = useWidth(figure);
  const layout = useMemo(() => (typeof given === "function" ? given(width) : given), [given, width]);

  return (
    <figure ref={figure} className="ds-diagram" aria-labelledby={captionId}>
      <div className="ds-diagram__bar">
        <figcaption id={captionId} className="ds-diagram__caption">
          {caption ?? label}
        </figcaption>
        <Button variant="quiet" icon={<Table2 size={16} />} aria-pressed={asTable} onClick={() => setAsTable((on) => !on)}>
          Show as table
        </Button>
      </div>
      {asTable ? (
        table ?? <DiagramTable label={label} layout={layout} onActivate={onActivate} link={Link} headers={words} />
      ) : (
        <>
          <Drawing label={label} layout={layout} onActivate={onActivate} arrowId={arrowId} />
          {width !== undefined && layout.width > width && (
            <p className="ds-diagram__more">Wider than this page: scroll it sideways, or show it as a table.</p>
          )}
          {legend && <div className="ds-diagram__legend">{legend}</div>}
        </>
      )}
    </figure>
  );
}

/** An element's width, in steps of 8px so a resize lays out again only when it matters. */
function useWidth(element: RefObject<HTMLElement | null>): number | undefined {
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    const read = () => {
      const measured = Math.floor(target.clientWidth / 8) * 8;
      if (measured > 0) setWidth(measured);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return width;
}

function Drawing({ label, layout, onActivate, arrowId }: { label: string; layout: DiagramLayout; onActivate?: DiagramProps["onActivate"]; arrowId: string }) {
  const actionable = useMemo(() => readingOrder(layout.nodes.filter((node) => node.href || onActivate)), [layout.nodes, onActivate]);
  const [current, setCurrent] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGElement>());
  const interactive = actionable.length > 0;
  // The roving stop: the node last focused, else the subject, else the first.
  const stop = actionable.some((node) => node.id === current) ? current : (actionable.find((node) => node.tone === "subject") ?? actionable[0])?.id;

  // A drawing wider than its frame opens on its subject, so the record's own node is in view.
  const frame = useRef<HTMLDivElement>(null);
  const subject = layout.nodes.find((node) => node.tone === "subject");
  const subjectCentre = subject ? subject.x + subject.width / 2 : null;
  useEffect(() => {
    const element = frame.current;
    if (!element || subjectCentre === null || element.scrollWidth <= element.clientWidth) return;
    element.scrollLeft = Math.max(0, subjectCentre - element.clientWidth / 2);
  }, [subjectCentre]);

  const move = useCallback((id: string) => {
    setCurrent(id);
    refs.current.get(id)?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive || !stop) return;
    const direction = KEYS[event.key];
    if (direction) {
      event.preventDefault();
      move(nearest(actionable, stop, direction));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const to = event.key === "Home" ? actionable[0] : actionable[actionable.length - 1];
      if (to) move(to.id);
    }
  };

  const actionFor = (node: PlacedNode): NodeAction | undefined => {
    if (!node.href && !onActivate) return undefined;
    return {
      as: node.href ? "link" : "button",
      tabIndex: node.id === stop ? 0 : -1,
      onFocus: () => setCurrent(node.id),
      onActivate: (event) => onActivate?.(node, event),
    };
  };

  const register = (id: string) => (element: Element | null) => {
    if (element instanceof SVGElement) refs.current.set(id, element);
    else refs.current.delete(id);
  };

  const svg = (
    <svg
      className="ds-diagram__svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      focusable="false"
      {...(interactive ? { role: "group", "aria-roledescription": "diagram", "aria-label": label } : { role: "img", "aria-label": label })}
      onKeyDown={onKeyDown}
    >
      <defs>
        <DiagramArrowHead id={arrowId} />
      </defs>
      {layout.lanes.map((lane) => <DiagramLaneBand key={lane.id} lane={lane} />)}
      {layout.containers.map((box) => <DiagramContainerBox key={box.id} box={box} />)}
      {layout.edges.map((edge) => <DiagramEdgeLine key={`${edge.from}>${edge.to}`} edge={edge} arrowId={arrowId} />)}
      {layout.nodes.map((node) => <DiagramNodeShape key={node.id} node={node} action={actionFor(node)} nodeRef={register(node.id)} />)}
    </svg>
  );

  // The drawing is wider than a phone: it scrolls in place, by keyboard too. With nodes to
  // focus, moving between them scrolls it; without, the region itself takes focus.
  return interactive ? (
    <div ref={frame} className="ds-diagram__scroll" dir="ltr">{svg}</div>
  ) : (
    <div ref={frame} className="ds-diagram__scroll" dir="ltr" role="region" tabIndex={0} aria-label={`${label} (scrolls)`}>
      {svg}
    </div>
  );
}

/** The diagram as a table: every node in reading order, with its details and what it links to and from. */
export function DiagramTable({ label, layout, onActivate, link: Link = Anchor, headers = HEADERS }: {
  label: string;
  layout: DiagramLayout;
  onActivate?: DiagramProps["onActivate"];
  link?: LinkLike;
  headers?: DiagramHeaders;
}) {
  const rows = diagramRows(layout);
  const lanes = rows.some((row) => row.lane);
  const containers = rows.some((row) => row.container);
  const details = rows.some((row) => row.node.detail || row.node.status);
  const links = (items: { node: PlacedNode; label?: string }[]) =>
    items.length ? (
      <ul className="ds-diagram__links">
        {items.map((item) => (
          <li key={item.node.id}>
            <bdi>{item.node.label}</bdi>
            {item.label && <span className="ds-diagram__quiet"> ({item.label})</span>}
          </li>
        ))}
      </ul>
    ) : (
      <span className="ds-diagram__quiet">None</span>
    );

  return (
    <div className="ds-diagram__table-wrap">
      <table className="ds-table ds-diagram__table">
        <caption className="ds-table__caption">{label}</caption>
        <thead>
          <tr>
            <th scope="col">{headers.name}</th>
            {lanes && <th scope="col">{headers.lane}</th>}
            {containers && <th scope="col">{headers.container}</th>}
            {details && <th scope="col">{headers.detail}</th>}
            <th scope="col">{headers.to}</th>
            <th scope="col">{headers.from}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, lane, container, to, from }) => (
            <tr key={node.id} data-tone={node.tone ?? "plain"}>
              <th scope="row" dir="auto">
                {node.href ? (
                  <Link href={node.href}>{node.label}</Link>
                ) : onActivate ? (
                  <button type="button" className="ds-diagram__name-button" aria-pressed={node.pressed} onClick={(event) => onActivate(node, event)}>
                    {node.label}
                  </button>
                ) : (
                  node.label
                )}
              </th>
              {lanes && <td dir="auto">{lane}</td>}
              {containers && <td dir="auto">{container}</td>}
              {details && <td dir="auto">{[node.detail, node.status].filter(Boolean).join(" · ")}</td>}
              <td>{links(to)}</td>
              <td>{links(from)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A mark the legend can show: a node's tone, or a dashed line. */
export type LegendMark = "subject" | "ready" | "decide" | "gap" | "muted" | "dashed";

/**
 * What a diagram's marks mean, for its `legend`: each mark drawn as the
 * drawing draws it, with its meaning in words, since colour never says it alone.
 */
export function DiagramLegend({ items }: { items: [LegendMark, string][] }) {
  return (
    <ul className="ds-diagram__key">
      {items.map(([mark, meaning]) => (
        <li key={mark}>
          <svg className="ds-diagram__key-mark" width="28" height="16" viewBox="0 0 28 16" aria-hidden="true" focusable="false">
            {mark === "dashed" ? (
              <path d="M 1 8 H 27" className="ds-diagram__line" strokeDasharray="6 4" />
            ) : (
              <g className="ds-diagram__node" data-tone={mark}>
                <rect className="ds-diagram__box" x="1" y="1" width="26" height="14" rx="3" />
              </g>
            )}
          </svg>
          {meaning}
        </li>
      ))}
    </ul>
  );
}
