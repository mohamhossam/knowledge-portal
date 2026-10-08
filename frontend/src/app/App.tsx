import { lazy, Suspense, useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { CALLBACK_PATH, SILENT_CALLBACK_PATH } from "../auth/paths";
import { CataloguePage } from "../catalogue/CataloguePage";
import { ChannelsPage } from "../catalogue/ChannelsPage";
import { GovernancePage } from "../catalogue/GovernancePage";
import { ChangesPage } from "../catalogue/ChangesPage";
import { ComparePage } from "../catalogue/ComparePage";
import { CheckPage } from "../catalogue/CheckPage";
import { EvidencePage } from "../catalogue/EvidencePage";
import { PublishPage } from "../catalogue/PublishPage";
import { DomainsPage } from "../catalogue/DomainsPage";
import { JourneyPage, JourneysPage } from "../catalogue/JourneysPage";
import { OfferingPage, OfferingsPage } from "../catalogue/OfferingsPage";
import { SuggestionsPage } from "../catalogue/SuggestionsPage";
import { SystemsPage } from "../catalogue/SystemsPage";
import { VersionsPage as CatalogueVersionsPage } from "../catalogue/VersionsPage";
import { CitationsPage } from "../library/CitationsPage";
import { DocumentPage, ReviewPage } from "../library/DocumentPage";
import { LibraryPage } from "../library/LibraryPage";
import { OwnershipPage } from "../library/OwnershipPage";
import { SearchPage } from "../library/SearchPage";
import { VersionsPage } from "../library/VersionsPage";
import { HistoryPage } from "../squads/HistoryPage";
import { PeoplePage } from "../squads/PeoplePage";
import { ProductsPage } from "../squads/ProductsPage";
import { SquadListPage } from "../squads/SquadListPage";
import { SquadsPage } from "../squads/SquadsPage";
import { ExplorerPage } from "../explorer/ExplorerPage";
import { CorpusFindingsPage } from "../requirements/CorpusFindingsPage";
import { CorpusRequirementsPage } from "../requirements/CorpusRequirementsPage";
import { RequirementKnowledgePage } from "../requirements/RequirementKnowledgePage";
import { RemindersPage } from "../reviews/RemindersPage";
import { HistoricListPage } from "../historic/HistoricListPage";
import { HistoricRecordPage } from "../historic/HistoricRecordPage";
import { HomePage } from "./HomePage";
import { Shell } from "./Shell";

/** A catalogue version's pages, the same for the version in service and any other. */
const catalogueRoutes = (
  <>
    <Route index element={<SystemsPage />} />
    <Route path="systems/:systemId" element={<SystemsPage />} />
    <Route path="domains" element={<DomainsPage />} />
    <Route path="channels" element={<ChannelsPage />} />
    <Route path="governance" element={<GovernancePage />} />
    <Route path="offerings" element={<OfferingsPage />} />
    <Route path="offerings/:offeringId" element={<OfferingPage />} />
    <Route path="journeys" element={<JourneysPage />} />
    <Route path="journeys/:journeyId" element={<JourneyPage />} />
    <Route path="sources" element={<SuggestionsPage />} />
    <Route path="suggestions" element={<Navigate to="../sources" replace />} />
    <Route path="changes" element={<ChangesPage />} />
    <Route path="check" element={<CheckPage />} />
    <Route path="publish" element={<PublishPage />} />
    <Route path="evidence/:chunkId" element={<EvidencePage />} />
  </>
);

/**
 * The redesign's wireframe lab (docs/redesign/STATUS.md, Phase 3). Development
 * only: in a production build `import.meta.env.DEV` is false, so the import is
 * dead code and the lab never reaches the bundle.
 */
const DesignLab = import.meta.env.DEV ? lazy(() => import("../design-lab/wireframes/WireframesApp")) : null;
/** The design-system gallery (Phase 5); development only, like the lab. */
const DesignGallery = import.meta.env.DEV ? lazy(() => import("../design-lab/gallery/Gallery")) : null;
/** The hi-fi prototype for usability round 2 (Phase 6); development only, like the lab. */
const DesignPrototype = import.meta.env.DEV ? lazy(() => import("../design-lab/prototype/PrototypeApp")) : null;

export function App() {
  return (
    <Routes>
      {DesignGallery && (
        <Route
          path="design-system/*"
          element={<Suspense fallback={null}><DesignGallery /></Suspense>}
        />
      )}
      {DesignPrototype && (
        <Route
          path="design-lab/prototype/*"
          element={<Suspense fallback={null}><DesignPrototype /></Suspense>}
        />
      )}
      {DesignLab && (
        <Route
          path="design-lab/wireframes/*"
          element={<Suspense fallback={null}><DesignLab /></Suspense>}
        />
      )}
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="requirement-knowledge" element={<RequirementKnowledgePage />} />
        <Route path="requirement-knowledge/requirements" element={<CorpusRequirementsPage />} />
        <Route path="requirement-knowledge/findings" element={<CorpusFindingsPage />} />
        <Route path="requirement-knowledge/historic" element={<HistoricListPage />} />
        <Route path="requirement-knowledge/historic/:historicId" element={<HistoricRecordPage />} />
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
          <Route path="compare" element={<ComparePage />} />
        </Route>
        <Route path="architecture/versions/:releaseId" element={<CataloguePage />}>
          {catalogueRoutes}
        </Route>
        <Route path="explorer" element={<ExplorerPage linkSystems />} />
        <Route path="squads" element={<SquadsPage />}>
          <Route index element={<ProductsPage />} />
          <Route path="squads" element={<SquadListPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
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
      <p>The portal has four tables: the library, the architecture catalogue, the squad catalogue and requirement knowledge.</p>
      <p><Link to="/">Back to the front page</Link></p>
    </section>
  );
}
