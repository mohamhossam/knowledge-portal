import { Pencil, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type { Person } from "../api/client";
import { useFindParam } from "../catalogue/frame/useFindParam";
import {
  Button, type Column, DataTable, EmptyState, Facts, Lines, ListFind, ListTools, RecordList, type RecordGroup, RecordPlaceholder, RecordView,
  Section, Workbench,
} from "../design/components";
import { plural } from "../library/where";
import { RouterLink } from "../shell/links";
import { href, useSearch } from "./bench";
import { Tag } from "./Tag";
import { PersonEdit } from "./OrgEdits";
import { conceptName, holdsRoles, roleLabel, rolesOf } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
const recordTitle = () => document.querySelector<HTMLElement>(".ds-bench__record .ds-record__title");

/**
 * Everyone the catalogue names, on the workbench (UX rebuild, phase 3): the
 * active, then the inactive, beside the chosen person's record (what they
 * lead and the seats they hold). People are never deleted, only made inactive.
 */
export function PeoplePage() {
  const { personId } = useParams();
  const { org, hook } = useOrgContext();
  const navigate = useNavigate();
  const editor = useEditor<"add">();
  const adding = editor.editing === "add";
  const chosen = personId !== undefined ? org.people.find((person) => person.id === personId) : undefined;
  const add = (event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    editor.open("add", event);
  };

  const record = adding ? (
    <PersonEdit
      panelRef={editor.panel}
      onDone={() => editor.close(() => document.getElementById("ds-page-title"))}
      onSaved={(id) => {
        navigate(href.person(id));
        editor.close(recordTitle, true);
      }}
    />
  ) : chosen ? (
    <PersonRecord key={chosen.id} person={chosen} />
  ) : personId !== undefined ? (
    <EmptyState title={`No person “${personId}” is in the catalogue.`} action={<RouterLink href="/squads/people">See everyone</RouterLink>} />
  ) : (
    <PeopleSummary />
  );

  return (
    <Workbench listLabel="People" chosen={Boolean(chosen) || adding} list={<PeopleList current={chosen?.id} onAdd={adding ? undefined : add} />} record={record} />
  );
}

function PeopleList({ current, onAdd }: { current?: string; onAdd?: (event: { currentTarget: EventTarget | null }) => void }) {
  const { org } = useOrgContext();
  const search = useSearch();
  const [find, setFind] = useFindParam("q");
  const needle = find.trim().toLocaleLowerCase();
  const shown = [...org.people]
    .filter((person) => !needle || [person.name, person.team, person.email].some((text) => text?.toLocaleLowerCase().includes(needle)))
    .sort(byName);
  const item = (person: Person) => ({
    id: person.id,
    href: `${href.person(person.id)}${search}`,
    name: person.name,
    bidi: true,
    detail: [person.team, person.email].filter((text): text is string => Boolean(text)).join(" · ") || undefined,
  });
  const groups: RecordGroup[] = [
    { id: "active", label: "Active", items: shown.filter((person) => person.active).map(item) },
    { id: "inactive", label: "Inactive", items: shown.filter((person) => !person.active).map(item) },
  ];
  return (
    <>
      <ListTools count={needle ? `${plural(shown.length, "person", "people")} of ${org.people.length}` : plural(org.people.length, "person", "people")}>
        <ListFind label="Find a person" value={find} onChange={setFind} placeholder="A name, team or email" />
        {onAdd && <Button variant="tertiary" icon={<Plus size={16} />} onClick={onAdd}>Add a person</Button>}
      </ListTools>
      <RecordList
        label="People"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={needle ? `No one matches “${find.trim()}”.` : "No one yet. Add the people who lead, run squads or hold seats."}
      />
    </>
  );
}

/** With no one chosen: how people are kept, and the active people who hold no role yet. */
function PeopleSummary() {
  const { org } = useOrgContext();
  const active = org.people.filter((person) => person.active);
  const idle = active.filter((person) => !holdsRoles(rolesOf(org, person.id))).sort(byName);
  return (
    <RecordPlaceholder title={`${plural(org.people.length, "person", "people")}, ${active.length} active. Choose one to see what they hold.`}>
      <p className="own-quiet own-measure">
        Leads, scrum masters and the people on each squad's systems. Someone who holds no role can be marked inactive; nobody is deleted, so history keeps their name.
      </p>
      <Section title="Active, with no role" count={idle.length}>
        {idle.length ? (
          <Lines>
            {idle.map((person) => (
              <li key={person.id}>
                <RouterLink href={href.person(person.id)}><bdi>{person.name}</bdi></RouterLink>
                {person.team && <span className="own-quiet"> · <bdi>{person.team}</bdi></span>}
              </li>
            ))}
          </Lines>
        ) : (
          <p className="own-quiet">Everyone active holds a role.</p>
        )}
      </Section>
    </RecordPlaceholder>
  );
}

type Seat = ReturnType<typeof rolesOf>["resource"][number] & { capability: string | null; key: string };

/** A person: their team and email, what they lead, and every seat they hold, each a link across. */
function PersonRecord({ person }: { person: Person }) {
  const { org, release, hook } = useOrgContext();
  const location = useLocation();
  const editor = useEditor<"edit">();
  const roles = rolesOf(org, person.id);
  const systemName = (systemId: string) => release?.systems.find((system) => system.id === systemId)?.name ?? systemId;
  const seats: Seat[] = org.squads.flatMap((squad) =>
    squad.resources
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.person_id === person.id)
      .map(({ item, index }) => ({
        squad,
        systemId: item.system_id,
        role: item.role,
        capability: item.capability_id ? conceptName(release, item.capability_id) : null,
        key: `${squad.id}:${index}`,
      })));
  const columns: Column<Seat>[] = [
    { id: "system", header: "System", rowHeader: true, bidi: true, cell: (seat) => <RouterLink href={href.system(seat.systemId)}>{systemName(seat.systemId)}</RouterLink> },
    { id: "role", header: "Role", cell: (seat) => <>{roleLabel(seat.role)}{seat.capability && <span className="own-detail">For <bdi>{seat.capability}</bdi></span>}</> },
    { id: "squad", header: "Squad", bidi: true, cell: (seat) => <RouterLink href={href.squad(seat.squad.id)}>{seat.squad.name}</RouterLink> },
  ];
  const leads = roles.leads.map((stream) => stream.name);

  return (
    <RecordView
      title={person.name}
      takeFocus={location.key !== "default"}
      meta={person.active ? <span>Active</span> : <Tag>Inactive</Tag>}
      actions={
        <Button
          aria-expanded={editor.editing === "edit"}
          icon={<Pencil size={14} />}
          onClick={(event) => {
            hook.save.reset();
            editor.open("edit", event);
          }}
        >
          Edit
        </Button>
      }
    >
      {editor.editing === "edit" && <PersonEdit person={person} panelRef={editor.panel} onDone={() => editor.close(recordTitle)} />}
      <Facts
        items={[
          ["Team", person.team ? <bdi>{person.team}</bdi> : <span className="own-quiet">Not recorded</span>],
          ["Email", person.email ? <a href={`mailto:${person.email}`} dir="ltr">{person.email}</a> : <span className="own-quiet">Not recorded</span>],
          ...(leads.length ? [["Leads", <bdi key="leads">{leads.join(", ")}</bdi>] as [string, ReactNode]] : []),
          ...(roles.scrumMaster.length
            ? [["Scrum master of", <span key="sm">{roles.scrumMaster.map((squad, index) => <span key={squad.id}>{index > 0 && ", "}<RouterLink href={href.squad(squad.id)}><bdi>{squad.name}</bdi></RouterLink></span>)}</span>] as [string, ReactNode]]
            : []),
        ]}
      />
      <Section title="Seats" count={seats.length} headingLevel={3}>
        {seats.length ? (
          <DataTable caption={`Seats ${person.name} holds`} captionHidden columns={columns} rows={seats} rowId={(seat) => seat.key} />
        ) : (
          <p className="own-quiet">
            {holdsRoles(roles) ? "No seat on a system." : person.active ? "Holds no role, so they can be marked inactive." : "Holds no role."}
          </p>
        )}
      </Section>
    </RecordView>
  );
}
