import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type ChangeRequest, type Release } from "../api/client";
import { errorMessage } from "../api/errors";
import { ActionGroup, Button, type Column, DataTable, Section, Skeleton, Status, TextField } from "../design/components";
import { count, formatDay } from "../home/format";
import {
  CHANGE_REQUESTS_KEY,
  closedLine,
  type Delivery,
  deliveredChangeSentence,
  draftLines,
  hitLine,
  traceLine,
  useChangeRequests,
} from "./inbox";

/** The offerings a change request's features name, as the requirement named them. */
function offeringsNamed(item: ChangeRequest): string[] {
  if (item.delivery) return item.delivery.offering_name ? [item.delivery.offering_name] : [];
  return [...new Set(item.features.flatMap((feature) => feature.contexts.map((context) => context.product_name ?? context.product_id ?? "")))].filter(Boolean);
}

/** A system named by the id the hit rate compares, as the closure named it. */
function systemNamer(item: ChangeRequest, delivery: Delivery): (id: string) => string {
  const names = new Map<string, string>();
  for (const system of delivery.predicted) names.set(system.id.toLowerCase(), system.name);
  for (const feature of item.features) for (const system of feature.systems) names.set((system.id ?? system.name).toLowerCase(), system.name);
  return (id) => names.get(id) ?? id;
}

/** Features as a plain list, each by its id and name. */
function Features({ item, label }: { item: ChangeRequest; label?: string }) {
  return (
    <ol className="cat-plain cat-features" aria-label={label}>
      {item.features.map((feature) => (
        <li key={feature.id}>
          <span className="offering-id">{feature.id}</span> <span dir="auto">{feature.name}</span>
        </li>
      ))}
    </ol>
  );
}

/** What a closed Epic delivered: its Features, those it did not, what it suggests, and the hit. */
function DeliveryFacts({ item, delivery }: { item: ChangeRequest; delivery: Delivery }) {
  const name = systemNamer(item, delivery);
  return (
    <>
      <span className="cat-detail">
        {delivery.epic_url ? (
          <a href={delivery.epic_url} target="_blank" rel="noreferrer">
            {closedLine(delivery)}
            <span className="ds-visually-hidden"> (opens the work-item tracker)</span>
          </a>
        ) : (
          closedLine(delivery)
        )}
      </span>
      <Features item={item} label={`Delivered by ${item.id}`} />
      {delivery.not_delivered.length > 0 && (
        <p className="cat-detail">
          Not delivered:{" "}
          {delivery.not_delivered.map((feature, index) => (
            <span key={feature.id}>
              {index > 0 && "; "}
              <span className="offering-id">{feature.id}</span> <span dir="auto">{feature.name}</span> ({feature.state})
            </span>
          ))}
        </p>
      )}
      <p className="cat-detail">
        {delivery.changes.length
          ? `Suggests: ${delivery.changes.map(deliveredChangeSentence).join("; ")}.`
          : "Suggests no catalogue change: none of the capabilities the product impact found missing came with it."}
      </p>
      <p className="cat-detail">{hitLine(delivery, name)}</p>
    </>
  );
}

const STATE_TONE = { waiting: "attention", read: "done", dismissed: "stopped" } as const;

/**
 * The approved backlogs requirement-portal sent (requirement-portal ADR-0101, step 7), on the
 * Versions page: what each asks, where it comes from, and reading it into the draft or
 * dismissing it.
 */
