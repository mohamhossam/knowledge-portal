import { useEffect } from "react";

import { OverviewTable } from "../home/OverviewTable";
import { TABLES } from "../home/tables";
import { useOverview } from "../home/useOverview";
import { KnowledgeSubIndex } from "./knowledgeHead";

/**
 * Table 4 on its own page: requirement work's corpus in counts. Its Requirements and Findings
 * pages name what the counts are; its owners act on them in requirement work.
 */
export function RequirementKnowledgePage() {
  const overview = useOverview();
  useEffect(() => {
    document.title = "Requirement knowledge · Knowledge portal";
  }, []);
  return (
    <OverviewTable
      spec={TABLES.requirements}
      state={overview.requirements}
      headingLevel="h1"
      toolbar={<KnowledgeSubIndex />}
    />
  );
}
