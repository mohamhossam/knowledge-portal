import { LogIn, LogOut } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { useAuth } from "./authContext";
import { REQUIREMENT_APP_URL } from "./paths";

/**
 * Nobody reaches a table until the portal knows who they are and that they
 * are a knowledge admin. Each refusal says why and where to go instead.
 */
export function Gate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (!auth || auth.loading) {
    return (
      <Notice title="Opening the knowledge portal" busy>
        <p>Checking who you are…</p>
      </Notice>
    );
  }
  if (auth.denied) return <NoAccess />;
  if (!auth.actor) return <SignIn />;
  return <>{children}</>;
}

function Notice({ title, busy = false, children }: { title: string; busy?: boolean; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Knowledge portal`;
  }, [title]);
  return (
    <main id="main" className="notice" aria-busy={busy || undefined}>
      <p className="notice__portal">
        <a href={REQUIREMENT_APP_URL}>Requirement AI</a>
        <span aria-hidden="true" className="masthead__dot">·</span>
        Knowledge portal
      </p>
      <h1 className="notice__title">{title}</h1>
      <div className="notice__body">{children}</div>
    </main>
  );
}

function NoAccess() {
  const auth = useAuth();
  return (
    <Notice title="This portal is for knowledge admins">
      <p>
        You are signed in, but your account does not hold the <code>knowledge_admin</code> role,
        so the library and the catalogues stay closed to you here.
      </p>
      <p>
        You can still read what requirement work relies on: citations and architecture evidence
        open, read-only, from each requirement in Requirement AI.
      </p>
      <p>To curate, ask your platform administrator to add you to the knowledge-admins group.</p>
      <p className="notice__actions">
        <a className="notice__primary" href={REQUIREMENT_APP_URL}>Go to Requirement AI</a>
        {auth?.config?.mode === "oidc" && (
          <button type="button" className="text-button" onClick={() => void auth.signOut()}>
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        )}
      </p>
    </Notice>
  );
}

function SignIn() {
  const auth = useAuth();
  const choices = auth?.config?.login_choices ?? [];
  return (
    <Notice title={auth?.sessionExpired ? "Your session has ended" : "Sign in to the knowledge portal"}>
      {auth?.error && <p className="notice__error" role="alert">{auth.error}</p>}
      <p>Use the same account you use for Requirement AI. Only knowledge admins get in.</p>
      <p className="notice__actions">
        {choices.length > 0 ? choices.map((choice) => (
          <button key={choice.id} type="button" className="notice__primary" onClick={() => void auth?.signIn(choice.id)}>
            <LogIn size={16} aria-hidden="true" />
            {choice.label}
          </button>
        )) : (
          <button type="button" className="notice__primary" onClick={() => void auth?.signIn()}>
            <LogIn size={16} aria-hidden="true" />
            Sign in
          </button>
        )}
      </p>
    </Notice>
  );
}
