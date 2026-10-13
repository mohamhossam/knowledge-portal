import "./reviews.css";

import { type RefObject, useEffect, useId, useState } from "react";

import type { CatalogueSystem, ConfirmReview, SystemStanding } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { useCatalogueContext } from "../catalogue/useCatalogue";
import { ActionGroup, Button, Status, TextArea } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { formatDay } from "../home/format";
import { dueWords, sameMoment } from "./review";
import { MAINTAINER, useConfirmSystems, useSystemStandings } from "./useReviews";

const NOTE_MAX = 500;
const REASON_MAX = 500;

/**
 * A system's re-confirmation line on its record, in the version in service
 * only: when it was last confirmed, or that it counts from the version's
 * publication, and when it falls due. Any catalogue maintainer confirms it;
 * another knowledge admin confirms for the maintainers, with a reason that is
 * kept. Asked in place, under the line, as a document's line is.
 */
export function SystemReview({ system }: { system: CatalogueSystem }) {
  const { book, inService } = useCatalogueContext();
  const maintainer = useAuth()?.actor?.roles?.includes(MAINTAINER) ?? false;
  const standings = useSystemStandings(inService);
  const confirm = useConfirmSystems();
  const form = useDisclosure();
  const [done, setDone] = useState("");
  if (!inService) return null;
  const item = standings.data?.find((entry) => entry.system_id === system.id);
  if (standings.isError) {
    return <p className="review-line__text">Its re-confirmation could not be read: {errorMessage(standings.error)}</p>;
  }
  if (!item) return null;

  return (
    <div className="review-line">
      <p className="review-line__text">
        {item.standing.state === "current" ? null : (
          <><Status tone={item.standing.state === "overdue" ? "attention" : "neutral"}>{dueWords(item.standing)}</Status>{" "}</>
        )}
        <span>
          <ReviewSince item={item} publishedAt={book.release.published_at} />
          {item.standing.state === "current" && <> · due for re-confirmation {formatDay(item.standing.due_at)}</>}
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
          {maintainer ? "Confirm it is still right…" : "Confirm it is still right for the maintainers…"}
        </Button>
      </p>
      {item.note && (
        <p className="review-line__text">
          <span>
            Note from <bdi>{item.standing.reviewer.display_name}</bdi>: <bdi>{item.note}</bdi>
            {item.on_behalf && <> (for the maintainers: <bdi>{item.on_behalf.reason}</bdi>)</>}
          </span>
        </p>
      )}
      <p className="review-line__said" role="status">{done}</p>
      {form.open && (
        <ConfirmForm
          panelRef={form.panel}
          name={system.name}
          maintainer={maintainer}
          busy={confirm.isPending}
          error={confirm.isError ? errorMessage(confirm.error) : null}
          onSubmit={(body) =>
            confirm.mutate({ systemIds: [system.id], body }, {
              onSuccess: (result) => {
                setDone(`Confirmed. It falls due again on ${formatDay(result[0]?.standing.due_at)}.`);
                form.close();
              },
            })
          }
          onCancel={() => {
            if (confirm.isPending) return;
            confirm.reset();
            form.close();
          }}
        />
      )}
    </div>
  );
}

/** "Last confirmed by Max Maintainer on 2 Oct 2026", or that it counts from the publication. */
function ReviewSince({ item, publishedAt }: { item: SystemStanding; publishedAt: string | null | undefined }) {
  return sameMoment(item.standing.last_reviewed_at, publishedAt)
    ? <>Never confirmed since this version was published on {formatDay(item.standing.last_reviewed_at)}</>
    : <>Last confirmed by <bdi>{item.standing.reviewer.display_name}</bdi> on {formatDay(item.standing.last_reviewed_at)}</>;
}

function ConfirmForm({ panelRef, name, maintainer, busy, error, onSubmit, onCancel }: {
  panelRef: RefObject<HTMLElement | null>;
  name: string;
  maintainer: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (body: ConfirmReview) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const missing = !maintainer && tried && !reason.trim();
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
      <h2 id={`${id}-title`} tabIndex={-1} className="ds-consequence__title">Confirm <bdi>{name}</bdi> is still right</h2>
      <p className="ds-consequence__happens">
        {maintainer
          ? "Its record in the version in service stays as it is. Confirming starts its re-confirmation cycle again for every catalogue maintainer."
          : "Catalogue maintainers confirm systems. Confirming for them names you and your reason, and starts its re-confirmation cycle again."}
      </p>
      {!maintainer && (
        <TextArea
          name={`${id}-reason`}
          label="Why you confirm it for the catalogue’s maintainers"
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
            if (!maintainer && !reason.trim()) {
              window.document.querySelector<HTMLElement>(`[name='${id}-reason']`)?.focus();
              return;
            }
            onSubmit({ note: note.trim() || null, reason: maintainer ? null : reason.trim() });
          }}
        >
          {busy ? "Confirming…" : maintainer ? "Confirm it" : "Confirm for the maintainers"}
        </Button>
        <Button onClick={() => { if (!busy) onCancel(); }}>Cancel</Button>
      </ActionGroup>
    </section>
  );
}
