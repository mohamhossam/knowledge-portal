/** The sections of an offering's sheet, each edited on its own (requirement-portal ADR-0101). */
import type { ReactNode } from "react";

import {
  OfferingFacts, OfferingNfrs, OfferingNotes, OfferingOrderTypes, OfferingParts, OfferingRules, OfferingTracking, type SectionProps,
} from "./OfferingEditor";

/** The sections of an offering's sheet that are edited on their own, in the sheet's order. */
export type OfferingSection = "facts" | "orders" | "parts" | "nfrs" | "tracking" | "notes" | "rules";

export const OFFERING_SECTIONS: Record<OfferingSection, { edit: string; save: string; Fields: (props: SectionProps) => ReactNode }> = {
  facts: { edit: "what it is", save: "Save what it is", Fields: OfferingFacts },
  orders: { edit: "the order types", save: "Save the order types", Fields: OfferingOrderTypes },
  parts: { edit: "the parts", save: "Save the parts", Fields: OfferingParts },
  nfrs: { edit: "the non-functional requirements", save: "Save the non-functional requirements", Fields: OfferingNfrs },
  tracking: { edit: "the order tracking", save: "Save the order tracking", Fields: OfferingTracking },
  notes: { edit: "the lifecycle notes", save: "Save the lifecycle notes", Fields: OfferingNotes },
  rules: { edit: "the rules", save: "Save the rules", Fields: OfferingRules },
};
