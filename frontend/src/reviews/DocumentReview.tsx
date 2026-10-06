import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, type ConfirmReview, type LibraryDocument } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { documentKey } from "../library/useDocument";
import { ConfirmReviewForm } from "./ConfirmReviewForm";
import { REVIEW_READS, dueWords, sameMoment } from "./review";

/**
 * A document's review line under its edition line: who last confirmed it still right, and when
 * it falls due. Its owner confirms it; any other knowledge admin confirms on the owner's behalf,
 * with a reason. Nothing in service has no review.
 */
export function DocumentReview({ document }: { document: LibraryDocument }) {
  const standing = document.review;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const confirm = useMutation({
    mutationFn: (body: ConfirmReview) => api.confirmDocumentReview(document.id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(documentKey(document.id), updated);
      REVIEW_READS.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
      setDone(`Confirmed. It falls due again on ${formatDay(updated.review?.due_at)}.`);
      setOpen(false);
    },
  });
  useEffect(() => {
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!standing) return null;

  const owner = document.owner.display_name;
  const published = document.publications.find((item) => item.id === document.published_id);
  // Approving the version in service counts as its review, until someone confirms it again.
  const byApproval = sameMoment(standing.last_reviewed_at, published?.approved_at);
  const verb = byApproval ? "Approved" : "Last confirmed";
  const label = document.is_owner ? "Confirm it is still right…" : `Confirm on ${owner}’s behalf…`;
  const close = () => {
    if (confirm.isPending) return;
    setOpen(false);
    confirm.reset();
  };

  return (
    <div className="review">
      <p className={`review__line review__line--${standing.state}`}>
        {verb} by {standing.reviewer.display_name} on {formatDay(standing.last_reviewed_at)}
        <span aria-hidden="true"> · </span>
        <span className={standing.state === "current" ? undefined : "status"}>
          {standing.state === "current" ? `due for review ${formatDay(standing.due_at)}` : dueWords(standing)}
        </span>
        <span aria-hidden="true"> · </span>
        <button
          ref={trigger}
          type="button"
          className="text-button knowledge__act"
          aria-expanded={open}
          onClick={() => {
            setDone("");
            if (open) close();
            else setOpen(true);
          }}
        >
          {label}
        </button>
      </p>
      <p className="toolbar__notice" role="status">{done}</p>
      {open && (
        <ConfirmReviewForm
          title={<>Confirm <span dir="auto">‘{document.title}’</span> is still right</>}
          lead={document.is_owner
            ? "Its version in service stays as it is. Confirming starts its review cycle again, and requirement work stops flagging citations of it as overdue."
            : `For ${owner}, who owns it. Its version in service stays as it is; the confirmation names you and your reason, and is kept in its admin record.`}
          onBehalf={document.is_owner ? null : owner}
          commit={document.is_owner ? "Confirm it" : `Confirm for ${owner}`}
          busy={confirm.isPending}
          error={confirm.isError ? errorMessage(confirm.error) : null}
          onSubmit={(body) => confirm.mutate(body)}
          onCancel={close}
        />
      )}
    </div>
  );
}
