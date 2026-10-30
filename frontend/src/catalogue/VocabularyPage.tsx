import { Plus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import {
  ActionGroup, Button, DataTable, Facts, ListFilter, ListFind, ListTools, RecordList, type RecordGroup, RecordPlaceholder, RecordView, Section, Status,
  Workbench,
} from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { count, formatDay } from "../home/format";
import { ButtonLink, RouterLink } from "../shell/links";
import { acceptances } from "./accepted";
import { AcceptedFrom } from "./AcceptedFrom";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useFindParam } from "./frame/useFindParam";
import { LEGACY_ROLE_RANK } from "./model/conventions";
import { SOURCE_TONE, SOURCE_WORD } from "./ontology";
import { SourceName } from "./provenance/Provenance";
import { Retired } from "./Retired";
import { useCatalogueContext } from "./useCatalogue";
import { RoleOrder, SchemeEdit, SchemeRemove, TermEdit, TermRemove } from "./VocabularyEdits";
import { useTermProposals } from "./useTermProposals";
import { useTypedDocuments } from "./useTypedDocuments";
import { placeOf, type TermProposal, waitingIn, waitingSentence, waitingValues } from "./vocabularyProposals";
import {
  BUILT_IN_FIELDS, FIELD_WORDS, labelKey, ROLES, rolesInOrder, type Scheme, schemesOf, type Term, termUsers, type VocabularyField,
} from "./vocabularyEditing";

const ALL = "all";
const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** The fields a vocabulary covers: a built-in one's own, or those a curator bound to theirs. */
function fieldsOf(id: string, scheme?: Scheme): VocabularyField[] {
  return scheme ? scheme.fields : (Object.entries(BUILT_IN_FIELDS) as [VocabularyField, string][]).filter(([, owner]) => owner === id).map(([field]) => field);
}

/** Where a built-in vocabulary's terms are linked beyond the free-text fields. */
const ALSO_COVERS: Record<string, string> = {
  information_entity: "what a system masters or reads, and what an interface carries",
  document_type: "a library document's type",
};

/** What a vocabulary covers, in a sentence, or null when nothing links its terms. */
function covers(id: string, scheme?: Scheme): string | null {
  const said = [...fieldsOf(id, scheme).map((field) => FIELD_WORDS[field]), ...(ALSO_COVERS[id] ? [ALSO_COVERS[id]] : [])];
  return said.length ? sentence(said.join(", ")) : null;
}

/** A vocabulary's terms in reading order: roles strongest first; otherwise each top term followed by those under it, by label at each level. */
function inOrder(terms: Term[], scheme: string, release: Parameters<typeof rolesInOrder>[0]): Term[] {
  if (scheme === ROLES) return rolesInOrder(release, LEGACY_ROLE_RANK);
  const own = terms.filter((term) => term.scheme === scheme).sort((a, b) => a.pref_label.localeCompare(b.pref_label));
  const ids = new Set(own.map((term) => term.id));
  const ordered: Term[] = [];
  const placed = new Set<string>();
  const visit = (term: Term) => {
    if (placed.has(term.id)) return;
    placed.add(term.id);
    ordered.push(term);
    for (const narrower of own.filter((item) => item.broader_id === term.id)) visit(narrower);
  };
  for (const term of own) if (!term.broader_id || !ids.has(term.broader_id)) visit(term);
  // A term caught in a loop of broader ones still shows, after the rest.
  for (const term of own) visit(term);
  return ordered;
}

/** The label a find matched on, when it is not the preferred one. */
function matchedLabel(term: Term, find: string): string | null | undefined {
  const key = labelKey(find);
  if (!key) return undefined;
  if (labelKey(term.pref_label).includes(key)) return null;
  return [...term.alt_labels, ...(term.notation ? [term.notation] : [])].find((label) => labelKey(label).includes(key));
}

/**
 * The controlled vocabulary on the workbench: every vocabulary of the version, built in or a
 * curator's, its terms in a narrow list beside the record of the one chosen; with none chosen,
 * the vocabulary filtered to, or all of them.
 */
