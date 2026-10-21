# One canonical dependency model, part 1: the dependency itself

## Objective

The first of two slices implementing ADR-0119: make `SystemRelationship` fit to be the one
canonical edge for "what depends on what". It gains `confidence` and `source`, like every
other catalogue fact, and its identity becomes its source, target and kind, with what it is
for an attribute. Part 2 derives dependency suggestions from interfaces and journeys.

## User Outcome

A curator rewording what a dependency is for sees one change, "Changed: what it is for",
not a removal and an addition. Two systems can depend on each other in two ways at once
("calls the API of" and "sends events to"), each its own connection. Where a dependency is
said, and how sure that source is, travels with it through the API and every file format.

## Business Rules

1. A dependency is identified by its source, target and kind; a pair holds at most one of
   each kind. Changing its kind replaces it.
2. Its description says what it is for; rewording it is an edit.
3. Any release built or read, including one stored while the description was part of the
   identity, holds one dependency per source, target and kind: several of one kind join
   their descriptions ("Lookup; Quotes"), keep the first confidence and source given, and
   keep every acceptance recorded on any of them. The first diff against such a release
   reports the joined ones once.
4. A suggested dependency that states a kind means the one of that kind, or the pair's
   unspecified one, which learns the kind; one that states no kind means the pair's
   unspecified dependency, or its only one. A purpose not said yet joins the description;
   nothing is replaced.

## Domain

- `SystemRelationship`: `confidence`, `source`, `key`; `with_purpose`;
  `merged_relationships`, applied by the aggregate in place of the uniqueness check.
- `candidates.py`: `_relationship` and `_with_suggested` (rule 4).
- `diff.py`: relationships keyed `source->target:kind`, changed fields `description`,
  `confidence`, `source`.
- `acceptance.py`: a dependency's provenance key is its new identity.

## Application

No change: hand edits, file imports and acceptances all reach the aggregate.

## Ports

None new.

## Adapters

- Catalogue files: `confidence` and `source` on dependencies in YAML and JSON, and as
  optional Relationships columns.

## API

- `confidence` and `source` on `SystemRelationshipSchema`. Public contract, additive; the
  internal contract is unchanged.

## UI

- The change table reads a connection's kind from its key, so even a removed one says how
  the systems were linked ("CWOM no longer calls the API of Legacy"), and names a changed
  connection's fields in words ("Changed: what it is for").
- Adding a connection refuses only a second one of the same kind between the same systems.

## In Scope / Out of Scope

- In: everything above.
- Out, to part 2: deriving dependency suggestions from interfaces and journey integrations,
  and retiring the adjacent-systems fallback (#109) once curators accept them.

## Acceptance Criteria

- A stored release with three same-kind dependencies between one pair reads as one, its
  descriptions joined, its first source kept, both acceptances kept.
- Two kinds between one pair are two dependencies; changing a kind diffs as removed and
  added; rewording diffs as changed `description`.
- Suggestions follow rule 4.
- Every file format round-trips confidence and source.
- The changes page shows two added connections between one pair with their own verbs, and a
  reworded one as "Changed: what it is for"; axe finds nothing in light, dark and narrow.

## Tests

- `tests/unit/test_canonical_dependency_model.py`.
- `tests/unit/test_relationship_kinds.py`: the kind-change test now asserts the ADR-0119 rule
  (the earlier one held the kind an attribute).
- `frontend/src/catalogue/drafting.test.ts`: sentences from the kind in the key, and the
  connection field words.

## Validation Evidence

- `uv run pytest`: 1340 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean.
- Frontend: `lint`, `typecheck`, `test` (914 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean; `npm run e2e`: 179 passed.
- Live check against the offline stack: a draft given BCRM → DCRM twice (calls its API,
  sends it events) and one reworded dependency through `PUT /architecture-knowledge/releases/{id}`;
  the changes endpoint returned `bcrm->dcrm:calls_api` and `bcrm->dcrm:publishes_events_to`
  added and `b2b-web->b2b-bff:calls_api` changed `description`; the page read "BCRM calls the
  API of DCRM", "BCRM sends events to DCRM" and, after a fix this check prompted, "Changed:
  what it is for" (it first read "Its description" after the purpose); axe found nothing in
  light, dark or at 600px.
