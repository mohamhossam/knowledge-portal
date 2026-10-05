import type { ReactNode } from "react";

import type { Journey } from "../api/client";
import { nextSteps, orderedSteps, phaseRuns } from "./catalogue";

/**
 * A journey's Steps and Hand-overs, read the same on a journey sheet and in the
 * explorer. Where a system name leads is the caller's: a sheet links it, a
 * reader without the catalogue reads it as text.
 */
export function JourneySteps({ journey, headingId, system, channelName, entry }: {
  journey: Journey;
  headingId: string;
  system: (systemId: string) => ReactNode;
  /** A channel's name, to say which channels a step happens in. */
  channelName?: (channelId: string) => string;
  /**
   * Who "the channel's entry system" is, when one channel is being read; on a
   * journey sheet, which reads every channel, it stays the channel's.
   */
  entry?: { channel: string; systemId: string | null };
}) {
  const steps = orderedSteps(journey);
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">Steps</h3>
      {steps.length ? (
        <table className="govtable steps">
          <caption className="visually-hidden">Steps of {journey.name}, in order</caption>
          <thead>
            <tr>
              <th scope="col" className="cell--end steps__no">No.</th>
              <th scope="col">Step</th>
              <th scope="col">Performed by</th>
            </tr>
          </thead>
          {phaseRuns(steps).map((run, index, runs) => (
            <tbody key={`${run.phase ?? "none"}:${index}`}>
              {run.phase && (
                <tr className="steps__phase">
                  <th scope="colgroup" colSpan={3} dir="auto">
                    {runs.slice(0, index).some((earlier) => earlier.phase === run.phase)
                      ? `Back to ${run.phase.charAt(0).toLocaleLowerCase()}${run.phase.slice(1)}`
                      : run.phase}
                  </th>
                </tr>
              )}
              {run.steps.map((step) => {
                const next = nextSteps(journey, step.number);
                return (
                  <tr key={step.number} className="row">
                    <th scope="row" className="cell--end steps__no">{step.number}</th>
                    <td dir="auto">
                      <span className="steps__name">{step.name}</span>
                      {step.customer_visible && <span className="secondary govtable__by">Seen by the customer</span>}
                      {(step.channels ?? []).length > 0 && channelName && (
                        <span className="secondary govtable__by" dir="auto">
                          Only in {(step.channels ?? []).map(channelName).join(", ")}
                        </span>
                      )}
                      {step.description && <span className="secondary govtable__by" dir="auto">{step.description}</span>}
                      {next && <span className="secondary govtable__by">{next}</span>}
                    </td>
                    <td>
                      {step.performing_system_id ? (
                        system(step.performing_system_id)
                      ) : step.channel_entry ? (
                        entry?.systemId ? (
                          <>
                            {system(entry.systemId)}
                            <span className="secondary govtable__by" dir="auto">The entry system of {entry.channel}</span>
                          </>
                        ) : entry ? (
                          <span className="secondary" dir="auto">The entry system of {entry.channel}, not named</span>
                        ) : (
                          "The channel’s entry system"
                        )
                      ) : (
                        <span className="secondary">No system named</span>
                      )}
                      {step.supporting_system_ids.length > 0 && (
                        <span className="secondary govtable__by">
                          with{" "}
                          {step.supporting_system_ids.map((systemId, position) => (
                            <span key={systemId}>
                              {position > 0 && ", "}
                              {system(systemId)}
                            </span>
                          ))}
                        </span>
                      )}
                      {step.mode && <span className="secondary govtable__by" dir="auto">{step.mode}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      ) : (
        <p className="timetable__quiet">No step is recorded.</p>
      )}
    </section>
  );
}

export function JourneyHandovers({ journey, headingId }: { journey: Journey; headingId: string }) {
  if (!journey.integrations.length) return null;
  const names = new Map(journey.activities.map((step) => [step.number, step.name]));
  return (
    <section className="govsection" aria-labelledby={headingId}>
      <h3 id={headingId} className="govsection__title">Hand-overs</h3>
      <table className="govtable">
        <caption className="visually-hidden">How steps of {journey.name} hand over to each other</caption>
        <thead>
          <tr>
            <th scope="col">Between steps</th>
            <th scope="col">How</th>
          </tr>
        </thead>
        <tbody>
          {journey.integrations.map((link) => (
            <tr key={`${link.from_activity}>${link.to_activity}:${link.interface ?? ""}`} className="row">
              <th scope="row">
                {link.from_activity} to {link.to_activity}
                <span className="secondary govtable__by" dir="auto">
                  {names.get(link.from_activity)} to {names.get(link.to_activity)}
                </span>
              </th>
              <td dir="auto">
                {link.interaction ?? link.interface ?? "Not described"}
                {[link.interaction ? link.interface : null, link.payload, link.timing].filter(Boolean).length > 0 && (
                  <span className="secondary govtable__by" dir="auto">
                    {[link.interaction ? link.interface : null, link.payload, link.timing].filter(Boolean).join(" · ")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
