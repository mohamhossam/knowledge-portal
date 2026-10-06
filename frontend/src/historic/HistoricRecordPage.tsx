import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RotateCw, Upload } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, type HistoricBrd, type HistoricDetail, type HistoricRun } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { count, formatDay, formatMoment } from "../home/format";
import { KnowledgePage } from "../requirements/knowledgeHead";
import { BreakdownTable, ChangeTable, ItemErrors } from "./Breakdown";
import {
  HISTORIC_LIST_KEY,
  HISTORIC_PATH,
  historicKey,
  parseIds,
  runFailure,
  useHistoric,
  useHistoricChange,
} from "./historic";

const PASSAGES_SHOWN = 12;

/** One historic Requirement: its BRDs, the work items they were delivered as, and its lineage. */
export function HistoricRecordPage() {
  const { historicId = "" } = useParams();
  const record = useHistoric(historicId);
  const data = record.data;
  useEffect(() => {
    document.title = `${data?.title ?? "Historic requirement"} · Requirement knowledge · Knowledge portal`;
  }, [data?.title]);
  return (
    <KnowledgePage page="Historic">
      <p className="sheet__trail historic__trail">
        <Link to={HISTORIC_PATH} className="text-button">
          <ArrowLeft size={14} aria-hidden="true" />
          All historic requirements
        </Link>
      </p>
      {record.isPending ? (
        <p className="timetable__quiet">Reading it…</p>
      ) : !data ? (
        <p className="docpage__failure" role="alert">
          {record.error instanceof ApiError && record.error.status === 404
            ? "There is no historic requirement at this address. It may have been discarded."
            : `The knowledge service did not answer: ${errorMessage(record.error)}`}
        </p>
      ) : (
        <Record record={data} />
      )}
    </KnowledgePage>
  );
}

function Edition({ record }: { record: HistoricDetail }) {
  const latest = record.publications.at(-1);
  if (record.status === "withdrawn" && record.withdrawal) {
    return (
      <>
        Withdrawn by {record.withdrawal.withdrawn_by.display_name} on {formatDay(record.withdrawal.withdrawn_at)}:{" "}
        <span dir="auto">{record.withdrawal.reason}</span>
      </>
    );
  }
  if (record.status === "published" && latest) {
    return (
      <>
        Published by {latest.published_by.display_name} on {formatDay(latest.published_at)}
        {latest.number > 1 ? `, after ${count(latest.number - 1, "refresh", "refreshes")}` : ""}. Requirement work
        reads it as prior art.
      </>
    );
  }
  return <>Draft, imported by {record.created_by.display_name} on {formatDay(record.created_at)}. Nothing reads it until it is published.</>;
}

function Record({ record }: { record: HistoricDetail }) {
  return (
    <article className="historic" aria-labelledby="historic-name">
      <header className="historic__head">
        <h2 id="historic-name" className="sheet__title" dir="auto">{record.title}</h2>
        <p className="docpage__edition"><Edition record={record} /></p>
        {record.status === "draft" && <Rename record={record} />}
      </header>
      <Processing record={record} />
      <Brds record={record} />
      <WorkItems record={record} />
      {record.pending_refresh && <PendingRefresh record={record} />}
      {record.breakdown && (
        <section className="govsection" aria-labelledby="historic-lineage">
          <h3 id="historic-lineage" className="govsection__title">Lineage</h3>
          <BreakdownTable breakdown={record.breakdown} brds={record.brd_files.map((brd) => brd.filename)} />
        </section>
      )}
      {record.status === "draft" && <Publish record={record} />}
      {record.status === "published" && <Withdraw record={record} />}
    </article>
  );
}

