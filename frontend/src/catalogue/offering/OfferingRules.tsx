/**
 * An offering's business rules (catalogue merge, step 3, from the lab's Rules
 * page): each with what it governs and where it comes from, filtered by what it
 * governs. The offering's own free-text rules, edited on the record, follow.
 */
import "./offering-views.css";

import { type ReactNode, useState } from "react";

import type { Offering } from "../../api/client";
import { FilterStrip, Lines, Section, Status } from "../../design/components";
import { SOURCE_TONE, SOURCE_WORD } from "../ontology";
import { SourceName } from "../provenance/Provenance";

const ALL = "all";
const OTHER = "other";

const KIND_WORDS: Record<string, string> = {
  composition: "Composition",
  fulfilment: "Fulfilment",
  dependency: "Dependency",
  lifecycle: "Lifecycle",
  billing: "Billing",
};

const kindWord = (kind: string) => KIND_WORDS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

export function OfferingRules({ offering, freeText }: { offering: Offering; freeText: ReactNode }) {
  // A version saved before offerings held business rules has none.
  const rules = offering.business_rules ?? [];
  const [kind, setKind] = useState(ALL);
  const kindOf = (rule: (typeof rules)[number]) => rule.kind || OTHER;
  const kinds = [...new Set(rules.map(kindOf))];
  const shown = rules.filter((rule) => kind === ALL || kindOf(rule) === kind);

  return (
    <div className="cat-stack">
      <Section title="Business rules" count={rules.length} headingLevel={3}>
        {rules.length === 0 ? (
          <p className="cat-quiet">No business rule is recorded for this offering.</p>
        ) : (
          <>
            {kinds.length > 1 && (
              <FilterStrip
                label="What the rule governs"
                filters={[{ id: ALL, label: "All", count: rules.length }, ...kinds.map((item) => ({ id: item, label: kindWord(item), count: rules.filter((rule) => kindOf(rule) === item).length }))]}
                active={kind}
                onChange={setKind}
              />
            )}
            <Lines label={`Business rules of ${offering.name}`}>
              {shown.map((rule) => (
                <li key={rule.id} className="off-rule">
                  <code className="off-rule__id" translate="no">{rule.id}</code>
                  <span className="off-rule__body">
                    <span className="cat-detail">{kindWord(kindOf(rule))}</span>
                    <span dir="auto">{rule.statement}</span>
                    <span className="off-rule__source">
                      {rule.confidence ? <Status tone={SOURCE_TONE[rule.confidence]}>{SOURCE_WORD[rule.confidence]}</Status> : <span className="cat-quiet">Not said</span>}
                      {rule.source && <span className="cat-detail" dir="auto"><SourceName text={rule.source} /></span>}
                    </span>
                  </span>
                </li>
              ))}
            </Lines>
          </>
        )}
      </Section>
      {freeText}
    </div>
  );
}
