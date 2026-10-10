/**
 * The journey switcher: one button naming the journey in view, opening the
 * offering's journeys grouped by where they sit in the customer's life with
 * the product (join, change, support, leave), so twenty journeys read as four
 * short lists instead of a wall of chips.
 */
import { type KeyboardEvent, useEffect, useRef } from "react";

import type { JourneyDef } from "../../architecture/model";
import { STAGES, stageOfCode } from "./stages";

/** Where a journey sits; one without an order type (order tracking) supports every order. */
const stageOf = (journey: JourneyDef) => stageOfCode(journey.orderType);

export function JourneyPicker({ journeys, current, onPick }: { journeys: JourneyDef[]; current: JourneyDef; onPick: (journey: JourneyDef) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (menu.current) menu.current.open = false;
  };
  useEffect(() => {
    // A click anywhere else closes it, as a menu would.
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const onKeyDown =(event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key === "Escape" && menu.current?.open) {
      event.preventDefault();
      close();
      menu.current.querySelector("summary")?.focus();
    }
  };
  const stage = STAGES.find((item) => item.id === stageOf(current));
  const groups = STAGES.map((item) => ({ ...item, journeys: journeys.filter((journey) => stageOf(journey) === item.id) })).filter((item) => item.journeys.length);

  return (
    <details
      ref={menu}
      className="cl-jpick"
      onKeyDown={onKeyDown}
      onToggle={(event) => event.currentTarget.open && event.currentTarget.querySelector<HTMLButtonElement>("[aria-current='true']")?.focus()}
      onBlur={(event) => {
        // Tabbing out closes it; a click inside, which can blur to nothing, doesn't.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
      }}
    >
      <summary className="cl-btn">
        <span className="cl-jpick-stage">{stage?.name ?? "Journey"}</span>
        {current.name}
        <small>{journeys.length} journeys</small>
      </summary>
      <div className="cl-jpick-panel" role="group" aria-label="Journeys">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`cl-jpick-${group.id}`}>
            <h3 id={`cl-jpick-${group.id}`}>
              {group.name} <small>{group.blurb}</small>
            </h3>
            <ul>
              {group.journeys.map((journey) => (
                <li key={journey.id}>
                  <button
                    type="button"
                    aria-current={journey.id === current.id ? "true" : undefined}
                    onClick={() => {
                      close();
                      onPick(journey);
                    }}
                  >
                    {journey.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
