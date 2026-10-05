import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type ChangeRequest, type ExtractionRun, type Release, type Suggestion } from "../api/client";
import { errorMessage } from "../api/errors";
import { count, formatDay } from "../home/format";
import { CHANGE_REQUESTS_KEY, traceLine, useChangeRequests } from "./inbox";
import { warningInWords } from "./suggestions";

/** The offerings a change request's features name, as the requirement named them. */
function offeringsNamed(item: ChangeRequest): string[] {
  return [...new Set(item.features.flatMap((feature) => feature.contexts.map((context) => context.product_name ?? context.product_id ?? "")))].filter(Boolean);
}

const RANK: Record<ChangeRequest["status"], string> = { waiting: "row row--due", read: "row", dismissed: "row row--past" };

/**
 * The approved backlogs requirement-portal sent (requirement-portal ADR-0101, step 7), on the
 * Versions page: what each asks, where it comes from, and reading it into the draft or
 * dismissing it.
 */
export function ChangeRequestInbox({ releases, actorName }: {
  releases: Release[];
  actorName: (id: string | null | undefined) => string;
}) {
  const id = useId().replace(/:/g, "");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inbox = useChangeRequests();
  const [dismissing, setDismissing] = useState<string | null>(null);
  // Where focus goes back to when the dismiss form closes: the row's Dismiss button, or the
  // row itself once the dismissal removed that button.
  const returns = useRef(new Map<string, HTMLElement | null>());
  const closeDismissal = (itemId: string, dismissed: boolean) => {
    setDismissing(null);
    requestAnimationFrame(() => returns.current.get(dismissed ? `${itemId}:row` : `${itemId}:dismiss`)?.focus());
  };
  const draft = releases.find((release) => release.status === "draft");
  const named = (releaseId: string | null | undefined) => releases.find((release) => release.id === releaseId);
  const read = useMutation({
    mutationFn: (changeRequestId: string) => api.readChangeRequest(changeRequestId),
    onSuccess: (reading) => {
      void queryClient.invalidateQueries({ queryKey: ["architecture"] });
      const asked = reading.run.candidate_count;
      navigate(`/architecture/versions/${encodeURIComponent(reading.release.id)}/sources`, {
        state: {
          notice: `${reading.change_request.id} is read into ${
            reading.release.name === reading.change_request.id ? "a new draft named after it" : `‘${reading.release.name || "the draft"}’`
          }: ${count(asked, "suggested question")}${asked ? " below" : ""}.`,
        },
      });
    },
  });
  const waiting = (inbox.data ?? []).filter((item) => item.status === "waiting").length;

  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">
        Change requests from Requirement AI {waiting > 0 && <span className="govsection__count">{waiting} waiting</span>}
      </h2>
      <p className="govsection__lead">
        Requirement AI sends a requirement’s approved backlog here when its final approval is recorded. Reading one into the
        draft turns each approved feature into a suggested question for the offering it names; nothing reaches the catalogue
        until it is accepted.
      </p>
      {inbox.isPending ? (
        <p className="timetable__quiet">Reading the change requests…</p>
      ) : inbox.isError ? (
        <p className="docpage__failure" role="alert">
          {errorMessage(inbox.error)}
          <button type="button" className="text-button" onClick={() => void inbox.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      ) : inbox.data.length === 0 ? (
        <p className="timetable__quiet">No change request has come from Requirement AI yet.</p>
      ) : (
        <table className="govtable governance__table changerequests" role="table">
          <caption className="visually-hidden">Change requests from Requirement AI, newest first</caption>
          <colgroup>
            <col className="changerequests__col-request" />
            <col className="changerequests__col-from" />
            <col className="changerequests__col-state" />
          </colgroup>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Change request</th>
              <th scope="col" role="columnheader">From Requirement AI</th>
              <th scope="col" role="columnheader">State</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {inbox.data.map((item) => {
              const into = named(item.read_into);
              const stillOpen = into?.status === "draft";
              const offerings = offeringsNamed(item);
              const reading = read.isPending && read.variables === item.id;
              const failed = read.isError && read.variables === item.id;
              // A request read into a draft still in preparation is settled there; it is dismissed
              // only while waiting, or once that draft is gone.
              const dismissable = item.status === "waiting" || (item.status === "read" && !stillOpen);
              return (
                <tr key={item.id} role="row" className={RANK[item.status]}>
                  <th scope="row" role="rowheader" tabIndex={-1} ref={(node) => void returns.current.set(`${item.id}:row`, node)}>
                    <span className="governance__id">{item.id}</span>
                    <span className="changerequests__title" dir="auto">{item.title}</span>
                    <span className="secondary govtable__by">
                      {count(item.features.length, "approved feature")}
                      {offerings.length > 0 && <> for {offerings.join(", ")}</>} · received {formatDay(item.received_at)}
                    </span>
                  </th>
                  <td role="cell" data-head="From Requirement AI">
                    <span dir="auto">{traceLine(item.trace)}</span>
                    <ol className="changerequests__features">
                      {item.features.map((feature) => (
                        <li key={feature.id}>
                          <span className="governance__id">{feature.id}</span> <span dir="auto">{feature.name}</span>
                        </li>
                      ))}
                    </ol>
                  </td>
                  <td role="cell" data-head="State">
                    {item.status === "dismissed" ? (
                      <>
                        <span className="status">Dismissed</span>
                        <span className="secondary govtable__by">
                          by {actorName(item.dismissed_by)} on {formatDay(item.dismissed_at)}: <span dir="auto">{item.dismissal_reason}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="status">
                          {item.status === "waiting" ? "Waiting" : `Read into ‘${into?.name || "a draft"}’`}
                        </span>
                        {item.status === "read" && (
                          <span className="secondary govtable__by">
                            by {actorName(item.read_by)} on {formatDay(item.read_at)}
                            {!stillOpen && "; that draft is no longer in preparation"}
                          </span>
                        )}
                        {failed && <p className="docpage__failure" role="alert">{errorMessage(read.error)}</p>}
                        {dismissing === item.id ? (
                          <Dismissal item={item} onDone={(dismissed) => closeDismissal(item.id, dismissed)} />
                        ) : (
                          <span className="documents__actions">
                            {item.status === "read" && stillOpen ? (
                              <Link className="changerequests__link" to={`/architecture/versions/${encodeURIComponent(into.id)}/sources`}>
                                Its suggestions <span aria-hidden="true">→</span>
                                <span className="visually-hidden"> ({item.id})</span>
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className="text-button"
                                aria-disabled={read.isPending || undefined}
                                onClick={() => !read.isPending && read.mutate(item.id)}
                              >
                                {reading
                                  ? "Reading…"
                                  : item.status === "read"
                                    ? "Read it again"
                                    : draft
                                      ? `Read it into ‘${draft.name || "the draft"}’`
                                      : "Read it into a new draft"}
                                <span className="visually-hidden"> ({item.id})</span>
                              </button>
                            )}
                            {dismissable && (
                              <button
                                type="button"
                                className="text-button"
                                ref={(node) => void returns.current.set(`${item.id}:dismiss`, node)}
                                onClick={() => setDismissing(item.id)}
                              >
                                Dismiss it<span className="visually-hidden"> ({item.id})</span>
                              </button>
                            )}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Dismissing in place: a reason, then the choice. A dismissal stays. */
function Dismissal({ item, onDone }: { item: ChangeRequest; onDone: (dismissed: boolean) => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const dismiss = useMutation({
    mutationFn: () => api.dismissChangeRequest(item.id, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHANGE_REQUESTS_KEY });
      onDone(true);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim() && !dismiss.isPending) dismiss.mutate();
  };
  return (
    <form className="changerequests__dismiss" aria-label={`Dismiss ${item.id}`} onSubmit={submit}>
      <label className="field" htmlFor={`${id}-reason`}>
        <span className="field__label">Why it is dismissed</span>
        <input
          id={`${id}-reason`}
          className="field__input"
          value={reason}
          autoFocus
          maxLength={1000}
          aria-required="true"
          aria-describedby={`${id}-stays`}
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onDone(false);
          }}
        />
      </label>
      <p id={`${id}-stays`} className="secondary">A dismissal stays: the change request cannot be read afterwards.</p>
      {dismiss.isError && <p className="docpage__failure" role="alert">{errorMessage(dismiss.error)}</p>}
      <span className="documents__actions">
        <button
          type="submit"
          className="text-button documents__remove"
          aria-disabled={!reason.trim() || dismiss.isPending || undefined}
          aria-describedby={reason.trim() ? undefined : `${id}-first`}
        >
          {dismiss.isPending ? "Dismissing…" : "Dismiss it"}
        </button>
        <button type="button" className="text-button" onClick={() => onDone(false)}>
          Keep it
        </button>
      </span>
      {!reason.trim() && <p id={`${id}-first`} className="secondary">Give a reason first.</p>}
    </form>
  );
}

/**
 * The change requests read into this draft, on its Sources page beside its documents: what
 * the reading could not match, and how many of their suggestions still wait.
 */
export function DraftChangeRequests({ release, runs, suggestions }: {
  release: Release;
  runs: ExtractionRun[];
  suggestions: Suggestion[];
}) {
  const id = useId().replace(/:/g, "");
  const queryClient = useQueryClient();
  const inbox = useChangeRequests();
  const read = useMutation({
    mutationFn: (changeRequestId: string) => api.readChangeRequest(changeRequestId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["architecture"] }),
  });
  const readings = new Map<string, ExtractionRun>();
  for (const run of runs) if (run.change_request_id) readings.set(run.change_request_id, run);
  const items = (inbox.data ?? []).filter((item) => readings.has(item.id) || item.read_into === release.id);
  if (!items.length) return null;
  const waiting = (changeRequestId: string) =>
    suggestions.filter((item) => item.change_request?.change_request_id === changeRequestId && item.status === "proposed").length;
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Change requests</h2>
      <p className="govsection__lead">
        Approved backlogs from Requirement AI, read with fixed rules: each approved feature asks a question of the offering it
        names.
      </p>
      {read.isError && <p className="docpage__failure" role="alert">{errorMessage(read.error)}</p>}
      <table className="govtable governance__table changerequests" role="table">
        <caption className="visually-hidden">The change requests read into this draft</caption>
        <colgroup>
          <col className="changerequests__col-request" />
          <col className="changerequests__col-reading" />
          <col className="changerequests__col-waiting" />
        </colgroup>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Change request</th>
            <th scope="col" role="columnheader">Reading</th>
            <th scope="col" role="columnheader" className="cell--end">Waiting</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((item) => {
            const run = readings.get(item.id);
            return (
              <tr key={item.id} role="row" className="row">
                <th scope="row" role="rowheader">
                  <span className="governance__id">{item.id}</span>
                  <span className="changerequests__title" dir="auto">{item.title}</span>
                  <span className="secondary govtable__by" dir="auto">{traceLine(item.trace)}</span>
                </th>
                <td role="cell" data-head="Reading">
                  <span className="status">Read</span>
                  {run && <span className="secondary govtable__by">{count(run.candidate_count, "suggestion")} on its last reading</span>}
                  {run && run.warnings.length > 0 && (
                    <ul className="changerequests__warnings" aria-label={`What the reading of ${item.id} could not match`}>
                      {run.warnings.map((warning) => (
                        <li key={warning} dir="auto">{warningInWords(warning)}</li>
                      ))}
                    </ul>
                  )}
                  <span className="documents__actions">
                    <button
                      type="button"
                      className="text-button"
                      aria-disabled={read.isPending || undefined}
                      onClick={() => !read.isPending && read.mutate(item.id)}
                    >
                      <RotateCw size={14} aria-hidden="true" />
                      {read.isPending && read.variables === item.id ? "Reading…" : "Read it again"}
                      <span className="visually-hidden"> ({item.id})</span>
                    </button>
                  </span>
                </td>
                <td role="cell" data-head="Waiting" className="cell--end">{waiting(item.id)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
