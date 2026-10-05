import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Release } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { catalogue } from "./catalogue";
import { ChannelsPage } from "./ChannelsPage";
import { channelUses, draftBody, systemUses } from "./drafting";
import type { CatalogueContext } from "./useCatalogue";

afterEach(() => vi.restoreAllMocks());

const RELEASE = { ...EXPLORED, revision: 3, status: "draft", documents: [] } as unknown as Release;

function open(editable: boolean) {
  const context: CatalogueContext = { book: catalogue(RELEASE), base: "/architecture", inService: !editable, editable, actorName: () => "Amina" };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/architecture/channels"]}>
        <Routes>
          <Route path="architecture" element={<Outlet context={context} />}>
            <Route path="channels" element={<ChannelsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ChannelsPage", () => {
  it("lists each channel, the system its orders enter through, and what can be ordered through it", () => {
    open(false);
    const rows = within(screen.getByRole("table", { name: "Channels in this version" })).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Online");
    expect(within(rows[0]!).getByRole("link", { name: "B2B Web" })).toHaveAttribute("href", "/architecture/systems/web");
    expect(within(rows[0]!).getByRole("link", { name: "Business Pro Plus" })).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("New Activation");
    expect(rows[1]).toHaveTextContent("No system is named");
    expect(screen.queryByRole("button", { name: "Edit the channels" })).not.toBeInTheDocument();
  });

  it("will not let a draft drop a channel an order type or a step still names", () => {
    open(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit the channels" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove channel Shop" }));

    expect(screen.getByText(/Still named: Shop \(Business Pro Plus: New Activation\), Shop \(the journey/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save the channels" })).toBeDisabled();
  });
});

describe("drafting with channels", () => {
  it("sends the draft's channels with every edit", () => {
    expect(draftBody(RELEASE).channels).toEqual(RELEASE.channels);
  });

  it("names where a channel or its entry system is still used", () => {
    expect(channelUses(RELEASE, "shop")).toEqual(["Business Pro Plus: New Activation", "the journey Business Pro Plus new activation"]);
    expect(systemUses(RELEASE, "web")).toContain("the channel Online");
  });
});
