import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type { OrgProduct, ValueStream } from "../api/client";
import { useFindParam } from "../catalogue/frame/useFindParam";
import {
  ActionGroup, Button, type Column, DataTable, EmptyState, Facts, ListFind, ListTools, RecordList, type RecordGroup, RecordPlaceholder,
  RecordView, Section, Status, Workbench,
} from "../design/components";
import { plural } from "../library/where";
import { ButtonLink, RouterLink } from "../shell/links";
import { href, type Notice, useSearch } from "./bench";
import { Tag } from "./Tag";
import { OrgRemove, ProductEdit, StreamEdit } from "./OrgEdits";
import { productLinks, seatsLine, type SystemRow, streamSections, unnamedSystems } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

type Editing =
  | { what: "add-stream" }
  | { what: "stream" | "remove-stream"; stream: ValueStream }
  | { what: "add-product" };

const recordTitle = () => document.querySelector<HTMLElement>(".ds-bench__record .ds-record__title");

/**
 * The organisation read through what it sells, on the workbench (UX rebuild,
 * phase 3): products in a narrow list grouped by value stream, beside the
 * chosen product's record (what it is and sells, its systems and who runs
 * each). With none chosen, the record side holds the value streams.
 */
export function ProductsPage() {
  const { productId } = useParams();
  const { org, hook } = useOrgContext();
  const navigate = useNavigate();
  const editor = useEditor<Editing>();
  const adding = editor.editing?.what === "add-product";
  const chosen = productId !== undefined ? org.products.find((product) => product.id === productId) : undefined;
  const start = (value: Editing, event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    hook.remove.reset();
    editor.open(value, event);
  };
  const done = () => editor.close(() => document.getElementById("ds-page-title"));

  const record = adding ? (
    <ProductEdit
      panelRef={editor.panel}
      onDone={done}
      onSaved={(id) => {
        navigate(href.product(id));
        editor.close(recordTitle, true);
      }}
    />
  ) : chosen ? (
    <ProductRecord key={chosen.id} product={chosen} />
  ) : productId !== undefined ? (
    <EmptyState title={`No product “${productId}” is in the catalogue.`} action={<RouterLink href="/squads/products">See every product</RouterLink>} />
  ) : (
    <StreamsSummary editing={editor.editing} start={start} done={done} panelRef={editor.panel} />
  );

  return (
    <Workbench
      listLabel="Products"
      chosen={Boolean(chosen) || adding}
      list={<ProductsList current={chosen?.id} onAdd={org.value_streams.length && !adding ? (event) => start({ what: "add-product" }, event) : undefined} />}
      record={record}
    />
  );
}

function ProductsList({ current, onAdd }: { current?: string; onAdd?: (event: { currentTarget: EventTarget | null }) => void }) {
  const { org, release, flags } = useOrgContext();
  const search = useSearch();
  const [find, setFind] = useFindParam("q");
  const needle = find.trim().toLocaleLowerCase();
  const sections = useMemo(() => streamSections(org, release), [org, release]);
  const groups: RecordGroup[] = sections.map(({ stream, products }) => ({
    id: stream.id,
    label: <bdi>{stream.name}</bdi>,
    items: products
      .filter(({ product }) => !needle || product.name.toLocaleLowerCase().includes(needle))
      .map(({ product, rows }) => {
        const open = rows.filter((row) => !row.lapsed && row.runBy.length === 0).length;
        const flagged = flags.some((flag) => flag.subject === "product" && flag.subject_id === product.id);
        return {
          id: product.id,
          href: `${href.product(product.id)}${search}`,
          name: product.name,
          bidi: true,
          detail: `${plural(rows.length, "system")}${open ? `, ${open} with no squad` : ""}`,
          meta: flagged ? <Tag>To check</Tag> : undefined,
        };
      }),
  }));
  const shown = groups.reduce((total, group) => total + group.items.length, 0);
  return (
    <>
      <ListTools count={needle ? `${plural(shown, "product")} of ${org.products.length}` : plural(org.products.length, "product")}>
        <ListFind label="Find a product" value={find} onChange={setFind} placeholder="A product's name" />
        {onAdd && <Button variant="tertiary" icon={<Plus size={16} />} onClick={onAdd}>Add a product</Button>}
      </ListTools>
      <RecordList
        label="Products"
        groups={groups}
        currentId={current}
        link={RouterLink}
        empty={needle ? `No product is called “${find.trim()}”.` : org.value_streams.length ? "No product yet." : "No value stream yet: add one first."}
      />
    </>
  );
}

