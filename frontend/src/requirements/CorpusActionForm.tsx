import type { RefObject } from "react";

import type { CorpusRequirement } from "../api/client";
import { ConsequencePanel } from "../design/components";
import { count } from "../home/format";

export type CorpusActionKind = "retire" | "reinstate";

const WORDS: Record<CorpusActionKind, { title: string; commit: string; busy: string; reversibility: string }> = {
  retire: {
    title: "Retire it from the corpus",
    commit: "Retire it",
    busy: "Retiring…",
    reversibility: "You can reinstate it later, with a reason; it is then screened afresh.",
  },
  reinstate: {
    title: "Return it to the corpus",
    commit: "Reinstate it",
    busy: "Reinstating…",
    reversibility: "You can retire it again later, with a reason.",
  },
};

/** Who requirement work will tell, in words: the owner by name, "you", or nobody. */
function told(item: CorpusRequirement, me: string | undefined): string {
  if (!item.owner) return "It has no owner to tell.";
  return item.owner.id === me ? "You own it, so you are told why." : `${item.owner.display_name} is told why.`;
}

/** What follows, for this requirement: its own findings and its own owner. */
function consequence(item: CorpusRequirement, kind: CorpusActionKind, me: string | undefined): string {
  if (kind === "reinstate") {
    return `It is indexed again, and screened afresh the next time its Knowledge step is opened. ${told(item, me)}`;
  }
  const findings = item.open_findings === 0
    ? "It has no open findings."
    : `${item.open_findings === 1 ? "Its open finding closes" : `Its ${count(item.open_findings, "open finding")} close`} as “source retired”.`;
  return `It leaves screening, knowledge search and suggestions until someone reinstates it, and stays readable in requirement work. ${findings} ${told(item, me)}`;
}

/**
 * Retiring a requirement or returning it, asked in place on its record: what follows, who is
 * told, whether it can be undone, then the reason. Requirement work records the reason with
 * the action and tells the owner, so it is required.
 */
export function CorpusActionForm({ item, kind, me, busy, error, onSubmit, onCancel, panelRef }: {
  item: CorpusRequirement;
  kind: CorpusActionKind;
  /** The signed-in admin, to say "you" when they own the requirement. */
  me: string | undefined;
  busy: boolean;
  error: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
  panelRef?: RefObject<HTMLElement | null>;
}) {
  const words = WORDS[kind];
  return (
    <ConsequencePanel
      title={<>{words.title}: <bdi>‘{item.title}’</bdi></>}
      happens={consequence(item, kind, me)}
      reversibility={words.reversibility}
      reason={{ label: "Why", hint: "Requirement work records it and tells the owner.", maxLength: 500 }}
      confirmLabel={words.commit}
      busyLabel={words.busy}
      keepLabel="Cancel"
      busy={busy}
      failure={error}
      onConfirm={onSubmit}
      onKeep={onCancel}
      panelRef={panelRef}
    />
  );
}
