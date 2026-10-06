import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

import { api, type LibraryDocument } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { documentKey } from "./useDocument";

const REASON_MAX = 500;

function timeOf(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function useRefresh(documentId: string) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: documentKey(documentId) }),
    queryClient.invalidateQueries({ queryKey: ["library", "documents"] }),
    queryClient.invalidateQueries({ queryKey: ["library", "admin-record", documentId] }),
  ]);
}

/**
 * For a knowledge admin who doesn't own the document: say whose it is, and offer to act on
 * the owner's behalf, with a reason (Knowledge Center C). Asked in place, under the head.
 */
export function ActAsAdmin({ document }: { document: LibraryDocument }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const refusal = useRef<HTMLParagraphElement>(null);
  const wasOpen = useRef(false);
  const id = useId();
  const refresh = useRefresh(document.id);
  const grant = useMutation({
    mutationFn: () => api.openAdminGrant(document.id, reason.trim()),
    onSuccess: () => refresh(),
  });
  const owner = document.owner.display_name;
  useEffect(() => {
    if (open) {
      field.current?.focus();
      field.current?.closest("form")?.scrollIntoView?.({ block: "nearest" });
    } else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (grant.isError) refusal.current?.focus();
  }, [grant.isError]);
  const missing = tried && !reason.trim();
  const close = () => {
    if (grant.isPending) return;
    setOpen(false);
    setTried(false);
    grant.reset();
  };

  return (
    <div className="admingrant">
      <p className="admingrant__line">
        {owner} owns this document; only they review or change it.{" "}
        <button
          ref={trigger}
          type="button"
          className="text-button knowledge__act"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          Act as admin on {owner}&rsquo;s behalf…
        </button>
      </p>
      {open && (
        <form
          className="knowledge__act-form admingrant__form"
          aria-labelledby={`${id}-title`}
          onSubmit={(event) => {
            event.preventDefault();
            if (grant.isPending) return;
            setTried(true);
            if (reason.trim()) grant.mutate();
            else field.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <p id={`${id}-title`} className="knowledge__act-title">Act as admin on <span dir="auto">‘{document.title}’</span></p>
          <p className="secondary knowledge__act-lead">
            For the next eight hours you see {owner}&rsquo;s working copy and can review, approve, hand over or withdraw
            it on their behalf. Each change names you and this reason, and is kept in its admin record. Uploading new
            versions and building its search index stay with {owner}.
          </p>
          <label className="field">
            <span className="field__label">Why</span>
            <textarea
              ref={field}
              className="field__input"
              rows={2}
              maxLength={REASON_MAX}
              value={reason}
              aria-required="true"
              aria-invalid={missing || undefined}
              aria-describedby={missing ? `${id}-missing` : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {missing && (
            <p id={`${id}-missing`} className="docpage__failure">Say why: it is kept with every change you make.</p>
          )}
          {grant.isError && (
            <p ref={refusal} tabIndex={-1} className="docpage__failure" role="alert">{errorMessage(grant.error)}</p>
          )}
          <p className="govsection__actions">
            <button type="submit" className="action-button" aria-disabled={grant.isPending || undefined}>
              {grant.isPending ? "Opening…" : "Act as admin"}
            </button>
            <button type="button" className="text-button" aria-disabled={grant.isPending || undefined} onClick={close}>
              Cancel
            </button>
          </p>
        </form>
      )}
    </div>
  );
}

/** While an admin acts for the owner: whose document, until when, why, and a way to stop. */
export function ActingBanner({ document }: { document: LibraryDocument }) {
  const grant = document.acting_as_admin;
  const refresh = useRefresh(document.id);
  const end = useMutation({ mutationFn: () => api.endAdminGrant(document.id), onSuccess: () => refresh() });
  if (!grant) return null;
  return (
    <div className="admingrant admingrant--live" role="region" aria-label="Acting as admin">
      <p className="admingrant__line">
        <strong>Acting as admin on {document.owner.display_name}&rsquo;s behalf</strong> until{" "}
        {timeOf(grant.expires_at)} ({formatDay(grant.expires_at)}):{" "}
        <span dir="auto">{grant.reason}</span>
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          className="text-button"
          aria-disabled={end.isPending || undefined}
          onClick={() => { if (!end.isPending) end.mutate(); }}
        >
          {end.isPending ? "Stopping…" : "Stop acting as admin"}
        </button>
      </p>
      {end.isError && <p className="docpage__failure" role="alert">{errorMessage(end.error)}</p>}
    </div>
  );
}
