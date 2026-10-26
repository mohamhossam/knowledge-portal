/**
 * An offering's plans compared (catalogue merge, step 3, from the lab's Plans
 * page): one row per characteristic, one column per plan. What differs between
 * the plans comes first; what every plan shares is listed apart, so the
 * differences are what the eye meets.
 */
import "./offering-views.css";

import type { Offering } from "../../api/client";
import { type Column, DataTable, Section, Status } from "../../design/components";
import { count } from "../../home/format";
import { SOURCE_TONE, SOURCE_WORD } from "../ontology";
import { SourceName } from "../provenance/Provenance";

type Plan = Offering["plans"][number];
type Row = { name: string; values: (string | undefined)[] };

/** A plan's value for a characteristic, with its unit when the value doesn't carry one. */
function valueOf(plan: Plan, name: string): string | undefined {
  const item = plan.characteristics.find((characteristic) => characteristic.name === name);
  if (!item) return undefined;
  return item.unit && !item.value.includes(item.unit) ? `${item.value} ${item.unit}` : item.value;
}

/** Whether the plans state a price: a characteristic named as one (price, fee, AED). */
function priced(plans: Plan[]): boolean {
  return plans.some((plan) => plan.characteristics.some((item) => /price|fee|aed/i.test(item.name)));
}

export function OfferingPlans({ offering }: { offering: Offering }) {
  // A version saved before offerings held plans has none.
  const plans = offering.plans ?? [];
  // A plan named after its offering reads by what sets it apart ("Business Pro Plus 500" → "500").
  const short = (name: string) => name.replace(offering.name, "").trim() || name;
  const names = [...new Set(plans.flatMap((plan) => plan.characteristics.map((item) => item.name)))];
  const rows: Row[] = names.map((name) => ({ name, values: plans.map((plan) => valueOf(plan, name)) }));
  const same = (row: Row) => row.values.every((value) => value !== undefined && value === row.values[0]);
  const differs = rows.filter((row) => !same(row));
  const shared = rows.filter(same);
  const columns: Column<Row>[] = [
    { id: "name", header: "Characteristic", rowHeader: true, bidi: true, cell: (row) => row.name },
    ...plans.map((plan, index): Column<Row> => ({
      id: `plan-${index}`,
      header: <bdi>{short(plan.name)}</bdi>,
      numeric: true,
      cell: (row) => row.values[index] ?? <span className="cat-quiet">Not stated</span>,
    })),
  ];

  return (
    <Section title="Plans compared" count={plans.length} headingLevel={3}>
      {plans.length === 0 ? (
        <p className="cat-quiet">No plan is recorded for this offering.</p>
      ) : (
        <div className="cat-stack">
          {!priced(plans) && <p className="cat-lead">No plan states a price: the price is a gap in its sources.</p>}
          {differs.length > 0 ? (
            <DataTable caption={`How the plans of ${offering.name} differ`} columns={columns} rows={differs} rowId={(row) => row.name} />
          ) : (
            <p className="cat-quiet">The plans state no characteristic that sets one apart from another.</p>
          )}
          {shared.length > 0 && (
            <div>
              <h4 className="off-subhead">The same in every plan</h4>
              <ul className="off-pairs">
                {shared.map((row) => (
                  <li key={row.name}>
                    <span className="cat-quiet" dir="auto">{row.name}</span> <bdi>{row.values[0]}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="off-pairs" aria-label="Where each plan comes from">
            {plans.map((plan) => (
              <li key={plan.name}>
                <bdi>{short(plan.name)}</bdi>{" "}
                {plan.confidence ? <Status tone={SOURCE_TONE[plan.confidence]}>{SOURCE_WORD[plan.confidence]}</Status> : <span className="cat-quiet">Not said</span>}
                {plan.source && <span className="cat-detail" dir="auto"><SourceName text={plan.source} /></span>}
              </li>
            ))}
          </ul>
          <p className="cat-quiet">{count(plans.length, "plan")} · {count(rows.length, "characteristic")}</p>
        </div>
      )}
    </Section>
  );
}
