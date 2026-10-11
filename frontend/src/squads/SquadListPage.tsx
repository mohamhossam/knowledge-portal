import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type { Squad } from "../api/client";
import { useFindParam } from "../catalogue/frame/useFindParam";
import {
  ActionGroup, Button, type Column, DataTable, EmptyState, Facts, Lines, ListFind, ListTools, RecordList, type RecordGroup, RecordPlaceholder,
  RecordView, Section, Status, Workbench,
} from "../design/components";
import { plural } from "../library/where";
import { RouterLink } from "../shell/links";
import { href, type Notice, useSearch } from "./bench";
import { Tag } from "./Tag";
import { OrgRemove, SquadEdit } from "./OrgEdits";
import { roleLabel, seatsOn, squadChecks, systemIdsOf } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
const recordTitle = () => document.querySelector<HTMLElement>(".ds-bench__record .ds-record__title");

/**
 * The squads on the workbench (UX rebuild, phase 3): a narrow list grouped by
 * value stream, beside the chosen squad's record (its scrum master, the
 * systems it runs with its seats on each, and its people). With none chosen,
 * the record side lists the open seats to fill.
 */
export function SquadListPage() {
  const { squadId } = useParams();
  const { org, hook } = useOrgContext();
  const navigate = useNavigate();
  const editor = useEditor<"add">();
  const adding = editor.editing === "add";
  const chosen = squadId !== undefined ? org.squads.find((squad) => squad.id === squadId) : undefined;
  const add = (event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    editor.open("add", event);
  };

  const record = adding ? (
    <SquadEdit
      panelRef={editor.panel}
      onDone={() => editor.close(() => document.getElementById("ds-page-title"))}
      onSaved={(id) => {
        navigate(href.squad(id));
        editor.close(recordTitle, true);
      }}
    />
  ) : chosen ? (
    <SquadRecord key={chosen.id} squad={chosen} />
  ) : squadId !== undefined ? (
    <EmptyState title={`No squad “${squadId}” is in the catalogue.`} action={<RouterLink href="/squads/squads">See every squad</RouterLink>} />
  ) : (
    <SquadsSummary />
  );

  return (
    <Workbench
      listLabel="Squads"
      chosen={Boolean(chosen) || adding}
      list={<SquadsList current={chosen?.id} onAdd={org.value_streams.length && !adding ? add : undefined} />}
      record={record}
    />
  );
}

function SquadsList({ current, onAdd }: { current?: string; onAdd?: (event: { currentTarget: EventTarget | null }) => void }) {
  const { org, flags } = useOrgContext();
  const search = useSearch();
  const [find, setFind] = useFindParam("q");
  const needle = find.trim().toLocaleLowerCase();
  const groups: RecordGroup[] = [...org.value_streams].sort(byName).map((stream) => ({
    id: stream.id,
    label: <bdi>{stream.name}</bdi>,
    items: org.squads
      .filter((squad) => squad.value_stream_id === stream.id && (!needle || squad.name.toLocaleLowerCase().includes(needle)))
      .sort(byName)
      .map((squad) => {
        const runs = systemIdsOf(squad).length;
        const open = squad.resources.filter((item) => !item.person_id).length;
        return {
          id: squad.id,
          href: `${href.squad(squad.id)}${search}`,
          name: squad.name,
          bidi: true,
          detail: runs ? `Runs ${plural(runs, "system")}${open ? `, ${plural(open, "open seat")}` : ""}` : "Runs no system yet",
          meta: flags.some((flag) => flag.subject === "squad" && flag.subject_id === squad.id) ? <Tag>To check</Tag> : undefined,
        };
      }),
  }));
  const shown = groups.reduce((total, group) => total + group.items.length, 0);
  return (
    <>
      <ListTools count={needle ? `${plural(shown, "squad")} of ${org.squads.length}` : plural(org.squads.length, "squad")}>
        <ListFind label="Find a squad" value={find} onChange={setFind} placeholder="A squad's name" />
        {onAdd && <Button variant="tertiary" icon={<Plus size={16} />} onClick={onAdd}>Add a squad</Button>}
      </ListTools>
      <RecordList
        label="Squads"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={needle ? `No squad is called “${find.trim()}”.` : "No squad yet. Add one, then give it systems."}
      />
    </>
  );
}

