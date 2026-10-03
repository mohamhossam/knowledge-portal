import type { CatalogueSystem, Offering, SourceConfidence } from "../api/client";
import { CONFIDENCE } from "./catalogue";
import { lines } from "./editing";
import { AreaField, CheckField, LinesField, Rows, SelectField, SystemField, TextField } from "./forms";

type Part = Offering["components"][number];
type Responsibility = Part["responsibilities"][number];
type Point = Offering["values"][number];

const CONFIDENCE_OPTIONS = [
  { value: "", label: "Not stated" },
  ...(Object.keys(CONFIDENCE) as SourceConfidence[]).map((value) => ({ value, label: CONFIDENCE[value] })),
];

/** "Name — description" per line, the way offering values and audiences are written. */
const pointLines = (points: Point[]) => points.map((point) => (point.description ? `${point.name} — ${point.description}` : point.name));
const linePoints = (items: string[], before: Point[]): Point[] =>
  lines(items).map((line) => {
    const [name = "", ...rest] = line.split(" — ");
    const description = rest.join(" — ").trim() || null;
    const kept = before.find((point) => point.name === name.trim());
    return { ...kept, name: name.trim(), description };
  });

/**
 * A whole product offering: what it is, its order types, its parts and the
 * systems responsible for each part. Controlled; the caller keeps the value.
 */
export function OfferingEditor({ value, onChange, systems, names }: {
  value: Offering;
  onChange: (value: Offering) => void;
  systems: CatalogueSystem[];
  /** Names for systems a document mentions that the draft does not have yet. */
  names?: { system: (id: string) => string };
}) {
  const set = (patch: Partial<Offering>) => onChange({ ...value, ...patch });
  const orderTypeOptions = value.order_types.map((type) => ({ code: type.code, name: type.name || type.code }));
  return (
    <div className="form">
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => set({ name })} />
        <TextField label="Code" value={value.code} onChange={(code) => set({ code: code || null })} />
        <TextField label="Family" value={value.family} onChange={(family) => set({ family: family || null })} />
        <TextField label="Version" value={value.version} onChange={(version) => set({ version: version || null })} />
        <TextField label="Lifecycle" value={value.lifecycle} onChange={(lifecycle) => set({ lifecycle: lifecycle || null })} />
        <SelectField
          label="How sure its source is"
          value={value.confidence ?? ""}
          options={CONFIDENCE_OPTIONS}
          onChange={(confidence) => set({ confidence: (confidence || null) as SourceConfidence | null })}
        />
      </div>
      <AreaField label="What it offers" value={value.proposition} onChange={(proposition) => set({ proposition: proposition || null })} />
      <LinesField label="Rules" value={value.rules} onChange={(rules) => set({ rules })} />
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

      <Rows
        legend="Order types"
        one="order type"
        items={value.order_types}
        onChange={(order_types) => set({ order_types })}
        blank={() => ({ code: "", name: "", enabled: true })}
        itemLabel={(type, index) => `order type ${type.name || index + 1}`}
        render={(type, update) => (
          <>
            <TextField label="Name" value={type.name} required onChange={(name) => update({ name })} />
            <TextField label="Code" value={type.code} required dir="ltr" onChange={(code) => update({ code })} />
            <CheckField label="Offered" checked={type.enabled} onChange={(enabled) => update({ enabled })} />
          </>
        )}
      />

      <Rows<Part>
        legend="Parts"
        one="part"
        items={value.components}
        onChange={(components) => set({ components })}
        blank={() => ({ id: "", name: "", responsibilities: [] })}
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
                  {orderTypeOptions.length > 0 && (
                    <fieldset className="choices form__field--wide">
                      <legend className="field__label">For order types (none means all)</legend>
                      {orderTypeOptions.map((type) => (
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
          </>
        )}
      />
    </div>
  );
}