/** What is being read for it now, and how far along; or why reading stopped. */
function Processing({ record }: { record: HistoricDetail }) {
  const run = record.run;
  const reading = record.brd_files.filter((brd) => brd.stage === "queued").length;
  if (reading > 0) {
    return (
      <div className="processing" role="status">
        <p><span className="status">Reading {reading === 1 ? "its BRD" : `${reading} BRDs`}</span></p>
      </div>
    );
  }
  if (!run || run.status === "succeeded") return null;
  if (run.status === "failed") {
    return (
      <div className="processing processing--failed" role="alert">
        <p><span className="status">The breakdown could not be read</span> · {runFailure(run.failure)}</p>
      </div>
    );
  }
  return (
    <div className="processing" role="status">
      <p>
        <span className="status">{run.kind === "refresh" ? "Reading it again from Azure DevOps" : "Reading the breakdown"}</span>
        {run.total > 0 ? ` · ${run.done} of ${count(run.total, "work item")}` : " · starting"}
      </p>
    </div>
  );
}

function Failure({ error, onReload }: { error: unknown; onReload?: () => void }) {
  const stale = error instanceof ApiError && error.status === 409 && /changed while you worked/i.test(errorMessage(error));
  return (
    <p className="docpage__failure" role="alert" tabIndex={-1}>
      {errorMessage(error)}
      {stale && onReload && (
        <button type="button" className="text-button" onClick={onReload}>
          <RotateCw size={14} aria-hidden="true" />
          Reload it
        </button>
      )}
    </p>
  );
}

function useReload(id: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: historicKey(id) });
}

/** A step opened in place: focus moves in, and back to its trigger when it closes. */
function useInPlace() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) first.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return { open, setOpen, trigger, first };
}

function Rename({ record }: { record: HistoricDetail }) {
  const { open, setOpen, trigger, first } = useInPlace();
  const [title, setTitle] = useState(record.title);
  const rename = useHistoricChange(record.id, (value: string) => api.renameHistoric(record.id, value, record.version));
  if (!open) {
    return (
      <p className="docpage__actions">
        <button ref={trigger} type="button" className="text-button" onClick={() => { setTitle(record.title); rename.reset(); setOpen(true); }}>
          Rename…
        </button>
      </p>
    );
  }
  return (
    <form
      className="historic__inline"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) rename.mutate(title.trim(), { onSuccess: () => setOpen(false) });
      }}
      onKeyDown={(event) => { if (event.key === "Escape" && !rename.isPending) setOpen(false); }}
    >
      <label className="field field--inline">
        <span className="field__label">Title</span>
        <input ref={first} className="field__input" dir="auto" maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <button type="submit" className="action-button" aria-disabled={rename.isPending || undefined}>Save the title</button>
      <button type="button" className="text-button" onClick={() => setOpen(false)}>Cancel</button>
      {rename.isError && <Failure error={rename.error} />}
    </form>
  );
}

const STAGE_WORDS: Record<HistoricBrd["stage"], string> = { queued: "Being read", read: "Read", failed: "Could not be read" };

function Brds({ record }: { record: HistoricDetail }) {
  return (
    <section className="govsection" aria-labelledby="historic-brds">
      <h3 id="historic-brds" className="govsection__title">
        BRDs <span className="govsection__count">· {record.brd_files.length}</span>
      </h3>
      {record.brd_files.map((brd) => <Brd key={brd.id} record={record} brd={brd} />)}
      {record.status === "draft" && <AddBrd record={record} />}
    </section>
  );
}

