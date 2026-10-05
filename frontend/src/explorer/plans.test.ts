import { describe, expect, it } from "vitest";

import type { PlanPrice } from "../api/client";
import { falling, formatAmount } from "./plans";

const price = (extra: Partial<PlanPrice>): PlanPrice => ({ name: "Price", kind: "recurring", amount: "1", currency: "AED", ...extra });

describe("plans", () => {
  it("prints an amount in its own currency, exactly, kept on one line", () => {
    expect(formatAmount("2740", "AED")).toBe("AED\u00a02,740.00");
    expect(formatAmount("2.25", "USD")).toBe("USD\u00a02.25");
    expect(formatAmount("12.5", "points")).toBe("12.5 points");
    expect(formatAmount("lots", "AED")).toBe("lots AED");
  });

  it("says when a price falls due", () => {
    expect(falling(price({ period: "1 month" }))).toBe("Every month");
    expect(falling(price({ period: "3 Months" }))).toBe("Every 3 months");
    expect(falling(price({ period: null }))).toBe("Recurring");
    expect(falling(price({ kind: "one_time" }))).toBe("Once");
    expect(falling(price({ kind: "usage", unit: "GB" }))).toBe("Per GB");
    expect(falling(price({ kind: "usage" }))).toBe("By use");
  });
});
