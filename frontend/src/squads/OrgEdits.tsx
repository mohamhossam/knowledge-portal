import { Plus, X } from "lucide-react";
import { type RefObject, useId, useState } from "react";

import type { OrgProduct, Person, Release, Squad, SquadResource, SquadRole, ValueStream } from "../api/client";
import { Button, Checkbox, ConsequencePanel, FormPanel, Select, TextArea, TextField } from "../design/components";
import { plural } from "../library/where";
import {
  activePeople,
  conceptName,
  conceptsOf,
  freeId,
  giveSystems,
  holdsRoles,
  ROLES,
  roleLabel,
  rolesOf,
  runBy,
  suggestSquad,
  systemIdsOf,
} from "./organisation";
import { failureOf, useOrgContext } from "./useOrganisation";

const NO_RELEASE = "No architecture version is in service, so systems can't be linked yet.";
const orNull = (text: string | null | undefined) => (text && text.trim() ? text.trim() : null);

type Panel = { panelRef: RefObject<HTMLElement | null> };
/** Called with the saved record's id once it is saved; `onDone` when not given. */
type Saved = { onSaved?: (id: string) => void };

/** The people who can hold a role, as options; the current one stays even if no longer active. */
function PersonOptions({ people, current, none }: { people: Person[]; current: string | null | undefined; none: string }) {
  return (
    <>
      <option value="">{none}</option>
      {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      {current && !people.some((person) => person.id === current) && <option value={current}>{current} (no longer active)</option>}
    </>
  );
}

function RoleOptions() {
  return <>{ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</>;
}

function StreamOptions() {
  const { org } = useOrgContext();
  return <>{org.value_streams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</>;
}

export function PersonEdit({ person, onDone, onSaved, panelRef }: { person?: Person; onDone: () => void } & Saved & Panel) {
  const { org, hook } = useOrgContext();
  const [value, setValue] = useState<Person>(() => person ?? { id: "", name: "", email: null, team: null, active: true, revision: 0 });
  const roles = person ? rolesOf(org, person.id) : null;
  const locked = Boolean(person?.active && roles !== null && holdsRoles(roles));
  const email = value.email?.trim();
  const problem = !value.name.trim()
    ? "Give the person a name."
    : email && !email.includes("@")
      ? "An email address has an @."
      : email && org.people.some((item) => item.id !== person?.id && item.email?.toLocaleLowerCase() === email.toLocaleLowerCase())
        ? "Someone else has that email address."
        : null;
  return (
    <FormPanel
      panelRef={panelRef}
      headingLevel={3}
      title={person ? <>Edit <bdi>{person.name}</bdi></> : "Add a person"}
      submitLabel={person ? "Save the person" : "Add the person"}
      busy={hook.save.isPending}
      problem={problem}
      failure={failureOf(hook.save.error)}
      onCancel={onDone}
      onSubmit={() =>
        hook.save.mutate(
          {
            kind: "people",
            isNew: !person,
            record: {
              ...value,
              id: person?.id ?? freeId(value.name, org.people.map((item) => item.id)),
              name: value.name.trim(),
              email: orNull(value.email),
              team: orNull(value.team),
            },
          },
          { onSuccess: (_, saved) => (onSaved ? onSaved(saved.record.id) : onDone()) },
        )
      }
    >
      <div className="own-form__grid">
        <TextField label="Name" required value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} />
        <TextField label="Email" type="email" dir="ltr" value={value.email ?? ""} onChange={(event) => setValue({ ...value, email: event.target.value })} />
        <TextField label="Team" value={value.team ?? ""} onChange={(event) => setValue({ ...value, team: event.target.value })} />
      </div>
      {person && (
        <Checkbox
          label="Active: can lead, be a scrum master or hold a seat"
          hint={locked ? <><bdi>{person.name}</bdi> still holds a role. Hand it to someone else before marking them inactive.</> : undefined}
          checked={value.active}
          disabled={locked}
          onChange={(event) => setValue({ ...value, active: event.target.checked })}
        />
      )}
    </FormPanel>
  );
}

export function StreamEdit({ stream, onDone, panelRef }: { stream?: ValueStream; onDone: () => void } & Panel) {
  const { org, hook } = useOrgContext();
  const [value, setValue] = useState<ValueStream>(() => stream ?? { id: "", name: "", lead_person_id: null, revision: 0 });
  const clash = org.value_streams.some(
    (item) => item.id !== stream?.id && item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase(),
  );
  return (
    <FormPanel
      panelRef={panelRef}
      headingLevel={3}
      title={stream ? <>Edit <bdi>{stream.name}</bdi></> : "Add a value stream"}
      submitLabel={stream ? "Save the value stream" : "Add the value stream"}
      busy={hook.save.isPending}
      problem={!value.name.trim() ? "Give the value stream a name." : clash ? "Another value stream has that name." : null}
      failure={failureOf(hook.save.error)}
      onCancel={onDone}
      onSubmit={() =>
        hook.save.mutate(
          {
            kind: "value-streams",
            isNew: !stream,
            record: {
              ...value,
              id: stream?.id ?? freeId(value.name, org.value_streams.map((item) => item.id)),
              name: value.name.trim(),
              lead_person_id: value.lead_person_id || null,
            },
          },
          { onSuccess: onDone },
        )
      }
    >
      <div className="own-form__grid">
        <TextField label="Name" required value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} />
        <Select label="Led by" value={value.lead_person_id ?? ""} onChange={(event) => setValue({ ...value, lead_person_id: event.target.value || null })}>
          <PersonOptions people={activePeople(org)} current={value.lead_person_id} none="No lead named" />
        </Select>
      </div>
    </FormPanel>
  );
}

/** Each portfolio node in service by its path, "Enterprise › Fixed › SMB", in path order. */
function portfolioOptions(release: Release | null, current: string | null | undefined) {
  const nodes = release?.portfolio ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path = (id: string) => {
    const names: string[] = [];
    for (let node = byId.get(id); node && names.length <= nodes.length; node = node.parent_id ? byId.get(node.parent_id) : undefined) {
      names.unshift(node.name);
    }
    return names.join(" › ");
  };
  return [
    ...nodes.map((node) => ({ value: node.id, label: path(node.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    ...(current && !byId.has(current) ? [{ value: current, label: `${current} (not in the catalogue in service)` }] : []),
  ];
}

/** A list of things to tick, with a find field when it is long; what is ticked always stays in view. */
function Checklist({ legend, items, chosen, onChange, empty, findable }: {
  legend: string;
  items: { id: string; name: string }[];
  chosen: string[];
  onChange: (next: string[]) => void;
  empty: string;
  findable?: boolean;
}) {
  const [find, setFind] = useState("");
  const wanted = find.trim().toLocaleLowerCase();
  const shown = items.filter((item) => !wanted || item.name.toLocaleLowerCase().includes(wanted) || chosen.includes(item.id));
  return (
    <fieldset className="own-form__set">
      <legend className="ds-field__label">{legend} ({chosen.length} chosen)</legend>
      {items.length === 0 ? (
        <p className="ds-field__hint">{empty}</p>
      ) : (
        <>
          {findable && <TextField label="Find" type="search" autoComplete="off" value={find} onChange={(event) => setFind(event.target.value)} />}
          <div className="own-form__checks">
            {shown.map((item) => (
              <Checkbox
                key={item.id}
                label={<bdi>{item.name}</bdi>}
                checked={chosen.includes(item.id)}
                onChange={(event) => onChange(event.target.checked ? [...chosen, item.id] : chosen.filter((id) => id !== item.id))}
              />
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}

/** A product: its value stream, what it is, the offerings it sells, where it sits, and the systems it rests on. */
export function ProductEdit({ product, streamId, onDone, onSaved, panelRef }: { product?: OrgProduct; streamId?: string; onDone: () => void } & Saved & Panel) {
  const { org, release, hook } = useOrgContext();
  const [value, setValue] = useState<OrgProduct>(
    () => product ?? {
      id: "", name: "", description: "", value_stream_id: streamId ?? org.value_streams[0]?.id ?? "",
      system_ids: [], offering_ids: [], portfolio_node_id: null, revision: 0,
    },
  );
  const offerings = release?.products ?? [];
  const offeringChoices = [
    ...[...offerings].sort((a, b) => a.name.localeCompare(b.name)).map((offering) => ({ id: offering.id, name: offering.name })),
    ...(product?.offering_ids ?? [])
      .filter((offeringId) => !offerings.some((offering) => offering.id === offeringId))
      .map((offeringId) => ({ id: offeringId, name: `${offeringId} (not in the catalogue in service)` })),
  ];
  const inService = release?.systems ?? [];
  const systemChoices = [
    ...[...inService].sort((a, b) => a.name.localeCompare(b.name)).map((system) => ({ id: system.id, name: system.name })),
    ...(product?.system_ids ?? [])
      .filter((systemId) => !inService.some((system) => system.id === systemId))
      .map((systemId) => ({ id: systemId, name: `${systemId} (not in the catalogue in service)` })),
  ];
  const clash = org.products.some(
    (item) => item.id !== product?.id && item.value_stream_id === value.value_stream_id
      && item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase(),
  );
  const problem = !release
    ? NO_RELEASE
    : !value.name.trim() ? "Give the product a name." : clash ? "This value stream already has a product with that name." : null;
  return (
    <FormPanel
      panelRef={panelRef}
      headingLevel={3}
      title={product ? <>Edit <bdi>{product.name}</bdi></> : "Add a product"}
      submitLabel={product ? "Save the product" : "Add the product"}
      busy={hook.save.isPending}
      problem={problem}
      failure={failureOf(hook.save.error)}
      onCancel={onDone}
      onSubmit={() =>
        hook.save.mutate(
          {
            kind: "products",
            isNew: !product,
            record: {
              ...value,
              id: product?.id ?? freeId(value.name, org.products.map((item) => item.id)),
              name: value.name.trim(),
              portfolio_node_id: value.portfolio_node_id || null,
            },
          },
          { onSuccess: (_, saved) => (onSaved ? onSaved(saved.record.id) : onDone()) },
        )
      }
    >
      <div className="own-form__grid">
        <TextField label="Name" required value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} />
        <Select label="Value stream" value={value.value_stream_id} onChange={(event) => setValue({ ...value, value_stream_id: event.target.value })}>
          <StreamOptions />
        </Select>
        <Select
          label="Where it sits in the portfolio"
          value={value.portfolio_node_id ?? ""}
          onChange={(event) => setValue({ ...value, portfolio_node_id: event.target.value || null })}
        >
          <option value="">Not placed in the portfolio</option>
          {portfolioOptions(release, value.portfolio_node_id).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </div>
      <TextArea label="What it is" value={value.description ?? ""} onChange={(event) => setValue({ ...value, description: event.target.value })} />
      <Checklist
        legend="Offerings it sells"
        items={offeringChoices}
        chosen={value.offering_ids}
        onChange={(offering_ids) => setValue({ ...value, offering_ids })}
        empty="The version in service has no offerings yet."
      />
      <Checklist
        legend="Systems it rests on"
        items={systemChoices}
        chosen={value.system_ids}
        onChange={(system_ids) => setValue({ ...value, system_ids })}
        empty="The version in service has no systems yet."
        findable
      />
    </FormPanel>
  );
}

const seatKey = (item: SquadResource) => `${item.system_id}|${item.capability_id ?? ""}|${item.person_id || `open:${item.role}`}`;

/** A squad: its value stream, scrum master, and its people on each system it runs, each in a role. */
export function SquadEdit({ squad, onDone, onSaved, panelRef }: { squad?: Squad; onDone: () => void } & Saved & Panel) {
  const { org, release, hook } = useOrgContext();
  const id = useId();
  const [value, setValue] = useState<Squad>(
    () => squad ?? { id: "", name: "", value_stream_id: org.value_streams[0]?.id ?? "", scrum_master_person_id: null, resources: [], revision: 0 },
  );
  const inService = [...(release?.systems ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const lapsed = (squad ? systemIdsOf(squad) : []).filter((systemId) => !inService.some((system) => system.id === systemId));
  const systemName = (systemId: string) => inService.find((system) => system.id === systemId)?.name ?? systemId;
  const clash = org.squads.some(
    (item) => item.id !== squad?.id && item.value_stream_id === value.value_stream_id
      && item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase(),
  );
  const seats = value.resources.filter((item) => item.system_id).map(seatKey);
  const problem = !release
    ? NO_RELEASE
    : !value.name.trim()
      ? "Give the squad a name."
      : clash
        ? "This value stream already has a squad with that name."
        : value.resources.some((item) => !item.system_id)
          ? "Choose a system on every seat, or remove the seat."
          : new Set(seats).size !== seats.length
            ? "Someone is on the same system and capability twice, or it has two open seats in one role; remove one."
            : null;
  const update = (index: number, patch: Partial<SquadResource>) =>
    setValue({ ...value, resources: value.resources.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
  const seatName = (item: SquadResource, index: number) => {
    const scope = item.capability_id ? ` › ${conceptName(release, item.capability_id)}` : "";
    return item.system_id ? `${roleLabel(item.role).toLocaleLowerCase()} seat on ${systemName(item.system_id)}${scope}` : `seat ${index + 1}`;
  };
  return (
    <FormPanel
      panelRef={panelRef}
      headingLevel={3}
      title={squad ? <>Edit <bdi>{squad.name}</bdi></> : "Add a squad"}
      submitLabel={squad ? "Save the squad" : "Add the squad"}
      busy={hook.save.isPending}
      problem={problem}
      failure={failureOf(hook.save.error)}
      onCancel={onDone}
      onSubmit={() =>
        hook.save.mutate(
          {
            kind: "squads",
            isNew: !squad,
            record: {
              ...value,
              id: squad?.id ?? freeId(value.name, org.squads.map((item) => item.id)),
              name: value.name.trim(),
              scrum_master_person_id: value.scrum_master_person_id || null,
              resources: value.resources.map((item) => ({
                system_id: item.system_id,
                role: item.role,
                person_id: item.person_id || null,
                capability_id: item.capability_id || null,
              })),
            },
          },
          { onSuccess: (_, saved) => (onSaved ? onSaved(saved.record.id) : onDone()) },
        )
      }
    >
      <div className="own-form__grid">
        <TextField label="Name" required value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} />
        <Select label="Value stream" value={value.value_stream_id} onChange={(event) => setValue({ ...value, value_stream_id: event.target.value })}>
          <StreamOptions />
        </Select>
        <Select label="Scrum master" value={value.scrum_master_person_id ?? ""} onChange={(event) => setValue({ ...value, scrum_master_person_id: event.target.value || null })}>
          <PersonOptions people={activePeople(org)} current={value.scrum_master_person_id} none="No one named" />
        </Select>
      </div>
      <fieldset className="own-form__set">
        <legend className="ds-field__label">Who works on the systems it runs ({plural(value.resources.length, "seat")})</legend>
        {value.resources.length === 0 && <p className="ds-field__hint">No seat yet.</p>}
        {value.resources.map((item, index) => {
          // A seat covers the whole system, or one capability concept the system's capabilities link to.
          const linked = conceptsOf(release, item.system_id);
          return (
            <fieldset key={index} className="own-form__seat">
              <legend className="ds-visually-hidden">{seatName(item, index)}</legend>
              <Select label="System" value={item.system_id} onChange={(event) => update(index, { system_id: event.target.value, capability_id: null })}>
                {!item.system_id && <option value="">Choose a system</option>}
                {inService.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
                {lapsed.filter((systemId) => systemId === item.system_id).map((systemId) => (
                  <option key={systemId} value={systemId}>{systemId} (not in the catalogue in service)</option>
                ))}
              </Select>
              <Select label="Capability" value={item.capability_id ?? ""} onChange={(event) => update(index, { capability_id: event.target.value || null })}>
                <option value="">Whole system</option>
                {linked.map((concept) => <option key={concept.id} value={concept.id}>{concept.name}</option>)}
                {item.capability_id && !linked.some((concept) => concept.id === item.capability_id) && (
                  <option value={item.capability_id}>{conceptName(release, item.capability_id)} (no longer linked)</option>
                )}
              </Select>
              <Select label="Role" value={item.role} onChange={(event) => update(index, { role: event.target.value as SquadRole })}>
                <RoleOptions />
              </Select>
              <Select label="Person" value={item.person_id ?? ""} onChange={(event) => update(index, { person_id: event.target.value || null })}>
                <PersonOptions people={activePeople(org)} current={item.person_id} none="Open seat: no one yet" />
              </Select>
              <Button
                variant="quiet"
                icon={<X size={14} />}
                className="own-form__remove"
                aria-label={`Remove the ${seatName(item, index)}`}
                onClick={() => setValue({ ...value, resources: value.resources.filter((_, at) => at !== index) })}
              >
                Remove
              </Button>
            </fieldset>
          );
        })}
        <div>
          <Button
            id={`${id}-add-seat`}
            icon={<Plus size={14} />}
            onClick={() => setValue({ ...value, resources: [...value.resources, { system_id: "", role: "developer", person_id: null, capability_id: null }] })}
          >
            Add {value.resources.length ? "another" : "a"} seat
          </Button>
        </div>
      </fieldset>
    </FormPanel>
  );
}

/**
 * Giving systems to one squad in a single save: a seat on each, in a role,
 * for a person or open. The squad that runs related systems is offered first.
 */
export function GiveSystems({ systemIds, onDone, onCancel, panelRef }: {
  systemIds: string[];
  onDone: (said: string) => void;
  onCancel: () => void;
} & Panel) {
  const { org, release, hook } = useOrgContext();
  const suggestion = suggestSquad(org, systemIds);
  const [squadId, setSquadId] = useState(suggestion?.squad.id ?? "");
  const [role, setRole] = useState<SquadRole>("system_contact");
  const [personId, setPersonId] = useState("");
  const squad = org.squads.find((item) => item.id === squadId);
  const name = (systemId: string) => release?.systems.find((system) => system.id === systemId)?.name ?? systemId;
  const already = squad ? systemIds.filter((systemId) => systemIdsOf(squad).includes(systemId)) : [];
  const given = systemIds.filter((systemId) => !already.includes(systemId));
  const person = org.people.find((item) => item.id === personId);
  const streams = [...org.value_streams].sort((a, b) => a.name.localeCompare(b.name));
  const problem = !release
    ? NO_RELEASE
    : org.squads.length === 0
      ? "There is no squad yet; add one on the Squads page."
      : !squad
        ? "Choose the squad that runs them."
        : given.length === 0
          ? "It already runs every system chosen."
          : null;
  const list = (ids: string[]) => ids.map((systemId, index) => <span key={systemId}>{index > 0 && ", "}<bdi>{name(systemId)}</bdi></span>);
  return (
    <FormPanel
      panelRef={panelRef}
      headingLevel={3}
      title={`Give ${plural(systemIds.length, "system")} to a squad`}
      submitLabel={squad && given.length ? `Give ${plural(given.length, "system")} to ${squad.name}` : "Give them to the squad"}
      busy={hook.save.isPending}
      problem={problem}
      failure={failureOf(hook.save.error)}
      onCancel={onCancel}
      onSubmit={() =>
        squad &&
        hook.save.mutate(
          { kind: "squads", isNew: false, record: giveSystems(squad, given, role, personId || null) },
          { onSuccess: () => onDone(`Gave ${plural(given.length, "system")} to ${squad.name}.`) },
        )
      }
    >
      <div className="own-form__grid">
        <Select
          label="Squad"
          value={squadId}
          hint={suggestion ? `Suggested: ${suggestion.squad.name}, because ${suggestion.reason}.` : "No squad runs a related system yet."}
          onChange={(event) => setSquadId(event.target.value)}
        >
          <option value="">Choose a squad</option>
          {streams.map((stream) => {
            const squads = org.squads.filter((item) => item.value_stream_id === stream.id).sort((a, b) => a.name.localeCompare(b.name));
            return squads.length ? (
              <optgroup key={stream.id} label={stream.name}>
                {squads.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
            ) : null;
          })}
        </Select>
        <Select label={systemIds.length === 1 ? "Role" : "Role on each"} value={role} onChange={(event) => setRole(event.target.value as SquadRole)}>
          <RoleOptions />
        </Select>
        <Select label="Person" value={personId} onChange={(event) => setPersonId(event.target.value)}>
          <PersonOptions people={activePeople(org)} current={null} none="Open seat: no one yet" />
        </Select>
      </div>
      <p className="own-form__says">
        {squad ? (
          <>
            <bdi>{squad.name}</bdi> will run {given.length ? list(given) : "nothing new"}
            {given.length > 0 && <>, with a {roleLabel(role).toLocaleLowerCase()} seat on {systemIds.length === 1 ? "it" : "each"} {person ? <>held by <bdi>{person.name}</bdi></> : "left open"}</>}.
            {already.length > 0 && <> It already runs {list(already)}; {already.length === 1 ? "that one stays" : "those stay"} as {already.length === 1 ? "it is" : "they are"}.</>}
          </>
        ) : (
          <>Chosen: {list(systemIds)}.</>
        )}
      </p>
    </FormPanel>
  );
}

/** Removing an empty value stream, a product, or a squad (naming the systems it leaves without one). */
export function OrgRemove({ kind, record, onDone, onRemoved, panelRef }: {
  kind: "value-streams" | "products" | "squads";
  record: ValueStream | OrgProduct | Squad;
  onDone: () => void;
  /** After the removal is saved (the record is gone); `onDone` when not given. */
  onRemoved?: () => void;
} & Panel) {
  const { org, release, hook } = useOrgContext();
  const name = (systemId: string) => release?.systems.find((system) => system.id === systemId)?.name ?? systemId;
  const orphaned = kind === "squads" ? systemIdsOf(record as Squad).filter((systemId) => runBy(org, systemId).length === 1) : [];
  const what = { "value-streams": "value stream", products: "product", squads: "squad" }[kind];
  const happens = kind === "value-streams"
    ? "The value stream leaves the catalogue. It holds no product or squad."
    : kind === "products"
      ? "The product leaves the catalogue. Its systems stay, with the squads that run them."
      : "The squad leaves the catalogue, with its people's seats on the systems it runs.";
  return (
    <ConsequencePanel
      panelRef={panelRef}
      tone="danger"
      title={<>Remove <bdi>{record.name}</bdi>?</>}
      happens={happens}
      affects={kind === "squads" ? (
        orphaned.length ? (
          <p>{orphaned.length === 1 ? "This system" : `These ${orphaned.length} systems`} will have no squad: {orphaned.map((systemId, index) => <span key={systemId}>{index > 0 && ", "}<bdi>{name(systemId)}</bdi></span>)}.</p>
        ) : (
          <p>Every system it runs has another squad too.</p>
        )
      ) : undefined}
      reversibility="It can't be undone here; History keeps a line saying it was removed."
      confirmLabel={`Remove the ${what}`}
      busyLabel="Removing…"
      keepLabel="Cancel"
      busy={hook.remove.isPending}
      failure={failureOf(hook.remove.error)}
      onKeep={onDone}
      onConfirm={() => hook.remove.mutate({ kind, record }, { onSuccess: onRemoved ?? onDone })}
    />
  );
}
