import type { Offering } from "../api/client";
import { CONFIDENCE, COVERAGE, LAYERS } from "./catalogue";

type Part = Offering["components"][number];

/**
 * How a part is realised, layer by layer, as a list for a table cell: "CFS
 * CFSS_ONPREM_FIREWALL_HE", then its RFSs and resources. A layer its sources
 * name nothing for is left out; none at all says so.
 */
export function RealisedAs({ part }: { part: Part }) {
  const realisation = part.realisation ?? [];
  if (!realisation.length) return <span className="secondary">Not stated</span>;
  return (
    <ul className="sheet__roles realised">
      {LAYERS.flatMap(({ layer, short, long }) =>
        realisation
          .filter((item) => item.layer === layer)
          .map((item) => (
            <li key={`${layer}:${item.name}`}>
              <abbr className="realised__layer" title={long}>{short}</abbr>{" "}
              <span dir="auto" className="realised__name">{item.name}</span>
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
 * The same, under a part's name, for phones: there the Realised as column is
 * folded into the part's cell, so the table keeps two readable columns. Only
 * one of the two is ever displayed, so a screen reader meets it once.
 */
export function RealisedInline({ part }: { part: Part }) {
  if (!(part.realisation ?? []).length) return null;
  return (
    <span className="parts__realised-inline">
      <span className="secondary govtable__by">Realised as</span>
      <RealisedAs part={part} />
    </span>
  );
}

/**
 * An offering's non-functional requirements as a governance section. A quality
 * its sources leave undefined is a due line in bold (the Weight Is Rank Rule):
 * it is a gap someone has to fill, not an absence to skip over.
 */
export function NfrSection({ offering, headingId }: { offering: Offering; headingId: string }) {
  const nfrs = offering.nfrs ?? [];
  const missing = nfrs.filter((item) => item.coverage === "missing").length;
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">
        Non-functional requirements {nfrs.length > 0 && <span className="govsection__count">{nfrs.length}</span>}
      </h3>
      {nfrs.length ? (
        <>
          {missing > 0 && (
            <p className="govsection__lead">
              <strong>{missing === 1 ? "1 quality is" : `${missing} qualities are`} not defined</strong> by any source yet.
            </p>
          )}
          <table className="govtable">
            <caption className="visually-hidden">Non-functional requirements of {offering.name}</caption>
            <thead>
              <tr>
                <th scope="col">Quality</th>
                <th scope="col">Defined</th>
                <th scope="col">What the sources say</th>
              </tr>
            </thead>
            <tbody>
              {nfrs.map((item) => (
                <tr key={item.quality} className={item.coverage === "missing" ? "row row--due" : "row"}>
                  <th scope="row" dir="auto">{item.quality}</th>
                  <td className={item.coverage === "missing" ? "nfr__missing" : undefined}>{COVERAGE[item.coverage]}</td>
                  <td dir="auto">
                    {item.statement ?? <span className="secondary">Nothing</span>}
                    {item.source && <span className="secondary govtable__by" dir="auto">{item.source}</span>}
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
