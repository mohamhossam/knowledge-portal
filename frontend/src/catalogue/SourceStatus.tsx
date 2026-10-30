import { AlertTriangle, Check, CircleDashed } from "lucide-react";

import type { SourceConfidence } from "../api/client";
import { Status } from "../design/components";
import { CONFIDENCE } from "./catalogue";
import { SOURCE_TONE, SOURCE_WORD } from "./ontology";

/** Confirmed is checked, inferred a dashed ring (implied, not drawn in its source), a gap needs attention; never neutral's clock, which reads as waiting. */
const SOURCE_ICON: Record<SourceConfidence, typeof Check> = {
  confirmed: Check,
  inferred: CircleDashed,
  gap: AlertTriangle,
};

/**
 * How sure a fact's source is, as a status. It says the whole of it, "Inferred, not stated in its
 * source", unless `short` says a Source column or label already names what it is about: a bare
 * "Inferred" elsewhere reads as a model having inferred it.
 */
export function SourceStatus({ confidence, short }: { confidence: SourceConfidence; short?: boolean }) {
  return (
    <Status tone={SOURCE_TONE[confidence]} icon={SOURCE_ICON[confidence]}>
      {short ? SOURCE_WORD[confidence] : CONFIDENCE[confidence]}
    </Status>
  );
}
