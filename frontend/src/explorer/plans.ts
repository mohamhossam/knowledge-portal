/**
 * How the explorer says a product catalog's prices. The catalog is the system
 * of record (requirement-portal ADR-0101): an amount is printed exactly as it
 * states it, in its own currency, never converted or rounded away.
 */
import type { PlanPrice } from "../api/client";

/** "AED 2,740.00"; a currency the browser does not know is printed as the catalog gives it. */
export function formatAmount(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "code" }).format(value);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** When a price falls due: "Every month", "Every 3 months", "Once", "Per GB". */
export function falling(price: PlanPrice): string {
  if (price.kind === "one_time") return "Once";
  if (price.kind === "usage") return price.unit ? `Per ${price.unit}` : "By use";
  const [every, ...rest] = (price.period ?? "").split(" ");
  const unit = rest.join(" ").replace(/s$/i, "").toLocaleLowerCase();
  if (!unit) return price.period ? `Every ${price.period}` : "Recurring";
  return Number(every) === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
}
