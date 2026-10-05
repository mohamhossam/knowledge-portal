import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { Offering } from "../api/client";
import { EXPLORED } from "../explorer/fixtures";
import { fieldsInWords } from "./drafting";
import { offeringProblem } from "./editing";
import { OfferingEditor } from "./OfferingEditor";

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
    fireEvent.click(within(firewall).getByRole("button", { name: /Add a layer/ }));
    fireEvent.change(within(firewall).getByLabelText("Layer"), { target: { value: "resource" } });
    fireEvent.change(within(firewall).getByLabelText(/^Name/), { target: { value: "Fortinet HE CPE" } });
    expect(last.components[1]!.realisation).toEqual([{ layer: "resource", name: "Fortinet HE CPE" }]);

    const nfrs = screen.getByRole("group", { name: "Non-functional requirements" });
    fireEvent.click(within(nfrs).getByRole("button", { name: /Add another non-functional requirement/ }));
    const added = within(nfrs).getAllByLabelText(/^Quality/).at(-1)!;
    fireEvent.change(added, { target: { value: "Audit" } });
    expect(last.nfrs.at(-1)).toEqual({ quality: "Audit", coverage: "missing" });
  });

  it("says why an offering cannot be sent yet", () => {
    const unnamed = { ...OFFERING, components: [{ ...OFFERING.components[0]!, realisation: [{ layer: "cfs" as const, name: " " }] }] };
    expect(offeringProblem(unnamed)).toBe("Every layer a part is realised in needs a name.");
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
