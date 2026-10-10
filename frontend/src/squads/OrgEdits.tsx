import { useEffect, useId, useRef, useState } from "react";

import type { OrgProduct, Person, Release, Squad, SquadResource, SquadRole, ValueStream } from "../api/client";
import { EditPanel } from "../catalogue/DraftEdits";
import { AreaField, CheckField, Rows, SelectField, TextField } from "../catalogue/forms";
import { activePeople, conceptName, conceptsOf, freeId, holdsRoles, ROLES, roleLabel, rolesOf, runBy, systemIdsOf } from "./organisation";
import { useOrgContext } from "./useOrganisation";

const NO_RELEASE = "No architecture version is in service, so systems cannot be linked yet.";
const CONFLICT = "The squad catalogue changed while you edited (someone else saved first). Reload the page; your edit was not saved.";
const orNull = (text: string | null | undefined) => (text && text.trim() ? text.trim() : null);

/** The people who can hold a role, as options; the current one stays even if no longer active. */
function personOptions(people: Person[], current: string | null | undefined, none: string) {
  const list = [...people];
  return [
    { value: "", label: none },
    ...list.map((person) => ({ value: person.id, label: person.name })),
    ...(current && !list.some((person) => person.id === current) ? [{ value: current, label: `${current} (no longer active)` }] : []),
  ];
}

export function PersonEdit({ person, onDone }: { person?: Person; onDone: () => void }) {
  const { org, hook } = useOrgContext();
  const [value, setValue] = useState<Person>(() => person ?? { id: "", name: "", email: null, team: null, active: true, revision: 0 });
  const roles = person ? rolesOf(org, person.id) : null;
  const locked = person?.active && roles !== null && holdsRoles(roles);
  const email = value.email?.trim();
  const problem = !value.name.trim()
    ? "Give the person a name."
    : email && !email.includes("@")
      ? "An email address has an @."
      : email && org.people.some((item) => item.id !== person?.id && item.email?.toLocaleLowerCase() === email.toLocaleLowerCase())
        ? "Someone else has that email address."
        : null;
  return (
    <EditPanel
      conflictMessage={CONFLICT}
      title={person ? `Edit ${person.name}` : "Add a person"}
      action={person ? "Save the person" : "Add the person"}
      busy={hook.save.isPending}
      problem={problem}
      error={hook.save.error}
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
          { onSuccess: onDone },
        )
      }
    >
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => setValue({ ...value, name })} />
        <TextField label="Email" value={value.email} dir="ltr" onChange={(next) => setValue({ ...value, email: next })} />
        <TextField label="Team" value={value.team} onChange={(team) => setValue({ ...value, team })} />
      </div>
      {person && (
        <>
          <label className="check form__check">
            <input
              type="checkbox"
              checked={value.active}
              disabled={!!locked}
              aria-describedby={locked ? "person-locked" : undefined}
              onChange={(event) => setValue({ ...value, active: event.target.checked })}
            />
            Active: can lead, be a scrum master or a contact
          </label>
          {locked && (
            <p id="person-locked" className="versions__waits">
              {person.name} still holds a role; hand it to someone else before marking them inactive.
            </p>
          )}
        </>
      )}
    </EditPanel>
  );
}

