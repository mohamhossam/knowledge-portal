import { useRef, useState } from "react";

import type { CatalogueSystem, Channel, KnowledgeSource, Offering, Release, SourceConfidence } from "../api/client";
import { ActionGroup, Button, Status } from "../design/components";
import { useFocusAfterRender } from "../design/hooks";
import { CONFIDENCE_OPTIONS, COVERAGE, LAYERS } from "./catalogue";
import { ambiguousNameMatches, conceptDomain, nameMatches } from "./editing";
import { AreaField, CheckField, Choices, LinesField, PickField, Rows, SelectField, SystemField, TextField } from "./forms";
import { SourceField } from "./SourceField";
import { LifecycleEditor } from "./LifecycleEditor";
import { TrackingEditor } from "./TrackingEditor";

type Part = Offering["components"][number];
type Responsibility = Part["responsibilities"][number];
type Point = Offering["values"][number];
type Realised = Part["realisation"][number];
type Nfr = Offering["nfrs"][number];
type OrderTypeStage = Offering["order_types"][number]["stage"];

/** Where an order type sits in the customer's life; left empty when its source does not say. */
const STAGE_OPTIONS = [
  { value: "", label: "Not said" },
  { value: "join", label: "Join: becoming a customer" },
  { value: "change", label: "Change: changing a live account" },
  { value: "support", label: "Support: tracking, repairs and visits" },
  { value: "leave", label: "Leave: ending or suspending the service" },
];

/** "CFS CFSS_ONPREM_FIREWALL_HE", cut short, to name one row on its legend and its Remove button. */
function realisedLabel(item: Realised, index: number): string {
  const short = LAYERS.find((entry) => entry.layer === item.layer)?.short ?? item.layer;
  const name = item.name.trim();
  if (!name) return `${short} ${index + 1}`;
  return `${short} ${name.length > 40 ? `${name.slice(0, 39)}…` : name}`;
}

const LAYER_OPTIONS = LAYERS.map(({ layer, short, long }) => ({ value: layer, label: short === long ? long : `${short}: ${long}` }));
const COVERAGE_OPTIONS = (Object.keys(COVERAGE) as Nfr["coverage"][]).map((value) => ({ value, label: COVERAGE[value] }));


/** Lines read as points: "name — description", one a line, the empty ones left out. */
const pastedPoints = (text: string): Point[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", ...rest] = line.split(/\s+[—–-]\s+/);
      return { name: name.trim(), description: rest.join(" — ").trim() || null };
    });

/**
 * Who an offering is for, or what it promises: each a row with its name, what it means, and
 * where it comes from, as the service keeps them (OfferingPoint). Two lines a row: what it is,
 * then its source; several are pasted at once, one a line.
 */
function PointRows({ legend, one, items, onChange, path, errorAt, longNames }: {
  legend: string;
  one: string;
  items: Point[];
  onChange: (items: Point[]) => void;
  /** Where its rows sit in the offering, for what is wrong with a field: "audiences". */
  path: string;
  errorAt?: (path: string) => string | null;
  /** Names that read as sentences, such as a promise: the name takes the wider column. */
  longNames?: boolean;
}) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [said, setSaid] = useState("");
  const focusLater = useFocusAfterRender();
  const many = one === "audience" ? "audiences" : `${one}s`;
  const pasted = pastedPoints(text);
  const addPasted = () => {
    onChange([...items, ...pasted]);
    setSaid(`${pasted.length === 1 ? `One ${one}` : `${pasted.length} ${many}`} added.`);
    setText("");
    setPasting(false);
    focusLater(() => document.getElementById(`${path}-paste`));
  };
  return (
    <div className="cat-form__wide">
      <Rows<Point>
        legend={legend}
        one={one}
        labelled
        items={items}
        onChange={onChange}
        blank={() => ({ name: "" })}
        itemLabel={(point, index) => `${one} ${point.name.trim() || index + 1}`}
        render={(point, change, index) => (
          <div className={`cat-points${longNames ? " cat-points--long" : ""}`}>
            <div className="cat-form__cell cat-points__name">
              <TextField label="Name" value={point.name} required error={errorAt?.(`${path}.${index}.name`)} onChange={(name) => change({ name })} />
            </div>
            <div className="cat-form__cell cat-points__means">
              <TextField label="What it means" value={point.description} onChange={(description) => change({ description: description || null })} />
            </div>
            <div className="cat-form__cell cat-points__source">
              <SourceField value={point.source} onChange={(source) => change({ source })} />
            </div>
            <div className="cat-form__cell">
              <SelectField
                label="How sure its source is"
                value={point.confidence ?? ""}
                options={CONFIDENCE_OPTIONS}
                onChange={(confidence) => change({ confidence: (confidence || null) as SourceConfidence | null })}
              />
            </div>
            {/* Confirmed in a source no one names reads as nothing when the offering is read: said here, not refused. */}
            {point.confidence === "confirmed" && !point.source?.trim() && (
              <p className="ds-field__hint cat-points__note">
                <Status tone="warning">Confirmed, but its source is not named; name it, or say how sure it is.</Status>
              </p>
            )}
          </div>
        )}
      />
      <p className="ds-visually-hidden" aria-live="polite">{said}</p>
      {pasting ? (
        <div className="cat-points__paste">
          <AreaField
            label={`Paste several ${many}`}
            value={text}
            rows={4}
            hint="One a line; add “ — ” and what it means if the source says. Their sources are left for you to name."
            onChange={setText}
          />
          <ActionGroup>
            <Button
              variant="secondary"
              unavailableReason={pasted.length ? null : `Paste at least one ${one} first.`}
              onClick={addPasted}
            >
              {pasted.length > 1 ? `Add these ${pasted.length} ${many}` : `Add the ${one}`}
            </Button>
            <Button
              variant="tertiary"
              onClick={() => {
                setPasting(false);
                setText("");
                focusLater(() => document.getElementById(`${path}-paste`));
              }}
            >
              Cancel the paste
            </Button>
          </ActionGroup>
        </div>
      ) : (
        <Button id={`${path}-paste`} variant="tertiary" onClick={() => setPasting(true)}>
          Paste several {many}
        </Button>
      )}
    </div>
  );
}

