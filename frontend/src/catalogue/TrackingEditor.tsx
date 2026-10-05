import { Plus, X } from "lucide-react";

import type { CatalogueSystem, Channel, Offering } from "../api/client";
import { AreaField, CheckField, Rows, SelectField, SystemField, TextField } from "./forms";

type Tracking = NonNullable<Offering["tracking"]>;
type Flow = Tracking["flows"][number];
type TrackingChannel = Tracking["channels"][number];
type TrackingEvent = Tracking["milestones"][number];
type Fallout = Tracking["fallout"][number];

const BLANK: Tracking = { order_types: [], flows: [], channels: [], milestones: [], statuses: [], fallout: [] };

const cut = (text: string, index: number, what: string) => {
  const name = text.trim();
  if (!name) return `${what} ${index + 1}`;
  return `${what} ${name.length > 40 ? `${name.slice(0, 39)}…` : name}`;
};

/**
 * How an offering's orders are tracked, in the offering editor: the order types
 * it is specified for, the flows that carry the order's progress, each channel's
 * correlation and tracking screen, milestones, internal statuses and fallout.
 * Controlled; an offering without tracking offers to describe it.
 */
export function TrackingEditor({ value, onChange, systems, channels, orderTypes }: {
  value: Offering["tracking"];
  onChange: (value: Offering["tracking"]) => void;
  systems: CatalogueSystem[];
  channels: Channel[];
  orderTypes: { code: string; name: string }[];
}) {
  if (!value) {
    return (
      <fieldset className="form__rows">
        <legend className="form__legend">Order tracking</legend>
        <p className="form__hint">Its sources' tracking is not recorded.</p>
        <button type="button" className="text-button" onClick={() => onChange(BLANK)}>
          <Plus size={14} aria-hidden="true" />
          Describe how its orders are tracked
        </button>
      </fieldset>
    );
  }
  const set = (patch: Partial<Tracking>) => onChange({ ...value, ...patch });
  const firstSystem = systems[0]?.id ?? "";
  const channelOptions = channels.map((channel) => ({ value: channel.id, label: channel.name }));
  return (
    <fieldset className="form__rows">
      <legend className="form__legend">Order tracking</legend>
      {orderTypes.length > 0 && (
        <fieldset className="choices form__field--wide">
          <legend className="field__label">Specified for (none means every order type)</legend>
          {orderTypes.map((type) => (
            <CheckField
              key={type.code}
              label={type.name}
              checked={value.order_types.includes(type.code)}
              onChange={(on) => set({ order_types: on ? [...value.order_types, type.code] : value.order_types.filter((code) => code !== type.code) })}
            />
          ))}
        </fieldset>
      )}
      <AreaField label="What its sources say of its scope" value={value.scope_note} onChange={(scope_note) => set({ scope_note: scope_note || null })} />
      <AreaField
        label="What they say for the other order types"
        value={value.not_applicable_note}
        onChange={(not_applicable_note) => set({ not_applicable_note: not_applicable_note || null })}
      />

      <Rows<TrackingChannel>
        legend="How each channel tracks its orders"
        one="channel's tracking"
        items={value.channels}
        onChange={(items) => set({ channels: items })}
        blank={() => ({ channel_id: channels.find((channel) => !value.channels.some((item) => item.channel_id === channel.id))?.id ?? "" })}
        itemLabel={(item, index) => cut(channels.find((channel) => channel.id === item.channel_id)?.name ?? "", index, "tracking of")}
        render={(item, change) => (
          <>
            <SelectField label="Channel" value={item.channel_id} options={[{ value: "", label: "Choose a channel" }, ...channelOptions]} onChange={(channel_id) => change({ channel_id })} />
            <TextField label="Correlation key" value={item.correlation_key} wide onChange={(key) => change({ correlation_key: key || null })} />
            <SystemField label="Tracked in" value={item.ui_system_id ?? ""} systems={systems} allowNone onChange={(id) => change({ ui_system_id: id || null })} />
            <SystemField label="Which reads from" value={item.read_system_id ?? ""} systems={systems} allowNone onChange={(id) => change({ read_system_id: id || null })} />
            <TextField label="Over" value={item.read_interface} onChange={(text) => change({ read_interface: text || null })} />
            <TextField label="What the sources say when the screen is not named" value={item.ui_note} wide onChange={(text) => change({ ui_note: text || null })} />
          </>
        )}
      />

      <Rows<Flow>
        legend="What carries the order's progress"
        one="flow"
        items={value.flows}
        onChange={(items) => set({ flows: items })}
        blank={() => ({ from_system_id: firstSystem, to_system_id: firstSystem, label: "" })}
        itemLabel={(item, index) => cut(item.label, index, "flow")}
        render={(item, change) => (
          <>
            <SystemField label="From" value={item.from_system_id} systems={systems} onChange={(from_system_id) => change({ from_system_id })} />
            <SystemField label="To (the same system: it logs it)" value={item.to_system_id} systems={systems} onChange={(to_system_id) => change({ to_system_id })} />
            <TextField label="What it carries" value={item.label} required wide onChange={(label) => change({ label })} />
            <TextField label="Over" value={item.interface} onChange={(text) => change({ interface: text || null })} />
          </>
        )}
      />

      <Rows<TrackingEvent>
        legend="What the customer sees"
        one="milestone"
        items={value.milestones}
        onChange={(items) => set({ milestones: items })}
        blank={() => ({ label: "" })}
        itemLabel={(item, index) => cut(item.label, index, "milestone")}
        render={(item, change) => (
          <>
            <TextField label="Milestone" value={item.label} required onChange={(label) => change({ label })} />
            <SystemField label="Raised by" value={item.system_id ?? ""} systems={systems} allowNone onChange={(id) => change({ system_id: id || null })} />
            <TextField label="Detail" value={item.detail} wide onChange={(detail) => change({ detail: detail || null })} />
          </>
        )}
      />

      <Rows<TrackingEvent>
        legend="Internal statuses"
        one="status"
        items={value.statuses}
        onChange={(items) => set({ statuses: items })}
        blank={() => ({ label: "" })}
        itemLabel={(item, index) => cut(item.label, index, "status")}
        render={(item, change) => (
          <>
            <TextField label="Status" value={item.label} required onChange={(label) => change({ label })} />
            <TextField label="Detail" value={item.detail} wide onChange={(detail) => change({ detail: detail || null })} />
          </>
        )}
      />

      <Rows<Fallout>
        legend="When an order falls out"
        one="fallout case"
        items={value.fallout}
        onChange={(items) => set({ fallout: items })}
        blank={() => ({ trigger: "" })}
        itemLabel={(item, index) => cut(item.trigger, index, "fallout")}
        render={(item, change) => (
          <>
            <TextField label="When" value={item.trigger} required wide onChange={(trigger) => change({ trigger })} />
            <AreaField label="What happens" value={item.handling} onChange={(handling) => change({ handling: handling || null })} />
          </>
        )}
      />

      <button type="button" className="text-button form__remove" onClick={() => onChange(null)}>
        <X size={14} aria-hidden="true" />
        Remove its order tracking
      </button>
    </fieldset>
  );
}