export function StreamEdit({ stream, onDone }: { stream?: ValueStream; onDone: () => void }) {
  const { org, hook } = useOrgContext();
  const [value, setValue] = useState<ValueStream>(() => stream ?? { id: "", name: "", lead_person_id: null, revision: 0 });
  const clash = org.value_streams.some(
    (item) => item.id !== stream?.id && item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase(),
  );
  return (
    <EditPanel
      conflictMessage={CONFLICT}
      title={stream ? `Edit ${stream.name}` : "Add a value stream"}
      action={stream ? "Save the value stream" : "Add the value stream"}
      busy={hook.save.isPending}
      problem={!value.name.trim() ? "Give the value stream a name." : clash ? "Another value stream has that name." : null}
      error={hook.save.error}
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
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => setValue({ ...value, name })} />
        <SelectField
          label="Led by"
          value={value.lead_person_id ?? ""}
          options={personOptions(activePeople(org), value.lead_person_id, "No lead named")}
          onChange={(id) => setValue({ ...value, lead_person_id: id || null })}
        />
      </div>
    </EditPanel>
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
    { value: "", label: "Not placed in the portfolio" },
    ...nodes.map((node) => ({ value: node.id, label: path(node.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    ...(current && !byId.has(current) ? [{ value: current, label: `${current} (not in the catalogue in service)` }] : []),
  ];
}

/** A product: its value stream, what it is, the offerings it sells, where it sits, and the systems it rests on. */
export function ProductEdit({ product, streamId, onDone }: { product?: OrgProduct; streamId?: string; onDone: () => void }) {
  const { org, release, hook } = useOrgContext();
  const id = useId();
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
  const toggleOffering = (offeringId: string, on: boolean) =>
    setValue({
      ...value,
      offering_ids: on ? [...value.offering_ids, offeringId] : value.offering_ids.filter((item) => item !== offeringId),
    });
  const [filter, setFilter] = useState("");
  const inService = release?.systems ?? [];
  const lapsed = (product?.system_ids ?? []).filter((systemId) => !inService.some((system) => system.id === systemId));
  const choices = [
    ...[...inService].sort((a, b) => a.name.localeCompare(b.name)).map((system) => ({ id: system.id, name: system.name })),
    ...lapsed.map((systemId) => ({ id: systemId, name: `${systemId} (not in the catalogue in service)` })),
  ].filter((item) => !filter.trim() || item.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()) || value.system_ids.includes(item.id));
  const clash = org.products.some(
    (item) => item.id !== product?.id && item.value_stream_id === value.value_stream_id
      && item.name.trim().toLocaleLowerCase() === value.name.trim().toLocaleLowerCase(),
  );
  const problem = !release
    ? NO_RELEASE
    : !value.name.trim() ? "Give the product a name." : clash ? "This value stream already has a product with that name." : null;
  const toggle = (systemId: string, on: boolean) =>
    setValue({ ...value, system_ids: on ? [...value.system_ids, systemId] : value.system_ids.filter((item) => item !== systemId) });
  return (
    <EditPanel
      conflictMessage={CONFLICT}
      title={product ? `Edit ${product.name}` : "Add a product"}
      action={product ? "Save the product" : "Add the product"}
      busy={hook.save.isPending}
      problem={problem}
      error={hook.save.error}
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
          { onSuccess: onDone },
        )
      }
    >
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => setValue({ ...value, name })} />
        <SelectField
          label="Value stream"
          value={value.value_stream_id}
          options={org.value_streams.map((stream) => ({ value: stream.id, label: stream.name }))}
          onChange={(value_stream_id) => setValue({ ...value, value_stream_id })}
        />
      </div>
      <AreaField label="What it is" value={value.description} onChange={(description) => setValue({ ...value, description })} />
      <fieldset className="choices form__systems">
        <legend className="field__label">Offerings it sells ({value.offering_ids.length} chosen)</legend>
        {offeringChoices.length ? (
          <div className="form__checklist">
            {offeringChoices.map((item) => (
              <CheckField key={item.id} label={item.name} checked={value.offering_ids.includes(item.id)} onChange={(on) => toggleOffering(item.id, on)} />
            ))}
          </div>
        ) : (
          <p className="form__hint">The version in service has no offerings yet.</p>
        )}
      </fieldset>
      <div className="form__grid">
        <SelectField
          label="Where it sits in the portfolio"
          value={value.portfolio_node_id ?? ""}
          options={portfolioOptions(release, value.portfolio_node_id)}
          onChange={(portfolio_node_id) => setValue({ ...value, portfolio_node_id: portfolio_node_id || null })}
        />
      </div>
      <fieldset className="choices form__systems">
        <legend className="field__label">Systems it rests on ({value.system_ids.length} chosen)</legend>
        <label className="field field--inline" htmlFor={`${id}-filter`}>
          <span className="field__label">Find</span>
          <input id={`${id}-filter`} type="search" className="field__input" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
        <div className="form__checklist">
          {choices.map((item) => (
            <CheckField key={item.id} label={item.name} checked={value.system_ids.includes(item.id)} onChange={(on) => toggle(item.id, on)} />
          ))}
        </div>
      </fieldset>
    </EditPanel>
  );
}

