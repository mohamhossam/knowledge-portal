import { useId, useMemo, useState } from "react";

import type { Organisation } from "../../../api/client";
import {
  ActionGroup,
  Button,
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
  Section,
  Select,
  Skeleton,
  Status,
  SubNav,
} from "../../../design/components";
import { useFocusAfterRender } from "../../../design/hooks";
import { gaps, suggestedSquad, useActiveRelease, useOrganisation } from "../../wireframes/data";
import { useLab } from "../../wireframes/lab-context";
import { proto } from "../paths";
import { Lines, RouterLink } from "../ui";

type Page = "gaps" | "products" | "squads" | "people" | "history";

function sub(current: Page) {
  return [
    { href: proto("/ownership"), label: "Gaps", current: current === "gaps" },
    { href: proto("/ownership/products"), label: "Products and systems", current: current === "products" },
    { href: proto("/ownership/squads"), label: "Squads", current: current === "squads" },
    { href: proto("/ownership/people"), label: "People", current: current === "people" },
    { href: proto("/ownership/history"), label: "History", current: current === "history" },
  ];
}

/** Queue archetype: every system with no squad or no contact, one decision each, then the next. */
export function OwnershipGaps() {
  const active = useActiveRelease();
  const organisation = useOrganisation();
  const lab = useLab();
  const [openId, setOpenId] = useState<string | null>(null);
  const focusLater = useFocusAfterRender();
  const all = useMemo(() => gaps(active.data, organisation.data), [active.data, organisation.data]);
  const remaining = all.filter((gap) => !lab.writes[`give:${gap.system.id}`]);
  const filled = all.length - remaining.length;

  if (active.isPending || organisation.isPending) return <Skeleton label="Reading ownership" rows={6} />;
  return (
    <>
      <PageHeader
        title="Ownership"
        lead={remaining.length ? `${remaining.length} ${remaining.length === 1 ? "system" : "systems"} in service ${remaining.length === 1 ? "has" : "have"} no squad or no contact.` : "Every system in service has a squad and a contact."}
      >
        <SubNav label="Ownership" link={RouterLink} items={sub("gaps")} />
      </PageHeader>
      <Section title="Gaps" count={remaining.length}>
        {filled > 0 && <p role="status"><Status tone="done">{filled} filled in this session</Status></p>}
        {remaining.length === 0 ? (
          <EmptyState title="No gaps."><p>Every system in service has a squad and a contact.</p></EmptyState>
        ) : (
          <ul className="proto-queue" aria-label="Gaps">
            {remaining.map((gap, index) => (
              <li key={gap.system.id} className="proto-queue__item">
                <p>
                  <strong><bdi>{gap.system.name}</bdi></strong> · {gap.kind === "no-squad" ? "No squad" : <>Run by <bdi>{gap.squad}</bdi>, no contact</>}
                </p>
                {openId === gap.system.id ? (
                  <GivePanel
                    systemId={gap.system.id}
                    systemName={gap.system.name}
                    organisation={organisation.data!}
                    onDone={(text) => {
                      lab.announce(text);
                      const next = remaining[index + 1] ?? remaining[index - 1];
                      setOpenId(null);
                      focusLater(() => document.getElementById(next ? `give-${next.system.id}` : "ds-page-title"));
                    }}
                    onCancel={() => {
                      setOpenId(null);
                      focusLater(() => document.getElementById(`give-${gap.system.id}`));
                    }}
                  />
                ) : (
                  <Button id={`give-${gap.system.id}`} aria-expanded={false} onClick={() => setOpenId(gap.system.id)}>
                    Give <bdi>{gap.system.name}</bdi> to a squad…
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** One decision with its context: a suggested squad, and people of that squad first. */
function GivePanel({ systemId, systemName, organisation, onDone, onCancel }: { systemId: string; systemName: string; organisation: Organisation; onDone: (text: string) => void; onCancel: () => void }) {
  const lab = useLab();
  const id = useId();
  const suggestion = suggestedSquad(systemId, organisation);
  const [squadId, setSquadId] = useState(suggestion?.squad.id ?? "");
  const [personId, setPersonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const squad = organisation.squads.find((item) => item.id === squadId);
  const members = new Set([squad?.scrum_master_person_id, ...(squad?.systems.map((item) => item.person_id) ?? [])].filter(Boolean));
  const people = [...organisation.people.filter((person) => person.active)].sort((a, b) => Number(members.has(b.id)) - Number(members.has(a.id)));
  return (
    <form
      className="proto-panel"
      aria-labelledby={`${id}-t`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!squadId) return setError("Choose a squad.");
        setBusy(true);
        lab.simulate(`give:${systemId}`, { squadId, personId }).then(
          () => onDone(`${systemName} is run by ${squad?.name}.`),
          (failure: unknown) => {
            setBusy(false);
            setError(failure instanceof Error ? failure.message : "Couldn't save. Try again.");
          },
        );
      }}
    >
      <h3 id={`${id}-t`}>Give <bdi>{systemName}</bdi> to a squad</h3>
      <Select
        label="Squad"
        required
        value={squadId}
        error={error === "Choose a squad." ? error : null}
        hint={suggestion ? `Suggested: ${suggestion.squad.name}, which runs ${suggestion.shared} other ${suggestion.shared === 1 ? "system" : "systems"} in '${suggestion.product.name}'.` : "No squad runs a related system yet."}
        onChange={(event) => setSquadId(event.target.value)}
        autoFocus
      >
        <option value="">Choose a squad</option>
        {organisation.squads.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
      <Select label="Contact for it" hint="The person in the squad to ask about this system." value={personId} onChange={(event) => setPersonId(event.target.value)}>
        <option value="">No contact yet</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.name}{members.has(person.id) ? " (in this squad)" : ""}</option>)}
      </Select>
      {error && error !== "Choose a squad." && <p role="status"><Status tone="attention">{error}</Status></p>}
      <ActionGroup>
        <Button type="submit" variant="primary" busy={busy}>Give it to {squad?.name ?? "the squad"}</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </ActionGroup>
    </form>
  );
}

/** The other Ownership pages, Browse over the seeded organisation. */
export function OwnershipBrowse({ what }: { what: Exclude<Page, "gaps"> }) {
  const organisation = useOrganisation();
  const title = { products: "Products and systems", squads: "Squads", people: "People", history: "History" }[what];
  const data = organisation.data;
  type Squad = Organisation["squads"][number];
  type Person = Organisation["people"][number];
  const squadColumns: Column<Squad>[] = [
    { id: "name", header: "Squad", rowHeader: true, bidi: true, cell: (squad) => squad.name },
    { id: "systems", header: "Systems it runs", numeric: true, cell: (squad) => squad.systems.length },
  ];
  const personColumns: Column<Person>[] = [
    { id: "name", header: "Person", rowHeader: true, bidi: true, cell: (person) => person.name },
    { id: "state", header: "State", cell: (person) => (person.active ? "Active" : <Status tone="stopped">Inactive</Status>) },
  ];
  return (
    <>
      <PageHeader title={title}>
        <SubNav label="Ownership" link={RouterLink} items={sub(what)} />
      </PageHeader>
      {!data ? (
        <Skeleton label={`Reading ${title.toLowerCase()}`} />
      ) : what === "products" ? (
        data.value_streams.map((stream) => (
          <Section key={stream.id} title={<bdi>{stream.name}</bdi>}>
            <Lines>
              {data.products.filter((product) => product.value_stream_id === stream.id).map((product) => (
                <li key={product.id}><bdi>{product.name}</bdi> · <span className="ds-num">{product.system_ids.length}</span> systems</li>
              ))}
            </Lines>
          </Section>
        ))
      ) : what === "squads" ? (
        <DataTable caption="Squads" captionHidden columns={squadColumns} rows={data.squads} rowId={(squad) => squad.id} />
      ) : what === "people" ? (
        <DataTable caption="People" captionHidden columns={personColumns} rows={data.people} rowId={(person) => person.id} />
      ) : (
        <EmptyState title="Ownership history" action={<RouterLink href={proto("/ownership")}>Back to gaps</RouterLink>}>
          <p>Each event links to what it changed. The field-by-field detail needs the service to record it first.</p>
        </EmptyState>
      )}
    </>
  );
}
