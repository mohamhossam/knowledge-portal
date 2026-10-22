# ADR 0121 — Lifecycle: deprecation and replacement

## Status

Accepted 2026-10-21 by the owner; implemented in `docs/slices/lifecycle-deprecation.md`.
Proposed 2026-10-19. Implements review finding #8 of the portal review
([report](https://claude.ai/code/artifact/d5147883-5ccd-472f-a57a-6a2464b2fd53)).

Settled while implementing it: a reference to a retired entity forwards to its last
successor in service, or matches nothing when it was retired for good, while the entity
keeps its labels so nothing new can take them (so each lookup has a matching form and a
label-ownership form); the reader is told a successor's old names, so a document that
still uses one is read as the successor; and a successor offered on the page is one still
in service. Concepts and terms retire through a catalogue file until their pages have an
editor.

Amended 2026-10-22 (review recommendation 7 of the 22 October portal review): offerings and
portfolio nodes retire the same way (`deprecated`, `replaced_by`), since registers outside a
version name them. One resolver (`identity.resolve`) follows an id through its former ids and
then through retirements to what names it now, and the organisation catalogue, precedents
and assessments read ids through it. A product naming a renamed or replaced offering or
portfolio node, or a squad seat scoped to a replaced concept, is told where the id went
rather than that it is gone, and an offering's systems are read under its new id. A precedent
counts for the system, offering and concepts its old ids name now. Registers used only inside
a version need no lifecycle: a version is checked whole when it is built. A system's review
stays its own; a successor is reviewed afresh.

## Context

Nothing in the knowledge model can be deprecated: retiring a system, concept or vocabulary
term means deleting it from the next snapshot, and nothing records that a new id replaces
an old one. Cross-release identity rests entirely on id strings — several of which encode
meaning (concept ids derive from labels, landscape ids embed their parent), so a rename is
a delete-plus-add. The squad catalogue's drift check can only flag a seat on a vanished
system as "retired", with no forwarding; lifecycle intent lives in free text (`roadmap`,
`lifecycle`).

## Decision

1. `SystemDefinition`, `BusinessCapability` and `VocabularyTerm` gain
   `deprecated: bool = False` and `replaced_by: str | None = None` (SKOS
   `owl:deprecated` / `dct:isReplacedBy` in spirit).
2. Invariants: `replaced_by` names an existing entity of the same type in the same
   release; it implies `deprecated`; replacement chains must not cycle.
3. A deprecated entity stays in snapshots and stays readable everywhere, is excluded from
   selection and matching (concept linking, system matching, candidate resolution), and
   is drawn struck-through-with-words in the UIs, never removed from history.
4. The diff reports `deprecated` and `replaced_by` as CHANGED fields; the squad drift
   check follows `replaced_by` and proposes the successor instead of flagging "retired".
5. The catalogue file formats carry both fields; absent means not deprecated.
6. Other registers (offerings, journeys, channels…) wait for a demonstrated need; this ADR
   covers the three types whose ids anchor selection and cross-release identity.

## Consequences

- Retirement becomes a reviewable, visible state change instead of silent deletion, and
  renames keep a forwarding pointer, so downstream references age gracefully.
- Selection paths must all honour the exclusion — a missed one quietly keeps matching
  deprecated entities; a test must sweep them.
- Replacement is same-type and in-release only: splitting one concept into two, or
  replacing across types, still needs words in the definition.

## Alternatives Considered

- **Validity dates (`valid_from`/`valid_to`).** Rejected for now: releases already
  timestamp state as a whole; per-entity dating adds a second clock with no consumer.
- **Hard delete plus a rename-tracking table.** Rejected: identity belongs in the model
  people review, not in a side table only the import knows about.
