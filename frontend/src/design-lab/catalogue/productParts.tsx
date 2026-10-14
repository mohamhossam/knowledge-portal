/**
 * The parts of a product page that other pages show too: the product's header with its
 * tabs, the plans side by side, and the "not in this version" state. Kept apart from
 * ProductPage, so the product's tabs and its architecture and journeys don't import it.
 */
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";

import { type Offering, systemOf } from "../../catalogue/model/model";
import { isPriced } from "./catalogueRules";
import { AreaTabs, EvidenceTag, PathBar } from "./labChrome";
import { LabIcon } from "./labIcon";
import { firstJourneyHref, LAB, useLabData } from "./labData";
import { leadingNumber, plural } from "./labUtil";
import { allViews } from "./posterModel";
import { catalogueName, gapSource } from "./words";

export function Missing({ what }: { what: string }) {
  return (
    <div className="cl-empty">
      <h1>{what}</h1>
      <p>
        It isn't in this catalogue version. <Link to={LAB}>Back to the landscape</Link>.
      </p>
    </div>
  );
}

type ProductSection = "overview" | "hierarchy" | "plans" | "rules" | "components" | "journeys" | "architecture";

/** The product's mark and the icons of its figures, drawn like the catalogue's other icons. */
const HEAD_ICONS: Record<string, ReactNode> = {
  product: <path d="M8 2 14 5v6l-6 3-6-3V5zM2 5l6 3 6-3M8 8v6" />,
  plans: <path d="M3.5 2.5h9v11h-9zM6 5.5h4M6 8h4M6 10.5h2.5" />,
  components: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <path d="M11.25 9v4.5M9 11.25h4.5" />
    </>
  ),
  orders: <path d="M2.5 5.5h9M9 3l2.5 2.5L9 8M13.5 10.5h-9M7 8l-2.5 2.5L7 13" />,
  journeys: (
    <>
      <circle cx="3.5" cy="12.5" r="1.5" />
      <circle cx="12.5" cy="3.5" r="1.5" />
      <path d="M5 12.5h3.5a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4H11" />
    </>
  ),
  systems: <path d="M8 2 14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3" />,
};

/**
 * The product's header, the same on every product tab: a soft band under the
 * catalogue bar, as wide as it (the Landscape's header band, for a product).
 * It holds where the product sits (the hierarchy rail), its mark and name with
 * one statement of what it is for, the page's actions, the product's figures
 * as links into the tabs that hold them, its source, and its tabs. Compact
 * keeps the rail, the name and the tabs.
 */
