import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Release, SourceConfidence } from "../api/client";
import { Lines } from "../design/components";
import { checkAxeAfterEach } from "../test/axe";
import { catalogue } from "./catalogue";
import { EditPanel } from "./DraftEdits";
import { sourceRegister, SourcesContext } from "./governance";
import release from "./model/fixtures/smb-release.json";
import { asRelease } from "./model/sample";
import { JourneysPage } from "./JourneysPage";
import { OfferingsPage } from "./OfferingsPage";
import { SourceField, SurenessField } from "./SourceField";
import type { CatalogueContext } from "./useCatalogue";
import { landOn } from "./useRowTarget";
import { placeOf } from "./vocabularyProposals";

checkAxeAfterEach();

const RELEASE = asRelease(release);

function open(path: string, book: Release = RELEASE) {
  const context: CatalogueContext = { book: catalogue(book), base: "/architecture", inService: false, editable: false, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="offerings" element={<OfferingsPage />} />
            <Route path="offerings/:offeringId" element={<OfferingsPage />} />
            <Route path="journeys/:journeyId" element={<JourneysPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("a link to a place a value is written lands on its row", () => {
  it("names the hand-over by its call, in a channel its step is taken in, and the rule and the quality by theirs", () => {
    expect(placeOf({ field: "integration_open_api", owner_id: "bpp-new-activation", value: "x", item: "0" }, RELEASE).path).toBe(
      `journeys/bpp-new-activation?view=integrations&channel=b2b-web&row=${encodeURIComponent("10>10:bcc:Offer catalogue")}`,
    );
    expect(placeOf({ field: "rule_kind", owner_id: "bpp", value: "billing", item: "R10" }, RELEASE).path).toBe("offerings/bpp?tab=rules&row=R10");
    expect(placeOf({ field: "nfr_quality", owner_id: "bpp", value: "x", item: "Availability" }, RELEASE).path).toBe("offerings/bpp?tab=service&row=Availability");
  });

  it("opens an offering's rules at the rule a link names", async () => {
    open("/architecture/offerings/business-pro-plus?tab=rules&row=R10");
    const rule = await waitFor(() => {
      const found = document.querySelector('li[data-row-id="R10"]');
      expect(found).toHaveAttribute("aria-current", "location");
      return found;
    });
    expect(rule).toHaveFocus();
  });

  it("opens a journey's calls as their table at the hand-over a link names", async () => {
    const call = "10>10:bcc:Offer catalogue";
    open(`/architecture/journeys/bpp-new-activation?view=integrations&channel=b2b-web&row=${encodeURIComponent(call)}`);
    await waitFor(() => expect(document.querySelector(`tr[data-row-id="${CSS.escape(call)}"]`)).toHaveAttribute("aria-current", "location"), { timeout: 3000 });
  });

  it("steps from a retired portfolio node to the node that replaces it", async () => {
    const [first, second] = RELEASE.portfolio ?? [];
    const retired = { ...RELEASE, portfolio: [{ ...first!, deprecated: true, replaced_by: second!.id }, ...(RELEASE.portfolio ?? []).slice(1)] } as Release;
    open("/architecture/offerings", retired);
    const step = screen.getByRole("link", { name: new RegExp(second!.name) });
    fireEvent.click(step);
    const row = document.querySelector(`tr[data-row-id="${CSS.escape(second!.id)}"]`);
    await waitFor(() => expect(row).toHaveAttribute("aria-current", "location"));
    expect(row?.querySelector("th, td")).toHaveFocus();
  });

  it("marks a list's item as the place linked to, and focuses it, as a table's row", () => {
    render(
      <Lines label="Rules">
        <li data-row-id="R1">One</li>
        <li data-row-id="R2">Two</li>
      </Lines>,
    );
    const [first, second] = screen.getAllByRole("listitem");
    landOn(first!);
    landOn(second!);
    expect(second).toHaveAttribute("aria-current", "location");
    expect(first).not.toHaveAttribute("aria-current");
    expect(second).toHaveFocus();
  });
});

/** Three facts in one form, with no source registered yet. */
function ThreeFacts() {
  const [lines, setLines] = useState<(string | null)[]>([null, null, null]);
  return (
    <MemoryRouter>
      <SourcesContext.Provider value={sourceRegister({ sources: [], source_references: [] })}>
        <EditPanel title="Edit the facts" action="Save the facts" busy={false} problem={null} error={null} onSubmit={() => {}} onCancel={() => {}}>
          {lines.map((line, index) => (
            <fieldset key={index} aria-label={`Fact ${index + 1}`}>
              <SourceField value={line} onChange={(next) => setLines(lines.map((item, at) => (at === index ? next : item)))} />
            </fieldset>
          ))}
        </EditPanel>
      </SourcesContext.Provider>
    </MemoryRouter>
  );
}

describe("a form's source fields", () => {
  it("say once, under the form's title, that the draft registers no source", () => {
    render(<ThreeFacts />);
    expect(screen.getAllByText(/registers no source yet/)).toHaveLength(1);
    expect(within(screen.getByRole("group", { name: "Fact 1" })).queryByText(/registers no source yet/)).not.toBeInTheDocument();
  });

  it("ask how sure a source is once there is one, unavailable in its place before, and keep a value it holds", () => {
    function Sure({ source }: { source: string | null }) {
      const [value, setValue] = useState<SourceConfidence | null>(null);
      return <SurenessField source={source} value={value} onChange={setValue} />;
    }
    const { rerender } = render(<Sure source={null} />);
    const sure = screen.getByLabelText("How sure its source is");
    expect(sure).toHaveAttribute("aria-disabled", "true");
    expect(sure).toHaveAccessibleDescription("Name its source first.");
    fireEvent.change(sure, { target: { value: "inferred" } });
    expect(sure).toHaveValue("");
    rerender(<Sure source="SDD v2.3 · §4" />);
    expect(sure).not.toHaveAttribute("aria-disabled");
    fireEvent.change(sure, { target: { value: "inferred" } });
    rerender(<Sure source={null} />);
    // Still there to be cleared: the same control, so focus on it is never lost.
    expect(screen.getByLabelText("How sure its source is")).toBe(sure);
    expect(sure).toHaveValue("inferred");
    fireEvent.change(sure, { target: { value: "" } });
    expect(sure).toHaveValue("");
    expect(sure).toHaveAttribute("aria-disabled", "true");
  });
});