export function ChangeRequestInbox({ releases, actorName }: {
  releases: Release[];
  actorName: (id: string | null | undefined) => string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inbox = useChangeRequests();
  const [dismissing, setDismissing] = useState<string | null>(null);
  // Where focus goes back to when the dismiss form closes: the row's Dismiss button, or the
  // row's name once the dismissal removed that button.
  const prefix = useId();
  const target = (itemId: string, what: "row" | "dismiss") => `${prefix}-${what}-${itemId}`;
  const closeDismissal = (itemId: string, dismissed: boolean) => {
    setDismissing(null);
    requestAnimationFrame(() => document.getElementById(target(itemId, dismissed ? "row" : "dismiss"))?.focus());
  };
  const draft = releases.find((release) => release.status === "draft");
  const named = (releaseId: string | null | undefined) => releases.find((release) => release.id === releaseId);
  const read = useMutation({
    mutationFn: (changeRequestId: string) => api.readChangeRequest(changeRequestId),
    onSuccess: (reading) => {
      void queryClient.invalidateQueries({ queryKey: ["architecture"] });
      const asked = reading.run.candidate_count;
      const what = reading.change_request.delivery || reading.change_request.draft ? "suggestion" : "suggested question";
      navigate(`/architecture/versions/${encodeURIComponent(reading.release.id)}/decide`, {
        state: {
          notice: `${reading.change_request.id} is read into ${
            reading.release.name === reading.change_request.id ? "a new draft named after it" : `‘${reading.release.name || "the draft"}’`
          }: ${count(asked, what)}${asked ? " below" : ""}.`,
        },
      });
    },
  });
  const waiting = (inbox.data ?? []).filter((item) => item.status === "waiting").length;
  // A drafted offering names systems and its nearest offering by id: named as the catalogue names them.
  const names = new Map<string, string>();
  for (const release of releases) {
    for (const system of release.systems) names.set(system.id, system.name);
    for (const offering of release.products ?? []) names.set(offering.id, offering.name);
  }
  const nameOf = (catalogueId: string) => names.get(catalogueId) ?? catalogueId;

  const columns: Column<ChangeRequest>[] = [
    {
      id: "request",
      header: "Change request",
      rowHeader: true,
      width: "34%",
      cell: (item) => {
        const offerings = offeringsNamed(item);
        return (
          <>
            <span id={target(item.id, "row")} className="offering-id" tabIndex={-1}>{item.id}</span>{" "}
            <span dir="auto">{item.title}</span>
            <span className="cat-detail">
              {item.delivery ? "Epic closed: " : ""}
              {count(item.features.length, item.delivery ? "delivered Feature" : "approved feature")}
              {offerings.length > 0 && <> for <bdi>{offerings.join(", ")}</bdi></>} · received {formatDay(item.received_at)}
            </span>
          </>
        );
      },
    },
    {
      id: "from",
      header: "From Requirement AI",
      cell: (item) => (
        <>
          <span dir="auto">{traceLine(item.trace)}</span>
          {item.delivery ? (
            <DeliveryFacts item={item} delivery={item.delivery} />
          ) : (
            <>
              <Features item={item} />
              {item.draft && draftLines(item.draft, nameOf, nameOf).map((line) => <p key={line} className="cat-detail" dir="auto">{line}</p>)}
            </>
          )}
        </>
      ),
    },
    {
      id: "state",
      header: "State",
      width: "30%",
      cell: (item) => {
        if (item.status === "dismissed") {
          return (
            <>
              <Status tone={STATE_TONE.dismissed}>Dismissed</Status>
              <span className="cat-detail">
                by {actorName(item.dismissed_by)} on {formatDay(item.dismissed_at)}: <span dir="auto">{item.dismissal_reason}</span>
              </span>
            </>
          );
        }
        const into = named(item.read_into);
        const stillOpen = into?.status === "draft";
        // A request read into a draft still in preparation is settled there; it is dismissed
        // only while waiting, or once that draft is gone.
        const dismissable = item.status === "waiting" || (item.status === "read" && !stillOpen);
        const reading = read.isPending && read.variables === item.id;
        return (
          <>
            <Status tone={STATE_TONE[item.status]}>{item.status === "waiting" ? "Waiting" : `Read into ‘${into?.name || "a draft"}’`}</Status>
            {item.status === "read" && (
              <span className="cat-detail">
                by {actorName(item.read_by)} on {formatDay(item.read_at)}
                {!stillOpen && "; that draft is no longer in preparation"}
              </span>
            )}
            {read.isError && read.variables === item.id && <p role="alert"><Status tone="attention">{errorMessage(read.error)}</Status></p>}
            {dismissing === item.id ? (
              <Dismissal item={item} onDone={(dismissed) => closeDismissal(item.id, dismissed)} />
            ) : (
              <div className="cat-cell-actions">
                <ActionGroup label={`What to do with ${item.id}`}>
                  {item.status === "read" && stillOpen ? (
                    <Link className="ds-button ds-button--quiet" to={`/architecture/versions/${encodeURIComponent(into.id)}/decide`}>
                      <span>
                        Its suggestions <span aria-hidden="true">→</span>
                        <span className="ds-visually-hidden"> ({item.id})</span>
                      </span>
                    </Link>
                  ) : (
                    <Button variant="quiet" busy={reading} onClick={() => !read.isPending && read.mutate(item.id)}>
                      {reading
                        ? "Reading…"
                        : item.status === "read"
                          ? "Read it again"
                          : draft
                            ? <>Read it into ‘<bdi>{draft.name || "the draft"}</bdi>’</>
                            : "Read it into a new draft"}
                      <span className="ds-visually-hidden"> ({item.id})</span>
                    </Button>
                  )}
                  {dismissable && (
                    <Button id={target(item.id, "dismiss")} variant="quiet" onClick={() => setDismissing(item.id)}>
                      Dismiss it<span className="ds-visually-hidden"> ({item.id})</span>
                    </Button>
                  )}
                </ActionGroup>
              </div>
            )}
          </>
        );
      },
    },
  ];

  return (
    <Section
      title={<>Change requests from Requirement AI{waiting > 0 && <>{" "}<span className="ds-section__count">{waiting} waiting</span></>}</>}
    >
      <p className="cat-lead">
        Requirement AI sends a requirement’s approved backlog here once it is approved, and what its Epic delivered once the Epic is
        closed. Reading one into the draft turns it into suggestions: questions for the offerings it names, a drafted offering and
        journey, or the capabilities delivered. Nothing reaches the catalogue until it is accepted.
      </p>
      {inbox.isPending ? (
        <Skeleton label="Reading the change requests" rows={3} />
      ) : inbox.isError ? (
        <p role="alert">
          <Status tone="attention">{errorMessage(inbox.error)}</Status>{" "}
          <Button variant="quiet" onClick={() => void inbox.refetch()}>Try again</Button>
        </p>
      ) : (
        <DataTable
          caption="Change requests from Requirement AI, newest first"
          captionHidden
          columns={columns}
          rows={inbox.data}
          rowId={(item) => item.id}
          emptyText="No change request has come from Requirement AI yet."
        />
      )}
    </Section>
  );
}

/** Dismissing in place: a reason, then the choice. A dismissal stays. */
function Dismissal({ item, onDone }: { item: ChangeRequest; onDone: (dismissed: boolean) => void }) {
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
    <form className="cat-dismiss" aria-label={`Dismiss ${item.id}`} onSubmit={submit}>
      <TextField
        label="Why it is dismissed"
        hint="A dismissal stays: the change request cannot be read afterwards."
        value={reason}
        // Opened by its own button, the field is where the person goes next.
        autoFocus
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone(false);
        }}
      />
      {dismiss.isError && <p role="alert"><Status tone="attention">{errorMessage(dismiss.error)}</Status></p>}
      <ActionGroup>
        <Button type="submit" busy={dismiss.isPending} unavailableReason={reason.trim() ? null : "Give a reason first."}>
          {dismiss.isPending ? "Dismissing…" : "Dismiss it"}
        </Button>
        <Button variant="quiet" onClick={() => onDone(false)}>Keep it</Button>
      </ActionGroup>
    </form>
  );
}
