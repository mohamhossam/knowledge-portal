/** A product's Components tab: what the bundle is made of, grouped by capability, and the systems that deliver each part. */
import { type ReactNode, useState } from "react";

import type { Offering } from "../../architecture/model";
import { EvidenceTag } from "./labChrome";
import { LabIcon } from "./labIcon";
import { hubOf } from "./catalogueRules";
import { useLabData, useOffering } from "./labData";
import { CAPABILITIES, capabilityOf, DEVICE_ICON } from "./capabilities";
import { plural, useTitle } from "./labUtil";
import { domainRank } from "./posterModel";
import { Missing, ProductHeader } from "./productParts";
import { SystemMonogram } from "./SystemMonogram";

/**
 * The components, in two views of the same bundle. First the components
 * themselves: one card each, labelled with what it does for the customer (the
 * device at the heart, then the capabilities: this catalogue's reading,
 * capabilities.tsx), whether it is always included, its codes, the systems
 * that deliver it and their part, and its source. They can be narrowed by
 * group or by the system that delivers them. Then who delivers what: every
 * component against every system that plays a part in it, so the bundle reads
 * straight into the architecture. A system's column lights up under the
 * pointer, and its heading narrows the cards to what that system delivers.
 */
export function ProductComponents() {
  const data = useLabData();
  const offering = useOffering();
  const [kind, setKind] = useState<string | null>(null);
  const [by, setBy] = useState<string | null>(null);
  const [col, setCol] = useState<string | null>(null);
  useTitle(offering ? `${offering.name} components` : "Components");
  if (!offering) return <Missing what="No such product" />;
  const system = (id: string) => data.systems.find((item) => item.id === id);
  const name = (id: string) => system(id)?.name ?? id;
  const hub = hubOf(offering);
  const groups = [
    ...(hub ? [{ id: "device", name: "At the heart", blurb: "The device the bundle is built on", icon: DEVICE_ICON, items: [hub] }] : []),
    ...CAPABILITIES.map((capability) => ({ ...capability, items: offering.components.filter((item) => item !== hub && capabilityOf(item.name)?.id === capability.id) })),
    { id: "more", name: "More", blurb: "Other parts of the bundle", icon: <path d="M3 8h.01M8 8h.01M13 8h.01" />, items: offering.components.filter((item) => item !== hub && !capabilityOf(item.name)) },
  ].filter((group) => group.items.length);
  // The systems that deliver any component, in map order (layer by layer), the busiest first within a layer.
  const parts = new Map<string, number>();
  for (const component of offering.components) for (const item of component.systems) parts.set(item.systemId, (parts.get(item.systemId) ?? 0) + 1);
  const columns = [...parts.keys()].sort((a, b) => domainRank(system(a)?.domain ?? "") - domainRank(system(b)?.domain ?? "") || (parts.get(b) ?? 0) - (parts.get(a) ?? 0));
  const optional = offering.components.filter((item) => item.mandatory === false).length;
  const shown = (groupId: string, component: Offering["components"][number]) => (!kind || kind === groupId) && (!by || component.systems.some((item) => item.systemId === by));
  const cards = groups.flatMap((group) => group.items.filter((component) => shown(group.id, component)).map((component) => ({ group, component })));
  const tile = (id: string) => (
    <SystemMonogram name={name(id)} tone={system(id)?.domain ?? "customer"} />
  );
  const glyph = (icon: ReactNode, size = 16) => <LabIcon size={size}>{icon}</LabIcon>;
  // A system's heading narrows the cards to what it delivers and brings them into view.
  const showBy = (id: string) => {
    setBy(by === id ? null : id);
    if (by !== id) document.getElementById("cp-cards-h")?.scrollIntoView?.({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <>
      <ProductHeader offering={offering} current="components" />
      <div className="cl-grid">
        <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cp-cards-h">
          <h2 id="cp-cards-h">
            Components{" "}
            <small aria-live="polite">
              {cards.length === offering.components.length ? `${plural(offering.components.length, "component")}${optional ? `, ${optional} optional` : ""}` : `${cards.length} of ${offering.components.length} shown`}
            </small>
          </h2>
          <div className="cp-toolbar">
            <div className="cl-chips" role="group" aria-label="Show components by what they do">
              <button type="button" className="cl-chip" aria-pressed={kind === null} onClick={() => setKind(null)}>
                All <small>{offering.components.length}</small>
              </button>
              {groups.map((group) => (
                <button key={group.id} type="button" className="cl-chip cp-chip" aria-pressed={kind === group.id} onClick={() => setKind(kind === group.id ? null : group.id)}>
                  {glyph(group.icon, 14)}
                  {group.name} <small>{group.items.length}</small>
                </button>
              ))}
            </div>
            <label className="cp-filter">
              <span>Delivered by</span>
              <select className="cl-field" value={by ?? ""} onChange={(event) => setBy(event.target.value || null)}>
                <option value="">Any system</option>
                {columns.map((id) => (
                  <option key={id} value={id}>
                    {name(id)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cards.length ? (
            <ul className="cp-cards">
              {cards.map(({ group, component }) => (
                <li key={component.id} className={`cp-card${component.mandatory === false ? " is-optional" : ""}`}>
                  <div className="cp-card-top">
                    <span className="cp-kind">
                      <span className="cl-cap-icon">{glyph(group.icon)}</span>
                      {group.name}
                    </span>
                    {component.mandatory === false ? <span className="cl-tag-optional">Optional</span> : <span className="cp-always">Always included</span>}
                  </div>
                  <h3>{component.name}</h3>
                  <p className="cp-desc" title={component.description || undefined}>
                    {component.description || "Its sources don't describe it."}
                  </p>
                  {(component.offerCode || component.specCode) && (
                    <dl className="cp-codes">
                      {component.offerCode && (
                        <div>
                          <dt>Offer</dt>
                          <dd translate="no">{component.offerCode}</dd>
                        </div>
                      )}
                      {component.specCode && (
                        <div>
                          <dt>Service</dt>
                          <dd translate="no">{component.specCode}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {component.systems.length > 0 && (
                    <div className="cp-by">
                      <h4>Delivered by</h4>
                      <ul aria-label={`Systems that deliver ${component.name}`}>
                        {component.systems.map((item) => (
                          <li key={item.systemId} className={by === item.systemId ? "is-on" : undefined}>
                            {tile(item.systemId)}
                            <span>
                              <b translate="no">{name(item.systemId)}</b>
                              {item.responsibility && <small>{item.responsibility}</small>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <footer>
                    <EvidenceTag evidence={component.evidence} />
                  </footer>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cl-empty-line">
              No component matches.{" "}
              <button
                type="button"
                className="cl-linkbtn"
                onClick={() => {
                  setKind(null);
                  setBy(null);
                }}
              >
                Show them all
              </button>
            </p>
          )}
        </section>

        <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cp-who-h">
          <h2 id="cp-who-h">
            Who delivers what <small>{plural(columns.length, "system")} · a mark where a system plays a part; a system&apos;s heading shows its components above</small>
          </h2>
          <div className="pv-panel cp-panel">
            <div className="cl-tablewrap" role="region" aria-label="Systems by component (scrolls sideways when narrow)" tabIndex={0} onMouseLeave={() => setCol(null)}>
              <table className="cp-matrix">
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    {columns.map((id) => (
                      <th key={id} scope="col" className={`cp-col${col === id ? " is-col" : ""}${by === id ? " is-on" : ""}`} onMouseEnter={() => setCol(id)}>
                        <button type="button" className="cp-colbtn" aria-pressed={by === id} aria-label={`${name(id)}: ${plural(parts.get(id) ?? 0, "component")}. Show its components`} onClick={() => showBy(id)}>
                          {tile(id)}
                          <span className="cp-colname" translate="no">
                            {name(id)}
                          </span>
                          <small>{parts.get(id)}</small>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.id}>
                    <tr className="cp-group">
                      <th scope="rowgroup" colSpan={columns.length + 1}>
                        {glyph(group.icon, 14)}
                        {group.name}
                      </th>
                    </tr>
                    {group.items.map((component) => (
                      <tr key={component.id} className={[component.mandatory === false ? "is-optional" : "", shown(group.id, component) ? "" : "is-quiet"].join(" ").trim() || undefined}>
                        <th scope="row">
                          {component.name}
                          {component.mandatory === false && <span className="cl-tag-optional">Optional</span>}
                        </th>
                        {columns.map((id) => {
                          const part = component.systems.find((item) => item.systemId === id);
                          return (
                            <td key={id} className={col === id ? "is-col" : undefined} onMouseEnter={() => setCol(id)} title={part ? `${name(id)}: ${part.responsibility || "plays a part"}` : undefined}>
                              {part ? <span className="cp-mark" role="img" aria-label={`${name(id)}: ${part.responsibility || "plays a part"}`} /> : <span className="ds-visually-hidden">Not {name(id)}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
