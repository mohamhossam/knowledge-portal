import { describe, expect, it } from "vitest";

import type { Organisation, Release } from "../api/client";
import { gaps } from "./gaps";

const release = { systems: [{ id: "cwom", name: "CWOM" }, { id: "bscs", name: "BSCS" }, { id: "ecm", name: "ECM" }] } as unknown as Release;
const organisation = {
  squads: [
    {
      name: "Orders",
      resources: [
        { system_id: "cwom", role: "developer", person_id: "p1" },
        { system_id: "cwom", role: "system_contact", person_id: "p2" },
        { system_id: "bscs", role: "system_contact", person_id: null },
      ],
    },
  ],
} as unknown as Organisation;

describe("gaps", () => {
  it("names systems no squad runs and systems with no person in a contact seat", () => {
    expect(gaps(release, organisation).map((gap) => [gap.system.id, gap.kind, gap.squad])).toEqual([
      ["bscs", "no-contact", "Orders"],
      ["ecm", "no-squad", undefined],
    ]);
  });
});
