import { useRef } from "react";

import type { CatalogueSystem, Channel, Journey, JourneyActivity, Offering, SourceConfidence } from "../api/client";
import type { Interface } from "./ontology";
import { CONFIDENCE, orderedSteps } from "./catalogue";
import { AreaField, PickField, Rows, SelectField, SystemField, TextField, CheckField } from "./forms";
import { roleCode } from "./model/vocabulary";
import { ChannelChoices } from "./OfferingEditor";

type Rule = Journey["flow_rules"][number];
type Handover = Journey["integrations"][number];

// Whether a call waits for its answer; most sources don't say.
const TIMINGS = [
  { value: "", label: "Not said" },
  { value: "Sync", label: "Sync: waits for its answer" },
  { value: "Async", label: "Async: carries on" },
];

const CONFIDENCE_OPTIONS = [
  { value: "", label: "Not stated" },
  ...(Object.keys(CONFIDENCE) as SourceConfidence[]).map((value) => ({ value, label: CONFIDENCE[value] })),
];

const RULE_KINDS = [
  { value: "decision", label: "A decision" },
  { value: "loop", label: "A loop back" },
  { value: "parallel", label: "A parallel track" },
];

const SOURCE_HINT = "The document and where in it, such as SDD v2.3 · §4.1.";

/** Who performs a step: a named system, the entry system of the channel the order came through, a team or party, or not said. */
type Performer = "system" | "entry" | "team" | "";
const PERFORMERS = [
  { value: "", label: "Not said" },
  { value: "system", label: "A system" },
  { value: "entry", label: "The channel's entry system" },
  { value: "team", label: "A team or party, such as the customer" },
];
const performerOf = (step: JourneyActivity): Performer =>
  step.performing_system_id != null ? "system" : step.channel_entry ? "entry" : step.performer != null ? "team" : "";
/** A step's system and team as last written, so choosing another performer and back loses neither. */
type Remembered = { system?: string | null; team?: string | null };
/** What choosing who performs a step sets: one of the three, the others let go, and what was written before come back. */
const choosePerformer = (choice: Performer, remembered: Remembered): Partial<JourneyActivity> => ({
  performing_system_id: choice === "system" ? (remembered.system ?? "") : null,
  channel_entry: choice === "entry",
  performer: choice === "team" ? (remembered.team ?? "") : null,
});

/**
 * A whole journey: the offering it fulfils, its steps and who performs each, where it
 * branches, and how steps hand over, each with where its facts come from. Controlled; the
 * caller keeps the value. `errorAt` says what is wrong with the field at a path.
 */
