import { useEffect } from "react";

import { OverviewTable } from "../home/OverviewTable";
import { TABLES } from "../home/tables";
import { useOverview } from "../home/useOverview";

/**
 * One table on its own page.
 *
 * Until the area's curation screens land, its page is the same table the home
 * shows, with a plain word on what comes next. Its address is stable, so links
 * made today keep working when the screens arrive.
 */
export function AreaPage({ area }: { area: keyof typeof TABLES }) {
  const overview = useOverview();
  const spec = TABLES[area];
  useEffect(() => {
    document.title = `${spec.title} · Knowledge portal`;
  }, [spec.title]);
  return (
    <>
      <OverviewTable spec={spec} state={overview[area]} headingLevel="h1" />
      <p className="page__preparing">
        Curating {spec.noun} here, row by row, comes in the portal's next edition. This table is
        current: it reads the same answers as the front page.
      </p>
    </>
  );
}
