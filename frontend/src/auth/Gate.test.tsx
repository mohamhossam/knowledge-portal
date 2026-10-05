import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthContext, type AuthState } from "./authContext";
import { Gate } from "./Gate";
import { safeReturnPath } from "./paths";

function state(overrides: Partial<AuthState>): AuthState {
  return {
    actor: null, config: null, loading: false, denied: false, reader: null, error: null, sessionExpired: false,
    signIn: async () => undefined, signOut: async () => undefined, switchFakeActor: async () => undefined,
    ...overrides,
  };
}

function gate(auth: AuthState) {
  return render(
    <AuthContext.Provider value={auth}>
      <Gate readers={<p>The explorer</p>}><p>The tables</p></Gate>
    </AuthContext.Provider>,
  );
}

const OBSERVER = { id: "fake-observer", display_name: "Omar", email: null, roles: [] };

describe("Gate", () => {
  it("tells a signed-in person without the role where to go instead", () => {
    gate(state({ denied: true }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This portal is for knowledge admins");
    expect(screen.getByRole("link", { name: "Go to Requirement AI" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "product architecture explorer" })).toHaveAttribute("href", "/explorer");
    expect(screen.queryByText("The tables")).not.toBeInTheDocument();
  });

  it("opens the explorer, and only the explorer, to a signed-in reader who is not an admin", () => {
    gate(state({ denied: true, reader: OBSERVER }));
    expect(screen.getByText("The explorer")).toBeInTheDocument();
    expect(screen.queryByText("The tables")).not.toBeInTheDocument();
  });

  it("asks for sign-in when nobody is signed in, offering each login choice", () => {
    gate(state({
      config: { mode: "oidc", login_choices: [{ id: "sso", label: "Company sign-in", authorization_parameters: {} }] } as never,
    }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign in to the knowledge portal");
    expect(screen.getByRole("button", { name: "Company sign-in" })).toBeInTheDocument();
  });

  it("opens the tables for a knowledge admin", () => {
    gate(state({ actor: { id: "fake-owner", display_name: "Amina", email: null, roles: ["knowledge_admin"] } }));
    expect(screen.getByText("The tables")).toBeInTheDocument();
  });
});

describe("safeReturnPath", () => {
  it("keeps a path inside the portal and refuses anything that leaves it", () => {
    expect(safeReturnPath("/library?x=1#n")).toBe("/library?x=1#n");
    expect(safeReturnPath("//evil.example/path")).toBe("/");
    expect(safeReturnPath("https://evil.example/")).toBe("/");
    expect(safeReturnPath("/auth/callback")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });
});
