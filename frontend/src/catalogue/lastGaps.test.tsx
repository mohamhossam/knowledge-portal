import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type CatalogueSystem, type Journey, type Offering, type Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { checkAxeAfterEach } from "../test/axe";
import { catalogue } from "./catalogue";
import { ChannelsEdit, ConnectionEdit } from "./DraftEdits";
import { systemChanges, systemProblem } from "./editing";
import { ConflictsEdit } from "./GovernanceEditor";
import { JourneyEditor } from "./JourneyEditor";
import { LifecycleEditor } from "./LifecycleEditor";
import { OfferingsPage } from "./OfferingsPage";
import { SystemEditor } from "./SystemEditor";
import { TrackingEditor } from "./TrackingEditor";
import type { CatalogueContext } from "./useCatalogue";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

/** The explorer's version as a draft, with a second offering to stand in for a retired one, and a dependency with its source. */
const RELEASE = {
  ...EXPLORED,
  revision: 5,
  status: "draft",
  documents: [],
  products: [...(EXPLORED.products ?? []), { ...EXPLORED.products![0]!, id: "bpp-2", name: "Business Pro Plus 2", lifecycle_notes: [], tracking: null, nfrs: [] }],
  relationships: [
    { source_system_id: "rtf", target_system_id: "cwom", kind: "calls_api", description: "Opens sub-orders.", source: "SDD §8", confidence: "confirmed", accepted: [] },
  ],
} as unknown as Release;
const OFFERING = RELEASE.products![0]!;

/** A catalogue page or edit, in the draft's context, at an address. */
function inDraft(element: ReactNode, path = "/architecture/here", route = "here") {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path={route} element={element} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const saved = <T,>(save: ReturnType<typeof vi.spyOn>, key: string) => (save.mock.calls[0]![1] as Record<string, T>)[key]!;

/** A source cited as written: the register in these tests holds none, so this is how one is named. */
function cite(scope: HTMLElement, text: string, label = "Source") {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value: "*elsewhere" } });
  fireEvent.change(within(scope).getByLabelText("The document, as cited"), { target: { value: text } });
}

