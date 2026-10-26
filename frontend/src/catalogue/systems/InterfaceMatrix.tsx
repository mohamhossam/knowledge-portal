/**
 * Who calls whom (catalogue merge, step 5, from the lab's interface matrix),
 * read exactly. A row's system calls a column's system; a cell's shade and
 * number are the distinct interfaces it calls it by, each counted once whatever
 * journey or product uses it. A call through the integration layer counts as two
 * hops (the caller to the layer, the layer to the callee). Systems run down and
 * across in layer order, the most connected first within a layer, each layer's
 * rows and columns in its own tint, on a calm slate ramp; maroon stays for the
 * picked system. A real table, so it reads by row and column.
 */
import { Fragment, useMemo, useState } from "react";

import { NOT_STATED, operationName } from "../../design-lab/catalogue/words";
import { count } from "../../home/format";
import { layerRank } from "../landscape/posterModel";
import { type Catalogue, type Integration, systemOf } from "../model/model";

/** One slate ramp, light to dark, for 1, 2, 3–4 and 5+ interfaces. */
function shade(n: number): string {
  if (n >= 5) return "sx-4";
  if (n >= 3) return "sx-3";
  if (n === 2) return "sx-2";
  return "sx-1";
}

export function InterfaceMatrix({ data, interfaces, selected, onSelect }: {
  data: Catalogue;
  interfaces: Integration[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
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
      const operation = operationName(call) || call.purpose || NOT_STATED;
      const from = systemOf(call.from);
      const to = systemOf(call.to);
      if (call.via) {
        add(from, call.via, operation);
        add(call.via, to, operation);
      } else add(from, to, operation);
    }
    const rank = layerRank(data.domains);
    const linked = data.systems
      .filter((system) => partners.has(system.id))
      .sort((a, b) => rank(a.domain) - rank(b.domain) || (partners.get(b.id)?.size ?? 0) - (partners.get(a.id)?.size ?? 0));
    return { hops, partners, linked };
  }, [data, interfaces]);
  const reach = (id: string) => partners.get(id)?.size ?? 0;
  const operations = (from: string, to: string) => hops.get(`${from}>${to}`) ?? [];
  const firstOfDomain = new Set(linked.filter((system, index) => index === 0 || linked[index - 1]?.domain !== system.domain).map((system) => system.id));
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? (id || "In no layer yet");
  const name = (id: string) => data.systems.find((system) => system.id === id)?.name ?? id;
  const focus = hover ?? (selected ? { row: selected, col: selected } : null);
  const most = Math.max(1, ...linked.map((system) => reach(system.id)));
  const brief = (list: string[]) => (list.length > 3 ? `${list.slice(0, 3).join(", ")} and ${list.length - 3} more` : list.join(", "));
  const hovered = hover && hover.row !== hover.col ? operations(hover.row, hover.col) : [];

  if (!linked.length) return <p className="cat-quiet">No modelled journey calls one system from another yet, so there is nothing to cross.</p>;
  return (
    <div className="sm-matrix-wrap">
      <div className="sm-matrix-scroll" role="region" aria-label="Interface matrix (scrolls when narrow)" tabIndex={0}>
        <table className="sm-matrix">
          <caption className="ds-visually-hidden">Distinct interfaces from each row's system to each column's system, in layer order</caption>
          <thead>
            <tr>
              <td className="sm-matrix-corner">
                <span className="sx-corner" aria-hidden="true">Row calls column <b>→</b></span>
              </td>
              {linked.map((system) => (
                <th key={system.id} scope="col" className={[`sm-tone--${system.domain}`, firstOfDomain.has(system.id) ? "sm-split" : "", focus?.col === system.id ? "on" : ""].join(" ")} title={system.name}>
                  <span translate="no">{system.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linked.map((row) => (
              <Fragment key={row.id}>
                {firstOfDomain.has(row.id) && (
                  <tr className={`sm-matrix-domain sm-tone--${row.domain}`}>
                    <th scope="rowgroup" colSpan={linked.length + 1}>
                      <span>{domainName(row.domain)}</span>
                    </th>
                  </tr>
                )}
                <tr className={focus?.row === row.id ? "on" : undefined}>
                  <th scope="row">
                    <button type="button" aria-pressed={selected === row.id} onClick={() => onSelect(selected === row.id ? null : row.id)}>
                      <span translate="no">{row.name}</span>
                      <span className="sx-deg" aria-label={`talks to ${count(reach(row.id), "system")}`}>
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
                        className={[n ? shade(n) : "", row.id === col.id ? "self" : "", firstOfDomain.has(col.id) ? "sm-split" : "", focus?.col === col.id ? "on" : ""].join(" ")}
                        onMouseEnter={() => setHover({ row: row.id, col: col.id })}
                        onMouseLeave={() => setHover(null)}
                        title={n ? `${row.name} → ${col.name}: ${count(n, "interface")} (${brief(list)})` : undefined}
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
      <p className="sm-matrix-key" aria-hidden="true">
        <span>Interfaces the row calls the column by</span>
        <i className="sx-1" />1<i className="sx-2" />2<i className="sx-3" />3–4<i className="sx-4" />5+
        {hover && hover.row !== hover.col && (
          <strong>
            {name(hover.row)} → {name(hover.col)}: {hovered.length ? `${count(hovered.length, "interface")}: ${brief(hovered)}` : "no interface"}
          </strong>
        )}
      </p>
    </div>
  );
}
