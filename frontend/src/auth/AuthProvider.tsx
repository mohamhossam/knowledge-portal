import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";

import {
  api,
  configureAuthentication,
  configureAuthenticationHeaders,
  type Actor,
  type IdentityConfig,
} from "../api/client";
import { ApiError, errorMessage } from "../api/errors";
import { AuthContext, type AuthState } from "./authContext";
import {
  BASE,
  CALLBACK_PATH,
  SILENT_CALLBACK_PATH,
  absolute,
  routerPath,
  safeReturnPath,
} from "./paths";

const fakeActorKey = "knowledge-portal.fake-actor";
const returnPathKey = "knowledge-portal.auth-return-path";

function oidcManager(config: IdentityConfig) {
  if (!config.authority || !config.client_id) throw new Error("Sign-in is not configured for this portal.");
  return new UserManager({
    authority: config.authority,
    client_id: config.client_id,
    redirect_uri: absolute(CALLBACK_PATH),
    silent_redirect_uri: absolute(SILENT_CALLBACK_PATH),
    post_logout_redirect_uri: absolute("/"),
    response_type: "code",
    scope: config.scopes ?? "openid profile email",
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
}

/**
 * Signs the admin in, offline (a persona header) or through the platform's
 * OIDC provider (client `knowledge-spa`), and resolves who they are.
 *
 * A 403 from `/identity/me` is not an error: it is a signed-in person who is
 * not a knowledge admin, and the portal tells them so.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<IdentityConfig | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const managerRef = useRef<UserManager | null>(null);
  const started = useRef(false);
  const transition = useRef(0);

  const loadActor = useCallback(async () => {
    const sequence = ++transition.current;
    try {
      const current = await api.currentActor();
      if (sequence !== transition.current) return;
      setActor(current);
      setDenied(false);
      setError(null);
      setSessionExpired(false);
    } catch (reason) {
      if (sequence !== transition.current) return;
      setActor(null);
      if (reason instanceof ApiError && reason.status === 403) {
        setDenied(true);
        return;
      }
      if (reason instanceof ApiError && reason.status === 401) {
        setSessionExpired(true);
        return;
      }
      setError(errorMessage(reason));
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let disposed = false;
    configureAuthentication(() => ({}));
    void api.identityConfig().then(async (resolved) => {
      if (disposed) return;
      setConfig(resolved);
      if (resolved.mode === "fake") {
        const remembered = sessionStorage.getItem(fakeActorKey);
        const selected = resolved.fake_actors.some((item) => item.id === remembered)
          ? remembered
          : resolved.fake_actors[0]?.id;
        if (!selected) throw new Error("Offline sign-in has no personas.");
        sessionStorage.setItem(fakeActorKey, selected);
        configureAuthentication(() => ({ "X-Fake-Actor-Id": selected }));
        await loadActor();
        return;
      }
      const manager = oidcManager(resolved);
      managerRef.current = manager;
      const path = routerPath();
      let user: User | null;
      if (path === SILENT_CALLBACK_PATH) {
        await manager.signinSilentCallback();
        user = await manager.getUser();
      } else if (path === CALLBACK_PATH) {
        user = await manager.signinRedirectCallback();
        const target = safeReturnPath(sessionStorage.getItem(returnPathKey));
        sessionStorage.removeItem(returnPathKey);
        window.history.replaceState({}, "", `${BASE}${target}`);
      } else {
        user = await manager.getUser();
      }
      if (disposed) return;
      configureAuthentication(
        (): Record<string, string> => (user?.access_token ? { Authorization: `Bearer ${user.access_token}` } : {}),
        () => {
          setSessionExpired(true);
          void manager.signinSilent().catch(() => setSessionExpired(true));
        },
      );
      manager.events.addUserLoaded((renewed) => {
        user = renewed;
        configureAuthenticationHeaders(() => ({ Authorization: `Bearer ${renewed.access_token}` }));
        void loadActor();
      });
      if (user && !user.expired) await loadActor();
    }).catch((reason: unknown) => {
      if (!disposed) setError(errorMessage(reason));
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => {
      disposed = true;
      started.current = false;
      transition.current += 1;
    };
  }, [loadActor]);

  const value = useMemo<AuthState>(() => ({
    actor,
    config,
    loading,
    denied,
    error,
    sessionExpired,
    signIn: async (choiceId?: string) => {
      const manager = managerRef.current;
      if (!manager || !config) {
        setError("Sign-in is not configured. Reload the page, or ask your administrator.");
        return;
      }
      const choice = choiceId ? config.login_choices.find((item) => item.id === choiceId) : undefined;
      sessionStorage.setItem(
        returnPathKey,
        safeReturnPath(`${routerPath()}${window.location.search}${window.location.hash}`),
      );
      try {
        await manager.signinRedirect({ extraQueryParams: choice?.authorization_parameters });
      } catch (reason) {
        setError(errorMessage(reason));
      }
    },
    signOut: async () => {
      transition.current += 1;
      configureAuthenticationHeaders(() => ({}));
      await queryClient.cancelQueries();
      queryClient.clear();
      setActor(null);
      if (config?.mode === "oidc" && managerRef.current) await managerRef.current.signoutRedirect();
    },
    switchFakeActor: async (actorId: string) => {
      configureAuthenticationHeaders(() => ({ "X-Fake-Actor-Id": actorId }));
      sessionStorage.setItem(fakeActorKey, actorId);
      await queryClient.cancelQueries();
      queryClient.clear();
      await loadActor();
    },
  }), [actor, config, denied, error, loadActor, loading, queryClient, sessionExpired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
