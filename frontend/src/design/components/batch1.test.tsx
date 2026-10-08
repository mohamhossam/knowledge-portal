import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type RefObject, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDelayedCommit, useDisclosure } from "../hooks";
import { Button } from "./actions";
import { Badge, EmptyState, JobTray, Skeleton, Status, Suggested, UndoToast } from "./feedback";
import { Checkbox, Combobox, RadioGroup, TextField, Upload } from "./forms";

afterEach(() => vi.useRealTimers());

describe("Button", () => {
  it("runs its action when available", async () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Publish</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("stays focusable when unavailable, says why, and does nothing (§1.2)", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} unavailableReason="Save your review before approving.">Approve</Button>);
    const button = screen.getByRole("button", { name: "Approve" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription("Save your review before approving.");
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Save your review before approving.");
  });

  it("ignores presses while busy", async () => {
    const onClick = vi.fn();
    render(<Button busy onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
});

describe("feedback", () => {
  it("says a status in words beside its icon, never colour alone", () => {
    render(<Status tone="attention">Needs attention</Status>);
    expect(screen.getByText("Needs attention")).toBeVisible();
    expect(document.querySelector(".ds-status svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("names a count for screen readers", () => {
    render(<a href="/">Your work<Badge count={6} label="need you" /></a>);
    expect(screen.getByRole("link", { name: "Your work 6 need you" })).toBeInTheDocument();
  });

  it("marks a suggestion as suggested and says its basis", () => {
    render(<Suggested basis="inferred" />);
    expect(screen.getByText("Suggested · inferred, not stated in the source")).toBeInTheDocument();
  });

  it("explains an empty state and offers its action", () => {
    render(<EmptyState title="No documents yet." action={<Button>Upload documents</Button>}>Upload a policy to review it.</EmptyState>);
    expect(screen.getByText("No documents yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload documents" })).toBeInTheDocument();
  });

  it("marks a skeleton as a busy status", () => {
    render(<Skeleton label="Reading the library" />);
    expect(screen.getByRole("status", { name: "Reading the library" })).toHaveAttribute("aria-busy", "true");
  });

  it("offers undo in a polite status and calls back", async () => {
    const onUndo = vi.fn();
    render(<UndoToast message="Rejected: Adds the system Dynamics CRM." onUndo={onUndo} />);
    expect(screen.getByRole("status")).toHaveTextContent("Rejected");
    await userEvent.click(screen.getByRole("button", { name: "Undo (z)" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("orders jobs by need: attention first; retry is named for its job", async () => {
    const onRetry = vi.fn();
    render(
      <JobTray
        jobs={[
          { id: "1", kind: "Reading", subject: "policy.pdf", state: "done" },
          { id: "2", kind: "Indexing", subject: "matrix.xlsx", state: "attention", cause: "The service timed out.", onRetry },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Needs attention");
    await userEvent.click(screen.getByRole("button", { name: "Try again: Indexing matrix.xlsx" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says when no job runs", () => {
    render(<JobTray jobs={[]} />);
    expect(screen.getByText(/No jobs are running/)).toBeInTheDocument();
  });
});

describe("forms", () => {
  it("labels a field, ties its hint and shows an error only when given", () => {
    const { rerender } = render(<TextField label="Why exclude it?" hint="Reviewers see this." />);
    const input = screen.getByRole("textbox", { name: "Why exclude it?" });
    expect(input).toHaveAccessibleDescription("Reviewers see this.");
    expect(input).toHaveAttribute("dir", "auto");
    expect(input).not.toHaveAttribute("aria-invalid");
    rerender(<TextField label="Why exclude it?" hint="Reviewers see this." error="Give a reason." />);
    expect(screen.getByRole("textbox", { name: "Why exclude it?" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Why exclude it?" })).toHaveAccessibleDescription("Reviewers see this. Give a reason.");
  });

  it("makes the checkbox label part of the target", async () => {
    render(<Checkbox label="Page-wide shortcuts" />);
    await userEvent.click(screen.getByText("Page-wide shortcuts"));
    expect(screen.getByRole("checkbox", { name: "Page-wide shortcuts" })).toBeChecked();
  });

  it("groups radios under a legend", async () => {
    function Density() {
      const [value, setValue] = useState<"compact" | "comfortable">("comfortable");
      return <RadioGroup legend="Density" name="density" value={value} onChange={setValue} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />;
    }
    render(<Density />);
    expect(screen.getByRole("group", { name: "Density" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(screen.getByRole("radio", { name: "Compact" })).toBeChecked();
  });

  it("filters a combobox by keyboard and picks with Enter, suggested first", async () => {
    const onSelect = vi.fn();
    render(
      <Combobox
        label="Squad"
        options={[{ id: "care", label: "Care squad" }, { id: "sales", label: "Sales squad" }, { id: "ful", label: "Fulfilment squad" }]}
        suggested={{ id: "sales", reason: "runs 2 related systems" }}
        onSelect={onSelect}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Squad" });
    await userEvent.click(input);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Sales squad · Suggested: runs 2 related systems");
    await userEvent.type(input, "squad");
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1]!.id);
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith({ id: "care", label: "Care squad" });
    expect(input).toHaveValue("Care squad");
  });

  it("lists uploaded files with their scan state in words", () => {
    render(<Upload items={[{ name: "eligibility.xlsx", state: "working", note: "Scanning" }, { name: "deck.pptx", state: "held", note: "Held by the malware scan" }]} onFiles={() => {}} />);
    expect(screen.getByRole("list", { name: "Uploaded files" })).toHaveTextContent("Held by the malware scan");
  });

  it("hands chosen files over", () => {
    const onFiles = vi.fn();
    render(<Upload items={[]} onFiles={onFiles} />);
    const file = new File(["x"], "policy.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/Files/), { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});

describe("hooks", () => {
  it("useDelayedCommit sends after the window and undo cancels it (§4)", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const { result } = renderHook(() => useDelayedCommit<string>(commit, 6000));
    act(() => result.current.schedule("a", "Accept A", "accepted"));
    act(() => result.current.schedule("b", "Reject B", "rejected"));
    expect(result.current.pending).toHaveLength(2);
    let undone;
    act(() => { undone = result.current.undo(); });
    expect(undone).toMatchObject({ id: "b" });
    act(() => vi.advanceTimersByTime(6000));
    expect(commit).toHaveBeenCalledExactlyOnceWith("accepted");
    expect(result.current.pending).toHaveLength(0);
  });

  it("useDelayedCommit flushes pending decisions on demand", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useDelayedCommit<string>(commit, 6000));
    act(() => result.current.schedule("a", "Accept A", "accepted"));
    act(() => result.current.flush());
    expect(commit).toHaveBeenCalledWith("accepted");
    expect(result.current.pending).toHaveLength(0);
  });

  it("useDisclosure moves focus into the panel and back to its opener (§1)", async () => {
    function Panel() {
      const { open, show, close, panel } = useDisclosure();
      return (
        <>
          <button type="button" onClick={show}>Withdraw…</button>
          {open && (
            <section ref={panel as RefObject<HTMLElement>} aria-label="Withdraw">
              <label>Why? <input /></label>
              <button type="button" onClick={close}>Keep it in service</button>
            </section>
          )}
        </>
      );
    }
    render(<Panel />);
    await userEvent.click(screen.getByRole("button", { name: "Withdraw…" }));
    expect(screen.getByRole("textbox", { name: "Why?" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Keep it in service" }));
    expect(screen.getByRole("button", { name: "Withdraw…" })).toHaveFocus();
  });
});
