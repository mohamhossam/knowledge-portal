import { Plus } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import type { OrgProduct, Squad } from "../api/client";
import { useFindParam } from "../catalogue/frame/useFindParam";
import {
  ActionGroup, Button, type Column, DataTable, EmptyState, Lines, ListFilter, ListFind, ListTools, RecordList, type RecordGroup,
  RecordPlaceholder, RecordView, Section, Status, Workbench,
} from "../design/components";
import { plural } from "../library/where";
import { ButtonLink, RouterLink } from "../shell/links";
import { href, type Notice, useListParams, useSearch } from "./bench";
import { Tag } from "./Tag";
import { gaps as ownershipGaps } from "./gaps";
import { GiveSystems, SquadEdit } from "./OrgEdits";
import { type OwnershipRow, ownershipRows, roleLabel, type RunBy } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

type Show = "all" | "none" | "run" | "lapsed";
const SHOWS: Show[] = ["all", "none", "run", "lapsed"];
const ALL = "all";

const stateOf = (row: OwnershipRow): Exclude<Show, "all"> => (row.lapsed ? "lapsed" : row.runBy.length ? "run" : "none");

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/**
 * Who runs each system, on the workbench (UX rebuild, phase 3): every system
 * in service in a narrow list, grouped by where it sits (as the catalogue
 * groups them, so a system is found in the same place in both, and each
 * appears once however many squads run it), beside the chosen system's
 * ownership record. With none chosen, the record side lists the gaps to close.
 */
export function SystemsBench() {
  const { systemId } = useParams();
  const { org, release } = useOrgContext();
  const rows = useMemo(() => ownershipRows(org, release), [org, release]);
  const chosen = systemId !== undefined ? rows.find((row) => row.systemId === systemId) : undefined;

  const record = chosen ? (
    <SystemOwnership key={chosen.systemId} row={chosen} />
  ) : systemId !== undefined ? (
    <EmptyState
      title={`No system “${systemId}” is in service or named by a product or squad.`}
      action={<RouterLink href="/squads">See every system</RouterLink>}
    />
  ) : (
    <SystemsSummary rows={rows} />
  );

  return <Workbench listLabel="Systems" chosen={Boolean(chosen)} list={<SystemsList rows={rows} current={chosen?.systemId} />} record={record} />;
}

/** The list's filters, read from the address the grid used, so its old addresses keep working. */
function useSystemFilters(rows: OwnershipRow[]) {
  const [params, set] = useListParams();
  const show = (SHOWS.includes(params.get("show") as Show) ? params.get("show") : ALL) as Show;
  const squadId = params.get("squad") ?? "";
  const productId = params.get("product") ?? "";
  const [find, setFind] = useFindParam("q");
  const needle = find.trim().toLocaleLowerCase();
  const shown = rows.filter((row) =>
    (show === ALL || stateOf(row) === show)
    && (!squadId || row.runBy.some(({ squad }) => squad.id === squadId))
    && (!productId || (productId === "none" ? row.products.length === 0 : row.products.some((product) => product.id === productId)))
    && (!needle || row.name.toLocaleLowerCase().includes(needle) || row.systemId.toLocaleLowerCase().includes(needle)));
  return { params, set, show, squadId, productId, find, setFind, shown, filtering: shown.length !== rows.length || Boolean(needle) };
}