export function VocabularyPage() {
  const { termId } = useParams();
  const { book, base, editable } = useCatalogueContext();
  const release = book.release;
  const [params] = useSearchParams();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const schemes = schemesOf(release);
  const within = schemes.find((scheme) => scheme.id === params.get("in"))?.id;
  const [adding, setAdding] = useState<"term" | "vocabulary" | null>(null);
  const focusLater = useFocusAfterRender();
  // Closing an add that was not saved gives focus back to its button; a saved one opens its record.
  const stopAdding = (saved?: string) => {
    if (!saved) focusLater(() => document.getElementById(adding === "vocabulary" ? "vocabulary-add" : "term-add"));
    setAdding(null);
  };
  const terms = release.vocabulary ?? [];
  const chosen = termId !== undefined ? terms.find((term) => term.id === termId) : undefined;

  const record = adding === "term" ? (
    <TermEdit scheme={within} onDone={stopAdding} />
  ) : adding === "vocabulary" ? (
    <SchemeEdit onDone={stopAdding} />
  ) : chosen ? (
    <TermRecord key={chosen.id} term={chosen} />
  ) : termId !== undefined ? (
    <RecordPlaceholder title={`This version has no term “${termId}”.`}>
      <RouterLink href={`${base}/vocabulary`}>See every vocabulary</RouterLink>
    </RecordPlaceholder>
  ) : within ? (
    <SchemeRecord key={within} id={within} notice={notice} />
  ) : (
    <RecordPlaceholder title={`${count(terms.length, "term")} in ${count(schemes.length, "vocabulary", "vocabularies")}. Choose one to read where it is used.`}>
      {notice && <p role="status" className="cat-notice"><Status tone="done">{notice}</Status></p>}
      <VocabulariesTable />
      {/* The overview has no record heading above it, so its sections are the record's level. */}
      <WaitingLinks level={2} />
    </RecordPlaceholder>
  );

  return (
    <>
      <CatalogueHeader page="vocabulary" chosen={chosen?.pref_label} />
      <Workbench
        listLabel="Vocabulary"
        chosen={Boolean(chosen) || adding !== null || Boolean(within)}
        list={
          <TermsList
            current={chosen?.id}
            within={within}
            onAdd={editable && adding === null ? setAdding : undefined}
          />
        }
        record={record}
      />
    </>
  );
}

/** Decide, showing only the clean-up's proposals for a vocabulary, or for one term. */
const decideHref = (base: string, scheme?: string, term?: string) =>
  `${base}/decide${scheme ? `?vocabulary=${encodeURIComponent(scheme)}${term ? `&term=${encodeURIComponent(term)}` : ""}` : "?vocabulary=*"}`;

/**
 * The values the draft writes that wait to be linked to a vocabulary's terms, as the clean-up
 * proposed them, with the clean-up itself and the way to Decide, where they are accepted. On a
 * draft only; one vocabulary's, or every one's when none is given. With nothing waiting it is one
 * line, and what the clean-up does is a step away.
 */
function WaitingLinks({ scheme, level = 3 }: { scheme?: { id: string; name: string }; level?: 2 | 3 }) {
  const { book, base, editable } = useCatalogueContext();
  const release = book.release;
  const { proposals, loading, failed, retry, lastRun, cleanUp } = useTermProposals(release);
  // Running it again replaces every undecided proposal of the last run, in every vocabulary: asked first.
  const [asking, setAsking] = useState(false);
  const focusLater = useFocusAfterRender();
  if (release.status !== "draft") return null;
  const waiting = waitingIn(proposals, scheme ? [scheme.id] : undefined);
  const everywhere = waitingIn(proposals);
  const said = waitingSentence(waiting);
  const run = () => {
    setAsking(false);
    cleanUp.mutate();
    focusLater(() => document.getElementById("vocabulary-cleanup"));
  };
  const waitingNow = proposals.length;
  return (
    <Section title="Values waiting to be linked" count={waitingValues(waiting)} headingLevel={level}>
      <div className="cat-waiting">
        {failed ? (
          <p>
            <Status tone="attention">What the clean-up proposed could not be read.</Status>{" "}
            <Button variant="tertiary" onClick={retry}>Try again</Button>
          </p>
        ) : (
          <p>{loading ? "Reading what the clean-up proposed…" : said ?? "Nothing waits to be linked."}</p>
        )}
        <p className="cat-quiet">
          {lastRun ? `The clean-up last read this draft on ${formatDay(lastRun)}.` : "The clean-up has not read this draft yet."}
        </p>
        <details className="cat-waiting__about">
          <summary>What the clean-up does</summary>
          <p className="cat-quiet">
            It reads each value the draft writes in a field a vocabulary covers, and proposes the term it means, or a new term when none
            does. Nothing is linked until it is accepted on Decide, and the written value stays beside its term. Reading the draft again
            replaces the proposals still waiting; those accepted or rejected stay as they are.
          </p>
        </details>
        <p role="status" className="cat-waiting__said">
          {cleanUp.isSuccess && <Status tone="done">The clean-up read the draft again.</Status>}
          {cleanUp.isError && <Status tone="attention">The clean-up did not run; the draft may have changed. Reload, then try again.</Status>}
        </p>
        {editable && asking ? (
          <div className="cat-waiting__ask">
            <p>
              Reading the draft again replaces the {waitingNow === 1 ? "proposal" : `${waitingNow} proposals`} still waiting on Decide, in every
              vocabulary ({waitingValues(everywhere) === 1 ? "1 written value" : `${waitingValues(everywhere)} written values`}). Those accepted or rejected stay.
            </p>
            <ActionGroup label="Read the draft again?">
              <Button variant="primary" onClick={run}>Read it again</Button>
              <Button
                variant="tertiary"
                onClick={() => {
                  setAsking(false);
                  focusLater(() => document.getElementById("vocabulary-cleanup"));
                }}
              >
                Keep them
              </Button>
            </ActionGroup>
          </div>
        ) : editable ? (
          <ActionGroup label="Link the written values">
            <Button id="vocabulary-cleanup" busy={cleanUp.isPending} onClick={() => (waitingNow ? setAsking(true) : run())}>
              {waitingNow ? "Read the draft again…" : "Clean up the vocabulary"}
            </Button>
            {waitingValues(waiting) + waiting.added > 0 && (
              <ButtonLink to={decideHref(base, scheme?.id)} variant="tertiary">
                {scheme ? `Decide the ${scheme.name.toLocaleLowerCase()} proposals` : "Decide every proposal"}
              </ButtonLink>
            )}
          </ActionGroup>
        ) : null}
      </div>
    </Section>
  );
}

