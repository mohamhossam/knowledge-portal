import { useMemo, useState } from "react";

import { Button, Select } from "../../design/components";
import type { Row } from "../model";
import { locationGroup, plural } from "../where";

/** Selecting a whole location (a sheet, a section) at once, offered when the passages fall into several. */
export function LocationPicker({ rows, selected, onSelectedChange, onSaid }: {
  rows: Row[];
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  onSaid: (said: { text: string }) => void;
}) {
  const [group, setGroup] = useState("");
  const [picking, setPicking] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.draft) continue;
      const name = locationGroup(row.where);
      map.set(name, [...(map.get(name) ?? []), row.key]);
    }
    return [...map.entries()];
  }, [rows]);
  const offerGroups = groups.length > 1 && groups.some(([, keys]) => keys.length > 1) && groups.length < rows.length;
  const chosenGroup = groups.find(([name]) => name === group) ?? groups[0];

  return (
    <>
      {offerGroups && chosenGroup && !picking && (
        <Button variant="link" aria-expanded={false} onClick={() => setPicking(true)}>Select a location…</Button>
      )}
      {offerGroups && chosenGroup && picking && (
        <div className="lib-select-group" role="group" aria-label="Select a whole location">
          <Select label="Select a location" value={chosenGroup[0]} onChange={(event) => setGroup(event.target.value)}>
            {groups.map(([name, keys]) => <option key={name} value={name}>{name} · {plural(keys.length, "passage")}</option>)}
          </Select>
          <Button onClick={() => {
            onSelectedChange(new Set([...selected, ...chosenGroup[1]]));
            onSaid({ text: `Selected ${plural(chosenGroup[1].length, "passage")} in ${chosenGroup[0]}.` });
          }}>
            Select {plural(chosenGroup[1].length, "passage")}
          </Button>
          <Button variant="link" onClick={() => setPicking(false)}>Done</Button>
        </div>
      )}
    </>
  );
}
