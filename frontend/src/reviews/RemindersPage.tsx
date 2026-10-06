import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RotateCw } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, type ConfirmReview, type Reminder } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { count, formatDay } from "../home/format";
import { ConfirmReviewForm } from "./ConfirmReviewForm";
import { REVIEW_READS, REVIEW_RANK, cycleDays, dueWords, sameMoment } from "./review";
import { MAINTAINER, tally, useConfirmSystems, useReminders } from "./useReviews";

const href = (item: Reminder) =>
  item.kind === "document"
    ? `/library/${encodeURIComponent(item.id)}`
    : `/architecture/systems/${encodeURIComponent(item.id)}`;

/**
 * The signed-in person's reminders (Knowledge Center D): the library documents they own and,
 * for a catalogue maintainer, the systems in service, that are overdue or due within two weeks.
 * Each is confirmed in place; nothing here takes knowledge out of use.
 */
export function RemindersPage() {
  const reminders = useReminders();
  const maintainer = useAuth()?.actor?.roles?.includes(MAINTAINER) ?? false;
  const active = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease, enabled: maintainer });
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [outcome, setOutcome] = useState("");
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const bulkTrigger = useRef<HTMLButtonElement>(null);
  const outcomeLine = useRef<HTMLParagraphElement>(null);
  const refresh = () => Promise.all(REVIEW_READS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const confirmDocument = useMutation({
    mutationFn: ({ item, body }: { item: Reminder; body: ConfirmReview }) => api.confirmDocumentReview(item.id, body),
    onSuccess: () => refresh(),
  });
  const confirmSystems = useConfirmSystems();

  useEffect(() => {
    window.document.title = "Due for review · Knowledge portal";
  }, []);

  const items = reminders.data?.items ?? [];
  const documents = items.filter((item) => item.kind === "document");
  const systems = items.filter((item) => item.kind === "system");
  const keyOf = (item: Reminder) => `${item.kind}:${item.id}`;
  const busy = confirmDocument.isPending || confirmSystems.isPending;
  const failure = confirmDocument.error ?? confirmSystems.error;

  const settle = () => {
    confirmDocument.reset();
    confirmSystems.reset();
    setOutcome("");
  };
  const open = (item: Reminder) => {
    settle();
    setBulk(false);
    setActing(keyOf(item));
  };
  const cancel = () => {
    const key = acting;
    setActing(null);
    if (key) triggers.current[key]?.focus();
  };
  // A confirmed row leaves the list, so focus goes to what it came to.
  const confirmed = (text: string) => {
    setOutcome(text);
    setActing(null);
    setBulk(false);
    window.requestAnimationFrame(() => outcomeLine.current?.focus());
  };
  const confirm = (item: Reminder, body: ConfirmReview) => {
    if (item.kind === "document") {
      confirmDocument.mutate({ item, body }, {
        onSuccess: (document) => confirmed(`Confirmed ‘${item.title}’. It falls due again on ${formatDay(document.review?.due_at)}.`),
      });
    } else {
      confirmSystems.mutate({ systemIds: [item.id], body }, {
        onSuccess: (result) => confirmed(`Confirmed ${item.title}. It falls due again on ${formatDay(result[0]?.standing.due_at)}.`),
      });
    }
  };

  const cycle = items[0] ? cycleDays(items[0].standing) : null;
  const edition = reminders.data
    ? items.length === 0
      ? "Nothing you answer for falls due in the next two weeks."
      : `${tally(reminders.data)}, of what you answer for.${cycle ? ` Each is confirmed again every ${cycle} days; until then it stays in use, flagged where it is cited.` : ""}`
    : reminders.isError ? "Your reminders could not be read." : "Reading your reminders…";

  const table = (rows: Reminder[], noun: string, caption: string) => (
    <table className="govtable review__table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{noun}</th>
          <th scope="col" className="cell--end">Falls due</th>
          <th scope="col" className="cell--p2">Last confirmed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => {
          const key = keyOf(item);
          const isOpen = acting === key;
          const fromPublication = item.kind === "system" && sameMoment(item.standing.last_reviewed_at, active.data?.published_at);
          const last = fromPublication
            ? `Never; published ${formatDay(item.standing.last_reviewed_at)}`
            : `${item.standing.reviewer.display_name}, ${formatDay(item.standing.last_reviewed_at)}`;
          return (
            <Fragment key={key}>
              <tr className={`row row--${REVIEW_RANK[item.standing.state]}${isOpen ? " is-acting" : ""}`}>
                <th scope="row">
                  <Link to={href(item)} dir="auto">{item.title}</Link>
                  <span className="secondary govtable__by">
                    {/* On phones Last confirmed leaves the grid; it stays with the name. */}
                    <span className="review__narrow">Last confirmed: {last}<span aria-hidden="true"> · </span></span>
                    <button
                      ref={(node) => { triggers.current[key] = node; }}
                      type="button"
                      className="text-button knowledge__act"
                      aria-expanded={isOpen}
                      aria-label={`Confirm it is still right: ${item.title}`}
                      onClick={() => (isOpen ? cancel() : open(item))}
                    >
                      Confirm it is still right…
                    </button>
                  </span>
                </th>
                <td className="cell--end"><span className="status">{dueWords(item.standing)}</span></td>
                <td className="cell--p2">{last}</td>
              </tr>
              {isOpen && (
                <tr className="knowledge__act-row">
                  <td colSpan={3}>
                    <ConfirmReviewForm
                      title={<>Confirm <span dir="auto">{item.kind === "document" ? `‘${item.title}’` : item.title}</span> is still right</>}
                      lead={item.kind === "document"
                        ? "Its version in service stays as it is. Confirming starts its review cycle again, and requirement work stops flagging citations of it as overdue."
                        : "Its sheet in the version in service stays as it is. Confirming starts its review cycle again for every catalogue maintainer."}
                      onBehalf={null}
                      commit="Confirm it"
                      busy={busy}
                      error={failure ? errorMessage(failure) : null}
                      onSubmit={(body) => confirm(item, body)}
                      onCancel={cancel}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <section className="docpage reminders" aria-labelledby="reminders-title">
      <header className="docpage__head">
        <p className="docpage__number" aria-hidden="true" />
        <div className="docpage__heading">
          <h1 id="reminders-title" className="docpage__title">Due for review</h1>
          <p className="docpage__edition">{edition}</p>
        </div>
      </header>
      <p ref={outcomeLine} tabIndex={-1} className="toolbar__notice" role="status">{outcome}</p>

      {reminders.isError ? (
        <p className="docpage__failure" role="alert">
          The knowledge service did not answer: {errorMessage(reminders.error)}
          <button type="button" className="text-button" onClick={() => void reminders.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      ) : reminders.isPending ? null : (
        <>
          <section className="govsection" aria-labelledby="reminders-documents">
            <h2 id="reminders-documents" className="govsection__title">
              Your library documents
              {documents.length > 0 && <span className="govsection__count"> · {documents.length}</span>}
            </h2>
            {documents.length > 0 ? (
              table(documents, "Document", "Library documents you own that are due for review")
            ) : (
              <p className="timetable__quiet">None of the documents you own falls due in the next two weeks.</p>
            )}
          </section>
          {maintainer && (
            <section className="govsection" aria-labelledby="reminders-systems">
              <h2 id="reminders-systems" className="govsection__title">
                Catalogue systems in service
                {systems.length > 0 && <span className="govsection__count"> · {systems.length}</span>}
              </h2>
              <p className="govsection__lead">
                Every catalogue maintainer is reminded of every system, and any of you may confirm one.
              </p>
              {systems.length > 0 ? (
                <>
                  <p className="knowledge__bulk">
                    <button
                      ref={bulkTrigger}
                      type="button"
                      className="next-button"
                      aria-expanded={bulk}
                      onClick={() => {
                        settle();
                        setActing(null);
                        setBulk(!bulk);
                      }}
                    >
                      Confirm all {count(systems.length, "system")}
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </p>
                  {bulk && (
                    <ConfirmReviewForm
                      title={<>Confirm all {count(systems.length, "system")} still right</>}
                      lead="Only the systems listed here. Their sheets stay as they are; each starts its review cycle again, with one note for them all."
                      onBehalf={null}
                      commit={`Confirm ${count(systems.length, "system")}`}
                      busy={busy}
                      error={failure ? errorMessage(failure) : null}
                      onSubmit={(body) => confirmSystems.mutate({ systemIds: systems.map((item) => item.id), body }, {
                        onSuccess: (result) => confirmed(`Confirmed ${count(result.length, "system")}. They fall due again on ${formatDay(result[0]?.standing.due_at)}.`),
                      })}
                      onCancel={() => {
                        setBulk(false);
                        bulkTrigger.current?.focus();
                      }}
                    />
                  )}
                  {table(systems, "System", "Catalogue systems in service that are due for review")}
                </>
              ) : (
                <p className="timetable__quiet">No system in service falls due in the next two weeks.</p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}
