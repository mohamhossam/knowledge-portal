import { Pencil, Plus, Trash2 } from "lucide-react";
import type { RefObject } from "react";

import type { OrgProduct, ValueStream } from "../api/client";
import { ActionGroup, Button, type Column, DataTable, EmptyState, Section, Status } from "../design/components";
import { plural } from "../library/where";
import { ButtonLink, RouterLink } from "../shell/links";
import { OrgRemove, ProductEdit, StreamEdit } from "./OrgEdits";
import { productLinks, seatsLine, type SystemRow, streamSections, unnamedSystems } from "./organisation";
import { useEditor } from "./useEditor";
import { useOrgContext } from "./useOrganisation";

type Editing =
  | { what: "add-stream" }
  | { what: "stream" | "remove-stream"; stream: ValueStream }
  | { what: "add-product"; stream: ValueStream }
  | { what: "product" | "remove-product"; product: OrgProduct };

/**
 * The organisation read through what it sells: each value stream, its products
 * and each product's systems with who runs them. Giving systems to a squad
 * happens in the systems grid, opened on the product's gaps.
 */
export function ProductsPage() {
  const { org, release, hook } = useOrgContext();
  const editor = useEditor<Editing>();
  const editing = editor.editing;
  const sections = streamSections(org, release);
  const unnamed = unnamedSystems(org, release).reduce((total, group) => total + group.rows.length, 0);
  const start = (value: Editing, event: { currentTarget: EventTarget | null }) => {
    hook.save.reset();
    hook.remove.reset();
    editor.open(value, event);
  };
  const done = () => editor.close(() => document.getElementById("ds-page-title"));
  const panel = { panelRef: editor.panel, onDone: done };

  return (
    <div className="own-stack">
      <Section
        title="Value streams and products"
        count={org.products.length}
        actions={
          <Button icon={<Plus size={14} />} aria-expanded={editing?.what === "add-stream"} onClick={(event) => start({ what: "add-stream" }, event)}>
            Add a value stream
          </Button>
        }
      >
        {editing?.what === "add-stream" && <StreamEdit {...panel} />}
        {sections.length === 0 && editing?.what !== "add-stream" && (
          <EmptyState title="No value stream yet.">
            <p>Add the people first, then a value stream with its lead. Each product and squad belongs to one.</p>
          </EmptyState>
        )}
        {release && unnamed > 0 && (
          <p className="own-quiet">
            {plural(unnamed, "system in service is", "systems in service are")} in no product.{" "}
            <RouterLink href="/squads?product=none">See them in the systems grid</RouterLink>
          </p>
        )}
      </Section>

      {sections.map(({ stream, lead, products, squads }) => {
        const holding = products.length + squads.length;
        return (
          <Section
            key={stream.id}
            title={<bdi>{stream.name}</bdi>}
            actions={
              <ActionGroup label={`${stream.name}: actions`}>
                <Button icon={<Plus size={14} />} onClick={(event) => start({ what: "add-product", stream }, event)}>
                  Add a product
                </Button>
                <Button variant="quiet" icon={<Pencil size={14} />} aria-label={`Edit the value stream ${stream.name}`} onClick={(event) => start({ what: "stream", stream }, event)}>
                  Edit
                </Button>
                <Button
                  variant="quiet"
                  icon={<Trash2 size={14} />}
                  aria-label={`Remove the value stream ${stream.name}`}
                  unavailableReason={holding ? "Move or remove its products and squads first." : null}
                  onClick={(event) => start({ what: "remove-stream", stream }, event)}
                >
                  Remove
                </Button>
              </ActionGroup>
            }
          >
            <p className="own-quiet">
              {lead ? <>Led by <bdi className="own-strong">{lead.name}</bdi></> : <Status tone="attention">No lead named</Status>} ·{" "}
              <RouterLink href="/squads/squads">{plural(squads.length, "squad")}</RouterLink> · {plural(products.length, "product")}
            </p>
            {editing?.what === "stream" && editing.stream.id === stream.id && <StreamEdit stream={stream} {...panel} />}
            {editing?.what === "remove-stream" && editing.stream.id === stream.id && <OrgRemove kind="value-streams" record={stream} {...panel} />}
            {editing?.what === "add-product" && editing.stream.id === stream.id && <ProductEdit streamId={stream.id} {...panel} />}
            {products.length === 0 ? (
              <p className="own-quiet">No product yet.</p>
            ) : (
              products.map(({ product, rows }) => (
                <Product key={product.id} product={product} rows={rows} editing={editing} start={start} panel={panel} />
              ))
            )}
          </Section>
        );
      })}
    </div>
  );
}

