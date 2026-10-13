import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RotateCw, Upload } from "lucide-react";
import { Fragment, type FormEvent, type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  api,
  type HistoricBrd,
  type HistoricCitation,
  type HistoricDetail,
  type HistoricRun,
  type HistoricSharedRoot,
} from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import {
  ActionGroup, Button, type Column, ConsequencePanel, DataTable, RecordView, Skeleton, Status, type StatusTone,
  TextField,
} from "../design/components";
import { count, formatDay, formatMoment } from "../home/format";
import { knowledgeStepHref } from "../requirements/knowledge";
import { RequirementLink } from "../requirements/RequirementLink";
import { AdoLink, BreakdownTable, ChangeTable, ItemErrors, SharedRootNote } from "./Breakdown";
import {
  HISTORIC_LIST_KEY,
  HISTORIC_PATH,
  RANK_TONE,
  historicKey,
  itemsOf,
  nextStep,
  parseIds,
  runFailure,
  standing,
  useCitedBy,
  useHistoricChange,
  useSharedRoots,
} from "./historic";

/** A draft's passages are read to find its work items; a published record's are reference. */
const PASSAGES_SHOWN = { draft: 12, settled: 3 };

/** The extractor's note on where Word passages sit; nothing a curator acts on here. */
const QUIET_WARNINGS = new Set(["word_prose_structure"]);

function Edition({ record }: { record: HistoricDetail }) {
  const latest = record.publications.at(-1);
  if (record.status === "withdrawn" && record.withdrawal) {
    return (
      <>
        Withdrawn by <bdi>{record.withdrawal.withdrawn_by.display_name}</bdi> on {formatDay(record.withdrawal.withdrawn_at)}:{" "}
        <bdi>{record.withdrawal.reason}</bdi>
      </>
    );
  }
  if (record.status === "published" && latest) {
    return (
      <>
        Published by <bdi>{latest.published_by.display_name}</bdi> on {formatDay(latest.published_at)}
        {latest.number > 1 ? `, after ${count(latest.number - 1, "refresh", "refreshes")}` : ""}. Requirement work reads it
        as prior art.
      </>
    );
  }
  return <>Draft, imported by <bdi>{record.created_by.display_name}</bdi> on {formatDay(record.created_at)}. Nothing reads it until it is published.</>;
}

/** The one decision it waits on: a link that takes the reader to its section. */
function NextStep({ record }: { record: HistoricDetail }) {
  const step = nextStep(record);
  if (!step) return null;
  const go = (event: MouseEvent<HTMLAnchorElement>) => {
    const heading = document.getElementById(step.target);
    if (!heading) return;
    event.preventDefault();
    heading.focus();
    heading.scrollIntoView?.({ block: "start" });
  };
  return (
    <p className="rk-next">
      <a href={`#${step.target}`} onClick={go}>
        {step.label}
        <ArrowRight size={16} aria-hidden="true" />
      </a>
    </p>
  );
}

/** A section whose heading the next step, or "See what publishing waits on", can take focus to. */
function Part({ id, title, count: total, children }: { id: string; title: ReactNode; count?: number; children: ReactNode }) {
  return (
    <section className="ds-section rk-part" aria-labelledby={id}>
      <div className="ds-section__head">
        <h3 id={id} tabIndex={-1} className="ds-section__title">
          {title}
          {total !== undefined && <>{" "}<span className="ds-section__count">{total.toLocaleString("en")}</span></>}
        </h3>
      </div>
      {children}
    </section>
  );
}

/**
 * One historic Requirement on the workbench: decisions lead and reference follows. What is
 * being read, a refresh waiting, its work items, its lineage and publishing come before the
 * BRD passages they were read from.
 */
