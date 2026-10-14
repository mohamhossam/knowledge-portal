/** Who can buy a product and how its orders arrive: the eligibility conditions by question, and every order type against every ordering channel. */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Offering } from "../../catalogue/model/model";
import { EvidenceTag } from "./labChrome";
import { LabIcon } from "./labIcon";
import { channelKindName, type EligibilityGroup, eligibilityGroup } from "./catalogueRules";
import { journeyHref, useLabData } from "./labData";
import { plural } from "./labUtil";
import { STAGES, stageOfCode } from "./stages";
import { SystemMonogram } from "./SystemMonogram";

/** Eligibility grouped by what it answers (eligibilityGroup): who, where, on what terms, through which route. */
const ELIGIBILITY_GROUPS: { id: EligibilityGroup; label: string; question: string; icon: ReactNode }[] = [
  {
    id: "who",
    label: "Who",
    question: "Which customers",
    icon: (
      <>
        <circle cx="8" cy="5.5" r="2.5" />
        <path d="M3 14c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8" />
      </>
    ),
  },
  {
    id: "where",
    label: "Where",
    question: "Which locations",
    icon: (
      <>
        <path d="M8 14.5s-4.5-4.2-4.5-7.8a4.5 4.5 0 0 1 9 0c0 3.6-4.5 7.8-4.5 7.8z" />
        <circle cx="8" cy="6.7" r="1.6" />
      </>
    ),
  },
  {
    id: "terms",
    label: "On what terms",
    question: "Contract and account",
    icon: <path d="M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5M6 13h2.5" />,
  },
  {
    id: "how",
    label: "Through which route",
    question: "How the order arrives",
    icon: (
      <>
        <circle cx="3.5" cy="12.5" r="1.5" />
        <circle cx="12.5" cy="3.5" r="1.5" />
        <path d="M5 12.5h4.5a2 2 0 0 0 0-4h-3a2 2 0 0 1 0-4H11" />
      </>
    ),
  },
];

/**
 * Who can buy the offering and how its orders arrive, as two full-width
 * sections. First the conditions, four cards side by side, one per question,
 * each with its own icon; every condition sits on a checklist line whose node
 * shows how sure the catalogue is (filled: confirmed, ring: inferred, dashed: a
 * gap). Then every order type against every ordering channel: rows grouped by the customer's stage
 * (join, change, support, leave), channels grouped by kind, each channel with
 * its monogram tile and how many order types it takes.
 */
