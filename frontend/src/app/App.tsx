import { useEffect } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { CALLBACK_PATH, SILENT_CALLBACK_PATH } from "../auth/paths";
import { DocumentPage } from "../library/DocumentPage";
import { LibraryPage } from "../library/LibraryPage";
import { AreaPage } from "./AreaPage";
import { HomePage } from "./HomePage";
import { Shell } from "./Shell";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:documentId" element={<DocumentPage />} />
        <Route path="architecture" element={<AreaPage area="architecture" />} />
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
