import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Squad } from "../api/client";
import { ActionGroup, Button, type Column, DataTable, EmptyState, FilterStrip, Section, Status } from "../design/components";
import { RouterLink } from "../shell/links";
import { OrgRemove, SquadEdit } from "./OrgEdits";
import { seatsLine, seatsOn, squadChecks, systemIdsOf } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

type Editing = { what: "add" } | { what: "edit" | "remove"; squad: Squad };

/** The squads, by value stream: scrum master, then the systems each runs and its people on each, by role. */
export function SquadListPage() {
  const { org, release, flags, hook } = useOrgContext();
  const editor = useEditor<Editing>();
  const editing = editor.editing;
  const [stream, setStream] = useState("all");
  const directory = new Map(org.people.map((person) => [person.id, person]));
  const streams = new Map(org.value_streams.map((item) => [item.id, item]));
  const name = (systemId: string) => release?.systems.find((system) => system.id === systemId)?.name;
  const start = (value: Editing, event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    hook.remove.reset();
    editor.open(value, event);
  };
  const done = () => editor.close(() => document.getElementById("ds-page-title"));
  const panel = { panelRef: editor.panel, onDone: done };
  const streamName = (squad: Squad) => streams.get(squad.value_stream_id)?.name ?? squad.value_stream_id;
  const all = [...org.squads].sort((a, b) => streamName(a).localeCompare(streamName(b)) || a.name.localeCompare(b.name));
  const rows = all.filter((squad) => stream === "all" || squad.value_stream_id === stream);
  const counted = [...org.value_streams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ id: item.id, label: item.name, count: org.squads.filter((squad) => squad.value_stream_id === item.id).length }))
    .filter((item) => item.count > 0);

  const columns: Column<Squad>[] = [
    {
      id: "squad",
      header: "Squad",
      rowHeader: true,
      bidi: true,
      width: "16rem",
      cell: (squad) => {
        const master = squad.scrum_master_person_id ? directory.get(squad.scrum_master_person_id) : undefined;
        const checks = squadChecks(flags.find((item) => item.subject === "squad" && item.subject_id === squad.id), release);
        return (
          <>
            <span className="own-strong">{squad.name}</span>
            <span className="own-detail">{master ? <>Scrum master: <bdi>{master.name}</bdi></> : "No scrum master named"}</span>
            {checks.length > 0 && (
              <ul className="own-checks" aria-label={`To check in ${squad.name}`}>
                {checks.map((check) => <li key={check}><Status tone="attention">{check}</Status></li>)}
              </ul>
            )}
          </>
        );
      },
    },
    { id: "stream", header: "Value stream", bidi: true, width: "11rem", cell: (squad) => streamName(squad) },
    {
      id: "runs",
      header: "Runs",
      cell: (squad) =>
        squad.resources.length ? (
          <ul className="own-runs">
            {systemIdsOf(squad).map((systemId) => {
              const known = name(systemId);
              return (
                <li key={systemId}>
                  {known ? (
                    <RouterLink href={`/architecture/systems/${encodeURIComponent(systemId)}`}>{known}</RouterLink>
                  ) : (
                    <span>{systemId}{release ? " (not in the catalogue in service)" : ""}</span>
                  )}
                  <span className="own-detail own-detail--plain"><bdi>{seatsLine(seatsOn(org, squad, systemId, release))}</bdi></span>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="own-none">No system yet</span>
        ),
    },
    {
      id: "actions",
      header: <span className="ds-visually-hidden">Actions</span>,
      width: "13rem",
      cell: (squad) => (
        <ActionGroup label={`${squad.name}: actions`}>
          <Button variant="quiet" icon={<Pencil size={14} />} aria-label={`Edit ${squad.name}`} onClick={(event) => start({ what: "edit", squad }, event)}>
            Edit
          </Button>
          <Button variant="quiet" icon={<Trash2 size={14} />} aria-label={`Remove ${squad.name}`} onClick={(event) => start({ what: "remove", squad }, event)}>
            Remove
          </Button>
        </ActionGroup>
      ),
    },
  ];

  return (
    <div className="own-stack">
      <Section
        title="Squads"
        count={org.squads.length}
        actions={
          org.value_streams.length ? (
            <Button icon={<Plus size={14} />} aria-expanded={editing?.what === "add"} onClick={(event) => start({ what: "add" }, event)}>
              Add a squad
            </Button>
          ) : undefined
        }
      >
        {org.value_streams.length === 0 ? (
          <EmptyState title="No value stream yet.">
            <p>Every squad belongs to a value stream. <RouterLink href="/squads/products">Add one on the Products page</RouterLink> first.</p>
          </EmptyState>
        ) : (
          <>
            {editing?.what === "add" && <SquadEdit {...panel} />}
            {editing && editing.what !== "add" && (editing.what === "edit" ? (
              <SquadEdit key={editing.squad.id} squad={editing.squad} {...panel} />
            ) : (
              <OrgRemove key={editing.squad.id} kind="squads" record={editing.squad} {...panel} />
            ))}
            {counted.length > 1 && (
              <FilterStrip
                label="Show squads"
                filters={[{ id: "all", label: "All", count: org.squads.length }, ...counted]}
                active={stream}
                onChange={setStream}
              />
            )}
            <DataTable
              caption={stream === "all" ? `Squads · ${all.length}` : `Squads · ${rows.length} of ${all.length} shown`}
              captionHidden
              columns={columns}
              rows={rows}
              rowId={(squad) => squad.id}
              emptyText="No squad yet. Add one, then give it systems from the systems grid."
            />
          </>
        )}
      </Section>
    </div>
  );
}