/** Who the offering is for and what it promises, each with where it comes from: a section of its own. */
export function OfferingAudience({ value, onChange, errorAt }: SectionProps) {
  return (
    <>
      <PointRows legend="Who it is for" one="audience" items={value.audiences} onChange={(audiences) => onChange({ ...value, audiences })} path="audiences" errorAt={errorAt} />
      <PointRows
        legend="What it promises"
        one="promise"
        items={value.values}
        onChange={(values) => onChange({ ...value, values })}
        path="values"
        errorAt={errorAt}
        longNames
      />
    </>
  );
}

/** What every section editor of an offering takes: the offering, edited in place. */
export type SectionProps = {
  value: Offering;
  onChange: (value: Offering) => void;
  systems: CatalogueSystem[];
  /** The draft's channels, to say which each order type can be ordered through. */
  channels: Channel[];
  /** Names for systems and channels a document mentions that the draft does not have yet. */
  names?: Names;
  /** The draft's source register, to say which sources an offering is read from. */
  register?: KnowledgeSource[];
  /** The draft's offerings, to retire this one for another (review recommendation 7); only on a draft's sheet. */
  offerings?: Offering[];
  /** The version itself, for what the offering links to: its concepts, portfolio and realisation records. */
  release?: Release;
  /** What is wrong with the field at a path ("plans.0.name"), said under it; nothing when it is fine. */
  errorAt?: (path: string) => string | null;
};

type Question = Offering["questions"][number];
type Decision = Offering["decisions"][number];

const orderTypeOptions = (value: Offering) => value.order_types.map((type) => ({ code: type.code, name: type.name || type.code }));