/** With no product chosen: the value streams, each with its lead, products and squads, edited here. */
function StreamsSummary({ editing, start, done, panelRef }: {
  editing: Editing | null;
  start: (value: Editing, event: { currentTarget: EventTarget | null }) => void;
  done: () => void;
  panelRef: ReturnType<typeof useEditor>["panel"];
}) {
  const { org, release } = useOrgContext();
  const location = useLocation();
  const notice = (location.state as Notice)?.notice;
  const sections = streamSections(org, release);
  const unnamed = unnamedSystems(org, release).reduce((total, group) => total + group.rows.length, 0);
  type Row = (typeof sections)[number];
  const columns: Column<Row>[] = [
    { id: "stream", header: "Value stream", rowHeader: true, bidi: true, cell: ({ stream }) => <span className="own-strong">{stream.name}</span> },
    {
      id: "lead",
      header: "Led by",
      bidi: true,
      cell: ({ lead }) => (lead ? <RouterLink href={href.person(lead.id)}><bdi>{lead.name}</bdi></RouterLink> : <Tag>No lead named</Tag>),
    },
    { id: "products", header: "Products", numeric: true, width: "5.5rem", cell: ({ products }) => products.length },
    { id: "squads", header: "Squads", numeric: true, width: "5.5rem", cell: ({ squads }) => squads.length },
    {
      id: "actions",
      header: <span className="ds-visually-hidden">Actions</span>,
      width: "19rem",
      cell: ({ stream, products, squads }) => (
        <ActionGroup label={`${stream.name}: actions`}>
          <Button variant="quiet" icon={<Pencil size={14} />} aria-label={`Edit the value stream ${stream.name}`} onClick={(event) => start({ what: "stream", stream }, event)}>
            Edit
          </Button>
          <Button
            variant="quiet"
            icon={<Trash2 size={14} />}
            aria-label={`Remove the value stream ${stream.name}`}
            unavailableReason={products.length + squads.length ? "Move or remove its products and squads first." : null}
            onClick={(event) => start({ what: "remove-stream", stream }, event)}
          >
            Remove
          </Button>
        </ActionGroup>
      ),
    },
  ];
  return (
    <RecordPlaceholder title={`${plural(org.products.length, "product")} in ${plural(org.value_streams.length, "value stream")}. Choose one to see its systems and who runs each.`}>
      {notice && <p role="status"><Status tone="done">{notice}</Status></p>}
      {release && unnamed > 0 && (
        <p className="own-quiet">
          {plural(unnamed, "system in service is", "systems in service are")} in no product.{" "}
          <RouterLink href="/squads?product=none">See them in the systems list</RouterLink>
        </p>
      )}
      <Section
        title="Value streams"
        count={org.value_streams.length}
        actions={
          <Button icon={<Plus size={14} />} aria-expanded={editing?.what === "add-stream"} onClick={(event) => start({ what: "add-stream" }, event)}>
            Add a value stream
          </Button>
        }
      >
        {editing?.what === "add-stream" && <StreamEdit panelRef={panelRef} onDone={done} />}
        {editing?.what === "stream" && <StreamEdit key={editing.stream.id} stream={editing.stream} panelRef={panelRef} onDone={done} />}
        {editing?.what === "remove-stream" && <OrgRemove key={editing.stream.id} kind="value-streams" record={editing.stream} panelRef={panelRef} onDone={done} />}
        {sections.length ? (
          <DataTable caption="Value streams" captionHidden columns={columns} rows={sections} rowId={({ stream }) => stream.id} />
        ) : (
          <EmptyState title="No value stream yet.">
            <p>Add the people first, then a value stream with its lead. Each product and squad belongs to one.</p>
          </EmptyState>
        )}
      </Section>
    </RecordPlaceholder>
  );
}

type RecordEditing = "edit" | "remove";

