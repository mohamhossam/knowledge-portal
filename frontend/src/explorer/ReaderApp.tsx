import { UserRound } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "../auth/authContext";
import { NoAccess } from "../auth/Gate";
import { CALLBACK_PATH, SILENT_CALLBACK_PATH } from "../auth/paths";
import { ActionGroup, AppShell, Button, Drawer, MastheadButton, Select } from "../design/components";
import { useDisclosure } from "../design/hooks";
import { RouterLink } from "../shell/links";
import { ExplorerPage } from "./ExplorerPage";

/**
 * The portal for someone signed in who is not a knowledge admin: the explorer
 * and nothing else (ADR-0101). The binding keeps the
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

/**
 * The reader's frame: the masthead without the areas bar (AppShell's reader
 * variant) and their account.
 */
function ReaderShell() {
  const auth = useAuth();
  const actor = auth?.reader ?? null;
  const account = useDisclosure(() => document.getElementById("reader-account"));
  const offline = auth?.config?.mode === "fake";
  return (
    <AppShell
      homeHref="/explorer"
      product="Knowledge Portal"
      reader
      link={RouterLink}
      utilities={
        actor ? (
          <MastheadButton
            id="reader-account"
            icon={<UserRound size={16} />}
            label={actor.display_name}
            hiddenPrefix="Account:"
            expanded={account.open}
            controls="reader-panel"
            onClick={(event) => (account.open ? account.close() : account.show(event))}
          />
        ) : undefined
      }
      panel={
        account.open && actor ? (
          <Drawer id="reader-panel" title="Account" onClose={account.close} panelRef={account.panel}>
            <p>Signed in as <strong><bdi>{actor.display_name}</bdi></strong>. Reading only: curating is for knowledge admins.</p>
            {offline && auth?.config ? (
              <Select label="Persona" hint="Offline sign-in: switch who you act as." value={actor.id} onChange={(event) => void auth.switchFakeActor(event.target.value)}>
                {auth.config.fake_actors.map((item) => <option key={item.id} value={item.id} dir="auto">{item.display_name}</option>)}
              </Select>
            ) : (
              <ActionGroup><Button onClick={() => void auth?.signOut()}>Sign out</Button></ActionGroup>
            )}
          </Drawer>
        ) : null
      }
    >
      <ExplorerPage linkSystems={false} />
    </AppShell>
  );
}
