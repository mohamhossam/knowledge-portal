import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useId, useRef, useState } from "react";

import { api, type ConfirmReview, type LibraryDocument } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, Status, TextArea } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { documentKey } from "../library/useDocument";
import { REVIEW_READS, dueWords, sameMoment } from "./review";

const NOTE_MAX = 500;
const REASON_MAX = 500;

/**
 * A document's re-confirmation line on its record (redesign area 2): who last
 * confirmed it still right, and when it falls due. Its owner confirms it; any
 * other knowledge admin confirms on the owner's behalf, with a reason that is
 * kept. Asked in place, under the line. Nothing in service has no line.
 */
export function DocumentReview({ document }: { document: LibraryDocument }) {
  const standing = document.review;
  const queryClient = useQueryClient();
  const form = useDisclosure();
  const [done, setDone] = useState("");
  const said = useRef<HTMLParagraphElement>(null);
  const confirm = useMutation({
    mutationFn: (body: ConfirmReview) => api.confirmDocumentReview(document.id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(documentKey(document.id), updated);
      REVIEW_READS.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
      setDone(`Confirmed. It falls due again on ${formatDay(updated.review?.due_at)}.`);
      form.close();
    },
  });
  if (!standing) return null;

  const owner = document.owner.display_name;
  const published = document.publications.find((item) => item.id === document.published_id);
  // Approving the version in service counts as its review, until someone confirms it again.
  const byApproval = sameMoment(standing.last_reviewed_at, published?.approved_at);

  return (
    <div className="lib-reconfirm">
      <p className="lib-reconfirm__line">
        {standing.state === "current" ? null : <><Status tone={standing.state === "overdue" ? "attention" : "neutral"}>{dueWords(standing)}</Status>{" "}</>}
        <span>
          {byApproval ? "Not confirmed since its approval" : <>Last confirmed by <bdi>{standing.reviewer.display_name}</bdi> on {formatDay(standing.last_reviewed_at)}</>}
          {standing.state === "current" && <> · due for re-confirmation {formatDay(standing.due_at)}</>}
        </span>{" "}
        <Button
          variant="link"
          aria-expanded={form.open}
          onClick={(event) => {
            setDone("");
            confirm.reset();
            if (form.open) form.close();
            else form.show(event);
          }}
        >
          {document.is_owner ? "Confirm it is still right…" : `Confirm it is still right for ${owner}…`}
        </Button>
      </p>
      <p ref={said} className="lib-outcome" role="status">{done}</p>
      {form.open && (
        <ConfirmForm
          panelRef={form.panel}
          title={document.title}
          owner={document.is_owner ? null : owner}
          busy={confirm.isPending}
          error={confirm.isError ? errorMessage(confirm.error) : null}
          onSubmit={(body) => confirm.mutate(body)}
          onCancel={form.close}
        />
      )}
    </div>
  );
}

function ConfirmForm({ panelRef, title, owner, busy, error, onSubmit, onCancel }: {
  panelRef: RefObject<HTMLElement | null>;
  title: string;
  owner: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (body: ConfirmReview) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const missing = owner !== null && tried && !reason.trim();
  useEffect(() => {
    if (missing) window.document.querySelector<HTMLElement>(`[name='${id}-reason']`)?.focus();
  }, [missing, id]);
  return (
    <section
      ref={panelRef as RefObject<HTMLElement>}
      className="ds-consequence ds-consequence--neutral"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <h2 id={`${id}-title`} tabIndex={-1} className="ds-consequence__title">Confirm <bdi>'{title}'</bdi> is still right</h2>
      <p className="ds-consequence__happens">
        {owner === null
          ? "Its version in service stays as it is. Confirming starts its re-confirmation cycle again, and requirement work stops flagging citations of it as overdue."
          : `For ${owner}, who owns it. Its version in service stays as it is; the confirmation names you and your reason, and is kept in its admin record.`}
      </p>
      {owner !== null && (
        <TextArea
          name={`${id}-reason`}
          label={`Why you confirm it for ${owner}`}
          required
          rows={2}
          maxLength={REASON_MAX}
          value={reason}
          error={missing ? "Say why: it is kept with the confirmation." : null}
          onChange={(event) => setReason(event.target.value)}
        />
      )}
      <TextArea label="Note (optional)" hint="What you checked, for whoever confirms it next." rows={2} maxLength={NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
      {error && <p className="ds-consequence__failure" role="status"><Status tone="attention">{error}</Status></p>}
      <ActionGroup>
        <Button
          variant="primary"
          busy={busy}
          onClick={() => {
            setTried(true);
            if (owner !== null && !reason.trim()) {
              window.document.querySelector<HTMLElement>(`[name='${id}-reason']`)?.focus();
              return;
            }
            onSubmit({ note: note.trim() || null, reason: owner !== null ? reason.trim() : null });
          }}
        >
          {busy ? "Confirming…" : owner === null ? "Confirm it" : `Confirm for ${owner}`}
        </Button>
        <Button onClick={() => { if (!busy) onCancel(); }}>Cancel</Button>
      </ActionGroup>
    </section>
  );
}