/** A product: what it is and sells, what to check in its links, then its systems and who runs each. */
function ProductRecord({ product }: { product: OrgProduct }) {
  const { org, release, flags, hook } = useOrgContext();
  const location = useLocation();
  const navigate = useNavigate();
  const editor = useEditor<RecordEditing>();
  const editing = editor.editing;
  const stream = org.value_streams.find((item) => item.id === product.value_stream_id);
  const lead = stream?.lead_person_id ? org.people.find((person) => person.id === stream.lead_person_id) : undefined;
  const rows = streamSections(org, release).flatMap((section) => section.products).find((item) => item.product.id === product.id)?.rows ?? [];
  const flag = flags.find((item) => item.subject === "product" && item.subject_id === product.id);
  const { sells, portfolio, checks } = productLinks(product, release, flag);
  const open = rows.filter((row) => !row.lapsed && row.runBy.length === 0).length;
  const start = (value: RecordEditing, event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    hook.remove.reset();
    editor.open(value, event);
  };
  const done = () => editor.close(recordTitle);

  return (
    <RecordView
      title={product.name}
      takeFocus={location.key !== "default"}
      meta={stream ? <bdi>{stream.name}</bdi> : undefined}
      lead={product.description || undefined}
      actions={
        <ActionGroup label={`${product.name}: actions`}>
          <Button aria-expanded={editing === "edit"} icon={<Pencil size={14} />} onClick={(event) => start("edit", event)}>Edit</Button>
          <Button variant="tertiary" aria-expanded={editing === "remove"} icon={<Trash2 size={14} />} onClick={(event) => start("remove", event)}>Remove…</Button>
        </ActionGroup>
      }
    >
      {editing === "edit" && <ProductEdit product={product} panelRef={editor.panel} onDone={done} />}
      {editing === "remove" && (
        <OrgRemove
          kind="products"
          record={product}
          panelRef={editor.panel}
          onDone={done}
          onRemoved={() => navigate("/squads/products", { state: { notice: `Removed ${product.name}.` } })}
        />
      )}
      {checks.length > 0 && (
        <ul className="own-checks" aria-label={`To check in ${product.name}`}>
          {checks.map((check) => <li key={check} dir="auto"><Status tone="attention">{check}</Status></li>)}
        </ul>
      )}
      <Facts
        items={[
          ["Value stream", stream ? <><bdi>{stream.name}</bdi>{lead && <span className="own-quiet">, led by <RouterLink href={href.person(lead.id)}><bdi>{lead.name}</bdi></RouterLink></span>}</> : product.value_stream_id],
          ["Sells", sells.length ? <bdi>{sells.join(", ")}</bdi> : <span className="own-quiet">No offering linked</span>],
          ["Portfolio", portfolio ? <bdi>{portfolio}</bdi> : <span className="own-quiet">Not placed in the portfolio</span>],
        ]}
      />
      <Section
        title="Systems it rests on"
        count={rows.length}
        headingLevel={3}
        actions={open > 0 ? (
          <ButtonLink to={`/squads/assign?show=none&product=${encodeURIComponent(product.id)}`}>
            Give {open === 1 ? "the system" : `the ${open} systems`} with no squad to a squad<span className="ds-visually-hidden">, in <bdi>{product.name}</bdi></span>
          </ButtonLink>
        ) : undefined}
      >
        {rows.length ? (
          <DataTable caption={`Systems ${product.name} rests on, and who runs each`} captionHidden columns={systemColumns} rows={rows} rowId={(row) => row.systemId} />
        ) : (
          <p className="own-quiet">It names no system yet. Edit it to choose the systems it rests on.</p>
        )}
      </Section>
    </RecordView>
  );
}

const systemColumns: Column<SystemRow>[] = [
  {
    id: "system",
    header: "System",
    rowHeader: true,
    bidi: true,
    width: "35%",
    cell: (row) => (
      <>
        <RouterLink href={href.system(row.systemId)}>{row.name}</RouterLink>
        {row.lapsed && <span className="own-detail">Not in the version in service</span>}
      </>
    ),
  },
  {
    id: "runs",
    header: "Run by",
    cell: (row) =>
      row.runBy.length ? (
        row.runBy.map(({ squad, seats }) => (
          <span key={squad.id} className="own-squad">
            <RouterLink href={href.squad(squad.id)}>{squad.name}</RouterLink>
            <span className="own-detail own-detail--plain"><bdi>{seatsLine(seats)}</bdi></span>
          </span>
        ))
      ) : row.lapsed ? (
        <Tag>Link to check</Tag>
      ) : (
        <Tag>No squad</Tag>
      ),
  },
];
