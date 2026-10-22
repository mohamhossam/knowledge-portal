import type { LibraryDocument, LibraryVersion } from "../../api/client";
import { ApiError, errorMessage } from "../../api/errors";
import { ConsequencePanel, Lines } from "../../design/components";
import type { useDisclosure } from "../../design/hooks";
import type { DocumentContext } from "../documentContext";
import type { latestRevision, livePublication, Row } from "../model";
import { CitingNow } from "../StandingPanel";
import { humanWhere, plural } from "../where";
import { PassageText } from "./PassageText";

/*
 * The panels that open in the desk's pane in place of the passage: excluding the selected
 * passages, saving the review, publishing it. Each builds the panel itself rather than being a
 * component around it, so a panel opened over another (publish over save, exclude over publish)
 * updates the open one in place instead of mounting anew and taking focus again.
 */

type Disclosure = ReturnType<typeof useDisclosure>;
type Hook = DocumentContext["hook"];

const changeFailure = (error: unknown, verb: string) =>
  error instanceof ApiError && error.status === 409 ? `The document changed while you were deciding. Reload it, then ${verb} again.` : errorMessage(error);

const summaryField = (value: string, onChange: (value: string) => void) =>
  ({ label: "Review summary", hint: "What you checked, and what you changed. The document's reviewers see it.", value, onChange, maxLength: 2000 });

/** Bulk exclude with one reason. */
export function excludePanel({ disclosure, rows, selected, headings, onConfirm }: {
  disclosure: Disclosure;
  rows: Row[];
  selected: Set<string>;
  headings: Map<string, Map<string, string>>;
  onConfirm: (reason: string) => void;
}) {
  return (
    <ConsequencePanel
      panelRef={disclosure.panel}
      title={`Exclude ${plural(selected.size, "passage")}`}
      happens="They won't be published with this version."
      affects={
        <Lines label="Passages to exclude">
          {rows.filter((row) => selected.has(row.key)).slice(0, 8).map((row) => (
            <li key={row.key}>{humanWhere(row.where)}: <span className="lib-oneline"><PassageText row={row} headings={headings} /></span></li>
          ))}
          {selected.size > 8 && <li>and {(selected.size - 8).toLocaleString("en")} more</li>}
        </Lines>
      }
      reversibility="You can include them again before you save."
      reason={{ label: "Why exclude them?", hint: "One reason for all of them. The document's reviewers see it." }}
      confirmLabel={`Exclude ${plural(selected.size, "passage")}`}
      keepLabel="Cancel"
      onConfirm={onConfirm}
      onKeep={disclosure.close}
    />
  );
}

/** The summary, asked for when a save needs one. */
export function saveReviewPanel({ disclosure, hook, decided, versionNumber, summary, onSummaryChange, onConfirm }: {
  disclosure: Disclosure;
  hook: Hook;
  decided: number;
  versionNumber: number;
  summary: string;
  onSummaryChange: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <ConsequencePanel
      panelRef={disclosure.panel}
      title="Save your review"
      happens={<>Your decisions on {plural(decided, "passage")} are kept with version {versionNumber}, with what you write here.</>}
      reversibility="Nothing is published until you approve it. You can change your decisions and save again."
      reason={summaryField(summary, onSummaryChange)}
      confirmLabel="Save review"
      keepLabel="Not yet"
      busy={hook.review.isPending}
      busyLabel="Saving…"
      failure={hook.review.isError ? changeFailure(hook.review.error, "save") : null}
      onConfirm={onConfirm}
      onKeep={disclosure.close}
    />
  );
}

/** Approval, with the review's coverage: how many passages, and flagged ones, were looked at. */
export function publishPanel({ disclosure, hook, document, version, included, live, liveNumber, passages, seenCount, flagged, flaggedSeen, unsavedReview, revision, dirty, summary, onSummaryChange, onConfirm }: {
  disclosure: Disclosure;
  hook: Hook;
  document: LibraryDocument;
  version: LibraryVersion;
  included: number;
  live: ReturnType<typeof livePublication>;
  liveNumber: number | undefined;
  passages: number;
  seenCount: number;
  flagged: number;
  flaggedSeen: number;
  unsavedReview: boolean;
  revision: ReturnType<typeof latestRevision>;
  dirty: number;
  summary: string;
  onSummaryChange: (value: string) => void;
  onConfirm: (summary: string) => Promise<void>;
}) {
  const behalf = !document.is_owner;
  return (
    <ConsequencePanel
      panelRef={disclosure.panel}
      title={`Publish version ${version.number}`}
      happens={<>Requirement work can cite its <strong>{plural(included, "passage")}</strong> once they are indexed.</>}
      affects={
        <>
          {live ? (
            <CitingNow
              documentId={document.id}
              list={false}
              lead={(count, one, none) => <>It replaces version {liveNumber ?? "?"} in service, which <strong className="ds-num">{count}</strong> {one ? "requirement" : "requirements"} you can see {one ? "cites" : "cite"}{none ? "" : ". Their owners are told the source changed"}</>}
            />
          ) : (
            <p>Nothing of it is in service yet.</p>
          )}
          <p>
            You looked at {seenCount.toLocaleString("en")} of {plural(passages, "passage")}
            {flagged > 0 ? `, and ${flaggedSeen.toLocaleString("en")} of the ${flagged.toLocaleString("en")} flagged.` : "."}
            {" "}It is kept with the approval.
          </p>
          {unsavedReview && revision && dirty > 0 && <p>Your {plural(dirty, "unsaved change")} {dirty === 1 ? "is" : "are"} saved with it.</p>}
        </>
      }
      reason={summaryField(summary, onSummaryChange)}
      reversibility="You can withdraw it later; withdrawing tells the requirements that cite it."
      confirmLabel={behalf ? `Publish version ${version.number} on ${document.owner.display_name}'s behalf` : `Publish version ${version.number}`}
      keepLabel="Not yet"
      busy={hook.review.isPending || hook.approve.isPending}
      busyLabel={hook.review.isPending ? "Saving your review…" : "Publishing…"}
      failure={hook.review.isError ? `Not saved, so not published: ${changeFailure(hook.review.error, "publish")}` : hook.approve.isError ? changeFailure(hook.approve.error, "publish") : null}
      onConfirm={(text) => void onConfirm(text)}
      onKeep={disclosure.close}
    />
  );
}
