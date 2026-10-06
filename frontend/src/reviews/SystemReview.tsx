import { useEffect, useRef, useState } from "react";

import type { CatalogueSystem, SystemStanding } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { useCatalogueContext } from "../catalogue/useCatalogue";
import { formatDay } from "../home/format";
import { ConfirmReviewForm } from "./ConfirmReviewForm";
import { dueWords, sameMoment } from "./review";
import { MAINTAINER, useConfirmSystems, useSystemStandings } from "./useReviews";

/**
 * A system's review line on its sheet, in the version in service only: when it was last
 * confirmed, or that it counts from the version's publication, and when it falls due. Any
 * catalogue maintainer confirms it; another knowledge admin confirms with a reason.
 */
export function SystemReview({ system }: { system: CatalogueSystem }) {
  const { book, inService } = useCatalogueContext();
  const maintainer = useAuth()?.actor?.roles?.includes(MAINTAINER) ?? false;
  const standings = useSystemStandings(inService);
  const confirm = useConfirmSystems();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!inService) return null;
  const item = standings.data?.find((entry) => entry.system_id === system.id);
  if (standings.isError) {
    return <p className="review__line secondary">Its review could not be read: {errorMessage(standings.error)}</p>;
  }
  if (!item) return null;

  const close = () => {
    if (confirm.isPending) return;
    setOpen(false);
    confirm.reset();
  };
  return (
    <div className="review">
      <p className={`review__line review__line--${item.standing.state}`}>
        <ReviewSince item={item} publishedAt={book.release.published_at} />
        <span aria-hidden="true"> · </span>
        <span className={item.standing.state === "current" ? undefined : "status"}>
          {item.standing.state === "current" ? `due for review ${formatDay(item.standing.due_at)}` : dueWords(item.standing)}
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
          {maintainer ? "Confirm it is still right…" : "Confirm for the catalogue’s maintainers…"}
        </button>
      </p>
      {item.note && (
        <p className="review__note secondary">
          Their note: <span dir="auto">{item.note}</span>
          {item.on_behalf && <> (for the maintainers: <span dir="auto">{item.on_behalf.reason}</span>)</>}
        </p>
      )}
      <p className="toolbar__notice" role="status">{done}</p>
      {open && (
        <ConfirmReviewForm
          title={<>Confirm <span dir="auto">{system.name}</span> is still right</>}
          lead={maintainer
            ? "Its sheet in the version in service stays as it is. Confirming starts its review cycle again for every catalogue maintainer."
            : "Catalogue maintainers confirm systems. Confirming for them names you and your reason, and starts its review cycle again."}
          onBehalf={maintainer ? null : "the catalogue’s maintainers"}
          commit="Confirm it"
          busy={confirm.isPending}
          error={confirm.isError ? errorMessage(confirm.error) : null}
          onSubmit={(body) => confirm.mutate({ systemIds: [system.id], body }, {
            onSuccess: (result) => {
              setDone(`Confirmed. It falls due again on ${formatDay(result[0]?.standing.due_at)}.`);
              setOpen(false);
            },
          })}
          onCancel={close}
        />
      )}
    </div>
  );
}

/** "Last confirmed by Max Maintainer on 2 Oct 2026", or that it counts from the publication. */
export function ReviewSince({ item, publishedAt }: { item: SystemStanding; publishedAt: string | null | undefined }) {
  return sameMoment(item.standing.last_reviewed_at, publishedAt)
    ? <>Never confirmed since this version was published on {formatDay(item.standing.last_reviewed_at)}</>
    : <>Last confirmed by {item.standing.reviewer.display_name} on {formatDay(item.standing.last_reviewed_at)}</>;
}