export function HistoricRecord({ record, takeFocus }: { record: HistoricDetail; takeFocus: boolean }) {
  const shared = useSharedRoots(record);
  const [renaming, setRenaming] = useState(false);
  const { status, rank } = standing(record);
  return (
    <RecordView
      title={record.title}
      takeFocus={takeFocus}
      meta={
        <>
          <Status tone={RANK_TONE[rank]}>{status}</Status>
          <span>{count(record.brd_files.length, "BRD")}</span>
          {record.work_items > 0 && <span>{count(record.work_items, "work item")}</span>}
        </>
      }
      actions={
        record.status === "draft" && !renaming ? (
          <Button variant="tertiary" data-rename onClick={() => setRenaming(true)}>Rename…</Button>
        ) : undefined
      }
      lead={<Edition record={record} />}
    >
      {renaming && <Rename record={record} onDone={() => setRenaming(false)} />}
      <NextStep record={record} />
      <Processing record={record} />
      {record.pending_refresh && <PendingRefresh record={record} />}
      <WorkItems record={record} shared={shared} />
      {record.breakdown && (
        <Part id="historic-lineage" title="What it was delivered as">
          <BreakdownTable
            breakdown={record.breakdown}
            brds={record.brd_files.map((brd) => brd.filename)}
            shared={shared}
            past={record.status === "withdrawn"}
            note={record.pending_refresh ? "This is the published read; the newer one waits above." : undefined}
          />
        </Part>
      )}
      {/* The record's diagram (BRD → Epics → Features → Stories) goes here once the diagram thread draws it. */}
      {record.status === "draft" && <Publish record={record} />}
      {record.publications.length > 0 && <CitedBy record={record} />}
      <Brds record={record} />
      {record.status === "published" && <Withdraw record={record} />}
    </RecordView>
  );
}

/** Where a citation stands, in words: a short status, and why on a second line. */
function citationState(item: HistoricCitation, withdrawn: boolean): { tone: StatusTone; words: string; detail?: string } {
  if (withdrawn) return { tone: "stopped", words: "Cited before it was withdrawn", detail: "It no longer shows it." };
  if (item.duplicate) return { tone: "stopped", words: "Closed as a duplicate" };
  if (item.retired) return { tone: "stopped", words: "Retired from the corpus" };
  return item.current
    ? { tone: "done", words: "Current check" }
    : { tone: "neutral", words: "Older check", detail: "Checked again when its Knowledge step opens." };
}

/**
 * The Requirements whose prior art cites it, from requirement work. Who and when only: what was
 * matched stays with the Requirement's owner (ADR-0102 Amendment 1).
 */
function CitedBy({ record }: { record: HistoricDetail }) {
  const pages = useCitedBy(record);
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const total = pages.data?.pages[0]?.total;
  const rows = useRef<HTMLDivElement>(null);
  // Show more hands focus to the first row it added, so the reader goes on from there.
  const focusAt = useRef<number | null>(null);
  useEffect(() => {
    const at = focusAt.current;
    if (at === null || items.length <= at) return;
    focusAt.current = null;
    rows.current?.querySelectorAll<HTMLAnchorElement>("tbody th a")[at]?.focus();
  }, [items.length]);
  const showMore = () => {
    focusAt.current = items.length;
    void pages.fetchNextPage();
  };
  const withdrawn = record.status === "withdrawn";
  const columns: Column<HistoricCitation>[] = [
    {
      id: "requirement",
      header: "Requirement",
      rowHeader: true,
      cell: (item) => (
        <>
          <RequirementLink href={knowledgeStepHref(item.requirement_id)}>{item.title}</RequirementLink>
          <span className="rk-detail">{item.owner ? <>Owned by <bdi>{item.owner}</bdi></> : "No owner"}</span>
        </>
      ),
    },
    {
      id: "check",
      header: "Prior-art check",
      cell: (item) => {
        const state = citationState(item, withdrawn);
        return (
          <>
            <Status tone={state.tone}>{state.words}</Status>
            {state.detail && <span className="rk-detail">{state.detail}</span>}
          </>
        );
      },
    },
    { id: "checked", header: "Checked on", cell: (item) => formatDay(item.checked_at) },
  ];
  return (
    <Part id="historic-cited" title={<>Cited by{total !== undefined && <span className="ds-section__count"> · {total === 0 ? "none" : count(total, "requirement")}</span>}</>}>
      <p className="rk-lead">
        Requirements whose prior-art check names it as a similar past requirement. Who and when only; what was matched stays
        with each Requirement.
      </p>
      {pages.isError ? (
        <div className="rk-failure" role="alert">
          <Status tone="attention">Who cites it could not be read: {errorMessage(pages.error)}</Status>{" "}
          <Button variant="tertiary" icon={<RotateCw size={14} />} onClick={() => void pages.refetch()}>Try again</Button>
        </div>
      ) : pages.isPending ? (
        <Skeleton label="Asking requirement work" rows={2} />
      ) : items.length === 0 ? (
        <p className="rk-quiet">
          {withdrawn
            ? "No requirement cites it. Withdrawn, it is no longer offered as prior art."
            : "No requirement cites it yet. A Requirement is checked when it changes or its Knowledge step opens."}
        </p>
      ) : (
        <div ref={rows}>
          <DataTable caption={`Requirements citing ${record.title}`} captionHidden columns={columns} rows={items} rowId={(item) => item.requirement_id} />
        </div>
      )}
      {pages.hasNextPage && (
        <ActionGroup>
          <Button variant="tertiary" busy={pages.isFetchingNextPage} onClick={showMore}>
            {pages.isFetchingNextPage ? "Asking…" : "Show more"}
          </Button>
        </ActionGroup>
      )}
    </Part>
  );
}

