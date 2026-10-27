import { Navigate, useSearchParams } from "react-router-dom";

import { RouterLink } from "../shell/links";
import { systemName } from "./catalogue";
import { SystemContextDiagram } from "./diagrams/CatalogueDiagrams";
import { CatalogueHeader } from "./frame/CatalogueHeader";
import { useCatalogueContext } from "./useCatalogue";

/**
 * The Map tab's old address (catalogue merge, step 5). The whole-estate drawing
 * gave way to the Systems tab's matrices: "How systems connect" opens who calls
 * whom there, and "What systems do" opens the Landscape's business areas. One
 * system in context, opened full width from its record, still draws here.
 */
export function MapPage() {
  const { book, base } = useCatalogueContext();
  const [params] = useSearchParams();
  // Opened from a system's record: that system in context, at the page's full width.
  const focus = params.get("system");
  const focused = focus !== null && book.systems.has(focus) ? focus : null;
  if (params.get("lens") === "capabilities") return <Navigate to={`${base}/domains`} replace />;
  if (!focused) return <Navigate to={`${base}?view=interfaces`} replace />;

  return (
    <>
      <CatalogueHeader page="systems" chosen={systemName(book, focused)} />
      <div className="cat-stack">
        <p className="cat-lead">
          <RouterLink href={`${base}/systems/${encodeURIComponent(focused)}`}>Back to the record of {systemName(book, focused)}</RouterLink>
          {" · "}
          <RouterLink href={`${base}?view=interfaces`}>See who calls whom across every system</RouterLink>
        </p>
        <SystemContextDiagram systemId={focused} />
      </div>
    </>
  );
}
