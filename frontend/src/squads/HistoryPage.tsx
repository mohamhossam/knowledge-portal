import type { Organisation, OrganisationAuditEvent } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { useActorNames } from "../catalogue/useCatalogue";
import { type Column, DataTable, EmptyState, Section, Skeleton } from "../design/components";
import { formatMoment } from "../home/format";
import { RouterLink } from "../shell/links";
import { densityFor, usePreferences } from "../shell/preferences";
import { href } from "./bench";
import { historyLine } from "./organisation";
import { useHistory, useOrgContext } from "./useOrganisation";

type Row = OrganisationAuditEvent & { key: string };

/** Where a change's record lives now, when it still does: a person, a product or a squad. */
function recordOf(event: OrganisationAuditEvent, org: Organisation): string | null {
  const at = { save_person: ["people", href.person], save_product: ["products", href.product], save_squad: ["squads", href.squad] } as const;
  const where = at[event.action as keyof typeof at];
  if (!where) return null;
  const [list, link] = where;
  return org[list].some((item) => item.id === event.subject_id) ? link(event.subject_id) : null;
}

/** Who changed what in the squad catalogue, newest first: a compact log of the last 200 changes. */
export function HistoryPage() {
  const { org } = useOrgContext();
  const history = useHistory();
  const { density } = usePreferences();
  const actorName = useActorNames();
  const columns: Column<Row>[] = [
    { id: "when", header: "When", numeric: true, width: "11rem", cell: (event) => formatMoment(new Date(event.created_at)) },
    {
      id: "what",
      header: "What",
      rowHeader: true,
      bidi: true,
      cell: (event) => {
        const link = recordOf(event, org);
        return link ? <RouterLink href={link}>{historyLine(event, org)}</RouterLink> : historyLine(event, org);
      },
    },
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
    // A log reads like a desk: compact unless the reader chose otherwise.
    <div className="own-stack own-log" data-density={densityFor(density, "desk")}>
      <Section title="History" count={history.data?.length}>
        <p className="own-quiet">Every save and removal, newest first. The last 200 are kept here.</p>
        {body}
      </Section>
    </div>
  );
}
