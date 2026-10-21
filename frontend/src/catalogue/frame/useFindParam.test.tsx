import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentType, lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFindParam } from "./useFindParam";

function List() {
  const [find, setFind] = useFindParam();
  return (
    <>
      <input aria-label="Find a system" value={find} onChange={(event) => setFind(event.target.value)} />
      <Link to={`/systems/cwom?find=${find}`}>CWOM</Link>
    </>
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
}

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("a find field kept in the address", () => {
  it("writes the address a moment after typing stops", () => {
    vi.useFakeTimers();
    render(
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<List />} />
        </Routes>
        <Where />
      </BrowserRouter>,
    );
    fireEvent.change(screen.getByLabelText("Find a system"), { target: { value: "CWOM" } });
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId("where")).toHaveTextContent("/?find=CWOM");
  });

  it("never pulls the reader back when a result is opened before the address is written", async () => {
    vi.useFakeTimers();
    // The record loads as its own chunk, as in the app: while it loads the list stays on screen.
    let loaded: () => void = () => {};
    const Record = lazy(
      () => new Promise<{ default: ComponentType }>((resolve) => {
        loaded = () => resolve({ default: () => <p>A system's record</p> });
      }),
    );
    render(
      <BrowserRouter>
        <Suspense fallback={<p>Loading</p>}>
          <Routes>
            <Route path="/" element={<List />} />
            <Route path="/systems/:id" element={<Record />} />
          </Routes>
        </Suspense>
        <Where />
      </BrowserRouter>,
    );
    fireEvent.change(screen.getByLabelText("Find a system"), { target: { value: "CWOM" } });
    // Opened at once; the moment passes while the record is still loading.
    fireEvent.click(screen.getByRole("link", { name: "CWOM" }));
    act(() => vi.advanceTimersByTime(300));
    vi.useRealTimers();
    await act(async () => loaded());
    expect(window.location.pathname).toBe("/systems/cwom");
    expect(await screen.findByText("A system's record")).toBeInTheDocument();
  });
});
