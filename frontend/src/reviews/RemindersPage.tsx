import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, type ConfirmReview, type Reminder } from "../api/client";
import { errorMessage } from "../api/errors";
import { useAuth } from "../auth/authContext";
import { count, formatDay } from "../home/format";
import { ConfirmReviewForm } from "./ConfirmReviewForm";
import { REVIEW_READS, REVIEW_RANK, cycleDays, dueWords, sameMoment } from "./review";
import { MAINTAINER, tally, useConfirmSystems, useReminders, useSystemStandings } from "./useReviews";

const href = (item: Reminder) =>
  item.kind === "document"
    ? `/library/${encodeURIComponent(item.id)}`
    : `/architecture/systems/${encodeURIComponent(item.id)}`;

/** How many names a bulk confirmation spells out before "and N more". */
const NAMED = 12;

/** Systems that fall due on the same day, from the same kind of last review: one group head. */
type Group = { key: string; overdue: boolean; dueAt: string; fromPublication: boolean; items: Reminder[] };

function groups(items: Reminder[], publishedAt: string | null | undefined): Group[] {
  const byKey = new Map<string, Group>();
  for (const item of items) {
    const fromPublication = sameMoment(item.standing.last_reviewed_at, publishedAt);
    const overdue = item.standing.state === "overdue";
    const key = `${overdue}|${formatDay(item.standing.due_at)}|${fromPublication}`;
    const group = byKey.get(key) ?? { key, overdue, dueAt: item.standing.due_at, fromPublication, items: [] };
    group.items.push(item);
    byKey.set(key, group);
  }
  // The service already orders overdue first, then by due date; groups keep that order.
  return [...byKey.values()];
}

