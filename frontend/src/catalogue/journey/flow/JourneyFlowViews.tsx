/**
 * A catalogue journey's process flow and call register, and its exports
 * (catalogue merge, step 4). They read the catalogue as the lab did (the model
 * the adapter builds from the version), one channel at a time when the journey
 * is sold through several: the channel is in the address (`?channel=`). Loaded
 * on its own (`lazy()`), so a journey's record costs nothing until one of these
 * is opened.
 */
import "./flow.css";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import type { Release } from "../../../api/client";
import { channelMissingText, viewTitle } from "../../model/words";
import { Select } from "../../../design/components";
import { fromRelease, journeyView } from "../../model/adapter";
import { download, toBpmn, toCsv, toMermaid, toPlantUml } from "../../model/exports";
import type { Catalogue, JourneyView } from "../../model/model";
import { CallRegister } from "./CallRegister";
import { ProcessFlow } from "./ProcessFlow";

/** The journey as the model reads it, in the channel asked for (or its first). */
function useJourneyView(release: Release, journeyId: string): { data: Catalogue; view: JourneyView | null; channels: string[] } {
  const [params] = useSearchParams();
  const data = useMemo(() => fromRelease(release), [release]);
  const wanted = params.get("channel");
  const view = useMemo(() => journeyView(data, journeyId, wanted), [data, journeyId, wanted]);
  const channels = data.journeys.find((item) => item.id === journeyId)?.channels ?? [];
  return { data, view, channels };
}

/** The process flow, or the call register, with the channel to read it in. */
export default function JourneyFlowViews({ release, journeyId, title, show }: { release: Release; journeyId: string; title: string; show: "flow" | "integrations" }) {
  const { data, view, channels } = useJourneyView(release, journeyId);
  const [params, setParams] = useSearchParams();
  if (!view) return <p className="cat-quiet">This journey isn't in the catalogue as the drawing reads it.</p>;
  const channelName = (id: string) => data.channels.find((item) => item.id === id)?.name ?? id;
  const pick = (id: string) => {
    const next = new URLSearchParams(params);
    next.delete("row");
    if (id) next.set("channel", id);
    else next.delete("channel");
    setParams(next, { replace: true });
  };
  return (
    <div className="jf-views">
      {channels.length > 1 && (
        <div className="jf-channel">
          <Select label="Channel" value={view.channel ?? ""} onChange={(event) => pick(event.target.value)}>
            {channels.map((item) => <option key={item} value={item}>{channelName(item)}</option>)}
          </Select>
        </div>
      )}
      {view.channelMissing && (
        <p className="cat-lead" role="status">{channelMissingText(title, channelName(view.channelMissing), channelName(view.channel ?? ""))}</p>
      )}
      {show === "integrations" ? <CallRegister data={data} view={view} /> : <ProcessFlow data={data} view={view} title={title} />}
    </div>
  );
}

/** The journey's exports: the flow as BPMN, its calls as PlantUML or Mermaid sequence diagrams, and the register as CSV. */
export function JourneyExport({ release, journeyId }: { release: Release; journeyId: string }) {
  const { data, view } = useJourneyView(release, journeyId);
  // The menu closes on a click anywhere else, and Escape closes it with focus back on its button.
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const away = (event: MouseEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, []);
  if (!view) return null;
  const title = viewTitle(data, view);
  const file = `${view.id}${view.channel ? `-${view.channel}` : ""}`;
  const items: [string, string, () => void][] = [
    ["BPMN 2.0", ".bpmn, opens laid out", () => download(`${file}.bpmn`, toBpmn(data, view), "application/xml")],
    ["PlantUML", "sequence diagram", () => download(`${file}.puml`, toPlantUml(data, title, view.integrations), "text/plain")],
    ["Mermaid", "sequence diagram", () => download(`${file}.mmd`, toMermaid(data, title, view.integrations), "text/plain")],
    ["the call register", "CSV, one row per call", () => download(`${file}-register.csv`, toCsv(data, view.integrations), "text/csv")],
  ];
  return (
    <details
      ref={menu}
      className="jf-export"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !menu.current?.open) return;
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }}
    >
      <summary className="ds-button ds-button--secondary jf-export__summary">Export</summary>
      <ul className="jf-export__menu">
        {items.map(([what, how, run]) => (
          <li key={what}>
            <button
              type="button"
              className="jf-export__item"
              onClick={() => {
                run();
                if (menu.current) menu.current.open = false;
              }}
            >
              Download {what} <span className="cat-detail">{how}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