function SystemsList({ rows, current }: { rows: OwnershipRow[]; current?: string }) {
  const { org } = useOrgContext();
  const search = useSearch();
  const { set, show, squadId, productId, find, setFind, shown, filtering } = useSystemFilters(rows);

  const groups = useMemo<RecordGroup[]>(() => {
    const byTop = new Map<string, OwnershipRow[]>();
    for (const row of shown) {
      const top = row.lapsed ? "\u0000lapsed" : row.place[0] ?? "";
      byTop.set(top, [...(byTop.get(top) ?? []), row]);
    }
    // By where they sit; the unplaced, then those no longer in service, last.
    const rank = (top: string) => (top === "\u0000lapsed" ? 2 : top === "" ? 1 : 0);
    return [...byTop.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || byName(a, b))
      .map(([top, members]) => ({
        id: top === "\u0000lapsed" ? "lapsed" : top || "unplaced",
        label: top === "\u0000lapsed" ? "No longer in service" : top ? <bdi>{top}</bdi> : "Not placed in the landscape",
        items: members.map((row) => ({
          id: row.systemId,
          href: `${href.system(row.systemId)}${search}`,
          name: row.name,
          bidi: true,
          detail: row.runBy.length ? row.runBy.map(({ squad }) => squad.name).join(", ") : undefined,
          meta: row.lapsed ? <Tag>Link to check</Tag> : row.runBy.length ? undefined : <Tag>No squad</Tag>,
        })),
      }));
  }, [shown, search]);

  const counted = (state: Exclude<Show, "all">) => rows.filter((row) => stateOf(row) === state).length;
  const squads = [...org.squads].sort((a, b) => byName(a.name, b.name));
  const products = [...org.products].sort((a, b) => byName(a.name, b.name));
  const runBy = squadId ? `squad:${squadId}` : show === ALL ? ALL : `show:${show}`;
  const runByOptions = [
    { id: ALL, label: "All systems", count: rows.length },
    { id: "show:none", label: "No squad", count: counted("none") },
    { id: "show:run", label: "Any squad", count: counted("run") },
    ...(counted("lapsed") ? [{ id: "show:lapsed", label: "No longer in service", count: counted("lapsed") }] : []),
    ...squads.map((squad) => ({ id: `squad:${squad.id}`, label: squad.name, count: rows.filter((row) => row.runBy.some((item) => item.squad.id === squad.id)).length })),
  ];
  const productOptions = [
    { id: ALL, label: "Any product", count: rows.length },
    { id: "none", label: "In no product", count: rows.filter((row) => row.products.length === 0).length },
    ...products.map((product) => ({ id: product.id, label: product.name, count: rows.filter((row) => row.products.some((item) => item.id === product.id)).length })),
  ];
  const setRunBy = (value: string) => {
    const [kind, id] = value.split(/:(.*)/s);
    set({ show: kind === "show" ? id! : null, squad: kind === "squad" ? id! : null });
  };

  return (
    <>
      <ListTools count={filtering ? `${plural(shown.length, "system")} of ${rows.length}` : plural(rows.length, "system")}>
        <ListFind label="Find a system" value={find} onChange={setFind} placeholder="A system's name" />
        <ListFilter label="Run by" value={runBy} options={runByOptions} onChange={setRunBy} />
        <ListFilter label="Product" value={productId || ALL} options={productOptions} onChange={(value) => set({ product: value === ALL ? null : value })} />
      </ListTools>
      <RecordList
        label="Systems"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={find.trim() ? `No system is called “${find.trim()}”.` : "No system matches these filters."}
      />
    </>
  );
}