/** Every vocabulary, each with how many terms it holds and the fields it covers. */
function VocabulariesTable() {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const { proposals } = useTermProposals(release);
  type Row = ReturnType<typeof schemesOf>[number];
  return (
    <DataTable<Row>
      caption="The vocabularies of this version"
      rows={schemesOf(release)}
      rowId={(scheme) => scheme.id}
      columns={[
        { id: "name", header: "Vocabulary", rowHeader: true, bidi: true, cell: (scheme) => <Link to={`${base}/vocabulary?in=${encodeURIComponent(scheme.id)}`}>{scheme.name}</Link> },
        { id: "kind", header: "Kind", cell: (scheme) => (scheme.builtIn ? "Built in" : "Defined in this version") },
        { id: "terms", header: "Terms", numeric: true, cell: (scheme) => (release.vocabulary ?? []).filter((term) => term.scheme === scheme.id).length },
        ...(release.status === "draft"
          ? [{
              id: "waiting",
              header: "Waiting to link",
              numeric: true,
              cell: (scheme: Row) => {
                const n = waitingValues(waitingIn(proposals, [scheme.id]));
                return n ? <Link to={`${base}/vocabulary?in=${encodeURIComponent(scheme.id)}`}>{`${n} `}<span className="ds-visually-hidden">written values waiting</span></Link> : <span className="cat-quiet">0</span>;
              },
            }]
          : []),
        {
          id: "fields",
          header: "Covers",
          cell: (scheme) => covers(scheme.id, scheme.scheme) ?? <span className="cat-quiet">No field</span>,
        },
      ]}
    />
  );
}

