import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";

import { type AdminRecordEntry, api } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { Failure } from "./DocumentPage";
import { useDocumentContext } from "./documentContext";

/**
 * Who owns the document, and handing it to another knowledge admin. The new
 * owner gets every private version and review; the old owner keeps only what
 * every admin sees.
 */
export function OwnershipPage() {
  const { document } = useDocumentContext();
  const id = useId();
  const history = useQuery({
    queryKey: ["library", "ownership", document.id],
    queryFn: () => api.ownershipHistory(document.id),
  });
  const transfers = [...(history.data ?? [])].reverse();
  return (
    <>
      <Transfer />
      <section className="govsection" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className="govsection__title">Ownership history</h2>
        {history.isError ? (
          <p className="docpage__failure" role="alert">{errorMessage(history.error)}</p>
        ) : transfers.length === 0 ? (
          <p className="timetable__quiet">
            {history.isPending ? "Reading…" : `${document.owner.display_name} has owned it since it was added.`}
          </p>
        ) : (
          <table className="govtable">
            <caption className="visually-hidden">Ownership transfers, newest first</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Handed over</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={`${transfer.recorded_at}-${transfer.new_owner.display_name}`} className="row">
                  <th scope="row" className="nowrap">{formatDay(transfer.recorded_at)}</th>
                  <td>
                    From {transfer.previous_owner.display_name} to {transfer.new_owner.display_name}
                    {transfer.performed_by.display_name !== transfer.previous_owner.display_name && (
                      <span className="secondary govtable__by">
                        by {transfer.performed_by.display_name}
                        {transfer.on_behalf ? `, as admin on ${transfer.previous_owner.display_name}’s behalf` : ""}
                      </span>
                    )}
                    <span className="secondary govtable__by" dir="auto">{transfer.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <AdminRecord />
    </>
  );
}

const ACTION: Record<AdminRecordEntry["action"], string> = {
  grant: "Began acting as admin",
  end: "Stopped acting as admin",
  reassign: "Handed it over",
  withdraw: "Withdrew it",
  review: "Saved a review",
  approve: "Approved a version",
  retry_reading: "Retried reading, with others",
  retry_indexing: "Retried indexing, with others",
};

/** Everything a knowledge admin did to this document without owning it, newest first. */
function AdminRecord() {
  const { document } = useDocumentContext();
  const id = useId();
  const record = useQuery({
    queryKey: ["library", "admin-record", document.id],
    queryFn: () => api.adminRecord(document.id),
  });
  const entries = record.data ?? [];
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">Admin record</h2>
      <p className="govsection__lead">
        What knowledge admins did to it on its owner&rsquo;s behalf, and the library-wide retries that included it.
      </p>
      {record.isError ? (
        <p className="docpage__failure" role="alert">{errorMessage(record.error)}</p>
      ) : entries.length === 0 ? (
        <p className="timetable__quiet">{record.isPending ? "Reading…" : "No admin has acted on it for its owner."}</p>
      ) : (
        <table className="govtable">
          <caption className="visually-hidden">Admin record, newest first</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">What, and why</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="row">
                <th scope="row" className="nowrap">
                  {formatDay(entry.acted_at)}
                  <span className="secondary govtable__by">
                    {new Date(entry.acted_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                  </span>
                </th>
                <td>
                  {ACTION[entry.action]}
                  <span className="secondary govtable__by">by {entry.admin.display_name}</span>
                  {entry.reason && <span className="secondary govtable__by" dir="auto">{entry.reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Transfer() {
  const { document, hook, dirty } = useDocumentContext();
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [find, setFind] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(find.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [find]);
  const actors = useQuery({ queryKey: ["identity", "actors", query], queryFn: () => api.findActors(query) });
  const candidates = (actors.data ?? []).filter((actor) => actor.id !== document.owner.id.value);
  const chosen = candidates.find((actor) => actor.id === target);
  // An admin acting for the owner may hand it on, or take it over themselves.
  const owner = document.owner.display_name;
  const acting = !document.is_owner;
  const me = document.acting_as_admin?.admin.id.value;
  const takingOver = acting && chosen !== undefined && chosen.id === me;
  const transfer = useMutation({
    mutationFn: () => api.transfer(document.id, { expected_version: document.version, actor_id: target, reason: reason.trim() }),
    onSuccess: (done) => {
      navigate("/library", {
        state: {
          notice: takingOver
            ? `You now own ‘${document.title}’.`
            : `‘${document.title}’ now belongs to ${done.new_owner.display_name}.`,
        },
      });
      // After the page has left: what was private to us is gone, and the list has changed.
      window.setTimeout(() => {
        queryClient.removeQueries({ queryKey: ["library", "document", document.id] });
        queryClient.removeQueries({ queryKey: ["library", "ownership", document.id] });
        void queryClient.invalidateQueries({ queryKey: ["library", "documents"] });
      }, 0);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    transfer.mutate();
  };
  return (
    <section className="govsection" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="govsection__title">
        {acting ? "Hand it on, or take it over" : "Hand it to another knowledge admin"}
      </h2>
      <p className="govsection__lead">
        {acting
          ? <>{owner} owns it now, and you act for them as admin. Hand it to another knowledge admin, or take it over
            yourself. Either way {owner} keeps only what every admin sees: the version in service.</>
          : <>{owner} owns it now. Only knowledge admins who have signed in to the portal can take it over. Once handed
            over, you keep only what every admin sees: the version in service.</>}
      </p>
      <form className="add__form govsection__form" onSubmit={submit}>
        <label className="field" htmlFor={`${id}-find`}>
          <span className="field__label">Find an admin by name or email</span>
          <input id={`${id}-find`} type="search" className="field__input" value={find} onChange={(event) => setFind(event.target.value)} />
        </label>
        <fieldset className="choices">
          <legend className="field__label">New owner</legend>
          {actors.isError && <p className="docpage__failure" role="alert">{errorMessage(actors.error)}</p>}
          {candidates.length === 0 && !actors.isPending && <p className="timetable__quiet">No other admin matches.</p>}
          {candidates.map((actor) => (
            <label key={actor.id} className="check">
              <input type="radio" name={`${id}-owner`} value={actor.id} checked={target === actor.id} onChange={() => setTarget(actor.id)} />
              {actor.display_name}{acting && actor.id === me ? " (you)" : ""}
              {actor.email && <span className="secondary"> · {actor.email}</span>}
            </label>
          ))}
        </fieldset>
        <label className="field" htmlFor={`${id}-reason`}>
          <span className="field__label">{acting ? "Why it changes hands" : "Why you are handing it over"}</span>
          <textarea id={`${id}-reason`} className="field__input" rows={3} maxLength={2000} value={reason}
            onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
          {acting
            ? `I understand ${owner} will lose access to this document’s private versions and reviews.`
            : "I understand I will lose access to this document's private versions and reviews."}
        </label>
        <p className="add__actions">
          <button type="submit" className="action-button"
            disabled={!chosen || !reason.trim() || !understood || dirty > 0 || transfer.isPending}>
            {transfer.isPending
              ? "Handing it over…"
              : takingOver
                ? `Take it over from ${owner}`
                : chosen
                  ? acting ? `Hand it to ${chosen.display_name} on ${owner}’s behalf` : `Hand it to ${chosen.display_name}`
                  : "Hand it over"}
          </button>
        </p>
        {dirty > 0 && <p className="govsection__lead">Save or discard the {dirty} unsaved review {dirty === 1 ? "change" : "changes"} first.</p>}
        {transfer.isError && <Failure error={transfer.error} onReload={hook.reload} />}
      </form>
    </section>
  );
}
