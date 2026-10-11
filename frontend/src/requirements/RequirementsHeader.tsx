import "./requirements.css";

import type { ReactNode } from "react";

import { Breadcrumbs, PageHeader, Status, SubNav } from "../design/components";
import { count, formatMoment } from "../home/format";
import { RouterLink } from "../shell/links";
import { FINDINGS_PATH, HISTORIC_PATH, REQUIREMENTS_PATH, useCorpusSummary, useHistoricCounts } from "./knowledge";

export type KnowledgePageId = "requirements" | "findings" | "historic";

const TITLE: Record<KnowledgePageId, string> = {
  requirements: "Requirements",
  findings: "Findings",
  historic: "Historic requirements",
};

const LEAD: Record<KnowledgePageId, string> = {
  requirements:
    "Requirement work's corpus, requirement by requirement: whose each one is, how its index stands and when it was last screened. Their owners act on them in requirement work; from here you retire, reinstate or reindex them.",
  findings:
    "Possible duplicates and contradictions between requirements. Their owners decide them on each requirement's Knowledge step in requirement work; from here you ask them to.",
  historic:
    "Old BRDs with the Epics, Features and User Stories they were delivered as in Azure DevOps. Once published, requirement work reads them as prior art: reference, never a decision. Nothing is written to Azure DevOps.",
};

/**
 * The Requirements area's one head (UX rebuild, phase 3): the page's name, its counts as
 * short facts on the same line, and the area's pages as sub-navigation. A chosen record
 * names itself in the tab title; its heading is the record's own, beside the list.
 */
export function RequirementsHeader({ page, record, children }: {
  page: KnowledgePageId;
  /** The chosen record's name, for the tab title and the breadcrumb. */
  record?: string;
  /** Under the head: a notice the whole page needs. */
  children?: ReactNode;
}) {
  const summary = useCorpusSummary();
  const historic = useHistoricCounts();
  const corpus = summary.data;
  const tally = historic.data;
  const open = corpus ? corpus.open_findings.under_7_days + corpus.open_findings.from_7_to_30_days + corpus.open_findings.over_30_days : undefined;
  const historicTotal = tally ? tally.draft + tally.published + tally.withdrawn : undefined;
  const title = TITLE[page];

  const meta = page === "historic" ? (
    tally && (
      <>
        {tally.refresh_waiting > 0 && <Status tone="neutral">{count(tally.refresh_waiting, "refresh", "refreshes")} waiting</Status>}
        <span>{tally.published} published</span>
        <span>{tally.draft} in draft</span>
        {tally.withdrawn > 0 && <span>{tally.withdrawn} withdrawn</span>}
      </>
    )
  ) : !corpus ? (
    summary.isError ? <span>Requirement work did not answer with its counts</span> : undefined
  ) : page === "requirements" ? (
    <>
      {corpus.rebuild_required ? <Status tone="attention">Index must be rebuilt</Status> : corpus.failed > 0 && <Status tone="attention">{corpus.failed} stopped indexing</Status>}
      <span>{count(corpus.requirements, "requirement")}</span>
      <span>{corpus.current} current</span>
      {corpus.waiting > 0 && <span>{corpus.waiting} waiting</span>}
      {corpus.retired > 0 && <span>{corpus.retired} retired</span>}
    </>
  ) : (
    <>
      {corpus.open_findings.over_30_days > 0 && <Status tone="attention">{corpus.open_findings.over_30_days} overdue</Status>}
      <span>{count(open ?? 0, "open finding")}</span>
      {corpus.open_findings.from_7_to_30_days > 0 && <span>{corpus.open_findings.from_7_to_30_days} awaiting owners</span>}
    </>
  );

  const crumbs = (
    <Breadcrumbs
      link={RouterLink}
      items={[
        { href: REQUIREMENTS_PATH, label: "Requirements" },
        ...(page === "requirements" ? [] : [{ href: page === "findings" ? FINDINGS_PATH : HISTORIC_PATH, label: title }]),
        ...(record ? [{ label: record }] : []),
      ]}
    />
  );

  return (
    <PageHeader
      title={title}
      documentTitle={record ? `${record} · ${title}` : title}
      breadcrumbs={crumbs}
      lead={LEAD[page]}
      provenance={
        page !== "historic" && corpus?.as_of && !Number.isNaN(Date.parse(corpus.as_of))
          ? `Counted by requirement work at ${formatMoment(new Date(corpus.as_of))}.`
          : undefined
      }
      meta={meta || undefined}
    >
      <SubNav
        label="Requirement knowledge"
        link={RouterLink}
        items={[
          { href: REQUIREMENTS_PATH, label: "Requirements", current: page === "requirements", count: corpus?.requirements },
          { href: FINDINGS_PATH, label: "Findings", current: page === "findings", count: open },
          { href: HISTORIC_PATH, label: "Historic", current: page === "historic", count: historicTotal },
        ]}
      />
      {children}
    </PageHeader>
  );
}