/** With no system chosen: how far ownership reaches, and the gaps to close, each a way in. */
function SystemsSummary({ rows }: { rows: OwnershipRow[] }) {
  const { org, release } = useOrgContext();
  const location = useLocation();
  const notice = (location.state as Notice)?.notice;
  const inService = rows.filter((row) => !row.lapsed);
  const none = inService.filter((row) => row.runBy.length === 0);
  const noContact = ownershipGaps(release, org).filter((gap) => gap.kind === "no-contact");
  const byProduct = [...org.products]
    .map((product) => ({ product, open: none.filter((row) => row.products.some((item) => item.id === product.id)).length }))
    .filter((item) => item.open > 0)
    .sort((a, b) => b.open - a.open || byName(a.product.name, b.product.name));
  const unnamed = none.filter((row) => row.products.length === 0).length;

  if (!release) {
    return (
      <RecordPlaceholder title="No architecture version is in service yet.">
        <p className="own-quiet">Systems can be given to squads once a version is in service.</p>
      </RecordPlaceholder>
    );
  }
  return (
    <RecordPlaceholder title={`${plural(inService.length, "system")} in service. Choose one to see who runs it.`}>
      {notice && <p role="status"><Status tone="done">{notice}</Status></p>}
      <p className="own-measure">
        {inService.length - none.length} {inService.length - none.length === 1 ? "is" : "are"} run by a squad and {none.length} {none.length === 1 ? "has" : "have"} none yet.
        To give several to one squad in a single save, use <RouterLink href="/squads/assign">Assign several</RouterLink>.
      </p>
      {(byProduct.length > 0 || unnamed > 0) && (
        <Section title="No squad yet, by product" count={none.length}>
          <Lines>
            {byProduct.map(({ product, open }) => (
              <li key={product.id} className="own-line">
                <span><RouterLink href={href.product(product.id)}><bdi>{product.name}</bdi></RouterLink>: {plural(open, "system")} with no squad</span>
                <ButtonLink to={`/squads/assign?show=none&product=${encodeURIComponent(product.id)}`} variant="quiet">
                  Give {open === 1 ? "it" : "them"} to a squad<span className="ds-visually-hidden">: <bdi>{product.name}</bdi></span>
                </ButtonLink>
              </li>
            ))}
            {unnamed > 0 && (
              <li className="own-line">
                <span>In no product: {plural(unnamed, "system")} with no squad</span>
                <ButtonLink to="/squads?show=none&product=none" variant="quiet">Show them<span className="ds-visually-hidden">: systems in no product</span></ButtonLink>
              </li>
            )}
          </Lines>
        </Section>
      )}
      {noContact.length > 0 && (
        <Section title="Run, but no contact named" count={noContact.length}>
          <Lines>
            {noContact.map((gap) => (
              <li key={gap.system.id}>
                <RouterLink href={href.system(gap.system.id)}><bdi>{gap.system.name}</bdi></RouterLink>
                <span className="own-quiet"> · <bdi>{gap.squad}</bdi></span>
              </li>
            ))}
          </Lines>
        </Section>
      )}
    </RecordPlaceholder>
  );
}

type Editing = { what: "give" } | { what: "seats"; squad: Squad };

/** One system's ownership: who runs it (each squad, its contact and seats), and the products that name it. */
function SystemOwnership({ row }: { row: OwnershipRow }) {
  const { release, hook } = useOrgContext();
  const location = useLocation();
  const editor = useEditor<Editing>();
  const editing = editor.editing;
  const said = useRef<HTMLParagraphElement>(null);
  const [message, setMessage] = useState("");
  const system = release?.systems.find((item) => item.id === row.systemId);
  const start = (value: Editing, event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    setMessage("");
    editor.open(value, event);
  };
  const done = () => editor.close(() => said.current);

  return (
    <RecordView
      title={row.name}
      takeFocus={location.key !== "default"}
      meta={
        <>
          {row.place.length ? <bdi>{row.place.join(" › ")}</bdi> : <span>Not placed in the landscape</span>}
          {row.lapsed && <Tag>Not in the version in service</Tag>}
        </>
      }
      lead={system?.description || undefined}
      actions={
        <ActionGroup label={`${row.name}: actions`}>
          {!row.lapsed && (
            <Button
              variant={row.runBy.length ? "secondary" : "primary"}
              icon={<Plus size={16} />}
              aria-expanded={editing?.what === "give"}
              onClick={(event) => start({ what: "give" }, event)}
            >
              Give it to a squad
            </Button>
          )}
          {!row.lapsed && <ButtonLink to={`/architecture/systems/${encodeURIComponent(row.systemId)}`} variant="tertiary">Open in the catalogue</ButtonLink>}
        </ActionGroup>
      }
    >
      <p ref={said} tabIndex={-1} className="own-said" role="status">{message}</p>
      {editing?.what === "give" && (
        <GiveSystems
          panelRef={editor.panel}
          systemIds={[row.systemId]}
          onCancel={done}
          onDone={(text) => {
            setMessage(text);
            // Focus goes to what changed: the outcome, read out, above the squads that now run it.
            editor.close(() => said.current, true);
          }}
        />
      )}
      <RunBySection row={row} editing={editing} start={start} done={done} panelRef={editor.panel} />
      <ProductsSection products={row.products} />
    </RecordView>
  );
}

