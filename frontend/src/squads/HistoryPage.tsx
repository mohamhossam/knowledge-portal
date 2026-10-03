import { ApiError, errorMessage } from "../api/errors";
import { useActorNames } from "../catalogue/useCatalogue";
import { formatMoment } from "../home/format";
import { historyLine } from "./organisation";
import { useHistory, useOrgContext } from "./useOrganisation";

/** Who changed what in the squad catalogue, newest first: the last 200 changes. */
export function HistoryPage() {
  const { org } = useOrgContext();
  const history = useHistory();
  const actorName = useActorNames();
  return (
    <section className="govsection catalogue__first" aria-labelledby="history-title">
      <h2 id="history-title" className="govsection__title">History</h2>
      <p className="govsection__lead">Every save and removal, newest first; the last 200 are kept here.</p>
      {history.isPending ? (
        <p className="timetable__quiet">Reading the history…</p>
      ) : history.isError ? (
        <p className="docpage__failure" role="alert">
          {history.error instanceof ApiError && history.error.status === 403
            ? "The history is shown to maintainers of the catalogue."
            : errorMessage(history.error)}
        </p>
      ) : history.data.length ? (
        <table className="govtable">
          <caption className="visually-hidden">Changes to the squad catalogue, newest first</caption>
          <thead>
            <tr>
              <th scope="col" className="history__when">When</th>
              <th scope="col">What</th>
            </tr>
          </thead>
          <tbody>
            {history.data.map((event, index) => (
              <tr key={`${event.created_at}:${index}`} className="row">
                <th scope="row" className="nowrap history__when">{formatMoment(new Date(event.created_at))}</th>
                <td dir="auto">
                  {historyLine(event, org)}
                  <span className="secondary govtable__by">by {actorName(event.actor_id)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="timetable__quiet">Nothing has changed yet.</p>
      )}
    </section>
  );
}
