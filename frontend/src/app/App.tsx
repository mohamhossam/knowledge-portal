import { useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { CALLBACK_PATH, SILENT_CALLBACK_PATH } from "../auth/paths";
import { CataloguePage } from "../catalogue/CataloguePage";
import { DomainsPage } from "../catalogue/DomainsPage";
import { JourneyPage, JourneysPage } from "../catalogue/JourneysPage";
import { OfferingPage, OfferingsPage } from "../catalogue/OfferingsPage";
import { SystemsPage } from "../catalogue/SystemsPage";
import { VersionsPage as CatalogueVersionsPage } from "../catalogue/VersionsPage";
import { CitationsPage } from "../library/CitationsPage";
import { DocumentPage, ReviewPage } from "../library/DocumentPage";
import { LibraryPage } from "../library/LibraryPage";
import { OwnershipPage } from "../library/OwnershipPage";
import { SearchPage } from "../library/SearchPage";
import { VersionsPage } from "../library/VersionsPage";
import { AreaPage } from "./AreaPage";
import { HomePage } from "./HomePage";
import { Shell } from "./Shell";

/** A catalogue version's pages, the same for the version in service and any other. */
const catalogueRoutes = (
  <>
    <Route index element={<SystemsPage />} />
    <Route path="systems/:systemId" element={<SystemsPage />} />
    <Route path="domains" element={<DomainsPage />} />
    <Route path="offerings" element={<OfferingsPage />} />
    <Route path="offerings/:offeringId" element={<OfferingPage />} />
    <Route path="journeys" element={<JourneysPage />} />
    <Route path="journeys/:journeyId" element={<JourneyPage />} />
  </>
);

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/search" element={<SearchPage />} />
        <Route path="library/:documentId" element={<DocumentPage />}>
          <Route index element={<ReviewPage />} />
          <Route path="versions" element={<VersionsPage />} />
          <Route path="citations" element={<CitationsPage />} />
          <Route path="ownership" element={<OwnershipPage />} />
        </Route>
        <Route path="architecture" element={<CataloguePage />}>
          {catalogueRoutes}
          <Route path="versions" element={<CatalogueVersionsPage />} />
        </Route>
        <Route path="architecture/versions/:releaseId" element={<CataloguePage />}>
          {catalogueRoutes}
        </Route>
        <Route path="squads" element={<AreaPage area="squads" />} />
        {/* Sign-in has already returned the admin to where they were going. */}
        <Route path={CALLBACK_PATH.slice(1)} element={<Navigate to="/" replace />} />
        <Route path={SILENT_CALLBACK_PATH.slice(1)} element={null} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  useEffect(() => {
    document.title = "No such table · Knowledge portal";
  }, []);
  return (
    <section className="missing" aria-labelledby="missing-title">
      <h1 id="missing-title" className="missing__title">There is no table at this address</h1>
      <p>The portal has three tables: the library, the architecture catalogue and the squad catalogue.</p>
      <p><Link to="/">Back to the front page</Link></p>
    </section>
  );
}
