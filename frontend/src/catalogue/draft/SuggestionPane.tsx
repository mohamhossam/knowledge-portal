import { useQuery } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Pencil, X } from "lucide-react";
import { type KeyboardEvent, type RefObject, useEffect, useId, useMemo, useState } from "react";

import { api, type CatalogueDocument, type PossibleMatch, type Release, type Suggestion, type SuggestionContent } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { ActionGroup, Button, EvidenceQuote, Facts, Lines, RadioGroup, Status, Suggested } from "../../design/components";
import { formatDay } from "../../home/format";
import { traceLine, useChangeRequests } from "../inbox";
import { SuggestionEditor } from "../SuggestionEditor";
import { type Lexicon, changeSentence, decideWhy, fromCatalogue, offeringHolds, suggestionState, waitsFor, waitsForMany } from "../suggestions";
import { TABLE_READER } from "../accepted";
import { NEW, STATE_TONE, citedPart, citedSource, linked, stateWords } from "./decide";


/**
 * The decide desk's pane: one suggestion in full. What it would change, the
 * mark that a model proposed it, where it comes from (the cited passage), and
 * the decision: accept, edit then accept, or reject.
 */
export function SuggestionPane({
  suggestion, release, words, document, actorName, busy, kept, notes, editing, headingRef, onEdit, onKeep, onDecide, settling = false, onSettle, deadEnd,
}: {
  suggestion: Suggestion;
  /** What it waits for when nothing adds that ("the system IT"): its Accept says so. */
  deadEnd?: string;
  release: Release;
  words: Lexicon;
  document: CatalogueDocument | undefined;
  actorName: (id: string | null | undefined) => string;
  busy: boolean;
  /** Edits made and not accepted yet; they outlive the editor until accepted or dropped. */
  kept: SuggestionContent | undefined;
  /** What the reading of its change request said of its feature. */
  notes?: string[];
  editing: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onEdit: (editing: boolean) => void;
  onKeep: (content: SuggestionContent | null) => void;
  onDecide: (accept: boolean, content?: SuggestionContent | null) => void;
  settling?: boolean;
  /** Says what the name it is about really is: a system, or a product offering. */
  onSettle?: (reference: string, name: string, kind: "system" | "offering") => void;
}) {
  const state = suggestionState(suggestion);
  const proposed = suggestion.status === "proposed";
  const holds = suggestion.content.kind === "product" ? offeringHolds(suggestion.content.product, words) : [];
  const reason = state === "decide" ? decideWhy(suggestion) : state === "waits" ? waitsFor(suggestion, words) : null;
  // Escape in the editor stops editing; the editor's own Cancel does the same.
  const escape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && editing) {
      event.stopPropagation();
      onEdit(false);
    }
  };
  return (
    <div className="draft-pane" onKeyDown={escape}>
      <h2 ref={headingRef} tabIndex={-1} className="draft-pane__title" dir="auto">{changeSentence(suggestion, words)}</h2>
      <p className="draft-pane__marks">
        <Suggested basis={suggestion.basis === "inferred" ? "inferred" : "stated"} detail={suggestion.model === TABLE_READER ? "read from a table" : undefined} />
        {deadEnd && state === "waits"
          ? <Status tone="held">Nothing adds what it needs</Status>
          : <Status tone={STATE_TONE[state]}>{stateWords(suggestion)}</Status>}
      </p>
      {reason && <p className="draft-quiet">{reason}.</p>}
      {suggestion.content.kind === "relationship" && suggestion.content.text && <p dir="auto">For: {suggestion.content.text}</p>}

      <section className="draft-pane__part" aria-labelledby={`${suggestion.id}-source`}>
        <h3 id={`${suggestion.id}-source`} className="draft-pane__label">{suggestion.change_request ? "From the change request" : fromCatalogue(suggestion) ? "From the draft's catalogue" : "From the document"}</h3>
        {suggestion.change_request ? (
          <ChangeRequestSource suggestion={suggestion} notes={notes} />
        ) : suggestion.citations.length ? (
          suggestion.citations.map((citation, index) => (
            <Citation key={`${citation.location}:${index}`} release={release} suggestion={suggestion} document={document} location={citation.location} quote={citation.quote} />
          ))
        ) : (
          <p className="draft-quiet">The suggestion cites no passage.</p>
        )}
        {holds.length > 0 && (
          <>
            <h4 className="draft-pane__label">What it holds</h4>
            <Facts items={holds.map((line) => [line.label, line.due ? <Status tone="held">{line.text}</Status> : <span dir="auto">{line.text}</span>])} />
          </>
        )}
        {suggestion.rationale && (
          <>
            <h4 className="draft-pane__label">Why it was inferred</h4>
            <p dir="auto">{suggestion.rationale}</p>
          </>
        )}
      </section>

      <section className="draft-pane__part" aria-label="Decision">
        {!proposed ? (
          <p>
            <strong>{suggestion.status === "accepted" ? "Accepted" : "Rejected"} by <bdi>{actorName(suggestion.decided_by)}</bdi></strong> on{" "}
            {formatDay(suggestion.decided_at)}{suggestion.edited && ", with edits"}. A decision stays; correct the draft with hand edits on its pages.
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
          <>
            <Decision key={suggestion.id} suggestion={suggestion} words={words} deadEnd={deadEnd} busy={busy} kept={kept !== undefined} onEdit={() => onEdit(true)} onDrop={() => onKeep(null)} onDecide={onDecide} />
            {onSettle && <Retype suggestion={suggestion} words={words} busy={settling} onSettle={onSettle} />}
          </>
        )}
      </section>
    </div>
  );
}

