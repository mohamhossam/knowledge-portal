import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkAxeAfterEach } from "../test/axe";
import { ErrorBoundary, PageFailed } from "./ErrorBoundary";
import { isStaleChunk } from "./failure";

checkAxeAfterEach();

// React reports a caught render error on the console; the tests expect it.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

let broken = true;
function Fragile() {
  if (broken) throw new Error("Cannot read the passage list");
  return <p>The page, working</p>;
}

function Boundary({ resetKey, reload }: { resetKey?: string; reload?: () => void }) {
  return (
    <ErrorBoundary resetKey={resetKey} fallback={(error, retry) => <PageFailed error={error} onRetry={retry} reload={reload} />}>
      <Fragile />
    </ErrorBoundary>
  );
}

describe("a page that fails", () => {
  beforeEach(() => {
    broken = true;
  });

  it("says so in place of the page, takes focus, and tries again on request", async () => {
    render(<Boundary />);

    const failed = screen.getByRole("alert", { name: "This page stopped working" });
    expect(failed).toHaveFocus();
    expect(failed).toHaveTextContent("What you have saved is safe.");
    expect(failed).toHaveTextContent("The error said: Cannot read the passage list");

    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("The page, working")).toBeInTheDocument();
  });

  it("offers a reload beside trying again", async () => {
    const reload = vi.fn();
    render(<Boundary reload={reload} />);

    await userEvent.click(screen.getByRole("button", { name: "Reload the page" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("starts afresh when the address changes", () => {
    const { rerender } = render(<Boundary resetKey="/library/d" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    broken = false;
    rerender(<Boundary resetKey="/" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("The page, working")).toBeInTheDocument();
  });

  it("asks only for a reload when the page's code went with an update", async () => {
    const reload = vi.fn();
    function Gone(): never {
      throw new TypeError("Failed to fetch dynamically imported module: https://portal/knowledge/assets/pages-old.js");
    }
    render(
      <ErrorBoundary fallback={(error, retry) => <PageFailed error={error} onRetry={retry} reload={reload} />}>
        <Gone />
      </ErrorBoundary>,
    );

    const failed = screen.getByRole("alert", { name: "A newer portal is ready" });
    expect(failed).toHaveTextContent("The portal was updated while this page was open");
    expect(failed).not.toHaveTextContent("The error said");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reload the page" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("keeps working children as they are", () => {
    broken = false;
    function Counter() {
      const [n, setN] = useState(0);
      return <button type="button" onClick={() => setN(n + 1)}>Clicked {n}</button>;
    }
    render(<ErrorBoundary fallback={() => <p>failed</p>}><Counter /></ErrorBoundary>);
    expect(screen.getByRole("button", { name: "Clicked 0" })).toBeInTheDocument();
  });
});

describe("isStaleChunk", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://portal/assets/a.js", // Chromium
    "error loading dynamically imported module: https://portal/assets/a.js", // Firefox
    "Importing a module script failed.", // Safari
  ])("knows a chunk gone with an update: %s", (message) => {
    expect(isStaleChunk(new TypeError(message))).toBe(true);
  });

  it("leaves every other failure to be tried again", () => {
    expect(isStaleChunk(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunk("a string")).toBe(false);
  });
});