/** With no squad chosen: the seats nobody holds yet, and the squads whose links need a look. */
function SquadsSummary() {
  const { org, release, flags } = useOrgContext();
  const location = useLocation();
  const notice = (location.state as Notice)?.notice;
  const systemName = (systemId: string) => release?.systems.find((system) => system.id === systemId)?.name ?? systemId;
  const open = [...org.squads].sort(byName).flatMap((squad) =>
    squad.resources.filter((item) => !item.person_id).map((item, index) => ({ squad, item, key: `${squad.id}:${item.system_id}:${item.role}:${index}` })));
  const toCheck = org.squads.filter((squad) => flags.some((flag) => flag.subject === "squad" && flag.subject_id === squad.id)).sort(byName);

  if (org.value_streams.length === 0) {
    return (
      <EmptyState title="No value stream yet.">
        <p>Every squad belongs to a value stream. <RouterLink href="/squads/products">Add one on the Products page</RouterLink> first.</p>
      </EmptyState>
    );
  }
  return (
    <RecordPlaceholder title={`${plural(org.squads.length, "squad")} in ${plural(org.value_streams.length, "value stream")}. Choose one to see what it runs and who is on it.`}>
      {notice && <p role="status"><Status tone="done">{notice}</Status></p>}
      {toCheck.length > 0 && (
        <Section title="To check" count={toCheck.length}>
          <Lines>
            {toCheck.map((squad) => (
              <li key={squad.id}>
                <RouterLink href={href.squad(squad.id)}><bdi>{squad.name}</bdi></RouterLink>
                <span className="own-quiet"> · names something the version in service no longer has</span>
              </li>
            ))}
          </Lines>
        </Section>
      )}
      <Section title="Open seats" count={open.length}>
        {open.length ? (
          <Lines>
            {open.map(({ squad, item, key }) => (
              <li key={key}>
                {roleLabel(item.role)} on <RouterLink href={href.system(item.system_id)}><bdi>{systemName(item.system_id)}</bdi></RouterLink>
                <span className="own-quiet"> · <RouterLink href={href.squad(squad.id)}><bdi>{squad.name}</bdi></RouterLink></span>
              </li>
            ))}
          </Lines>
        ) : (
          <p className="own-quiet">Every seat has someone in it.</p>
        )}
      </Section>
    </RecordPlaceholder>
  );
}

type Editing = "edit" | "remove";