function TermsList({ current, within, onAdd }: { current?: string; within?: string; onAdd?: (what: "term" | "vocabulary") => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const { proposals } = useTermProposals(release);
  const waitingFor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const proposal of proposals) if (proposal.existing) counts.set(proposal.term.id, (counts.get(proposal.term.id) ?? 0) + proposal.refs.length);
    return counts;
  }, [proposals]);
  const [, setParams] = useSearchParams();
  const [find, setFind] = useFindParam();
  const terms = useMemo(() => release.vocabulary ?? [], [release]);
  const schemes = useMemo(() => schemesOf(release), [release]);
  const groups = useMemo<RecordGroup[]>(() => {
    const byId = new Map(terms.map((term) => [term.id, term]));
    return schemes
      .filter((scheme) => !within || scheme.id === within)
      .map((scheme) => ({
        id: scheme.id,
        label: <bdi>{scheme.name}</bdi>,
        items: inOrder(terms, scheme.id, release)
          .filter((term) => !find.trim() || matchedLabel(term, find) !== undefined)
          .map((term) => {
            const why = find.trim() ? matchedLabel(term, find) : null;
            const broader = term.broader_id ? byId.get(term.broader_id) : undefined;
            const detail = [
              broader ? <>Under <bdi>{broader.pref_label}</bdi></> : null,
              why ? <>Also “<bdi>{why}</bdi>”</> : term.notation ? <bdi>{term.notation}</bdi> : null,
            ].filter(Boolean);
            return {
              id: term.id,
              href: `${base}/vocabulary/${encodeURIComponent(term.id)}${within ? `?in=${encodeURIComponent(within)}` : ""}`,
              name: term.deprecated ? <span className="cat-retired">{term.pref_label}</span> : term.pref_label,
              bidi: true,
              detail: detail.length ? <>{detail.map((part, at) => <span key={at}>{at > 0 && " · "}{part}</span>)}</> : undefined,
              meta: term.deprecated ? (
                <span className="cat-quiet">Retired</span>
              ) : waitingFor.get(term.id) ? (
                <span className="cat-quiet">{waitingFor.get(term.id)} waiting</span>
              ) : undefined,
            };
          }),
      }));
  }, [terms, schemes, within, find, base, release, waitingFor]);
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
  const inScope = within ? terms.filter((term) => term.scheme === within).length : terms.length;
  return (
    <>
      <ListTools count={find.trim() ? `${count(shown, "term")} of ${inScope}` : count(inScope, "term")}>
        <ListFind label="Find a term by any label or code" value={find} onChange={setFind} placeholder="Any label or code, e.g. TMF622" />
        <ListFilter
          label="Vocabulary"
          value={within ?? ALL}
          options={[
            { id: ALL, label: "Every vocabulary", count: terms.length },
            ...schemes.map((scheme) => ({ id: scheme.id, label: scheme.name, count: terms.filter((term) => term.scheme === scheme.id).length })),
          ]}
          onChange={(value) =>
            setParams((previous) => {
              const next = new URLSearchParams(previous);
              if (value === ALL) next.delete("in");
              else next.set("in", value);
              return next;
            }, { replace: true })
          }
        />
        {onAdd && (
          <>
            <Button id="term-add" variant="tertiary" icon={<Plus size={16} />} onClick={() => onAdd("term")}>Add a term</Button>
            <Button id="vocabulary-add" variant="tertiary" icon={<Plus size={16} />} onClick={() => onAdd("vocabulary")}>Add a vocabulary</Button>
          </>
        )}
      </ListTools>
      <RecordList
        label="Terms in this version"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={find.trim() ? `No term is labelled or coded “${find.trim()}”.` : "This vocabulary has no term yet."}
      />
    </>
  );
}

/** A vocabulary on its own: what it is, the fields it covers and its terms, with its edits. */
function SchemeRecord({ id, notice }: { id: string; notice?: string }) {
  const { book, editable } = useCatalogueContext();
  const release = book.release;
  const scheme = schemesOf(release).find((item) => item.id === id)!;
  const terms = (release.vocabulary ?? []).filter((term) => term.scheme === id);
  const retired = terms.filter((term) => term.deprecated).length;
  const [editing, setEditing] = useState<"edit" | "remove" | "order" | null>(null);
  const { proposals } = useTermProposals(release);
  const waitingHere = waitingValues(waitingIn(proposals, [id])) + waitingIn(proposals, [id]).added;
  const focusLater = useFocusAfterRender();
  const close = (key: string) => () => {
    focusLater(() => document.getElementById(`vocabulary-${key}`));
    setEditing(null);
  };
  return (
    <RecordView
      title={scheme.name}
      meta={<span className="cat-quiet">{scheme.builtIn ? "Built in" : "Defined in this version"}</span>}
      lead={scheme.about || undefined}
      actions={
        editable && editing === null && (!scheme.builtIn || id === ROLES) ? (
          <ActionGroup label={`Edit ${scheme.name}`}>
            {id === ROLES && <Button id="vocabulary-order" onClick={() => setEditing("order")}>Order the roles</Button>}
            {scheme.scheme && (
              <>
                <Button id="vocabulary-edit" onClick={() => setEditing("edit")}>Edit this vocabulary</Button>
                <Button id="vocabulary-remove" variant="tertiary" onClick={() => setEditing("remove")}>Remove this vocabulary…</Button>
              </>
            )}
          </ActionGroup>
        ) : undefined
      }
    >
      {notice && <p role="status" className="cat-notice"><Status tone="done">{notice}</Status></p>}
      {editing === "order" && <RoleOrder onDone={close("order")} />}
      {editing === "edit" && scheme.scheme && <SchemeEdit scheme={scheme.scheme} onDone={close("edit")} />}
      {editing === "remove" && scheme.scheme && <SchemeRemove scheme={scheme.scheme} onDone={close("remove")} />}
      {editing === null && waitingHere > 0 && <WaitingLinks scheme={{ id, name: scheme.name }} />}
      {editing === null && (
        <Section title="About" headingLevel={3}>
          <Facts
            items={[
              ["Terms", retired ? `${terms.length}, ${retired} of them retired` : String(terms.length)],
              ["Covers", covers(id, scheme.scheme) ?? <span className="cat-quiet">No field: its terms are read on their own</span>],
              ...(id === ROLES ? [["Order", "Strongest first: a system that plays several roles is named by the strongest."] as [string, ReactNode]] : []),
            ]}
          />
        </Section>
      )}
      {editing === null && waitingHere === 0 && <WaitingLinks scheme={{ id, name: scheme.name }} />}
    </RecordView>
  );
}

