import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api/client";
import { ApiError } from "../../api/errors";
import { checkAxeAfterEach } from "../../test/axe";
import { INFO, run, summary } from "./fixtures";
import { GoldenSetPage } from "./GoldenSetPage";

checkAxeAfterEach();
afterEach(() => vi.restoreAllMocks());

function open(path = "/architecture/golden-set") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <GoldenSetPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function serve(runs = [summary("r1")], info = INFO) {
  vi.spyOn(api, "goldenSetInfo").mockResolvedValue(info);
  vi.spyOn(api, "goldenRuns").mockResolvedValue({ runs });
  vi.spyOn(api, "goldenRun").mockImplementation(async (id) => run(id));
}

describe("the Golden set report", () => {
  it("says how the run went, in words, before the numbers", async () => {
    serve();
    open();
    expect(await screen.findByText(/3 of 4 cases got the right verdict/)).toBeInTheDocument();
    expect(screen.getByText(/it found 50% of the systems that really change/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Fake model");
  });

  it("shows each score with its counts, its range and the floor it is held to", async () => {
    serve();
    open();
    await screen.findByText(/6 systems of 12/);
    expect(screen.getAllByText(/likely/).length).toBeGreaterThan(0);
    // Recall 50% is above its 40% floor; precision 75% is below its 80% floor: said in words, not colour alone.
    expect(screen.getByText("Meets the floor (40%)")).toBeInTheDocument();
    expect(screen.getByText("Below the floor (80%)")).toBeInTheDocument();
    expect(screen.getAllByText("No floor set").length).toBeGreaterThan(0);
  });

  it("holds the held-out cases apart, with the honest caution", async () => {
    serve();
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Held out/ }));
    expect(await screen.findByText(/not tuned against/)).toBeInTheDocument();
  });

  it("lists the cases that went wrong first, and opens one", async () => {
    serve();
    open();
    const table = await screen.findByRole("grid");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("G004");
    expect(rows[0]).toHaveTextContent("Wrong verdict");
    fireEvent.click(within(screen.getByRole("list", { name: "Every case and how it went" })).getByRole("button", { name: /G002/ }));
    expect(await screen.findByRole("complementary", { name: "Case G002" })).toHaveTextContent("− b");
  });

  it("starts a run with the options chosen, and refuses a second while one runs", async () => {
    serve();
    const start = vi.spyOn(api, "startGoldenRun").mockResolvedValue(run("r2"));
    open();
    await screen.findByText(/3 of 4 cases/);
    fireEvent.change(screen.getByLabelText("Times to run"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Run the evaluation" }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({ mapper: "assess", precedents: "none", repeats: 3 }));
  });

  it("asks before a real model's run, and says what it makes without inventing a cost", async () => {
    serve([summary("r1")], { ...INFO, provider: "live", provider_name: "openai" });
    const start = vi.spyOn(api, "startGoldenRun").mockResolvedValue(run("r2"));
    open();
    await screen.findByText(/3 of 4 cases/);
    fireEvent.change(screen.getByLabelText("Times to run"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Run the evaluation" }));
    expect(await screen.findByText(/8 assessments \(4 cases × 2 runs\)/)).toBeInTheDocument();
    expect(screen.getByText(/cannot say what that costs/)).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it("follows a run that is waiting or running, and offers no second", async () => {
    serve([summary("r2", { status: "running", result: null, stage: "Run 1 of 2", progress_done: 23, progress_total: 59 })]);
    open();
    expect(await screen.findByText(/Run 1 of 2 · 23 of 59 cases/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run the evaluation" })).toHaveAttribute("aria-disabled", "true");
  });

  it("says when a run failed, and that nothing was scored", async () => {
    serve([summary("r1", { status: "failed", result: null, error_category: "provider_unavailable" })]);
    open();
    expect(await screen.findByText(/This run failed \(provider_unavailable\). Nothing was scored./)).toBeInTheDocument();
  });

  it("says so where this deployment holds no golden set, and still lists the runs", async () => {
    serve();
    vi.spyOn(api, "goldenSetInfo").mockRejectedValue(new ApiError(503, "This deployment holds no impact_golden_set.json.", "golden_set_unavailable"));
    open();
    expect(await screen.findByText(/holds no impact_golden_set.json/)).toBeInTheDocument();
    expect(await screen.findByText(/3 of 4 cases got the right verdict/)).toBeInTheDocument();
  });

  it("invites the first run when there is none", async () => {
    serve([]);
    open();
    expect(await screen.findByText("No run yet")).toBeInTheDocument();
  });
});
