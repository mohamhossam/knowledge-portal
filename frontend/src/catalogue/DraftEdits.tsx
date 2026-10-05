import { type FormEvent, type ReactNode, type Ref, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CatalogueSystem, Channel, Journey, Offering, Relationship, RelationshipKind } from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { blankSystem, channelUses, draftBody, systemUses } from "./drafting";
import { finishedOffering, finishedSystem, journeyOrderProblem, journeyProblem, offeringProblem, slug, systemProblem } from "./editing";
import { AreaField, Rows, SelectField, SystemField, TextField } from "./forms";
import { JourneyEditor } from "./JourneyEditor";
import { OfferingFacts } from "./OfferingEditor";
import { questionProblem } from "./governance";
import { OFFERING_SECTIONS, type OfferingSection } from "./offeringSections";
import { SystemEditor } from "./SystemEditor";
import { useCatalogueContext } from "./useCatalogue";
import { useEditing } from "./useEditing";

/**
 * An edit opened in place where the thing is read: on the stock band, closing
 * on a heavy rule, never a modal. It says why its action waits and what failed.
 */
export function EditPanel({ title, children, action, busy, problem, error, onSubmit, onCancel, danger, conflictMessage, focusOnOpen, level = 3 }: {
  title: string;
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
  const Heading = level === 2 ? "h2" : "h3";
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen]);
  const conflict = error instanceof ApiError && error.status === 409;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problem && !busy) onSubmit();
  };
  return (
    <form
      className={danger ? "edit-panel edit-panel--remove" : "edit-panel"}
      aria-labelledby={`${id}-title`}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <Heading id={`${id}-title`} ref={heading} tabIndex={focusOnOpen ? -1 : undefined} className="edit-panel__title">{title}</Heading>
      {children}
      {error ? (
        <p className="docpage__failure" role="alert">
          {conflict
            ? conflictMessage ?? "The draft changed while you edited (someone else, or a document's reading). Reload the page; your edit was not saved."
            : errorMessage(error)}
        </p>
      ) : null}
      <div className="edit-panel__foot">
        <p className="edit-panel__actions">
          <button type="submit" className="action-button" disabled={!!problem || busy} aria-describedby={problem ? `${id}-why` : undefined}>
            {busy ? "Saving…" : action}
          </button>
          <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
        </p>
        {problem && <p id={`${id}-why`} className="versions__waits">{problem}</p>}
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
  const [value, setValue] = useState<CatalogueSystem>(() => system ?? blankSystem());
  return (
    <EditPanel
      title={system ? `Edit ${system.name}` : "Add a system"}
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
      <p className="edit-panel__lead">
        {links
          ? `Its ${links === 1 ? "connection goes" : `${links} connections go`} with it. `
          : ""}
        Requirement work keeps mapping to it until the draft is published.
      </p>
    </EditPanel>
  );
}

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
  const duplicate = release.relationships.some(
    (item) => item !== connection && item.source_system_id === system.id && item.target_system_id === target,
  );
  const problem = !target
    ? "Choose the system it depends on."
    : duplicate
      ? "It already depends on that system; change that connection instead."
      : !text.trim() ? "Say what the dependency is for." : null;
  const next: Relationship = { source_system_id: system.id, target_system_id: target, kind, description: text.trim() };
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
      <div className="form__grid">
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

type Domain = { id: string; name: string; name_ar?: string | null; parent_id?: string | null; description?: string | null };

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
      action="Save the domains"
      busy={saveDraft.isPending}
      problem={problem}
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() =>
        saveDraft.mutate(draftBody(release, tree === "landscape" ? { landscape_domains: finished } : { capability_domains: finished }), {
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
            <TextField label="Arabic name" value={item.name_ar} dir="rtl" onChange={(name_ar) => update({ name_ar: name_ar || null })} />
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
        blank={() => ({ id: "", name: "" })}
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
  const [value, setValue] = useState<Offering>(
    () => ({
      id: "", name: "", rules: [], order_types: [], components: [], values: [], audiences: [], nfrs: [], lifecycle_notes: [],
      sources: [], questions: [], decisions: [], boundaries: [], not_used: [],
    }),
  );
  const products = release.products ?? [];
  const clash = products.some((item) => item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase());
  return (
    <EditPanel
      title="Add an offering"
      focusOnOpen
      action="Add the offering"
      busy={saveDraft.isPending}
      problem={offeringProblem(value) ?? (clash ? "Another offering has that name." : null)}
      error={saveDraft.error}
      onCancel={() => onDone()}
      onSubmit={() => {
        const finished = finishedOffering({ ...value, id: slug(value.name) });
        saveDraft.mutate(draftBody(release, { products: [...products, finished] }), { onSuccess: () => onDone(finished.id) });
      }}
    >
      <p className="govsection__lead">Say what it is; its order types, parts and the rest are added on its sheet, one section at a time.</p>
      <div className="form">
        <OfferingFacts value={value} onChange={setValue} systems={release.systems} channels={release.channels ?? []} />
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
  return (
    <EditPanel
      title={section === "facts" ? `Edit what ${offering.name} is` : `Edit ${edit} of ${offering.name}`}
      focusOnOpen
      action={save}
      busy={saveDraft.isPending}
      problem={
        offeringProblem(value) ??
        journeyOrderProblem(value, release.journeys ?? []) ??
        questionProblem(value, release.conflicts ?? []) ??
        (clash ? "Another offering has that name." : null)
      }
      error={saveDraft.error}
      onCancel={onDone}
      onSubmit={() => {
        const finished = finishedOffering(value);
        const next = products.map((item) => (item.id === offering.id ? finished : item));
        saveDraft.mutate(draftBody(release, { products: next }), { onSuccess: onDone });
      }}
    >
      <p className="govsection__lead">The other sections can be edited once this one is saved or cancelled.</p>
      <div className="form">
        <Fields value={value} onChange={setValue} systems={release.systems} channels={release.channels ?? []} register={release.sources ?? []} />
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
    () => journey ?? { id: "", name: "", activities: [], flow_rules: [], integrations: [], edges: [] },
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

/** A draft-only text button that opens an edit, styled like the rest. */
export function EditButton({ children, onClick, expanded, id, ref }: {
  children: ReactNode;
  onClick: () => void;
  expanded?: boolean;
  id?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button type="button" ref={ref} id={id} className="text-button" aria-expanded={expanded} onClick={onClick}>
      {children}
    </button>
  );
}

