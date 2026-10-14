import { describe, expect, it } from "vitest";

import { roleName } from "../../design-lab/catalogue/words";
import { fromRelease, journeyView } from "./adapter";
import release from "./fixtures/smb-release.json";
import { impactOf } from "./impact";
import { byRank } from "./model";
import { asRelease } from "./sample";
import { roleCode, roleTerms, stepRole } from "./vocabulary";

describe("roles and the vocabulary", () => {
  it("reads a role code one way, however the source writes it", () => {
    expect(roleCode("CUSTOMER_DATA")).toBe("customer-data");
    expect(roleCode(" Customer data ")).toBe("customer-data");
    expect(roleCode("")).toBeUndefined();
    // Without a code, the role term the activity names.
    expect(stepRole(null, "role-orchestrate")).toBe("orchestrate");
    expect(stepRole("BILL", "role-orchestrate")).toBe("bill");
  });

  it("names each role the SMB vocabulary holds, by code", () => {
    const terms = roleTerms(asRelease(release));
    expect(Object.keys(terms)).toHaveLength(12);
    expect(terms["customer-data"]).toBe("Customer data");
    expect(terms.orchestrate).toBe("Orchestrate");
  });

  it("keeps the lab's words for the roles it knows, long and short", () => {
    const data = { roleTerms: { capture: "Capture" } };
    expect(roleName(data, "capture")).toBe("Captures the order");
    expect(roleName(data, "capture", "short")).toBe("Captures");
    expect(roleName(data, "field")).toBe("Field work");
  });

  it("names a role it doesn't know from another vocabulary, or as written, never leaving it unnamed", () => {
    expect(roleName({ roleTerms: { payment: "Take payment" } }, "payment")).toBe("Take payment");
    expect(roleName({ roleTerms: {} }, "payment-gateway")).toBe("Payment gateway");
  });

  it("keeps a role the lab doesn't know on its step, ranked after the known ones", () => {
    const changed = structuredClone(asRelease(release));
    const journey = changed.journeys!.find((item) => item.id === "bpp-new-activation")!;
    const step = journey.activities.find((item) => item.number === "200")!;
    step.role = "PAYMENT";
    const data = fromRelease(changed);
    const view = journeyView(data, "bpp-new-activation", "bcrm")!;
    expect(view.steps.find((item) => item.id === "200")).toMatchObject({ role: "payment" });

    const impact = impactOf(data, { offeringId: "business-pro-plus", orderType: view.orderType, channel: "bcrm" });
    const roles = [...impact.systems.values()].find((item) => item.roles.includes("payment"))?.roles ?? [];
    expect(roles.at(-1)).toBe("payment");
    expect(["payment", "record", "orchestrate"].sort(byRank)).toEqual(["orchestrate", "record", "payment"]);
  });
});
