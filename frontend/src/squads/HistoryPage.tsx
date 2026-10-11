import type { OrganisationAuditEvent } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { useActorNames } from "../catalogue/useCatalogue";
import { type Column, DataTable, EmptyState, Section, Skeleton } from "../design/components";
import { formatMoment } from "../home/format";
import { historyLine } from "./organisation";
import { useHistory, useOrgContext } from "./useOrganisation";

type Row = OrganisationAuditEvent & { key: string };

/** Who changed what in the squad catalogue, newest first: the last 200 changes. */
export function HistoryPage() {
  const { org } = useOrgContext();
  const history = useHistory();
  const actorName = useActorNames();
  const columns: Column<Row>[] = [
    { id: "when", header: "When", numeric: true, width: "11rem", cell: (event) => formatMoment(new Date(event.created_at)) },
    { id: "what", header: "What", rowHeader: true, bidi: true, cell: (event) => historyLine(event, org) },
    { id: "who", header: "By", width: "12rem", cell: (event) => <bdi>{actorName(event.actor_id)}</bdi> },
  ];
  let body;
  if (history.isPending) body = <Skeleton label="Reading the history" rows={6} />;
  else if (history.isError) {
    body = (
      <EmptyState title="Couldn't read the history.">
        <p>
          {history.error instanceof ApiError && history.error.status === 403
            ? "The history is shown to maintainers of the catalogue."
            : errorMessage(history.error)}
        </p>
      </EmptyState>
    );
  } else {
    body = (
      <DataTable
        caption="Changes to the squad catalogue, newest first"
        captionHidden
        columns={columns}
        rows={history.data.map((event, index) => ({ ...event, key: `${event.created_at}:${index}` }))}
        rowId={(event) => event.key}
        emptyText="Nothing has changed yet."
      />
    );
  }
  return (
    <div className="own-stack">
      <Section title="History">
        <p className="own-quiet">Every save and removal, newest first; the last 200 are kept here.</p>
        {body}
      </Section>
    </div>
  );
}
