import { type ComponentType, lazy, type ReactNode, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { CALLBACK_PATH, SILENT_CALLBACK_PATH } from "../auth/paths";
import { CataloguePage } from "../catalogue/CataloguePage";
import { ChannelsPage } from "../catalogue/ChannelsPage";
import { GovernancePage } from "../catalogue/GovernancePage";
import { ComparePage } from "../catalogue/ComparePage";
import { ConceptsPage } from "../catalogue/ConceptsPage";
import { EvidencePage } from "../catalogue/EvidencePage";
import { DomainsPage } from "../catalogue/DomainsPage";
import { JourneyPage, JourneysPage } from "../catalogue/JourneysPage";
import { OfferingPage, OfferingsPage } from "../catalogue/OfferingsPage";
import { SystemsPage } from "../catalogue/SystemsPage";
import { CatalogueHeader } from "../catalogue/frame/CatalogueHeader";
import { LegacyPage } from "../catalogue/frame/LegacyPage";
import { ChangesStep } from "../catalogue/draft/ChangesStep";
import { CheckStep } from "../catalogue/draft/CheckStep";
import { DecideStep } from "../catalogue/draft/DecideStep";
import { PublishStep } from "../catalogue/draft/PublishStep";
import { SourcesStep } from "../catalogue/draft/SourcesStep";
import { VersionsPage as CatalogueVersionsPage } from "../catalogue/VersionsPage";
import { HistoryPage } from "../squads/HistoryPage";
import { PeoplePage } from "../squads/PeoplePage";
import { ProductsPage } from "../squads/ProductsPage";
import { SquadListPage } from "../squads/SquadListPage";
import { SquadsPage } from "../squads/SquadsPage";
import { OwnershipGrid } from "../squads/OwnershipGrid";
import { ExplorerPage } from "../explorer/ExplorerPage";
import { CorpusFindingsPage } from "../requirements/CorpusFindingsPage";
import { CorpusRequirementsPage } from "../requirements/CorpusRequirementsPage";
import { RequirementKnowledgePage } from "../requirements/RequirementKnowledgePage";
import { RemindersPage } from "../reviews/RemindersPage";
import { HistoricListPage } from "../historic/HistoricListPage";
import { HistoricRecordPage } from "../historic/HistoricRecordPage";
import { ActionGroup, EmptyState, PageHeader, Skeleton } from "../design/components";
import { ButtonLink } from "../shell/links";
import { HomePage } from "./HomePage";
import { Shell } from "./Shell";

/** The library's pages load as one chunk, on the first library route opened. */
const library = () => import("../library/pages");
const fromLibrary = <K extends keyof Awaited<ReturnType<typeof library>>>(name: K) =>
  lazy(() => library().then((pages) => ({ default: pages[name] as ComponentType })));
const LibraryPage = fromLibrary("LibraryPage");
const SearchPage = fromLibrary("SearchPage");
const DocumentPage = fromLibrary("DocumentPage");
const MainPage = fromLibrary("MainPage");
const VersionsPage = fromLibrary("VersionsPage");
const CitationsPage = fromLibrary("CitationsPage");
const OwnershipPage = fromLibrary("OwnershipPage");

/** A catalogue version's pages, the same for the version in service and any other. */
const catalogueRoutes = (
  <>
    <Route index element={<SystemsPage />} />
    <Route path="systems/:systemId" element={<SystemsPage />} />
    <Route path="concepts" element={<ConceptsPage />} />
    <Route path="concepts/:conceptId" element={<ConceptsPage />} />
    <Route path="domains" element={<LegacyPage page="domains"><DomainsPage /></LegacyPage>} />
    <Route path="channels" element={<LegacyPage page="channels"><ChannelsPage /></LegacyPage>} />
    <Route path="governance" element={<><CatalogueHeader page="governance" /><GovernancePage /></>} />
    <Route path="offerings" element={<OfferingsPage />} />
    <Route path="offerings/:offeringId" element={<OfferingPage />} />
    <Route path="journeys" element={<JourneysPage />} />
    <Route path="journeys/:journeyId" element={<JourneyPage />} />
    {/* A draft's steps, in order (redesign area 3). */}
    <Route path="sources" element={<SourcesStep />} />
    <Route path="decide" element={<DecideStep />} />
    <Route path="suggestions" element={<Navigate to="../decide" replace />} />
    <Route path="changes" element={<ChangesStep />} />
    <Route path="check" element={<CheckStep />} />
    <Route path="publish" element={<PublishStep />} />
    <Route path="evidence/:chunkId" element={<LegacyPage page="evidence"><EvidencePage /></LegacyPage>} />
  </>
);

/** While a page's chunk loads: the skeleton, never a blank page (§8). */
function Loading({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton label="Opening the page" rows={6} />}>{children}</Suspense>;
}

/**
 * The design-system gallery (Phase 5). Development only: in a production build
 * `import.meta.env.DEV` is false, so the import is dead code and the gallery
 * never reaches the bundle.
 */
const DesignGallery = import.meta.env.DEV ? lazy(() => import("../design-lab/gallery/Gallery")) : null;

export function App() {
  // The library is the area people open most: fetch its chunk once the first page has painted.
  useEffect(() => {
    const later = window.setTimeout(() => void library(), 1500);
    return () => window.clearTimeout(later);
  }, []);
  return (
    <Routes>
      {DesignGallery && (
        <Route
          path="design-system/*"
          element={<Suspense fallback={null}><DesignGallery /></Suspense>}
        />
      )}
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<Loading><LibraryPage /></Loading>} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="requirement-knowledge" element={<RequirementKnowledgePage />} />
        <Route path="requirement-knowledge/requirements" element={<CorpusRequirementsPage />} />
        <Route path="requirement-knowledge/findings" element={<CorpusFindingsPage />} />
        <Route path="requirement-knowledge/historic" element={<HistoricListPage />} />
        <Route path="requirement-knowledge/historic/:historicId" element={<HistoricRecordPage />} />
        <Route path="library/search" element={<Loading><SearchPage /></Loading>} />
        <Route path="library/:documentId" element={<Loading><DocumentPage /></Loading>}>
          <Route index element={<Loading><MainPage /></Loading>} />
          <Route path="versions" element={<Loading><VersionsPage /></Loading>} />
          <Route path="cited-by" element={<Loading><CitationsPage /></Loading>} />
          {/* The old address keeps working until area 10 turns it into a redirect. */}
          <Route path="citations" element={<Loading><CitationsPage /></Loading>} />
          <Route path="ownership" element={<Loading><OwnershipPage /></Loading>} />
        </Route>
        <Route path="architecture" element={<CataloguePage />}>
          {catalogueRoutes}
          <Route path="versions" element={<LegacyPage page="versions"><CatalogueVersionsPage /></LegacyPage>} />
          <Route path="compare" element={<LegacyPage page="compare"><ComparePage /></LegacyPage>} />
        </Route>
        <Route path="architecture/versions/:releaseId" element={<CataloguePage />}>
          {catalogueRoutes}
        </Route>
        <Route path="explorer" element={<ExplorerPage linkSystems />} />
        <Route path="squads" element={<SquadsPage />}>
          <Route index element={<OwnershipGrid />} />
          <Route path="products" element={<ProductsPage />} />
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

/** An address outside every page: says so plainly and offers the way back (UX rebuild, phase 1). */
function NotFound() {
  return (
    <div className="not-found">
      <PageHeader title="Page not found" documentTitle="Page not found" />
      <EmptyState
        title="Nothing in the knowledge portal is at this address."
        action={
          <ActionGroup label="Where to go instead">
            <ButtonLink to="/" variant="primary">Open To do</ButtonLink>
            <ButtonLink to="/library">Open the library</ButtonLink>
            <ButtonLink to="/architecture">Open the catalogue</ButtonLink>
          </ActionGroup>
        }
      >
        <p>The page may have moved, or the address may have a typing mistake. Search (Ctrl K) finds documents and systems by name.</p>
      </EmptyState>
    </div>
  );
}
