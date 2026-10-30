import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { checkAxeAfterEach } from "../test/axe";
import { SourceStatus } from "./SourceStatus";

checkAxeAfterEach();

describe("how sure a source is, as a status", () => {
  it("says it in full unless a Source column already says what it is about", () => {
    const { rerender } = render(<SourceStatus confidence="inferred" />);
    expect(screen.getByText("Inferred, not stated in its source")).toBeInTheDocument();
    rerender(<SourceStatus confidence="inferred" short />);
    expect(screen.getByText("Inferred")).toBeInTheDocument();
    rerender(<SourceStatus confidence="gap" />);
    expect(screen.getByText("Its source leaves gaps").closest(".ds-status--attention")).not.toBeNull();
  });

  it("marks an inferred fact as settled, never with the clock that reads as waiting", () => {
    const { container } = render(<SourceStatus confidence="inferred" />);
    expect(container.querySelector(".ds-status--neutral .lucide-circle-dashed")).not.toBeNull();
    expect(container.querySelector(".lucide-clock")).toBeNull();
  });
});
