# Lifecycle: deprecation and replacement

## Objective

Implement ADR-0121: a system, a business capability concept or a vocabulary term can be
retired without deleting it, and can name what replaces it, so retirement is a reviewable
state change and a reference to the old one forwards instead of breaking.

## User Outcome

A maintainer retires a system on its sheet ("Retired: still readable, never matched again")
and picks what replaces it among the systems in service. The draft's changes list it, the
list draws its name struck through and says "Retired", and its record says "Retired ·
Replaced by DCRM" with a link. From then on no requirement maps to it, no assessment
reaches it, no suggestion lands on it, and a document that still says "BCRM" is read as
its successor. A squad seated on it is told "BCRM: retired, replaced by DCRM; move the seat
to it" instead of being told the system is gone.

## Business Rules

1. `SystemDefinition`, `BusinessCapability` and `VocabularyTerm` carry `deprecated` and
   `replaced_by`. Naming a successor retires the entity; it never names itself.
2. The successor is in the same release and of the same type (a term of the same
   vocabulary); a chain of replacements never comes back round.
3. A retired entity stays in every release and reads everywhere (records, diff, files,
   explorer).
4. Selection and matching leave it out. A reference to it forwards to its last successor
   in service, or means nothing when it was retired for good; it still holds its labels, so
   nothing new may take them.
5. The diff reports `deprecated` and `replaced_by` as changed fields.
6. The squad catalogue's drift check proposes the successor of a replaced system, still
   flags a system retired for good, and lets no new seat or product link name a retired one.

## Domain

- `deprecation.py`: `check_retirement` (one entity), `check_replacements` (a release),
  `in_service` and `successor`.
- Lookups split by purpose: `find_system`, `find_concept` and `find_term` match, forwarding
  per rule 4; `system_named`, `concept_named` and `term_named` say whether a label is taken.
  `labels_in` skips retired concepts; `retired_names` gives a successor the names of the
  systems it replaced.
- `diff.py` (rule 5); `organisation/catalogue.py`: `SystemSuccessor` and
  `ReferenceFlag.replaced_systems`, `ReleaseReferences.successors` (rule 6).

## Application

The selection paths, each now choosing only what is in service: requirement mapping
(`resolve_architecture_knowledge`, `architecture_evidence.named_systems`, both reasoners'
offered and allowed systems), assessment (`assessment_lanes`: one filter in `graph_lane`'s
`add` covers every way a system is reached; the shortlist, catalogue terms, precedents and
concept reach), the impact graph and the data ripple, the capability-domain fallback and
the assessment's question options, concept linking (the index's concept scheme, the
model's concept choices, the backfill), and document suggestions (the reader's and the
matcher's known systems, with the retired systems' names on their successors).
`settle_subject` keeps refusing a name a retired system holds.

## Ports

None new.

## Adapters

- Stored releases: the new fields default to in service.
- Catalogue files: `deprecated` and `replaced_by` on systems, concepts and terms in YAML and
  JSON, and as optional columns of the Systems, Concepts and Vocabulary sheets; absent means
  in service.

## API

- `deprecated` and `replaced_by` on `SystemDefinitionSchema`, `BusinessCapabilitySchema`
  and `VocabularyTermSchema`, editable; `SystemSuccessorResponse` and `replaced_systems` on
  `ReferenceFlagResponse`. Public contract, additive; the internal contract is unchanged.

## UI

- The system editor: the Retired checkbox and, once ticked, "Replaced by" among the systems
  in service; unticking clears it.
- `Retired` (`frontend/src/catalogue/Retired.tsx`) in the system and concept records' meta;
  in the systems and concepts lists the name struck through (`.cat-retired`) and the row
  saying "Retired" where its gap badge was. The words are plain quiet text, not the
  design system's stopped status: beside a name its square glyph reads as a box to tick.
- The squad and product checks word a replaced system.

## In Scope / Out of Scope

- In: everything above.
- Out: retiring concepts and terms on a page (they retire through a catalogue file today; the
  concept and term pages have no editor yet); retirement for other registers (ADR-0121,
  point 6); the evidence index still holds a retired system's record chunk, which nothing
  may select any more.

## Acceptance Criteria

- The invariants refuse a missing, self, other-kind or cyclic successor; naming one retires.
- The committed catalogue with CWOM retired, BCRM replaced by Netcracker CSRD and Wi-Fi
  access retired: an assessment that reached CWOM no longer does, nor links Wi-Fi access;
  per-item matching that found CWOM and BCRM finds neither and finds Netcracker CSRD; the
  index's concept scheme leaves Wi-Fi access out; CWOM realises nothing.
- Every file format round-trips the fields; the diff names them.
- A seat on a replaced system is pointed at its successor; one on a system retired for good
  is still flagged.
- The editor offers only systems in service; the record and the list say Retired in words;
  axe finds nothing in light, dark and narrow.

## Tests

- `tests/unit/test_lifecycle_deprecation.py`: the invariants, the diff, the lookups, the
  files, the sweep over assessment, matching and the index, and the drift check.
- `frontend/src/catalogue/retired.test.tsx`; `frontend/src/squads/organisation.test.ts`.

## Validation Evidence

- `uv run pytest`: 1330 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean.
- Frontend: `lint`, `typecheck`, `test` (914 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean; `npm run e2e`: 179 passed.
- Live check against the offline stack: BCRM retired by hand through
  `PUT /architecture-knowledge/releases/{id}/systems/bcrm` with DCRM as its successor; the
  draft's changes read `bcrm: deprecated, replaced_by`; the record says "Retired · Replaced
  by DCRM" linking DCRM's record; axe (WCAG 2.2 AA) found no violation in light, dark or at
  600px. The first look drew "Retired" with the stopped status, whose square read as a
  checkbox beside the name; it now says the word plainly.
