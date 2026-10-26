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

function Broken(): never {
  throw new Error("The page broke");
}

function open(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<HomePage />} />
              <Route path="explorer/older" element={<h1>An older page</h1>} />
              <Route path="library/:documentId" element={<h1>A library document</h1>} />
              <Route path="broken" element={<Broken />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("the shell", () => {
  it("keeps its navigation when a page fails, and leaving the page clears the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    open("/broken");

    expect(await screen.findByRole("alert", { name: "This page stopped working" })).toHaveTextContent("The page broke");
    const areas = screen.getByRole("navigation", { name: "Areas" });
    await userEvent.click(within(areas).getByRole("link", { name: /To do/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "To do" })).toBeInTheDocument();
    expect(screen.queryByRole("alert", { name: "This page stopped working" })).not.toBeInTheDocument();
  });

  it("offers the same utilities, skip links and areas on every page", async () => {
    for (const [path, title] of [["/", "To do"], ["/explorer/older", "An older page"]] as const) {
      open(path);
      await screen.findByRole("heading", { level: 1, name: title });
      const banner = screen.getByRole("banner");
      await within(banner).findByRole("button", { name: "Jobs 1 active or needing attention" });
      const [search, jobs, help, account] = within(banner).getAllByRole("button");
      expect(search).toHaveAccessibleName("Search");
      expect(within(banner).getByRole("search", { name: "Portal" })).toContainElement(search!);
      expect(jobs).toHaveAccessibleName("Jobs 1 active or needing attention");
      expect(help).toHaveAccessibleName("Help");
      expect(account).toHaveAccessibleName("Account: Amina Owner");
      expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
      expect(within(screen.getByRole("navigation", { name: "Areas" })).getByRole("link", { name: /To do/ })).toHaveAccessibleName("To do 1 need you");
      document.body.innerHTML = "";
    }
  });

  it("opens one catalogue from Catalogue, and names the redesign lab apart from it", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "To do" });
    const areas = screen.getByRole("navigation", { name: "Areas" });
    expect(within(areas).getByRole("link", { name: "Catalogue" })).toHaveAttribute("href", "/architecture");
    // Tests run as a development build, where the lab is built in.
    expect(within(areas).getByRole("link", { name: "Catalogue lab" })).toHaveAttribute("href", "/design-lab/catalogue");
  });

  it("ranks the failed read first on To do, and the sidebar counts the same entries", async () => {
    open("/");
    const attention = await screen.findByRole("region", { name: /Needs attention/ });
    expect(attention).toHaveTextContent("Couldn't read");
    expect(attention).toHaveTextContent("Row 2 is short.");
    const task = within(attention).getByRole("heading", { level: 3, name: "Site survey checklist" });
    expect(within(task).getByRole("link", { name: "Site survey checklist" })).toHaveAttribute("href", "/library/f");
  });

  it("acts on the failed read from its row: tries reading again, says so, and moves focus to what it said (area 2)", async () => {
    const retry = vi.spyOn(api, "retry").mockResolvedValue({ ...failed, versions: [{ ...failed.versions[0]!, stage: "queued", error: null }] } as LibraryDocument);
    open("/");
    const attention = await screen.findByRole("region", { name: /Needs attention/ });
    expect(within(attention).getByRole("button", { name: "Upload a new version: Site survey checklist" })).toBeInTheDocument();
    await userEvent.click(within(attention).getByRole("button", { name: "Try reading again: Site survey checklist" }));
    expect(retry).toHaveBeenCalledWith("f", "f-v1", 1);
    const said = await screen.findByText("Reading 'Site survey checklist' again. Jobs shows its progress.");
    await waitFor(() => expect(said).toHaveFocus());
  });

  it("says a part of To do couldn't be read, instead of saying nothing is due, and retries it", async () => {
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
    await screen.findByRole("heading", { level: 1, name: "To do" });
    const help = screen.getByRole("button", { name: "Help" });
    await userEvent.click(help);
    for (const part of ["To do", "Keyboard shortcuts", "Terms on this page", "Ask the knowledge team"]) {
      expect(screen.getByRole("heading", { level: 3, name: part })).toBeInTheDocument();
    }
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { level: 3, name: "Terms on this page" })).not.toBeInTheDocument();
    expect(help).toHaveFocus();
  });

  it("shows the failed read in Jobs with its cause and the fix", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "To do" });
    await userEvent.click(screen.getByRole("button", { name: /Jobs/ }));
    const jobs = screen.getByRole("list", { name: "Jobs" });
    expect(jobs).toHaveTextContent("Needs attention");
    expect(jobs).toHaveTextContent("Row 2 is short.");
    expect(within(jobs).getByRole("link", { name: "Upload a new version: Site survey checklist" })).toHaveAttribute("href", "/library/f");
  });

  it("offers Try again on a failed read and Stop on a running one in Jobs, with the attempt (area 2)", async () => {
    const running = {
      ...failed, id: "r", title: "Fault escalation matrix",
      versions: [{ id: "r-v1", number: 1, stage: "extracting", attempt: 2, uploaded_at: new Date().toISOString(), uploaded_by: amina, error: null }],
    } as unknown as LibraryDocument;
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([failed, running]);
    const retry = vi.spyOn(api, "retry").mockResolvedValue(failed);
    const cancel = vi.spyOn(api, "cancel").mockResolvedValue(running);
    open("/");
    await screen.findByRole("heading", { level: 1, name: "To do" });
    await userEvent.click(screen.getByRole("button", { name: /Jobs/ }));
    const jobs = screen.getByRole("list", { name: "Jobs" });
    expect(jobs).toHaveTextContent("Attempt 2 of 3");
    await userEvent.click(within(jobs).getByRole("button", { name: "Stop: Reading Fault escalation matrix" }));
    expect(cancel).toHaveBeenCalledWith("r", "r-v1", 1);
    await userEvent.click(within(jobs).getByRole("button", { name: "Try reading again: Reading Site survey checklist" }));
    expect(retry).toHaveBeenCalledWith("f", "f-v1", 1);
    expect(await screen.findByText("Reading 'Site survey checklist' again. Jobs shows its progress.")).toBeInTheDocument();
  });

  it("keeps page-wide shortcuts off until the person turns them on in Account (WCAG 2.1.4)", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "To do" });
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
    await screen.findByRole("heading", { level: 1, name: "To do" });
    await userEvent.click(screen.getByRole("button", { name: /Jobs/ }));
    const help = screen.getByRole("button", { name: "Help" });
    await userEvent.click(help);
    expect(screen.getByRole("heading", { level: 2, name: "Help" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(help).toHaveFocus();
  });

  it("opens Help at its shortcuts from the address", async () => {
    open("/?help=shortcuts");
    await screen.findByRole("heading", { level: 1, name: "To do" });
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
    await screen.findByRole("heading", { level: 1, name: "To do" });
    await userEvent.click(screen.getByRole("button", { name: "Account: Amina Owner" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Persona/ }), "fake-reviewer");
    expect(auth.switchFakeActor).toHaveBeenCalledWith("fake-reviewer");
  });

  it("opens search with Ctrl+K from anywhere, finds a document by its name, and opens it", async () => {
    const search = vi.spyOn(api, "search").mockResolvedValue([]);
    open("/");
    await screen.findByRole("heading", { level: 1, name: "To do" });
    await userEvent.keyboard("{Control>}k{/Control}");
    const field = screen.getByRole("combobox", { name: "Search the library and catalogue" });
    expect(field).toHaveFocus();
    await userEvent.type(field, "survey");
    const hit = await screen.findByRole("option", { name: /Site survey checklist/ });
    expect(hit).toHaveAttribute("aria-selected", "true");
    // Passages are searched by the service once typing pauses.
    await waitFor(() => expect(search).toHaveBeenCalledWith("survey"));
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "A library document" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-expanded", "false");
  });

  it("names the panel a masthead button opens, while it is open", async () => {
    open("/");
    await screen.findByRole("heading", { level: 1, name: "To do" });
    const help = screen.getByRole("button", { name: "Help" });
    expect(help).not.toHaveAttribute("aria-controls");
    await userEvent.click(help);
    const id = help.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toHaveAccessibleName("Help");
  });

  it("says a job's press is in progress, and ignores a second press (area 2)", async () => {
    const retry = vi.spyOn(api, "retry").mockReturnValue(new Promise<never>(() => {}));
    open("/");
    await screen.findByRole("heading", { level: 1, name: "To do" });
    await userEvent.click(screen.getByRole("button", { name: /Jobs/ }));
    const jobs = screen.getByRole("list", { name: "Jobs" });
    await userEvent.click(within(jobs).getByRole("button", { name: "Try reading again: Reading Site survey checklist" }));
    const busy = await within(jobs).findByRole("button", { name: "Trying again…: Reading Site survey checklist" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    await userEvent.click(busy);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("marks what began waiting since the last visit as new, in words, and keeps this visit for the next", async () => {
    window.localStorage.setItem("knowledge-portal.todo.last-visit", String(Date.parse("2026-09-15T00:00:00Z")));
    open("/");
    const attention = await screen.findByRole("region", { name: /Needs attention/ });
    // Uploaded on 1 October, after the last visit.
    expect(within(attention).getByText("New")).toHaveTextContent("New since your last visit");
    expect(screen.getByText(/1 new since your last visit\./)).toBeInTheDocument();
    expect(Number(window.localStorage.getItem("knowledge-portal.todo.last-visit"))).toBeGreaterThan(Date.parse("2026-10-01T00:00:00Z"));
  });

  it("finds in To do and orders it by waiting time, in the address", async () => {
    const other = { ...failed, id: "g", title: "Gateway runbook", versions: [{ ...failed.versions[0]!, id: "g-v1", uploaded_at: "2026-09-01T09:00:00Z" }] } as LibraryDocument;
    vi.spyOn(api, "libraryDocuments").mockResolvedValue([failed, other]);
    open("/");
    const attention = await screen.findByRole("region", { name: /Needs attention/ });
    const titles = () => within(attention).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    await waitFor(() => expect(titles()).toHaveLength(2));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Order" }), "newest");
    expect(titles()).toEqual(["Site survey checklist", "Gateway runbook"]);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Order" }), "oldest");
    expect(titles()).toEqual(["Gateway runbook", "Site survey checklist"]);
    await userEvent.type(screen.getByRole("searchbox", { name: "Find in To do" }), "survey");
    expect(titles()).toEqual(["Site survey checklist"]);
    await userEvent.clear(screen.getByRole("searchbox", { name: "Find in To do" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Find in To do" }), "nothing like it");
    expect(within(attention).getByText(/None of these match/)).toBeInTheDocument();
  });
});
