import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Draft, Row } from "./model";
import { type Focus, PassageTable } from "./PassageTable";

const rows: Row[] = [1, 2, 3].map((n) => ({
  key: `b${n}`,
  ordinal: n,
  where: `Line ${n}`,
  block: { id: `b${n}`, ordinal: n, text: `Passage ${n}`, label: `Line ${n}`, section_path: [], kind: "paragraph", content_fingerprint: `f${n}` } as never,
  basis: `Passage ${n}`,
  draft: { text: `Passage ${n}`, included: true, reason: "" },
  change: "same",
  warnings: [],
  blocking: false,
}));

function Harness({ shown = 3 }: { shown?: number }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(Object.fromEntries(rows.map((row) => [row.key, row.draft!])));
  const [limit, setLimit] = useState(shown);
  const current = rows.map((row) => {
    const draft = drafts[row.key]!;
    return { ...row, draft, change: draft.included ? "same" : "excluded" } as Row;
  });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <PassageTable
        documentId="doc"
        versionId="v1"
        versionNumber={1}
        rows={current}
        shown={limit}
        onMore={() => setLimit((value) => value + 1)}
        basisLabel="As extracted"
        workingLabel="Reviewed"
        focus={focus}
        onFocus={setFocus}
        onChange={(key, patch) => setDrafts((all) => ({ ...all, [key]: { ...all[key]!, ...patch } }))}
      />
    </QueryClientProvider>
  );
}

const row = (n: number) => screen.getByRole("rowheader", { name: String(n) }).closest("tr")!;

describe("PassageTable keyboard review", () => {
  it("moves with j and k, and opens with Enter", () => {
    render(<Harness />);
    act(() => row(1).focus());
    fireEvent.keyDown(row(1), { key: "j" });
    expect(document.activeElement).toBe(row(2));
    fireEvent.keyDown(row(2), { key: "k" });
    expect(document.activeElement).toBe(row(1));
    fireEvent.keyDown(row(1), { key: "Enter" });
    expect(row(1)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Text to publish")).toHaveValue("Passage 1");
  });

  it("excludes with x, asks for the reason, and closes back to the row with Esc", () => {
    render(<Harness />);
    act(() => row(2).focus());
    fireEvent.keyDown(row(2), { key: "x" });
    const reason = screen.getByLabelText("Why it is excluded");
    expect(reason).toHaveFocus();
    fireEvent.change(reason, { target: { value: "Duplicate of line 1" } });
    fireEvent.keyDown(reason, { key: "Escape" });
    expect(row(2)).toHaveAttribute("aria-expanded", "false");
    expect(row(2)).toHaveFocus();
    expect(row(2)).toHaveTextContent("Excluded: Duplicate of line 1");
    fireEvent.keyDown(row(2), { key: "i" });
    expect(row(2)).toHaveTextContent("Kept");
  });

  it("ignores keys typed into the text, and loads more rows when moving past the last one shown", () => {
    render(<Harness shown={2} />);
    expect(screen.getByText(/Showing 2 of 3 passages/)).toBeInTheDocument();
    act(() => row(2).focus());
    fireEvent.keyDown(row(2), { key: "e" });
    const text = screen.getByLabelText("Text to publish");
    expect(text).toHaveFocus();
    fireEvent.keyDown(text, { key: "j" });
    expect(text).toHaveFocus();
    fireEvent.keyDown(text, { key: "Escape" });
    fireEvent.keyDown(row(2), { key: "j" });
    expect(row(3)).toHaveFocus();
  });
});