/** The places the clean-up proposes linking to a term, each with the value written there, decided on Decide. */
function TermWaiting({ term, waiting }: { term: Term; waiting: TermProposal[] }) {
  const { book, base, editable } = useCatalogueContext();
  const refs = waiting.flatMap((proposal) => proposal.refs);
  return (
    <Section title="Waiting to be linked" count={refs.length} headingLevel={3}>
      <p className="cat-quiet">Written as text where it means this term; the clean-up proposes linking each, and nothing is linked until it is accepted.</p>
      <ul className="cat-edit__users">
        {refs.map((ref, index) => {
          const place = placeOf(ref, book.release);
          return (
            <li key={`${index}:${ref.owner_id}:${ref.item ?? ""}:${ref.part ?? ""}`}>
              {place.path ? <RouterLink href={`${base}/${place.path}`}>{place.text.charAt(0).toLocaleUpperCase() + place.text.slice(1)}</RouterLink> : place.text}
              {" "}writes “<bdi>{ref.value}</bdi>”
            </li>
          );
        })}
      </ul>
      {editable && (
        <ActionGroup label={`Decide the links to ${term.pref_label}`}>
          <ButtonLink to={decideHref(base, term.scheme, term.id)} variant="tertiary">
            Decide the {refs.length === 1 ? "link" : `${refs.length} links`} to {term.pref_label}
          </ButtonLink>
        </ActionGroup>
      )}
    </Section>
  );
}

