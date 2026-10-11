import { render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStickySize } from "../hooks";

import { KeysHint } from "./data";
import { Facts, Lines } from "./layout";
import { checkAxeAfterEach } from "../../test/axe";

// Pieces promoted from the hi-fi prototype in Phase 8 (area 2, Library).
checkAxeAfterEach();

describe("Facts", () => {
  it("pairs each label with its value in a description list", () => {
    render(<Facts items={[["Owner", "Amina Owner"], ["Newest version", <>2 · <bdi>matrix.xlsx</bdi></>]]} />);
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(["Owner", "Newest version"]);
    expect(screen.getAllByRole("definition")[1]).toHaveTextContent("2 · matrix.xlsx");
  });
});

describe("Lines", () => {
  it("is a labelled list, one item per line", () => {
    render(<Lines label="Requirements that cite it"><li>Fibre bundle order</li><li>Address check</li></Lines>);
    expect(within(screen.getByRole("list", { name: "Requirements that cite it" })).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("KeysHint", () => {
  it("says each key as its own key, and links to every shortcut", () => {
    const { container } = render(
      <KeysHint keys={[{ keys: ["↑", "↓", "j", "k"], does: "move" }, { keys: ["Ctrl+Enter"], does: "save" }]} moreHref="?help=shortcuts" />,
    );
    expect(Array.from(container.querySelectorAll("kbd")).map((kbd) => kbd.textContent)).toEqual(["↑", "↓", "j", "k", "Ctrl+Enter"]);
    expect(screen.getByText(/move/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All shortcuts" })).toHaveAttribute("href", "?help=shortcuts");
  });
});

describe("useStickySize", () => {
  afterEach(() => vi.unstubAllGlobals());

  function Bar({ height }: { height: number }) {
    const ref = useRef<HTMLDivElement>(null);
    useStickySize(ref, "--sticky-bottom");
    return <div style={{ position: "sticky" }} ref={(element) => { ref.current = element; if (element) element.getBoundingClientRect = () => ({ height } as DOMRect); }} />;
  }

  it("publishes the tallest of the regions sharing a variable, and keeps it when one of them leaves", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    const variable = () => document.documentElement.style.getPropertyValue("--sticky-bottom");
    const { rerender, unmount } = render(<><Bar height={56} /><Bar height={40} /></>);
    expect(variable()).toBe("56px");
    // The selection bar goes; the save bar is still there and still measured.
    rerender(<><Bar height={56} /></>);
    expect(variable()).toBe("56px");
    unmount();
    expect(variable()).toBe("");
  });

  it("counts a region that doesn't stick (400% zoom) as 0", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
    function Static() {
      const ref = useRef<HTMLDivElement>(null);
      useStickySize(ref, "--sticky-bottom");
      return <div ref={(element) => { ref.current = element; if (element) element.getBoundingClientRect = () => ({ height: 140 } as DOMRect); }} />;
    }
    render(<Static />);
    expect(document.documentElement.style.getPropertyValue("--sticky-bottom")).toBe("");
  });
});
