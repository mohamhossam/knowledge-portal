import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { type SearchGroup, SearchDialog, SearchTrigger } from "./search";
import { checkAxeAfterEach } from "../../test/axe";

checkAxeAfterEach();

const GROUPS: SearchGroup[] = [
  { id: "documents", label: "Documents", hits: [{ id: "d1", href: "/library/d1", title: "XGPON coverage rules", detail: "Document" }] },
  { id: "systems", label: "Systems", note: "loading…", hits: [{ id: "s1", href: "/architecture/systems/s1", title: "Billing gateway" }, { id: "s2", href: "/architecture/systems/s2", title: "Order hub" }] },
];

function Harness({ onOpen }: { onOpen: (href: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <div className="ds-root">
      <SearchTrigger label="Search" expanded={open} onClick={() => setOpen(true)} />
      <SearchDialog
        open={open}
        onClose={() => setOpen(false)}
        label="Search the library and catalogue"
        query={query}
        onQuery={setQuery}
        groups={query ? GROUPS : []}
        status={query ? "3 matches" : ""}
        hint="Find a document or a system."
        onOpen={(hit) => {
          setOpen(false);
          onOpen(hit.href);
        }}
      />
    </div>
  );
}

describe("SearchDialog", () => {
  it("opens on its field, moves through every group with the arrows, and opens the marked result", async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /Search/ }));
    const field = screen.getByRole("combobox", { name: "Search the library and catalogue" });
    expect(field).toHaveFocus();
    expect(screen.getByText("Find a document or a system.")).toBeInTheDocument();

    await userEvent.type(field, "b");
    expect(screen.getByRole("group", { name: "Systems · loading…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /XGPON/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    const billing = screen.getByRole("option", { name: "Billing gateway" });
    expect(billing).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", billing.id);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("option", { name: "Order hub" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("status")).toHaveTextContent("3 matches");
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("/architecture/systems/s2");
  });

  it("closes on Esc and hands focus back to what opened it", async () => {
    render(<Harness onOpen={() => {}} />);
    const trigger = screen.getByRole("button", { name: /Search/ });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "Close search the library and catalogue" }));
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
