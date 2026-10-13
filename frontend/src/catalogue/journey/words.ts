import { useId } from "react";

import type { EdgeKind } from "./layout";

/** An id usable inside `url(#…)`: React's ids carry characters a fragment reference may not. */
export function useSvgId(): string {
  return `journey${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export const KIND_WORDS: Record<EdgeKind, string> = {
  sequence: "Next step",
  decision: "A branch, with its condition",
  parallel: "A track that runs alongside",
  rejoin: "Rejoins the main track",
  loop: "Back to an earlier step",
  handover: "A hand-over no flow arrow covers",
};