/** A squad: its value stream and scrum master, the systems it runs with its seats on each, then its people. */
function SquadRecord({ squad }: { squad: Squad }) {
  const { org, release, flags, hook } = useOrgContext();
  const location = useLocation();
  const navigate = useNavigate();
  const editor = useEditor<Editing>();
  const editing = editor.editing;
  const stream = org.value_streams.find((item) => item.id === squad.value_stream_id);
  const directory = new Map(org.people.map((person) => [person.id, person]));
  const master = squad.scrum_master_person_id ? directory.get(squad.scrum_master_person_id) : undefined;
  const checks = squadChecks(flags.find((item) => item.subject === "squad" && item.subject_id === squad.id), release);
  const systemName = (systemId: string) => release?.systems.find((system) => system.id === systemId)?.name;
  const start = (value: Editing, event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    hook.remove.reset();
    editor.open(value, event);
  };
  const done = () => editor.close(recordTitle);
  const personLink = (id: string, name: string) => <RouterLink href={href.person(id)}><bdi>{name}</bdi></RouterLink>;

  // Each person on the squad, with what they do on it: scrum master, then their seats.
  const people = new Map<string, string[]>();
  if (master) people.set(master.id, ["Scrum master"]);
  for (const item of squad.resources) {
    if (!item.person_id) continue;
    const role = `${roleLabel(item.role)} on ${systemName(item.system_id) ?? item.system_id}`;
    const roles = people.get(item.person_id) ?? [];
    if (!roles.includes(role)) people.set(item.person_id, [...roles, role]);
  }

  type Row = { systemId: string };
  const columns: Column<Row>[] = [
    {
      id: "system",
      header: "System",
      rowHeader: true,
      bidi: true,
      width: "35%",
      cell: ({ systemId }) => (
        <>
          <RouterLink href={href.system(systemId)}>{systemName(systemId) ?? systemId}</RouterLink>
          {release && !systemName(systemId) && <span className="own-detail">Not in the version in service</span>}
        </>
      ),
    },
    {
      id: "seats",
      header: "Seats",
      bidi: true,
      cell: ({ systemId }) => (
        <ul className="own-seats">
          {seatsOn(org, squad, systemId, release).map((seat, index) => (
            <li key={index}>
              {roleLabel(seat.role)}
              {seat.capability && <> for <bdi>{seat.capability}</bdi>{seat.lapsed && " (no longer linked)"}</>}:{" "}
              {seat.person ? personLink(seat.person.id, seat.person.name) : <span className="own-quiet">Open seat</span>}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <RecordView
      title={squad.name}
      takeFocus={location.key !== "default"}
      meta={stream ? <bdi>{stream.name}</bdi> : undefined}
      actions={
        <ActionGroup label={`${squad.name}: actions`}>
          <Button aria-expanded={editing === "edit"} icon={<Pencil size={14} />} onClick={(event) => start("edit", event)}>Edit</Button>
          <Button variant="tertiary" aria-expanded={editing === "remove"} icon={<Trash2 size={14} />} onClick={(event) => start("remove", event)}>Remove…</Button>
        </ActionGroup>
      }
    >
      {editing === "edit" && <SquadEdit squad={squad} panelRef={editor.panel} onDone={done} />}
      {editing === "remove" && (
        <OrgRemove
          kind="squads"
          record={squad}
          panelRef={editor.panel}
          onDone={done}
          onRemoved={() => navigate("/squads/squads", { state: { notice: `Removed ${squad.name}.` } })}
        />
      )}
      {checks.length > 0 && (
        <ul className="own-checks" aria-label={`To check in ${squad.name}`}>
          {checks.map((check) => <li key={check} dir="auto"><Status tone="attention">{check}</Status></li>)}
        </ul>
      )}
      <Facts
        items={[
          ["Value stream", stream ? <bdi>{stream.name}</bdi> : squad.value_stream_id],
          ["Scrum master", master ? personLink(master.id, master.name) : <span className="own-quiet">No one named</span>],
        ]}
      />
      <Section title="Systems it runs" count={systemIdsOf(squad).length} headingLevel={3}>
        {squad.resources.length ? (
          <DataTable
            caption={`Systems ${squad.name} runs, and its seats on each`}
            captionHidden
            columns={columns}
            rows={systemIdsOf(squad).map((systemId) => ({ systemId }))}
            rowId={(row) => row.systemId}
          />
        ) : (
          <p className="own-quiet">It runs no system yet. Give it systems from a system's record, or several at once with <RouterLink href="/squads/assign?show=none">Assign several</RouterLink>.</p>
        )}
      </Section>
      <Section title="People" count={people.size} headingLevel={3}>
        {people.size ? (
          <Lines>
            {[...people.entries()].map(([personId, roles]) => (
              <li key={personId}>
                {personLink(personId, directory.get(personId)?.name ?? personId)}
                <span className="own-quiet"> · {roles.join("; ")}</span>
              </li>
            ))}
          </Lines>
        ) : (
          <p className="own-quiet">No one is named on it yet.</p>
        )}
      </Section>
    </RecordView>
  );
}
