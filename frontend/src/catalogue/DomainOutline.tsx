import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type CSSProperties, useState } from "react";

import { Button, Status } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { domainOutline, domainRef, type EditedDomain, LAYOUT_WORDS, moveDomain, outlined, removeDomain, siblingsOf } from "./editing";
import { AreaField, CheckField, SelectField, TextField } from "./forms";
import { layerOrder, sideOf } from "./landscape/posterModel";
import { landscapeAsDrawn } from "./model/adapter";
import "./frame/outline.css";

const PLACES = [
  { value: "", label: "Among the layers" },
  { value: "bus", label: "The bus, across the map" },
  { value: "above_bus", label: "The layer the bus runs under" },
  { value: "side", label: "A side layer, drawn last" },
];

/** Names in a sentence: "A", "A and B", "A, B and C". */
const listed = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * How the map will read the landscape as edited: its layers top to bottom, the side layers and
 * what runs across, and a place two domains claim, before anything is saved.
 */
export function MapReading({ items }: { items: EditedDomain[] }) {
  const named = items.filter((item) => item.name.trim()).map((item, index) => ({ ...item, id: item.id || `new-${index}` }));
  const drawn = landscapeAsDrawn(named).filter((item) => !item.parent_id);
  if (!drawn.length) return null;
  const nameOf = (id: string) => drawn.find((item) => item.id === id)?.name.trim() ?? id;
  const places = drawn.map((item) => ({ id: item.id, layout: item.layout ?? undefined }));
  const side = sideOf(places);
  const layers = layerOrder(places)
    .filter((id) => !side.includes(id))
    .map((id) => (places.find((item) => item.id === id)?.layout === "bus" ? `${nameOf(id)} as the bus` : nameOf(id)));
  const across = drawn.filter((item) => item.cross_cutting).map((item) => item.name.trim());
  const claimed = (["bus", "above_bus"] as const)
    .map((layout) => ({ layout, names: drawn.filter((item) => item.layout === layout).map((item) => item.name.trim()) }))
    .filter((claim) => claim.names.length > 1);
  // With no place named, or no domain marked, the map knows the standard domains by their ids.
  const byIds = (!named.some((item) => item.layout) && drawn.some((item) => item.layout)) || (!named.some((item) => item.cross_cutting) && across.length > 0);
  return (
    <section className="cat-outline__reading" aria-labelledby="map-reading">
      <h4 id="map-reading" className="ds-field__label">How the map will read it</h4>
      <p>Top to bottom: {listed(layers)}.</p>
      {side.length > 0 && <p>Side by side, last: {listed(side.map(nameOf))}.</p>}
      {across.length > 0 && <p>Running across the others: {listed(across)}.</p>}
      {claimed.map((claim) => (
        <p key={claim.layout}>
          <Status tone="warning">
            {listed(claim.names)} are each {LAYOUT_WORDS[claim.layout]}; the map has one.
          </Status>
        </p>
      ))}
      {byIds && <p className="ds-field__hint">No domain names this, so the map places the standard domains by their ids, as here.</p>}
    </section>
  );
}

/**
 * A domain tree edited as an outline: the top domains in their order, each one's sub-domains
 * indented under it in theirs. A domain moves among its siblings with everything inside it, and
 * each row closes to its name and a line of what it holds. For the landscape, a top domain also
 * says its place on the map and whether it runs across the others.
 */
