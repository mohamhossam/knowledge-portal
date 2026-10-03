import { useQuery } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Pencil, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from "react";

import { api, type CatalogueDocument, type PossibleMatch, type Release, type Suggestion, type SuggestionContent } from "../api/client";
import { errorMessage } from "../api/errors";
import { formatDay } from "../home/format";
import { SuggestionEditor } from "./SuggestionEditor";
import {
  type Lexicon, STATE_LABEL, STATE_RANK, changeSentence, decideWhy, suggestionState, waitsFor,
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
  rowRef: (element: HTMLTableRowElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
  onFocus: (focus: RowFocus | null) => void;
  onDecide: (accept: boolean, content?: SuggestionContent | null) => void;
};

/** One suggestion: the change in words and its state; open, its source and the decision. */
export function SuggestionRow({
  suggestion, release, words, documents, actorName, focus, focusable, busy, rowRef, onKeyDown, onFocus, onDecide,
}: Props) {
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
        ref={rowRef}
        tabIndex={focusable ? 0 : -1}
        className={`row suggestion row--${STATE_RANK[state]}${open ? " is-open" : ""}`}
        aria-expanded={open}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.target === event.currentTarget && !isFocused) onFocus({ key: suggestion.id, open: false });
        }}
        onClick={() => onFocus({ key: suggestion.id, open: !open })}
      >
        <th scope="row" className="suggestion__change" dir="auto">
          <span className="suggestion__sentence">{changeSentence(suggestion, words)}</span>
          {relationship && suggestion.content.text && <span className="secondary govtable__by" dir="auto">For: {suggestion.content.text}</span>}
          <span className="secondary govtable__by suggestion__source" dir="ltr">
            <bdi>{document?.title ?? "A document no longer in the draft"}</bdi>
            {citation && <> · {citation.location}</>}
            {suggestion.model === TABLE_READER && " · read from a table"}
          </span>
        </th>
        <td className="suggestion__state">
          <span className="status">{suggestion.status === "accepted" && suggestion.edited ? "Accepted with edits" : STATE_LABEL[state]}</span>
          {reason && <span className="secondary govtable__by">{reason}</span>}
        </td>
      </tr>
      {open && (
        <tr className="suggestion-detail">
          <td colSpan={2}>
            <SuggestionDetail
              suggestion={suggestion}
              release={release}
              words={words}
              document={document}
              actorName={actorName}
              editing={focus.editing === true}
              busy={busy}
              onEdit={(editing) => onFocus({ key: suggestion.id, open: true, editing })}
              onClose={() => onFocus({ key: suggestion.id, open: false })}
              onDecide={onDecide}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function SuggestionDetail({ suggestion, release, words, document, actorName, editing, busy, onEdit, onClose, onDecide }: {
  suggestion: Suggestion;
  release: Release;
  words: Lexicon;
  document?: CatalogueDocument;
  actorName: (id: string | null | undefined) => string;
  editing: boolean;
  busy: boolean;
  onEdit: (editing: boolean) => void;
  onClose: () => void;
  onDecide: (accept: boolean, content?: SuggestionContent | null) => void;
}) {
  const id = useId();
  const state = suggestionState(suggestion);
  const proposed = suggestion.status === "proposed";
  const escape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !editing) {
      event.stopPropagation();
      onClose();
    }
  };
  return (
    <div className="suggestion-detail__body" onKeyDown={escape}>
      <section className="suggestion-detail__source" aria-labelledby={`${id}-source`}>
        <h3 id={`${id}-source`} className="suggestion-detail__label">From the document</h3>
        {suggestion.citations.length ? (
          suggestion.citations.map((citation, index) => (
            <Citation key={`${citation.location}:${index}`} release={release} document={document} location={citation.location} quote={citation.quote} />
          ))
        ) : (
          <p className="secondary">The suggestion cites no passage.</p>
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
            onAccept={(content) => onDecide(true, content)}
            onCancel={() => onEdit(false)}
          />
        ) : (
          <Decision suggestion={suggestion} state={state} words={words} busy={busy} onEdit={() => onEdit(true)} onDecide={onDecide} />
        )}
      </section>
    </div>
  );
}

/** The plain decision: possible matches first, then accept, edit or reject. */
function Decision({ suggestion, state, words, busy, onEdit, onDecide }: {
  suggestion: Suggestion;
  state: ReturnType<typeof suggestionState>;
  words: Lexicon;
  busy: boolean;
  onEdit: () => void;
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
      ? `${waitsFor(suggestion, words)}. Accept that first, or edit this to name what the draft has.`
      : null;
  return (
    <div className="decision">
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
          Accept
        </button>
        <button type="button" className="text-button" disabled={busy} onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" />
          Edit, then accept
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
