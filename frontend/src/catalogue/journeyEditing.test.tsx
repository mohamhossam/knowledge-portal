import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type Journey, type Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { catalogue } from "./catalogue";
import { journeyChanges } from "./editing";
import { JourneysPage } from "./JourneysPage";
import type { CatalogueContext } from "./useCatalogue";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

afterEach(() => vi.restoreAllMocks());

const term = (id: string, pref_label: string) => ({ id, scheme: "responsibility_role", pref_label, alt_labels: [], close_match: [], deprecated: false, accepted: [] });

/** The explorer's journey on a draft, with the vocabulary's roles a step can play. */
const RELEASE = {
  ...EXPLORED,
  revision: 3,
  status: "draft",
  documents: [],
  vocabulary: [...(EXPLORED.vocabulary ?? []), term("role-orchestrate", "Orchestrate"), term("role-activate", "Activate")],
} as unknown as Release;
const JOURNEY = RELEASE.journeys![0]!;
const HANDOVER = "Hand-over 1: 2. Submit the service request to 3. Orchestrate";

function open() {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: false, editable: true, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/architecture/journeys/${JOURNEY.id}`]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="journeys/:journeyId" element={<JourneysPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit this journey" }));
  return screen.getByRole("form", { name: `Edit ${JOURNEY.name}` });
}

/** A step or hand-over, opened from its title. */
function row(form: HTMLElement, name: string) {
  fireEvent.click(within(form).getByRole("button", { name }));
  return within(form).getByRole("group", { name });
}

const savedJourney = (save: ReturnType<typeof vi.spyOn>) =>
  (save.mock.calls[0]![1] as { journeys: Journey[] }).journeys.find((item) => item.id === JOURNEY.id)!;

describe("a journey's steps, edited with everything its views show", () => {
  it("shows each step closed to its title and what it holds, an index to open the one to correct", () => {
    const form = open();
    // The panel takes focus, since it replaces the button that opened it.
    expect(within(form).getByRole("heading", { name: `Edit ${JOURNEY.name}` })).toHaveFocus();
    const toggle = within(form).getByRole("button", { name: "Step 2. Submit the service request" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const submit = within(form).getByRole("group", { name: "Step 2. Submit the service request" });
    expect(within(submit).getByText("RTF · Capture")).toBeInTheDocument();
    expect(within(submit).queryByLabelText("Who performs it")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(submit).getByLabelText("Who performs it")).toHaveValue("system");
  });

  it("edits who performs a step, its role, eTOM, what it does and produces, its point of no return, track and source", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    const form = open();
    const ticket = row(form, "Step 4. Ticket the onboarding");
    fireEvent.change(within(ticket).getByLabelText("Who performs it"), { target: { value: "team" } });
    fireEvent.change(within(ticket).getByLabelText("The team or party"), { target: { value: " MSS team " } });
    fireEvent.change(within(ticket).getByLabelText("Its role"), { target: { value: "orchestrate" } });
    fireEvent.change(within(ticket).getByLabelText("eTOM"), { target: { value: "Order Handling › Issue Orders" } });
    fireEvent.change(within(ticket).getByLabelText("What it does"), { target: { value: "Raises the onboarding ticket." } });
    fireEvent.change(within(ticket).getByLabelText("What it produces"), { target: { value: "An onboarding ticket" } });
    fireEvent.change(within(ticket).getByLabelText("Point of no return"), { target: { value: "Once the ticket is raised" } });
    fireEvent.change(within(ticket).getByLabelText("Track"), { target: { value: "FIELD" } });
    fireEvent.change(within(ticket).getByLabelText("Source"), { target: { value: "SDD §7.2" } });
    expect(within(form).getByText("Changed: step 4.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the journey" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(savedJourney(save).activities.find((step) => step.number === "4")).toMatchObject({
      performer: "MSS team", performing_system_id: null, channel_entry: false, role: "orchestrate", etom: "Order Handling › Issue Orders",
      description: "Raises the onboarding ticket.", output: "An onboarding ticket", point_of_no_return: "Once the ticket is raised", track: "FIELD", source: "SDD §7.2",
    });
  });

  it("asks who performs a step as one choice, and keeps the system and team written when switching back", () => {
    const form = open();
    const submit = row(form, "Step 2. Submit the service request");
    const who = within(submit).getByLabelText("Who performs it");
    expect(within(submit).getByLabelText("The system")).toHaveValue("rtf");
    fireEvent.change(who, { target: { value: "team" } });
    expect(within(submit).queryByLabelText("The system")).not.toBeInTheDocument();
    fireEvent.change(within(submit).getByLabelText("The team or party"), { target: { value: "The customer" } });
    fireEvent.change(who, { target: { value: "system" } });
    expect(within(submit).getByLabelText("The system")).toHaveValue("rtf");
    fireEvent.change(who, { target: { value: "team" } });
    expect(within(submit).getByLabelText("The team or party")).toHaveValue("The customer");
  });

  it("says a system chosen and left empty, rather than saving the step as not said", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    const form = open();
    const ticket = row(form, "Step 4. Ticket the onboarding");
    fireEvent.change(within(ticket).getByLabelText("Who performs it"), { target: { value: "system" } });
    expect(within(form).getByText("Correct the system of step 4 first.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the journey" }));
    const system = within(ticket).getByLabelText("The system");
    expect(system).toHaveAttribute("aria-invalid", "true");
    expect(within(ticket).getByText(/Choose the system that performs it/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not offer the system that performs a step as one supporting it", () => {
    const form = open();
    const submit = row(form, "Step 2. Submit the service request");
    const supporting = within(submit).getByLabelText("Supported by");
    expect(within(supporting).queryByRole("option", { name: "RTF" })).not.toBeInTheDocument();
    expect(within(supporting).getByRole("option", { name: "CWOM" })).toBeInTheDocument();
  });
});

describe("a journey's hand-overs", () => {
  it("are named by their steps, and say whose system stands in where none is named", () => {
    const form = open();
    const call = within(form).getByRole("group", { name: HANDOVER });
    expect(within(call).getByText("RTF to CWOM")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: HANDOVER }));
    expect(within(call).getByLabelText("Calling system")).toHaveDisplayValue("As step 2's performer (RTF)");
    expect(within(call).getByLabelText("Called system")).toHaveDisplayValue("As step 3's performer (CWOM)");
  });

  it("edits the systems of a call, what it is for, its style, its TM Forum equivalent and its source", async () => {
    const save = vi.spyOn(api, "saveDraft").mockResolvedValue(RELEASE);
    const form = open();
    const call = row(form, HANDOVER);
    fireEvent.change(within(call).getByLabelText("Calling system"), { target: { value: "rtf" } });
    fireEvent.change(within(call).getByLabelText("Called system"), { target: { value: "cwom" } });
    fireEvent.change(within(call).getByLabelText(/What it is for/), { target: { value: "Opens the service request." } });
    fireEvent.change(within(call).getByLabelText("Style"), { target: { value: "API" } });
    fireEvent.change(within(call).getByLabelText("TM Forum equivalent"), { target: { value: "TMF641 Service Ordering" } });
    fireEvent.change(within(call).getByLabelText("Source"), { target: { value: "SDD §8" } });
    expect(within(form).getByText("Changed: the hand-over 2 to 3.")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the journey" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(savedJourney(save).integrations[0]).toMatchObject({
      from_system_id: "rtf", to_system_id: "cwom", via_system_id: null, purpose: "Opens the service request.", style: "API",
      tmf_equivalent: "TMF641 Service Ordering", source: "SDD §8",
    });
  });
});

describe("the journey edit, like the other edits", () => {
  it("opens the step with a problem once Save is tried, says it under its field, and asks before throwing changes away", async () => {
    const form = open();
    // The record's own buttons give way while the edit is open.
    expect(screen.queryByRole("button", { name: "Remove this journey…" })).not.toBeInTheDocument();
    const step = row(form, "Step 3. Orchestrate");
    fireEvent.change(within(step).getByLabelText(/^Step/), { target: { value: " " } });
    expect(within(form).getByText("Correct the name of step 3 first.")).toBeInTheDocument();
    expect(within(step).getByLabelText(/^Step/)).not.toHaveAttribute("aria-invalid");
    // Closed again, it opens of itself when Save is tried.
    fireEvent.click(within(form).getByRole("button", { name: "Step 3" }));
    expect(within(step).queryByLabelText(/^Step/)).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Save the journey" }));
    const name = within(step).getByLabelText(/^Step/);
    expect(name).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(name).toHaveFocus());
    fireEvent.keyDown(name, { key: "Escape" });
    expect(within(form).getByText("Discard your changes to step 3?")).toBeInTheDocument();
  });
});

describe("what a journey edit has changed", () => {
  const steps = JOURNEY.activities;
  it("names its facts, each step by number, the branches and each hand-over by its steps", () => {
    const after: Journey = {
      ...JOURNEY,
      name: "Renamed",
      activities: [...steps.filter((step) => step.number !== "5").map((step) => (step.number === "2" ? { ...step, phase: "Order" } : step)), { ...steps[0]!, number: "6", name: "Close" }],
      integrations: [],
    };
    expect(journeyChanges(JOURNEY, after)).toEqual(["the name", "step 2", "the new step 6", "the removed step 5", "the removed hand-over 2 to 3"]);
    expect(journeyChanges(JOURNEY, { ...JOURNEY })).toEqual([]);
  });

  it("ends a long list in how many more", () => {
    const after: Journey = { ...JOURNEY, activities: steps.map((step) => ({ ...step, phase: "Other" })), name: "Renamed", description: "New" };
    expect(journeyChanges(JOURNEY, after)).toEqual(["the name", "what the journey is", "step 1", "step 2", "step 3", "2 more"]);
  });
});
