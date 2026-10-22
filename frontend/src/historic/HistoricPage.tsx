import { Upload } from "lucide-react";
import { useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";

import type { HistoricStatus, HistoricSummary } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { useFindParam } from "../catalogue/frame/useFindParam";
import {
  Button, EmptyState, Facts, ListFilter, ListFind, ListTools, RecordList, type RecordGroup, RecordPlaceholder, Section, Skeleton,
  Status, Workbench,
} from "../design/components";
import { count } from "../home/format";
import { RouterLink } from "../shell/links";
import { HISTORIC_PATH, RANK_TONE, historicHref, searchOf, standing, useHistoric, useHistoricList } from "./historic";
import { HistoricHeader } from "./HistoricHeader";
import { HistoricRecord } from "./HistoricRecord";
import { ImportBrds } from "./ImportBrds";
import { ListBody } from "./ListBody";

const ALL = "all";
const STATUSES: { id: HistoricStatus; label: string }[] = [
  { id: "draft", label: "Drafts" },
  { id: "published", label: "Published" },
  { id: "withdrawn", label: "Withdrawn" },
];

const isStatus = (value: string | null): value is HistoricStatus => value === "draft" || value === "published" || value === "withdrawn";

/** "1 BRD · 3 work items". */
function detail(item: HistoricSummary): string {
  return [count(item.brds, "BRD"), item.work_items > 0 ? count(item.work_items, "work item") : null].filter(Boolean).join(" · ");
}

/**
 * Historic requirements on the workbench (UX rebuild, phase 3): old BRDs imported with their
 * Azure DevOps breakdown, grouped by where they stand, beside the record of the one chosen.
 * Drafts wait on a curator; published ones are reference knowledge, read as prior art. With none
 * chosen, the record side says what waits and offers the import.
 */
export function HistoricPage() {
  const { historicId } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const asked = params.get("status");
  const status = isStatus(asked) ? asked : null;
  const [find, setFind] = useFindParam("q");
  const query = (params.get("q") ?? "").trim();
  const pages = useHistoricList(status, query);
  // The import form stays open until the address changes (a row chosen, a filter set).
  const [importAt, setImportAt] = useState<string | null>(null);
  const importing = importAt === location.key;
  const setImporting = (open: boolean) => setImportAt(open ? location.key : null);
  // Closed, the form hands focus back to an Import BRDs button the reader can see.
  const closeImport = () => {
    setImporting(false);
    requestAnimationFrame(() => {
      const shown = [...document.querySelectorAll<HTMLElement>("[data-import]")].find((button) => button.getClientRects().length > 0);
      shown?.focus();
    });
  };
  const notice = (location.state as { notice?: string } | null)?.notice;
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = pages.data?.pages[0]?.counts;
  const total = counts ? counts.draft + counts.published + counts.withdrawn : undefined;
  const chosen = useHistoric(historicId ?? "", historicId !== undefined);
  const search = searchOf(params);

  const set = (value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === ALL) next.delete("status");
      else next.set("status", value);
      return next;
    }, { replace: true });

  const groups: RecordGroup[] = STATUSES.map(({ id, label }) => ({
    id,
    label,
    items: items.filter((item) => item.status === id).map((item) => {
      const { rank, status: words } = standing(item);
      return {
        id: item.id,
        href: historicHref(item.id, search),
        name: item.title,
        bidi: true,
        detail: detail(item),
        // The group already says published or withdrawn; a pill says only what waits on someone.
        meta: item.status === "withdrawn" || (item.status === "published" && !item.refresh_waiting)
          ? undefined
          : <Status tone={RANK_TONE[rank]}>{words}</Status>,
      };
    }),
  }));

  const record = importing ? (
    <ImportBrds onCancel={closeImport} />
  ) : historicId !== undefined ? (
    chosen.data ? (
      <HistoricRecord key={chosen.data.id} record={chosen.data} takeFocus={location.key !== "default"} />
    ) : chosen.isPending ? (
      <Skeleton label="Reading the historic requirement" rows={6} />
    ) : (
      <EmptyState
        title={chosen.error instanceof ApiError && chosen.error.status === 404
          ? "There is no historic requirement at this address."
          : "The knowledge service did not answer."}
        action={<RouterLink href={HISTORIC_PATH}>See every historic requirement</RouterLink>}
      >
        {chosen.error instanceof ApiError && chosen.error.status === 404 ? "It may have been discarded." : errorMessage(chosen.error)}
      </EmptyState>
    )
  ) : (
    <HistoricOverview total={total} counts={counts} notice={notice} onImport={() => setImporting(true)} />
  );

  const list = (
    <>
      <ListTools
        count={pages.isPending ? "Reading historic requirements…" : pages.hasNextPage ? `The first ${items.length} listed` : count(items.length, "historic requirement")}
      >
        <ListFind label="Find a historic requirement" value={find} onChange={setFind} placeholder="Title" />
        <ListFilter
          label="State"
          value={status ?? ALL}
          options={[
            { id: ALL, label: "Any state", count: total },
            ...STATUSES.map((item) => ({ id: item.id, label: item.label, count: counts?.[item.id] })),
          ]}
          onChange={set}
        />
        <Button variant="tertiary" icon={<Upload size={16} />} aria-expanded={importing} data-import onClick={() => (importing ? closeImport() : setImporting(true))}>
          Import BRDs
        </Button>
      </ListTools>
      <ListBody
        pages={pages}
        empty={
          query || status ? (
            <>No historic requirement matches. <Button variant="link" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Show all</Button></>
          ) : "None yet. Import the first BRDs."
        }
      >
        <RecordList label="Historic requirements, newest first" groups={groups} currentId={historicId} link={RouterLink} />
      </ListBody>
    </>
  );

  return (
    <>
      <HistoricHeader record={historicId !== undefined ? chosen.data?.title : undefined} />
      <Workbench listLabel="Historic requirements" chosen={historicId !== undefined || importing} list={list} record={record} />
    </>
  );
}

