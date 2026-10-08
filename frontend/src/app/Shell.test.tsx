import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type LibraryDocument } from "../api/client";
import { AuthContext, type AuthState } from "../auth/authContext";
import { checkAxeAfterEach } from "../test/axe";
import { HomePage } from "./HomePage";
import { Shell } from "./Shell";

checkAxeAfterEach();

// jsdom has no layout observer; the sticky measuring hook only needs the interface.
class NoResize {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const amina = { id: "fake-owner", display_name: "Amina Owner", email: null };
const failed = {
  id: "f", title: "Site survey checklist", is_owner: true, can_edit: true, owner: amina, version: 1, published_id: null, publications: [],
  versions: [{ id: "f-v1", number: 1, stage: "failed", uploaded_at: "2026-10-01T09:00:00Z", uploaded_by: amina, error: "Row 2 is short." }],
} as unknown as LibraryDocument;

const auth: AuthState = {
  actor: { id: "fake-owner", display_name: "Amina Owner" } as AuthState["actor"],
  config: { mode: "fake", fake_actors: [{ id: "fake-owner", display_name: "Amina Owner" }, { id: "fake-reviewer", display_name: "Rami Reviewer" }] } as unknown as AuthState["config"],
  loading: false, denied: false, reader: null, error: null, sessionExpired: false,
  signIn: vi.fn(), signOut: vi.fn(), switchFakeActor: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  window.localStorage.clear();
  vi.spyOn(api, "libraryDocuments").mockResolvedValue([failed]);
  vi.spyOn(api, "releases").mockResolvedValue([]);
  vi.spyOn(api, "activeRelease").mockResolvedValue(null);
  vi.spyOn(api, "organisation").mockResolvedValue({ squads: [], people: [], products: [], value_streams: [] } as never);
  vi.spyOn(api, "reminders").mockResolvedValue({ overdue: 0, due_soon: 0, items: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<HomePage />} />
              <Route path="library" element={<h1>Table 1: Library</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("the shell", () => {
  it("offers the same utilities, skip links and areas on a rebuilt page and on a legacy one", async () => {
    for (const [path, title] of [["/", "Your work"], ["/library", "Table 1: Library"]] as const) {
      open(path);
      await screen.findByRole("heading", { level: 1, name: title });
      const banner = screen.getByRole("banner");
      await within(banner).findByRole("button", { name: "Jobs 1 active or needing attention" });
      const [jobs, help, account] = within(banner).getAllByRole("button");
      expect(jobs).toHaveAccessibleName("Jobs 1 active or needing attention");
      expect(help).toHaveAccessibleName("Help");
      expect(account).toHaveAccessibleName("Account: Amina Owner");
      expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
      expect(within(screen.getByRole("navigation", { name: "Areas" })).getByRole("link", { name: /Your work/ })).toHaveAccessibleName("Your work 1 need you");
      document.body.innerHTML = "";
    }
  });

  it("keeps a page that isn't rebuilt yet in the legacy island, and a rebuilt one out of it", async () => {
    open("/library");
    const legacy = await screen.findByRole("heading", { level: 1, name: "Table 1: Library" });
    expect(legacy.closest(".ds-legacy")).not.toBeNull();
    document.body.innerHTML = "";
    open("/");
    expect((await screen.findByRole("heading", { level: 1, name: "Your work" })).closest(".ds-legacy")).toBeNull();
  });

  it("ranks the failed read first on Your work, and the rail counts the same entries", async () => {
    open("/");
    const attention = await screen.findByRole("region", { name: /Needs attention/ });
    expect(attention).toHaveTextContent("Couldn't read");
    expect(attention).toHaveTextContent("Row 2 is short.");
    const row = within(attention).getByRole("rowheader", { name: "Site survey checklist" });
    expect(within(row).getByRole("link", { name: "Site survey checklist" })).toHaveAttribute("href", "/library/f");
  });

  it("says a part of Your work couldn't be read, instead of saying nothing is due, and retries it", async () => {
    const reminders = vi.spyOn(api, "reminders").mockRejectedValue(new Error("offline"));
    open("/");
    const due = await screen.findByRole("region", { name: "Re-confirmations due" });
    expect(await within(due).findByText(/Couldn't read your re-confirmations\./)).toBeInTheDocument();
    expect(screen.queryByText(/no re-confirmations are due/)).not.toBeInTheDocument();
    reminders.mockResolvedValue({ overdue: 0, due_soon: 0, items: [] });
    await userEvent.click(within(due).getByRole("button", { name: "Try again" }));
    // Repaired and empty: it folds into the "Also clear" line, which takes focus.
    const clear = await screen.findByText(/no re-confirmations are due/);
    await waitFor(() => expect(clear).toHaveFocus());
  });

  it("opens Help beside the page, with the four parts, and hands focus back on Esc", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "Your work" });
    const help = screen.getByRole("button", { name: "Help" });
    await userEvent.click(help);
    for (const part of ["Your work", "Keyboard shortcuts", "Terms on this page", "Ask the knowledge team"]) {
      expect(screen.getByRole("heading", { level: 3, name: part })).toBeInTheDocument();
    }
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { level: 3, name: "Terms on this page" })).not.toBeInTheDocument();
    expect(help).toHaveFocus();
  });

  it("shows the failed read in Jobs with its cause and the fix", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "Your work" });
    await userEvent.click(screen.getByRole("button", { name: /Jobs/ }));
    const jobs = screen.getByRole("list", { name: "Jobs" });
    expect(jobs).toHaveTextContent("Needs attention");
    expect(jobs).toHaveTextContent("Row 2 is short.");
    expect(within(jobs).getByRole("link", { name: "Upload a new version: Site survey checklist" })).toHaveAttribute("href", "/library/f");
  });

  it("keeps page-wide shortcuts off until the person turns them on in Account (WCAG 2.1.4)", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "Your work" });
    await userEvent.keyboard("?");
    expect(screen.queryByRole("heading", { level: 2, name: "Help" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Account: Amina Owner" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Page-wide keyboard shortcuts/ }));
    expect(screen.getByText("Keyboard shortcuts on. Saved.")).toHaveAttribute("role", "status");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("?");
    expect(screen.getByRole("heading", { level: 2, name: "Help" })).toBeInTheDocument();
  });

  it("hands focus back to the button pressed last when switching panels", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "Your work" });
    await userEvent.click(screen.getByRole("button", { name: /Jobs/ }));
    const help = screen.getByRole("button", { name: "Help" });
    await userEvent.click(help);
    expect(screen.getByRole("heading", { level: 2, name: "Help" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(help).toHaveFocus();
  });

  it("opens Help at its shortcuts from the address", async () => {
    open("/?help=shortcuts");
    await screen.findByRole("heading", { level: 1, name: "Your work" });
    expect(await screen.findByRole("heading", { level: 3, name: "Keyboard shortcuts" })).toHaveFocus();
  });

  it("calls nothing but reads on load", async () => {
    const reads = new Set(["libraryDocuments", "releases", "activeRelease", "organisation", "reminders", "suggestions"]);
    const methods = api as unknown as Record<string, unknown>;
    const writes = Object.keys(methods)
      .filter((key) => typeof methods[key] === "function" && !reads.has(key))
      .map((key) => vi.spyOn(methods as Record<string, (...args: unknown[]) => unknown>, key));
    open("/");
    await screen.findByRole("region", { name: /Needs attention/ });
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
  });

  it("switches the offline persona from Account", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "Your work" });
    await userEvent.click(screen.getByRole("button", { name: "Account: Amina Owner" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Persona/ }), "fake-reviewer");
    expect(auth.switchFakeActor).toHaveBeenCalledWith("fake-reviewer");
  });
});
