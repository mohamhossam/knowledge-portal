# ADR 0120 — Provenance survives acceptance

## Status

Accepted 2026-10-21 by the owner; implemented in `docs/slices/provenance-survives-acceptance.md`.
Proposed 2026-10-19. Implements review finding #10 of the portal review
([report](https://claude.ai/code/artifact/d5147883-5ccd-472f-a57a-6a2464b2fd53));
AGENTS.md §7.14 already requires provenance on generated content.

Settled while implementing it: the value object lives in its own leaf module
(`domain/architecture/provenance.py`), since `candidates.py` imports the entities that carry
it; the catalogue files hold the entries in one `acceptances` table keyed by entity rather
than inside each entry; an imported file adds the entries it recorded that the draft does not
hold (point 4 governs edits made on a page, which send none); and the explorer, which any
signed-in user reads, carries none.

Amended 2026-10-22 (review recommendation 6 of the 22 October portal review): an entry also
keeps where its suggestion was read, its first three citations (location and quote), with
the document version id and title when the suggestion came from one of the draft's
documents. The candidate table stays working data, replaced on each reading, so without
this the fact led back to its passage only while the draft kept the suggestion. A
suggestion read from the catalogue itself or from a change request names no document. The
catalogue files carry the citations with each entry (`citations`; a JSON list in the
workbook's Acceptances sheet).

## Context

A catalogue candidate carries full provenance: model, prompt version, reader, verbatim
citations, basis, and who decided it when. `apply_candidate`
(`domain/architecture/candidates.py`) then builds plain domain objects, so inside a
published snapshot an AI-accepted fact, a maintainer's own edit and a seed fact are
indistinguishable except by joining back to the per-release candidate table — which is
working data, replaced on each extraction run. The free-text `source` field names the
*document* a fact came from, not what generated and who approved it.

The subtlety is merging: a candidate often updates an existing entity (adds an alias, a
component, a capability link). Marking the whole entity as model-produced would be wrong
for an entity that is 90% hand-written.

## Decision

1. A frozen value object `AcceptedFrom(candidate_id, model, prompt_version, decided_by,
   decided_at)` in `domain/architecture/candidates.py`.
2. Every entity `apply_candidate` can create or extend carries
   `accepted: tuple[AcceptedFrom, ...] = ()`, newest last. Creating an entity appends one
   entry; merging a candidate into an existing entity also appends one entry — the entry
   records *that* an accepted suggestion contributed, not which fields (field-level
   provenance is not worth its cost; the candidate's citations remain the detail trail
   while the release holds it).
3. The tuple is serialised in release snapshots and in the catalogue file formats, shown
   beside `source` in the record UIs, and excluded from diff identity and field
   comparison (an acceptance is not a reviewable change to the fact itself).
4. A maintainer's direct edit never appends or removes entries; history stays history.

## Consequences

- "Who and what put this here" answers from the snapshot alone, as §7.14 intends, and
  survives candidate-table replacement and release export/import.
- Snapshots and file exports grow a little; the file formats need a read path that
  tolerates the field's absence (older files mean "nothing recorded", not "human-written").
- Entity-level granularity is a floor: an entity touched once by a model carries that mark
  even where most of it is hand-written. The candidate's citations disambiguate while
  they exist.

## Alternatives Considered

- **Overload the free-text `source`.** Rejected: it conflates document origin with
  generation provenance and cannot carry who decided.
- **Join to the candidate table at read time.** Rejected: candidates are per-release
  working data, replaced on each run; a snapshot must stand alone.
- **Field-level provenance.** Rejected for cost: every entity would need a parallel
  field-map, and merges would still need judgment calls.