const roleOptions = ROLES.map((role) => ({ value: role.value, label: role.label }));
const seatKey = (item: SquadResource) => `${item.system_id}|${item.capability_id ?? ""}|${item.person_id || `open:${item.role}`}`;

/** A squad: its value stream, scrum master, and its people on each system it runs, each in a role. */
export function SquadEdit({ squad, streamId, onDone }: { squad?: Squad; streamId?: string; onDone: () => void }) {
  const { org, release, hook } = useOrgContext();
  const [value, setValue] = useState<Squad>(
    () => squad ?? { id: "", name: "", value_stream_id: streamId ?? org.value_streams[0]?.id ?? "", scrum_master_person_id: null, resources: [], revision: 0 },
  );
  const inService = release?.systems ?? [];
  const lapsed = (squad ? systemIdsOf(squad) : []).filter((systemId) => !inService.some((system) => system.id === systemId));
  const systemOptions = (current: string) => [
    ...(current ? [] : [{ value: "", label: "Choose a system" }]),
    ...[...inService]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((system) => ({ value: system.id, label: system.name })),
    ...lapsed.filter((systemId) => systemId === current).map((systemId) => ({ value: systemId, label: `${systemId} (not in the catalogue in service)` })),
  ];
  // A seat covers the whole system, or one capability concept the system's capabilities link to.
  const capabilityOptions = (item: SquadResource) => {
    const linked = conceptsOf(release, item.system_id);
    const current = item.capability_id;
    return [
      { value: "", label: "Whole system" },
      ...linked.map((concept) => ({ value: concept.id, label: concept.name })),
      ...(current && !linked.some((concept) => concept.id === current)
        ? [{ value: current, label: `${conceptName(release, current)} (no longer linked)` }]
        : []),
    ];
  };
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
          ? "Choose a system on every row, or remove the row."
          : new Set(seats).size !== seats.length
            ? "Someone is on the same system and capability twice, or it has two open seats in one role; remove one."
            : null;
  return (
    <EditPanel
      conflictMessage={CONFLICT}
      title={squad ? `Edit ${squad.name}` : "Add a squad"}
      action={squad ? "Save the squad" : "Add the squad"}
      busy={hook.save.isPending}
      problem={problem}
      error={hook.save.error}
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
          { onSuccess: onDone },
        )
      }
    >
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => setValue({ ...value, name })} />
        <SelectField
          label="Value stream"
          value={value.value_stream_id}
          options={org.value_streams.map((stream) => ({ value: stream.id, label: stream.name }))}
          onChange={(value_stream_id) => setValue({ ...value, value_stream_id })}
        />
        <SelectField
          label="Scrum master"
          value={value.scrum_master_person_id ?? ""}
          options={personOptions(activePeople(org), value.scrum_master_person_id, "No one named")}
          onChange={(id) => setValue({ ...value, scrum_master_person_id: id || null })}
        />
      </div>
      <Rows<SquadResource>
        legend="Who works on the systems it runs"
        one="seat"
        items={value.resources}
        onChange={(resources) => setValue({ ...value, resources })}
        blank={() => ({ system_id: "", role: "developer", person_id: null, capability_id: null })}
        itemLabel={(item, index) => {
          const system = inService.find((candidate) => candidate.id === item.system_id)?.name ?? item.system_id;
          const scope = item.capability_id ? ` › ${conceptName(release, item.capability_id)}` : "";
          return system ? `${roleLabel(item.role).toLocaleLowerCase()} seat on ${system}${scope}` : `seat ${index + 1}`;
        }}
        render={(item, update) => (
          <>
            <SelectField
              label="System"
              value={item.system_id}
              options={systemOptions(item.system_id)}
              onChange={(system_id) => update({ system_id, capability_id: null })}
            />
            <SelectField
              label="Capability"
              value={item.capability_id ?? ""}
              options={capabilityOptions(item)}
              onChange={(id) => update({ capability_id: id || null })}
            />
            <SelectField label="Role" value={item.role} options={roleOptions} onChange={(role) => update({ role: role as SquadRole })} />
            <SelectField
              label="Person"
              value={item.person_id ?? ""}
              options={personOptions(activePeople(org), item.person_id, "Open seat: no one yet")}
              onChange={(id) => update({ person_id: id || null })}
            />
          </>
        )}
      />
    </EditPanel>
  );
}

