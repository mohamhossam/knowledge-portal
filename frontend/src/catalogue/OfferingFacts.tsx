/**
 * What an offering's record holds beyond its parts and orders: its business
 * rules and its plans. Each is read as the
 * version holds it, with where each fact comes from.
 */
import type { Offering } from "../api/client";
import { type Column, DataTable, Section } from "../design/components";
import { Provenance } from "./GovernanceSections";

type Rule = Offering["business_rules"][number];
type Plan = Offering["plans"][number];

/** A kind as written, "eligibility_check", read as words: "Eligibility check". */
function kindWord(kind: string): string {
  const words = kind.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

/** The offering's business rules, each with its kind and where it is said. */
export function BusinessRules({ offering, level }: { offering: Offering; level: 2 | 3 }) {
  const rules = offering.business_rules ?? [];
  const columns: Column<Rule>[] = [
    { id: "id", header: "Rule", rowHeader: true, cell: (rule) => rule.id },
    {
      id: "statement",
      header: "What it says",
      bidi: true,
      cell: (rule) => (
        <>
          <span dir="auto">{rule.statement}</span>
          <Provenance item={rule} />
        </>
      ),
    },
    { id: "kind", header: "Kind", cell: (rule) => (rule.kind ? kindWord(rule.kind) : <span className="cat-quiet">Not said</span>) },
  ];
  return (
    <Section title="Business rules" count={rules.length} headingLevel={level}>
      {rules.length ? (
        <DataTable caption={`Business rules of ${offering.name}`} captionHidden columns={columns} rows={rules} rowId={(rule) => rule.id} />
      ) : (
        <p className="cat-quiet">No business rule is recorded.</p>
      )}
    </Section>
  );
}

/** The offering's plans side by side, one column per characteristic any plan has. */
export function Plans({ offering, level }: { offering: Offering; level: 2 | 3 }) {
  const plans = offering.plans ?? [];
  const names = [...new Set(plans.flatMap((plan) => plan.characteristics.map((item) => item.name)))];
  const columns: Column<Plan>[] = [
    {
      id: "plan",
      header: "Plan",
      rowHeader: true,
      bidi: true,
      cell: (plan) => (
        <>
          <span dir="auto">{plan.name}</span>
          {plan.description && <span className="cat-detail" dir="auto">{plan.description}</span>}
          <Provenance item={plan} />
        </>
      ),
    },
    ...names.map((name): Column<Plan> => ({
      id: `c:${name}`,
      header: name,
      bidi: true,
      cell: (plan) => plan.characteristics.find((item) => item.name === name)?.value ?? <span className="cat-quiet">—</span>,
    })),
  ];
  return (
    <Section title="Plans" count={plans.length} headingLevel={level}>
      {plans.length ? (
        <>
          <p className="cat-lead">Prices are not held in the catalogue: the explorer reads them from the product catalogue.</p>
          <DataTable caption={`Plans of ${offering.name}`} captionHidden columns={columns} rows={plans} rowId={(plan) => plan.name} />
        </>
      ) : (
        <p className="cat-quiet">No plan is recorded.</p>
      )}
    </Section>
  );
}
