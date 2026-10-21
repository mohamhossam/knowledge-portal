import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { CatalogueSystem, Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { blankSystem } from "./drafting";
import { Retired } from "./Retired";
import { SystemEditor } from "./SystemEditor";

const RELEASE = { ...EXPLORED, revision: 3, status: "draft", documents: [] } as unknown as Release;

describe("a retired system or concept (ADR-0121)", () => {
  it("says it is retired in words, with what replaced it as a link", () => {
    render(
      <MemoryRouter>
        <Retired successor={{ name: "Netcracker CSRD", href: "/architecture/systems/nc-csrd" }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Netcracker CSRD" })).toHaveAttribute("href", "/architecture/systems/nc-csrd");
  });

  it("says only that it is retired when nothing replaced it", () => {
    render(<MemoryRouter><Retired /></MemoryRouter>);
    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("retiring a system by hand", () => {
  function Editing({ start }: { start: CatalogueSystem }) {
    const [value, setValue] = useState(start);
    return (
      <>
        <SystemEditor value={value} onChange={setValue} release={RELEASE} />
        <output data-testid="value">{JSON.stringify({ deprecated: value.deprecated, replaced_by: value.replaced_by ?? null })}</output>
      </>
    );
  }
  const [first, second] = RELEASE.systems;

  it("asks what replaces it once it is retired, offering only systems in service, and forgets it when kept", () => {
    render(<Editing start={{ ...blankSystem(), ...first!, deprecated: false }} />);
    expect(screen.queryByLabelText("Replaced by")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Retired: still readable, never matched again"));
    const replacedBy = screen.getByLabelText("Replaced by");
    const options = [...(replacedBy as HTMLSelectElement).options].map((item) => item.value);
    expect(options).not.toContain(first!.id);
    fireEvent.change(replacedBy, { target: { value: second!.id } });
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify({ deprecated: true, replaced_by: second!.id }));

    fireEvent.click(screen.getByLabelText("Retired: still readable, never matched again"));
    expect(screen.getByTestId("value")).toHaveTextContent(JSON.stringify({ deprecated: false, replaced_by: null }));
  });
});
