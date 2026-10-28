/**
 * Where an order type sits in the customer's life with a product: joining,
 * changing a live account, getting support, or leaving, as the version states
 * it (the service's customer stages). An order type or journey whose version
 * states none is shown as not staged, never guessed. The journey switcher and
 * the order-type matrix group by the same stages.
 */
export const STAGES: { id: string; name: string; blurb: string }[] = [
  { id: "join", name: "Join", blurb: "Becoming a customer" },
  { id: "change", name: "Change", blurb: "Changing a live account" },
  { id: "support", name: "Support", blurb: "Tracking, repairs and visits" },
  { id: "leave", name: "Leave", blurb: "Ending or suspending the service" },
  { id: "unstaged", name: "Not staged", blurb: "The version doesn't say" },
];

/** An order type's or a journey's stage, as the version states it; "unstaged" when it states none. */
export function stageOf(item: { stage?: string | null }): string {
  return item.stage && STAGES.some((stage) => stage.id === item.stage) ? item.stage : "unstaged";
}