/** What withdrawing does to the Requirements citing it, said even when their number is unknown. */
function withdrawCitations(total: number | undefined, unknown: boolean): string {
  if (total === 0) return "";
  if (total === undefined) {
    return unknown
      ? "; requirement work could not say which Requirements cite it, and any that do stop showing it at once"
      : "; any Requirements citing it stop showing it at once";
  }
  return `: ${total === 1 ? "the 1 requirement" : `the ${total} requirements`} citing it ${total === 1 ? "stops" : "stop"} showing it at once`;
}

/** What is being read for it now, and how far along; or why reading stopped. */
function Processing({ record }: { record: HistoricDetail }) {
  const run = record.run;
  const reading = record.brd_files.filter((brd) => brd.stage === "queued").length;
  if (reading > 0) {
    return <p className="rk-state" role="status"><Status tone="working">Reading {reading === 1 ? "its BRD" : `${reading} BRDs`}</Status></p>;
  }
  if (!run || run.status === "succeeded") return null;
  if (run.status === "failed") {
    return (
      <p className="rk-state" role="alert">
        <Status tone="attention">The breakdown could not be read</Status> {runFailure(run.failure)}
      </p>
    );
  }
  return (
    <p className="rk-state" role="status">
      <Status tone="working">{run.kind === "refresh" ? "Reading it again from Azure DevOps" : "Reading the breakdown"}</Status>{" "}
      {run.total > 0 ? `${run.done} of ${count(run.total, "work item")}` : "Starting"}
    </p>
  );
}

function Failure({ error, onReload }: { error: unknown; onReload?: () => void }) {
  const stale = error instanceof ApiError && error.status === 409 && /changed while you worked/i.test(errorMessage(error));
  return (
    <div className="rk-failure" role="alert" tabIndex={-1}>
      <Status tone="attention">{errorMessage(error)}</Status>
      {stale && onReload && <Button variant="tertiary" icon={<RotateCw size={14} />} onClick={onReload}>Reload it</Button>}
    </div>
  );
}

function useReload(id: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: historicKey(id) });
}

/** Back to the record's "Rename…" once the form closes. */
const focusRename = () => window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-rename]")?.focus());

function Rename({ record, onDone }: { record: HistoricDetail; onDone: () => void }) {
  const [title, setTitle] = useState(record.title);
  const field = useRef<HTMLDivElement>(null);
  const rename = useHistoricChange(record.id, (value: string) => api.renameHistoric(record.id, value, record.version));
  useEffect(() => field.current?.querySelector("input")?.focus(), []);
  const close = () => {
    onDone();
    focusRename();
  };
  return (
    <form
      className="rk-inline"
      aria-label="Rename it"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) rename.mutate(title.trim(), { onSuccess: close });
      }}
      onKeyDown={(event) => { if (event.key === "Escape" && !rename.isPending) close(); }}
    >
      <div ref={field}>
        <TextField label="Title" maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <ActionGroup>
        <Button type="submit" variant="primary" busy={rename.isPending} unavailableReason={title.trim() ? null : "Give it a title."}>Save the title</Button>
        <Button onClick={close}>Cancel</Button>
      </ActionGroup>
      {rename.isError && <Failure error={rename.error} />}
    </form>
  );
}

const STAGE: Record<HistoricBrd["stage"], { tone: StatusTone; words: string }> = {
  queued: { tone: "working", words: "Being read" },
  read: { tone: "done", words: "Read" },
  failed: { tone: "attention", words: "Could not be read" },
};

function Brds({ record }: { record: HistoricDetail }) {
  return (
    <Part id="historic-brds" title="BRDs" count={record.brd_files.length}>
      {record.brd_files.map((brd) => <Brd key={brd.id} record={record} brd={brd} />)}
      {record.status === "draft" && <AddBrd record={record} />}
    </Part>
  );
}

type Passage = HistoricBrd["passages"][number];