/** Giving one system to a squad, with a person in a role on it: the catalogue's most common decision. */
export function GiveSystem({ systemId, systemName, onDone }: { systemId: string; systemName: string; onDone: (given: boolean) => void }) {
  const { org, release, hook } = useOrgContext();
  const [squadId, setSquadId] = useState("");
  const [role, setRole] = useState<SquadRole>("system_contact");
  const [contact, setContact] = useState("");
  const squad = org.squads.find((item) => item.id === squadId);
  const options = [
    { value: "", label: "Choose a squad" },
    ...[...org.value_streams].sort((a, b) => a.name.localeCompare(b.name)).flatMap((stream) =>
      org.squads
        .filter((item) => item.value_stream_id === stream.id && !systemIdsOf(item).includes(systemId))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({ value: item.id, label: item.name, group: stream.name })),
    ),
  ];
  // Opening lands the reader in the panel: scrolled to the middle, on the squad.
  const fields = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fields.current?.scrollIntoView({ block: "center" });
    fields.current?.querySelector("select")?.focus({ preventScroll: true });
  }, []);
  const problem = !release ? NO_RELEASE : !squad ? "Choose the squad that runs it." : null;
  return (
    <EditPanel
      conflictMessage={CONFLICT}
      title={`Give ${systemName} to a squad`}
      action="Give it to the squad"
      busy={hook.save.isPending}
      problem={problem}
      error={hook.save.error}
      onCancel={() => onDone(false)}
      onSubmit={() =>
        squad &&
        hook.save.mutate(
          {
            kind: "squads",
            isNew: false,
            record: { ...squad, resources: [...squad.resources, { system_id: systemId, role, person_id: contact || null }] },
          },
          { onSuccess: () => onDone(true) },
        )
      }
    >
      {org.squads.length === 0 ? (
        <p className="edit-panel__lead">There is no squad yet; add one on the Squads page.</p>
      ) : (
        <div className="form__grid" ref={fields}>
          <SelectField label="Squad" value={squadId} options={options} onChange={setSquadId} />
          <SelectField label="Role" value={role} options={roleOptions} onChange={(next) => setRole(next as SquadRole)} />
          <SelectField label="Person" value={contact} options={personOptions(activePeople(org), null, "Open seat: no one yet")} onChange={setContact} />
        </div>
      )}
    </EditPanel>
  );
}

/** Removing a value stream (only when empty), a product, or a squad (saying which systems lose their only squad). */
export function OrgRemove({ kind, record, onDone }: {
  kind: "value-streams" | "products" | "squads";
  record: ValueStream | OrgProduct | Squad;
  onDone: () => void;
}) {
  const { org, hook } = useOrgContext();
  const holding = kind === "value-streams"
    ? [...org.products, ...org.squads].filter((item) => item.value_stream_id === record.id).length
    : 0;
  const orphaned = kind === "squads"
    ? systemIdsOf(record as Squad).filter((systemId) => runBy(org, systemId).length === 1).length
    : 0;
  return (
    <EditPanel
      conflictMessage={CONFLICT}
      title={`Remove ${record.name}`}
      action="Remove it"
      danger
      busy={hook.remove.isPending}
      problem={holding ? "Move or remove this value stream's products and squads first." : null}
      error={hook.remove.error}
      onCancel={onDone}
      onSubmit={() => hook.remove.mutate({ kind, record }, { onSuccess: onDone })}
    >
      {kind === "squads" && (
        <p className="edit-panel__lead">
          {orphaned
            ? `${orphaned === 1 ? "One system it runs has" : `${orphaned} systems it runs have`} no other squad and will show as without one.`
            : "Every system it runs has another squad too."}
        </p>
      )}
      {kind === "products" && <p className="edit-panel__lead">Its systems stay in the catalogue; only the product goes.</p>}
    </EditPanel>
  );
}
