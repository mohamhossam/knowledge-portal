/**
 * Systems × capabilities: which systems deliver which kind of bundle part,
 * across every product. Components belong to a product, but what they do for
 * the customer doesn't: the device at the heart, connectivity, security, in
 * the office, run and manage, resilience (this catalogue's reading,
 * capabilities.tsx). A row is a system, in layer order; a cell marks the
 * components of that kind it delivers, with how many, and names them (and
 * their product, when more than one product is catalogued).
 */
import type { CatalogueData } from "../../architecture/adapter";
import { PART_KINDS, type Part, systemParts } from "./capabilities";
import { monogram, plural } from "./labUtil";
import { domainRank } from "./posterModel";

export function CapabilityMatrix({ data, selected, onSelect }: { data: CatalogueData; selected: string | null; onSelect: (id: string | null) => void }) {
  const parts = systemParts(data);
  const kinds = PART_KINDS.filter((kind) => [...parts.values()].some((byKind) => byKind.has(kind.id)));
  const systems = data.systems.filter((system) => parts.has(system.id)).sort((a, b) => domainRank(a.domain) - domainRank(b.domain) || (parts.get(b.id)?.size ?? 0) - (parts.get(a.id)?.size ?? 0));
  const many = data.offerings.length > 1;
  const describe = (list: Part[]) => list.map((part) => `${part.component}${many ? ` (${part.product})` : ""}${part.responsibility ? `: ${part.responsibility}` : ""}`).join("; ");
  const domainName = (id: string) => data.domains.find((domain) => domain.id === id)?.name ?? id;

  return (
    <div className="pv-panel cm-panel">
      <div className="cl-tablewrap" role="region" aria-label="Systems by capability (scrolls when narrow)" tabIndex={0}>
        <table className="cp-matrix cm-matrix">
          <caption className="ds-visually-hidden">The bundle parts each system delivers, by what they do for the customer, across every product</caption>
          <thead>
            <tr>
              <th scope="col">System</th>
              {kinds.map((kind) => (
                <th key={kind.id} scope="col" className="cm-col">
                  <span className="cl-cap-icon">
                    <svg className="cl-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                      {kind.icon}
                    </svg>
                  </span>
                  <span className="cp-colname">{kind.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {systems.map((system, index) => (
              <tr key={system.id} className={`${index === 0 || systems[index - 1]?.domain !== system.domain ? "cm-first" : ""}${selected === system.id ? " is-picked" : ""}`.trim() || undefined}>
                <th scope="row">
                  <button type="button" className="cm-sys" aria-pressed={selected === system.id} onClick={() => onSelect(selected === system.id ? null : system.id)}>
                    <span className={`am-mono cl-systile tone--${system.domain} am-mono--${monogram(system.name).length}`} aria-hidden="true" translate="no">
                      {monogram(system.name)}
                    </span>
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
                        <span className="cm-mark" role="img" aria-label={`${system.name}, ${kind.name}: ${plural(list.length, "component")}: ${describe(list)}`}>
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