function TermRecord({ term }: { term: Term }) {
  const { book, base, editable } = useCatalogueContext();
  const release = book.release;
  const location = useLocation();
  // "retire" is the edit opened from a blocked removal, already retired.
  const [editing, setEditing] = useState<"term" | "retire" | "remove" | null>(null);
  const focusLater = useFocusAfterRender();
  const close = (key: "term" | "remove") => () => {
    focusLater(() => document.getElementById(`term-edit-${key}`));
    setEditing(null);
  };
  const changing = editing === "term" || editing === "retire";
  const terms = release.vocabulary ?? [];
  const byId = new Map(terms.map((item) => [item.id, item]));
  const scheme = schemesOf(release).find((item) => item.id === term.scheme);
  const broader = term.broader_id ? byId.get(term.broader_id) : undefined;
  const narrower = terms.filter((item) => item.broader_id === term.id);
  const replacement = term.replaced_by ? byId.get(term.replaced_by) : undefined;
  const path: string[] = [];
  for (let item = broader, seen = new Set([term.id]); item && !seen.has(item.id); item = item.broader_id ? byId.get(item.broader_id) : undefined) {
    seen.add(item.id);
    path.unshift(item.pref_label);
  }
  const termLink = (other: Term) => <Link key={other.id} to={`${base}/vocabulary/${encodeURIComponent(other.id)}`} dir="auto">{other.pref_label}</Link>;
  const users = termUsers(release, term.id).filter((use) => use.key !== "broader_id");
  const library = useTypedDocuments(term);
  const { proposals } = useTermProposals(release);
  const waiting = proposals.filter((proposal) => proposal.term.id === term.id);
  const roles = term.scheme === ROLES ? rolesInOrder(release, LEGACY_ROLE_RANK) : [];
  const place = roles.findIndex((item) => item.id === term.id);
  return (
    <RecordView
      title={term.pref_label}
      takeFocus={location.key !== "default"}
      meta={
        <>
          {term.deprecated && <Retired successor={replacement && { name: replacement.pref_label, href: `${base}/vocabulary/${encodeURIComponent(replacement.id)}` }} />}
          {term.confidence && <Status tone={SOURCE_TONE[term.confidence]}>{SOURCE_WORD[term.confidence]}</Status>}
          <RouterLink href={`${base}/vocabulary?in=${encodeURIComponent(term.scheme)}`}>{scheme?.name ?? term.scheme}</RouterLink>
          {path.length > 0 && <bdi>{path.join(" › ")}</bdi>}
        </>
      }
      lead={term.definition || undefined}
      actions={
        // One edit at a time: while one is open its own Cancel closes it, so switching never drops changes unasked.
        editable && editing === null ? (
          <ActionGroup label={`Edit ${term.pref_label}`}>
            <Button id="term-edit-term" onClick={() => setEditing("term")}>Edit this term</Button>
            <Button id="term-edit-remove" variant="tertiary" onClick={() => setEditing("remove")}>Remove this term…</Button>
          </ActionGroup>
        ) : undefined
      }
    >
      {changing && <TermEdit key={editing} term={term} retire={editing === "retire"} onDone={close("term")} />}
      {editing === "remove" && <TermRemove term={term} onDone={close("remove")} onRetire={() => setEditing("retire")} />}
      {!changing && (
        <Section title="Labels and code" count={1 + term.alt_labels.length + (term.notation ? 1 : 0)} headingLevel={3}>
          <ul className="cat-chips" aria-label={`Labels of ${term.pref_label}`}>
            <li><span className="cat-chip cat-chip--preferred" dir="auto">{term.pref_label}<span className="ds-visually-hidden"> (preferred)</span></span></li>
            {term.alt_labels.map((label) => <li key={label}><span className="cat-chip cat-chip--plain" dir="auto">{label}</span></li>)}
            {term.notation && <li><span className="cat-chip cat-chip--plain" dir="ltr">{term.notation}<span className="ds-visually-hidden"> (code)</span></span></li>}
          </ul>
          <p className="cat-quiet">Each label and code names one term of its vocabulary. “Wi-Fi” and “WiFi” count as the same label.</p>
        </Section>
      )}
      <Section title="Used by" count={users.length + library.documents.length} headingLevel={3}>
        {users.length + library.documents.length ? (
          <ul className="cat-edit__users">
            {users.map((use) => (
              <li key={`${use.path}:${use.text}:${use.key}`}>
                <RouterLink href={`${base}/${use.path}`}>{sentence(use.text)}</RouterLink>
              </li>
            ))}
            {library.documents.map((document) => (
              <li key={document.id}>
                <RouterLink href={`/library/${encodeURIComponent(document.id)}`}>The library document {document.title}</RouterLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cat-quiet">
            {library.checking
              ? "Checking which library documents are of this type…"
              : library.failed
                ? "Nothing in this version links this term. The library could not be read to check its documents."
                : `Nothing in this version${term.scheme === "document_type" ? " or the library" : ""} links this term.`}
          </p>
        )}
      </Section>
      {!changing && waiting.length > 0 && <TermWaiting term={term} waiting={waiting} />}
      {!changing && (
        <Section title="About" headingLevel={3}>
          <Facts
            items={[
              ["Broader term", broader ? termLink(broader) : <span className="cat-quiet">None (a top term)</span>],
              ...(narrower.length ? [["Narrower", <span key="narrower">{narrower.map((item, at) => <span key={item.id}>{at > 0 && ", "}{termLink(item)}</span>)}</span>] as [string, ReactNode]] : []),
              ...(place >= 0 ? [["Strength", `${ordinal(place + 1)} of ${roles.length} roles, strongest first`] as [string, ReactNode]] : []),
              ["Outside match", term.exact_match ? <bdi>{term.exact_match}</bdi> : <span className="cat-quiet">None recorded</span>],
              ...((term.close_match ?? []).length ? [["Near matches", <bdi key="near">{term.close_match.join(", ")}</bdi>] as [string, ReactNode]] : []),
              ["Source", term.source ? <SourceName text={term.source} /> : <span className="cat-quiet">Not stated</span>],
              ...(acceptances(term).length ? [["Accepted from", <AcceptedFrom key="accepted" accepted={acceptances(term)} />] as [string, ReactNode]] : []),
            ]}
          />
        </Section>
      )}
    </RecordView>
  );
}
