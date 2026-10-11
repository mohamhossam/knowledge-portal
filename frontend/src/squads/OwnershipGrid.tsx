import { UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { BulkActionBar, Button, type Column, DataTable, FilterStrip, Select, type Sort, Status } from "../design/components";
import { plural } from "../library/where";
import { RouterLink } from "../shell/links";
import { GiveSystems } from "./OrgEdits";
import { type OwnershipRow, ownershipRows, seatsLine } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

type Show = "all" | "none" | "run" | "lapsed";
const SHOWS: Show[] = ["all", "none", "run", "lapsed"];
const SORTS = ["name", "place"];

const stateOf = (row: OwnershipRow): Exclude<Show, "all"> => (row.lapsed ? "lapsed" : row.runBy.length ? "run" : "none");

/**
 * The ownership grid (Browse archetype): every system in service with where it
 * sits, the products that name it and who runs it; filtered in the address
 * ("No squad" first among them), and given to a squad in bulk, one save.
 */
export function OwnershipGrid() {
  const { org, release, hook } = useOrgContext();
  const [params, setParams] = useSearchParams();
  const show = (SHOWS.includes(params.get("show") as Show) ? params.get("show") : "all") as Show;
  const squadId = params.get("squad") ?? "";
  const productId = params.get("product") ?? "";
  const find = params.get("q") ?? "";
  const sortId = SORTS.includes(params.get("sort") ?? "") ? params.get("sort")! : "name";
  const sort: Sort = { id: sortId, direction: params.get("dir") === "desc" ? "descending" : "ascending" };
  // Typed here, written to the address a moment later: one history update per pause, not per key.
  const [findDraft, setFindDraft] = useState(find);
  const [findFor, setFindFor] = useState(find);
  if (findFor !== find) {
    setFindFor(find);
    setFindDraft(find);
  }

  const set = (changes: Record<string, string | null>) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (findDraft === find) return;
    const timer = window.setTimeout(() => set({ q: findDraft }), 250);
    return () => window.clearTimeout(timer);
    // `set` writes through the router's functional update: only the draft matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findDraft, find]);

  const all = useMemo(() => ownershipRows(org, release), [org, release]);
  const counts = useMemo(() => {
    const map = new Map<Show, number>([["all", all.length]]);
    for (const row of all) map.set(stateOf(row), (map.get(stateOf(row)) ?? 0) + 1);
    return map;
  }, [all]);

  const rows = useMemo(() => {
    const needle = find.trim().toLocaleLowerCase();
    const shown = all.filter((row) =>
      (show === "all" || stateOf(row) === show)
      && (!squadId || row.runBy.some(({ squad }) => squad.id === squadId))
      && (!productId || (productId === "none" ? row.products.length === 0 : row.products.some((product) => product.id === productId)))
      && (!needle || row.name.toLocaleLowerCase().includes(needle) || row.systemId.toLocaleLowerCase().includes(needle)));
    const flip = sort.direction === "descending" ? -1 : 1;
    const place = (row: OwnershipRow) => row.place.join(" › ") || "￿";
    return [...shown].sort((a, b) => (sort.id === "place" ? place(a).localeCompare(place(b)) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)) * flip);
  }, [all, show, squadId, productId, find, sort.id, sort.direction]);

  // Only systems in service can be given to a squad: a lapsed link has nothing to run.
  const givable = new Set(all.filter((row) => !row.lapsed).map((row) => row.systemId));
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const selected = new Set([...chosen].filter((id) => givable.has(id)));
  const shownGivable = rows.filter((row) => givable.has(row.systemId));
  const unselectedShown = shownGivable.filter((row) => !selected.has(row.systemId)).length;

  const give = useEditor<string[]>();
  const said = useRef<HTMLParagraphElement>(null);
  const [message, setMessage] = useState("");

  const columns: Column<OwnershipRow>[] = [
    {
      id: "name",
      header: "System",
      rowHeader: true,
      sortable: true,
      bidi: true,
      cell: (row) => (
        <>
          {row.lapsed ? <span>{row.name}</span> : <RouterLink href={`/architecture/systems/${encodeURIComponent(row.systemId)}`}>{row.name}</RouterLink>}
          {row.lapsed && <span className="own-detail">Not in the version in service</span>}
        </>
      ),
    },
    { id: "place", header: "Where it sits", sortable: true, bidi: true, width: "14rem", cell: (row) => (row.place.length ? row.place.join(" › ") : <span className="own-none">Not placed</span>) },
    {
      id: "products",
      header: "Products",
      width: "13rem",
      cell: (row) => (row.products.length ? row.products.map((product, index) => <span key={product.id}>{index > 0 && ", "}<bdi>{product.name}</bdi></span>) : <span className="own-none">None</span>),
    },
    {
      id: "runs",
      header: "Run by",
      cell: (row) =>
        row.runBy.length ? (
          row.runBy.map(({ squad, seats }) => (
            <span key={squad.id} className="own-squad">
              <RouterLink href={`/squads?squad=${encodeURIComponent(squad.id)}`}>{squad.name}</RouterLink>
              <span className="own-detail own-detail--plain"><bdi>{seatsLine(seats)}</bdi></span>
            </span>
          ))
        ) : row.lapsed ? (
          <Status tone="stopped">Link to check</Status>
        ) : (
          <Status tone="attention">No squad</Status>
        ),
    },
  ];

  const filtering = show !== "all" || squadId !== "" || productId !== "" || find !== "";
  const squads = [...org.squads].sort((a, b) => a.name.localeCompare(b.name));
  const products = [...org.products].sort((a, b) => a.name.localeCompare(b.name));
  const labels: Record<Show, string> = { all: "All", none: "No squad", run: "Run by a squad", lapsed: "No longer in service" };
  const backToGrid = () => document.querySelector<HTMLElement>(".own-grid input[type=checkbox]") ?? said.current;

  return (
    <section className="own-stack" aria-labelledby="own-systems-title">
      <h2 id="own-systems-title" className="ds-visually-hidden">Systems</h2>
      <div className="own-toolbar">
        <FilterStrip
          label="Show systems"
          filters={SHOWS.filter((id) => id !== "lapsed" || (counts.get("lapsed") ?? 0) > 0).map((id) => ({ id, label: labels[id], count: counts.get(id) ?? 0 }))}
          active={show}
          onChange={(id) => set({ show: id === "all" ? null : id })}
          find={{ label: "Find a system by name", value: findDraft, onChange: setFindDraft, placeholder: "A system…" }}
          onClear={filtering ? () => setParams({}, { replace: true }) : undefined}
        />
        <div className="own-toolbar__selects">
          <Select label="Squad" value={squadId} onChange={(event) => set({ squad: event.target.value })}>
            <option value="">Any squad</option>
            {squads.map((squad) => <option key={squad.id} value={squad.id}>{squad.name}</option>)}
          </Select>
          <Select label="Product" value={productId} onChange={(event) => set({ product: event.target.value })}>
            <option value="">Any product</option>
            <option value="none">In no product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </Select>
        </div>
      </div>

      <p ref={said} tabIndex={-1} className="own-said" role="status">{message}</p>

      {give.editing && (
        <GiveSystems
          panelRef={give.panel}
          systemIds={give.editing}
          onCancel={() => give.close(backToGrid)}
          onDone={(text) => {
            setMessage(text);
            setChosen(new Set());
            give.close(() => said.current);
          }}
        />
      )}

      {shownGivable.length > 0 && (
        <div className="own-select-all">
          {unselectedShown > 0 ? (
            <Button variant="quiet" onClick={() => setChosen(new Set([...selected, ...shownGivable.map((row) => row.systemId)]))}>
              Select the {plural(shownGivable.length, "system")} shown
            </Button>
          ) : (
            <Button variant="quiet" onClick={() => setChosen(new Set([...selected].filter((id) => !shownGivable.some((row) => row.systemId === id))))}>
              Clear the {plural(shownGivable.length, "system")} shown
            </Button>
          )}
        </div>
      )}

      <div className="own-grid">
        <DataTable
          caption={filtering ? `Systems · ${rows.length} of ${all.length} shown` : `Systems · ${all.length}`}
          columns={columns}
          rows={rows}
          rowId={(row) => row.systemId}
          rowLabel={(row) => row.name}
          sort={sort}
          onSort={(next) => set({ sort: next.id === "name" ? null : next.id, dir: next.direction === "descending" ? "desc" : null })}
          selected={selected}
          onSelectedChange={(next) => setChosen(new Set([...next].filter((id) => givable.has(id))))}
          emptyText={release ? "No system matches these filters. Clear filters to see every system." : "No architecture version is in service, so there are no systems to show yet."}
        />
      </div>

      <BulkActionBar count={give.editing ? 0 : selected.size} noun={["system", "systems"]} onClear={() => setChosen(new Set())}>
        <Button
          variant="primary"
          icon={<UsersRound size={14} />}
          onClick={(event) => {
            hook.save.reset();
            setMessage("");
            give.open(rows.filter((row) => selected.has(row.systemId)).map((row) => row.systemId).concat([...selected].filter((id) => !rows.some((row) => row.systemId === id))), event);
          }}
        >
          Give to a squad…
        </Button>
      </BulkActionBar>
    </section>
  );
}
