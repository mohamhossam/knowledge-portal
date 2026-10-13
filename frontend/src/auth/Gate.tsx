import "./gate.css";

import { LogIn, LogOut } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { ActionGroup, Button, Status } from "../design/components";
import { useAuth } from "./authContext";
import { BASE, REQUIREMENT_APP_URL } from "./paths";

/** Where a signed-in reader who is not an admin reads the catalogue in service. */
const EXPLORER_URL = `${BASE}/explorer`;

/**
 * Nobody reaches a table until the portal knows who they are and that they
 * are a knowledge admin. Each refusal says why and where to go instead.
 * Someone signed in without the role gets `readers`: the explorer, which
 * anyone signed in may read (requirement-portal ADR-0101).
 */
export function Gate({ children, readers }: { children: ReactNode; readers?: ReactNode }) {
  const auth = useAuth();
  if (!auth || auth.loading) {
    return (
      <Notice title="Opening the knowledge portal" busy>
        <p>Checking who you are…</p>
      </Notice>
    );
  }
  if (auth.denied) return auth.reader && readers ? <>{readers}</> : <NoAccess />;
  if (!auth.actor) return <SignIn />;
  return <>{children}</>;
}

function Notice({ title, busy = false, children }: { title: string; busy?: boolean; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Knowledge portal`;
  }, [title]);
  return (
    <div className="ds-root gate">
      <main id="main" className="gate__main" aria-busy={busy || undefined}>
        <p className="gate__portal">
          {REQUIREMENT_APP_URL !== null && (
            <>
              <a href={REQUIREMENT_APP_URL}>Requirement AI</a>
              <span aria-hidden="true">·</span>
            </>
          )}
          Knowledge portal
        </p>
        <h1 className="gate__title">{title}</h1>
        <div className="gate__body">{children}</div>
      </main>
    </div>
  );
}

export function NoAccess() {
  const auth = useAuth();
  return (
    <Notice title="This portal is for knowledge admins">
      <p>
        You are signed in, but your account does not hold the <code>knowledge_admin</code> role,
        so the library and the catalogues stay closed to you here.
      </p>
      <p>
        You can still read the <a href={EXPLORER_URL}>product architecture explorer</a>: for each
        offering and order type, the journey and the systems that take part. Citations and
        architecture evidence also open, read-only, from each requirement in Requirement AI.
      </p>
      <p>To curate, ask your platform administrator to add you to the knowledge-admins group.</p>
      <ActionGroup>
        {REQUIREMENT_APP_URL !== null && (
          <a className="ds-button ds-button--primary" href={REQUIREMENT_APP_URL}>Go to Requirement AI</a>
        )}
        {auth?.config?.mode === "oidc" && (
          <Button variant="tertiary" icon={<LogOut size={14} />} onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        )}
      </ActionGroup>
    </Notice>
  );
}

function SignIn() {
  const auth = useAuth();
  const choices = auth?.config?.login_choices ?? [];
  return (
    <Notice title={auth?.sessionExpired ? "Your session has ended" : "Sign in to the knowledge portal"}>
      {auth?.error && <p role="alert"><Status tone="attention">{auth.error}</Status></p>}
      <p>
        Use the same account you use for Requirement AI. Knowledge admins curate here; anyone
        signed in can read the product architecture explorer.
      </p>
      <ActionGroup>
        {choices.length > 0 ? choices.map((choice) => (
          <Button key={choice.id} variant="primary" icon={<LogIn size={16} />} onClick={() => void auth?.signIn(choice.id)}>
            {choice.label}
          </Button>
        )) : (
          <Button variant="primary" icon={<LogIn size={16} />} onClick={() => void auth?.signIn()}>
            Sign in
          </Button>
        )}
      </ActionGroup>
    </Notice>
  );
}
