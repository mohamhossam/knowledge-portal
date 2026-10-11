import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import type { Person } from "../api/client";
import { Button, type Column, DataTable, FilterStrip, Section, Status } from "../design/components";
import { plural } from "../library/where";
import { PersonEdit } from "./OrgEdits";
import { rolesOf } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

type Show = "all" | "active" | "inactive";

/** Everyone the catalogue names, with the roles each holds. People are never deleted, only made inactive. */
export function PeoplePage() {
  const { org, hook } = useOrgContext();
  const editor = useEditor<{ person?: Person }>();
  const editing = editor.editing;
  const [show, setShow] = useState<Show>("all");
  const [find, setFind] = useState("");
  const wanted = find.trim().toLocaleLowerCase();
  const all = [...org.people].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const rows = all.filter((person) =>
    (show === "all" || person.active === (show === "active"))
    && (!wanted || [person.name, person.team, person.email].some((text) => text?.toLocaleLowerCase().includes(wanted))));
  const active = all.filter((person) => person.active).length;
  const start = (value: { person?: Person }, event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    editor.open(value, event);
  };
  const done = () => editor.close(() => document.getElementById("ds-page-title"));

  const columns: Column<Person>[] = [
    {
      id: "person",
      header: "Person",
      rowHeader: true,
      bidi: true,
      width: "18rem",
      cell: (person) => (
        <>
          <span className="own-strong">{person.name}</span>
          <span className="own-detail">
            {[person.team, person.email].filter((item): item is string => Boolean(item)).join(" · ") || "No team or email recorded"}
          </span>
        </>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      bidi: true,
      cell: (person) => {
        const roles = rolesOf(org, person.id);
        const words = [
          ...roles.leads.map((stream) => `Leads ${stream.name}`),
          ...roles.scrumMaster.map((squad) => `Scrum master of ${squad.name}`),
          ...(roles.resource.length ? [`On ${plural(new Set(roles.resource.map((item) => item.systemId)).size, "system")} in squads`] : []),
        ];
        return words.length ? words.join("; ") : <span className="own-none">No role</span>;
      },
    },
    { id: "state", header: "State", width: "8rem", cell: (person) => (person.active ? "Active" : <Status tone="stopped">Inactive</Status>) },
    {
      id: "actions",
      header: <span className="ds-visually-hidden">Actions</span>,
      width: "6rem",
      cell: (person) => (
        <Button variant="quiet" icon={<Pencil size={14} />} aria-label={`Edit ${person.name}`} onClick={(event) => start({ person }, event)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="own-stack">
      <Section
        title="People"
        count={org.people.length}
        actions={
          <Button icon={<Plus size={14} />} aria-expanded={Boolean(editing && !editing.person)} onClick={(event) => start({}, event)}>
            Add a person
          </Button>
        }
      >
        <p className="own-quiet own-measure">
          Leads, scrum masters and the people on each squad's systems. Someone who holds no role can be marked inactive; nobody is deleted, so history keeps their name.
        </p>
        {editing && <PersonEdit key={editing.person?.id ?? "new"} person={editing.person} panelRef={editor.panel} onDone={done} />}
        <FilterStrip
          label="Show people"
          filters={[
            { id: "all", label: "All", count: all.length },
            { id: "active", label: "Active", count: active },
            { id: "inactive", label: "Inactive", count: all.length - active },
          ]}
          active={show}
          onChange={(id) => setShow(id as Show)}
          find={{ label: "Find a person by name, team or email", value: find, onChange: setFind, placeholder: "A name, team or email…" }}
          onClear={show !== "all" || find ? () => { setShow("all"); setFind(""); } : undefined}
        />
        <DataTable
          caption={rows.length === all.length ? `People · ${all.length}` : `People · ${rows.length} of ${all.length} shown`}
          captionHidden
          columns={columns}
          rows={rows}
          rowId={(person) => person.id}
          emptyText={all.length ? "No one matches. Clear filters to see everyone." : "No one yet. Add the people who lead, run squads or hold seats."}
        />
      </Section>
    </div>
  );
}
