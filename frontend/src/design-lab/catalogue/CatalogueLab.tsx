/**
 * The catalogue redesign ("Layered Architecture Poster", e& calm), mounted at
 * /design-lab/catalogue where app/features.ts turns it on: under the dev server,
 * or in a build made with VITE_CATALOGUE_LAB=true. It reads the catalogue
 * version in service from the API, or the bundled Business Pro Plus sample
 * (catalogueSource.ts). Nothing here writes.
 */
import "../../design";
import "./lab.css";

import { type ReactNode, useContext, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";

import { errorMessage } from "../../api/errors";
import { Button, EmptyState, Skeleton } from "../../design/components";
import { type CatalogueSource, catalogueSource, LabSource, useLabCatalogue } from "./catalogueSource";
import { ProductsIndex } from "./CatalogueIndexes";
import { JourneyFlow } from "./JourneyFlow";
import { JourneysIndex } from "./JourneysIndex";
import { AreaTabs, SourceSwitch } from "./labChrome";
import { InShell, LAB, LabData } from "./labData";
import { useTitle } from "./labUtil";
import { LandscapeHero } from "./LandscapeHero";
import { ProductArchitecture } from "./ProductArchitecture";
import { ProductOverview } from "./ProductPage";
import { ProductComponents } from "./ProductComponents";
import { ProductHierarchy, ProductPlans, ProductRules } from "./ProductTabs";
import { SystemsPage } from "./SystemsPage";

/**
 * The catalogue's frame inside the portal's shell: the portal draws the
 * masthead and the areas bar; the catalogue adds its section bar and pages.
 */
function LabShell({ children }: { children: ReactNode }) {
  // Inside the portal shell, the shell's <main> holds the page. Rendered alone (a test, a preview), the lab brings its own.
  const inShell = useContext(InShell);
  return <div className="cl cl--embedded">{inShell ? <div className="cl-page">{children}</div> : <main className="cl-page">{children}</main>}</div>;
}

/** An address under the lab that no page has: says so, with the lab's sections and the way back. */
function LabNotFound() {
  useTitle("Page not found");
  return (
    <>
      <AreaTabs />
      <div className="cl-empty">
        <h1>Page not found</h1>
        <p>
          Nothing in the catalogue is at this address. <Link to={LAB}>Back to the landscape</Link>.
        </p>
      </div>
    </>
  );
}

/** While the catalogue is read, or when it can't be: the page keeps its h1, says why, and offers the sample. */
function LabState({ children }: { children: ReactNode }) {
  useTitle("Architecture");
  return (
    <LabShell>
      <h1>Architecture catalogue</h1>
      {children}
      <SourceSwitch />
    </LabShell>
  );
}

/**
 * The lab; `inShell` when the portal's shell already provides the page's <main>.
 * `source` overrides the configured one (catalogueSource.ts), e.g. in tests.
 */
export default function CatalogueLab({ inShell = false, source: initial = catalogueSource() }: { inShell?: boolean; source?: CatalogueSource }) {
  const [source, setSource] = useState(initial);
  return (
    <LabSource.Provider value={{ source, setSource }}>
      <LabPages inShell={inShell} source={source} />
    </LabSource.Provider>
  );
}

function LabPages({ inShell, source }: { inShell: boolean; source: CatalogueSource }) {
  const catalogue = useLabCatalogue(source);
  if (catalogue.state !== "ready") {
    return (
      <InShell.Provider value={inShell}>
        <LabState>
          {catalogue.state === "loading" ? (
            <Skeleton label="Reading the catalogue" rows={6} />
          ) : catalogue.state === "error" ? (
            <EmptyState title="The catalogue couldn't be read" action={<Button onClick={catalogue.retry}>Try again</Button>}>
              {errorMessage(catalogue.error)}
            </EmptyState>
          ) : (
            <EmptyState title="No catalogue version is in service yet">Publish a version from Versions to read it here.</EmptyState>
          )}
        </LabState>
      </InShell.Provider>
    );
  }
  const data = catalogue.data;
  return (
    <InShell.Provider value={inShell}>
    <LabData.Provider value={data}>
      <LabShell>
        <Routes>
          <Route index element={<LandscapeHero />} />
          <Route path="products" element={<ProductsIndex />} />
          <Route path="journeys" element={<JourneysIndex />} />
          <Route path="systems" element={<SystemsPage />} />
          <Route path="products/:offeringId" element={<ProductOverview />} />
          <Route path="products/:offeringId/hierarchy" element={<ProductHierarchy />} />
          <Route path="products/:offeringId/plans" element={<ProductPlans />} />
          <Route path="products/:offeringId/rules" element={<ProductRules />} />
          <Route path="products/:offeringId/components" element={<ProductComponents />} />
          <Route path="products/:offeringId/architecture" element={<ProductArchitecture />} />
          <Route path="journeys/:journeyId" element={<JourneyFlow />} />
          <Route path="*" element={<LabNotFound />} />
        </Routes>
      </LabShell>
    </LabData.Provider>
    </InShell.Provider>
  );
}
