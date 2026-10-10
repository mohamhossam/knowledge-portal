/**
 * The integration matrix: the poster's links as a grid, so who talks to whom
 * (and how much) can be read exactly. Systems run down and across in TAM
 * layer order, busiest first within a layer, each layer's columns and rows
 * in its own tint; a cell's shade and number are the calls between the pair,
 * on a calm slate ramp (maroon stays for the picked system). Each row header
 * carries a bar of the system's calls in all, against the busiest. A real
 * table, so it reads by row and column.
 */
import { Fragment, useMemo, useState } from "react";

import type { CatalogueData } from "../../architecture/adapter";
import { plural } from "./labUtil";
import type { Degree } from "./posterModel";

/** One slate ramp, light to dark, for 1, 2, 3–4 and 5+ calls. */
function shade(count: number): string {
  if (count >= 5) return "ix-4";
  if (count >= 3) return "ix-3";
  if (count === 2) return "ix-2";
  return "ix-1";
}

export function IntegrationMatrix({
  data,
  degrees,
  linkCounts,
  selected,
  onSelect,
}: {
  data: CatalogueData;
  degrees: Map<string, Degree>;
  linkCounts: Map<string, number>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [hover, setHover] = useState<{ row: string; col: string } | null>(null);
  const linked = useMemo(() => {
    const ids = new Set<string>();
    for (const key of linkCounts.keys()) for (const id of key.split("~")) ids.add(id);
    const order = new Map(data.domains.map((domain, index) => [domain.id, index]));
    return data.systems
      .filter((system) => ids.has(system.id))
      .sort((a, b) => (order.get(a.domain) ?? 99) - (order.get(b.domain) ?? 99) || (degrees.get(b.id)?.total ?? 0) - (degrees.get(a.id)?.total ?? 0));
  }, [data, degrees, linkCounts]);
  const count = (a: string, b: string) => linkCounts.get([a, b].sort().join("~")) ?? 0;
  const firstOfDomain = new Set(linked.filter((system, index) => index === 0 || linked[index - 1]?.domain !== system.domain).map((system) => system.id));
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? id;
  const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
  const focus = hover ?? (selected ? { row: selected, col: selected } : null);
  const busiest = Math.max(1, ...linked.map((system) => degrees.get(system.id)?.total ?? 0));

  return (
    <div className="cl-matrix-wrap">
      <div className="cl-matrix-scroll" role="region" aria-label="Integration matrix (scrolls when narrow)" tabIndex={0}>
        <table className="cl-matrix">
          <caption className="ds-visually-hidden">Calls between each pair of systems, in layer order</caption>
          <thead>
            <tr>
              <td className="cl-matrix-corner" />
              {linked.map((system) => (
                <th key={system.id} scope="col" className={[`tone--${system.domain}`, firstOfDomain.has(system.id) ? "cl-split" : "", focus?.col === system.id ? "on" : ""].join(" ")} title={system.name}>
                  <span translate="no">{system.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linked.map((row) => (
              <Fragment key={row.id}>
                {firstOfDomain.has(row.id) && (
                  <tr className={`cl-matrix-domain tone--${row.domain}`}>
                    <th scope="rowgroup" colSpan={linked.length + 1}>
                      <span>{domainName(row.domain)}</span>
                    </th>
                  </tr>
                )}
                <tr className={focus?.row === row.id ? "on" : undefined}>
                  <th scope="row">
                    <button type="button" aria-pressed={selected === row.id} onClick={() => onSelect(selected === row.id ? null : row.id)}>
                      <span translate="no">{row.name}</span>
                      <span className="ix-deg" aria-label={plural(degrees.get(row.id)?.total ?? 0, "call")}>
                        <i aria-hidden="true">
                          <i style={{ width: `${((degrees.get(row.id)?.total ?? 0) / busiest) * 100}%` }} />
                        </i>
                        <b aria-hidden="true">{degrees.get(row.id)?.total ?? 0}</b>
                      </span>
                    </button>
                  </th>
                  {linked.map((col) => {
                    const n = row.id === col.id ? 0 : count(row.id, col.id);
                    return (
                      <td
                        key={col.id}
                        className={[n ? shade(n) : "", row.id === col.id ? "self" : "", firstOfDomain.has(col.id) ? "cl-split" : "", focus?.col === col.id ? "on" : ""].join(" ")}
                        onMouseEnter={() => setHover({ row: row.id, col: col.id })}
                        onMouseLeave={() => setHover(null)}
                        title={n ? `${row.name} ↔ ${col.name}: ${plural(n, "call")}` : undefined}
                      >
                        {n > 1 ? n : n === 1 ? <span className="ds-visually-hidden">1</span> : ""}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cl-matrix-key" aria-hidden="true">
        <span>Calls between a pair</span>
        <i className="ix-1" />1<i className="ix-2" />2<i className="ix-3" />3–4<i className="ix-4" />5+
        {hover && hover.row !== hover.col && (
          <strong>
            {name(hover.row)} ↔ {name(hover.col)}: {plural(count(hover.row, hover.col), "call")}
          </strong>
        )}
      </p>
    </div>
  );
}
