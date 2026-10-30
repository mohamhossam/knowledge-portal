import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Offering } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { fieldsInWords } from "./drafting";
import { offeringProblem } from "./editing";
import { sourceRegister, SourcesContext } from "./governance";
import { OfferingEditor } from "./OfferingEditor";
import { NfrSection, RealisationKey, RealisedAs } from "./Realisation";
import { checkAxeAfterEach } from "../test/axe";

checkAxeAfterEach();

const OFFERING = EXPLORED.products![0]!;

function Editing({ seen }: { seen: (value: Offering) => void }) {
  const [value, setValue] = useState<Offering>(OFFERING);
  return <OfferingEditor value={value} onChange={(next) => { setValue(next); seen(next); }} systems={EXPLORED.systems} />;
}

describe("realisation and NFRs in the offering editor", () => {
  it("adds a layer to a part and a requirement to the offering", () => {
    let last = OFFERING;
    render(<Editing seen={(value) => (last = value)} />);

    const firewall = screen.getAllByRole("group", { name: "Realised as" })[1]!;
    fireEvent.click(within(firewall).getByRole("button", { name: "Add a thing Firewall is realised as" }));
    fireEvent.change(within(firewall).getByLabelText("Layer"), { target: { value: "resource" } });
    fireEvent.change(within(firewall).getByLabelText(/^Name/), { target: { value: "Fortinet HE CPE" } });
    expect(last.components[1]!.realisation).toEqual([{ layer: "resource", name: "Fortinet HE CPE" }]);
    expect(within(firewall).getByRole("button", { name: "Remove Resource Fortinet HE CPE" })).toBeInTheDocument();

    const nfrs = screen.getByRole("group", { name: "Non-functional requirements" });
    fireEvent.click(within(nfrs).getByRole("button", { name: /Add another non-functional requirement/ }));
    const added = within(nfrs).getAllByLabelText(/^Quality/).at(-1)!;
    fireEvent.change(added, { target: { value: "Audit" } });
    expect(last.nfrs.at(-1)).toEqual({ quality: "Audit", coverage: "missing" });
  });

  it("says why an offering cannot be sent yet", () => {
    const unnamed = { ...OFFERING, components: [{ ...OFFERING.components[0]!, realisation: [{ layer: "cfs" as const, name: " " }] }] };
    expect(offeringProblem(unnamed)).toBe("Broadband: everything it is realised as needs a name.");
    const twice = { ...OFFERING, components: [{ ...OFFERING.components[0]!, realisation: [{ layer: "cfs" as const, name: "X" }, { layer: "cfs" as const, name: "x " }] }] };
    expect(offeringProblem(twice)).toBe("Broadband: the same thing is named twice in one layer.");
    expect(offeringProblem({ ...OFFERING, nfrs: [{ quality: "", coverage: "missing" }] })).toBe(
      "Every non-functional requirement needs a quality.",
    );
    expect(offeringProblem({ ...OFFERING, nfrs: [...OFFERING.nfrs, { quality: "security", coverage: "defined" }] })).toBe(
      "Each quality is stated once.",
    );
  });

  it("says a change to them in words", () => {
    expect(fieldsInWords(["realisation", "nfrs"])).toBe("how its parts are realised and non-functional requirements");
  });
});

describe("realisation and NFRs read on a sheet", () => {
  it("says how each part is realised, layer by layer, an inferred one marked and a part with none as due", () => {
    const [broadband, firewall] = OFFERING.components;
    const { unmount } = render(<><RealisedAs part={broadband!} /><RealisationKey offering={OFFERING} /></>);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "CFSS GPON internet CFS Inferred, not stated in its source",
      "Resource GPON line",
    ]);
    const list = within(screen.getByRole("list"));
    expect(list.getByText("CFSS")).toHaveAttribute("title", "Customer facing service specification");
    expect(list.getByText("Resource").tagName).toBe("SPAN");
    expect(screen.getByText(/what the customer is sold/)).toHaveTextContent("Realised as: CFSS, what the customer is sold");
    unmount();

    render(<RealisedAs part={firewall!} />);
    expect(screen.getByText("Not stated").closest(".ds-status--attention")).not.toBeNull();
  });

  it("lists the offering's non-functional requirements, an undefined one as due", () => {
    render(
      <SourcesContext.Provider value={sourceRegister(EXPLORED)}>
        <NfrSection offering={OFFERING} headingId="nfrs" level={2} />
      </SourcesContext.Provider>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Non-functional requirements 2" })).toBeInTheDocument();
    const table = within(screen.getByRole("table", { name: "Non-functional requirements of Business Pro Plus" }));
    const availability = table.getByRole("row", { name: /Availability/ });
    expect(within(availability).getByText("Not defined").closest(".ds-status--attention")).not.toBeNull();
    // Said once: the gap its source leaves is what "Not defined" already says.
    expect(within(availability).queryByText("Its source leaves gaps")).not.toBeInTheDocument();
    expect(table.getByRole("row", { name: /Security/ }).querySelectorAll("td")[1]).toHaveTextContent("SAML SSO for the portal.SDD (L2) §11");
    expect(screen.getByText(/1 quality is not defined/)).toBeInTheDocument();
  });
});
