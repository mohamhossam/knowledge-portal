import "./historic.css";

import { Breadcrumbs, PageHeader, Status } from "../design/components";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { HISTORIC_PATH, useHistoricCounts } from "./historic";

const TITLE = "Historic requirements";

/**
 * The historic requirements' one head (UX rebuild, phase 3): the page's name and its counts
 * as short facts on the same line. A chosen record names itself in the tab title; its
 * heading is the record's own, beside the list.
 */
export function HistoricHeader({ record }: {
  /** The chosen record's name, for the tab title and the breadcrumb. */
  record?: string;
}) {
  const tally = useHistoricCounts().data;
  const meta = tally && (
    <>
      {tally.refresh_waiting > 0 && <Status tone="neutral">{count(tally.refresh_waiting, "refresh", "refreshes")} waiting</Status>}
      <span>{tally.published} published</span>
      <span>{tally.draft} in draft</span>
      {tally.withdrawn > 0 && <span>{tally.withdrawn} withdrawn</span>}
    </>
  );

  return (
    <PageHeader
      title={TITLE}
      documentTitle={record ? `${record} · ${TITLE}` : TITLE}
      breadcrumbs={record ? <Breadcrumbs link={RouterLink} items={[{ href: HISTORIC_PATH, label: TITLE }, { label: record }]} /> : undefined}
      lead="Old BRDs with the Epics, Features and User Stories they were delivered as in Azure DevOps. Once published, they are reference knowledge: prior art, never a decision. Nothing is written to Azure DevOps."
      meta={meta || undefined}
    />
  );
}
