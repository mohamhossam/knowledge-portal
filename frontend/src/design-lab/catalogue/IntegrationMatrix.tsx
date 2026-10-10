/**
 * The interface matrix: who calls whom, read exactly. A row's system calls a
 * column's system; a cell's shade and number are the distinct interfaces it
 * calls it by, each counted once whatever journey or product uses it, so the
 * matrix holds for any product. A call through the integration layer counts as
 * two hops (the caller to the layer, the layer to the callee). Systems run down
 * and across in TAM layer order, the most connected first within a layer, each
 * layer's columns and rows in its own tint, on a calm slate ramp (maroon stays
 * for the picked system). Each row header carries a bar of how many systems it
 * talks to. A real table, so it reads by row and column.
 */
import { Fragment, useMemo, useState } from "react";

import type { CatalogueData } from "../../architecture/adapter";
import type { Integration } from "../../architecture/model";
import { plural } from "./labUtil";

/** One slate ramp, light to dark, for 1, 2, 3–4 and 5+ interfaces. */
function shade(count: number): string {
  if (count >= 5) return "ix-4";
  if (count >= 3) return "ix-3";
  if (count === 2) return "ix-2";
  return "ix-1";
}

export function IntegrationMatrix({ data, interfaces, selected, onSelect }: { data: CatalogueData; interfaces: Integration[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const [hover, setHover] = useState<{ row: string; col: string } | null>(null);
  // Directed hops, caller to callee, with the operations each carries; each system's partners, either way; the linked systems in layer order.
  const { hops, partners, linked } = useMemo(() => {
    const known = new Set(data.systems.map((system) => system.id));
    const hops = new Map<string, string[]>();
    const partners = new Map<string, Set<string>>();
    const meet = (a: string, b: string) => {
      const set = partners.get(a) ?? new Set<string>();
      set.add(b);
      partners.set(a, set);
    };
    const add = (from: string | undefined, to: string | undefined, operation: string) => {
      if (!from || !to || from === to || !known.has(from) || !known.has(to)) return;
      const key = `${from}>${to}`;
      hops.set(key, [...(hops.get(key) ?? []), operation]);
      meet(from, to);
      meet(to, from);
    };
    for (const call of interfaces) {
      const operation = call.operation || call.purpose || "Not stated";
      if (call.via) {
        add(call.from, call.via, operation);
        add(call.via, call.to, operation);
      } else add(call.from, call.to, operation);
    }
    const order = new Map(data.domains.map((domain, index) => [domain.id, index]));
    const linked = data.systems
      .filter((system) => partners.has(system.id))
      .sort((a, b) => (order.get(a.domain) ?? 99) - (order.get(b.domain) ?? 99) || (partners.get(b.id)?.size ?? 0) - (partners.get(a.id)?.size ?? 0));
    return { hops, partners, linked };
  }, [data, interfaces]);
  const reach = (id: string) => partners.get(id)?.size ?? 0;
  const operations = (from: string, to: string) => hops.get(`${from}>${to}`) ?? [];
  const firstOfDomain = new Set(linked.filter((system, index) => index === 0 || linked[index - 1]?.domain !== system.domain).map((system) => system.id));
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? id;
  const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
  const focus = hover ?? (selected ? { row: selected, col: selected } : null);
  const most = Math.max(1, ...linked.map((system) => reach(system.id)));
  const brief = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.join(", "));
  const hovered = hover && hover.row !== hover.col ? operations(hover.row, hover.col) : [];

  return (
    <div className="cl-matrix-wrap">
      <div className="cl-matrix-scroll" role="region" aria-label="Interface matrix (scrolls when narrow)" tabIndex={0}>
        <table className="cl-matrix">
          <caption className="ds-visually-hidden">Distinct interfaces from each row's system to each column's system, in layer order</caption>
          <thead>
            <tr>
              <td className="cl-matrix-corner">
                <span className="ix-corner" aria-hidden="true">
                  Row calls column <b>→</b>
                </span>
              </td>
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
                      <span className="ix-deg" aria-label={`talks to ${plural(reach(row.id), "system")}`}>
                        <i aria-hidden="true">
                          <i style={{ width: `${(reach(row.id) / most) * 100}%` }} />
                        </i>
                        <b aria-hidden="true">{reach(row.id)}</b>
                      </span>
                    </button>
                  </th>
                  {linked.map((col) => {
                    const list = row.id === col.id ? [] : operations(row.id, col.id);
                    const n = list.length;
                    return (
                      <td
                        key={col.id}
                        className={[n ? shade(n) : "", row.id === col.id ? "self" : "", firstOfDomain.has(col.id) ? "cl-split" : "", focus?.col === col.id ? "on" : ""].join(" ")}
                        onMouseEnter={() => setHover({ row: row.id, col: col.id })}
                        onMouseLeave={() => setHover(null)}
                        title={n ? `${row.name} → ${col.name}: ${plural(n, "interface")} (${brief(list)})` : undefined}
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
        <span>Interfaces the row calls the column by</span>
        <i className="ix-1" />1<i className="ix-2" />2<i className="ix-3" />3–4<i className="ix-4" />5+
        {hover && hover.row !== hover.col && (
          <strong>
            {name(hover.row)} → {name(hover.col)}: {hovered.length ? `${plural(hovered.length, "interface")}: ${brief(hovered)}` : "no interface"}
          </strong>
        )}
      </p>
    </div>
  );
}
