import { Trash2 } from "lucide-react";
import { type FormEvent, Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CatalogueSystem, Channel, Journey, Offering, Relationship, RelationshipKind, Release, SourceConfidence } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { routerPath } from "../auth/paths";
import { blankSystem, channelUses, draftBody, systemUses } from "./drafting";
import { CONFIDENCE_OPTIONS, usedHow } from "./catalogue";
import {
  blankConcept, conceptChanges, type ConceptField, conceptIssue, conceptsWith, conceptUsers, finishedConcept, finishedOffering, finishedSystem, interfacesChanges, interfacesOfSystem, interfacesProblem, interfacesWith, journeyOrderProblem, journeyProblem,
  type Link, linksChanges, linksOf, linksProblem, offeringChanged, offeringIssue, offeringProblem, realisationProblem, relationshipsWith, slug, systemChanges,
  systemProblem,
} from "./editing";
import { ActionGroup, Button, Status } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { RouterLink } from "../shell/links";
import { AreaField, PickField, Rows, SelectField, SystemField, TextField } from "./forms";
import { JourneyEditor } from "./JourneyEditor";
import { OfferingFacts } from "./OfferingEditor";
import { questionProblem } from "./governance";
import { OFFERING_SECTIONS, type OfferingSection } from "./offeringSections";
import { entityNames, INTERFACE_STYLE } from "./ontology";
import { ConceptEditor } from "./ConceptEditor";
import { SystemEditor } from "./SystemEditor";
import { useCatalogueContext } from "./useCatalogue";
import { useEditing } from "./useEditing";

/** Names in a sentence: "Name", "Name and Roadmap", "Name, Roadmap and Information". */
function listed(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * An edit opened in place where the thing is read, never a modal: its fields,
 * then the verb and Cancel on a foot that stays in reach while a long form
 * scrolls. The verb stays focusable while it can't be sent, with the reason
 * beside it (§1.2); a failure is said in a line mounted from the start.
 */
export function EditPanel({ title, children, action, actionIcon, busy, problem, error, onSubmit, onCancel, onAttempt, danger, conflictMessage, focusOnOpen, level = 3, changes }: {
  title: string;
  /**
   * Hears a press of the verb while it cannot be sent: a form that says its problems at their
   * fields shows them from then on (not before anything is tried), and focus goes to the first.
   */
  onAttempt?: () => void;
  /** An icon before the verb, such as a bin on a removal. */
  actionIcon?: ReactNode;
  /**
   * What the edit has changed so far, by the names of its fields: said beside the verb, and
   * while there is any, Cancel, Escape and a link out of the panel ask before throwing it away,
   * and closing the tab warns. Left out, the panel cancels at once.
   */
  changes?: string[];
  /** Its title's heading level: 2 where it takes the place of a page's own section. */
  level?: 2 | 3;
  /** Take focus on its title when it opens, for a panel that replaces the button that opened it. */
  focusOnOpen?: boolean;
  /** What a 409 means here; the draft's own sentence by default. */
  conflictMessage?: string;
  children?: ReactNode;
  action: string;
  busy: boolean;
  problem: string | null;
  error: unknown;
  onSubmit: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const Heading = level === 2 ? "h2" : "h3";
  // Asking before the changes go: on Cancel or Escape, or on a link out of the panel, which it then follows.
  const [asking, setAsking] = useState<{ to?: string } | null>(null);
  const focusAfter = useFocusAfterRender();
  // Where the person was when the panel asked, so keeping on editing goes back there.
  const was = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen]);
  useEffect(() => {
    if (asking) document.getElementById(`${id}-keep`)?.focus();
  }, [asking, id]);
  const changed = changes ?? [];
  const ask = (to?: string) => {
    was.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAsking({ to });
  };
  const keepEditing = () => {
    setAsking(null);
    // The Cancel pressed to ask is a new button by now; a field is still the one it was.
    focusAfter(() => (was.current?.isConnected && was.current !== document.body ? was.current : document.getElementById(`${id}-cancel`)));
  };
  // A changed form is not thrown away by one press: Cancel or Escape asks first, and Escape again keeps editing.
  const leave = () => (changed.length && !asking ? ask() : asking ? keepEditing() : onCancel());
  const discard = () => {
    const to = asking?.to;
    onCancel();
    if (to) navigate(to);
  };
  // Nor by a link elsewhere on the page (another record, a tab, the sidebar), nor by closing the tab.
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target || link.hasAttribute("download") || link.origin !== window.location.origin || form.current?.contains(link)) return;
      event.preventDefault();
      event.stopPropagation();
      was.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setAsking({ to: `${routerPath(link.pathname)}${link.search}${link.hash}` });
    };
    window.addEventListener("beforeunload", warn);
    window.document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  const conflict = error instanceof ApiError && error.status === 409;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problem && !busy) onSubmit();
    else if (problem && onAttempt) {
      onAttempt();
      focusAfter(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]'));
    }
  };
  return (
    <form
      ref={form}
      className={danger ? "cat-edit cat-edit--danger" : "cat-edit"}
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          leave();
        }
      }}
    >
      <Heading id={`${id}-title`} ref={heading} tabIndex={focusOnOpen ? -1 : undefined} className="cat-edit__title">{title}</Heading>
      {children}
      {/* Mounted before it has anything to say, so a failure is announced. */}
      <p className="cat-edit__failure" role="alert">
        {error ? (
          <Status tone="attention">
            {conflict
              ? conflictMessage ?? "The draft changed while you edited (someone else, or a document's reading). Reload the page; your edit was not saved."
              : errorMessage(error)}
          </Status>
        ) : null}
      </p>
      <div className="cat-edit__foot">
        {/*
          Keyed apart: without the keys React keeps one <button> across the two states and turns
          "Keep editing" into the submit button during its own click, which then saves the form.
        */}
        {asking ? (
          <Fragment key="asking">
            <p id={`${id}-discard`} className="cat-edit__changes">
              {asking.to ? `Leave, and discard your changes to ${listed(changed)}?` : `Discard your changes to ${listed(changed)}?`}
            </p>
            <ActionGroup>
              <Button id={`${id}-keep`} variant="primary" aria-describedby={`${id}-discard`} onClick={keepEditing}>Keep editing</Button>
              <Button variant="tertiary" onClick={discard}>{asking.to ? "Discard and leave" : "Discard the changes"}</Button>
            </ActionGroup>
          </Fragment>
        ) : (
          <Fragment key="editing">
            {changes && (
              <p className="cat-edit__changes" aria-live="polite">
                {changed.length ? `Changed: ${listed(changed)}.` : "Nothing changed yet."}
              </p>
            )}
            <ActionGroup>
              <Button type="submit" variant={danger ? "danger" : "primary"} icon={actionIcon} busy={busy} unavailableReason={busy ? null : problem}>
                {busy ? "Saving…" : action}
              </Button>
              <Button id={`${id}-cancel`} variant="tertiary" onClick={leave}>Cancel</Button>
            </ActionGroup>
          </Fragment>
        )}
      </div>
    </form>
  );
}

