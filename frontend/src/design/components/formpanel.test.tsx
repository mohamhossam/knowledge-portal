import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { checkAxeAfterEach } from "../../test/axe";
import { FormPanel, TextField } from "./forms";

// Promoted in Phase 8 (area 4, Ownership): an edit opened in place.
checkAxeAfterEach();

describe("FormPanel", () => {
  it("is a form named by its heading, and sends only when nothing is missing", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <FormPanel title="Add a person" submitLabel="Add the person" problem="Give the person a name." onSubmit={onSubmit} onCancel={() => {}}>
        <TextField label="Name" defaultValue="" />
      </FormPanel>,
    );
    const form = screen.getByRole("form", { name: "Add a person" });
    const verb = screen.getByRole("button", { name: "Add the person" });
    // Unavailable, not disabled: it stays focusable and says why (§1.2).
    expect(verb).toHaveAttribute("aria-disabled", "true");
    expect(verb).toHaveAccessibleDescription("Give the person a name.");
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(
      <FormPanel title="Add a person" submitLabel="Add the person" problem={null} onSubmit={onSubmit} onCancel={() => {}}>
        <TextField label="Name" defaultValue="Layla" />
      </FormPanel>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add the person" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("says it is saving, ignores presses meanwhile, and announces a failure", () => {
    const onSubmit = vi.fn();
    render(
      <FormPanel title="Edit Sales" submitLabel="Save the squad" busy failure="The squad catalogue changed while you edited." onSubmit={onSubmit} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("The squad catalogue changed while you edited.");
  });

  it("cancels on Esc and on Cancel", () => {
    const onCancel = vi.fn();
    render(
      <FormPanel title="Edit Sales" headingLevel={3} submitLabel="Save" onSubmit={() => {}} onCancel={onCancel}>
        <TextField label="Name" defaultValue="Sales" />
      </FormPanel>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Edit Sales" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
