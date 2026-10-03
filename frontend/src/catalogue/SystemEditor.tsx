import type { CatalogueSystem, Release } from "../api/client";
import { AreaField, LinesField, Rows, SelectField, TextField } from "./forms";

type Capability = CatalogueSystem["capabilities"][number];
type Component = CatalogueSystem["components"][number];

/**
 * A whole system: its names, where it sits, what it does and by which phrases
 * requirement work finds it, its components and its constraints. Controlled.
 */
export function SystemEditor({ value, onChange, release }: {
  value: CatalogueSystem;
  onChange: (value: CatalogueSystem) => void;
  release: Release;
}) {
  const set = (patch: Partial<CatalogueSystem>) => onChange({ ...value, ...patch });
  const places = [
    { value: "", label: "Not placed in the landscape" },
    ...(release.landscape_domains ?? []).map((domain) => ({ value: domain.id, label: domain.name })),
  ];
  const areas = [
    { value: "", label: "No business area" },
    ...(release.capability_domains ?? []).map((domain) => ({ value: domain.id, label: domain.name })),
  ];
  const components = [
    { value: "", label: "No component named" },
    ...value.components.filter((item) => item.name.trim()).map((item) => ({ value: item.id || item.name, label: item.name })),
  ];
  return (
    <div className="form">
      <div className="form__grid">
        <TextField label="Name" value={value.name} required onChange={(name) => set({ name })} />
        <TextField label="Arabic name" value={value.name_ar} dir="rtl" onChange={(name_ar) => set({ name_ar: name_ar || null })} />
        <SelectField
          label="Sits in"
          value={value.landscape_domain_id ?? ""}
          options={places}
          onChange={(id) => set({ landscape_domain_id: id || null })}
        />
      </div>
      <LinesField label="Also called" value={value.aliases} onChange={(aliases) => set({ aliases })} />
      <AreaField label="What it is" value={value.description} onChange={(description) => set({ description: description || null })} />

      <Rows<Capability>
        legend="What it does"
        one="capability"
        items={value.capabilities}
        onChange={(capabilities) => set({ capabilities })}
        blank={() => ({ id: "", name: "", triggers: [] })}
        itemLabel={(item, index) => `capability ${item.name || index + 1}`}
        render={(item, update) => (
          <>
            <TextField label="Capability" value={item.name} required onChange={(name) => update({ name })} />
            <SelectField label="Business area" value={item.domain_id ?? ""} options={areas} wide onChange={(id) => update({ domain_id: id || null })} />
            <SelectField
              label="Delivered by the component"
              value={item.component_id ?? ""}
              options={components}
              onChange={(id) => update({ component_id: id || null })}
            />
            <LinesField
              label="Matched by"
              value={item.triggers}
              required
              hint="One phrase per line. Requirement work maps a requirement here when it uses one."
              onChange={(triggers) => update({ triggers })}
            />
          </>
        )}
      />

      <Rows<Component>
        legend="Components"
        one="component"
        items={value.components}
        onChange={(next) => set({ components: next })}
        blank={() => ({ id: "", name: "", aliases: [] })}
        itemLabel={(item, index) => `component ${item.name || index + 1}`}
        render={(item, update) => (
          <>
            <TextField label="Component" value={item.name} required onChange={(name) => update({ name })} />
            <TextField label="Arabic name" value={item.name_ar} dir="rtl" onChange={(name_ar) => update({ name_ar: name_ar || null })} />
            <TextField label="Built with" value={item.technology} onChange={(technology) => update({ technology: technology || null })} />
            <LinesField label="Also called" value={item.aliases} onChange={(aliases) => update({ aliases })} />
            <AreaField label="What it does" value={item.description} onChange={(description) => update({ description: description || null })} />
          </>
        )}
      />

      <LinesField
        label="Constraints"
        value={value.constraints}
        hint="One constraint per line."
        onChange={(constraints) => set({ constraints })}
      />
    </div>
  );
}
