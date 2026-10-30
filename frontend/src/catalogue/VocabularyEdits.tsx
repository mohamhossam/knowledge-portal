import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActionGroup, Button, Checkbox, Status } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { RouterLink } from "../shell/links";
import { draftBody } from "./drafting";
import { EditPanel } from "./DraftEdits";
import { AreaField, Choices, CheckField, LinesField, SelectField, TextField } from "./forms";
import { SourceField, SurenessField } from "./SourceField";
import { LEGACY_ROLE_RANK } from "./model/conventions";
import { useCatalogueContext } from "./useCatalogue";
import { useEditing } from "./useEditing";
import { useTermProposals } from "./useTermProposals";
import { useTypedDocuments } from "./useTypedDocuments";
import {
  blankScheme, blankTerm, FIELD_WORDS, finishedScheme, finishedTerm, OPEN_FIELDS, rolesInOrder, type Scheme, schemeChanges, schemeIssue,
  schemeName, schemesOf, type Term, TERM_FIELD, termAndNarrower, termChanges, termFitsUnder, termIssue, termsWith, termUsers, type TermField,
  type VocabularyField,
} from "./vocabularyEditing";
import "./frame/vocabulary.css";

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

const termPath = (base: string, id: string) => `${base}/vocabulary/${encodeURIComponent(id)}`;

/**
 * A whole term: its labels and code, what it means, the broader term it sits under, the same
 * term in outside references, where its facts come from, and whether it is retired. Controlled;
 * `issue` is what stops it being saved, said under its field. A new term also chooses its vocabulary.
 */