/** "ADFS, BSCS, CNS and 20 more". */
function named(items: Reminder[]): string {
  const names = items.slice(0, NAMED).map((item) => item.title);
  const rest = items.length - names.length;
  if (rest > 0) return `${names.join(", ")} and ${rest} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
}

/**
 * The signed-in person's reminders (Knowledge Center D): the library documents they own and,
 * for a catalogue maintainer, the systems in service, that are overdue or due within two weeks.
 * Each is confirmed in place; nothing here takes knowledge out of use.
 */
export function RemindersPage() {
  const reminders = useReminders();
  const maintainer = useAuth()?.actor?.roles?.includes(MAINTAINER) ?? false;
  const active = useQuery({ queryKey: ["architecture", "active"], queryFn: api.activeRelease });
  // Someone who is not a maintainer is still told what the maintainers have due.
  const standings = useSystemStandings(!maintainer);
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
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
  const publishedAt = active.data?.published_at;

  const open = (key: string) => {
    confirmDocument.reset();
    confirmSystems.reset();
    setOutcome("");
    setActing(key);
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

  const trigger = (key: string, label: string, name: string) => (
    <button
      ref={(node) => { triggers.current[key] = node; }}
      type="button"
      className="text-button knowledge__act"
      aria-expanded={acting === key}
      aria-label={`${label.replace(/…$/, "")}: ${name}`}
      onClick={() => (acting === key ? cancel() : open(key))}
    >
      {label}
    </button>
  );
  const form = (item: Reminder) => (
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
  );

  const cycle = items[0] ? cycleDays(items[0].standing) : null;
  const edition = reminders.data
    ? items.length === 0
      ? "Nothing you answer for falls due in the next two weeks."
      : `${tally(reminders.data)}, of what you answer for.${cycle ? ` Each is re-confirmed every ${cycle} days. It stays in use meanwhile; once overdue, requirement work flags citations of it.` : ""}`
    : reminders.isError ? "Your reminders could not be read." : "Reading your reminders…";

  const lastConfirmed = (item: Reminder) => `${item.standing.reviewer.display_name}, ${formatDay(item.standing.last_reviewed_at)}`;

  const documentTable = (
    <table className="govtable review__table">
      <caption className="visually-hidden">Library documents you own that are due for re-confirmation</caption>
      <thead>
        <tr>
          <th scope="col">Document</th>
          <th scope="col" className="cell--end cell--p2">Falls due</th>
          <th scope="col" className="cell--end cell--p2">Last confirmed</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((item) => {
          const key = keyOf(item);
          return (
            <Fragment key={key}>
              <tr className={`row row--${REVIEW_RANK[item.standing.state]}${acting === key ? " is-acting" : ""}`}>
                <th scope="row">
                  <Link to={href(item)} dir="auto">{item.title}</Link>
                  <span className="secondary govtable__by review__by">
                    {/* On phones both columns leave the grid; they stay with the name. */}
                    <span className="review__narrow">
                      <span className="status">{dueWords(item.standing)}</span> · last confirmed {lastConfirmed(item)}
                      <br />
                    </span>
                    {trigger(key, "Confirm it is still right…", item.title)}
                  </span>
                </th>
                <td className="cell--end cell--p2"><span className="status review__due">{dueWords(item.standing)}</span></td>
                <td className="cell--end cell--p2">{lastConfirmed(item)}</td>
              </tr>
              {acting === key && (
                <tr className="knowledge__act-row">
                  <td colSpan={3}>{form(item)}</td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  const systemGroup = (group: Group) => {
    const bulkKey = `group:${group.key}`;
    const date = formatDay(group.dueAt);
    const head: ReactNode = (
      <>
        <span className={group.overdue ? "review__group-due status" : "review__group-due"}>
          {group.overdue ? `Fell due ${date}` : `Falls due ${date}`}
        </span>
        {group.fromPublication && <> · never confirmed since its publication on {formatDay(group.items[0]?.standing.last_reviewed_at)}</>}
        {" "}· {count(group.items.length, "system")}
      </>
    );
    return (
      <div key={group.key} className={`review__group review__group--${group.overdue ? "overdue" : "due"}`}>
        <h3 className="review__group-head">{head}</h3>
        <ul className="review__list">
          {group.items.map((item) => {
            const key = keyOf(item);
            return (
              <li key={key} className={acting === key ? "review__item is-acting" : "review__item"}>
                <p className="review__item-line">
                  <Link to={href(item)} dir="auto">{item.title}</Link>
                  {!group.fromPublication && (
                    <span className="secondary"> · last confirmed by {item.standing.reviewer.display_name}</span>
                  )}
                  {" "}
                  <span className="review__act secondary">
                    <span aria-hidden="true">· </span>
                    {trigger(key, "Confirm it is still right…", item.title)}
                  </span>
                </p>
                {acting === key && form(item)}
              </li>
            );
          })}
        </ul>
        {group.items.length > 1 && (
          <div className="review__bulk">
            <p className="review__item-line">
              {trigger(bulkKey, `Confirm these ${count(group.items.length, "system")} together…`, date)}
            </p>
            {acting === bulkKey && (
              <ConfirmReviewForm
                title={<>Confirm {count(group.items.length, "system")} still right</>}
                lead="One confirmation for each of them, with your note. Their sheets stay as they are, and each starts its review cycle again."
                detail={<p className="review__named" dir="auto">{named(group.items)}.</p>}
                onBehalf={null}
                noteRequired
                commit={`Confirm ${count(group.items.length, "system")}`}
                busy={busy}
                error={failure ? errorMessage(failure) : null}
                onSubmit={(body) => confirmSystems.mutate({ systemIds: group.items.map((item) => item.id), body }, {
                  onSuccess: (result) => confirmed(`Confirmed ${count(result.length, "system")}. They fall due again on ${formatDay(result[0]?.standing.due_at)}.`),
                })}
                onCancel={cancel}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const othersDue = (standings.data ?? []).filter((item) => item.standing.state !== "current");
  const othersOverdue = othersDue.filter((item) => item.standing.state === "overdue").length;

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
            {documents.length > 0 ? documentTable : (
              <p className="timetable__quiet">None of the documents you own falls due in the next two weeks.</p>
            )}
          </section>
          <section className="govsection" aria-labelledby="reminders-systems">
            <h2 id="reminders-systems" className="govsection__title">
              Catalogue systems in service
              {maintainer && systems.length > 0 && <span className="govsection__count"> · {systems.length}</span>}
            </h2>
            {maintainer ? (
              <>
                <p className="govsection__lead">
                  Every catalogue maintainer is reminded of every system, and any of you may confirm one.
                </p>
                {systems.length > 0
                  ? groups(systems, publishedAt).map(systemGroup)
                  : <p className="timetable__quiet">No system in service falls due in the next two weeks.</p>}
              </>
            ) : (
              <p className="govsection__lead">
                {othersDue.length > 0 ? (
                  <>
                    {count(othersDue.length, "system")} {othersDue.length === 1 ? "is" : "are"} due for re-confirmation
                    {othersOverdue > 0 ? `, ${othersOverdue} of them overdue` : ""}. Catalogue maintainers confirm them;
                    you can confirm one for them from its sheet in the <Link to="/architecture">architecture catalogue</Link>.
                  </>
                ) : standings.isPending ? "Reading the catalogue’s reviews…" : "No system in service falls due in the next two weeks."}
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
