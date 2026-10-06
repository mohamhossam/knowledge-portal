import { useEffect } from "react";

import { OverviewTable } from "../home/OverviewTable";
import { TABLES } from "../home/tables";
import { useOverview } from "../home/useOverview";

/**
 * The portal's front page: the three tables of shared knowledge and requirement
 * work's corpus, each with what is in force, what needs a curator, and the one
 * next decision.
 */
export function HomePage() {
  const overview = useOverview();
  useEffect(() => {
    document.title = "Knowledge portal";
  }, []);
  return (
    <>
      <h1 className="visually-hidden">Knowledge portal: the tables in force</h1>
      <OverviewTable spec={TABLES.library} state={overview.library} />
      <OverviewTable spec={TABLES.architecture} state={overview.architecture} />
      <OverviewTable spec={TABLES.squads} state={overview.squads} />
      <OverviewTable spec={TABLES.requirements} state={overview.requirements} />
    </>
  );
}