/** Editing a system, or adding one; a new one opens on its own sheet once saved. */
export function SystemEdit({ system, onDone }: { system?: CatalogueSystem; onDone: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { saveSystem } = useEditing(release);
  const [original] = useState<CatalogueSystem>(() => system ?? blankSystem());
  const [value, setValue] = useState<CatalogueSystem>(original);
  return (
    <EditPanel
      title={system ? `Edit ${system.name}` : "Add a system"}
      changes={systemChanges(original, value, release)}
      action={system ? "Save the system" : "Add the system"}
      busy={saveSystem.isPending}
      problem={systemProblem(value, release)}
      error={saveSystem.error}
      onCancel={onDone}
      onSubmit={() => {
        const finished = finishedSystem(value, release);
        saveSystem.mutate(finished, {
          onSuccess: () => {
            onDone();
            if (!system) navigate(`${base}/systems/${encodeURIComponent(finished.id)}`);
          },
        });
      }}
    >
      <SystemEditor value={value} onChange={setValue} release={release} />
    </EditPanel>
  );
}

/** Removing a system takes its connections with it; offerings and journeys must let go first. */
export function SystemRemove({ system, onDone }: { system: CatalogueSystem; onDone: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { removeSystem } = useEditing(release);
  const uses = systemUses(release, system.id);
  const links = release.relationships.filter((item) => item.source_system_id === system.id || item.target_system_id === system.id).length;
  return (
    <EditPanel
      title={`Remove ${system.name}`}
      action="Remove it from the draft"
      danger
      busy={removeSystem.isPending}
      problem={uses.length ? `It is named by ${uses.join(" and ")}; edit those first.` : null}
      error={removeSystem.error}
      onCancel={onDone}
      onSubmit={() =>
        // The sheet goes with the system; the promise still lands to say so.
        void removeSystem
          .mutateAsync(system.id)
          .then(() => navigate(base, { state: { notice: `${system.name} was removed from the draft.` } }))
          .catch(() => undefined)
      }
    >
      <p className="cat-edit__lead">
        {links
          ? `Its ${links === 1 ? "connection goes" : `${links} connections go`} with it. `
          : ""}
        Requirement work keeps mapping to it until the draft is published.
      </p>
    </EditPanel>
  );
}

type Concept = NonNullable<Release["business_capabilities"]>[number];

/** The concept form's fields by the names it shows, for the reason beside the verb. */
const CONCEPT_FIELD: Record<ConceptField, string> = {
  pref_label: "Preferred label",
  alt_labels: "Other labels",
  broader_id: "Broader concept",
  domain_id: "Capability domain",
  close_match: "Near matches",
  replaced_by: "Replaced by",
};

/**
 * Editing a concept, or adding one; a new one opens on its own sheet once saved. `retire` opens
 * it already retired, for "Retire it instead".
 */
export function ConceptEdit({ concept, retire, onDone }: { concept?: Concept; retire?: boolean; onDone: (saved?: string) => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { saveDraft } = useEditing(release);
  const [original] = useState<Concept>(() => concept ?? blankConcept());
  const [value, setValue] = useState<Concept>(() => (retire ? { ...original, deprecated: true } : original));
  const [attempted, setAttempted] = useState(false);
  const issue = conceptIssue(value, release);
  return (
    <EditPanel
      title={concept ? `Edit ${concept.pref_label}` : "Add a concept"}
      focusOnOpen={!concept || retire}
      action={concept ? "Save the concept" : "Add the concept"}
      busy={saveDraft.isPending}
      // The field says what is wrong; the verb only points to it.
      problem={issue ? `Correct ${CONCEPT_FIELD[issue.field]} first.` : null}
      changes={conceptChanges(original, value, release)}
      onAttempt={() => setAttempted(true)}
      error={saveDraft.error}
      onCancel={() => onDone()}
      onSubmit={() => {
        const finished = finishedConcept(value, release);
        saveDraft.mutate(draftBody(release, { business_capabilities: conceptsWith(release, finished) }), {
          onSuccess: () => {
            onDone(finished.id);
            if (!concept) navigate(`${base}/concepts/${encodeURIComponent(finished.id)}`);
          },
        });
      }}
    >
      {/* Each problem is said at its field once Save has been tried, not before anything is done. */}
      <ConceptEditor value={value} onChange={setValue} release={release} issue={attempted ? issue : null} />
    </EditPanel>
  );
}

/**
 * Removing a concept: only one nothing names, since a link to it would be left pointing nowhere.
 * While something does, each is a link to change it, and retiring is offered instead.
 */
export function ConceptRemove({ concept, onDone, onRetire }: { concept: Concept; onDone: () => void; onRetire: () => void }) {
  const { book, base } = useCatalogueContext();
  const release = book.release;
  const navigate = useNavigate();
  const { saveDraft } = useEditing(release);
  const users = conceptUsers(release, concept.id);
  return (
    <EditPanel
      title={`Remove ${concept.pref_label}`}
      focusOnOpen
      action={`Remove “${concept.pref_label}”`}
      actionIcon={<Trash2 size={16} />}
      danger
      busy={saveDraft.isPending}
      problem={users.length ? `Something still names it; ${users.length === 1 ? "change it" : "change those"} first, or retire it instead.` : null}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        void saveDraft
          .mutateAsync(draftBody(release, { business_capabilities: (release.business_capabilities ?? []).filter((item) => item.id !== concept.id) }))
          .then(() => navigate(`${base}/concepts`, { state: { notice: `${concept.pref_label} was removed from the draft.` } }))
          .catch(() => undefined)
      }
    >
      {users.length ? (
        <>
          <p className="cat-edit__lead">It is still named by:</p>
          <ul className="cat-edit__users">
            {users.map((user) => (
              <li key={`${user.path}:${user.text}`}>
                <RouterLink href={`${base}/${user.path}`}>{sentence(user.text)}</RouterLink>
              </li>
            ))}
          </ul>
          <ActionGroup>
            <Button onClick={onRetire}>Retire it instead</Button>
          </ActionGroup>
        </>
      ) : (
        <p className="cat-edit__lead">Requirement work keeps mapping to it until the draft is published. To keep it readable but out of use, retire it instead.</p>
      )}
    </EditPanel>
  );
}

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

const HOW: { value: RelationshipKind; label: string }[] = [
  { value: "calls_api", label: "Calls its API" },
  { value: "publishes_events_to", label: "Sends it events" },
  { value: "transfers_data_to", label: "Sends it data" },
  { value: "orchestrates", label: "Orchestrates it" },
  { value: "unspecified", label: "Depends on it, not said how" },
];

/** Adding a dependency of a system, or changing or removing one. */
export function ConnectionEdit({ system, connection, onDone }: { system: CatalogueSystem; connection?: Relationship; onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [target, setTarget] = useState(connection?.target_system_id ?? "");
  const [kind, setKind] = useState<RelationshipKind>(connection?.kind ?? "calls_api");
  const [text, setText] = useState(connection?.description ?? "");
  const others = release.systems.filter((item) => item.id !== system.id);
  // ADR-0119: one dependency of each kind between two systems.
  const duplicate = release.relationships.some(
    (item) => item !== connection && item.source_system_id === system.id && item.target_system_id === target && item.kind === kind,
  );
  const problem = !target
    ? "Choose the system it depends on."
    : duplicate
      ? "It already depends on that system that way; change that connection instead."
      : !text.trim() ? "Say what the dependency is for." : null;
  const next: Relationship = { source_system_id: system.id, target_system_id: target, kind, description: text.trim(), accepted: connection?.accepted ?? [] };
  const relationships = connection
    ? release.relationships.map((item) => (item === connection ? next : item))
    : [...release.relationships, next];
  return (
    <EditPanel
      title={connection ? "Change the dependency" : `Add a dependency of ${system.name}`}
      action={connection ? "Save the dependency" : "Add the dependency"}
      busy={saveDraft.isPending}
      problem={problem}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => saveDraft.mutate(draftBody(release, { relationships }), { onSuccess: onDone })}
    >
      <div className="cat-form__grid">
        <SystemField label="Depends on" value={target} systems={others} allowNone onChange={setTarget} />
        <SelectField label="How" value={kind} options={HOW} onChange={(value) => setKind(value as RelationshipKind)} />
      </div>
      <AreaField label="For what" value={text} required onChange={setText} />
    </EditPanel>
  );
}

/** One connection's removal: a deliberate step of its own. */
export function ConnectionRemove({ connection, onDone }: { connection: Relationship; onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const name = (id: string) => book.systems.get(id)?.name ?? id;
  return (
    <EditPanel
      title={`Remove the dependency of ${name(connection.source_system_id)} on ${name(connection.target_system_id)}`}
      action="Remove it"
      danger
      busy={saveDraft.isPending}
      problem={null}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        saveDraft.mutate(draftBody(release, { relationships: release.relationships.filter((item) => item !== connection) }), {
          onSuccess: onDone,
        })
      }
    />
  );
}

/**
 * A system's connections edited where they are drawn: both columns of "In context", what it
 * depends on and what depends on it, saved together with the draft.
 */
export function ConnectionsEdit({ system, onDone, onPreview }: {
  system: CatalogueSystem;
  onDone: () => void;
  /** Hears the draft's connections as this edit would save them, at every change, for the map to draw. */
  onPreview?: (relationships: Relationship[]) => void;
}) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [links] = useState(() => linksOf(release, system.id));
  const [dependsOn, setDependsOn] = useState<Link[]>(links.dependsOn);
  const [usedBy, setUsedBy] = useState<Link[]>(links.usedBy);
  // Every change is drawn on the map above at once, before it is saved.
  const changeDependsOn = (next: Link[]) => {
    setDependsOn(next);
    onPreview?.(relationshipsWith(release, system.id, next, usedBy));
  };
  const changeUsedBy = (next: Link[]) => {
    setUsedBy(next);
    onPreview?.(relationshipsWith(release, system.id, dependsOn, next));
  };
  const others = release.systems.filter((item) => item.id !== system.id);
  const name = (id: string) => book.systems.get(id)?.name ?? "another system";
  // The other end's side of it, in its own words: "Calls the API of B2B Web".
  const theirHow = HOW.map(({ value }) => ({ value, label: usedHow(value, system.name) }));
  const fields = (side: "dependsOn" | "usedBy") => (link: Link, update: (patch: Partial<Link>) => void) => (
    <>
      <SystemField label={side === "dependsOn" ? "Depends on" : "System"} value={link.other} systems={others} allowNone onChange={(other) => update({ other })} />
      <SelectField
        label="How"
        value={link.kind}
        options={side === "dependsOn" ? HOW : theirHow}
        onChange={(kind) => update({ kind: kind as RelationshipKind })}
      />
      <AreaField label="For what" value={link.description} required onChange={(description) => update({ description })} />
    </>
  );
  return (
    <EditPanel
      title={`Edit the connections of ${system.name}`}
      focusOnOpen
      action="Save the connections"
      busy={saveDraft.isPending}
      problem={linksProblem(release, system.id, dependsOn, usedBy)}
      changes={linksChanges(release, system.id, dependsOn, usedBy)}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        saveDraft.mutate(draftBody(release, { relationships: relationshipsWith(release, system.id, dependsOn, usedBy) }), { onSuccess: onDone })
      }
    >
      <p className="cat-edit__lead">
        The map's two columns, left to right, in its order. A connection between two systems belongs to both, so it can be edited from
        either. The map shows your changes before you save them.
      </p>
      <div className="cat-form">
        <Rows<Link>
          legend="Depend on it"
          one="system that depends on it"
          items={usedBy}
          onChange={changeUsedBy}
          blank={() => ({ other: "", kind: "calls_api", description: "" })}
          itemLabel={(link, index) => (link.other ? `dependency of ${name(link.other)}` : `dependent ${index + 1}`)}
          render={fields("usedBy")}
        />
        <Rows<Link>
          legend="It depends on"
          one="system it depends on"
          items={dependsOn}
          onChange={changeDependsOn}
          blank={() => ({ other: "", kind: "calls_api", description: "" })}
          itemLabel={(link, index) => (link.other ? `dependency on ${name(link.other)}` : `dependency ${index + 1}`)}
          render={fields("dependsOn")}
        />
      </div>
    </EditPanel>
  );
}

