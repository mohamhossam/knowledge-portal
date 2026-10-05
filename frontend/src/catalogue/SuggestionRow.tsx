import { useQuery } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Pencil, X } from "lucide-react";
import { type KeyboardEvent, type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";

import { api, type CatalogueDocument, type PossibleMatch, type Release, type Suggestion, type SuggestionContent } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { traceLine, useChangeRequests } from "./inbox";
import { SuggestionEditor } from "./SuggestionEditor";
import {
  type Lexicon, STATE_LABEL, STATE_RANK, changeSentence, decideWhy, offeringHolds, suggestionState, waitsFor, waitsForMany,
} from "./suggestions";

const TABLE_READER = "catalogue-table-reader";

export type RowFocus = { key: string; open: boolean; editing?: boolean };

type Props = {
  suggestion: Suggestion;
  release: Release;
  words: Lexicon;
  documents: Map<string, CatalogueDocument>;
  actorName: (id: string | null | undefined) => string;
  focus: RowFocus | null;
  focusable: boolean;
  busy: boolean;
  /** Edits made and not yet accepted; they outlive the editor until accepted or dropped. */
  kept: SuggestionContent | undefined;
  /** What the reading of its change request said of its feature. */
  notes?: string[];
  toggleRef: (element: HTMLButtonElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: (focus: RowFocus | null) => void;
  onClose: () => void;
  onKeep: (content: SuggestionContent | null) => void;
  onDecide: (accept: boolean, content?: SuggestionContent | null) => void;
};

/**
 * One suggestion: the change in words and its state; open, its source and the decision.
 * The change is a disclosure button, the row's one stop in the tab order, so its open state
 * reaches a screen reader (a plain table's row cannot carry `aria-expanded`).
 */
export function SuggestionRow({
  suggestion, release, words, documents, actorName, focus, focusable, busy, kept, notes, toggleRef, onKeyDown, onFocus, onClose, onKeep, onDecide,
}: Props) {
  const detailId = useId();
  const state = suggestionState(suggestion);
  const isFocused = focus?.key === suggestion.id;
  const open = isFocused && focus.open;
  const document = documents.get(suggestion.document_version_id);
  const citation = suggestion.citations[0];
  const relationship = suggestion.content.kind === "relationship";
  const reason = state === "decide" ? decideWhy(suggestion) : state === "waits" ? waitsFor(suggestion, words) : null;
  return (
    <>
      <tr
        className={`row suggestion row--${STATE_RANK[state]}${open ? " is-open" : ""}`}
        onClick={() => (open ? onClose() : onFocus({ key: suggestion.id, open: true }))}
      >
        <th scope="row" className="suggestion__change" dir="auto">
          <button
            ref={toggleRef}
            type="button"
            className="suggestion__toggle"
            tabIndex={focusable ? 0 : -1}
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
            aria-describedby={`${detailId}-state`}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (!isFocused) onFocus({ key: suggestion.id, open: false });
            }}
          >
            <span className="suggestion__sentence">{changeSentence(suggestion, words)}</span>
          </button>
          {relationship && suggestion.content.text && <span className="secondary govtable__by" dir="auto">For: {suggestion.content.text}</span>}
          <span className="secondary govtable__by suggestion__source" dir="ltr">
            {suggestion.change_request ? (
              <>
                <bdi>{suggestion.change_request.change_request_id}</bdi> · Feature {suggestion.change_request.feature_id} · from Requirement AI
              </>
            ) : (
              <>
                <bdi>{document?.title ?? "A document no longer in the draft"}</bdi>
                {citation && <> · {citation.location}</>}
                {suggestion.model === TABLE_READER && " · read from a table"}
              </>
            )}
          </span>
        </th>
        <td id={`${detailId}-state`} className="suggestion__state">
          <span className="status">{suggestion.status === "accepted" && suggestion.edited ? "Accepted with edits" : STATE_LABEL[state]}</span>
          {reason && <span className="secondary govtable__by">{reason}</span>}
          {kept && suggestion.status === "proposed" && <span className="secondary govtable__by">Edited, not accepted yet</span>}
          {suggestion.status === "proposed" && notes?.map((note) => <span key={note} className="suggestion__warning" dir="auto">{note}</span>)}
        </td>
      </tr>
      {open && (
        <tr id={detailId} className="suggestion-detail">
          <td colSpan={2}>
            <SuggestionDetail
              suggestion={suggestion}
              release={release}
              words={words}
              document={document}
              actorName={actorName}
              editing={focus.editing === true}
              busy={busy}
              kept={kept}
              notes={notes}
              onKeep={onKeep}
              onEdit={(editing) => onFocus({ key: suggestion.id, open: true, editing })}
              onClose={onClose}
              onDecide={onDecide}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function SuggestionDetail({ suggestion, release, words, document, actorName, editing, busy, kept, notes, onKeep, onEdit, onClose, onDecide }: {
  suggestion: Suggestion;
  release: Release;
  words: Lexicon;
  document?: CatalogueDocument;
  actorName: (id: string | null | undefined) => string;
  editing: boolean;
  busy: boolean;
  kept: SuggestionContent | undefined;
  notes?: string[];
  onKeep: (content: SuggestionContent | null) => void;
  onEdit: (editing: boolean) => void;
  onClose: () => void;
  onDecide: (accept: boolean, content?: SuggestionContent | null) => void;
}) {
  const id = useId();
  const state = suggestionState(suggestion);
  const proposed = suggestion.status === "proposed";
  const holds = suggestion.content.kind === "product" ? offeringHolds(suggestion.content.product, words) : [];
  // Leaving the editor hands focus back to the button that opened it, not to the row.
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  // Escape anywhere in the detail stops editing first, then closes it.
  const escape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    if (editing) onEdit(false);
    else onClose();
  };
  return (
    <div className="suggestion-detail__body" onKeyDown={escape}>
      <section className="suggestion-detail__source" aria-labelledby={`${id}-source`}>
        <h3 id={`${id}-source`} className="suggestion-detail__label">
          {suggestion.change_request ? "From the change request" : "From the document"}
        </h3>
        {suggestion.change_request ? (
          <ChangeRequestCitation suggestion={suggestion} notes={notes} />
        ) : suggestion.citations.length ? (
          suggestion.citations.map((citation, index) => (
            <Citation key={`${citation.location}:${index}`} release={release} document={document} location={citation.location} quote={citation.quote} />
          ))
        ) : (
          <p className="secondary">The suggestion cites no passage.</p>
        )}
        {holds.length > 0 && (
          <div className="suggestion-holds">
            <h4 className="suggestion-detail__label">What it holds</h4>
            <dl>
              {holds.map((line) => (
                <div key={line.label} className={line.due ? "suggestion-holds__line suggestion-holds__line--due" : "suggestion-holds__line"}>
                  <dt>{line.label}</dt>
                  <dd dir="auto">{line.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {suggestion.rationale && (
          <p className="suggestion-detail__rationale">
            <span className="suggestion-detail__label">Why it was inferred</span>
            <span dir="auto">{suggestion.rationale}</span>
          </p>
        )}
      </section>

      <section className="suggestion-detail__decision" aria-labelledby={editing ? undefined : `${id}-decision`} aria-label={editing ? "Decision" : undefined}>
        {!(proposed && editing) && (
          <h3 id={`${id}-decision`} className="suggestion-detail__label">
            {proposed ? "Decision" : `${suggestion.status === "accepted" ? "Accepted" : "Rejected"} by ${actorName(suggestion.decided_by)}`}
          </h3>
        )}
        {!proposed ? (
          <p className="secondary">
            {formatDay(suggestion.decided_at)}
            {suggestion.edited && ", with edits"}. A decision stays; correct the draft with the hand edits.
          </p>
        ) : editing ? (
          <SuggestionEditor
            suggestion={suggestion}
            release={release}
            words={words}
            busy={busy}
            kept={kept}
            onChange={onKeep}
            onAccept={(content) => onDecide(true, content)}
            onCancel={() => onEdit(false)}
          />
        ) : (
          <Decision
            suggestion={suggestion}
            state={state}
            words={words}
            busy={busy}
            kept={kept !== undefined}
            editButton={editButton}
            onEdit={() => onEdit(true)}
            onDrop={() => onKeep(null)}
            onDecide={onDecide}
          />
        )}
      </section>
    </div>
  );
}

/** The plain decision: possible matches first, then accept, edit or reject. */
function Decision({ suggestion, state, words, busy, kept, editButton, onEdit, onDrop, onDecide }: {
  suggestion: Suggestion;
  state: ReturnType<typeof suggestionState>;
  words: Lexicon;
  busy: boolean;
  kept: boolean;
  editButton: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDrop: () => void;
  onDecide: (accept: boolean, content?: SuggestionContent | null) => void;
}) {
  const id = useId();
  const roles = [...new Set(suggestion.possible_matches.map((item) => item.role))];
  const [choice, setChoice] = useState<Record<string, string>>({});
  const unchosen = roles.filter((role) => choice[role] === undefined);
  const content = linked(suggestion, choice);
  const waits = state === "waits";
  const why = unchosen.length
    ? "Say first whether the name means a system the draft has."
    : waits
      ? `${waitsFor(suggestion, words)}. Accept ${waitsForMany(suggestion, words) ? "those" : "that"} first, or ${kept ? "go back to your edits if they name" : "edit this to name"} what the draft has.`
      : null;
  return (
    <div className="decision">
      {/* Kept edits are said before the buttons, so Accept is never read as taking them. */}
      {kept && (
        <p className="decision__kept">
          You have edits not accepted yet. They are kept while this page stays open.
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              // The drop button goes; focus stays in the decision, on the edit button.
              editButton.current?.focus();
              onDrop();
            }}
          >
            Drop the edits
          </button>
        </p>
      )}
      {roles.map((role) => (
        <MatchChoices
          key={role}
          suggestion={suggestion}
          matches={suggestion.possible_matches.filter((item) => item.role === role)}
          value={choice[role]}
          onChange={(value) => setChoice((current) => ({ ...current, [role]: value }))}
        />
      ))}
      {state === "present" && <p className="secondary">The draft already says this. Rejecting it changes nothing.</p>}
      <p className="decision__actions">
        <button
          type="button"
          className="action-button"
          disabled={busy || !!why}
          aria-describedby={why ? `${id}-why` : undefined}
          onClick={() => onDecide(true, content)}
        >
          <Check size={16} aria-hidden="true" />
          {kept ? "Accept as the document said" : "Accept"}
        </button>
        <button ref={editButton} type="button" className="text-button" disabled={busy} onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" />
          {kept ? "Back to your edits" : "Edit, then accept"}
        </button>
        <button type="button" className="text-button" disabled={busy} onClick={() => onDecide(false)}>
          <X size={14} aria-hidden="true" />
          Reject
        </button>
      </p>
      {why && <p id={`${id}-why`} className="decision__why">{why}</p>}
    </div>
  );
}

const NEW = "__new__";

/** Possible matches as a choice: the system the draft has, or none of them. */
function MatchChoices({ suggestion, matches, value, onChange }: {
  suggestion: Suggestion;
  matches: PossibleMatch[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const writtenAs = matches[0]?.written_as ?? "";
  const isSystem = suggestion.content.kind === "system";
  return (
    <fieldset className="choices decision__matches">
      <legend className="field__label">Is “{writtenAs}” a system the draft already has?</legend>
      {matches.map((match) => (
        <label key={match.system_id} className="check" htmlFor={`${id}-${match.system_id}`}>
          <input
            id={`${id}-${match.system_id}`}
            type="radio"
            name={id}
            checked={value === match.system_id}
            onChange={() => onChange(match.system_id)}
          />
          <span>
            Yes, it is <strong dir="auto">{match.system_name}</strong>
            <span className="secondary"> · {match.reason}</span>
          </span>
        </label>
      ))}
      <label className="check" htmlFor={`${id}-new`}>
        <input id={`${id}-new`} type="radio" name={id} checked={value === NEW} onChange={() => onChange(NEW)} />
        <span>{isSystem ? "No, it is a new system" : "No, keep the name as written"}</span>
      </label>
    </fieldset>
  );
}

/** The content to accept once the matches are chosen: unchanged unless a match was taken. */
function linked(suggestion: Suggestion, choice: Record<string, string>): SuggestionContent | null {
  let content: SuggestionContent | null = null;
  for (const [role, systemId] of Object.entries(choice)) {
    if (systemId === NEW) continue;
    content = content ?? { ...suggestion.content };
    if (role === "target") content.target_system_id = systemId;
    else content.system_id = systemId;
  }
  return content;
}

/** One cited place: the quote, then the passage with its neighbours on request (or the image). */
/** Where a suggestion from a change request comes from: the feature, and the approval it carries. */
function ChangeRequestCitation({ suggestion, notes }: { suggestion: Suggestion; notes?: string[] }) {
  const inbox = useChangeRequests();
  const cited = suggestion.change_request;
  const item = inbox.data?.find((each) => each.id === cited?.change_request_id);
  const citation = suggestion.citations[0];
  return (
    <div className="citation">
      {citation?.quote && <p className="citation__quote" dir="auto">“{citation.quote}”</p>}
      <p className="citation__where" dir="ltr">
        <bdi>{cited?.change_request_id}</bdi> · Feature {cited?.feature_id}
      </p>
      {item && (
        <p className="secondary" dir="auto">
          Requirement {traceLine(item.trace)}. Epic {item.trace.epic_id}: {item.trace.epic_name}.
        </p>
      )}
      {notes && notes.length > 0 && (
        <ul className="changerequests__warnings" aria-label="What its reading could not match">
          {notes.map((note) => (
            <li key={note} dir="auto">{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Citation({ release, document, location, quote }: {
  release: Release;
  document?: CatalogueDocument;
  location: string;
  quote: string;
}) {
  const [open, setOpen] = useState(false);
  const image = document?.mime_type.startsWith("image/") ?? false;
  const inDraft = document !== undefined;
  return (
    <div className="citation">
      {quote && <p className="citation__quote" dir="auto">“{quote}”</p>}
      <p className="citation__where" dir="ltr">
        <bdi>{document?.title ?? "A document no longer in the draft"}</bdi> · {location}
        {inDraft && (
          <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>
            {image ? <ImageIcon size={14} aria-hidden="true" /> : null}
            {open ? (image ? "Hide the image" : "Hide the passage") : image ? "Show the image" : "Show the passage"}
          </button>
        )}
      </p>
      {open && document && (image ? <CitedImage versionId={document.id} title={document.title} /> : (
        <CitedPassage releaseId={release.id} versionId={document.id} location={location} />
      ))}
    </div>
  );
}

function CitedPassage({ releaseId, versionId, location }: { releaseId: string; versionId: string; location: string }) {
  const passage = useQuery({
    queryKey: ["architecture", "releases", releaseId, "passage", versionId, location],
    queryFn: () => api.citedPassage(releaseId, versionId, location),
    staleTime: Infinity,
  });
  if (passage.isPending) return <p className="secondary">Opening the passage…</p>;
  if (passage.isError) return <p className="docpage__failure" role="alert">{errorMessage(passage.error)}</p>;
  const { before, after } = passage.data;
  const places = [...before, passage.data.passage, ...after];
  const cited = passage.data.passage.location;
  return (
    <div className="searchresults__context citation__passage">
      {places.map((place) => (
        <span key={place.location} className={place.location === cited ? "context-place is-cited" : "context-place"}>
          <span className="context-place__where">{place.location}</span>
          <span dir="auto">{place.text.replace(/^#{1,6}\s+/gm, "").trim()}</span>
        </span>
      ))}
    </div>
  );
}

function CitedImage({ versionId, title }: { versionId: string; title: string }) {
  const image = useQuery({
    queryKey: ["architecture", "documents", versionId, "content"],
    queryFn: () => api.catalogueDocumentContent(versionId),
    staleTime: Infinity,
  });
  const url = useMemo(() => (image.data ? URL.createObjectURL(image.data) : null), [image.data]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  if (image.isError) return <p className="docpage__failure" role="alert">{errorMessage(image.error)}</p>;
  return url ? <img className="citation__image" src={url} alt={`The image ${title}`} /> : <p className="secondary">Opening the image…</p>;
}
