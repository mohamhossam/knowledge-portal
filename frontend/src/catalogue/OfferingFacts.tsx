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

type Fact = Plan["characteristics"][number];

/** A characteristic as its amount and unit, as the service holds them; nothing when it is not a measure. */
function measure(fact: Fact): { amount: string; unit: string } | null {
  return fact.amount && fact.unit ? { amount: fact.amount, unit: fact.unit } : null;
}

/** A characteristic's column: its unit in the head when every plan states it in the same one. */
function characteristic(plans: Plan[], name: string): Column<Plan> {
  const facts = plans.map((plan) => plan.characteristics.find((item) => item.name === name)).filter((fact): fact is Fact => !!fact);
  const units = new Set(facts.map((fact) => measure(fact)?.unit ?? null));
  const unit = units.size === 1 ? [...units][0] : null;
  const missing = <span className="cat-quiet">—</span>;
  if (unit) {
    return {
      id: `c:${name}`,
      header: `${name} (${unit})`,
      numeric: true,
      cell: (plan) => {
        const fact = plan.characteristics.find((item) => item.name === name);
        return fact ? measure(fact)!.amount : missing;
      },
    };
  }
  return {
    id: `c:${name}`,
    header: name,
    bidi: true,
    cell: (plan) => {
      const value = plan.characteristics.find((item) => item.name === name)?.value;
      if (!value) return missing;
      // A code ("FAP-23JF-E") is read whole: it never breaks at its hyphens.
      return /\s/.test(value.trim()) ? value : <span className="cat-nowrap" dir="ltr">{value}</span>;
    },
  };
}

/** The offering's plans side by side, one column per characteristic any plan has. */
export function Plans({ offering, level }: { offering: Offering; level: 2 | 3 }) {
  const plans = offering.plans ?? [];
  const names = [...new Set(plans.flatMap((plan) => plan.characteristics.map((item) => item.name)))];
  // Where every plan comes from the same source, it is said once, above them.
  const first = plans[0];
  const shared = first !== undefined && plans.every((plan) => plan.source === first.source && plan.confidence === first.confidence);
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
          {!shared && <Provenance item={plan} />}
        </>
      ),
    },
    ...names.map((name) => characteristic(plans, name)),
  ];
  return (
    <Section title="Plans" count={plans.length} headingLevel={level}>
      {plans.length ? (
        <>
          <p className="cat-lead">Prices are not held in the catalogue: the explorer reads them from the product catalogue.</p>
          {shared && first && (first.source || first.confidence) && (
            <div className="cat-plans-source">
              Every plan: <Provenance item={first} />
            </div>
          )}
          <DataTable caption={`Plans of ${offering.name}`} captionHidden columns={columns} rows={plans} rowId={(plan) => plan.name} />
        </>
      ) : (
        <p className="cat-quiet">No plan is recorded.</p>
      )}
    </Section>
  );
}