function Brd({ record, brd }: { record: HistoricDetail; brd: HistoricBrd }) {
  const [all, setAll] = useState(false);
  const again = useHistoricChange(record.id, () => api.readHistoricBrdAgain(record.id, brd.id, record.version));
  const first = record.status === "draft" ? PASSAGES_SHOWN.draft : PASSAGES_SHOWN.settled;
  const shown = all ? brd.passages : brd.passages.slice(0, first);
  const warnings = brd.warnings.filter((warning) => !QUIET_WARNINGS.has(warning.code));
  const columns: Column<Passage>[] = [
    { id: "where", header: "Where", rowHeader: true, cell: (passage) => passage.label },
    { id: "text", header: "Passage", bidi: true, cell: (passage) => <span className="rk-passage">{passage.text}</span> },
  ];
  return (
    <div className="rk-brd">
      <p className="rk-brd__head">
        <bdi className="rk-brd__name">{brd.filename}</bdi>
        <Status tone={STAGE[brd.stage].tone}>{STAGE[brd.stage].words}</Status>
        <span className="rk-quiet">
          {brd.stage === "read" ? `${count(brd.passages.length, "passage")} · ` : ""}uploaded by <bdi>{brd.uploaded_by.display_name}</bdi> on {formatDay(brd.uploaded_at)}
        </span>
      </p>
      {brd.error && (
        <div className="rk-failure">
          <Status tone="attention">{brd.error}</Status>
          {record.status === "draft" && (
            <Button variant="tertiary" icon={<RotateCw size={14} />} busy={again.isPending} onClick={() => again.mutate(undefined)}>Read it again</Button>
          )}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="rk-warnings">
          {warnings.map((warning, index) => (
            <li key={index}>{warning.severity === "blocking" ? <Status tone="attention">{warning.message}</Status> : <span className="rk-quiet">{warning.message}</span>}</li>
          ))}
        </ul>
      )}
      {shown.length > 0 && (
        <DataTable caption={`Passages of ${brd.filename}`} captionHidden columns={columns} rows={shown} rowId={(passage) => passage.block_id} />
      )}
      {brd.passages.length > first && (
        <ActionGroup>
          <Button variant="tertiary" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? `Show the first ${first}` : `Show all ${brd.passages.length} passages`}
          </Button>
        </ActionGroup>
      )}
      {again.isError && <Failure error={again.error} />}
    </div>
  );
}

function AddBrd({ record }: { record: HistoricDetail }) {
  const id = useId();
  const add = useHistoricChange(record.id, (file: File) => api.addHistoricBrd(record.id, file, record.version));
  return (
    <div className="rk-add-brd">
      <label className="ds-button ds-button--tertiary rk-file" htmlFor={id}>
        <Upload size={16} aria-hidden="true" />
        <span>{add.isPending ? "Adding…" : "Add another BRD"}</span>
        <input
          id={id}
          type="file"
          className="ds-visually-hidden"
          accept=".docx,.pdf"
          disabled={add.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) add.mutate(file);
          }}
        />
      </label>
      {add.isError && <Failure error={add.error} />}
    </div>
  );
}

