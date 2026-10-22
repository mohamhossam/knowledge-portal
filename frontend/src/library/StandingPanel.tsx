import { type RefObject } from "react";

import type { LibraryDocument } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { ConsequencePanel } from "../design/components";
import { formatDay } from "../home/format";
import { returnBlocker } from "./returning";
import { latestRevision, newestVersion, standing } from "./model";
import type { useDocument } from "./useDocument";

type Hook = ReturnType<typeof useDocument>;

function failureOf(error: unknown): string {
  return error instanceof ApiError && error.status === 409
    ? "The document changed while you were deciding. Reload it to see the change; your reason stays here."
    : errorMessage(error);
}

/**
 * Withdraw, or return to service, through a consequence panel in place (§5).
 * Returning publishes the last approved review again: the service's approval
 * is what makes a withdrawn document citable.
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
            {behalf ? <>, on <bdi>{owner}</bdi>'s behalf</> : null}. It can be cited once it is indexed.
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
            { onSuccess: () => onDone("Back in service. It can be cited again once it is indexed; Jobs shows the indexing.") },
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
      happens="Nothing can cite this document any more. Every version of it leaves search at once."
      reversibility="You can return it to service later from this page."
      reason={{ label: "Why is it no longer safe to rely on?", hint: behalf ? `${owner} sees this, with your name.` : "Kept with the document, in Versions." }}
      confirmLabel={behalf ? <>Withdraw it on <bdi>{owner}</bdi>'s behalf</> : <>Withdraw '<bdi>{document.title}</bdi>'</>}
      busyLabel="Withdrawing…"
      keepLabel="Keep it in service"
      busy={hook.withdraw.isPending}
      failure={hook.withdraw.isError ? failureOf(hook.withdraw.error) : null}
      onConfirm={(reason) => hook.withdraw.mutate(reason, { onSuccess: () => onDone("Withdrawn. It can no longer be cited.") })}
      onKeep={onKeep}
    />
  );
}