export function JourneyEditor({ value, onChange, systems, offerings, channels = [], interfaces = [], roles = {}, names, errorAt }: {
  value: Journey;
  onChange: (value: Journey) => void;
  systems: CatalogueSystem[];
  offerings: Offering[];
  /** The draft's channels, to say which channels a step happens in. */
  channels?: Channel[];
  /** The draft's interface records, to say which one a hand-over goes through (review recommendation 8). */
  interfaces?: Interface[];
  /** The vocabulary's roles a step can play, by code: what it does for the order. */
  roles?: Record<string, string>;
  /** Names for things a document mentions that the draft does not have yet. */
  names?: { system: (id: string) => string; offering: (id: string) => string };
  errorAt?: (path: string) => string | null;
}) {
  const set = (patch: Partial<Journey>) => onChange({ ...value, ...patch });
  // By step number: what each step's system and team were before another performer was chosen.
  const remembered = useRef(new Map<string, Remembered>());
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
  const systemName = (id: string) => systems.find((system) => system.id === id)?.name ?? names?.system(id) ?? id;
  const systemOptions = [...systems].sort((a, b) => a.name.localeCompare(b.name)).map((system) => ({ value: system.id, label: system.name }));
  // One option per role, under the code the step already uses when it names that role; a role the vocabulary
  // does not have stays shown, as written. Codes compare as the service reads them ("ORCHESTRATE" is "orchestrate").
  const roleOptions = (current: string | null | undefined) => {
    const said = roleCode(current);
    const byLabel = new Map<string, string>();
    for (const [code, label] of Object.entries(roles)) if (!byLabel.has(label) || code === said) byLabel.set(label, code);
    return [
      { value: "", label: "Not said" },
      ...[...byLabel].map(([label, code]) => ({ value: code, label })).sort((a, b) => a.label.localeCompare(b.label)),
      ...(said && !(said in roles) ? [{ value: said, label: `${current} (not in the vocabulary)` }] : []),
    ];
  };
  /** The records a hand-over can go through: those a system of the call exposes, as the service checks. */
  const interfaceOptions = (link: Handover) => {
    const performer = (number: string) => value.activities.find((step) => step.number === number)?.performing_system_id ?? null;
    const touched = new Set(
      [link.from_system_id ?? performer(link.from_activity), link.to_system_id ?? performer(link.to_activity), link.via_system_id].filter(
        (id): id is string => !!id,
      ),
    );
    const usable = interfaces.filter((item) => touched.has(item.system_id) || item.id === link.interface_id);
    return [
      { value: "", label: usable.length ? "Not linked to a record" : "No record a system of this call exposes" },
      ...usable.map((item) => ({ value: item.id, label: `${item.name} (${systemName(item.system_id)})` })),
    ];
  };
  const firstStep = stepOptions[0]?.value ?? "";
  const stepNamed = (number: string) => value.activities.find((step) => step.number === number);
  const stepLabel = (number: string) => {
    const step = stepNamed(number);
    return step?.name.trim() ? `${number}. ${step.name.trim()}` : number;
  };
  /** Who performs a step, in words, or null when not said. */
  const performerWords = (step: JourneyActivity | undefined): string | null =>
    !step
      ? null
      : step.performing_system_id
        ? systemName(step.performing_system_id)
        : step.channel_entry
          ? "the channel's entry system"
          : step.performer?.trim() || null;
  /** What a hand-over's empty system means: its step's performer stands in, as the views read it. */
  const standIn = (number: string) => {
    const performer = performerWords(stepNamed(number));
    return performer ? `As step ${number}'s performer (${performer})` : "No system named";
  };
  // A step with a problem in it opens once Save has been tried, so focus can reach the field.
  const stepFields = ["number", "name", "performer", "system", "team"];
  const source = (item: { confidence?: SourceConfidence | null; source?: string | null }, update: (patch: { confidence?: SourceConfidence | null; source?: string | null }) => void) => (
    <>
      <SelectField
        label="How sure its source is"
        value={item.confidence ?? ""}
        options={CONFIDENCE_OPTIONS}
        onChange={(confidence) => update({ confidence: (confidence || null) as SourceConfidence | null })}
      />
      <TextField label="Source" value={item.source} hint={SOURCE_HINT} onChange={(text) => update({ source: text || null })} />
    </>
  );

  return (
    <div className="cat-form">
      <div className="cat-form__grid">
        <TextField label="Name" value={value.name} required error={errorAt?.("name")} onChange={(name) => set({ name })} wide />
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
          error={errorAt?.("order_type_code")}
          onChange={(code) => set({ order_type_code: code || null })}
        />
        {source(value, set)}
      </div>
      <AreaField label="What it is" value={value.description} onChange={(description) => set({ description: description || null })} />

      <Rows<JourneyActivity>
        legend="Steps"
        one="step"
        collapsible
        forceOpen={(_, index) => stepFields.some((field) => Boolean(errorAt?.(`activities.${index}.${field}`)))}
        summary={(step) =>
          [performerWords(step), step.role ? roles[roleCode(step.role) ?? ""] ?? step.role : null, step.phase].filter(Boolean).join(" · ") ||
          "Nothing more said yet."
        }
        items={value.activities}
        onChange={(activities) => set({ activities })}
        blank={() => ({
          number: String((Math.max(0, ...value.activities.map((step) => Number.parseFloat(step.number) || 0)) + 10)),
          name: "",
          supporting_system_ids: [],
          component_ids: [],
          channels: [],
          channel_entry: false,
          // Derived by the service from the track, and ignored when sent; a new step names none, so it is on the main track.
          main_track: true,
        })}
        itemLabel={(step) => `step ${step.number}${step.name.trim() ? `. ${step.name.trim()}` : ""}`}
        render={(step, update, index) => {
          const performer = performerOf(step);
          return (
            <>
              <TextField label="No." value={step.number} required dir="ltr" error={errorAt?.(`activities.${index}.number`)} onChange={(number) => update({ number })} />
              <TextField label="Step" value={step.name} required wide error={errorAt?.(`activities.${index}.name`)} onChange={(name) => update({ name })} />
              <TextField label="Phase" value={step.phase} onChange={(phase) => update({ phase: phase || null })} />
              <TextField
                label="Track"
                value={step.track}
                hint="MAIN, or a side track such as FIELD; empty is the main track."
                onChange={(track) => update({ track: track || null })}
              />
              <SelectField
                label="Who performs it"
                value={performer}
                options={PERFORMERS.filter((option) => option.value !== "entry" || channels.length > 0 || performer === "entry")}
                error={errorAt?.(`activities.${index}.performer`)}
                onChange={(choice) => {
                  const before = remembered.current.get(step.number) ?? {};
                  remembered.current.set(step.number, {
                    system: step.performing_system_id != null ? step.performing_system_id : before.system,
                    team: step.performer != null ? step.performer : before.team,
                  });
                  update(choosePerformer(choice as Performer, remembered.current.get(step.number)!));
                }}
              />
              {performer === "system" && (
                <SystemField
                  label="The system"
                  value={step.performing_system_id ?? ""}
                  systems={systems}
                  writtenAs={step.performing_system_id ? names?.system(step.performing_system_id) : undefined}
                  allowNone
                  noneLabel="Choose a system"
                  error={errorAt?.(`activities.${index}.system`)}
                  onChange={(id) => update({ performing_system_id: id })}
                />
              )}
              {performer === "team" && (
                <TextField
                  label="The team or party"
                  value={step.performer}
                  hint="Such as the MSS team, or the customer."
                  error={errorAt?.(`activities.${index}.team`)}
                  onChange={(text) => update({ performer: text })}
                />
              )}
              <PickField
                label="Supported by"
                chosen={step.supporting_system_ids}
                // The system that performs it does not also support it.
                options={systemOptions.filter((option) => option.value !== step.performing_system_id || step.supporting_system_ids.includes(option.value))}
                onChange={(supporting_system_ids) => update({ supporting_system_ids })} />
              <SelectField label="Its role" value={roleCode(step.role) ?? ""} options={roleOptions(step.role)} hint="What it does for the order." onChange={(role) => update({ role: role || null })} />
              <TextField label="eTOM" value={step.etom} hint="Where it sits in eTOM, such as Order Handling › Issue Orders." onChange={(etom) => update({ etom: etom || null })} />
              <AreaField label="What it does" value={step.description} onChange={(description) => update({ description: description || null })} />
              <TextField label="What it produces" value={step.output} wide onChange={(output) => update({ output: output || null })} />
              <TextField
                label="Point of no return"
                value={step.point_of_no_return}
                wide
                hint="When the order can no longer be cancelled past it, what makes it so; empty when it is not one."
                onChange={(text) => update({ point_of_no_return: text || null })}
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
              {source(step, update)}
            </>
          );
        }}
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
            {(channels.length > 0 || rule.channel_id) && (
              <SelectField
                label="Taken for channel"
                value={rule.channel_id ?? ""}
                options={[{ value: "", label: "Every channel" }, ...channels.map((channel) => ({ value: channel.id, label: channel.name }))]}
                onChange={(channel_id) => update({ channel_id: channel_id || null })}
              />
            )}
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
        collapsible
        summary={(link) => {
          const from = link.from_system_id ? systemName(link.from_system_id) : performerWords(stepNamed(link.from_activity));
          const to = link.to_system_id ? systemName(link.to_system_id) : performerWords(stepNamed(link.to_activity));
          const between = from || to ? `${from ?? "not said"} to ${to ?? "not said"}${link.via_system_id ? ` through ${systemName(link.via_system_id)}` : ""}` : null;
          return [between, link.purpose?.trim() || null].filter(Boolean).join(" · ") || "Nothing more said yet.";
        }}
        items={value.integrations}
        onChange={(integrations) => set({ integrations })}
        blank={() => ({ from_activity: firstStep, to_activity: firstStep, open_api_ids: [] })}
        itemLabel={(link, index) => `hand-over ${index + 1}: ${stepLabel(link.from_activity)} to ${stepLabel(link.to_activity)}`}
        render={(link, update) => (
          <>
            <SelectField label="From step" value={link.from_activity} options={stepOptions} onChange={(from_activity) => update({ from_activity })} />
            <SelectField label="To step" value={link.to_activity} options={stepOptions} onChange={(to_activity) => update({ to_activity })} />
            <SystemField label="Calling system" value={link.from_system_id ?? ""} systems={systems} allowNone noneLabel={standIn(link.from_activity)} onChange={(id) => update({ from_system_id: id || null })} />
            <SystemField label="Called system" value={link.to_system_id ?? ""} systems={systems} allowNone noneLabel={standIn(link.to_activity)} onChange={(id) => update({ to_system_id: id || null })} />
            <SystemField label="Through (integration layer)" value={link.via_system_id ?? ""} systems={systems} allowNone onChange={(id) => update({ via_system_id: id || null })} />
            <AreaField label="What it is for" value={link.purpose} onChange={(purpose) => update({ purpose: purpose || null })} />
            <TextField label="Interaction" value={link.interaction} onChange={(interaction) => update({ interaction: interaction || null })} />
            <TextField label="Interface" value={link.interface} hint="As the source writes it." onChange={(item) => update({ interface: item || null })} />
            <SelectField
              label="Goes through the interface record"
              value={link.interface_id ?? ""}
              options={interfaceOptions(link)}
              onChange={(id) => update({ interface_id: id || null })}
            />
            <TextField label="Style" value={link.style} hint="As the source says, such as API, XML request, Event or Callback." onChange={(style) => update({ style: style || null })} />
            <TextField label="TM Forum equivalent" value={link.tmf_equivalent} hint="Such as TMF622 Product Ordering." onChange={(tmf) => update({ tmf_equivalent: tmf || null })} />
            <TextField label="Payload" value={link.payload} onChange={(payload) => update({ payload: payload || null })} />
            <SelectField
              label="Timing"
              value={link.timing ?? ""}
              options={TIMINGS}
              onChange={(timing) => update({ timing: (timing || null) as Handover["timing"] })}
            />
            {source(link, update)}
          </>
        )}
      />
    </div>
  );
}