export function DomainOutline({ items, onChange, onPlaced, landscape, errorAt }: {
  items: EditedDomain[];
  onChange: (items: EditedDomain[]) => void;
  /** Hears which domain was given a place, so a place two claim is said at the later one. */
  onPlaced?: (key: string) => void;
  landscape: boolean;
  errorAt: (path: string) => string | null;
}) {
  const rows = domainOutline(items);
  const [opened, setOpened] = useState<string[]>([]);
  const [said, setSaid] = useState("");
  const [made, setMade] = useState(0);
  const focusLater = useFocusAfterRender();
  const keyOf = (item: EditedDomain) => item.key ?? item.id;
  const rowFor = (key: string) => document.querySelector<HTMLElement>(`[data-domain="${CSS.escape(key)}"]`);
  const fieldsOf = ["name", "parent", "layout"];
  const isOpen = (key: string, index: number) => opened.includes(key) || fieldsOf.some((field) => Boolean(errorAt(`domains.${index}.${field}`)));
  const nameOf = (item: EditedDomain) => item.name.trim() || "the new domain";
  // An unnamed new domain is told apart by its place in the outline: "New domain, row 7".
  const pathName = (row: (typeof rows)[number]) => row.item.name.trim() || `New domain, row ${rows.indexOf(row) + 1}`;
  const pathOf = (index: number): string => {
    const row = rows.find((entry) => entry.index === index)!;
    return row.parent === null ? pathName(row) : `${pathOf(row.parent)} › ${pathName(row)}`;
  };
  const update = (index: number, patch: Partial<EditedDomain>) => onChange(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  const move = (place: number, by: -1 | 1) => {
    const { item, index } = rows[place]!;
    const next = moveDomain(items, index, by);
    onChange(next);
    const after = domainOutline(next);
    const now = after.findIndex((row) => keyOf(row.item) === keyOf(item));
    const siblings = siblingsOf(after, now);
    const where = after[now]!.parent === null ? "at the top" : `inside ${nameOf(after.find((row) => row.index === after[now]!.parent)!.item)}`;
    setSaid(`${nameOf(item)} moved ${by < 0 ? "up" : "down"}: now ${siblings.indexOf(now) + 1} of ${siblings.length} ${where}.`);
    // Focus stays on the button pressed, in the row's new place; at the top or foot, the way that is left.
    focusLater(() => rowFor(keyOf(item))?.querySelector<HTMLElement>(`[data-move="${by}"]`) ?? rowFor(keyOf(item))?.querySelector<HTMLElement>("[data-move]"));
  };
  const remove = (place: number) => {
    const { item, index } = rows[place]!;
    const inside = rows.filter((row) => row.parent === index).length;
    const next = removeDomain(items, index);
    onChange(next);
    setSaid(`${nameOf(item)} removed${inside ? `; what was inside it moved up a level` : ""}.`);
    const neighbour = rows[place + 1] && rows[place + 1]!.parent !== index ? rows[place + 1] : rows[place - 1];
    focusLater(() => (neighbour ? rowFor(keyOf(neighbour.item))?.querySelector<HTMLElement>("legend button") : null) ?? document.querySelector<HTMLElement>(".cat-outline__add button"));
  };
  const add = () => {
    const key = `new-${made}`;
    setMade(made + 1);
    onChange([...items, { id: "", key, name: "", parent_id: null }]);
    setOpened([...opened, key]);
    focusLater(() => rowFor(key)?.querySelector<HTMLElement>("input"));
  };
  const reparent = (index: number, parent: string | null) => {
    const item = items[index]!;
    onChange(outlined(items.map((current, at) => (at === index ? { ...current, parent_id: parent } : current))));
    // The row moves to its new parent; its field keeps focus there.
    focusLater(() => rowFor(keyOf(item))?.querySelector<HTMLElement>("[data-field='parent'] select"));
  };
  const toggle = (key: string) => setOpened(opened.includes(key) ? opened.filter((at) => at !== key) : [...opened, key]);

  return (
    <div className="cat-outline">
      {landscape && <MapReading items={items} />}
      <fieldset className="cat-form__rows">
        <legend className="cat-form__legend">{landscape ? "Domains: the top ones are the map's layers, in this order" : "Domains"}</legend>
        {landscape && (
          <p className="ds-field__hint">
            The bus is drawn across the map, under the layer it runs under; side layers are drawn last, side by side. A domain that runs
            across the others serves every one of them, such as the integration layer.
          </p>
        )}
        <p className="ds-visually-hidden" aria-live="polite">{said}</p>
        <ul className="cat-outline__list">
          {rows.map(({ item, index, depth }, place) => {
            const key = keyOf(item);
            const open = isOpen(key, index);
            const siblings = siblingsOf(rows, place);
            const first = siblings[0] === place;
            const last = siblings.at(-1) === place;
            const inside = rows.filter((row) => row.parent === index).length;
            const top = !item.parent_id;
            const summary = [
              landscape && item.layout ? LAYOUT_WORDS[item.layout] : null,
              landscape && top && item.cross_cutting ? "runs across the others" : null,
              inside ? `${inside} inside it` : null,
              item.description?.trim() || null,
            ].filter(Boolean);
            // Where it can sit: never in itself or anything inside it.
            const within = new Set([index]);
            for (const row of rows) if (row.parent !== null && within.has(row.parent)) within.add(row.index);
            const parents = [
              { value: "", label: "At the top" },
              // A new domain is offered too, by its row key, which takes its id once saved.
              ...rows.filter((row) => !within.has(row.index) && domainRef(row.item)).map((row) => ({ value: domainRef(row.item), label: pathOf(row.index) })),
            ];
            return (
              <li key={key} data-domain={key} data-depth={depth} className="cat-outline__item" style={{ "--depth": depth } as CSSProperties}>
                <fieldset className="cat-outline__row">
                  <legend className="cat-outline__title">
                    <button type="button" className="cat-form__row-toggle" aria-expanded={open} onClick={() => toggle(key)}>
                      {item.name.trim() || "New domain"}
                    </button>
                  </legend>
                  <div className="cat-outline__bar">
                    <p className="ds-field__hint cat-outline__summary">{summary.join(" · ") || "Nothing more said yet."}</p>
                    {/* Fixed places, so a second press at the same spot never lands on another row's button. */}
                    <span className="cat-outline__slot">
                      {!first && (
                        <Button variant="tertiary" icon={<ArrowUp size={14} />} data-move="-1" aria-label={`Move up ${nameOf(item)}`} onClick={() => move(place, -1)}>
                          Move up
                        </Button>
                      )}
                    </span>
                    <span className="cat-outline__slot">
                      {!last && (
                        <Button variant="tertiary" icon={<ArrowDown size={14} />} data-move="1" aria-label={`Move down ${nameOf(item)}`} onClick={() => move(place, 1)}>
                          Move down
                        </Button>
                      )}
                    </span>
                    <span className="cat-outline__slot cat-outline__slot--end">
                      <Button
                        variant="tertiary"
                        icon={<Trash2 size={14} />}
                        aria-label={inside ? `Remove ${nameOf(item)}; what is inside it moves up a level` : `Remove ${nameOf(item)}`}
                        onClick={() => remove(place)}
                      >
                        Remove
                      </Button>
                    </span>
                  </div>
                  {open && (
                    <div className="cat-form__grid">
                      <TextField label="Name" value={item.name} required error={errorAt(`domains.${index}.name`)} onChange={(name) => update(index, { name })} />
                      <div className="cat-form__cell" data-field="parent">
                        <SelectField
                          label="Inside"
                          value={item.parent_id ?? ""}
                          options={parents}
                          error={errorAt(`domains.${index}.parent`)}
                          onChange={(parent) => reparent(index, parent || null)}
                        />
                      </div>
                      {landscape && (top || item.layout) && (
                        <SelectField
                          label="Place on the map"
                          value={item.layout ?? ""}
                          options={PLACES}
                          error={errorAt(`domains.${index}.layout`)}
                          onChange={(layout) => {
                            update(index, { layout: (layout || null) as EditedDomain["layout"] });
                            if (layout) onPlaced?.(key);
                          }}
                        />
                      )}
                      {landscape && top && (
                        <CheckField label="Runs across the other domains" checked={Boolean(item.cross_cutting)} onChange={(cross_cutting) => update(index, { cross_cutting })} />
                      )}
                      <AreaField label="What it covers" value={item.description} onChange={(description) => update(index, { description: description || null })} />
                    </div>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ul>
        <div className="cat-outline__add">
          <Button variant="tertiary" icon={<Plus size={14} />} onClick={add}>
            Add a domain at the top
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
