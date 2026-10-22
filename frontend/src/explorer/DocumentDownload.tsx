import { useQueryClient } from "@tanstack/react-query";
import { FileDown, RotateCw } from "lucide-react";
import { useState } from "react";

import { api, type CatalogPlans, type ExplorerRelease } from "../api/client";
import { errorMessage } from "../api/errors";
import { Button, Status } from "../design/components";
import { saveBlob } from "../catalogue/useEditing";
import { overviewSvg, rasterise } from "./document/overview";
import type { Scenario } from "./scenario";

/**
 * The scenario as a Solution Architecture document, written in the browser
 * from the version on screen (ADR-0101, step 6). Plans are
 * read through the same query the Plans and prices section uses, so a read
 * already made is not made again. Anyone who can read the explorer can take it.
 */
export function DocumentDownload({ release, scenario }: { release: ExplorerRelease; scenario: Scenario }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });

  const write = async () => {
    if (state.busy) return;
    // "Try again" goes away as the retry starts: focus moves to the download itself, never to the page.
    document.getElementById("explorer-document")?.focus();
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
    <div className="explorer-download">
      <Button
        id="explorer-document"
        icon={<FileDown size={16} />}
        busy={state.busy}
        aria-describedby="explorer-document-what"
        onClick={() => void write()}
      >
        {state.busy ? "Writing the document…" : "Download the Solution Architecture (.docx)"}
      </Button>
      <p id="explorer-document-what" className="explorer-download__what">
        A Word document of this scenario in eighteen sections, for architecture review; what the catalogue does not hold is marked as a gap.
      </p>
      <p className="ds-visually-hidden" role="status">{state.busy ? "Writing the Solution Architecture document." : ""}</p>
      {state.error !== null && (
        <p role="alert" className="cat-inline">
          <Status tone="attention">The document could not be written: {errorMessage(state.error)}</Status>
          <Button icon={<RotateCw size={16} />} onClick={() => void write()}>Try again</Button>
        </p>
      )}
    </div>
  );
}