const columns: Column<SystemRow>[] = [
  {
    id: "system",
    header: "System",
    rowHeader: true,
    bidi: true,
    width: "40%",
    cell: (row) => (
      <>
        {row.lapsed ? <span>{row.name}</span> : <RouterLink href={`/architecture/systems/${encodeURIComponent(row.systemId)}`}>{row.name}</RouterLink>}
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
            <bdi>{squad.name}</bdi>
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

/** A product: what it is and sells, what to check in its links, then its systems and who runs each. */
function Product({ product, rows, editing, start, panel }: {
  product: OrgProduct;
  rows: SystemRow[];
  editing: Editing | null;
  start: (value: Editing, event: { currentTarget: EventTarget | null }) => void;
  panel: { panelRef: RefObject<HTMLElement | null>; onDone: () => void };
}) {
  const { release, flags } = useOrgContext();
  const flag = flags.find((item) => item.subject === "product" && item.subject_id === product.id);
  const { sells, portfolio, checks } = productLinks(product, release, flag);
  const facts = [...(sells.length ? [`Sells ${sells.join(", ")}`] : []), ...(portfolio ? [`Portfolio: ${portfolio}`] : [])];
  const gaps = rows.filter((row) => !row.lapsed && row.runBy.length === 0).length;
  return (
    <article className="own-product" aria-labelledby={`own-product-${product.id}`}>
      <div className="own-product__head">
        <h3 id={`own-product-${product.id}`} className="own-product__title"><bdi>{product.name}</bdi></h3>
        <ActionGroup label={`${product.name}: actions`}>
          <Button variant="quiet" icon={<Pencil size={14} />} aria-label={`Edit the product ${product.name}`} onClick={(event) => start({ what: "product", product }, event)}>
            Edit
          </Button>
          <Button variant="quiet" icon={<Trash2 size={14} />} aria-label={`Remove the product ${product.name}`} onClick={(event) => start({ what: "remove-product", product }, event)}>
            Remove
          </Button>
        </ActionGroup>
      </div>
      {product.description && <p className="own-measure" dir="auto">{product.description}</p>}
      {facts.length > 0 && <p className="own-quiet own-measure" dir="auto">{facts.join(" · ")}</p>}
      {checks.length > 0 && (
        <ul className="own-checks" aria-label={`To check in ${product.name}`}>
          {checks.map((check) => <li key={check} dir="auto"><Status tone="attention">{check}</Status></li>)}
        </ul>
      )}
      {editing?.what === "product" && editing.product.id === product.id && <ProductEdit product={product} {...panel} />}
      {editing?.what === "remove-product" && editing.product.id === product.id && <OrgRemove kind="products" record={product} {...panel} />}
      {rows.length ? (
        <DataTable caption={`Systems ${product.name} rests on, and who runs each`} captionHidden columns={columns} rows={rows} rowId={(row) => row.systemId} />
      ) : (
        <p className="own-quiet">It names no system yet.</p>
      )}
      {gaps > 0 && (
        <div>
          <ButtonLink to={`/squads?show=none&product=${encodeURIComponent(product.id)}`}>
            Give {gaps === 1 ? "the system" : `the ${gaps} systems`} with no squad to a squad<span className="ds-visually-hidden">, in <bdi>{product.name}</bdi></span>
          </ButtonLink>
        </div>
      )}
    </article>
  );
}