type Interface = NonNullable<Release["interfaces"]>[number];

const STYLES = (Object.keys(INTERFACE_STYLE) as Interface["style"][]).map((value) => ({ value, label: INTERFACE_STYLE[value] }));

/**
 * A system's interfaces edited where its record reads them: those it exposes, each with who uses
 * it and what it carries, and those of other systems it uses, saved together with the draft.
 */
export function InterfacesEdit({ system, onDone }: { system: CatalogueSystem; onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [start] = useState(() => interfacesOfSystem(release, system.id));
  const [exposed, setExposed] = useState<Interface[]>(start.exposed);
  const [used, setUsed] = useState<string[]>(start.used);
  const name = (id: string) => book.systems.get(id)?.name ?? id;
  const systems = release.systems
    .filter((item) => item.id !== system.id)
    .map((item) => ({ value: item.id, label: item.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const entities = [...entityNames(release)].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  // Another system's interfaces, under the system that exposes each.
  const theirs = (release.interfaces ?? [])
    .filter((item) => item.system_id !== system.id)
    .map((item) => ({ value: item.id, label: item.name, group: name(item.system_id) }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  const usedOptions = theirs.map((item) => ({ ...item, label: `${item.label} (${item.group})` }));
  return (
    <EditPanel
      title={`Edit the interfaces of ${system.name}`}
      focusOnOpen
      action="Save the interfaces"
      busy={saveDraft.isPending}
      problem={interfacesProblem(release, system.id, exposed, used)}
      changes={interfacesChanges(release, system.id, exposed, used)}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        saveDraft.mutate(draftBody(release, { interfaces: interfacesWith(release, system.id, exposed, used) }), { onSuccess: onDone })
      }
    >
      <p className="cat-edit__lead">
        The contracts it offers others, and those of other systems it calls. Using an interface makes {system.name} one of its users.
      </p>
      <div className="cat-form">
        <Rows<Interface>
          legend="It exposes"
          one="interface it exposes"
          labelled
          items={exposed}
          onChange={setExposed}
          blank={() => ({ id: "", name: "", system_id: system.id, style: "api", consumer_ids: [], entity_ids: [], open_api_ids: [], relays: [], accepted: [] })}
          itemLabel={(item, index) => `interface ${item.name.trim() || index + 1}`}
          render={(item, update) => (
            <>
              <TextField label="Interface" value={item.name} required onChange={(value) => update({ name: value })} />
              <SelectField label="Style" value={item.style} options={STYLES} onChange={(style) => update({ style: style as Interface["style"] })} />
              <PickField label="Used by" chosen={item.consumer_ids} options={systems} onChange={(consumer_ids) => update({ consumer_ids })} />
              <PickField
                label="Carries"
                hint="The information it carries, from this version's vocabulary."
                chosen={item.entity_ids}
                options={entities}
                onChange={(entity_ids) => update({ entity_ids })}
              />
              <AreaField label="What it is for" value={item.description} onChange={(description) => update({ description: description || null })} />
              <SelectField
                label="How sure its source is"
                value={item.confidence ?? ""}
                options={CONFIDENCE_OPTIONS}
                onChange={(confidence) => update({ confidence: (confidence || null) as SourceConfidence | null })}
              />
              <TextField label="Source" value={item.source} hint="The document and where in it, such as SDD v2.3 · §4.1." onChange={(source) => update({ source: source || null })} />
            </>
          )}
        />
        <fieldset className="cat-form__rows">
          <legend className="cat-form__legend">It uses</legend>
          {theirs.length ? (
            <PickField label="Interfaces of other systems it calls" chosen={used} options={usedOptions} onChange={setUsed} />
          ) : (
            <p className="ds-field__hint">No other system in this version exposes an interface yet.</p>
          )}
        </fieldset>
      </div>
    </EditPanel>
  );
}

/** A domain as edited; a landscape domain keeps whether it is cross-cutting, which the panel doesn't change. */
type Domain = { id: string; name: string; parent_id?: string | null; description?: string | null; cross_cutting?: boolean };

/** One domain tree edited whole: the landscape, or the business areas. */
export function DomainsEdit({ tree, onDone }: { tree: "landscape" | "areas"; onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const original = (tree === "landscape" ? release.landscape_domains : release.capability_domains) ?? [];
  const [items, setItems] = useState<Domain[]>(original);
  const finished = (() => {
    const taken = new Set(items.map((item) => item.id).filter(Boolean));
    return items.map((item) => {
      if (item.id) return item;
      let id = slug(item.name);
      for (let n = 2; taken.has(id); n += 1) id = `${slug(item.name)}-${n}`;
      taken.add(id);
      return { ...item, id };
    });
  })();
  const placed = new Set(
    tree === "landscape"
      ? release.systems.map((system) => system.landscape_domain_id).filter(Boolean)
      : release.systems.flatMap((system) => system.capabilities.map((item) => item.domain_id)).filter(Boolean),
  );
  const gone = original.filter((item) => !items.some((kept) => kept.id === item.id) && placed.has(item.id));
  const problem = items.some((item) => !item.name.trim())
    ? "Every domain needs a name."
    : gone.length
      ? `${gone.map((item) => item.name).join(", ")} still ${gone.length === 1 ? "holds" : "hold"} ${tree === "landscape" ? "systems" : "capabilities"}; move them first.`
      : null;
  const parents = (self: string) => [
    { value: "", label: "At the top" },
    ...finished.filter((item) => item.id !== self && item.name.trim()).map((item) => ({ value: item.id, label: item.name })),
  ];
  return (
    <EditPanel
      title={tree === "landscape" ? "Edit where systems sit" : "Edit the business areas"}
      focusOnOpen
      action="Save the domains"
      busy={saveDraft.isPending}
      problem={problem}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        saveDraft.mutate(draftBody(release, tree === "landscape" ? { landscape_domains: finished.map((item) => ({ ...item, cross_cutting: item.cross_cutting ?? false, accepted: [] })) } : { capability_domains: finished.map((item) => ({ ...item, accepted: [] })) }), {
          onSuccess: onDone,
        })
      }
    >
      <Rows<Domain>
        legend="Domains"
        one="domain"
        items={items}
        onChange={setItems}
        blank={() => ({ id: "", name: "", parent_id: null })}
        itemLabel={(item, index) => `domain ${item.name || index + 1}`}
        render={(item, update, index) => (
          <>
            <TextField label="Name" value={item.name} required onChange={(name) => update({ name })} />
            <SelectField
              label="Inside"
              value={item.parent_id ?? ""}
              options={parents(finished[index]?.id ?? "")}
              onChange={(parent) => update({ parent_id: parent || null })}
            />
            <AreaField label="What it covers" value={item.description} onChange={(description) => update({ description: description || null })} />
          </>
        )}
      />
    </EditPanel>
  );
}

/** The channels edited whole: where orders are placed and the system that takes them in. */
export function ChannelsEdit({ onDone }: { onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const original = release.channels ?? [];
  const [items, setItems] = useState<Channel[]>(original);
  const finished = (() => {
    const taken = new Set(items.map((item) => item.id).filter(Boolean));
    return items.map((item) => {
      if (item.id) return item;
      let id = slug(item.name);
      for (let n = 2; taken.has(id); n += 1) id = `${slug(item.name)}-${n}`;
      taken.add(id);
      return { ...item, id };
    });
  })();
  const gone = original.filter((item) => !items.some((kept) => kept.id === item.id));
  const named = gone.flatMap((item) => channelUses(release, item.id).map((use) => `${item.name} (${use})`));
  const names = items.map((item) => item.name.trim().toLocaleLowerCase());
  const problem = items.some((item) => !item.name.trim())
    ? "Every channel needs a name."
    : new Set(names).size !== names.length
      ? "Two channels have the same name."
      : named.length
        ? `Still named: ${named.join(", ")}. Take the channel off those first.`
        : null;
  return (
    <EditPanel
      title="Edit the channels"
      focusOnOpen
      action="Save the channels"
      busy={saveDraft.isPending}
      problem={problem}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => saveDraft.mutate(draftBody(release, { channels: finished }), { onSuccess: onDone })}
    >
      <Rows<Channel>
        legend="Channels"
        one="channel"
        items={items}
        onChange={setItems}
        blank={() => ({ id: "", name: "", accepted: [] })}
        itemLabel={(item, index) => `channel ${item.name || index + 1}`}
        render={(item, update) => (
          <>
            <TextField label="Name" value={item.name} required onChange={(name) => update({ name })} />
            <TextField label="Kind" value={item.kind} onChange={(kind) => update({ kind: kind || null })} />
            <SystemField
              label="Orders enter through"
              value={item.entry_system_id ?? ""}
              systems={release.systems}
              allowNone
              onChange={(id) => update({ entry_system_id: id || null })}
            />
            <AreaField label="What it is" value={item.description} onChange={(description) => update({ description: description || null })} />
          </>
        )}
      />
    </EditPanel>
  );
}

/** Adding an offering: what it is first; its sheet then takes each section on its own. */
export function OfferingEdit({ onDone }: { onDone: (saved?: string) => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [blank] = useState<Offering>(() => ({
    id: "", name: "", rules: [], order_types: [], components: [], values: [], audiences: [], nfrs: [], lifecycle_notes: [],
    sources: [], questions: [], decisions: [], boundaries: [], not_used: [], plans: [], business_rules: [], accepted: [], former_ids: [],
    deprecated: false,
  }));
  const [value, setValue] = useState<Offering>(blank);
  const [attempted, setAttempted] = useState(false);
  const products = release.products ?? [];
  const clash = products.some((item) => item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase());
  return (
    <EditPanel
      title="Add an offering"
      focusOnOpen
      action="Add the offering"
      busy={saveDraft.isPending}
      problem={offeringProblem(value) ?? (clash ? "Another offering has that name." : null)}
      changes={offeringChanged(blank, value) ? ["the new offering"] : []}
      onAttempt={() => setAttempted(true)}
      error={saveDraft.error}
      onCancel={() => onDone()}
      onSubmit={() => {
        const finished = finishedOffering({ ...value, id: slug(value.name) });
        saveDraft.mutate(draftBody(release, { products: [...products, finished] }), { onSuccess: () => onDone(finished.id) });
      }}
    >
      <p className="cat-edit__lead">Say what it is; its order types, parts and the rest are added on its sheet, one section at a time.</p>
      <div className="cat-form">
        <OfferingFacts
          value={value}
          onChange={setValue}
          systems={release.systems}
          channels={release.channels ?? []}
          offerings={release.products ?? []}
          release={release}
          errorAt={(path) => (attempted && offeringIssue(value)?.at === path ? offeringIssue(value)!.message : null)}
        />
      </div>
    </EditPanel>
  );
}

/**
 * One section of an offering, edited in place of where it is read: the rest of the
 * offering stays as it is and is sent unchanged with it.
 */
export function OfferingSectionEdit({ offering, section, onDone }: { offering: Offering; section: OfferingSection; onDone: () => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [value, setValue] = useState<Offering>(offering);
  const products = release.products ?? [];
  const clash = products.some((item) => item.id !== offering.id && item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase());
  const { edit, save, Fields } = OFFERING_SECTIONS[section];
  // A problem one field holds is said under it once Save has been tried, and the verb only points there.
  const [attempted, setAttempted] = useState(false);
  const issue = offeringIssue(value);
  const errorAt = (path: string) => (attempted && issue?.at === path ? issue.message : null);
  return (
    <EditPanel
      title={section === "facts" ? `Edit what ${offering.name} is` : `Edit ${edit} of ${offering.name}`}
      focusOnOpen
      action={save}
      busy={saveDraft.isPending}
      problem={
        (issue && (issue.at ? `Correct ${issue.field} first.` : issue.message)) ??
        realisationProblem(value, release) ??
        journeyOrderProblem(value, release.journeys ?? []) ??
        questionProblem(value, release.conflicts ?? []) ??
        (clash ? "Another offering has that name." : null)
      }
      // A section that would save the offering differently asks before Cancel, Escape or a link throw it away.
      changes={offeringChanged(offering, value) ? [section === "facts" ? "what it is" : edit] : []}
      onAttempt={() => setAttempted(true)}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => {
        const finished = finishedOffering(value);
        const next = products.map((item) => (item.id === offering.id ? finished : item));
        saveDraft.mutate(draftBody(release, { products: next }), { onSuccess: onDone });
      }}
    >
      <p className="cat-edit__lead">The other sections can be edited once this one is saved or cancelled.</p>
      <div className="cat-form">
        <Fields
          value={value}
          onChange={setValue}
          systems={release.systems}
          channels={release.channels ?? []}
          register={release.sources ?? []}
          release={release}
          errorAt={errorAt}
        />
      </div>
    </EditPanel>
  );
}

/** A journey edited whole, or added. */
export function JourneyEdit({ journey, onDone }: { journey?: Journey; onDone: (saved?: string) => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const [value, setValue] = useState<Journey>(
    () => journey ?? { id: "", name: "", activities: [], flow_rules: [], integrations: [], edges: [], channel_edges: [], shared_edges: [], accepted: [], former_ids: [] },
  );
  const journeys = release.journeys ?? [];
  return (
    <EditPanel
      title={journey ? `Edit ${journey.name}` : "Add a journey"}
      action={journey ? "Save the journey" : "Add the journey"}
      busy={saveDraft.isPending}
      problem={journeyProblem(value)}
      error={saveDraft.error}
      onCancel={() => onDone()}
      onSubmit={() => {
        const finished = { ...value, id: value.id || slug(value.name), edges: [] };
        const next = journey ? journeys.map((item) => (item.id === journey.id ? finished : item)) : [...journeys, finished];
        saveDraft.mutate(draftBody(release, { journeys: next }), { onSuccess: () => onDone(finished.id) });
      }}
    >
      <JourneyEditor
        value={value}
        onChange={setValue}
        systems={release.systems}
        offerings={release.products ?? []}
        channels={release.channels ?? []}
        interfaces={release.interfaces ?? []}
      />
    </EditPanel>
  );
}

/** Removing an offering or a journey: journeys tied to an offering must go or move first. */
export function WholeRemove({ kind, item, onDone }: { kind: "offering" | "journey"; item: Offering | Journey; onDone: (removed: boolean) => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { saveDraft } = useEditing(release);
  const tied = kind === "offering" ? (release.journeys ?? []).filter((journey) => journey.product_id === item.id) : [];
  return (
    <EditPanel
      title={`Remove ${item.name}`}
      focusOnOpen
      action="Remove it from the draft"
      danger
      busy={saveDraft.isPending}
      problem={tied.length ? `${tied.map((journey) => journey.name).join(", ")} ${tied.length === 1 ? "fulfils" : "fulfil"} it; edit or remove ${tied.length === 1 ? "that journey" : "those journeys"} first.` : null}
      error={saveDraft.error}
      onCancel={() => onDone(false)}
      onSubmit={() =>
        void saveDraft
          .mutateAsync(
            draftBody(
              release,
              kind === "offering"
                ? { products: (release.products ?? []).filter((offering) => offering.id !== item.id) }
                : { journeys: (release.journeys ?? []).filter((journey) => journey.id !== item.id) },
            ),
          )
          .then(() => onDone(true))
          .catch(() => undefined)
      }
    />
  );
}

/** What an id may be: it is part of a page's address. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

/**
 * A new id for an offering or journey. Precedents, change requests and requirement work that
 * name the old id still find it: the old id is kept as a former id.
 */
export function WholeRename({ kind, item, onDone }: { kind: "offering" | "journey"; item: Offering | Journey; onDone: (newId: string | null) => void }) {
  const { book } = useCatalogueContext();
  const release = book.release;
  const { renameEntity } = useEditing(release);
  const [newId, setNewId] = useState(item.id);
  const wanted = newId.trim();
  const siblings: (Offering | Journey)[] = kind === "offering" ? release.products ?? [] : release.journeys ?? [];
  const taken = siblings.some((other) => other.id !== item.id && (other.id === wanted || (other.former_ids ?? []).includes(wanted)));
  const problem = !wanted
    ? "Give it an id."
    : wanted === item.id
      ? "Type the id it should have."
      : !ID_PATTERN.test(wanted)
        ? "An id is up to 200 letters, digits, dots, dashes and underscores, with no spaces."
        : taken
          ? `${wanted} is already the id, or a former id, of another ${kind}.`
          : null;
  return (
    <EditPanel
      title={`Change the id of ${item.name}`}
      focusOnOpen
      action="Change the id"
      busy={renameEntity.isPending}
      // The field says what is wrong; the button only points to it.
      problem={problem && wanted !== item.id ? "Correct the new id first." : problem}
      error={renameEntity.error}
      onCancel={() => onDone(null)}
      onSubmit={() =>
        void renameEntity
          .mutateAsync({ kind: kind === "offering" ? "offerings" : "journeys", id: item.id, newId: wanted })
          .then(() => onDone(wanted))
          .catch(() => undefined)
      }
    >
      <p className="cat-quiet">
        What still names <code>{item.id}</code> finds it under its new id: the old one is kept as a former id.
      </p>
      {/* The id as it stands is no error, only nothing to save yet. */}
      <TextField label="New id" value={newId} dir="ltr" required onChange={setNewId} error={wanted === item.id ? null : problem} />
    </EditPanel>
  );
}