describe("a dependency changed", () => {
  it("keeps where it comes from and how sure that is", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    const rtf = RELEASE.systems.find((system) => system.id === "rtf")!;
    inDraft(<ConnectionEdit system={rtf} connection={RELEASE.relationships[0]!} onDone={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/^For what/), { target: { value: "Opens and tracks sub-orders." } });
    fireEvent.click(screen.getByRole("button", { name: "Save the dependency" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved<Release["relationships"]>(save, "relationships")[0]).toMatchObject({
      description: "Opens and tracks sub-orders.", source: "SDD §8", confidence: "confirmed",
    });
  });
});

describe("an offering already in the draft", () => {
  it("is retired from its own edit, with what replaces it", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    inDraft(<OfferingsPage />, `/architecture/offerings/${OFFERING.id}`, "offerings/:offeringId");
    fireEvent.click(screen.getByRole("button", { name: "Edit what it is" }));
    fireEvent.click(screen.getByLabelText("Retired: still readable, never matched again"));
    fireEvent.change(screen.getByLabelText("Replaced by"), { target: { value: "bpp-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save what it is" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved<Offering[]>(save, "products").find((item) => item.id === OFFERING.id)).toMatchObject({ deprecated: true, replaced_by: "bpp-2" });
  });

  it("says where each non-functional requirement comes from", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    inDraft(<OfferingsPage />, `/architecture/offerings/${OFFERING.id}?tab=service`, "offerings/:offeringId");
    fireEvent.click(screen.getByRole("button", { name: "Edit the non-functional requirements" }));
    const availability = screen.getByRole("group", { name: /Availability/ });
    cite(availability, "NFR workbook, row 4");
    fireEvent.change(within(availability).getByLabelText("How sure its source is"), { target: { value: "confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the non-functional requirements" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved<Offering[]>(save, "products").find((item) => item.id === OFFERING.id)!.nfrs![0]).toMatchObject({
      quality: "Availability", source: "NFR workbook, row 4", confidence: "confirmed",
    });
  });
});

/** A controlled editor holding its value, saying what it holds. */
function Holding<T>({ start, children }: { start: T; children: (value: T, set: (value: T) => void) => ReactNode }) {
  const [value, setValue] = useState(start);
  return (
    <MemoryRouter>
      <form aria-label="Held">{children(value, setValue)}</form>
      <p data-testid="held">{JSON.stringify(value)}</p>
    </MemoryRouter>
  );
}
const held = () => JSON.parse(screen.getByTestId("held").textContent ?? "null");

describe("where the order tracking's facts come from", () => {
  it("is said for each channel's tracking, flow, milestone and fallout case", () => {
    const tracking = {
      ...OFFERING.tracking!,
      milestones: [{ label: "Request received" }],
      fallout: [{ trigger: "Coverage fails" }],
    } as Offering["tracking"];
    render(
      <Holding start={tracking}>
        {(value, set) => <TrackingEditor value={value} onChange={set} systems={RELEASE.systems as CatalogueSystem[]} channels={RELEASE.channels ?? []} orderTypes={[]} />}
      </Holding>,
    );
    cite(screen.getByRole("group", { name: /^flow Sub-order milestones/i }), "SDD §9");
    cite(screen.getByRole("group", { name: /^milestone Request received/i }), "SDD §9.2");
    cite(screen.getByRole("group", { name: /^fallout Coverage fails/i }), "Runbook p.4");
    const value = held();
    expect(value.flows[0].source).toBe("SDD §9");
    expect(value.milestones[0].source).toBe("SDD §9.2");
    expect(value.fallout[0].source).toBe("Runbook p.4");
  });
});

describe("a lifecycle note's parts", () => {
  it("each say where they come from and how sure that is", () => {
    render(
      <Holding start={OFFERING.lifecycle_notes!}>
        {(value, set) => <LifecycleEditor value={value} onChange={set} channels={[]} orderTypes={[]} />}
      </Holding>,
    );
    const part = screen.getAllByRole("group", { name: /^(Text|Paragraph|List|Table|Part)/i })[0]!;
    cite(part, "Matrix v2");
    fireEvent.change(within(part).getByLabelText("How sure its source is"), { target: { value: "inferred" } });
    const block = held()[0].blocks[0];
    expect(block).toMatchObject({ source: "Matrix v2", confidence: "inferred" });
  });
});

describe("a channel", () => {
  it("says where it comes from and how sure that is", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    inDraft(<ChannelsEdit onDone={() => undefined} />);
    const online = screen.getByRole("group", { name: /^channel Online/i });
    cite(online, "Channel matrix");
    fireEvent.change(within(online).getByLabelText("How sure its source is"), { target: { value: "confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the channels" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved<Release["channels"]>(save, "channels")!.find((item) => item.id === "online")).toMatchObject({ source: "Channel matrix", confidence: "confirmed" });
  });
});

describe("a conflict", () => {
  it("says where it is recorded", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    inDraft(<ConflictsEdit onDone={() => undefined} />);
    const conflict = screen.getByRole("group", { name: /^Conflict Up \/ Downgrade channel scope/ });
    cite(conflict, "Review notes, 12 Oct", "Where the conflict is recorded");
    fireEvent.click(screen.getByRole("button", { name: "Save the conflicts" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(saved<Release["conflicts"]>(save, "conflicts")![0]).toMatchObject({ source: "Review notes, 12 Oct" });
  });
});

describe("a journey's branch", () => {
  it("takes the label its arrow says when it has no condition", () => {
    const journey = { ...RELEASE.journeys![0]!, flow_rules: [{ kind: "decision", from_activity: "2", to_activity: "3" }] } as Journey;
    render(
      <Holding start={journey}>
        {(value, set) => <JourneyEditor value={value} onChange={set} systems={RELEASE.systems} offerings={RELEASE.products ?? []} />}
      </Holding>,
    );
    fireEvent.change(within(screen.getByRole("group", { name: "branch 1" })).getByLabelText(/^Arrow label/), { target: { value: "Covered" } });
    expect(held().flow_rules[0].branch).toBe("Covered");
  });
});

describe("a system a source places elsewhere", () => {
  it("says where, and why it sits here; one without the other is said", () => {
    const system = RELEASE.systems.find((item) => item.id === "rtf")! as CatalogueSystem;
    render(
      <Holding start={system}>
        {(value, set) => <SystemEditor value={value} onChange={set} release={RELEASE} />}
      </Holding>,
    );
    fireEvent.change(screen.getByLabelText(/^Where a source places it instead/), { target: { value: "Customer › Assisted" } });
    expect(systemProblem(held(), RELEASE)).toBe("Say why it sits here rather than where a source places it.");
    // Said at the field it waits for, not only beside Save; and counted as a change, so leaving asks first.
    expect(screen.getByLabelText(/^Why it sits here/)).toHaveAttribute("aria-invalid", "true");
    expect(systemChanges(system, held(), RELEASE)).toContain("Where a source places it");
    fireEvent.change(screen.getByLabelText(/^Why it sits here/), { target: { value: "It runs the order hand-off." } });
    expect(held()).toMatchObject({ placement_from: "Customer › Assisted", placement_reason: "It runs the order hand-off." });
    expect(systemProblem(held(), RELEASE)).toBeNull();
  });
});
