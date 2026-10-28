# ADR 0114 — Curated capability concepts may select systems

## Status

Accepted 2026-10-10 by the owner. Phase 0 of the ontology and impact plan
([plan](https://claude.ai/code/artifact/27b1b1d1-b01b-40d4-9264-1999bc29b2bf), from the
[catalogue ontology gap review](https://claude.ai/code/artifact/041e2507-4337-4cf9-80d5-ddd4b7f55470)).
Supersedes one rule each of requirement-portal ADR-0089 and ADR-0094, named below. Pairs with
requirement-portal ADR-0115 (the product verdict in analysis) and ADR-0116 (concepts reach
generation).

## Context

Mapping selects a system in two ways today: the requirement names it (`named_systems`), or the
reasoner picks it from retrieved evidence. Business words that are not system names reach a
system only if the embedding happens to rank its record high.

Two earlier decisions kept every curated business structure out of selection:
- **ADR-0089** rejected "letting the fallback map systems": a capability domain's name in the text
  is not evidence that a particular system changes. Domain suggestions are advice only.
- **ADR-0094** made landscape domains "maintenance and browsing only": impacts, fingerprints and
  prompts ignore them.

Both were right for trees of area names. The plan adds something different: a business
capability concept (a SKOS-style concept with a preferred label, alternative labels, a
definition and a broader concept) that a system is linked to only when a maintainer accepts the
link. The Phase 0 golden set measures what this costs today. With the fake models, today's mapper
finds 8.6% of the systems a reviewer expects (`docs/slices/ontology-phase-0-baseline.md`), because
most requirements describe what the business needs, not which system does it.

## Decision

**A curated capability concept may select the systems linked to it.**
- The link is curated: a `KnowledgeCapability.concept_id` or an
  `OfferingComponent.capability_ids` entry, saved only through an accepted catalogue candidate
  or a maintainer's own edit, and published with the release (Phase 1).
- A requirement facet reaches a concept by label match or by the concept index (Phases 2 and 3),
  never by a domain or landscape name alone.
- A system selected this way carries its path (facet, then concept, then system) and the
  evidence behind each step, so a reviewer sees why it was chosen. The quote rules stay: an
  answer naming an id outside the release, or quoting text not in its evidence, is rejected.
- An uncovered concept is reported as a gap. It is never forced onto the nearest system.

**What stays as it was.**
- Capability domains (ADR-0089) and landscape domains (ADR-0094) never select a system. Their
  suggestions remain advice.
- Component names never select a system (ADR-0092). A component's linked concepts can, through
  the concept, once linked.
- Nothing AI-proposed is published without a maintainer accepting it (`AGENTS.md` §8). A
  suggested concept link is a candidate until then.

**The product verdict vocabulary** lives in this repository's domain
(`domain/architecture/verdicts.py`): change to an existing offering, new plan, new offering in
an existing family, new product line, or no verdict while questions are open.

**Every retrieval change is scored on the golden set** (`tests/fixtures/golden/`) before it
ships, with the fake models in CI and with the configured models by hand
(`python -m knowledge_portal.interfaces.evaluate`).

## Consequences

- Requirements that describe a need, not a system, can reach the right systems, with a path a
  reviewer can check.
- Maintainers curate one more structure, and concept links need review like any candidate. A
  release whose concepts are unlinked behaves as today.
- A wrongly accepted concept link now changes mapping, not just browsing. The golden set and the
  override rate (Phase 5) are how that is caught.
- Approval fingerprints in requirement-portal will include the concept path once impacts carry
  it, so a changed path re-opens review there (ADR-0115).

## Alternatives Considered

- **Keep concepts advisory, like domains.** Rejected: the golden set shows name matching misses
  most expected systems, and advice the reviewer must act on by hand does not raise recall.
- **Let capability domains select systems.** Rejected for the reason ADR-0089 gave: an area name
  is not evidence about a particular system.
- **An LLM-extracted knowledge graph.** Rejected in the gap review: links nobody reviewed would
  select systems.

## Amendment 1 — Decided verdicts as precedents (Phase 5)

Proposed 2026-10-11 with ontology plan Phase 5
(`docs/slices/ontology-phase-5-retrieval-quality.md`), for the owner's acceptance in review.

- **Requirement text is kept here.** When a Requirement Owner accepts, overrides or leaves
  unknown a suggested verdict, requirement-portal sends the decision with the requirement's
  text (at most 4,000 characters), its concepts, offering and systems. This service keeps it
  as a precedent, embedded with the evidence index's model, one per requirement analysis.
  Only requirement work's service token writes it. Knowledge admins read counts per release
  and per concept, never the text.
- **A precedent may offer a system, never select one.** When at least two of the three
  nearest decided requirements are for the same offering, share a needed concept, and changed
  the same system, that system becomes a supporting candidate with the path "Decided
  requirement … › system". The reasoner selects it only with evidence, as for any candidate.
- **Precedents are examples, never citations.** The reasoner sees the nearest decisions as
  worked examples, and every quote still comes from the release's evidence.
- **A requirement never sees its own decision.** The assessment names the requirement, and its
  own precedents are left out.

## Amendment 2 — one system's bad citation sets that system aside (2026-10-28)

Proposed 2026-10-28, for the owner's acceptance in review. It narrows the Decision's "an answer
… quoting text not in its evidence, is rejected" for both architecture reasoning (the match) and
weighing the verdict.

- **A citation that cannot be checked is dropped, not the answer.** A quote not found in the
  passage it cites (#154, #155), or a citation naming a passage the model was not given, is left
  out. The system keeps its other citations.
- **A system left with no checked citation is set aside** and named in the uncertainty, which
  says which: "no quote was found in the passage it cited" or "the passage it cited was not one
  supplied". The verdict and the other systems stand, so requirement work still gets product
  impact.
- **These still fail the whole answer (502):** a system or offering outside the release, a
  system selected with no citation at all, and a model answer that does not parse. Nothing set
  aside is ever kept as evidence.

## Amendment 3 — a reading's facets are checked one by one (2026-10-28)

Proposed 2026-10-28, for the owner's acceptance in review. It does for the requirement reader
what Amendment 2 does for the match and the verdict.

- **A quote may join lines from separate items.** On a requirement of 292 items, GPT-5.1 gave
  one facet in about eight runs a quote made of two real sentences from items that are not
  next to each other, joined by a new line. Each line is the requirement's own words, but the
  whole is not one span, so the assessment failed (502, "Requirement reading invented a
  quote"). Such a quote now counts as the requirement's when each of its non-empty lines is
  found in it (spacing and case folded, as before). Any line that is not found means the quote
  is not the requirement's. The quote is kept as the model gave it: nothing downstream reads it
  as one span.
- **A facet whose quote is not the requirement's is set aside,** and the rest of the reading
  stands. The assessment has no field the reader can name it in on every path, so the reader
  logs how many facets were set aside and how many were kept, never their text.
- **These still fail the reading (502):** a reading left with no need once facets are set aside
  (with today's message), a catalogue id or change type outside the lists the reader was given
  (an id outside the release fails the answer, as in Amendment 2), a blank facet, and a model
  answer that does not parse.

## Amendment 4 — precedents compare the text they keep, and are never fatal (2026-10-28)

Proposed 2026-10-28, for the owner's acceptance in review. It corrects Amendment 1.

- **The lane compares a requirement as a precedent keeps it.** A precedent keeps its
  requirement's first `TEXT_LIMIT` (4,000) characters, but the lane embedded the whole of the
  requirement being assessed. On 2026-10-28 that was 45,189 characters, which
  `openai/text-embedding-3-small` refuses (8,192 tokens at most), and the assessment failed
  (502, "The embedding service returned unusable output"). One function, `precedent_text`, now
  builds the text on both sides: the non-blank parts one per line, cut at `TEXT_LIMIT`. The
  concepts suggested to a vague requirement are found with the same text, since that was the
  only other place the whole requirement was embedded.
- **Precedents that cannot be embedded leave the assessment without them.** They lend worked
  examples and supporting candidates, never a selected system, so a failure to embed the
  query is logged (with no requirement text) and the assessment goes on with none, as it does
  for a reranker that fails. Searching the store and every other lane still fail as before.
