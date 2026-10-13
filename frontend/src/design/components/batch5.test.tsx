import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Checklist } from "./evidence";
import { Banner } from "./feedback";
import { Stepper } from "./layout";
import { checkAxeAfterEach } from "../../test/axe";

// Pieces added for the draft release workflow (redesign phase 3).
checkAxeAfterEach();

describe("Stepper", () => {
  const steps = [
    { href: "/d/sources", label: "Sources", status: { tone: "done" as const, text: "2 documents" } },
    { href: "/d/decide", label: "Decide", current: true, status: { tone: "attention" as const, text: "12 waiting" } },
    { href: "/d/publish", label: "Publish" },
  ];

  it("is an ordered list of links in a labelled nav, the current step marked", () => {
    render(<Stepper label="Steps of the draft" steps={steps} />);
    const nav = screen.getByRole("navigation", { name: "Steps of the draft" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(within(nav).getByRole("list").tagName).toBe("OL");
    expect(links[1]).toHaveAttribute("aria-current", "page");
    expect(links[0]).not.toHaveAttribute("aria-current");
  });

  it("names each step with its number and where it stands, in words", () => {
    render(<Stepper label="Steps of the draft" steps={steps} />);
    expect(screen.getByRole("link", { name: "Step 2: Decide, 12 waiting" })).toHaveAttribute("href", "/d/decide");
    expect(screen.getByRole("link", { name: "Step 3: Publish" })).toBeInTheDocument();
  });
});

describe("Banner", () => {
  it("is a labelled region, never a live one, with its way onward", () => {
    render(<Banner label="Draft in progress" action={<a href="/d">Carry on</a>}>A draft is in preparation.</Banner>);
    const region = screen.getByRole("region", { name: "Draft in progress" });
    expect(region).not.toHaveAttribute("aria-live");
    expect(within(region).getByRole("link", { name: "Carry on" })).toBeInTheDocument();
  });
});

describe("Checklist", () => {
  it("says first how many checks block, then each check with its state in words", () => {
    render(
      <Checklist
        label="Before publishing"
        items={[
          { id: "built", tone: "done", word: "Ready", title: "Built at this revision" },
          { id: "waiting", tone: "attention", word: "Blocks publishing", title: "3 suggestions wait", action: <a href="/d/decide">Decide them</a> },
          { id: "samples", tone: "held", word: "Worth a look", title: "Samples not compared" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Before publishing" });
    expect(list).toHaveAccessibleDescription("1 check blocks it; 1 worth a look.");
    const items = within(list).getAllByRole("listitem");
    expect(items[1]).toHaveTextContent("Blocks publishing3 suggestions waitDecide them");
  });

  it("says when every check is ready", () => {
    render(<Checklist label="Before publishing" items={[{ id: "built", tone: "done", word: "Ready", title: "Built" }]} />);
    expect(screen.getByText("Every check is ready.")).toBeInTheDocument();
  });
});
