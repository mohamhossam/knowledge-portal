import { describe, expect, it } from "vitest";

import { roleName } from "../../design-lab/catalogue/words";
import { fromRelease, journeyView } from "./adapter";
import release from "./fixtures/smb-release.json";
import { impactOf } from "./impact";
import { byRank } from "./model";
import { asRelease } from "./sample";
import { channelKindTerms, roleCode, roleRank, roleTerms, stepRoleIn } from "./vocabulary";

type Term = NonNullable<ReturnType<typeof asRelease>["vocabulary"]>[number];

function term(id: string, label: string, extra: Partial<Term> = {}): Term {
  return { id, scheme: "responsibility_role", pref_label: label, alt_labels: [], close_match: [], deprecated: false, accepted: [], ...extra };
}

describe("roles and the vocabulary", () => {
  it("reads a role code one way, however the source writes it", () => {
    expect(roleCode("CUSTOMER_DATA")).toBe("customer-data");
    expect(roleCode(" Customer data ")).toBe("customer-data");
    expect(roleCode("")).toBeUndefined();
    // Without a code, the role term the activity names, by the term's label, whatever its id.
    const stepRole = stepRoleIn({ vocabulary: [{ ...term("role-orchestrate", "Orchestrate"), id: "r-17" }] });
    expect(stepRole(null, "r-17")).toBe("orchestrate");
    expect(stepRole("BILL", "r-17")).toBe("bill");
    expect(stepRole(null, "unknown")).toBeUndefined();
  });

  it("names each role the SMB vocabulary holds, by code", () => {
    const terms = roleTerms(asRelease(release));
    // Each of the 15 role terms, by the code of each of its labels ("Captures" too).
    expect(new Set(Object.values(terms)).size).toBe(15);
    expect(terms.captures).toBe("Capture");
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
    expect(["payment", "record", "orchestrate"].sort(byRank(data.roleRank))).toEqual(["orchestrate", "record", "payment"]);
  });

  it("ranks roles as the vocabulary does, not as the lab used to (review recommendation 10)", () => {
    expect(roleRank(asRelease(release)).slice(0, 3)).toEqual(["orchestrate", "capture", "activate"]);
    const vocabulary = [term("a", "Bill", { rank: 2 }), term("b", "Notify", { rank: 1 }), term("c", "Record")];
    expect(roleRank({ vocabulary })).toEqual(["notify", "bill"]);
    // A version saved before roles carried a rank keeps the order the lab kept.
    expect(roleRank({ vocabulary: [term("c", "Record")] })[0]).toBe("orchestrate");
  });

  it("names a channel kind by the codes its term's labels read as", () => {
    const kinds = channelKindTerms(asRelease(release));
    expect(kinds["self-service"]).toBe("Self-service");
    expect(kinds["digital-self-service"]).toBe("Self-service");
    expect(channelKindTerms({ vocabulary: [term("k-9", "Assisted", { scheme: "channel_kind" })] })).toEqual({ assisted: "Assisted" });
  });
});
