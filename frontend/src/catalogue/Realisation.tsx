import { Fragment, type ReactNode } from "react";

import type { Offering } from "../api/client";
import { CONFIDENCE, COVERAGE, LAYERS } from "./catalogue";
import { useSourceText } from "./governance";

type Part = Offering["components"][number];

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
 * How a part is realised, layer by layer, as a list for a table cell: "CFS
 * CFSS_ONPREM_FIREWALL_HE", then its RFSs and resources. A layer its sources
 * name nothing for is left out. A part with none, and a layer its source marks
 * as a gap, are due (the Weight Is Rank Rule): someone has to fill them.
 */
export function RealisedAs({ part }: { part: Part }) {
  const realisation = part.realisation ?? [];
  if (!realisation.length) return <span className="realised__missing">Not stated</span>;
  return (
    <ul className="sheet__roles realised">
      {LAYERS.flatMap(({ layer, short, long }) =>
        realisation
          .filter((item) => item.layer === layer)
          .map((item) => (
            <li key={`${layer}:${item.name}`} className={item.confidence === "gap" ? "realised__item--due" : undefined}>
              {short === long ? (
                <span className="realised__layer">{short}</span>
              ) : (
                <abbr className="realised__layer" title={long}>{short}</abbr>
              )}{" "}
              <span dir="auto" className="realised__name">{breakable(item.name)}</span>
              {item.confidence && item.confidence !== "confirmed" && (
                <span className="secondary govtable__by">{CONFIDENCE[item.confidence]}</span>
              )}
            </li>
          )),
      )}
    </ul>
  );
}

/**
 * The same, folded under a part's responsible systems on phones, where the
 * Realised as column is not shown; only one of the two is ever displayed, so a
 * screen reader meets it once, and never as part of the row's header.
 */
export function RealisedInline({ part }: { part: Part }) {
  return (
    <span className="parts__realised-inline">
      <span className="secondary govtable__by">Realised as</span>
      <RealisedAs part={part} />
    </span>
  );
}

/** The layers in words, once under a Parts table, so no one has to recall or hover for them. */
export function RealisationKey({ offering }: { offering: Offering }) {
  if (!offering.components.some((part) => (part.realisation ?? []).length)) return null;
  return (
    <p className="realised__key">
      Realised as: <strong>CFS</strong>, what the customer is sold · <strong>RFS</strong>, what delivers it ·{" "}
      <strong>Resource</strong>, what it runs on.
    </p>
  );
}

/**
 * An offering's non-functional requirements as a governance section. A quality
 * its sources leave undefined is a due line in bold (the Weight Is Rank Rule):
 * it is a gap someone has to fill, not an absence to skip over.
 */
export function NfrSection({ offering, headingId, action }: { offering: Offering; headingId: string; action?: ReactNode }) {
  const nfrs = offering.nfrs ?? [];
  const missing = nfrs.filter((item) => item.coverage === "missing").length;
  const sourceText = useSourceText();
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">
        Non-functional requirements {nfrs.length > 0 && <span className="govsection__count">{nfrs.length}</span>}
      </h3>
      {action && <p className="govsection__actions">{action}</p>}
      {nfrs.length ? (
        <>
          {missing > 0 && (
            <p className="govsection__lead">
              <strong>{missing === 1 ? "1 quality is" : `${missing} qualities are`} not defined</strong> by any source yet.
            </p>
          )}
          <table className="govtable nfrs">
            <caption className="visually-hidden">Non-functional requirements of {offering.name}</caption>
            <thead>
              <tr>
                <th scope="col">Quality</th>
                <th scope="col" className="nfr__defined">Defined</th>
                <th scope="col">What the sources say</th>
              </tr>
            </thead>
            <tbody>
              {nfrs.map((item) => (
                <tr key={item.quality} className={item.coverage === "missing" ? "row row--due" : "row"}>
                  <th scope="row" dir="auto">
                    {item.quality}
                    <span className="secondary govtable__by nfr__defined-inline">{COVERAGE[item.coverage]}</span>
                  </th>
                  <td className={item.coverage === "missing" ? "nfr__defined nfr__missing" : "nfr__defined"}>{COVERAGE[item.coverage]}</td>
                  <td dir="auto">
                    {item.statement ?? <span className="secondary">Not stated</span>}
                    {item.source && <span className="secondary govtable__by" dir="auto">{sourceText(item.source)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="timetable__quiet">No non-functional requirement is recorded.</p>
      )}
    </section>
  );
}