function Brd({ record, brd }: { record: HistoricDetail; brd: HistoricBrd }) {
  const [all, setAll] = useState(false);
  const again = useHistoricChange(record.id, () => api.readHistoricBrdAgain(record.id, brd.id, record.version));
  const shown = all ? brd.passages : brd.passages.slice(0, PASSAGES_SHOWN);
  const id = useId();
  return (
    <div className={`historic__brd historic__brd--${brd.stage}`}>
      <p className="historic__brd-head">
        <span className="historic__brd-name" dir="auto">{brd.filename}</span>
        <span className="status">{STAGE_WORDS[brd.stage]}</span>
        <span className="secondary">
          {brd.stage === "read" ? `${count(brd.passages.length, "passage")} · ` : ""}uploaded by {brd.uploaded_by.display_name} on {formatDay(brd.uploaded_at)}
        </span>
      </p>
      {brd.error && (
        <p className="docpage__failure">
          {brd.error}
          {record.status === "draft" && (
            <button type="button" className="text-button" disabled={again.isPending} onClick={() => again.mutate(undefined)}>
              <RotateCw size={14} aria-hidden="true" />
              Read it again
            </button>
          )}
        </p>
      )}
      {brd.warnings.length > 0 && (
        <ul className="historic__warnings">
          {brd.warnings.map((warning, index) => (
            <li key={index} className={warning.severity === "blocking" ? "status status--failed" : "secondary"}>{warning.message}</li>
          ))}
        </ul>
      )}
      {shown.length > 0 && (
        <table className="passages passages--read historic__passages" aria-describedby={`${id}-caption`}>
          <caption id={`${id}-caption`} className="visually-hidden">Passages of {brd.filename}</caption>
          <thead>
            <tr>
              <th scope="col" className="cell passages__where">Where</th>
              <th scope="col" className="cell passages__working">Passage</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((passage) => (
              <tr key={passage.block_id} className="passage">
                <th scope="row" className="cell passages__where">{passage.label}</th>
                <td className="cell passages__working" dir="auto">{passage.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {brd.passages.length > PASSAGES_SHOWN && (
        <p className="govsection__actions">
          <button type="button" className="text-button" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? `Show the first ${PASSAGES_SHOWN}` : `Show all ${brd.passages.length} passages`}
          </button>
        </p>
      )}
      {again.isError && <Failure error={again.error} />}
    </div>
  );
}

function AddBrd({ record }: { record: HistoricDetail }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const add = useHistoricChange(record.id, (file: File) => api.addHistoricBrd(record.id, file, record.version));
  return (
    <p className="historic__add-brd">
      <label className="text-button file-button" htmlFor={id}>
        <Upload size={14} aria-hidden="true" />
        {add.isPending ? "Adding…" : "Add another BRD"}
        <input
          ref={input}
          id={id}
          type="file"
          className="visually-hidden"
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
    </p>
  );
}

function WorkItems({ record }: { record: HistoricDetail }) {
  const id = useId();
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
  const field = useRef<HTMLInputElement>(null);
  const link = useHistoricChange(record.id, (ids: number[]) => api.linkWorkItems(record.id, ids, record.version));
  const refresh = useHistoricChange(record.id, () => api.refreshHistoric(record.id, record.version));
  const { ids, invalid } = parseIds(text);
  const problem = invalid.length > 0
    ? `Work item ids are whole numbers; ${invalid.slice(0, 3).map((token) => `“${token}”`).join(", ")} ${invalid.length === 1 ? "is" : "are"} not.`
    : ids.length === 0 ? "Name at least one work item." : ids.length > 50 ? "Link at most 50 work items." : null;
  const reading = record.run?.status === "queued" || record.run?.status === "running";
  const draft = record.status === "draft";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (problem) field.current?.focus();
    else if (!reading && !link.isPending) link.mutate(ids);
  };
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="govsection__title">Work items in Azure DevOps</h3>
      <p className="govsection__lead">
        The root work items this BRD was delivered as. Their Features and User Stories beneath are read from Azure DevOps,
        read-only.
      </p>
      {draft && record.suggestions.length > 0 && (
        <Suggestions record={record} onUse={(value) => { setText(value); setTried(false); field.current?.focus(); }} />
      )}
      {draft ? (
        <form className="historic__link" onSubmit={submit} aria-labelledby={`${id}-title`}>
          <label className="field" htmlFor={`${id}-ids`}>
            <span className="field__label">Root work item ids</span>
            <input
              ref={field}
              id={`${id}-ids`}
              className="field__input"
              inputMode="numeric"
              autoComplete="off"
              value={text}
              aria-invalid={(tried && !!problem) || undefined}
              aria-describedby={`${id}-hint${tried && problem ? ` ${id}-problem` : ""}`}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <p id={`${id}-hint`} className="form__hint">Separate several with commas or spaces, e.g. 48213, 48300.</p>
          {tried && problem && <p id={`${id}-problem`} className="docpage__failure">{problem}</p>}
          <p className="govsection__actions">
            <button type="submit" className="action-button" aria-disabled={reading || link.isPending || undefined}>
              {reading ? "Reading the breakdown…" : record.breakdown ? "Read the breakdown again" : "Read the breakdown"}
            </button>
          </p>
          {link.isError && <Failure error={link.error} onReload={reload} />}
        </form>
      ) : (
        <>
          <p>
            {count(record.root_ids.length, "root")}: {record.root_ids.map((rootId) => `#${rootId}`).join(", ")}
            {record.breakdown && <span className="secondary"> · read {formatMoment(new Date(record.breakdown.fetched_at))}</span>}
          </p>
          {record.status === "published" && !record.pending_refresh && (
            <p className="govsection__actions">
              <button type="button" className="text-button" disabled={reading || refresh.isPending} onClick={() => refresh.mutate(undefined)}>
                <RotateCw size={14} aria-hidden="true" />
                {reading ? "Reading it again…" : "Refresh from Azure DevOps"}
              </button>
            </p>
          )}
          {refresh.isError && <Failure error={refresh.error} onReload={reload} />}
        </>
      )}
      {record.run && record.run.item_errors.length > 0 && record.run.status === "succeeded" && (
        <RunReport run={record.run} />
      )}
    </section>
  );
}

function Suggestions({ record, onUse }: { record: HistoricDetail; onUse: (value: string) => void }) {
  const all = record.suggestions.map((item) => item.work_item_id).join(", ");
  return (
    <div className="historic__suggestions">
      <p>
        <strong>Found in the BRD:</strong>{" "}
        {record.suggestions.map((item, index) => (
          <span key={item.work_item_id}>
            {index > 0 && ", "}
            <span title={item.quote}>#{item.work_item_id}</span>{" "}
            <span className="secondary">({item.label})</span>
          </span>
        ))}
        <span aria-hidden="true"> · </span>
        <button type="button" className="text-button knowledge__act" onClick={() => onUse(all)}>
          {record.suggestions.length === 1 ? "Use it" : "Use these"}
        </button>
      </p>
      <p className="form__hint">Suggested from the text only. Check each is the work item this BRD was delivered as.</p>
    </div>
  );
}

function RunReport({ run }: { run: HistoricRun }) {
  return (
    <div className="historic__report">
      <p className="historic__report-title">
        {count(run.item_errors.length, "work item")} could not be read
        <span className="secondary"> · {formatMoment(new Date(run.finished_at ?? run.started_at))}</span>
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
    <section className="govsection historic__refresh" aria-labelledby="historic-refresh">
      <h3 id="historic-refresh" className="govsection__title">A newer read is waiting</h3>
      <p className="govsection__lead">
        Read from Azure DevOps {formatMoment(new Date(pending.breakdown.fetched_at))}.{" "}
        {pending.changes.length === 0
          ? "Nothing changed since it was published."
          : `${count(pending.changes.length, "work item")} changed. Accepting publishes it again, and requirement work reads the new breakdown.`}
      </p>
      {pending.changes.length > 0 && <ChangeTable changes={pending.changes} />}
      <p className="govsection__actions">
        <button type="button" className="action-button" aria-disabled={busy || undefined} onClick={() => { if (!busy) accept.mutate(undefined); }}>
          {accept.isPending ? "Publishing…" : "Accept the refresh and publish"}
        </button>
        <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => { if (!busy) discard.mutate(undefined); }}>
          Discard it
        </button>
      </p>
      {[accept, discard].map((mutation, index) => mutation.isError && <Failure key={index} error={mutation.error} onReload={reload} />)}
    </section>
  );
}

function Publish({ record }: { record: HistoricDetail }) {
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reload = useReload(record.id);
  const publish = useHistoricChange(record.id, () => api.publishHistoric(record.id, record.version));
  const discard = useMutation({
    mutationFn: () => api.discardHistoric(record.id, record.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HISTORIC_LIST_KEY });
      navigate(HISTORIC_PATH, { state: { notice: `‘${record.title}’ was discarded.` } });
    },
  });
  const { open, setOpen, trigger } = useInPlace();
  const waits = record.blockers.length > 0;
  return (
    <section className="govsection historic__publish" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="govsection__title">Publish as reference knowledge</h3>
      <p className="govsection__lead">
        Requirement work then reads its BRD passages and breakdown as prior art for new requirements: labelled historic,
        never confirmed intent, and never blocking a decision. Azure DevOps is not changed.
      </p>
      {waits && (
        <ul id={`${id}-waits`} className="historic__blockers">
          {record.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      )}
      <p className="govsection__actions">
        <button
          type="button"
          className="action-button"
          disabled={waits || publish.isPending}
          aria-describedby={waits ? `${id}-waits` : undefined}
          onClick={() => publish.mutate(undefined)}
        >
          {publish.isPending ? "Publishing…" : "Publish it"}
        </button>
        {!open && (
          <button ref={trigger} type="button" className="text-button" onClick={() => setOpen(true)}>
            Discard this draft…
          </button>
        )}
      </p>
      {open && (
        <InlineConfirm
          title="Discard this draft?"
          lead="Its BRDs and breakdown are removed. Nothing was ever published from it."
          commit={discard.isPending ? "Discarding…" : "Discard it"}
          busy={discard.isPending}
          onCommit={() => discard.mutate()}
          onCancel={() => setOpen(false)}
        />
      )}
      {publish.isError && <Failure error={publish.error} onReload={reload} />}
      {discard.isError && <Failure error={discard.error} onReload={reload} />}
    </section>
  );
}

