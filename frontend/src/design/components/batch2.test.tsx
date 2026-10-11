import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./actions";
import { AppShell, Breadcrumbs, MastheadButton, PageHeader, Pagination, Section, SplitPane, StateLine, StickyFooter, SubNav, Tabs, Toolbar } from "./layout";
import { Dialog, Drawer, HelpContent, ShortcutHelp, Toggletip } from "./overlays";
import { checkAxeAfterEach } from "../../test/axe";

// Every test's rendered state is also checked by axe (Phase 7).
checkAxeAfterEach();

const NAV = [
  { href: "/", label: "Your work", current: false, count: 6, countLabel: "need you" },
  { href: "/library", label: "Library", current: true },
  { href: "/architecture", label: "Catalogue" },
];

describe("AppShell", () => {
  it("offers skip links first, labels its regions and marks the current area", async () => {
    render(
      <AppShell homeHref="/" navigation={NAV} outbound={{ href: "/req", label: "Requirement AI" }} utilities={<MastheadButton icon="?" label="Help" onClick={() => {}} />} locationKey="/library">
        <PageHeader title="Library">x</PageHeader>
      </AppShell>,
    );
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Areas" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Your work 6 need you" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Requirement AI (leaves the knowledge portal)" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Etisalat" })).toBeInTheDocument();
  });

  it("moves focus to the new page's h1 when the location changes (§1)", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(<AppShell homeHref="/" navigation={NAV} locationKey="/a"><PageHeader title="A">a</PageHeader></AppShell>);
    rerender(<AppShell homeHref="/" navigation={NAV} locationKey="/b"><PageHeader title="B">b</PageHeader></AppShell>);
    expect(screen.getByRole("heading", { level: 1, name: "B" })).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith(0, 0);
    scroll.mockRestore();
  });

  it("focuses the h1 when it arrives after the page has loaded (skeleton first)", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(<AppShell homeHref="/" navigation={NAV} locationKey="/a"><PageHeader title="A">a</PageHeader></AppShell>);
    rerender(<AppShell homeHref="/" navigation={NAV} locationKey="/b"><p>Loading…</p></AppShell>);
    rerender(<AppShell homeHref="/" navigation={NAV} locationKey="/b"><PageHeader title="B">b</PageHeader></AppShell>);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "B" })).toHaveFocus());
    scroll.mockRestore();
  });

  it("focuses the arriving h1 when focus is still on the rail link that opened the page (a lazy page)", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(<AppShell homeHref="/" navigation={NAV} locationKey="/a"><PageHeader title="A">a</PageHeader></AppShell>);
    screen.getByRole("link", { name: "Library" }).focus();
    rerender(<AppShell homeHref="/" navigation={NAV} locationKey="/b"><p>Opening the page…</p></AppShell>);
    expect(screen.getByRole("link", { name: "Library" })).toHaveFocus();
    rerender(<AppShell homeHref="/" navigation={NAV} locationKey="/b"><PageHeader title="B">b</PageHeader></AppShell>);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "B" })).toHaveFocus());
    scroll.mockRestore();
  });

  it("drops the rail for readers", () => {
    render(<AppShell homeHref="/" reader navigation={NAV}><p>Explorer</p></AppShell>);
    expect(screen.queryByRole("navigation", { name: "Areas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Skip to navigation" })).not.toBeInTheDocument();
  });
});