function RunBySection({ row, editing, start, done, panelRef }: {
  row: OwnershipRow;
  editing: Editing | null;
  start: (value: Editing, event: { currentTarget: EventTarget | null }) => void;
  done: () => void;
  panelRef: ReturnType<typeof useEditor>["panel"];
}) {
  const { org } = useOrgContext();
  const streams = new Map(org.value_streams.map((stream) => [stream.id, stream.name]));
  const person = (seat: RunBy["seats"][number]) =>
    seat.person ? <RouterLink href={href.person(seat.person.id)}><bdi>{seat.person.name}</bdi></RouterLink> : <span className="own-quiet">Open seat</span>;
  const columns: Column<RunBy>[] = [
    {
      id: "squad",
      header: "Squad",
      rowHeader: true,
      bidi: true,
      width: "30%",
      cell: ({ squad }) => (
        <>
          <RouterLink href={href.squad(squad.id)}>{squad.name}</RouterLink>
          <span className="own-detail"><bdi>{streams.get(squad.value_stream_id) ?? squad.value_stream_id}</bdi></span>
        </>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      bidi: true,
      width: "25%",
      cell: ({ seats }) => {
        const contacts = seats.filter((seat) => seat.role === "system_contact" && seat.person);
        return contacts.length ? list(contacts.map((seat) => <span key={seat.person!.id}>{person(seat)}{seat.capability && <> for <bdi>{seat.capability}</bdi></>}</span>)) : <Tag>No contact named</Tag>;
      },
    },
    {
      id: "seats",
      header: "Other seats",
      bidi: true,
      cell: ({ seats }) => {
        const others = seats.filter((seat) => seat.role !== "system_contact" || !seat.person);
        if (!others.length) return <span className="own-quiet">None</span>;
        return (
        <ul className="own-seats">
          {others.map((seat, index) => (
            <li key={index}>
              {roleLabel(seat.role)}
              {seat.capability && <> for <bdi>{seat.capability}</bdi>{seat.lapsed && " (no longer linked)"}</>}: {person(seat)}
            </li>
          ))}
        </ul>
        );
      },
    },
    {
      id: "edit",
      header: <span className="ds-visually-hidden">Edit</span>,
      width: "9rem",
      cell: ({ squad }) => (
        <Button variant="quiet" aria-label={`Edit the seats of ${squad.name}`} aria-expanded={editing?.what === "seats" && editing.squad.id === squad.id} onClick={(event) => start({ what: "seats", squad }, event)}>
          Edit seats
        </Button>
      ),
    },
  ];
  return (
    <Section title="Run by" count={row.runBy.length} headingLevel={3}>
      {row.runBy.length ? (
        <DataTable caption={`Squads that run ${row.name}`} captionHidden columns={columns} rows={row.runBy} rowId={({ squad }) => squad.id} />
      ) : (
        <p className="own-quiet">{row.lapsed ? "No squad runs it, and it is no longer in service." : "No squad runs it yet. Give it to one, and name its contact."}</p>
      )}
      {editing?.what === "seats" && <SquadEdit key={editing.squad.id} squad={editing.squad} panelRef={panelRef} onDone={done} />}
    </Section>
  );
}

function ProductsSection({ products }: { products: OrgProduct[] }) {
  const { org } = useOrgContext();
  const streams = new Map(org.value_streams.map((stream) => [stream.id, stream.name]));
  return (
    <Section title="Products" count={products.length} headingLevel={3}>
      {products.length ? (
        <Lines>
          {products.map((product) => (
            <li key={product.id}>
              <RouterLink href={href.product(product.id)}><bdi>{product.name}</bdi></RouterLink>
              <span className="own-quiet"> · <bdi>{streams.get(product.value_stream_id) ?? product.value_stream_id}</bdi></span>
            </li>
          ))}
        </Lines>
      ) : (
        <p className="own-quiet">No product names it.</p>
      )}
    </Section>
  );
}

/** Items in a sentence: "A, B". */
function list(items: ReactNode[]) {
  return items.map((item, index) => <span key={index}>{index > 0 && ", "}{item}</span>);
}