function WorkItems({ record, shared }: { record: HistoricDetail; shared: Map<number, HistoricSharedRoot[]> }) {
  const id = "historic-work-items";
  const reload = useReload(record.id);
  const linked = record.root_ids.join(", ");
  const [text, setText] = useState(linked);
  const [shown, setShown] = useState(linked);
  // Newly linked roots replace what the field holds, once.
  if (shown !== linked) {
    setShown(linked);
    setText(linked);
  }
  const [tried, setTried] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const focusField = () => field.current?.querySelector("input")?.focus();
  const link = useHistoricChange(record.id, (ids: number[]) => api.linkWorkItems(record.id, ids, record.version));
  const refresh = useHistoricChange(record.id, () => api.refreshHistoric(record.id, record.version));
  const { ids, invalid } = parseIds(text);
  const problem = invalid.length > 0
    ? `Work item ids are whole numbers; ${invalid.slice(0, 3).map((token) => `“${token}”`).join(", ")} ${invalid.length === 1 ? "is" : "are"} not.`
    : ids.length === 0 ? "Name at least one work item." : ids.length > 50 ? "Link at most 50 work items." : null;
  const reading = record.run?.status === "queued" || record.run?.status === "running";
  const draft = record.status === "draft";
  const urls = new Map([...itemsOf(record.breakdown)].map(([itemId, item]) => [itemId, item.url]));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (problem) focusField();
    else if (!reading && !link.isPending) link.mutate(ids);
  };
  return (
    <Part id={id} title="Work items in Azure DevOps">
      <p className="rk-lead">
        The top-level work items, usually Epics, that this BRD was delivered as. The Features and User Stories beneath them
        are read from Azure DevOps, read-only.
      </p>
      {draft && record.suggestions.length > 0 && (
        <Suggestions record={record} shared={shared} onUse={(value) => { setText(value); setTried(false); focusField(); }} />
      )}
      {draft ? (
        <form className="rk-inline" onSubmit={submit} aria-labelledby={id}>
          <div ref={field}>
            <TextField
              label="Top-level work item ids"
              hint="Separate several with commas or spaces, e.g. 48213, 48300."
              error={tried ? problem : null}
              inputMode="numeric"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <ActionGroup>
            <Button type="submit" variant="primary" busy={reading || link.isPending}>
              {reading ? "Reading the breakdown…" : record.breakdown ? "Read the breakdown again" : "Read the breakdown"}
            </Button>
          </ActionGroup>
          {link.isError && <Failure error={link.error} onReload={reload} />}
        </form>
      ) : (
        <>
          <p>
            Delivered as{" "}
            {record.root_ids.map((rootId, index) => (
              <Fragment key={rootId}>
                {index > 0 && (index === record.root_ids.length - 1 ? " and " : ", ")}
                <AdoLink id={rootId} url={urls.get(rootId)} />
              </Fragment>
            ))}
            {record.breakdown && <span className="rk-quiet"> · read {formatMoment(new Date(record.breakdown.fetched_at))}</span>}
          </p>
          {record.status === "published" && !record.pending_refresh && (
            <ActionGroup>
              <Button variant="secondary" icon={<RotateCw size={14} />} busy={reading || refresh.isPending} onClick={() => refresh.mutate(undefined)}>
                {reading ? "Reading it again…" : "Refresh from Azure DevOps"}
              </Button>
            </ActionGroup>
          )}
          {refresh.isError && <Failure error={refresh.error} onReload={reload} />}
        </>
      )}
      {record.run && record.run.item_errors.length > 0 && record.run.status === "succeeded" && <RunReport run={record.run} />}
    </Part>
  );
}

/** Ids the BRD mentions, each with the words it was found in, for the curator to check. */
function Suggestions({ record, shared, onUse }: {
  record: HistoricDetail;
  shared: Map<number, HistoricSharedRoot[]>;
  onUse: (value: string) => void;
}) {
  const all = record.suggestions.map((item) => item.work_item_id).join(", ");
  return (
    <div className="rk-found">
      <p className="rk-found__title">Found in the BRD</p>
      <ul className="rk-found__list">
        {record.suggestions.map((item) => (
          <li key={item.work_item_id}>
            <span className="rk-found__id">#{item.work_item_id}</span>{" "}
            <span className="rk-quiet">{item.label}</span>
            <span className="rk-quote" dir="auto">“{item.quote}”</span>
            <SharedRootNote holders={shared.get(item.work_item_id)} />
          </li>
        ))}
      </ul>
      <p className="rk-quiet">Suggested from the text only. Check each is the work item this BRD was delivered as.</p>
      <ActionGroup>
        <Button variant="tertiary" onClick={() => onUse(all)}>{record.suggestions.length === 1 ? "Use it" : "Use these"}</Button>
      </ActionGroup>
    </div>
  );
}

function RunReport({ run }: { run: HistoricRun }) {
  return (
    <div className="rk-report">
      <p className="rk-report__title">
        {count(run.item_errors.length, "work item")} could not be read
        <span className="rk-quiet"> · in the read of {formatMoment(new Date(run.finished_at ?? run.started_at))}</span>
      </p>
      <ItemErrors errors={run.item_errors} />
    </div>
  );
}