/** The plain decision: possible matches first, then accept, edit or reject. */
function Decision({ suggestion, words, deadEnd, busy, kept, onEdit, onDrop, onDecide }: {
  suggestion: Suggestion;
  words: Lexicon;
  deadEnd?: string;
  busy: boolean;
  kept: boolean;
  onEdit: () => void;
  onDrop: () => void;
  onDecide: (accept: boolean, content?: SuggestionContent | null) => void;
}) {
  const roles = [...new Set(suggestion.possible_matches.map((item) => item.role))];
  const [choice, setChoice] = useState<Record<string, string>>({});
  const unchosen = roles.filter((role) => choice[role] === undefined);
  const waits = suggestionState(suggestion) === "waits";
  const why = unchosen.length
    ? "Say first whether the name means a system the draft has."
    : waits && deadEnd
      ? `Neither the draft nor any suggestion adds ${deadEnd}. Settle it under What to do next, ${kept ? "go back to your edits if they name" : "edit this to name"} what the draft has, or leave it: publishing leaves it out.`
      : waits
      ? `${waitsFor(suggestion, words)}. Accept ${waitsForMany(suggestion, words) ? "those" : "that"} first, or ${kept ? "go back to your edits if they name" : "edit this to name"} what the draft has.`
      : null;
  return (
    <div className="draft-decision">
      {/* Kept edits are said before the buttons, so Accept is never read as taking them. */}
      {kept && (
        <p>
          <Status tone="held">You have edits not accepted yet</Status> They are kept while this page stays open.{" "}
          <Button variant="link" busy={busy} onClick={onDrop}>Drop the edits</Button>
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
      {suggestionState(suggestion) === "present" && <p className="draft-quiet">The draft already says this. Rejecting it changes nothing.</p>}
      <ActionGroup label="Decide this suggestion">
        <Button variant="primary" icon={<Check size={14} />} aria-keyshortcuts="a" busy={busy} unavailableReason={why} onClick={() => onDecide(true, linked(suggestion, choice))}>
          {kept ? (fromCatalogue(suggestion) ? "Accept as suggested" : "Accept as the document said") : "Accept"}
        </Button>
        <Button icon={<Pencil size={14} />} aria-keyshortcuts="e" busy={busy} onClick={onEdit}>{kept ? "Back to your edits" : "Edit, then accept"}</Button>
        <Button icon={<X size={14} />} aria-keyshortcuts="r" busy={busy} onClick={() => onDecide(false)}>Reject</Button>
      </ActionGroup>
    </div>
  );
}

/**
 * A product read as a system: the suggestion of a new system, or a constraint of a system
 * the draft lacks, said to be about a product offering instead, without rejecting and retyping
 * it. The system becomes an offering and its constraints the offering's rules.
 */
function Retype({ suggestion, words, busy, onSettle }: {
  suggestion: Suggestion;
  words: Lexicon;
  busy: boolean;
  onSettle: (reference: string, name: string, kind: "system" | "offering") => void;
}) {
  const { content } = suggestion;
  const newSystem = content.kind === "system" && !suggestion.system_name && suggestion.possible_matches.length === 0;
  const homeless = content.kind === "constraint" && suggestion.match === "needs_system";
  if (!newSystem && !homeless) return null;
  const name = newSystem ? content.name : words.system(content.system_id);
  return (
    <p className="draft-retype">
      <span>
        Not a system? If <bdi>{name}</bdi> is a product, bundle or plan, {newSystem ? "this becomes an offering and its constraints the offering's rules" : "its constraints become the offering's rules"}.
      </span>{" "}
      <Button variant="link" busy={busy} onClick={() => onSettle(content.system_id, name, "offering")}>
        Make <bdi>{name}</bdi> a product offering
      </Button>
    </p>
  );
}

/** Possible matches as a choice: the system the draft has, or none of them. */
function MatchChoices({ suggestion, matches, value, onChange }: {
  suggestion: Suggestion;
  matches: PossibleMatch[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const name = useId();
  const writtenAs = matches[0]?.written_as ?? "";
  return (
    <RadioGroup
      legend={<>Is <bdi>“{writtenAs}”</bdi> a system the draft already has?</>}
      name={name}
      value={value ?? ""}
      onChange={onChange}
      options={[
        ...matches.map((match) => ({ value: match.system_id, label: <>Yes, it is <strong><bdi>{match.system_name}</bdi></strong></>, hint: match.reason })),
        { value: NEW, label: suggestion.content.kind === "system" ? "No, it is a new system" : "No, keep the name as written" },
      ]}
    />
  );
}

function ChangeRequestSource({ suggestion, notes }: { suggestion: Suggestion; notes?: string[] }) {
  const inbox = useChangeRequests();
  const cited = suggestion.change_request;
  const item = inbox.data?.find((each) => each.id === cited?.change_request_id);
  const quote = suggestion.citations[0]?.quote;
  return (
    <>
      {quote && <EvidenceQuote text={quote} source={<><bdi>{cited?.change_request_id}</bdi> · {citedPart(suggestion)}</>} />}
      {!quote && <p><bdi>{cited?.change_request_id}</bdi> · {citedPart(suggestion)}</p>}
      {item && <p className="draft-quiet" dir="auto">Requirement {traceLine(item.trace)}. Epic {item.trace.epic_id}: {item.trace.epic_name}.</p>}
      {notes && notes.length > 0 && (
        <Lines label="What its reading could not match">
          {notes.map((note) => <li key={note} dir="auto"><Status tone="held">{note}</Status></li>)}
        </Lines>
      )}
    </>
  );
}

/** One cited place: the quote, then the passage around it (or the image) on request. */
function Citation({ release, suggestion, document, location, quote }: {
  release: Release;
  suggestion: Suggestion;
  document?: CatalogueDocument;
  location: string;
  quote: string;
}) {
  const [open, setOpen] = useState(false);
  const image = document?.mime_type.startsWith("image/") ?? false;
  const source = <bdi>{citedSource(suggestion, document, location)}</bdi>;
  return (
    <div className="draft-citation">
      {quote ? <EvidenceQuote text={quote} source={source} /> : <p>{source}</p>}
      {document && (
        <Button variant="link" icon={image ? <ImageIcon size={14} /> : undefined} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? (image ? "Hide the image" : "Hide the passage") : image ? "Show the image" : "Show the passage around it"}
        </Button>
      )}
      {open && document && (image ? <CitedImage versionId={document.id} title={document.title} /> : <CitedPassage releaseId={release.id} versionId={document.id} location={location} />)}
    </div>
  );
}

function CitedPassage({ releaseId, versionId, location }: { releaseId: string; versionId: string; location: string }) {
  const passage = useQuery({
    queryKey: ["architecture", "releases", releaseId, "passage", versionId, location],
    queryFn: () => api.citedPassage(releaseId, versionId, location),
    staleTime: Infinity,
  });
  if (passage.isPending) return <p className="draft-quiet" role="status">Opening the passage…</p>;
  if (passage.isError) return <p role="status"><Status tone="attention">{errorMessage(passage.error)}</Status></p>;
  const places = [...passage.data.before, passage.data.passage, ...passage.data.after];
  const cited = passage.data.passage.location;
  return (
    <ol className="draft-context" aria-label="The passage and its neighbours">
      {places.map((place) => (
        <li key={place.location} className={place.location === cited ? "draft-context__place is-cited" : "draft-context__place"}>
          <span className="draft-context__where">{place.location}{place.location === cited && <span className="ds-visually-hidden">, cited</span>}</span>
          <span dir="auto">{place.text.replace(/^#{1,6}\s+/gm, "").trim()}</span>
        </li>
      ))}
    </ol>
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
  if (image.isError) return <p role="status"><Status tone="attention">{errorMessage(image.error)}</Status></p>;
  return url ? <img className="draft-citation__image" src={url} alt={`From ${title}`} /> : <p className="draft-quiet" role="status">Opening the image…</p>;
}
