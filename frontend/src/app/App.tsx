import { type ComponentProps, type ComponentType, lazy, type ReactNode, Suspense, use, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { CALLBACK_PATH, SILENT_CALLBACK_PATH } from "../auth/paths";
import { ExplorerPage } from "../explorer/ExplorerPage";
import { ActionGroup, EmptyState, PageHeader, Skeleton } from "../design/components";
import { ButtonLink } from "../shell/links";
import { HomePage } from "./HomePage";
import { Shell } from "./Shell";

/**
 * A group of route pages in its own chunk, fetched on the first page of the group opened.
 * Once it has arrived, every page of the group renders at once (no second suspend on the
 * next page of the same area); until then the shell's content slot shows the skeleton.
 */
function routeGroup<M extends Record<string, unknown>>(load: () => Promise<M>) {
  let loaded: M | undefined;
  let pending: Promise<M> | undefined;
  const fetch = () =>
    (pending ??= load().then(
      (pages) => (loaded = pages),
      (error: unknown) => {
        // A failed fetch (a deploy, a dropped connection) is tried again on the next visit.
        pending = undefined;
        throw error;
      },
    ));
  const page = <K extends keyof M>(name: K) => {
    function GroupPage(props: ComponentProps<M[K] & ComponentType>) {
      const Page = (loaded ?? use(fetch()))[name] as ComponentType<typeof props>;
      return <Page {...props} />;
    }
    GroupPage.displayName = String(name);
    return GroupPage;
  };
  return { page, preload: fetch };
}

/** The library's pages load as one chunk, on the first library route opened. */
const library = routeGroup(() => import("../library/pages"));
const LibraryPage = library.page("LibraryPage");
const SearchPage = library.page("SearchPage");
const DocumentPage = library.page("DocumentPage");
const MainPage = library.page("MainPage");
const VersionsPage = library.page("VersionsPage");
const CitationsPage = library.page("CitationsPage");
const OwnershipPage = library.page("OwnershipPage");
const ReviewFocus = library.page("ReviewFocus");

/** The catalogue: a version's pages, its draft's steps, versions and compare. */
const catalogue = routeGroup(async () => {
  const [frame, systems, map, concepts, domains, channels, governance, offerings, journeys, evidence, compare, versions, sources, decide, decideFocus, changes, check, publish, headed] = await Promise.all([
    import("../catalogue/CataloguePage"),
    import("../catalogue/SystemsPage"),
    import("../catalogue/MapPage"),
    import("../catalogue/ConceptsPage"),
    import("../catalogue/DomainsPage"),
    import("../catalogue/ChannelsPage"),
    import("../catalogue/GovernancePage"),
    import("../catalogue/OfferingsPage"),
    import("../catalogue/JourneysPage"),
    import("../catalogue/EvidencePage"),
    import("../catalogue/ComparePage"),
    import("../catalogue/VersionsPage"),
    import("../catalogue/draft/SourcesStep"),
    import("../catalogue/draft/DecideStep"),
    import("../catalogue/draft/DecideFocus"),
    import("../catalogue/draft/ChangesStep"),
    import("../catalogue/draft/CheckStep"),
    import("../catalogue/draft/PublishStep"),
    import("../catalogue/frame/HeadedPage"),
  ]);
  return {
    ...frame, ...systems, ...map, ...concepts, ...domains, ...channels, ...governance, ...offerings, ...journeys, ...evidence, ...compare,
    CatalogueVersionsPage: versions.VersionsPage,
    ...sources, ...decide, ...decideFocus, ...changes, ...check, ...publish, ...headed,
  };
});
const CataloguePage = catalogue.page("CataloguePage");
const SystemsPage = catalogue.page("SystemsPage");
const MapPage = catalogue.page("MapPage");
const ConceptsPage = catalogue.page("ConceptsPage");
const DomainsPage = catalogue.page("DomainsPage");
const ChannelsPage = catalogue.page("ChannelsPage");
const GovernancePage = catalogue.page("GovernancePage");
const OfferingsPage = catalogue.page("OfferingsPage");
const JourneysPage = catalogue.page("JourneysPage");
const EvidencePage = catalogue.page("EvidencePage");
const ComparePage = catalogue.page("ComparePage");
const CatalogueVersionsPage = catalogue.page("CatalogueVersionsPage");
const SourcesStep = catalogue.page("SourcesStep");
const DecideStep = catalogue.page("DecideStep");
const DecideFocus = catalogue.page("DecideFocus");
const ChangesStep = catalogue.page("ChangesStep");
const CheckStep = catalogue.page("CheckStep");
const PublishStep = catalogue.page("PublishStep");
const HeadedPage = catalogue.page("HeadedPage");

/** Ownership: who runs each system, squads, people, products and the history. */
const ownership = routeGroup(async () => {
  const [squads, bench, grid, tree, products, list, people, history] = await Promise.all([
    import("../squads/SquadsPage"),
    import("../squads/SystemsBench"),
    import("../squads/OwnershipGrid"),
    import("../squads/OwnershipTree"),
    import("../squads/ProductsPage"),
    import("../squads/SquadListPage"),
    import("../squads/PeoplePage"),
    import("../squads/HistoryPage"),
  ]);
  return { ...squads, ...bench, ...grid, ...tree, ...products, ...list, ...people, ...history };
});
const SquadsPage = ownership.page("SquadsPage");
const SystemsBench = ownership.page("SystemsBench");
const OwnershipGrid = ownership.page("OwnershipGrid");
const OwnershipTree = ownership.page("OwnershipTree");
const ProductsPage = ownership.page("ProductsPage");
const SquadListPage = ownership.page("SquadListPage");
const PeoplePage = ownership.page("PeoplePage");
const HistoryPage = ownership.page("HistoryPage");

/** Requirements: what requirement work holds, its findings and the historic requirements. */
const requirements = routeGroup(async () => {
  const [index, findings, historic] = await Promise.all([
    import("../requirements/RequirementsPage"),
    import("../requirements/FindingsPage"),
    import("../historic/HistoricPage"),
  ]);
  return { ...index, ...findings, ...historic };
});
const RequirementKnowledgeIndex = requirements.page("RequirementKnowledgeIndex");
const RequirementsPage = requirements.page("RequirementsPage");
const FindingsPage = requirements.page("FindingsPage");
const HistoricPage = requirements.page("HistoricPage");

/** A catalogue version's pages, the same for the version in service and any other. */
const catalogueRoutes = (
  <>
    <Route index element={<SystemsPage />} />
    <Route path="systems/:systemId" element={<SystemsPage />} />
    <Route path="map" element={<MapPage />} />
    <Route path="concepts" element={<ConceptsPage />} />
    <Route path="concepts/:conceptId" element={<ConceptsPage />} />
    <Route path="domains" element={<HeadedPage page="domains"><DomainsPage /></HeadedPage>} />
    <Route path="channels" element={<HeadedPage page="channels"><ChannelsPage /></HeadedPage>} />
    <Route path="governance" element={<GovernancePage />} />
    <Route path="governance/:register/:itemId" element={<GovernancePage />} />
    <Route path="offerings" element={<OfferingsPage />} />
    <Route path="offerings/:offeringId" element={<OfferingsPage />} />
    <Route path="journeys" element={<JourneysPage />} />
    <Route path="journeys/:journeyId" element={<JourneysPage />} />
    {/* A draft's steps, in order (redesign area 3). */}
    <Route path="sources" element={<SourcesStep />} />
    <Route path="decide" element={<DecideStep />} />
    {/* The Decide step one question at a time (UX rebuild, phase 2): the shell hides its sidebar. */}
    <Route path="decide/focus" element={<DecideFocus />} />
    <Route path="suggestions" element={<Navigate to="../decide" replace />} />
    <Route path="changes" element={<ChangesStep />} />
    <Route path="check" element={<CheckStep />} />
    <Route path="publish" element={<PublishStep />} />
    <Route path="evidence/:chunkId" element={<HeadedPage page="evidence"><EvidencePage /></HeadedPage>} />
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
/**
 * The catalogue redesign (Knowledge Hub V1): in development, and in a build made with
 * VITE_CATALOGUE_LAB=true (a local image, `deploy/compose.local.override.yaml`). Without
 * it, as in a published image, the import is dead code like the gallery's.
 */
const CatalogueLab = import.meta.env.DEV || import.meta.env.VITE_CATALOGUE_LAB === "true"
  ? lazy(() => import("../design-lab/catalogue/CatalogueLab"))
  : null;

export function App() {
  // The library is the area people open most: fetch its chunk once the first page has painted.
  useEffect(() => {
    const later = window.setTimeout(() => void library.preload().catch(() => {}), 1500);
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
        {/* The redesigned catalogue (development, or a lab build) inside the portal's own shell, like every other area. */}
        {CatalogueLab && <Route path="design-lab/catalogue/*" element={<Suspense fallback={null}><CatalogueLab inShell /></Suspense>} />}
        <Route path="library" element={<Loading><LibraryPage /></Loading>} />
        {/* Re-confirmations are confirmed on To do now (UX rebuild, phase 2). */}
        <Route path="reminders" element={<Navigate to="/" replace />} />
        {/* The overview folded into Requirements (UX rebuild, phase 3); its address keeps working. */}
        <Route path="requirement-knowledge" element={<RequirementKnowledgeIndex />} />
        <Route path="requirement-knowledge/requirements" element={<RequirementsPage />} />
        <Route path="requirement-knowledge/requirements/:requirementId" element={<RequirementsPage />} />
        <Route path="requirement-knowledge/findings" element={<FindingsPage />} />
        <Route path="requirement-knowledge/findings/:findingId" element={<FindingsPage />} />
        <Route path="requirement-knowledge/historic" element={<HistoricPage />} />
        <Route path="requirement-knowledge/historic/:historicId" element={<HistoricPage />} />
        <Route path="library/search" element={<Loading><SearchPage /></Loading>} />
        <Route path="library/:documentId" element={<Loading><DocumentPage /></Loading>}>
          <Route index element={<Loading><MainPage /></Loading>} />
          <Route path="versions" element={<Loading><VersionsPage /></Loading>} />
          <Route path="cited-by" element={<Loading><CitationsPage /></Loading>} />
          {/* The old address keeps working until area 10 turns it into a redirect. */}
          <Route path="citations" element={<Loading><CitationsPage /></Loading>} />
          <Route path="ownership" element={<Loading><OwnershipPage /></Loading>} />
          {/* The review one question at a time (UX rebuild, phase 2): the shell hides its sidebar. */}
          <Route path="focus" element={<Loading><ReviewFocus /></Loading>} />
        </Route>
        <Route path="architecture" element={<CataloguePage />}>
          {catalogueRoutes}
          <Route path="versions" element={<CatalogueVersionsPage />} />
          <Route path="compare" element={<HeadedPage page="compare"><ComparePage /></HeadedPage>} />
        </Route>
        <Route path="architecture/versions/:releaseId" element={<CataloguePage />}>
          {catalogueRoutes}
        </Route>
        <Route path="explorer" element={<ExplorerPage linkSystems />} />
        <Route path="squads" element={<SquadsPage />}>
          {/* Each list beside its chosen record (UX rebuild, phase 3); the grid is "Assign several". */}
          <Route index element={<SystemsBench />} />
          <Route path="systems/:systemId" element={<SystemsBench />} />
          <Route path="assign" element={<OwnershipGrid />} />
          <Route path="tree" element={<OwnershipTree />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:productId" element={<ProductsPage />} />
          <Route path="squads" element={<SquadListPage />} />
          <Route path="squads/:squadId" element={<SquadListPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="people/:personId" element={<PeoplePage />} />
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
