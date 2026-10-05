import { Navigate, Route, Routes } from "react-router-dom";

import { Account } from "../app/Shell";
import { useAuth } from "../auth/authContext";
import { NoAccess } from "../auth/Gate";
import { CALLBACK_PATH, REQUIREMENT_APP_URL, SILENT_CALLBACK_PATH } from "../auth/paths";
import { ExplorerPage } from "./ExplorerPage";

/**
 * The portal for someone signed in who is not a knowledge admin: the explorer
 * and nothing else (requirement-portal ADR-0101). The binding keeps the
 * masthead but not the index of tables, which only admins can open; any other
 * address says why it is closed and where to read instead.
 */
export function ReaderApp() {
  return (
    <Routes>
      <Route index element={<Navigate to="/explorer" replace />} />
      <Route path="explorer" element={<ReaderShell />} />
      <Route path={CALLBACK_PATH.slice(1)} element={<Navigate to="/explorer" replace />} />
      <Route path={SILENT_CALLBACK_PATH.slice(1)} element={null} />
      <Route path="*" element={<NoAccess />} />
    </Routes>
  );
}

function ReaderShell() {
  const auth = useAuth();
  return (
    <>
      <a className="skip-link" href="#main">Skip to the explorer</a>
      <header className="masthead">
        <p className="masthead__title">
          <a href={REQUIREMENT_APP_URL}>Requirement AI</a>
          <span aria-hidden="true" className="masthead__dot">·</span>
          <span className="masthead__portal">Knowledge portal</span>
        </p>
        <p className="masthead__valid">Reading only: curating is for knowledge admins.</p>
        <Account actor={auth?.reader ?? null} />
      </header>
      <main id="main" className="page" tabIndex={-1}>
        <ExplorerPage linkSystems={false} />
      </main>
    </>
  );
}
