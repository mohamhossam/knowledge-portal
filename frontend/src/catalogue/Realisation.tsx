import "./offering/offering.css";

import { Fragment, type ReactNode } from "react";

import type { Offering, Release } from "../api/client";
import { type Column, DataTable, Section, Status, type StatusTone } from "../design/components";
import { COVERAGE, LAYERS } from "./catalogue";
import { ConfidenceMark, Provenance } from "./GovernanceSections";

type Part = Offering["components"][number];
type Nfr = Offering["nfrs"][number];
type SpecRecord = NonNullable<Release["realisations"]>[number];

/** "CFSS_INTERNET_CPE_HE" may break after each underscore, never between letters. */
function breakable(name: string) {
  const pieces = name.split("_");
  return pieces.map((piece, index) => (
    <Fragment key={index}>
      {piece}
      {index < pieces.length - 1 && (
        <>
          _<wbr />
        </>
      )}
    </Fragment>
  ));
}

/**
 * How a part is realised, layer by layer, as a list for a table cell: "CFSS
 * CFSS_ONPREM_FIREWALL_HE", then its RFSSs and resources. A layer its sources
 * name nothing for is left out. A part with none, and a layer its source marks
 * as a gap, are due (the Weight Is Rank Rule): someone has to fill them; one
 * inferred rather than stated carries the Suggested mark. Given the version's
 * `records`, a CFSS or RFSS linked to one shows that specification's rules (ADR-0127).
 */
export function RealisedAs({ part, records }: { part: Part; records?: ReadonlyMap<string, SpecRecord> }) {
  const realisation = part.realisation ?? [];
  if (!realisation.length) return <Status tone="attention">Not stated</Status>;
  return (
    <ul className="offering-realised">
      {LAYERS.flatMap(({ layer, short, long }) =>
        realisation
          .filter((item) => item.layer === layer)
          .map((item) => (
            <li key={`${layer}:${item.name}`}>
              {short === long ? (
                <span className="offering-realised__layer">{short}</span>
              ) : (
                <abbr className="offering-realised__layer" title={long}>{short}</abbr>
              )}{" "}
              <span dir="auto" className={item.confidence === "gap" ? "offering-realised__name offering-due" : "offering-realised__name"}>
                {breakable(item.name)}
              </span>
              {(item.confidence === "inferred" || item.confidence === "gap") && (
                <span className="offering-by"><ConfidenceMark confidence={item.confidence} /></span>
              )}
              <SpecificationRules record={item.record_id ? records?.get(item.record_id) : undefined} />
            </li>
          )),
      )}
    </ul>
  );
}

/** What a CFSS or RFSS requires, under its name: nothing when it states no rule. */
function SpecificationRules({ record }: { record: SpecRecord | undefined }) {
  const rules = record?.rules ?? [];
  if (!rules.length) return null;
  return (
    <ul className="offering-realised__rules" aria-label={`Rules of ${record!.name}`}>
      {rules.map((rule) => <li key={rule} dir="auto">{rule}</li>)}
    </ul>
  );
}

/**
 * The same, folded under a part's responsible systems on phones, where the
 * Realised as column is not shown; only one of the two is ever displayed, so a
 * screen reader meets it once, and never as part of the row's header.
 */
export function RealisedInline({ part, records }: { part: Part; records?: ReadonlyMap<string, SpecRecord> }) {
  return (
    <div className="offering-realised-inline">
      <span className="offering-quiet">Realised as</span>
      <RealisedAs part={part} records={records} />
    </div>
  );
}

/** The layers in words, once under a Parts table, so no one has to recall or hover for them. */
export function RealisationKey({ offering }: { offering: Offering }) {
  if (!offering.components.some((part) => (part.realisation ?? []).length)) return null;
  return (
    <p className="offering-key">
      Realised as: <strong>CFSS</strong>, what the customer is sold · <strong>RFSS</strong>, what delivers it ·{" "}
      <strong>Resource</strong>, what it runs on.
    </p>
  );
}

const COVERAGE_TONE: Record<Nfr["coverage"], StatusTone> = {
  defined: "done",
  partial: "neutral",
  missing: "attention",
};

const NFR_COLUMNS: Column<Nfr>[] = [
  { id: "quality", header: "Quality", rowHeader: true, bidi: true, width: "11rem", cell: (item) => item.quality },
  { id: "defined", header: "Defined", width: "10rem", cell: (item) => <Status tone={COVERAGE_TONE[item.coverage]}>{COVERAGE[item.coverage]}</Status> },
  {
    id: "said",
    header: "What the sources say",
    bidi: true,
    cell: (item) => (
      <>
        {item.statement ?? <span className="offering-quiet">Not stated</span>}
        <Provenance item={item} />
      </>
    ),
  },
];

/**
 * An offering's non-functional requirements as a section. A quality its sources
 * leave undefined says so as a status needing attention (the Weight Is Rank Rule):
 * it is a gap someone has to fill, not an absence to skip over.
 */
export function NfrSection({ offering, action, level = 3 }: {
  offering: Offering;
  /** Kept for callers; the section names its own heading. */
  headingId: string;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const nfrs = offering.nfrs ?? [];
  const missing = nfrs.filter((item) => item.coverage === "missing").length;
  return (
    <Section title="Non-functional requirements" count={nfrs.length > 0 ? nfrs.length : undefined} actions={action} headingLevel={level}>
      {nfrs.length ? (
        <>
          {missing > 0 && (
            <p className="offering-lead">
              <strong>{missing === 1 ? "1 quality is" : `${missing} qualities are`} not defined</strong> by any source yet.
            </p>
          )}
          <DataTable
            caption={`Non-functional requirements of ${offering.name}`}
            captionHidden
            columns={NFR_COLUMNS}
            rows={nfrs}
            rowId={(item) => item.quality}
          />
        </>
      ) : (
        <p className="offering-quiet">No non-functional requirement is recorded.</p>
      )}
    </Section>
  );
}