export function ProductHeader({ offering, current, actions, compact = false }: { offering: Offering; current: ProductSection; actions?: ReactNode; compact?: boolean }) {
  const data = useLabData();
  const path: { id: string; name: string; level: string }[] = [];
  let node = data.portfolio.find((item) => item.id === offering.nodeId);
  while (node) {
    path.unshift({ id: node.id, name: node.name, level: node.level });
    const parent = node.parentId;
    node = parent ? data.portfolio.find((item) => item.id === parent) : undefined;
  }
  const views = useMemo(() => allViews(data).filter((view) => view.offeringId === offering.id), [data, offering]);
  const systems = new Set(
    views
      .flatMap((view) => [...view.steps.map((step) => systemOf(step.lane)), ...view.integrations.flatMap((call) => [systemOf(call.from), systemOf(call.to), call.via])])
      .filter((id): id is string => typeof id === "string" && data.systems.some((system) => system.id === id)),
  );
  const journeys = data.journeys.filter((journey) => journey.offeringId === offering.id);
  const base = `${LAB}/products/${offering.id}`;
  const journeysTo = firstJourneyHref(data, offering.id);
  const tabs: { id: ProductSection; label: string; to: string }[] = [
    { id: "overview", label: "Overview", to: base },
    { id: "hierarchy", label: "Hierarchy", to: `${base}/hierarchy` },
    { id: "plans", label: "Plans", to: `${base}/plans` },
    { id: "rules", label: "Business rules", to: `${base}/rules` },
    { id: "components", label: "Components", to: `${base}/components` },
    { id: "journeys", label: "Journeys", to: journeysTo },
    { id: "architecture", label: "Architecture", to: `${base}/architecture` },
  ];
  // The product's figures, each a way into the tab that holds them.
  const figures = [
    { id: "plans", count: offering.plans.length, noun: "plan", to: `${base}/plans` },
    { id: "components", count: offering.components.length, noun: "component", to: `${base}/components` },
    { id: "orders", count: offering.orderTypes.length, noun: "order type", to: journeysTo },
    { id: "journeys", count: journeys.length, noun: "journey", to: journeysTo },
    { id: "systems", count: systems.size, noun: "system", to: `${base}/architecture` },
  ];
  // One statement of what the product is for; the bundle drawing carries what is in it.
  const statement = offering.purpose || offering.summary;
  return (
    <>
      <AreaTabs current="products" />
      <div className={`pd-band${compact ? " pd-band--compact" : ""}`}>
        <PathBar
          label="Where it sits in the portfolio"
          items={[{ level: "Catalogue", name: catalogueName(data), to: LAB }, ...path.map((item) => ({ level: item.level, name: item.name, to: `${base}/hierarchy` })), { level: "Offering", name: offering.name }]}
        />
        <header className="pd-head">
          <span className="pd-mark" aria-hidden="true">
            <LabIcon size={22}>{HEAD_ICONS.product}</LabIcon>
          </span>
          <div className="pd-text">
            <h1>{offering.name}</h1>
            {!compact && statement && <p className="pd-lede">{statement}</p>}
          </div>
          {actions && <div className="pd-actions">{actions}</div>}
        </header>
        {!compact && (
          <div className="pd-facts">
            <ul className="pd-figures" aria-label="At a glance">
              {figures.map((figure) => (
                <li key={figure.id}>
                  <Link className="pd-figure" to={figure.to}>
                    <LabIcon>{HEAD_ICONS[figure.id]}</LabIcon>
                    <b>{figure.count}</b>
                    {plural(figure.count, figure.noun).replace(/^\d+\s/, "")}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="pd-source">
              <EvidenceTag evidence={offering.evidence} />
            </div>
          </div>
        )}
        <nav className="cl-tabs cl-tabs--sub pd-tabs" aria-label={`${offering.name} sections`}>
          {tabs.map((tab) => (
            <Link key={tab.id} to={tab.to} aria-current={tab.id === current ? "page" : undefined}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

/**
 * What the customer gets, drawn as the bundle's anatomy: the device at the
 * heart (its models as chips), then the components grouped by what they do
 * for the customer, joined to the device by one spine. Each component names
 * the systems that deliver it as the same monogram tiles the architecture map
 * uses, so the bundle reads straight into the architecture. Optional parts are
 * dashed. The grouping is this catalogue's reading, by keyword, so it works
 * for any product; anything it can't place falls under "More".
 */

/** Plans side by side, differences first; what every plan shares is said once. */
export function Plans({ offering }: { offering: Offering }) {
  const data = useLabData();
  const names = [...new Set(offering.plans.flatMap((plan) => plan.characteristics.map((item) => item.name)))];
  const value = (plan: Offering["plans"][number], name: string) => plan.characteristics.find((item) => item.name === name)?.value;
  const rows = names.map((name) => {
    const values = offering.plans.map((plan) => value(plan, name));
    const same = values.every((item) => item !== undefined && item === values[0]);
    const numbers = values.map((item) => (item ? leadingNumber(item) : null));
    const max = Math.max(0, ...numbers.map((n) => n ?? 0));
    return { name, values, same, numbers, max };
  });
  const differs = rows.filter((row) => !row.same);
  const shared = rows.filter((row) => row.same);
  const priced = isPriced(offering);
  const short = (name: string) => name.replace(offering.name, "").trim() || name;
  return (
    <section className="cl-card" aria-labelledby="cl-plans-h">
      <h2 id="cl-plans-h">
        Plans compared <small>{plural(offering.plans.length, "plan")}</small>
      </h2>
      <div className="cl-tablewrap" role="region" aria-label="Plans table (scrolls sideways when narrow)" tabIndex={0}>
        <table className="cl-table">
          <thead>
            <tr>
              <th scope="col">Characteristic</th>
              {offering.plans.map((plan) => (
                <th key={plan.name} scope="col" className="num">
                  {short(plan.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {differs.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                {row.values.map((item, index) => {
                  const n = row.numbers[index];
                  return (
                    <td key={offering.plans[index]?.name ?? index} className="num">
                      {item ?? <span className="gap">Not stated</span>}
                      {n !== null && n !== undefined && row.max > 0 && (
                        <i className="cl-spark" aria-hidden="true">
                          <i style={{ width: `${(n / row.max) * 100}%` }} />
                        </i>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {shared.length > 0 && (
              <tr className="cl-table-group">
                <th scope="rowgroup" colSpan={offering.plans.length + 1}>
                  The same on every plan
                </th>
              </tr>
            )}
            {shared.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td colSpan={offering.plans.length}>{row.values[0]}</td>
              </tr>
            ))}
            {!priced && (
              <tr>
                <th scope="row">Monthly price</th>
                <td colSpan={offering.plans.length} className="gap">
                  Gap: {gapSource(data, offering)} states no prices
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