describe("page structure", () => {
  it("sets the document title from the page header", () => {
    render(<PageHeader title="Your work" lead="3 things need you." />);
    expect(document.title).toBe("Your work · Knowledge portal");
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("tabindex", "-1");
  });

  it("announces a state line as status", () => {
    render(<StateLine tone="proof">You're reading a replaced version.</StateLine>);
    expect(screen.getByRole("status")).toHaveTextContent("replaced version");
  });

  it("marks the last breadcrumb as the current page", () => {
    render(<Breadcrumbs items={[{ href: "/library", label: "Library" }, { label: "Product eligibility matrix" }]} />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Product eligibility matrix").closest("[aria-current]")).toHaveAttribute("aria-current", "page");
  });

  it("marks the current sub-page in a labelled nav", () => {
    render(<SubNav label="Document" items={[{ href: "/r", label: "Review", current: true }, { href: "/c", label: "Cited by" }]} />);
    expect(screen.getByRole("navigation", { name: "Document" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
  });

  it("moves between tabs with the arrow keys and keeps one tab stop", async () => {
    function T() {
      const [tab, setTab] = useState<"a" | "b">("a");
      return <Tabs label="View" tabs={[{ id: "a", label: "Changes" }, { id: "b", label: "Check" }]} selected={tab} onSelect={setTab}>{tab}</Tabs>;
    }
    render(<T />);
    const first = screen.getByRole("tab", { name: "Changes" });
    expect(screen.getByRole("tab", { name: "Check" })).toHaveAttribute("tabindex", "-1");
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Check" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Check" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("b");
  });

  it("roves a toolbar with the arrow keys", async () => {
    render(<Toolbar label="Bulk actions"><Button>Exclude</Button><Button>Include</Button></Toolbar>);
    screen.getByRole("button", { name: "Exclude" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Include" })).toHaveFocus();
  });

  it("labels the split pane", () => {
    render(<SplitPane list={<p>rows</p>} pane={<p>detail</p>} paneLabel="Passage 1" />);
    expect(screen.getByRole("complementary", { name: "Passage 1" })).toHaveTextContent("detail");
  });

  it("marks the current page and steps", async () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pages={9} onPage={onPage} />);
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it("labels a section by its heading", () => {
    render(<Section title="Needs you" count={3}>…</Section>);
    expect(screen.getByRole("region", { name: "Needs you 3" })).toBeInTheDocument();
  });
});

describe("overlays", () => {
  it("opens a modal dialog on the opener's word and returns focus when closed (§4)", async () => {
    function D() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Save</button>
          <Dialog open={open} title="Someone changed this draft" onClose={() => setOpen(false)} actions={<Button onClick={() => setOpen(false)}>Reload</Button>}>
            Reload to see their change; your decisions stay listed.
          </Dialog>
        </>
      );
    }
    render(<D />);
    const opener = screen.getByRole("button", { name: "Save" });
    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Someone changed this draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(opener).toHaveFocus();
  });

  it("closes a drawer with Escape", async () => {
    const onClose = vi.fn();
    render(<Drawer title="Help" onClose={onClose}><button type="button">x</button></Drawer>);
    screen.getByRole("button", { name: "x" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole("complementary", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Help" })).toBeInTheDocument();
  });

  it("opens a toggletip by press, not hover, and closes it with Escape", async () => {
    render(<Toggletip label="Search index for tables">A second index that keeps table rows together.</Toggletip>);
    const button = screen.getByRole("button", { name: "About Search index for tables" });
    await userEvent.hover(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent("keeps table rows together");
    await userEvent.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("lists shortcuts and lets the page-wide ones be turned off (WCAG 2.1.4)", async () => {
    const onToggle = vi.fn();
    render(<ShortcutHelp enabled widget={[{ title: "Review", shortcuts: [{ keys: "x", does: "Exclude" }] }]} global={[{ keys: "?", does: "Open help" }]} onToggle={onToggle} />);
    expect(screen.getByText("Exclude")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn them off" }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("keeps help in four parts, in order", () => {
    render(<HelpContent page={{ title: "Reviewing a document", body: "Move through the passages." }} terms={[{ term: "Passage", meaning: "One reviewed unit." }]} contact={<p>Contact to be configured.</p>} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Reviewing a document", "Terms on this page", "Ask the knowledge team"]);
  });
});

describe("StickyFooter", () => {
  it("is a labelled region that holds the page's bottom actions", () => {
    render(<StickyFooter label="Draft progress"><Button variant="primary">Save and continue</Button></StickyFooter>);
    const region = screen.getByRole("region", { name: "Draft progress" });
    expect(region).toHaveClass("ds-stickyfoot");
    expect(region).toContainElement(screen.getByRole("button", { name: "Save and continue" }));
  });
});