/** With none chosen: what waits on a curator, and the way to import more. */
function HistoricOverview({ total, counts, notice, onImport }: {
  total: number | undefined;
  counts: { draft: number; published: number; withdrawn: number; refresh_waiting: number } | undefined;
  notice?: string;
  onImport: () => void;
}) {
  const said = notice && <p className="hist-said" role="status"><Status tone="done">{notice}</Status></p>;
  if (counts === undefined) return <Skeleton label="Reading historic requirements" rows={3} />;
  if (total === 0) {
    return (
      <>
        {said}
        <EmptyState
          title="No historic requirements yet."
          action={<Button variant="primary" icon={<Upload size={16} />} data-import onClick={onImport}>Import BRDs</Button>}
        >
          Import old BRDs as Word or PDF files. Each becomes a draft: you link the Azure DevOps work items it was delivered as,
          then publish it as reference knowledge, read as prior art for new requirements.
        </EmptyState>
      </>
    );
  }
  return (
    <RecordPlaceholder title={`${count(total ?? 0, "historic requirement")}. Choose one to read its record.`}>
      {said}
      <ul className="hist-lines">
        {counts.draft > 0 && (
          <li>
            <RouterLink href={`${HISTORIC_PATH}?status=draft`}>Link and publish the drafts</RouterLink>
            <span className="hist-lines__status">Awaiting a curator</span>
            <span className="hist-lines__count">{counts.draft}</span>
          </li>
        )}
        {counts.refresh_waiting > 0 && (
          <li>
            <RouterLink href={`${HISTORIC_PATH}?status=published`}>Accept or discard the newer reads</RouterLink>
            <span className="hist-lines__status">Refresh waiting</span>
            <span className="hist-lines__count">{counts.refresh_waiting}</span>
          </li>
        )}
      </ul>
      <Section title="In counts">
        <Facts
          items={[
            ["Published, read as prior art", String(counts.published)],
            ["Drafts", String(counts.draft)],
            ["Withdrawn", String(counts.withdrawn)],
          ]}
        />
      </Section>
      <p>
        <Button icon={<Upload size={16} />} data-import onClick={onImport}>Import BRDs</Button>
      </p>
    </RecordPlaceholder>
  );
}
