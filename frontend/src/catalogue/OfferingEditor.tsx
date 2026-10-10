import type { CatalogueSystem, Channel, KnowledgeSource, Offering, SourceConfidence } from "../api/client";
import { CONFIDENCE_OPTIONS, COVERAGE, LAYERS } from "./catalogue";
import { lines } from "./editing";
import { AreaField, CheckField, LinesField, Rows, SelectField, SystemField, TextField } from "./forms";
import { LifecycleEditor } from "./LifecycleEditor";
import { TrackingEditor } from "./TrackingEditor";

type Part = Offering["components"][number];
type Responsibility = Part["responsibilities"][number];
type Point = Offering["values"][number];
type Realised = Part["realisation"][number];
type Nfr = Offering["nfrs"][number];

/** "CFS CFSS_ONPREM_FIREWALL_HE", cut short, to name one row on its legend and its Remove button. */
function realisedLabel(item: Realised, index: number): string {
  const short = LAYERS.find((entry) => entry.layer === item.layer)?.short ?? item.layer;
  const name = item.name.trim();
  if (!name) return `${short} ${index + 1}`;
  return `${short} ${name.length > 40 ? `${name.slice(0, 39)}…` : name}`;
}

const LAYER_OPTIONS = LAYERS.map(({ layer, short, long }) => ({ value: layer, label: short === long ? long : `${short}: ${long}` }));
const COVERAGE_OPTIONS = (Object.keys(COVERAGE) as Nfr["coverage"][]).map((value) => ({ value, label: COVERAGE[value] }));


/** "Name — description" per line, the way offering values and audiences are written. */
const pointLines = (points: Point[]) => points.map((point) => (point.description ? `${point.name} — ${point.description}` : point.name));
const linePoints = (items: string[], before: Point[]): Point[] =>
  lines(items).map((line) => {
    const [name = "", ...rest] = line.split(" — ");
    const description = rest.join(" — ").trim() || null;
    const kept = before.find((point) => point.name === name.trim());
    return { ...kept, name: name.trim(), description };
  });

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
};

type Question = Offering["questions"][number];
type Decision = Offering["decisions"][number];

const orderTypeOptions = (value: Offering) => value.order_types.map((type) => ({ code: type.code, name: type.name || type.code }));

/** What the offering is: its facts, what it offers, who it is for and what it promises. */
export function OfferingFacts({ value, onChange }: SectionProps) {
  const set = (patch: Partial<Offering>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => set({ name })} />
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
      </div>
      <AreaField label="What it offers" value={value.proposition} onChange={(proposition) => set({ proposition: proposition || null })} />
      <LinesField
        label="For"
        value={pointLines(value.audiences)}
        hint="One audience per line; add “ — ” and a description if the source gives one."
        onChange={(items) => set({ audiences: linePoints(items, value.audiences) })}
      />
      <LinesField
        label="Promises"
        value={pointLines(value.values)}
        hint="One per line; add “ — ” and a description if the source gives one."
        onChange={(items) => set({ values: linePoints(items, value.values) })}
      />
    </>
  );
}

