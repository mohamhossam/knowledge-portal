import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

// The store is module state: each test loads a fresh copy.
async function load() {
  vi.resetModules();
  return import("./preferences");
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("usePreferences", () => {
  it("reads storage once per preference, however often it renders", async () => {
    window.localStorage.setItem("knowledge-portal.density", "compact");
    const { usePreferences } = await load();
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    function Show() {
      const { density, shortcuts } = usePreferences();
      return <p>{density} {shortcuts ? "on" : "off"}</p>;
    }
    const { rerender } = render(<Show />);
    rerender(<Show />);
    rerender(<Show />);
    expect(screen.getByText("compact off")).toBeInTheDocument();
    expect(getItem.mock.calls.filter(([key]) => key === "knowledge-portal.density")).toHaveLength(1);
    expect(getItem.mock.calls.filter(([key]) => key === "knowledge-portal.shortcuts")).toHaveLength(1);
  });

  it("listens to other tabs once, for every reader, and only while someone reads", async () => {
    const { usePreferences } = await load();
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    function Show({ name }: { name: string }) {
      const { density } = usePreferences();
      return <p>{name} {density}</p>;
    }
    const { unmount } = render(<><Show name="a" /><Show name="b" /><Show name="c" /></>);
    expect(add.mock.calls.filter(([type]) => type === "storage")).toHaveLength(1);

    // Another tab chooses compact: every reader follows.
    window.localStorage.setItem("knowledge-portal.density", "compact");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "knowledge-portal.density", newValue: "compact" }));
    });
    expect(screen.getByText("a compact")).toBeInTheDocument();
    expect(screen.getByText("c compact")).toBeInTheDocument();

    unmount();
    expect(remove.mock.calls.filter(([type]) => type === "storage")).toHaveLength(1);
  });

  it("saves a choice and shows it at once, even with storage blocked", async () => {
    const { usePreferences } = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    let set: (on: boolean) => void = () => {};
    function Show() {
      const { shortcuts, setShortcuts } = usePreferences();
      set = setShortcuts;
      return <p>{shortcuts ? "on" : "off"}</p>;
    }
    render(<Show />);
    expect(screen.getByText("off")).toBeInTheDocument();
    act(() => set(true));
    expect(screen.getByText("on")).toBeInTheDocument();
  });
});