function PendingRefresh({ record }: { record: HistoricDetail }) {
  const pending = record.pending_refresh!;
  const reload = useReload(record.id);
  const accept = useHistoricChange(record.id, () => api.acceptHistoricRefresh(record.id, record.version));
  const discard = useHistoricChange(record.id, () => api.discardHistoricRefresh(record.id, record.version));
  const busy = accept.isPending || discard.isPending;
  return (
    <Part id="historic-refresh" title="A newer read is waiting">
      <p className="rk-lead">
        Read from Azure DevOps {formatMoment(new Date(pending.breakdown.fetched_at))}.{" "}
        {pending.changes.length === 0
          ? "Nothing changed since it was published."
          : `${count(pending.changes.length, "work item")} changed. Accepting publishes it again, and requirement work reads the new breakdown.`}
      </p>
      {pending.changes.length > 0 && <ChangeTable changes={pending.changes} before={record.breakdown} after={pending.breakdown} />}
      <ActionGroup>
        <Button variant="primary" busy={accept.isPending} unavailableReason={discard.isPending ? "Discarding it…" : null} onClick={() => accept.mutate(undefined)}>
          {accept.isPending ? "Publishing…" : "Accept the refresh and publish"}
        </Button>
        <Button variant="tertiary" busy={busy} onClick={() => discard.mutate(undefined)}>Discard it</Button>
      </ActionGroup>
      {[accept, discard].map((mutation, index) => mutation.isError && <Failure key={index} error={mutation.error} onReload={reload} />)}
    </Part>
  );
}

function Publish({ record }: { record: HistoricDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reload = useReload(record.id);
  const publish = useHistoricChange(record.id, () => api.publishHistoric(record.id, record.version));
  const [discarding, setDiscarding] = useState(false);
  const discard = useMutation({
    mutationFn: () => api.discardHistoric(record.id, record.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HISTORIC_LIST_KEY });
      navigate(HISTORIC_PATH, { state: { notice: `‘${record.title}’ was discarded.` } });
    },
  });
  const waits = record.blockers.length > 0;
  return (
    <Part id="historic-publish" title="Publish as reference knowledge">
      <p className="rk-lead">
        Requirement work then reads its BRD passages and breakdown as prior art for new requirements: labelled historic, never
        confirmed intent, and never blocking a decision. Azure DevOps is not changed.
      </p>
      <ActionGroup>
        <Button variant="primary" busy={publish.isPending} unavailableReason={waits ? record.blockers.join(" ") : null} onClick={() => publish.mutate(undefined)}>
          {publish.isPending ? "Publishing…" : "Publish it"}
        </Button>
        {!discarding && (
          <Button variant="tertiary" data-discard onClick={() => setDiscarding(true)}>Discard this draft…</Button>
        )}
      </ActionGroup>
      {discarding && (
        <ConsequencePanel
          tone="danger"
          title={<>Discard <bdi>‘{record.title}’</bdi>?</>}
          happens="Its BRDs and breakdown are removed. Nothing was ever published from it."
          reversibility="This cannot be undone. Import its BRDs again to start over."
          confirmLabel="Discard it"
          busyLabel="Discarding…"
          keepLabel="Keep the draft"
          busy={discard.isPending}
          failure={discard.isError ? errorMessage(discard.error) : null}
          onConfirm={() => discard.mutate()}
          onKeep={() => {
            setDiscarding(false);
            window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-discard]")?.focus());
          }}
        />
      )}
      {publish.isError && <Failure error={publish.error} onReload={reload} />}
    </Part>
  );
}

function Withdraw({ record }: { record: HistoricDetail }) {
  const [open, setOpen] = useState(false);
  const cited = useCitedBy(record);
  const withdraw = useHistoricChange(record.id, (why: string) => api.withdrawHistoric(record.id, why, record.version));
  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-withdraw]")?.focus());
  };
  return (
    <div className="rk-withdraw">
      {!open ? (
        <ActionGroup>
          <Button variant="tertiary" data-withdraw onClick={() => { withdraw.reset(); setOpen(true); }}>Withdraw from requirement work…</Button>
        </ActionGroup>
      ) : (
        <ConsequencePanel
          tone="danger"
          title={<>Withdraw <bdi>‘{record.title}’</bdi> from requirement work?</>}
          happens={`Requirement work stops reading it as prior art${withdrawCitations(cited.data?.pages[0]?.total, cited.isError)}. It stays here, withdrawn, with your reason.`}
          reversibility="Withdrawing cannot be undone, and its BRDs cannot be imported again."
          reason={{ label: "Why", hint: "Kept with it here, for anyone who reads it later.", maxLength: 2000 }}
          confirmLabel="Withdraw it"
          busyLabel="Withdrawing…"
          keepLabel="Keep it published"
          busy={withdraw.isPending}
          failure={withdraw.isError ? errorMessage(withdraw.error) : null}
          onConfirm={(why) => withdraw.mutate(why, { onSuccess: () => setOpen(false) })}
          onKeep={close}
        />
      )}
    </div>
  );
}
