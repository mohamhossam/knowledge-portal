/**
 * Where an order type sits in the customer's life with a product: joining,
 * changing a live account, getting support, or leaving. The journey switcher
 * and the order-type matrix group by the same stages.
 */
export const STAGES: { id: string; name: string; blurb: string; orderTypes: string[] }[] = [
  { id: "join", name: "Join", blurb: "Becoming a customer", orderTypes: ["NEW", "MIGRATE", "PORTIN"] },
  {
    id: "change",
    name: "Change",
    blurb: "Changing a live account",
    orderTypes: ["UPDOWNGRD", "ADDDELETE", "MODSUBS", "RENEWAL", "EXTSHIFTSITE", "CHNUMBER", "CHINTUSRN", "CHGPSWD", "CHGDOMN", "CHGSUBDOMN", "FLEXIMINMOV"],
  },
  { id: "support", name: "Support", blurb: "Tracking, repairs and visits", orderTypes: ["DVCREP", "TECHVISIT"] },
  { id: "leave", name: "Leave", blurb: "Ending or suspending the service", orderTypes: ["CESSREQ", "PORTOUT", "DUNNING"] },
];

/** The stage of an order type; an unknown code is a change, no code (order tracking) is support. */
export function stageOfCode(code: string | null | undefined): string {
  const upper = code?.toUpperCase();
  return STAGES.find((stage) => upper && stage.orderTypes.includes(upper))?.id ?? (upper ? "change" : "support");
}
