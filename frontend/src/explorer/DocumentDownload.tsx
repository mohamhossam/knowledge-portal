import { useQueryClient } from "@tanstack/react-query";
import { FileDown, RotateCw } from "lucide-react";
import { useState } from "react";

import { api, type CatalogPlans, type ExplorerRelease } from "../api/client";
import { errorMessage } from "../api/errors";
import { saveBlob } from "../catalogue/useEditing";
import { overviewSvg, rasterise } from "./document/overview";
import type { Scenario } from "./scenario";

/**
 * The scenario as a Solution Architecture document, written in the browser
 * from the version on screen (requirement-portal ADR-0101, step 6). Plans are
 * read through the same query the Plans and prices section uses, so a read
 * already made is not made again. Anyone who can read the explorer can take it.
 */
export function DocumentDownload({ release, scenario }: { release: ExplorerRelease; scenario: Scenario }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });

  const write = async () => {
    if (state.busy) return;
    setState({ busy: true, error: null });
    try {
      let plans: CatalogPlans | null = null;
      try {
        plans = await queryClient.ensureQueryData({ queryKey: ["explorer", "plans", scenario.offering.id], queryFn: () => api.explorerPlans(scenario.offering.id) });
      } catch {
        // The document says the catalog could not be read; it is still written.
      }
      let overview = null;
      try {
        overview = await rasterise(overviewSvg(scenario, release));
      } catch {
        // A browser that cannot draw the overview still gets the document, without the figure.
      }
      // The generator is loaded only when someone asks for a document.
      const { solutionArchitecture } = await import("./document/generate");
      const made = await solutionArchitecture({ release, scenario, plans, at: new Date(), overview });
      saveBlob(made.blob, made.fileName);
      setState({ busy: false, error: null });
    } catch (error) {
      setState({ busy: false, error });
    }
  };

  return (
    <div className="explorer__document">
      <p className="explorer__document-line">
        <button type="button" className="text-button" aria-disabled={state.busy || undefined} aria-describedby="explorer-document-what" onClick={() => void write()}>
          <FileDown size={16} aria-hidden="true" />
          {state.busy ? "Writing the document…" : "Download the Solution Architecture (.docx)"}
        </button>
        <span id="explorer-document-what" className="secondary">
          A Word document of this scenario in the original explorer’s eighteen sections, for architecture review.
        </span>
      </p>
      <p className="visually-hidden" role="status">{state.busy ? "Writing the Solution Architecture document." : ""}</p>
      {state.error !== null && (
        <p className="timetable__quiet timetable__quiet--failed" role="alert">
          The document could not be written: {errorMessage(state.error)}
          <button type="button" className="text-button" onClick={() => void write()}>
            <RotateCw size={14} aria-hidden="true" />
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
