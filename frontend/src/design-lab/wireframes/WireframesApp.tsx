/**
 * Phase 3 wireframe lab, mounted at /design-lab/wireframes in development
 * only (App.tsx guards it with import.meta.env.DEV, so production builds drop
 * it). Low fidelity on purpose: greyscale, system font, no brand.
 */
import "./wf.css";
// GATE 4 chose direction A: Archivo (already loaded app-wide) + Noto Sans Arabic.
import "@fontsource-variable/noto-sans-arabic/wdth.css";
import "./directions.css";

import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { LabProvider } from "./LabProvider";
import { CatalogueSystems, CatalogueVersions } from "./pages/Catalogue";
import { DocumentRecord } from "./pages/Document";
import { DraftWorkspace } from "./pages/Draft";
import { ExplorerWireframe } from "./pages/Explorer";
import { LibraryDocuments, LibrarySearch } from "./pages/Library";
import { OwnershipBrowse, OwnershipGaps } from "./pages/Ownership";
import { LabIndex, RequirementsEmpty, Settings, SystemState } from "./pages/States";
import { ReConfirmations, YourWork } from "./pages/YourWork";
import { WfShell } from "./Shell";
import { useRelease } from "./data";

/** A version address is a draft workspace when the version is a draft, else the read-only "proof" view. */
function VersionRoute() {
  const { releaseId } = useParams();
  const release = useRelease(releaseId);
  if (release.isPending) return null;
  return release.data?.status === "draft" ? <Navigate to="sources" replace /> : <CatalogueSystems proof />;
}

export default function WireframesApp() {
  return (
    <LabProvider>
      <WfShell>
        <Routes>
          <Route index element={<YourWork />} />
          <Route path="lab" element={<LabIndex />} />
          <Route path="re-confirmations" element={<ReConfirmations />} />
          <Route path="library" element={<LibraryDocuments />} />
          <Route path="library/search" element={<LibrarySearch />} />
          <Route path="library/:documentId" element={<DocumentRecord tab="main" />} />
          <Route path="library/:documentId/versions" element={<DocumentRecord tab="versions" />} />
          <Route path="library/:documentId/cited-by" element={<DocumentRecord tab="cited-by" />} />
          <Route path="library/:documentId/ownership" element={<DocumentRecord tab="ownership" />} />
          <Route path="architecture" element={<CatalogueSystems />} />
          <Route path="architecture/systems/:systemId" element={<CatalogueSystems />} />
          <Route path="architecture/versions" element={<CatalogueVersions />} />
          <Route path="architecture/versions/:releaseId" element={<VersionRoute />} />
          <Route path="architecture/versions/:releaseId/systems/:systemId" element={<CatalogueSystems proof />} />
          <Route path="architecture/versions/:releaseId/sources" element={<DraftWorkspace step="sources" />} />
          <Route path="architecture/versions/:releaseId/decide" element={<DraftWorkspace step="decide" />} />
          <Route path="architecture/versions/:releaseId/changes" element={<DraftWorkspace step="changes" />} />
          <Route path="architecture/versions/:releaseId/check" element={<DraftWorkspace step="check" />} />
          <Route path="architecture/versions/:releaseId/publish" element={<DraftWorkspace step="publish" />} />
          <Route path="architecture/versions/:releaseId/edit/*" element={<CatalogueSystems proof />} />
          <Route path="ownership" element={<OwnershipGaps />} />
          <Route path="ownership/products" element={<OwnershipBrowse what="products" />} />
          <Route path="ownership/squads" element={<OwnershipBrowse what="squads" />} />
          <Route path="ownership/people" element={<OwnershipBrowse what="people" />} />
          <Route path="ownership/history" element={<OwnershipBrowse what="history" />} />
          <Route path="requirement-knowledge" element={<RequirementsEmpty what="overview" />} />
          <Route path="requirement-knowledge/requirements" element={<RequirementsEmpty what="requirements" />} />
          <Route path="requirement-knowledge/findings" element={<RequirementsEmpty what="findings" />} />
          <Route path="requirement-knowledge/historic" element={<RequirementsEmpty what="historic" />} />
          <Route path="explorer" element={<ExplorerWireframe />} />
          <Route path="settings" element={<Settings />} />
          <Route path="states/no-access" element={<SystemState kind="no-access" />} />
          <Route path="states/session" element={<SystemState kind="session" />} />
          <Route path="states/offline" element={<SystemState kind="offline" />} />
          <Route path="*" element={<SystemState kind="not-found" />} />
        </Routes>
      </WfShell>
    </LabProvider>
  );
}
