# Sources and conflicts suggested from documents

## Objective

The last of the suggestion kinds ADR-0123 adds as the owner decided ("every remaining type"):
the sources the catalogue is read from and the conflicts between them (requirement-portal
ADR-0101, step 5). Documents name the designs and specifications they rest on and, now and
then, say outright that two of them disagree; until now a curator typed each source and
conflict into a catalogue file.

## User Outcome

A curator reads a design note into a draft. Decide lists, under Sources, "Registers the source
Quokka Product Design (QPD), level L2", and, under Conflicts between sources, "Records the
conflict Quokka upload speed: QPD says “upload is 100 Mbps”; WLN says “upload is 50 Mbps”",
waiting for both sources. Accepting all registers the sources and leaves the conflict for a
decision of its own.

## Business Rules

1. A source suggestion holds a whole source: its title, the short name it is cited by, its
   version, what it is the authority for, and its level: L3 (a baseline) unless the document
   states one.
2. A conflict suggestion holds a whole conflict: a title, both sides (the source as the
   document names it, what it says, and where), the offerings it affects by name, and what
   differs. The model proposes one only when the document itself says the sources disagree.
3. A source is the draft's when it has the same id or answers to its title or short name;
   accepting fills its unset short name, version, file, authority, scope and boundary and never
   changes its title or level.
4. A conflict waits for the two sources it cites (`needs_source`), then for the offerings it
   affects (`needs_offering`). It is the draft's when it has the same id or title; accepting
   adds the offerings it affects and fills unset text, and never replaces the sides.
5. A conflict is always decided one by one: accepting all never takes it, whatever it waits
   for.
6. Accepting records either on what it produced (ADR-0120), and every catalogue file carries
   it.
7. Sources are accepted first, so offerings and conflicts naming them can follow; conflicts
   last.

## Domain

- `governance.py`: `accepted` on `KnowledgeSource` and `SourceConflict`, `find_source_among`,
  `merge_sources`, `merge_conflicts`.
- `candidates.py`: `CandidateKind.SOURCE` and `CONFLICT`, `CandidateMatch.NEEDS_SOURCE`,
  `CandidateContent.knowledge_source` and `conflict`, `_current_source`, `_resolved_conflict`,
  `_current_conflict`, `_with_source`, `_with_conflict`; classify, apply, missing systems,
  possible matches, and `needs_one_by_one` for conflicts.
- `acceptance.py`: sources and conflicts carry provenance.

## Application

- `catalogue_candidates.py`: their places in accepting order, their subjects kept apart from
  systems, and one suggestion per source and per conflict (`_subject`, `_merged_content`).

## Ports

None.

## Adapters

- The extraction prompt (`catalogue-extraction-v20`, full readings only): `source` and
  `conflict` items with the new `source_level`, `source_version`, `conflict_sides` and
  `affected_offerings`.
- The offline extractor reads `Source: Title [L2] as SHORT` and
  `Conflict: Title; A says …; B says …; affects X, Y`.

## API

- `knowledge_source` and `conflict` on `CandidateContentSchema`; read-only `accepted` on
  `KnowledgeSourceSchema` and `SourceConflictSchema`. Public contract, additive.

## UI

- `suggestions.ts`: the sentences, what a conflict waits for, the Sources and Conflicts between
  sources sections, their dependency keys, the lexicon's `source`, `inWords`, and
  `needsOneByOne` for every conflict.
- The suggestion editor: a source's title, short name, version, level and authority; a
  conflict's title, what differs, what it holds up and the decision it needs, its sides as the
  document says.

## In Scope / Out of Scope

- In: rules 1 to 7.
- Out: deciding a conflict (the curator records the decision in the catalogue); naming a
  conflict's order types or questions (a catalogue file does).

## Acceptance Criteria

- Classify and apply as rules 3 and 4; a missing source refuses with its name.
- Through the API, a document with two sources and a conflict between them suggests each;
  accepting all registers the sources and leaves the conflict; accepting the conflict alone
  records it citing the registered sources, with its provenance; every file format keeps the
  provenance.
- Decide shows them under Sources and Conflicts between sources; axe finds nothing.

## Tests

- `tests/unit/test_source_conflict_suggestions.py`; `frontend/src/catalogue/suggestions.test.ts`.

## Validation Evidence

- `uv run pytest`: 1410 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean; contracts and the catalogue fixture regenerated.
- Frontend: `lint`, `typecheck`, `test` (937 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean. CI's e2e is the authority for the route journeys.
- Live check against the offline stack: a note naming Quokka Product Design [L2] as QPD,
  Wombat Landscape Notes as WLN and a conflict between them gave two suggestions under Sources
  ("Registers the source Wombat Landscape Notes (WLN), level L3") and one under Conflicts
  between sources, marked as needing a decision. Decide offered "Accept the 2 ready"; accepting
  all registered both sources and left the conflict; accepting it alone recorded it citing
  src-qpd and src-wln, each with its suggestion. axe (WCAG 2.2 AA) found nothing on Decide or
  the conflict editor in light, dark or at 600px.
