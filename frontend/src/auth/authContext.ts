import { createContext, useContext } from "react";

import type { Actor, IdentityConfig } from "../api/client";

/**
 * Who is using the portal, and why not when nobody is.
 *
 * `denied` is a signed-in person without the knowledge_admin role: the API
 * answered 403, so the portal shows them where to go instead of an error.
 */
export type AuthState = {
  actor: Actor | null;
  config: IdentityConfig | null;
  loading: boolean;
  denied: boolean;
  error: string | null;
  sessionExpired: boolean;
  signIn: (choiceId?: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchFakeActor: (actorId: string) => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  return useContext(AuthContext);
}