/** The order types it can be ordered as, and the channels each is ordered through. */
export function OfferingOrderTypes({ value, onChange, channels, names }: SectionProps) {
  return (
    <Rows
      legend="Order types"
      one="order type"
      items={value.order_types}
      onChange={(order_types) => onChange({ ...value, order_types })}
      blank={() => ({ code: "", name: "", enabled: true, channels: [] })}
      itemLabel={(type, index) => `order type ${type.name || index + 1}`}
      render={(type, update) => (
        <>
          <TextField label="Name" value={type.name} required onChange={(name) => update({ name })} />
          <TextField label="Code" value={type.code} required dir="ltr" onChange={(code) => update({ code })} />
          <CheckField label="Offered" checked={type.enabled} onChange={(enabled) => update({ enabled })} />
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

/** Its parts, the systems responsible for each, and what each is realised as. */
export function OfferingParts({ value, onChange, systems, names }: SectionProps) {
  const orders = orderTypeOptions(value);
  return (
    <Rows<Part>
      legend="Parts"
      one="part"
      items={value.components}
      onChange={(components) => onChange({ ...value, components })}
      blank={() => ({ id: "", name: "", responsibilities: [], realisation: [], capability_ids: [] })}
      itemLabel={(part, index) => `part ${part.name || index + 1}`}
      render={(part, update) => (
        <>
          <TextField label="Name" value={part.name} required onChange={(name) => update({ name })} />
          <TextField label="Code" value={part.code} onChange={(code) => update({ code: code || null })} />
          <TextField label="Kind" value={part.kind} onChange={(kind) => update({ kind: kind || null })} />
          <CheckField label="Always included" checked={part.mandatory === true} onChange={(mandatory) => update({ mandatory })} />
          <CheckField
            label="Seen by the customer"
            checked={part.customer_visible === true}
            onChange={(customer_visible) => update({ customer_visible })}
          />
          <AreaField label="What it is" value={part.description} onChange={(description) => update({ description: description || null })} />
          <Rows<Responsibility>
            legend="Responsible systems"
            one="responsible system"
            items={part.responsibilities}
            onChange={(responsibilities) => update({ responsibilities })}
            blank={() => ({ system_id: systems[0]?.id ?? "", role: "", description: "", order_types: [] })}
            itemLabel={(item, index) => `responsibility ${item.role || index + 1}`}
            render={(item, change) => (
              <>
                <SystemField
                  label="System"
                  value={item.system_id}
                  systems={systems}
                  writtenAs={names?.system(item.system_id)}
                  onChange={(system_id) => change({ system_id })}
                />
                <TextField label="Role" value={item.role} required onChange={(role) => change({ role })} />
                <AreaField label="What it does for this part" value={item.description} onChange={(description) => change({ description })} />
                {orders.length > 0 && (
                  <fieldset className="choices form__field--wide">
                    <legend className="field__label">For order types (none means all)</legend>
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
            render={(item, change) => (
              <>
                <SelectField
                  label="Layer"
                  value={item.layer}
                  options={LAYER_OPTIONS}
                  onChange={(layer) => change({ layer: layer as Realised["layer"] })}
                />
                <TextField label="Name" value={item.name} required wide onChange={(name) => change({ name })} />
              </>
            )}
          />
        </>
      )}
    />
  );
}

/** Its non-functional requirements, one quality each. */
export function OfferingNfrs({ value, onChange }: SectionProps) {
  return (
    <Rows<Nfr>
      legend="Non-functional requirements"
      one="non-functional requirement"
      items={value.nfrs ?? []}
      onChange={(nfrs) => onChange({ ...value, nfrs })}
      blank={() => ({ quality: "", coverage: "missing" })}
      itemLabel={(item, index) => `requirement ${item.quality || index + 1}`}
      render={(item, change) => (
        <>
          <TextField label="Quality" value={item.quality} required onChange={(quality) => change({ quality })} />
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
      <TextField label="Id" value={item.id} dir="ltr" hint="Such as OQ-01; made for you when left empty." onChange={(id) => change({ id })} />
      <SelectField
        label="How sure its source is"
        value={item.confidence ?? ""}
        options={CONFIDENCE_OPTIONS}
        onChange={(confidence) => change({ confidence: (confidence || null) as SourceConfidence | null })}
      />
      <TextField label="Source" value={item.source} onChange={(source) => change({ source: source || null })} />
      <AreaField label="Question" value={item.text} required onChange={(text) => change({ text })} />
      <AreaField label="What the catalogue does meanwhile" value={item.impact} onChange={(impact) => change({ impact: impact || null })} />
      {choices.length > 0 && (
        <fieldset className="choices form__field--wide">
          <legend className="field__label">Asked for the order types (none means the whole offering)</legend>
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
          <SelectField
            label="How sure its source is"
            value={item.confidence ?? ""}
            options={CONFIDENCE_OPTIONS}
            onChange={(confidence) => change({ confidence: (confidence || null) as SourceConfidence | null })}
          />
          <TextField label="Source" value={item.source} onChange={(source) => change({ source: source || null })} />
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
      <fieldset className="choices form__field--wide">
        <legend className="field__label">Read from</legend>
        {register.length === 0 && chosen.length === 0 && <p className="form__hint">Register its sources on the Governance page first.</p>}
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

/**
 * A whole product offering, every section in the sheet's order: for a suggestion,
 * reviewed as a whole. On a draft's sheet each section is edited on its own.
 */
export function OfferingEditor({ value, onChange, systems, channels = [], names, register }: Omit<SectionProps, "channels"> & { channels?: Channel[] }) {
  const props = { value, onChange, systems, channels, names, register };
  return (
    <div className="form">
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
    <fieldset className="choices form__field--wide">
      <legend className="field__label">{legend}</legend>
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
