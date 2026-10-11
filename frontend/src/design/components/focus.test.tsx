import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { FocusFrame, FocusQuestion, FocusTitle } from "./focus";
import { checkAxeAfterEach } from "../../test/axe";

// Focus mode (UX rebuild plan, phase 2).
checkAxeAfterEach();

const choices = [
  { value: "keep", label: "Keep it", consequence: "It is published as read." },
  { value: "out", label: "Leave it out", consequence: "It isn't published." },
] as const;

function Question({ onNext = vi.fn(), onSkip = vi.fn() }: { onNext?: () => void; onSkip?: () => void }) {
  const [value, setValue] = useState<"keep" | "out" | undefined>(undefined);
  return <FocusQuestion title="Keep Line 3?" choices={[...choices]} value={value} onChange={setValue} onNext={onNext} onSkip={onSkip} />;
}

describe("FocusFrame", () => {
  it("names the work and the place, counts what is answered in words, and leaves on Esc", () => {
    const leave = vi.fn();
    render(
      <FocusFrame work="Coverage policy" place="Question 2 of 3" steps={["answered", "current", "skipped"]} onLeave={leave} documentTitle="Question 2 of 3 · Review">
        <p>Body</p>
      </FocusFrame>,
    );
    expect(document.title).toMatch(/^Question 2 of 3 · Review/);
    expect(screen.getByText("Coverage policy")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 answered")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText("Body"), { key: "Escape" });
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("leaves Esc to a field that is typed in", () => {
    const leave = vi.fn();
    render(
      <FocusFrame work="Coverage policy" place="Summary" steps={[]} onLeave={leave} documentTitle="Summary · Review">
        <label>Summary <textarea /></label>
      </FocusFrame>,
    );
    fireEvent.keyDown(screen.getByLabelText("Summary"), { key: "Escape" });
    expect(leave).not.toHaveBeenCalled();
  });
});

describe("FocusFrame and its titles", () => {
  it("leaves the first title's focus to the shell, and focuses each next question's", () => {
    const { rerender } = render(
      <FocusFrame work="Doc" place="Question 1 of 2" steps={["current", "open"]} onLeave={vi.fn()} documentTitle="Review">
        <FocusTitle key="1">First</FocusTitle>
      </FocusFrame>,
    );
    expect(screen.getByRole("heading", { name: "First" })).not.toHaveFocus();
    rerender(
      <FocusFrame work="Doc" place="Question 2 of 2" steps={["answered", "current"]} onLeave={vi.fn()} documentTitle="Review">
        <FocusTitle key="2">Second</FocusTitle>
      </FocusFrame>,
    );
    expect(screen.getByRole("heading", { name: "Second" })).toHaveFocus();
  });

  it("answers with number keys and leaves on Esc before anything in it has focus", () => {
    const leave = vi.fn();
    render(
      <FocusFrame work="Doc" place="Question 1 of 1" steps={["current"]} onLeave={leave} documentTitle="Review">
        <Question />
      </FocusFrame>,
    );
    fireEvent.keyDown(document.body, { key: "2" });
    expect(screen.getByRole("radio", { name: "Leave it out" })).toBeChecked();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(leave).toHaveBeenCalledTimes(1);
  });
});

describe("FocusQuestion", () => {
  it("focuses its heading, and says why it can't go on before an answer", () => {
    const next = vi.fn();
    render(<Question onNext={next} />);
    expect(screen.getByRole("heading", { level: 1, name: "Keep Line 3?" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and next/ }));
    fireEvent.keyDown(screen.getByRole("heading", { level: 1 }), { key: "Enter" });
    expect(next).not.toHaveBeenCalled();
    expect(screen.getAllByText("Choose an answer first.").length).toBeGreaterThan(0);
  });

  it("picks an answer with its number key, describes it by what it does, and confirms on Enter", () => {
    const next = vi.fn();
    render(<Question onNext={next} />);
    fireEvent.keyDown(screen.getByRole("heading", { level: 1 }), { key: "2" });
    const out = screen.getByRole("radio", { name: "Leave it out" });
    expect(out).toBeChecked();
    expect(out).toHaveFocus();
    expect(out).toHaveAccessibleDescription("It isn't published.");
    fireEvent.submit(out.closest("form")!);
    expect(next).toHaveBeenCalledTimes(1);
    // Enter confirms from the heading too, where focus lands as a question arrives.
    fireEvent.keyDown(screen.getByRole("heading", { level: 1 }), { key: "Enter" });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("skips a question for later", () => {
    const skip = vi.fn();
    render(<Question onSkip={skip} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(skip).toHaveBeenCalledTimes(1);
  });
});
