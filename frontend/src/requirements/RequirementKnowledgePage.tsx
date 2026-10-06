import { useEffect } from "react";

import { OverviewTable } from "../home/OverviewTable";
import { TABLES } from "../home/tables";
import { useOverview } from "../home/useOverview";

/**
 * Table 4 on its own page: requirement work's corpus, in counts. Its owners act on it in
 * requirement work; the corpus browser and portfolio findings join it here later.
 */
export function RequirementKnowledgePage() {
  const overview = useOverview();
  useEffect(() => {
    document.title = "Requirement knowledge · Knowledge portal";
  }, []);
  return (
    <>
      <OverviewTable spec={TABLES.requirements} state={overview.requirements} headingLevel="h1" />
      <p className="page__preparing">
        Which requirements these are, and the findings across them, join this table next. Until then their
        teams see them in requirement work, on each requirement&rsquo;s Knowledge step.
      </p>
    </>
  );
}
