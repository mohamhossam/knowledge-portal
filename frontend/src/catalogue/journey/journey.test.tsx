import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Journey } from "../../api/client";
import { checkAxeAfterEach } from "../../test/axe";
import { ACTIVATION, BARE, ORDERING, SYSTEMS } from "./fixtures";
import JourneyViewsDefault, { JourneyViews, type JourneyView } from "./JourneyViews";

// Every state a test leaves rendered is also checked by axe.
checkAxeAfterEach();

const systemName = (id: string) => SYSTEMS[id] ?? id;
const system = (id: string) => <a href={`/architecture/systems/${id}`}>{systemName(id)}</a>;
const channelName = (id: string) => ({ online: "Online", shop: "Shop" })[id] ?? id;

function show(journey: Journey, extra: Partial<Parameters<typeof JourneyViews>[0]> = {}) {
  return render(
    <main>
      <JourneyViews journey={journey} systemName={systemName} system={system} channelName={channelName} {...extra} />
    </main>,
  );
}

const panel = () => screen.getByRole("tabpanel");

describe("the journey views", () => {
  it("opens on the swimlane: a lane per system, steps in order, the hand-over named", () => {
    show(ACTIVATION);
    expect(screen.getByRole("tab", { name: "Swimlane" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Swimlane", "Flowchart", "Stage timeline"]);
    const figure = within(panel()).getByRole("figure", { name: /as a swimlane: 5 steps across 5 lanes/ });
    expect(within(figure).getByRole("region", { name: /Swimlane of Business Pro Plus new activation \(scrolls sideways\)/ })).toHaveAttribute("tabindex", "0");
    const lanes = within(figure).getByRole("list", { name: "Lanes, one per system" });
    expect(within(lanes).getAllByRole("listitem").map((lane) => lane.firstChild?.textContent)).toEqual([
      "The channel’s entry system", "RTF", "CWOM", "BSCS", "No system named",
    ]);
    expect(within(lanes).getByRole("link", { name: "RTF" })).toHaveAttribute("href", "/architecture/systems/rtf");
    const steps = within(figure).getByRole("list", { name: "Steps, in order" });
    const submit = within(steps).getAllByRole("listitem")[1]!;
    expect(submit).toHaveTextContent("Submit the service request");
    expect(submit).toHaveTextContent("Performed by RTF");
    expect(submit).toHaveTextContent("with B2B Web");
    expect(submit).toHaveTextContent("Then 3 via RTF SR");
    expect(within(steps).getAllByRole("listitem")[4]).toHaveTextContent("Only in Shop");
    expect(within(figure).getByRole("list", { name: "Phases" })).toHaveTextContent("CaptureOrchestrate");
    // The steps link nowhere, so none is a tab stop; the arrows are drawing only.
    expect(steps.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(figure.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("puts entry steps in the entry system's lane when one channel is read", () => {
    show(ACTIVATION, { entry: { channel: "Online", systemId: "web" }, system: (id) => systemName(id) });
    const lanes = screen.getByRole("list", { name: "Lanes, one per system" });
    expect(within(lanes).getAllByRole("listitem")[0]).toHaveTextContent("B2B WebThe entry system of Online");
  });

  it("switches views from the tabs, with the arrow keys too", async () => {
    show(ORDERING);
    await userEvent.click(screen.getByRole("tab", { name: "Flowchart" }));
    expect(screen.getByRole("tab", { name: "Flowchart" })).toHaveAttribute("aria-selected", "true");
    expect(within(panel()).getByRole("figure", { name: /as a flowchart: 10 steps on 8 levels, top to bottom, 1 with a decision, 1 starting parallel tracks/ })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Stage timeline" })).toHaveAttribute("aria-selected", "true");
    expect(within(panel()).getByRole("figure", { name: /by stage: 5 stages/ })).toBeInTheDocument();
  });

  it("draws the flowchart with decisions, returns and parallel tracks, each said in words", async () => {
    show(ORDERING, { view: "flowchart" });
    const steps = within(panel()).getByRole("list", { name: "Steps, in order" });
    const items = within(steps).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector(".journey-num")?.textContent)).toEqual(["300", "320", "330", "340", "370", "380", "400", "460", "470", "480"]);
    expect(items[1]).toHaveTextContent("Then 340 if Passes evaluation; 330 if Rejected");
    expect(items[2]).toHaveTextContent("Then back to 300 if Correct and resubmit");
    expect(items[4]).toHaveTextContent("Then 380 alongside; 400 alongside");
    expect(items[4]).toHaveTextContent("Inferred");
    expect(items[9]).toHaveTextContent("The journey ends here");
    expect(within(panel()).getByRole("list", { name: "Key" })).toHaveTextContent(/A decision.*Tracks fork or rejoin/);
  });

  it("reads the stage timeline: stages in order, who performs each step, the marks in words", () => {
    show(ORDERING, { view: "timeline" });
    const stages = within(panel()).getAllByRole("list").find((list) => list.classList.contains("journey-stages"))!;
    const validate = within(stages).getByRole("list", { name: "Steps in Validate" });
    expect(within(validate).getAllByRole("listitem")).toHaveLength(3);
    expect(validate).toHaveTextContent("Order returned for correction");
    expect(validate).toHaveTextContent("Seen by the customer");
    expect(validate).toHaveTextContent("Point of no return");
    expect(within(validate).getAllByRole("link", { name: "RTF" })).toHaveLength(2);
    expect(within(stages).getByRole("list", { name: "Steps in Fulfil" })).toHaveTextContent("On the CPE track");
  });

  it("keeps the view in the page's hands when controlled", async () => {
    const changed = vi.fn();
    function Page() {
      const [view, setView] = useState<JourneyView>("timeline");
      return (
        <JourneyViewsDefault
          journey={ACTIVATION} systemName={systemName} system={system} view={view}
          onViewChange={(next) => { changed(next); setView(next); }}
        />
      );
    }
    render(<main><Page /></main>);
    expect(screen.getByRole("tab", { name: "Stage timeline" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Swimlane" }));
    expect(changed).toHaveBeenCalledWith("swimlane");
    expect(screen.getByRole("tab", { name: "Swimlane" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("the steps as a table", () => {
  it("sits under every view, with each step's phase, performer, systems and next step", async () => {
    show(ORDERING);
    await userEvent.click(screen.getByText("Steps as a table (10)"));
    const table = screen.getByRole("table", { name: "Steps of Business Pro Plus new activation, in full, in order" });
    expect(within(table).getAllByRole("columnheader").map((head) => head.textContent)).toEqual(["No.", "Step", "Phase", "Performed by", "With", "Next"]);
    const row = within(table).getByRole("rowheader", { name: /Split into sub-orders/ }).closest("tr")!;
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "370", "Orchestrate", "CWOM", "ECM", "380 alongside; 400 alongside",
    ]);
    const entry = within(table).getByRole("rowheader", { name: /Submit the order/ }).closest("tr")!;
    expect(entry).toHaveTextContent("The channel’s entry system");
    expect(entry).toHaveTextContent("320 via RTF Submit Order");
    await userEvent.click(screen.getByRole("tab", { name: "Flowchart" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("gaps in the data", () => {
  it("draws a journey with no phases and no flow in step order", async () => {
    show(BARE);
    const figure = within(panel()).getByRole("figure");
    expect(within(figure).queryByRole("list", { name: "Phases" })).not.toBeInTheDocument();
    expect(within(figure).getByRole("list", { name: "Lanes, one per system" })).toHaveTextContent("No system named");
    await userEvent.click(screen.getByRole("tab", { name: "Flowchart" }));
    expect(within(panel()).getByRole("figure", { name: /No flow is recorded, so the steps follow their numbers/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Stage timeline" }));
    expect(within(panel()).getByRole("figure", { name: /no phase is recorded, so every step sits in one stage/ })).toBeInTheDocument();
    expect(within(panel()).getByText("All steps")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("None named")).toHaveLength(3);
  });

  it("keeps a long Arabic name in its own direction", () => {
    const name = "تفعيل خدمة الإنترنت للأعمال مع جهاز التوجيه المُدار والدعم الفني الكامل";
    show({ ...BARE, activities: [{ ...BARE.activities[0]!, name }] } as Journey);
    const box = screen.getByRole("list", { name: "Steps, in order" }).querySelector(".journey-box__name")!;
    expect(box).toHaveTextContent(name);
    expect(box).toHaveAttribute("dir", "auto");
  });

  it("says so when a journey has no steps", () => {
    show({ ...BARE, activities: [] } as Journey);
    expect(screen.getByText("No step is recorded")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
