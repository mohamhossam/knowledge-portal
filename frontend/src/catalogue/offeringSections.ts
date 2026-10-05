/** The sections of an offering's sheet, each edited on its own (requirement-portal ADR-0101). */
import type { ReactNode } from "react";

import {
  OfferingDecisions, OfferingFacts, OfferingNfrs, OfferingNotes, OfferingOrderTypes, OfferingParts, OfferingQuestions, OfferingRules,
  OfferingSources, OfferingTracking, type SectionProps,
} from "./OfferingEditor";

/** The sections of an offering's sheet that are edited on their own, in the sheet's order. */
export type OfferingSection = "facts" | "orders" | "parts" | "nfrs" | "tracking" | "notes" | "questions" | "decisions" | "sources" | "rules";

export const OFFERING_SECTIONS: Record<OfferingSection, { edit: string; save: string; Fields: (props: SectionProps) => ReactNode }> = {
  facts: { edit: "what it is", save: "Save what it is", Fields: OfferingFacts },
  orders: { edit: "the order types", save: "Save the order types", Fields: OfferingOrderTypes },
  parts: { edit: "the parts", save: "Save the parts", Fields: OfferingParts },
  nfrs: { edit: "the non-functional requirements", save: "Save the non-functional requirements", Fields: OfferingNfrs },
  tracking: { edit: "the order tracking", save: "Save the order tracking", Fields: OfferingTracking },
  notes: { edit: "the lifecycle notes", save: "Save the lifecycle notes", Fields: OfferingNotes },
  questions: { edit: "the open questions", save: "Save the open questions", Fields: OfferingQuestions },
  decisions: { edit: "the architecture decisions", save: "Save the decisions", Fields: OfferingDecisions },
  sources: { edit: "the sources and boundaries", save: "Save the sources and boundaries", Fields: OfferingSources },
  rules: { edit: "the rules", save: "Save the rules", Fields: OfferingRules },
};