function InlineConfirm({ title, lead, commit, busy, onCommit, onCancel, children }: {
  title: string;
  lead: string;
  commit: string;
  busy: boolean;
  onCommit: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div
      className="knowledge__act-form review__form"
      role="group"
      aria-label={title}
      onKeyDown={(event) => { if (event.key === "Escape" && !busy) onCancel(); }}
    >
      <p ref={heading} tabIndex={-1} className="knowledge__act-title">{title}</p>
      <p className="secondary knowledge__act-lead">{lead}</p>
      {children}
      <p className="govsection__actions">
        <button type="button" className="action-button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onCommit(); }}>{commit}</button>
        <button type="button" className="text-button" aria-disabled={busy || undefined} onClick={() => { if (!busy) onCancel(); }}>Cancel</button>
      </p>
    </div>
  );
}

function Withdraw({ record }: { record: HistoricDetail }) {
  const id = useId();
  const { open, setOpen, trigger, first } = useInPlace();
  const reload = useReload(record.id);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const withdraw = useHistoricChange(record.id, (why: string) => api.withdrawHistoric(record.id, why, record.version));
  const missing = tried && !reason.trim();
  if (!open) {
    return (
      <p className="govsection__actions historic__withdraw-open">
        <button ref={trigger} type="button" className="text-button" onClick={() => { setReason(""); setTried(false); withdraw.reset(); setOpen(true); }}>
          Withdraw from requirement work…
        </button>
      </p>
    );
  }
  return (
    <form
      className="withdraw"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (reason.trim()) withdraw.mutate(reason.trim(), { onSuccess: () => setOpen(false) });
        else first.current?.focus();
      }}
      onKeyDown={(event) => { if (event.key === "Escape" && !withdraw.isPending) setOpen(false); }}
    >
      <h3 id={`${id}-title`} className="withdraw__title">Withdraw from requirement work</h3>
      <p>Requirement work stops reading it as prior art. It stays here, withdrawn, with your reason.</p>
      <label className="field" htmlFor={`${id}-reason`}>
        <span className="field__label">Why (required)</span>
        <textarea
          ref={first}
          id={`${id}-reason`}
          className="field__input"
          rows={3}
          maxLength={2000}
          value={reason}
          aria-required="true"
          aria-invalid={missing || undefined}
          aria-describedby={missing ? `${id}-missing` : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {missing && <p id={`${id}-missing`} className="docpage__failure">Say why it is withdrawn.</p>}
      <p className="withdraw__actions">
        <button type="submit" className="action-button" aria-disabled={withdraw.isPending || undefined}>
          {withdraw.isPending ? "Withdrawing…" : "Withdraw it"}
        </button>
        <button type="button" className="text-button" onClick={() => setOpen(false)}>Keep it published</button>
      </p>
      {withdraw.isError && <Failure error={withdraw.error} onReload={reload} />}
    </form>
  );
}
