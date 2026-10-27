/**
 * Which systems deliver which kind of bundle part, across every offering
 * (catalogue merge, step 5, from the lab's capability matrix). Components belong
 * to an offering, but what they do for the customer doesn't: the device at the
 * heart, connectivity, security, in the office, run and manage, resilience. The
 * grouping is this catalogue's reading by keyword (partKinds.tsx), not the
 * sources'. A row is a system, in layer order; a cell marks the components of
 * that kind it delivers, with how many, and names them.
 */
import { count } from "../../home/format";
import { layerRank } from "../landscape/posterModel";
import type { Catalogue } from "../model/model";
import { PART_KINDS, type Part, systemParts } from "./partKinds";

export function DeliveryMatrix({ data, selected, onSelect }: { data: Catalogue; selected: string | null; onSelect: (id: string | null) => void }) {
  const parts = systemParts(data);
  const kinds = PART_KINDS.filter((kind) => [...parts.values()].some((byKind) => byKind.has(kind.id)));
  const rank = layerRank(data.domains);
  const systems = data.systems
    .filter((system) => parts.has(system.id))
    .sort((a, b) => rank(a.domain) - rank(b.domain) || (parts.get(b.id)?.size ?? 0) - (parts.get(a.id)?.size ?? 0));
  const many = data.offerings.length > 1;
  const describe = (list: Part[]) => list.map((part) => `${part.component}${many ? ` (${part.product})` : ""}${part.responsibility ? `: ${part.responsibility}` : ""}`).join("; ");
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? (id || "Not placed in the landscape");

  if (!systems.length) return <p className="cat-quiet">No offering names a system that delivers its parts yet.</p>;
  return (
    <div className="sc-panel">
      <div className="sm-matrix-scroll" role="region" aria-label="Systems by what they deliver (scrolls when narrow)" tabIndex={0}>
        <table className="sc-table sc-matrix">
          <caption className="ds-visually-hidden">The bundle parts each system delivers, by what they do for the customer, across every offering</caption>
          <thead>
            <tr>
              <th scope="col">System</th>
              {kinds.map((kind) => (
                <th key={kind.id} scope="col" className="sc-col">
                  <span className="sc-icon">
                    <svg className="sc-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">{kind.icon}</svg>
                  </span>
                  <span className="sc-colname">{kind.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {systems.map((system, index) => (
              <tr key={system.id} className={`${index === 0 || systems[index - 1]?.domain !== system.domain ? "sc-first" : ""}${selected === system.id ? " is-picked" : ""}`.trim() || undefined}>
                <th scope="row">
                  <button type="button" className="sc-sys" aria-pressed={selected === system.id} onClick={() => onSelect(selected === system.id ? null : system.id)}>
                    <span>
                      <b translate="no">{system.name}</b>
                      <small>{domainName(system.domain)}</small>
                    </span>
                  </button>
                </th>
                {kinds.map((kind) => {
                  const list = parts.get(system.id)?.get(kind.id) ?? [];
                  return (
                    <td key={kind.id} title={list.length ? describe(list) : undefined}>
                      {list.length ? (
                        <span className="sc-mark" role="img" aria-label={`${system.name}, ${kind.name}: ${count(list.length, "component")}: ${describe(list)}`}>
                          {list.length > 1 ? list.length : ""}
                        </span>
                      ) : (
                        <span className="ds-visually-hidden">None</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