function TermEditor({ value, onChange, issue, adding }: {
  value: Term;
  onChange: (value: Term) => void;
  issue?: { field: TermField; message: string } | null;
  adding: boolean;
}) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const set = (patch: Partial<Term>) => onChange({ ...value, ...patch });
  const errorAt = (field: TermField) => (issue?.field === field ? issue.message : null);
  const kin = (release.vocabulary ?? []).filter((item) => item.scheme === value.scheme && item.id !== value.id);
  // A broader term is one of the same vocabulary, never this one or one under it, nor one that would take a term past three levels.
  const under = value.id ? termAndNarrower(release.vocabulary ?? [], value.id) : new Set<string>();
  const broaderOptions = [
    { value: "", label: "None: a top term" },
    ...kin
      .filter((item) => item.id === value.broader_id || (!under.has(item.id) && !item.deprecated && termFitsUnder(release, value, item.id)))
      .map((item) => ({ value: item.id, label: item.deprecated ? `${item.pref_label} (retired)` : item.pref_label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  // What replaces a retired term is one of the same vocabulary still in use (ADR-0121).
  const successors = [
    { value: "", label: "Nothing replaces it" },
    ...kin.filter((item) => !item.deprecated).map((item) => ({ value: item.id, label: item.pref_label })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const uses = value.id ? termUsers(release, value.id) : [];
  return (
    <div className="cat-form">
      {adding && (
        <SelectField
          label="Vocabulary"
          value={value.scheme}
          options={schemesOf(release).map((scheme) => ({ value: scheme.id, label: scheme.name }))}
          // Its broader term and successor belong to the vocabulary it leaves.
          onChange={(scheme) => set({ scheme, broader_id: null, replaced_by: null })}
        />
      )}
      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Its labels and code</legend>
        <TextField label="Preferred label" value={value.pref_label} required wide error={errorAt("pref_label")} onChange={(pref_label) => set({ pref_label })} />
        <LinesField
          label="Other labels"
          value={value.alt_labels}
          hint="One per line: other words people write for it. Each label names one term of the vocabulary; “Wi-Fi” and “WiFi” count as the same."
          error={errorAt("alt_labels")}
          onChange={(alt_labels) => set({ alt_labels })}
        />
        <TextField label="Code" value={value.notation} dir="ltr" hint="The code people write for it, such as TMF622; empty when it has none." error={errorAt("notation")} onChange={(notation) => set({ notation: notation || null })} />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">What it means</legend>
        <AreaField label="Definition" value={value.definition} onChange={(definition) => set({ definition: definition || null })} />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Where it sits</legend>
        <SelectField
          label="Broader term"
          value={value.broader_id ?? ""}
          options={broaderOptions}
          hint="A term of the same vocabulary. Terms go at most three levels deep; any that would go deeper are left out."
          error={errorAt("broader_id")}
          onChange={(id) => set({ broader_id: id || null })}
        />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Its outside matches</legend>
        <TextField
          label="Outside match"
          value={value.exact_match}
          wide
          hint="The same term in an outside reference, such as an eTOM process number."
          onChange={(exact_match) => set({ exact_match: exact_match || null })}
        />
        <LinesField
          label="Near matches"
          value={value.close_match}
          hint="One per line: outside references close enough to read across, though not the same."
          error={errorAt("close_match")}
          onChange={(close_match) => set({ close_match })}
        />
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Its source</legend>
        <div className="cat-form__grid">
          <SourceField value={value.source} onChange={(source) => set({ source })} />
          <SurenessField source={value.source} value={value.confidence} onChange={(confidence) => set({ confidence })} />
        </div>
      </fieldset>

      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">Whether it is retired</legend>
        <CheckField
          label="Retired: still readable, never selected or matched again"
          checked={value.deprecated}
          onChange={(deprecated) => set({ deprecated, replaced_by: deprecated ? value.replaced_by : null })}
        />
        {value.deprecated && (
          <>
            <p className="ds-field__hint">
              {uses.length
                ? `Still named by ${uses.map((use) => use.text).join(", ")}; ${uses.length === 1 ? "it keeps its" : "they keep their"} link until changed.`
                : "Nothing else in the draft names it."}
            </p>
            <SelectField label="Replaced by" value={value.replaced_by ?? ""} options={successors} error={errorAt("replaced_by")} onChange={(id) => set({ replaced_by: id || null })} />
          </>
        )}
      </fieldset>
    </div>
  );
}

/** Adding a term, editing one, or retiring one (from a blocked removal). */
export function TermEdit({ term, scheme, retire, onDone }: { term?: Term; scheme?: string; retire?: boolean; onDone: (saved?: string) => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { saveDraft } = useEditing(release);
  const [original] = useState<Term>(() => term ?? blankTerm(scheme ?? schemesOf(release)[0]!.id));
  const [value, setValue] = useState<Term>(() => (retire ? { ...original, deprecated: true } : original));
  const [attempted, setAttempted] = useState(false);
  const issue = termIssue(value, release);
  return (
    <EditPanel
      title={term ? `Edit ${term.pref_label}` : `Add a term to ${schemeName(release, value.scheme)}`}
      // Adding takes the place of a record, so its title is the record's level.
      level={term ? 3 : 2}
      focusOnOpen
      action={term ? "Save the term" : "Add the term"}
      busy={saveDraft.isPending}
      // The field says what is wrong; the verb only points to it. A new term waiting only for its label says so plainly.
      problem={
        issue
          ? !term && !attempted && issue.field === "pref_label" && !value.pref_label.trim()
            ? "Give it a preferred label to add it."
            : `Correct ${TERM_FIELD[issue.field]} first.`
          : null
      }
      // A new term counts as changed once any part of it is filled, so leaving asks first.
      changes={term ? termChanges(original, value, release) : termChanges(blankTerm(value.scheme), value, release).length ? ["the new term"] : []}
      onAttempt={() => setAttempted(true)}
      error={saveDraft.error}
      onCancel={() => onDone()}
      onSubmit={() => {
        const finished = finishedTerm(value, release);
        saveDraft.mutate(draftBody(release, { vocabulary: termsWith(release, finished) }), {
          onSuccess: () => {
            onDone(finished.id);
            if (!term) navigate(termPath(base, finished.id));
          },
        });
      }}
    >
      {/* Each problem is said at its field once Save has been tried, not before anything is done. */}
      <TermEditor value={value} onChange={setValue} issue={attempted ? issue : null} adding={!term} />
    </EditPanel>
  );
}

/**
 * Removing a term: only one nothing names, since the service keeps every link pointing at a term.
 * While something does, each is a link to change it, and retiring is offered instead.
 */
export function TermRemove({ term, onDone, onRetire }: { term: Term; onDone: () => void; onRetire: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { saveDraft } = useEditing(release);
  const users = termUsers(release, term.id);
  // A document type still given to library documents stays until they are retyped.
  const library = useTypedDocuments(term);
  const named = users.length + library.documents.length;
  // A clean-up proposal that would link values to it is left with nothing to link to.
  const { proposals, failed } = useTermProposals(release);
  const waiting = proposals.filter((proposal) => proposal.term.id === term.id && proposal.existing).reduce((sum, proposal) => sum + proposal.refs.length, 0);
  return (
    <EditPanel
      title={`Remove ${term.pref_label}`}
      focusOnOpen
      action={`Remove “${term.pref_label}”`}
      actionIcon={<Trash2 size={16} />}
      danger
      busy={saveDraft.isPending}
      problem={
        library.checking
          ? "Checking which library documents are of this type…"
          : library.failed
            ? "The library could not be read to check which documents are of this type; try again."
            : named
              ? `Something still names it; ${named === 1 ? "change it" : "change those"} first, or retire it instead.`
              : null
      }
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        void saveDraft
          .mutateAsync(draftBody(release, { vocabulary: (release.vocabulary ?? []).filter((item) => item.id !== term.id) }))
          .then(() => navigate(`${base}/vocabulary?in=${encodeURIComponent(term.scheme)}`, { state: { notice: `${term.pref_label} was removed from the draft.` } }))
          .catch(() => undefined)
      }
    >
      {named ? (
        <>
          <p className="cat-edit__lead">It is still named by:</p>
          <ul className="cat-edit__users">
            {users.map((user) => (
              <li key={`${user.path}:${user.text}:${user.key}`}>
                <RouterLink href={`${base}/${user.path}`}>{sentence(user.text)}</RouterLink>
              </li>
            ))}
            {library.documents.map((document) => (
              <li key={document.id}>
                <RouterLink href={`/library/${encodeURIComponent(document.id)}`}>The library document {document.title}</RouterLink>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="cat-edit__lead">
          Nothing in the draft{term.scheme === "document_type" ? " or the library" : ""} names it. It goes from this draft only; the version in
          service keeps it until the draft is published.
        </p>
      )}
      {waiting > 0 && (
        <p className="cat-edit__lead">
          <Status tone="warning">
            The clean-up proposes linking {waiting === 1 ? "a written value" : `${waiting} written values`} to it; removed, that proposal has
            nothing to link to. Reject it on Decide first, or retire the term instead.
          </Status>
        </p>
      )}
      {failed && (
        <p className="cat-edit__lead">
          <Status tone="attention">Whether the clean-up proposes linking values to it could not be read.</Status>
        </p>
      )}
      {/* Retiring keeps it readable but out of use, whether or not anything names it. */}
      <ActionGroup>
        <Button onClick={onRetire}>Retire it instead</Button>
      </ActionGroup>
    </EditPanel>
  );
}

/**
 * Adding a vocabulary of a curator's own, or editing one: its name, what it is, and the
 * free-text fields it covers, each covered by one vocabulary at most.
 */
export function SchemeEdit({ scheme, onDone }: { scheme?: Scheme; onDone: (saved?: string) => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { saveDraft } = useEditing(release);
  const [original] = useState<Scheme>(() => scheme ?? blankScheme());
  const [value, setValue] = useState<Scheme>(original);
  const [attempted, setAttempted] = useState(false);
  const issue = schemeIssue(value, release, scheme);
  const errorAt = (field: "name" | "fields") => (attempted && issue?.field === field ? issue.message : null);
  const coveredBy = (field: VocabularyField) => (release.schemes ?? []).find((item) => item.id !== value.id && item.fields.includes(field));
  const fieldsError = errorAt("fields");
  return (
    <EditPanel
      title={scheme ? `Edit the vocabulary ${scheme.name}` : "Add a vocabulary"}
      level={scheme ? 3 : 2}
      focusOnOpen
      action={scheme ? "Save the vocabulary" : "Add the vocabulary"}
      busy={saveDraft.isPending}
      problem={issue ? `Correct ${issue.field === "name" ? "its name" : "the fields it covers"} first.` : null}
      changes={scheme ? schemeChanges(original, value, release) : schemeChanges(blankScheme(), value, release).length ? ["the new vocabulary"] : []}
      onAttempt={() => setAttempted(true)}
      error={saveDraft.error}
      onCancel={() => onDone()}
      onSubmit={() => {
        const finished = finishedScheme(value, release);
        const schemes = release.schemes ?? [];
        const next = schemes.some((item) => item.id === finished.id) ? schemes.map((item) => (item.id === finished.id ? finished : item)) : [...schemes, finished];
        saveDraft.mutate(draftBody(release, { schemes: next }), {
          onSuccess: () => {
            onDone(finished.id);
            if (!scheme) navigate(`${base}/vocabulary?in=${encodeURIComponent(finished.id)}`);
          },
        });
      }}
    >
      <div className="cat-form">
        <TextField label="Name" value={value.name} required wide error={errorAt("name")} hint="Such as NFR quality; its own, never a built-in vocabulary's." onChange={(name) => setValue({ ...value, name })} />
        <AreaField label="What it is" value={value.definition} onChange={(definition) => setValue({ ...value, definition: definition || null })} />
        <Choices legend="The fields it covers" hint="Each one then links to a term of this vocabulary beside its text. A field has one vocabulary.">
          {OPEN_FIELDS.map((field) => {
            const other = coveredBy(field);
            return (
              <Checkbox
                key={field}
                label={sentence(FIELD_WORDS[field])}
                hint={other ? `Covered by ${other.name}` : undefined}
                checked={value.fields.includes(field)}
                disabled={Boolean(other) && !value.fields.includes(field)}
                aria-invalid={fieldsError ? true : undefined}
                onChange={(event) =>
                  setValue({ ...value, fields: event.target.checked ? [...value.fields, field] : value.fields.filter((item) => item !== field) })
                }
              />
            );
          })}
        </Choices>
        {fieldsError && <p className="ds-field__error" role="alert">{fieldsError}</p>}
      </div>
    </EditPanel>
  );
}

/** Removing a curator's vocabulary: only an empty one, since every term belongs to a vocabulary of the version. */
export function SchemeRemove({ scheme, onDone }: { scheme: Scheme; onDone: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { saveDraft } = useEditing(release);
  const terms = (release.vocabulary ?? []).filter((term) => term.scheme === scheme.id).length;
  return (
    <EditPanel
      title={`Remove the vocabulary ${scheme.name}`}
      focusOnOpen
      action={`Remove “${scheme.name}”`}
      actionIcon={<Trash2 size={16} />}
      danger
      busy={saveDraft.isPending}
      problem={terms ? `It still holds ${terms === 1 ? "a term" : `${terms} terms`}; remove ${terms === 1 ? "it" : "them"} first.` : null}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        void saveDraft
          .mutateAsync(draftBody(release, { schemes: (release.schemes ?? []).filter((item) => item.id !== scheme.id) }))
          .then(() => navigate(`${base}/vocabulary`, { state: { notice: `The vocabulary ${scheme.name} was removed from the draft.` } }))
          .catch(() => undefined)
      }
    >
      <p className="cat-edit__lead">
        {scheme.fields.length
          ? `The fields it covers (${scheme.fields.map((field) => FIELD_WORDS[field]).join(", ")}) go back to free text.`
          : "It covers no field."}
      </p>
    </EditPanel>
  );
}

/**
 * The roles in order, strongest first: a system that plays several is named by its strongest
 * (review recommendation 10). Moving one re-ranks them all from 1.
 */
export function RoleOrder({ onDone }: { onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [original] = useState<Term[]>(() => rolesInOrder(release, LEGACY_ROLE_RANK));
  const [roles, setRoles] = useState<Term[]>(original);
  const [said, setSaid] = useState("");
  const focusLater = useFocusAfterRender();
  const moved = roles.some((role, at) => role.id !== original[at]!.id);
  const unranked = original.some((role) => role.rank == null);
  const move = (at: number, by: -1 | 1) => {
    const next = [...roles];
    [next[at], next[at + by]] = [next[at + by]!, next[at]!];
    setRoles(next);
    setSaid(`${next[at + by]!.pref_label} moved ${by < 0 ? "up" : "down"}: now ${at + by + 1} of ${next.length}.`);
    // Focus stays on the button pressed, in the role's new place; at the top or foot, the way that is left.
    const id = next[at + by]!.id;
    focusLater(() => {
      const row = document.querySelector<HTMLElement>(`[data-role="${CSS.escape(id)}"]`);
      return row?.querySelector<HTMLElement>(`[data-move="${by}"]`) ?? row?.querySelector<HTMLElement>("[data-move]");
    });
  };
  return (
    <EditPanel
      title="Order the roles"
      focusOnOpen
      action="Save the order"
      busy={saveDraft.isPending}
      problem={null}
      changes={moved ? ["the order"] : []}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => {
        const rank = new Map(roles.map((role, at) => [role.id, at + 1]));
        saveDraft.mutate(
          draftBody(release, { vocabulary: (release.vocabulary ?? []).map((term) => (rank.has(term.id) ? { ...term, rank: rank.get(term.id)! } : term)) }),
          { onSuccess: onDone },
        );
      }}
    >
      <p className="cat-edit__lead">Strongest first. A system that plays several roles is named by the strongest of them.</p>
      {unranked && <p className="ds-field__hint">Some roles have no saved order yet; saving records the order shown.</p>}
      <p className="ds-visually-hidden" aria-live="polite">{said}</p>
      <ol className="cat-order">
        {roles.map((role, at) => (
          <li key={role.id} data-role={role.id} className="cat-order__item">
            <div>
              <div className="cat-order__bar">
                <span className="cat-order__name">
                  {at + 1}. <bdi>{role.pref_label}</bdi>
                  {role.deprecated && <span className="cat-quiet"> (retired)</span>}
                </span>
                <span className="cat-order__slot">
                  {at > 0 && (
                    <Button variant="tertiary" icon={<ArrowUp size={14} />} data-move="-1" aria-label={`Move up ${role.pref_label}`} onClick={() => move(at, -1)}>
                      Move up
                    </Button>
                  )}
                </span>
                <span className="cat-order__slot">
                  {at < roles.length - 1 && (
                    <Button variant="tertiary" icon={<ArrowDown size={14} />} data-move="1" aria-label={`Move down ${role.pref_label}`} onClick={() => move(at, 1)}>
                      Move down
                    </Button>
                  )}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </EditPanel>
  );
}

