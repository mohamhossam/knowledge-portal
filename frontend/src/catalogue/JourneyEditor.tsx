import { X } from "lucide-react";

import type { CatalogueSystem, Channel, Journey, JourneyActivity, Offering, SourceConfidence } from "../api/client";
import { CONFIDENCE, orderedSteps } from "./catalogue";
import { AreaField, CheckField, Rows, SelectField, SystemField, TextField } from "./forms";
import { ChannelChoices } from "./OfferingEditor";

type Rule = Journey["flow_rules"][number];
type Handover = Journey["integrations"][number];

const CONFIDENCE_OPTIONS = [
  { value: "", label: "Not stated" },
  ...(Object.keys(CONFIDENCE) as SourceConfidence[]).map((value) => ({ value, label: CONFIDENCE[value] })),
];

const RULE_KINDS = [
  { value: "decision", label: "A decision" },
  { value: "loop", label: "A loop back" },
  { value: "parallel", label: "A parallel track" },
];

/**
 * A whole journey: the offering it fulfils, its steps and who performs each,
 * where it branches, and how steps hand over. Controlled; the caller keeps the value.
 */
export function JourneyEditor({ value, onChange, systems, offerings, channels = [], names }: {
  value: Journey;
  onChange: (value: Journey) => void;
  systems: CatalogueSystem[];
  offerings: Offering[];
  /** The draft's channels, to say which channels a step happens in. */
  channels?: Channel[];
  /** Names for things a document mentions that the draft does not have yet. */
  names?: { system: (id: string) => string; offering: (id: string) => string };
}) {
  const set = (patch: Partial<Journey>) => onChange({ ...value, ...patch });
  const offering = offerings.find((item) => item.id === value.product_id);
  const offeringOptions = [
    { value: "", label: "Not tied to an offering" },
    ...(value.product_id && !offering
      ? [{ value: value.product_id, label: `${names?.offering(value.product_id) ?? value.product_id} (not in the draft yet)` }]
      : []),
    ...offerings.map((item) => ({ value: item.id, label: item.name })),
  ];
  const typeOptions = [
    { value: "", label: "Any order type" },
    ...(offering?.order_types ?? []).map((type) => ({ value: type.code, label: type.name || type.code })),
    ...(value.order_type_code && !offering?.order_types.some((type) => type.code === value.order_type_code)
      ? [{ value: value.order_type_code, label: `${value.order_type_code} (not in the draft yet)` }]
      : []),
  ];
  const stepOptions = orderedSteps(value).map((step) => ({ value: step.number, label: `${step.number}. ${step.name || "unnamed"}` }));
  const firstStep = stepOptions[0]?.value ?? "";

  return (
    <div className="form">
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => set({ name })} wide />
        <SelectField
          label="Fulfils the offering"
          value={value.product_id ?? ""}
          options={offeringOptions}
          onChange={(product_id) => set({ product_id: product_id || null, order_type_code: null })}
        />
        <SelectField
          label="For the order type"
          value={value.order_type_code ?? ""}
          options={typeOptions}
          onChange={(code) => set({ order_type_code: code || null })}
        />
        <SelectField
          label="How sure its source is"
          value={value.confidence ?? ""}
          options={CONFIDENCE_OPTIONS}
          onChange={(confidence) => set({ confidence: (confidence || null) as SourceConfidence | null })}
        />
      </div>
      <AreaField label="What it is" value={value.description} onChange={(description) => set({ description: description || null })} />

      <Rows<JourneyActivity>
        legend="Steps"
        one="step"
        items={value.activities}
        onChange={(activities) => set({ activities })}
        blank={() => ({
          number: String((Math.max(0, ...value.activities.map((step) => Number.parseFloat(step.number) || 0)) + 10)),
          name: "",
          supporting_system_ids: [],
          component_ids: [],
          channels: [],
          channel_entry: false,
        })}
        itemLabel={(step) => `step ${step.number}`}
        render={(step, update) => (
          <>
            <TextField label="No." value={step.number} required dir="ltr" onChange={(number) => update({ number })} />
            <TextField label="Step" value={step.name} required onChange={(name) => update({ name })} wide />
            <TextField label="Phase" value={step.phase} onChange={(phase) => update({ phase: phase || null })} />
            {!step.channel_entry && (
              <SystemField
                label="Performed by"
                value={step.performing_system_id ?? ""}
                systems={systems}
                writtenAs={step.performing_system_id ? names?.system(step.performing_system_id) : undefined}
                allowNone
                onChange={(id) => update({ performing_system_id: id || null })}
              />
            )}
            {channels.length > 0 && (
              <CheckField
                label="Performed by the channel’s entry system"
                checked={step.channel_entry === true}
                onChange={(channel_entry) => update({ channel_entry, ...(channel_entry ? { performing_system_id: null } : {}) })}
              />
            )}
            <Supporting
              chosen={step.supporting_system_ids}
              systems={systems}
              onChange={(supporting_system_ids) => update({ supporting_system_ids })}
            />
            <TextField label="Mode" value={step.mode} onChange={(mode) => update({ mode: mode || null })} />
            <CheckField label="Seen by the customer" checked={step.customer_visible === true} onChange={(customer_visible) => update({ customer_visible })} />
            {channels.length > 0 && (
              <ChannelChoices
                legend="Happens in (none means every channel)"
                channels={channels}
                chosen={step.channels ?? []}
                onChange={(chosen) => update({ channels: chosen })}
              />
            )}
          </>
        )}
      />

      <Rows<Rule>
        legend="Branches"
        one="branch"
        items={value.flow_rules}
        onChange={(flow_rules) => set({ flow_rules })}
        blank={() => ({ kind: "decision", from_activity: firstStep, to_activity: firstStep })}
        itemLabel={(rule, index) => `branch ${index + 1}`}
        render={(rule, update) => (
          <>
            <SelectField label="Kind" value={rule.kind} options={RULE_KINDS} onChange={(kind) => update({ kind: kind as Rule["kind"] })} />
            <SelectField label="From step" value={rule.from_activity} options={stepOptions} onChange={(from_activity) => update({ from_activity })} />
            <SelectField label="To step" value={rule.to_activity} options={stepOptions} onChange={(to_activity) => update({ to_activity })} />
            <TextField label="When" value={rule.condition} onChange={(condition) => update({ condition: condition || null })} />
            {rule.kind === "parallel" && (
              <SelectField
                label="Rejoins at step"
                value={rule.rejoin_at ?? ""}
                options={[{ value: "", label: "Does not rejoin" }, ...stepOptions]}
                onChange={(rejoin_at) => update({ rejoin_at: rejoin_at || null })}
              />
            )}
          </>
        )}
      />

      <Rows<Handover>
        legend="Hand-overs"
        one="hand-over"
        items={value.integrations}
        onChange={(integrations) => set({ integrations })}
        blank={() => ({ from_activity: firstStep, to_activity: firstStep })}
        itemLabel={(link, index) => `hand-over ${index + 1}`}
        render={(link, update) => (
          <>
            <SelectField label="From step" value={link.from_activity} options={stepOptions} onChange={(from_activity) => update({ from_activity })} />
            <SelectField label="To step" value={link.to_activity} options={stepOptions} onChange={(to_activity) => update({ to_activity })} />
            <TextField label="Interaction" value={link.interaction} onChange={(interaction) => update({ interaction: interaction || null })} />
            <TextField label="Interface" value={link.interface} onChange={(item) => update({ interface: item || null })} />
            <TextField label="Payload" value={link.payload} onChange={(payload) => update({ payload: payload || null })} />
            <TextField label="Timing" value={link.timing} onChange={(timing) => update({ timing: timing || null })} />
          </>
        )}
      />
    </div>
  );
}

/** Supporting systems: the chosen ones as words with a remove, and one select to add another. */
function Supporting({ chosen, systems, onChange }: { chosen: string[]; systems: CatalogueSystem[]; onChange: (ids: string[]) => void }) {
  const name = (id: string) => systems.find((system) => system.id === id)?.name ?? id;
  const left = systems.filter((system) => !chosen.includes(system.id)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="form__field form__field--wide">
      <SelectField
        label="Supported by"
        value=""
        options={[{ value: "", label: chosen.length ? "Add another system…" : "Add a system…" }, ...left.map((system) => ({ value: system.id, label: system.name }))]}
        onChange={(id) => id && onChange([...chosen, id])}
      />
      {chosen.length > 0 && (
        <ul className="form__chosen">
          {chosen.map((id) => (
            <li key={id}>
              <span dir="auto">{name(id)}</span>
              <button type="button" className="text-button" onClick={() => onChange(chosen.filter((item) => item !== id))}>
                <X size={14} aria-hidden="true" />
                <span className="visually-hidden">Remove {name(id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
