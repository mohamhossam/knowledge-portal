import { type ReactNode, type RefObject } from "react";

import type { LibraryDocument } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { Button, ConsequencePanel, Lines, Status } from "../design/components";
import { formatDay } from "../home/format";
import { returnBlocker, useCiting } from "./citing";
import { latestRevision, newestVersion, standing } from "./model";
import { Content } from "./parts";
import type { useDocument } from "./useDocument";

type Hook = ReturnType<typeof useDocument>;

/**
 * Who cites it now, among the requirements the person can see: a count, or that the count is
 * unknown (never "0" when Requirement AI didn't answer, §11). `lead` writes the sentence;
 * `none` says nobody they can see cites it.
 */
export function CitingNow({ documentId, lead, list = true }: { documentId: string; lead?: (count: string, one: boolean, none: boolean) => ReactNode; list?: boolean }) {
  const citing = useCiting(documentId);
  if (citing.isPending) return <p><Status tone="working">Asking Requirement AI who cites it…</Status></p>;
  if (citing.isError) {
    return (
      <p>
        <Status tone="attention">Couldn't ask Requirement AI who cites it. The count is unknown, not zero.</Status>{" "}
        <Button variant="link" onClick={() => void citing.refetch()}>Ask again</Button>
      </p>
    );
  }
  const items = citing.data.items;
  const more = Boolean(citing.data.next_offset);
  const count = `${items.length}${more ? "+" : ""}`;
  const one = items.length === 1 && !more;
  const none = items.length === 0 && !more;
  return (
    <>
      <p>{lead ? lead(count, one, none) : <><strong className="ds-num">{count}</strong> {one ? "requirement" : "requirements"} you can see {one ? "cites" : "cite"} it now</>}.</p>
      {list && items.length > 0 && (
        <Lines label="Requirements that cite it">
          {items.slice(0, 5).map((item) => <li key={item.proposal_id}><Content text={item.requirement_title} /></li>)}
          {(items.length > 5 || more) && <li>and {more ? "more" : `${items.length - 5} more`}, listed under Cited by</li>}
        </Lines>
      )}
    </>
  );
}

function failureOf(error: unknown): string {
  return error instanceof ApiError && error.status === 409
    ? "The document changed while you were deciding. Reload it to see the change; your reason stays here."
    : errorMessage(error);
}

/**
 * Withdraw, or return to service, through a consequence panel in place (§5),
 * with who cites it first (§11). Returning publishes the last approved review
 * again: the service's approval is what makes a withdrawn document citable.
 */
export function StandingPanel({ document, hook, dirty, panelRef, onDone, onKeep }: {
  document: LibraryDocument;
  hook: Hook;
  dirty: number;
  panelRef: RefObject<HTMLElement | null>;
  onDone: (text: string) => void;
  onKeep: () => void;
}) {
  const stand = standing(document);
  const owner = document.owner.display_name;
  const behalf = !document.is_owner;

  if (stand.kind === "withdrawn") {
    const version = newestVersion(document);
    const revision = latestRevision(version);
    const blocker = returnBlocker(document, dirty);
    const withdrawal = stand.publication;
    return (
      <ConsequencePanel
        panelRef={panelRef}
        title={<>Return '<bdi>{document.title}</bdi>' to service</>}
        happens={
          <>
            The review of version {version?.number ?? "?"} that was last published is published again, as a new approval in your name
            {behalf ? <>, on <bdi>{owner}</bdi>'s behalf</> : null}. Requirement work can cite it once it is indexed.
          </>
        }
        affects={
          <>
            <p>
              It was withdrawn on {formatDay(withdrawal.withdrawn_at)} by <bdi>{withdrawal.withdrawn_by?.display_name ?? "—"}</bdi>
              {withdrawal.withdrawal_reason ? <>: <q dir="auto">{withdrawal.withdrawal_reason}</q></> : "."}
            </p>
            <p>The service records no reason for a return; the withdrawal and its reason stay in Versions.</p>
          </>
        }
        reversibility="You can withdraw it again later from this page."
        confirmLabel={behalf ? <>Return it to service on <bdi>{owner}</bdi>'s behalf</> : "Return to service"}
        busyLabel="Returning it…"
        keepLabel="Keep it withdrawn"
        busy={hook.approve.isPending}
        failure={hook.approve.isError ? failureOf(hook.approve.error) : blocker}
        onConfirm={() => {
          if (!version || !revision || blocker) return;
          hook.approve.mutate(
            { versionId: version.id, revisionId: revision.id },
            { onSuccess: () => onDone("Back in service. Requirement work can cite it again once it is indexed; Jobs shows the indexing.") },
          );
        }}
        onKeep={onKeep}
      />
    );
  }

  return (
    <ConsequencePanel
      tone="danger"
      panelRef={panelRef}
      title={<>Withdraw '<bdi>{document.title}</bdi>'</>}
      happens="Requirement work can no longer cite this document. Every version of it leaves search at once."
      affects={
        <CitingNow
          documentId={document.id}
          lead={(count, one, none) => (
            <>
              <strong className="ds-num">{count}</strong> {one ? "requirement" : "requirements"} you can see {one ? "cites" : "cite"} it now
              {none ? "" : ". Their owners are told the source changed, and decide in Requirement AI whether to keep or revise what they wrote"}
            </>
          )}
        />
      }
      reversibility="You can return it to service later from this page."
      reason={{ label: "Why is it no longer safe to rely on?", hint: behalf ? `The requirement owners and ${owner} see this, with your name.` : "The requirement owners see this." }}
      confirmLabel={behalf ? <>Withdraw it on <bdi>{owner}</bdi>'s behalf</> : <>Withdraw '<bdi>{document.title}</bdi>'</>}
      busyLabel="Withdrawing…"
      keepLabel="Keep it in service"
      busy={hook.withdraw.isPending}
      failure={hook.withdraw.isError ? failureOf(hook.withdraw.error) : null}
      onConfirm={(reason) => hook.withdraw.mutate(reason, { onSuccess: () => onDone("Withdrawn. Requirement work can no longer cite it.") })}
      onKeep={onKeep}
    />
  );
}