export function WhoCanBuy({ offering }: { offering: Offering }) {
  const data = useLabData();
  const grouped = new Map<string, Offering["eligibility"]>();
  for (const point of offering.eligibility) {
    const group = eligibilityGroup(point.title);
    grouped.set(group, [...(grouped.get(group) ?? []), point]);
  }
  const groups = [...ELIGIBILITY_GROUPS, { id: "other" as const, label: "Also", question: "Other conditions", icon: <path d="M3 8h.01M8 8h.01M13 8h.01" /> }].filter((group) => grouped.has(group.id));
  const sure = { confirmed: 0, inferred: 0, gap: 0 };
  for (const point of offering.eligibility) sure[point.evidence.status] += 1;

  const channels = data.channels.filter((channel) => offering.orderTypes.some((type) => type.channels.includes(channel.id)));
  const kinds = [...new Set(channels.map((channel) => channel.kind))].map((kind) => ({ kind, channels: channels.filter((channel) => channel.kind === kind) }));
  const ordered = kinds.flatMap((item) => item.channels);
  const takes = (channelId: string) => offering.orderTypes.filter((type) => type.channels.includes(channelId)).length;
  const tone = (systemId: string) => data.systems.find((system) => system.id === systemId)?.domain ?? "customer";
  const stages = STAGES.map((stage) => ({ ...stage, types: offering.orderTypes.filter((type) => stageOfCode(type.code) === stage.id) })).filter((stage) => stage.types.length);
  const journeyFor = (code: string) => data.journeys.find((journey) => journey.offeringId === offering.id && journey.orderType === code);

  return (
    <>
      <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cl-who-h">
        <h2 id="cl-who-h">
          Who can buy it <small>{plural(offering.eligibility.length, "condition")}, by the question each answers</small>
          <span className="cl-sure">
            <span className="cl-sure-item confirmed">
              <i aria-hidden="true" />
              {sure.confirmed} confirmed
            </span>
            {sure.inferred > 0 && (
              <span className="cl-sure-item inferred">
                <i aria-hidden="true" />
                {sure.inferred} inferred
              </span>
            )}
            {sure.gap > 0 && (
              <span className="cl-sure-item gap">
                <i aria-hidden="true" />
                {sure.gap} {sure.gap === 1 ? "gap" : "gaps"}
              </span>
            )}
          </span>
        </h2>
        <div className="cl-elig">
          {groups.map((group) => (
            <section key={group.id} className="cl-elig-card" aria-labelledby={`cl-who-${group.id}`}>
              <header>
                <span className="cl-cap-icon">
                  <LabIcon>{group.icon}</LabIcon>
                </span>
                <span>
                  <h3 id={`cl-who-${group.id}`}>{group.label}</h3>
                  <small>{group.question}</small>
                </span>
              </header>
              <ul>
                {(grouped.get(group.id) ?? []).map((point) => (
                  <li key={point.title} className={`is-${point.evidence.status}`}>
                    <i className="cl-elig-node" aria-hidden="true" />
                    <strong>{point.title}</strong>
                    <p>{point.detail}</p>
                    <EvidenceTag evidence={point.evidence} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
      <section className="cl-card cl-span-12 pv-sec" aria-labelledby="cl-route-h">
        <h2 id="cl-route-h">
          How each order type is placed{" "}
          <small>
            {plural(offering.orderTypes.length, "order type")} · {plural(channels.length, "ordering channel")} · grouped by the customer's stage
          </small>
        </h2>
        <div className="pv-panel cl-route">
          <div className="cl-tablewrap" role="region" aria-label="Channels by order type (scrolls sideways when narrow)" tabIndex={0}>
            <table className="cl-route-table">
              <thead>
                <tr className="cl-route-kinds">
                  <td />
                  {kinds.map((item) => (
                    <th key={item.kind} scope="colgroup" colSpan={item.channels.length}>
                      {channelKindName(data, item.kind)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th scope="col">Order type</th>
                  {ordered.map((channel) => (
                    <th key={channel.id} scope="col" className="cl-route-ch">
                      <SystemMonogram name={channel.name} tone={tone(channel.systemId)} />
                      <span className="cl-route-chname">{channel.name.replace(/\s*\(.*\)\s*$/, "")}</span>
                      <small>{takes(channel.id)}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              {stages.map((stage) => (
                <tbody key={stage.id}>
                  <tr className="cl-route-stage">
                    <th scope="rowgroup" colSpan={ordered.length + 1}>
                      {stage.name} <small>{stage.blurb} · {stage.types.length}</small>
                    </th>
                  </tr>
                  {stage.types.map((type) => {
                    const journey = journeyFor(type.code);
                    return (
                      <tr key={type.code}>
                        <th scope="row">
                          <span>{type.name}</span>
                          {journey && (
                            <Link className="cl-tag" to={journeyHref(journey.id, journey.channels[0])} aria-label={`${type.name} journey`}>
                              Journey
                            </Link>
                          )}
                        </th>
                        {type.channels.length === 0 ? (
                          <td className="cl-route-none" colSpan={ordered.length}>
                            No ordering channel stated
                          </td>
                        ) : (
                          ordered.map((channel) => (
                            <td key={channel.id}>
                              {type.channels.includes(channel.id) ? <span className="cl-dot" role="img" aria-label={`Through ${channel.name}`} /> : <span className="ds-visually-hidden">Not through {channel.name}</span>}
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