/** Portfolio nodes as places to put an offering, each by its path from the top ("Business unit › Family"). */
function portfolioOptions(release: Release | undefined, current: string | null | undefined) {
  const nodes = new Map((release?.portfolio ?? []).map((node) => [node.id, node]));
  const path = (id: string) => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (let node = nodes.get(id); node && !seen.has(node.id); node = node.parent_id ? nodes.get(node.parent_id) : undefined) {
      seen.add(node.id);
      names.unshift(node.name);
    }
    return names.join(" › ");
  };
  return [
    { value: "", label: "Not placed in the portfolio" },
    ...[...nodes.values()]
      // A retired node only while the offering already sits in it.
      .filter((node) => !node.deprecated || node.id === current)
      .map((node) => ({ value: node.id, label: node.deprecated ? `${path(node.id)} (retired)` : path(node.id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

/** What the offering is: its facts, where it sits in the portfolio, what it offers, who it is for and what it promises. */
export function OfferingFacts({ value, onChange, offerings, release, errorAt }: SectionProps) {
  const set = (patch: Partial<Offering>) => onChange({ ...value, ...patch });
  // ADR-0121: what can stand in for a retired offering is one still in service.
  const successors = [
    { value: "", label: "Nothing replaces it" },
    ...(offerings ?? []).filter((item) => item.id !== value.id && !item.deprecated).map((item) => ({ value: item.id, label: item.name })),
  ];
  return (
    <>
      <div className="cat-form__grid">
        <TextField label="Name" value={value.name} required error={errorAt?.("name")} onChange={(name) => set({ name })} />
        <TextField label="Code" value={value.code} onChange={(code) => set({ code: code || null })} />
        <TextField label="Family" value={value.family} onChange={(family) => set({ family: family || null })} />
        <TextField label="Version" value={value.version} onChange={(version) => set({ version: version || null })} />
        <TextField label="Lifecycle status" value={value.lifecycle} onChange={(lifecycle) => set({ lifecycle: lifecycle || null })} />
        <SelectField
          label="How sure its source is"
          value={value.confidence ?? ""}
          options={CONFIDENCE_OPTIONS}
          onChange={(confidence) => set({ confidence: (confidence || null) as SourceConfidence | null })}
        />
        {(release?.portfolio ?? []).length > 0 && (
          <SelectField
            label="Portfolio"
            value={value.portfolio_node_id ?? ""}
            options={portfolioOptions(release, value.portfolio_node_id)}
            wide
            onChange={(id) => set({ portfolio_node_id: id || null })}
          />
        )}
      </div>
      {offerings && (
        <>
          <CheckField
            label="Retired: still readable, never matched again"
            checked={value.deprecated}
            onChange={(deprecated) => set({ deprecated, replaced_by: deprecated ? value.replaced_by : null })}
          />
          {value.deprecated && (
            <SelectField
              label="Replaced by"
              value={value.replaced_by ?? ""}
              options={successors}
              onChange={(id) => set({ replaced_by: id || null })}
            />
          )}
        </>
      )}
      <AreaField label="What it offers" value={value.proposition} onChange={(proposition) => set({ proposition: proposition || null })} />
      <AreaField label="Why a customer buys it" value={value.purpose} onChange={(purpose) => set({ purpose: purpose || null })} />
    </>
  );
}

/** The order types it can be ordered as, and the channels each is ordered through. */
export function OfferingOrderTypes({ value, onChange, channels, names, errorAt }: SectionProps) {
  return (
    <Rows
      legend="Order types"
      one="order type"
      items={value.order_types}
      onChange={(order_types) => onChange({ ...value, order_types })}
      blank={() => ({ code: "", name: "", enabled: true, channels: [] })}
      itemLabel={(type, index) => `order type ${type.name || index + 1}`}
      render={(type, update, index) => (
        <>
          <TextField label="Name" value={type.name} required error={errorAt?.(`order_types.${index}.name`)} onChange={(name) => update({ name })} />
          <TextField label="Code" value={type.code} required dir="ltr" error={errorAt?.(`order_types.${index}.code`)} onChange={(code) => update({ code })} />
          <CheckField label="Offered" checked={type.enabled} onChange={(enabled) => update({ enabled })} />
          <SelectField
            label="Customer stage"
            value={type.stage ?? ""}
            options={STAGE_OPTIONS}
            onChange={(stage) => update({ stage: (stage || null) as OrderTypeStage })}
          />
          {(channels.length > 0 || (type.channels ?? []).length > 0) && (
            <ChannelChoices
              legend="Ordered through"
              channels={channels}
              chosen={type.channels ?? []}
              names={names}
              onChange={(chosen) => update({ channels: chosen })}
            />
          )}
        </>
      )}
    />
  );
}

/** Concepts a part may mean, under their capability domains; a retired one only while a part already means it. */
function conceptOptions(release: Release | undefined, chosen: string[]) {
  const domains = new Map((release?.capability_domains ?? []).map((domain) => [domain.id, domain.name]));
  return (release?.business_capabilities ?? [])
    .filter((concept) => !concept.deprecated || chosen.includes(concept.id))
    .map((concept) => {
      const domain = release ? conceptDomain(release, concept.id) : null;
      return {
        value: concept.id,
        label: concept.deprecated ? `${concept.pref_label} (retired)` : concept.pref_label,
        group: (domain && domains.get(domain)) || "No capability domain",
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

/** The realisation records of one layer, to link a part's "realised as" to the record it means. */
function recordOptions(release: Release | undefined, layer: Realised["layer"]) {
  return [
    { value: "", label: "Not linked to a record" },
    ...(release?.realisations ?? [])
      .filter((record) => record.layer === layer)
      .map((record) => ({ value: record.id, label: record.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

/**
 * The record a thing a part is realised as means, among its layer's records. A record of another
 * layer, left by a layer change, stays shown and is said to be wrong; a layer with none says so.
 */
function RecordField({ item, release, onChange }: { item: Realised; release: Release | undefined; onChange: (record_id: string | null) => void }) {
  const options = recordOptions(release, item.layer);
  const linked = item.record_id ? (release?.realisations ?? []).find((record) => record.id === item.record_id) : undefined;
  const astray = linked && linked.layer !== item.layer ? linked : undefined;
  const layerName = LAYERS.find((entry) => entry.layer === item.layer)?.short ?? item.layer;
  if (options.length === 1 && !item.record_id) {
    return <p className="ds-field__hint cat-form__wide">No {layerName} record in this draft to link it to.</p>;
  }
  return (
    <SelectField
      label="The record it means"
      value={item.record_id ?? ""}
      options={astray ? [...options, { value: astray.id, label: `${astray.name} (another layer)` }] : options}
      error={astray ? `${astray.name} is a record of another layer: choose a ${layerName} record, or none.` : null}
      onChange={(record_id) => onChange(record_id || null)}
    />
  );
}

/**
 * Linking several parts at once: one concept to the parts ticked, and every thing a part is
 * realised as to the one record of its layer that goes by its name. Each says what it did.
 */
function LinkSeveral({ value, onChange, release }: { value: Offering; onChange: (value: Offering) => void; release: Release }) {
  const [concept, setConcept] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  // Name matches left unticked: the rest are linked by "Link N ticked".
  const [skipped, setSkipped] = useState<string[]>([]);
  const [said, setSaid] = useState("");
  const status = useRef<HTMLParagraphElement>(null);
  const focusLater = useFocusAfterRender();
  const options = conceptOptions(release, []);
  // A part already marked "no concept fits" is left out: linking it is a choice made on the part itself.
  const open = value.components.filter((part) => part.unlinked_reason == null && part.name.trim());
  const keyOf = (part: Part) => part.id || part.name;
  const chosen = open.filter((part) => ticked.includes(keyOf(part)));
  const matches = nameMatches(value, release);
  const matchKey = (match: { part: number; line: number }) => `${match.part}:${match.line}`;
  const toLink = matches.filter((match) => !skipped.includes(matchKey(match)));
  const ambiguous = ambiguousNameMatches(value, release);
  const records = new Map((release.realisations ?? []).map((record) => [record.id, record]));
  const conceptName = (id: string) => options.find((option) => option.value === id)?.label ?? id;
  // What was done stays said, with focus on it, until the next link: the box stays while it has something to say.
  const tell = (text: string) => {
    setSaid(text);
    focusLater(() => status.current);
  };
  if ((options.length === 0 || open.length < 2) && matches.length === 0 && ambiguous === 0 && !said) return null;
  const link = () => {
    const keys = new Set(chosen.map(keyOf));
    onChange({
      ...value,
      components: value.components.map((part) =>
        keys.has(keyOf(part)) && !(part.capability_ids ?? []).includes(concept) ? { ...part, capability_ids: [...(part.capability_ids ?? []), concept] } : part,
      ),
    });
    tell(`Linked ${conceptName(concept)} to ${chosen.map((part) => part.name).join(" and ")}.`);
    setTicked([]);
    setConcept("");
  };
  const linkByName = () => {
    onChange({
      ...value,
      components: value.components.map((part, partIndex) => ({
        ...part,
        realisation: (part.realisation ?? []).map((item, line) => {
          const match = toLink.find((found) => found.part === partIndex && found.line === line);
          return match ? { ...item, record_id: match.recordId } : item;
        }),
      })),
    });
    tell(
      `Linked ${toLink
        .map((match) => `${value.components[match.part]?.realisation?.[match.line]?.name} on ${value.components[match.part]?.name}`)
        .join(", ")} to the record that goes by its name.`,
    );
    setSkipped([]);
  };
  return (
    <fieldset className="cat-form__rows">
      <legend className="cat-form__legend">Link several at once</legend>
      {options.length > 0 && open.length > 1 && (
        <>
          <SelectField label="Concept" value={concept} options={[{ value: "", label: "Choose a concept…" }, ...options]} onChange={setConcept} />
          <Choices legend="Parts it means">
            {open.map((part) => (
              <CheckField
                key={keyOf(part)}
                label={part.name}
                checked={ticked.includes(keyOf(part))}
                onChange={(on) => setTicked(on ? [...ticked, keyOf(part)] : ticked.filter((key) => key !== keyOf(part)))}
              />
            ))}
          </Choices>
          <ActionGroup>
            <Button unavailableReason={!concept ? "Choose a concept first." : chosen.length === 0 ? "Tick the parts it means first." : null} onClick={link}>
              {chosen.length > 1 ? `Link ${chosen.length} parts` : chosen.length === 1 ? "Link 1 part" : "Link the parts"}
            </Button>
          </ActionGroup>
        </>
      )}
      {matches.length > 0 && (
        <>
          {/* Each pair is seen before it is linked: untick one to leave it. */}
          <Choices legend="Realised as, and the record that goes by the same name">
            {matches.map((match) => {
              const item = value.components[match.part]?.realisation?.[match.line];
              const record = records.get(match.recordId);
              return (
                <CheckField
                  key={matchKey(match)}
                  label={`${value.components[match.part]?.name}: ${item?.name} → ${record?.name} (${LAYERS.find((entry) => entry.layer === record?.layer)?.short ?? record?.layer})`}
                  checked={!skipped.includes(matchKey(match))}
                  onChange={(on) => setSkipped(on ? skipped.filter((key) => key !== matchKey(match)) : [...skipped, matchKey(match)])}
                />
              );
            })}
          </Choices>
          <ActionGroup>
            <Button unavailableReason={toLink.length ? null : "Tick a pair to link first."} onClick={linkByName}>
              {toLink.length === 1 ? "Link 1 ticked" : `Link ${toLink.length} ticked`}
            </Button>
          </ActionGroup>
        </>
      )}
      {ambiguous > 0 && (
        <p className="ds-field__hint">
          {ambiguous === 1 ? "1 thing a part is realised as goes" : `${ambiguous} things the parts are realised as go`} by a name two records share, so
          {ambiguous === 1 ? " it is" : " they are"} left to choose on the part.
        </p>
      )}
      <p ref={status} tabIndex={-1} className="cat-edit__changes" role="status">
        {said}
      </p>
    </fieldset>
  );
}

/** Its parts, the concepts each means, the systems responsible for each, and what each is realised as. */
export function OfferingParts({ value, onChange, systems, names, release, errorAt }: SectionProps) {
  const orders = orderTypeOptions(value);
  const hasConcepts = (release?.business_capabilities ?? []).length > 0;
  const hasRecords = (release?.realisations ?? []).length > 0;
  // One part at most is the device the bundle is built on: one choice, not a box on each part.
  const hub = value.components.findIndex((part) => part.hub);
  const chooseHub = (index: string) =>
    onChange({ ...value, components: value.components.map((part, at) => ({ ...part, hub: String(at) === index })) });
  return (
    <>
      <SelectField
        label="The device it is built on"
        value={hub < 0 ? "" : String(hub)}
        options={[
          { value: "", label: "None of its parts" },
          ...value.components.map((part, at) => ({ value: String(at), label: part.name || `Part ${at + 1}` })),
        ]}
        onChange={chooseHub}
      />
      {release && <LinkSeveral value={value} onChange={onChange} release={release} />}
      <Rows<Part>
        legend="Parts"
        one="part"
        labelled
        items={value.components}
        onChange={(components) => onChange({ ...value, components })}
        blank={() => ({ id: "", name: "", responsibilities: [], realisation: [], capability_ids: [], hub: false })}
        itemLabel={(part, index) => `part ${part.name || index + 1}`}
        render={(part, update, index) => (
          <>
            <TextField label="Name" value={part.name} required error={errorAt?.(`components.${index}.name`)} onChange={(name) => update({ name })} />
            <TextField label="Code" value={part.code} onChange={(code) => update({ code: code || null })} />
            <TextField label="Kind" value={part.kind} onChange={(kind) => update({ kind: kind || null })} />
            <CheckField label="Always included" checked={part.mandatory === true} onChange={(mandatory) => update({ mandatory })} />
            <CheckField
              label="Seen by the customer"
              checked={part.customer_visible === true}
              onChange={(customer_visible) => update({ customer_visible })}
            />
            <AreaField label="What it is" value={part.description} onChange={(description) => update({ description: description || null })} />
            {(hasConcepts || (part.capability_ids ?? []).length > 0 || part.unlinked_reason != null) && (
              <>
                {part.unlinked_reason == null && (
                  <PickField
                    label="Concepts it means"
                    hint="The concepts requirement work maps to this part through."
                    chosen={part.capability_ids ?? []}
                    options={conceptOptions(release, part.capability_ids ?? [])}
                    onChange={(capability_ids) => update({ capability_ids })}
                  />
                )}
                <CheckField
                  label="No concept fits it"
                  checked={part.unlinked_reason != null}
                  // A part is linked to concepts or says why none fits, never both. The concepts it had stay
                  // until it is saved, so unticking brings them back; saving with the box ticked lets them go.
                  onChange={(none) => update({ unlinked_reason: none ? part.unlinked_reason ?? "" : null })}
                />
                {part.unlinked_reason != null && (
                  <>
                    {(part.capability_ids ?? []).length > 0 && (
                      <p className="ds-field__hint cat-form__wide">
                        Saving lets go of {(part.capability_ids ?? []).length === 1 ? "the concept" : `the ${part.capability_ids.length} concepts`} it
                        means; untick the box to keep {(part.capability_ids ?? []).length === 1 ? "it" : "them"}.
                      </p>
                    )}
                    <TextField
                      label="Why no concept fits"
                      value={part.unlinked_reason}
                      required
                      wide
                      error={errorAt?.(`components.${index}.unlinked_reason`)}
                      onChange={(unlinked_reason) => update({ unlinked_reason })}
                    />
                  </>
                )}
              </>
            )}
            <Rows<Responsibility>
              legend="Responsible systems"
              one="responsible system"
              items={part.responsibilities}
              onChange={(responsibilities) => update({ responsibilities })}
              blank={() => ({ system_id: systems[0]?.id ?? "", role: "", description: "", order_types: [] })}
              itemLabel={(item, index) => `responsibility ${item.role || index + 1}`}
              render={(item, change, line) => (
                <>
                  <SystemField
                    label="System"
                    value={item.system_id}
                    systems={systems}
                    writtenAs={names?.system(item.system_id)}
                    onChange={(system_id) => change({ system_id })}
                  />
                  <TextField label="Role" value={item.role} required error={errorAt?.(`components.${index}.responsibilities.${line}.role`)} onChange={(role) => change({ role })} />
                  <AreaField label="What it does for this part" value={item.description} onChange={(description) => change({ description })} />
                  {orders.length > 0 && (
                    <fieldset className="cat-form__choices cat-form__wide">
                      <legend className="ds-field__label">For order types (none means all)</legend>
                      {orders.map((type) => (
                        <CheckField
                          key={type.code}
                          label={type.name}
                          checked={item.order_types.includes(type.code)}
                          onChange={(on) =>
                            change({ order_types: on ? [...item.order_types, type.code] : item.order_types.filter((code) => code !== type.code) })
                          }
                        />
                      ))}
                    </fieldset>
                  )}
                </>
              )}
            />
            <Rows<Realised>
              legend="Realised as"
              one={`thing ${part.name || "this part"} is realised as`}
              items={part.realisation ?? []}
              onChange={(realisation) => update({ realisation })}
              blank={() => ({ layer: "cfs", name: "" })}
              itemLabel={(item, index) => realisedLabel(item, index)}
              render={(item, change, line) => (
                <>
                  <SelectField
                    label="Layer"
                    value={item.layer}
                    options={LAYER_OPTIONS}
                    // A record of another layer stays linked, and is said to be wrong, until it is relinked or let go.
                    onChange={(layer) => change({ layer: layer as Realised["layer"] })}
                  />
                  <TextField label="Name" value={item.name} required wide error={errorAt?.(`components.${index}.realisation.${line}.name`)} onChange={(name) => change({ name })} />
                  {hasRecords && <RecordField item={item} release={release} onChange={(record_id) => change({ record_id })} />}
                  <SelectField
                    label="How sure its source is"
                    value={item.confidence ?? ""}
                    options={CONFIDENCE_OPTIONS}
                    onChange={(confidence) => change({ confidence: (confidence || null) as SourceConfidence | null })}
                  />
                </>
              )}
            />
          </>
        )}
      />
    </>
  );
}

/** Its non-functional requirements, one quality each. */
export function OfferingNfrs({ value, onChange, errorAt }: SectionProps) {
  return (
    <Rows<Nfr>
      legend="Non-functional requirements"
      one="non-functional requirement"
      items={value.nfrs ?? []}
      onChange={(nfrs) => onChange({ ...value, nfrs })}
      blank={() => ({ quality: "", coverage: "missing" })}
      itemLabel={(item, index) => `requirement ${item.quality || index + 1}`}
      render={(item, change, index) => (
        <>
          <TextField label="Quality" value={item.quality} required error={errorAt?.(`nfrs.${index}.quality`)} onChange={(quality) => change({ quality })} />
          <SelectField
            label="Defined"
            value={item.coverage}
            options={COVERAGE_OPTIONS}
            onChange={(coverage) => change({ coverage: coverage as Nfr["coverage"] })}
          />
          <AreaField label="What the sources say" value={item.statement} onChange={(statement) => change({ statement: statement || null })} />
        </>
      )}
    />
  );
}

/** How its orders are tracked. */
export function OfferingTracking({ value, onChange, systems, channels, names }: SectionProps) {
  return (
    <TrackingEditor
      value={value.tracking}
      onChange={(tracking) => onChange({ ...value, tracking })}
      systems={systems}
      channels={channels}
      orderTypes={orderTypeOptions(value)}
      names={names}
    />
  );
}

/** What happens to it over its life. */
export function OfferingNotes({ value, onChange, channels, names }: SectionProps) {
  return (
    <LifecycleEditor
      value={value.lifecycle_notes ?? []}
      onChange={(lifecycle_notes) => onChange({ ...value, lifecycle_notes })}
      channels={channels}
      orderTypes={orderTypeOptions(value)}
      names={names}
    />
  );
}

/**
 * An open question's fields, shared by the offering's editor and a suggested question's:
 * the order types it is asked for, none meaning the offering as a whole. An order type a
 * change request named that the offering does not have stays chosen, so it can be unticked.
 */
export function QuestionFields({ item, orders, change }: {
  item: Question;
  orders: { code: string; name: string }[];
  change: (patch: Partial<Question>) => void;
}) {
  const asked = item.order_types ?? [];
  const unknown = asked.filter((code) => !orders.some((type) => type.code === code));
  const choices = [...orders, ...unknown.map((code) => ({ code, name: `${code} (not one of its order types)` }))];
  return (
    <>
      <TextField label="Id" value={item.id} dir="ltr" hint="The source’s own, such as F3; made for you when empty." onChange={(id) => change({ id })} />
      <SourceField value={item.source} onChange={(source) => change({ source })} />
      <SelectField
        label="How sure its source is"
        value={item.confidence ?? ""}
        options={CONFIDENCE_OPTIONS}
        onChange={(confidence) => change({ confidence: (confidence || null) as SourceConfidence | null })}
      />
      <TextField label="In a few words" value={item.title} wide hint="The question’s title, such as Is B2B Digital in scope?; optional." onChange={(title) => change({ title: title || null })} />
      <AreaField label="Question" value={item.text} required onChange={(text) => change({ text })} />
      <AreaField label="What the catalogue does meanwhile" value={item.impact} onChange={(impact) => change({ impact: impact || null })} />
      {choices.length > 0 && (
        <fieldset className="cat-form__choices cat-form__wide">
          <legend className="ds-field__label">Asked for the order types (none means the whole offering)</legend>
          {choices.map((type) => (
            <CheckField
              key={type.code}
              label={type.name}
              checked={asked.includes(type.code)}
              onChange={(on) => change({ order_types: on ? [...asked, type.code] : asked.filter((code) => code !== type.code) })}
            />
          ))}
        </fieldset>
      )}
    </>
  );
}

/** The questions its sources leave open. */
export function OfferingQuestions({ value, onChange }: SectionProps) {
  return (
    <Rows<Question>
      legend="Open questions"
      one="open question"
      items={value.questions ?? []}
      onChange={(questions) => onChange({ ...value, questions })}
      blank={() => ({ id: "", text: "", order_types: [] })}
      itemLabel={(item, index) => `question ${item.id || index + 1}`}
      render={(item, change) => <QuestionFields item={item} orders={orderTypeOptions(value)} change={change} />}
    />
  );
}

/** The architecture decisions taken for it. */
export function OfferingDecisions({ value, onChange }: SectionProps) {
  return (
    <Rows<Decision>
      legend="Architecture decisions"
      one="architecture decision"
      items={value.decisions ?? []}
      onChange={(decisions) => onChange({ ...value, decisions })}
      blank={() => ({ id: "", title: "" })}
      itemLabel={(item, index) => `decision ${item.id || index + 1}`}
      render={(item, change) => (
        <>
          <TextField label="Decision" value={item.title} required wide onChange={(title) => change({ title })} />
          <TextField label="Id" value={item.id} dir="ltr" hint="Such as AD-01; made for you when left empty." onChange={(id) => change({ id })} />
          <SourceField value={item.source} onChange={(source) => change({ source })} />
          <SelectField
            label="How sure its source is"
            value={item.confidence ?? ""}
            options={CONFIDENCE_OPTIONS}
            onChange={(confidence) => change({ confidence: (confidence || null) as SourceConfidence | null })}
          />
          <AreaField label="What was decided, and why" value={item.text} onChange={(text) => change({ text: text || null })} />
        </>
      )}
    />
  );
}

/** The registered sources it is read from, its primary one, what they cover, and what it no longer uses. */
export function OfferingSources({ value, onChange, register = [] }: SectionProps) {
  const chosen = value.sources ?? [];
  const set = (patch: Partial<Offering>) => onChange({ ...value, ...patch });
  const named = (id: string) => register.find((source) => source.id === id);
  const label = (id: string) => {
    const source = named(id);
    return source ? `${source.short ?? source.title} (${source.level})` : `${id} (not in the register)`;
  };
  return (
    <>
      <fieldset className="cat-form__choices cat-form__wide">
        <legend className="ds-field__label">Read from</legend>
        {register.length === 0 && chosen.length === 0 && <p className="ds-field__hint cat-form__all">Register its sources on the Governance page first.</p>}
        {[...chosen.filter((id) => !named(id)), ...register.map((source) => source.id)].map((id) => (
          <CheckField
            key={id}
            label={label(id)}
            checked={chosen.includes(id)}
            onChange={(on) => {
              const sources = on ? [...chosen, id] : chosen.filter((item) => item !== id);
              set({ sources, primary_source: sources.includes(value.primary_source ?? "") ? value.primary_source : null });
            }}
          />
        ))}
      </fieldset>
      <SelectField
        label="Its primary source"
        value={value.primary_source ?? ""}
        options={[{ value: "", label: "None named" }, ...chosen.map((id) => ({ value: id, label: label(id) }))]}
        onChange={(primary_source) => set({ primary_source: primary_source || null })}
      />
      <LinesField label="What its sources cover" value={value.boundaries ?? []} hint="One boundary per line." onChange={(boundaries) => set({ boundaries })} />
      <LinesField label="What it no longer uses" value={value.not_used ?? []} hint="One per line, such as a system it replaced." onChange={(not_used) => set({ not_used })} />
    </>
  );
}

/** Its rules, one per line. */
export function OfferingRules({ value, onChange }: SectionProps) {
  return <LinesField label="Rules" value={value.rules} hint="One rule per line." onChange={(rules) => onChange({ ...value, rules })} />;
}

type Plan = Offering["plans"][number];
type Characteristic = Plan["characteristics"][number];
type BusinessRule = Offering["business_rules"][number];

/** Its plans as the sources describe them: each with the characteristics that set it apart, and where it comes from. */
export function OfferingPlansFields({ value, onChange, errorAt }: SectionProps) {
  return (
    <Rows<Plan>
      legend="Plans"
      one="plan"
      labelled
      items={value.plans ?? []}
      onChange={(plans) => onChange({ ...value, plans })}
      blank={() => ({ name: "", characteristics: [] })}
      itemLabel={(plan, index) => `plan ${plan.name.trim() || index + 1}`}
      render={(plan, update, index) => (
        <>
          <TextField label="Plan" value={plan.name} required error={errorAt?.(`plans.${index}.name`)} onChange={(name) => update({ name })} />
          <SourceField value={plan.source} onChange={(source) => update({ source })} />
          <SelectField
            label="How sure its source is"
            value={plan.confidence ?? ""}
            options={CONFIDENCE_OPTIONS}
            onChange={(confidence) => update({ confidence: (confidence || null) as SourceConfidence | null })}
          />
          <AreaField label="What it is" value={plan.description} onChange={(description) => update({ description: description || null })} />
          <Rows<Characteristic>
            legend="Characteristics"
            one="characteristic"
            items={plan.characteristics}
            onChange={(characteristics) => update({ characteristics })}
            blank={() => ({ name: "", value: "" })}
            itemLabel={(item, index) => `characteristic ${item.name.trim() || index + 1}`}
            render={(item, change, line) => (
              <>
                <TextField label="Characteristic" value={item.name} required error={errorAt?.(`plans.${index}.characteristics.${line}.name`)} onChange={(name) => change({ name })} />
                <TextField
                  label="Value"
                  value={item.value}
                  required
                  error={errorAt?.(`plans.${index}.characteristics.${line}.value`)}
                  hint="With its unit, such as 200 Mbps: plans compare by it."
                  onChange={(text) => change({ value: text })}
                />
              </>
            )}
          />
        </>
      )}
    />
  );
}

/** What a business rule governs, as sources group them; any other word may be typed. */
const RULE_KINDS = ["composition", "eligibility", "dependency", "lifecycle", "fulfilment", "billing"];

/** The rules it is sold and fulfilled by: each with an id, what it governs, what it says and where it comes from. */
export function OfferingBusinessRules({ value, onChange, errorAt }: SectionProps) {
  return (
    <Rows<BusinessRule>
      legend="Business rules"
      one="business rule"
      labelled
      items={value.business_rules ?? []}
      onChange={(business_rules) => onChange({ ...value, business_rules })}
      blank={() => ({ id: "", statement: "" })}
      itemLabel={(rule, index) => `rule ${rule.id.trim() || index + 1}`}
      render={(rule, update, index) => (
        <>
          {/* What the rule says comes first: a new rule's focus lands there, and the id is made when left empty. */}
          <AreaField label="What it says" value={rule.statement} required error={errorAt?.(`business_rules.${index}.statement`)} onChange={(statement) => update({ statement })} />
          <TextField
            label="What it governs"
            value={rule.kind}
            hint={`Such as ${RULE_KINDS.join(", ")}.`}
            onChange={(kind) => update({ kind: kind || null })}
          />
          <TextField
            label="Id"
            value={rule.id}
            dir="ltr"
            hint="Such as BR-04; made for you when left empty."
            error={errorAt?.(`business_rules.${index}.id`)}
            onChange={(id) => update({ id })}
          />
          <SourceField value={rule.source} onChange={(source) => update({ source })} />
          <SelectField
            label="How sure its source is"
            value={rule.confidence ?? ""}
            options={CONFIDENCE_OPTIONS}
            onChange={(confidence) => update({ confidence: (confidence || null) as SourceConfidence | null })}
          />
        </>
      )}
    />
  );
}

/**
 * A whole product offering, every section in the sheet's order: for a suggestion,
 * reviewed as a whole. On a draft's sheet each section is edited on its own.
 */
export function OfferingEditor({ value, onChange, systems, channels = [], names, register }: Omit<SectionProps, "channels"> & { channels?: Channel[] }) {
  const props = { value, onChange, systems, channels, names, register };
  return (
    <div className="cat-form">
      <OfferingFacts {...props} />
      <OfferingOrderTypes {...props} />
      <OfferingParts {...props} />
      <OfferingNfrs {...props} />
      <OfferingTracking {...props} />
      <OfferingNotes {...props} />
      <OfferingQuestions {...props} />
      <OfferingDecisions {...props} />
      <OfferingSources {...props} />
      <OfferingRules {...props} />
    </div>
  );
}

/** Names for what a document mentions that the draft does not have yet. */
export type Names = { system: (id: string) => string; channel?: (id: string) => string };

/**
 * The draft's channels as checkboxes; a channel a document named that the draft does not
 * have yet is listed first, ticked, so a reviewer sees it was read.
 */
export function ChannelChoices({ legend, channels, chosen, onChange, names }: {
  legend: string;
  channels: Channel[];
  chosen: string[];
  onChange: (chosen: string[]) => void;
  names?: Names;
}) {
  const written = chosen.filter((id) => !channels.some((channel) => channel.id === id));
  return (
    <fieldset className="cat-form__choices cat-form__wide">
      <legend className="ds-field__label">{legend}</legend>
      {written.map((id) => (
        <CheckField
          key={`written:${id}`}
          label={`${names?.channel?.(id) ?? id} (not in the draft yet)`}
          checked
          onChange={() => onChange(chosen.filter((item) => item !== id))}
        />
      ))}
      {channels.map((channel) => (
        <CheckField
          key={channel.id}
          label={channel.name}
          checked={chosen.includes(channel.id)}
          onChange={(on) => onChange(on ? [...chosen, channel.id] : chosen.filter((id) => id !== channel.id))}
        />
      ))}
    </fieldset>
  );
}
