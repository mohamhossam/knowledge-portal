# Data with more than one owner: mastery notes

## Objective

Implement ADR-0123 decision 1: an information entity may have several systems of record
when each says which part it masters. The committed catalogue has CBCM and Netcracker CRM
both mastering Customer, which the model allowed without saying what it meant.

## User Outcome

A curator opening a draft's Check step sees "Data with more than one owner": Customer,
mastered by CBCM and Netcracker CRM, each owner with its note or "No note yet". Publish lists
the same as worth a look and never holds publishing for it. The system record shows "Its
share of Customer: …" under Masters.

## Business Rules

1. `SystemDefinition.mastery_notes`: notes of `entity_id` and `note`, both required.
2. A note names an entity its system masters, and an entity at most once.
3. Several masters of one entity are allowed; a master without a note is a reminder only, and
   a retired system is not counted.
4. The diff names `mastery_notes` as a changed field.

## Domain

- `knowledge.py`: `MasteryNote`; rule 2 in `SystemDefinition`. `diff.py`: rule 4.

## Application

None.

## Ports

None.

## Adapters

- Catalogue files: `mastery_notes` (`entity`, `note`) on a system in YAML and JSON; a
  MasteryNotes workbook sheet (`system_id`, `entity_id`, `note`), optional on import, with
  an instructions line.

## API

- `MasteryNoteSchema` and editable `mastery_notes` on `SystemDefinitionSchema`. Public
  contract, additive; the internal contract is unchanged.

## UI

- `frontend/src/catalogue/mastery.ts` (`sharedMastery`), the Check step's "Data with more
  than one owner", Publish's "Worth a look" item, the system record's note facts.

## In Scope / Out of Scope

- In: rules 1 to 4.
- Out: writing the two notes on the committed catalogue. No source says which customers each
  system masters, so they are not invented; the owner supplies them. (Done 2026-10-21 from the
  owner's account of the NC Digital migration.) Editing notes on the
  system sheet: masters and reads change through a catalogue file today, and so do notes.

## Acceptance Criteria

- The committed catalogue loads unchanged and shares Customer between CBCM and Netcracker CRM.
- An unmastered or repeated note is refused; a blank note is refused.
- Every file format round-trips the notes; the diff names them; the API saves one and refuses
  an unmastered one with 422.
- Check lists the shared entity with each owner's note or "No note yet"; axe finds nothing in
  light, dark and narrow.

## Tests

- `tests/unit/test_shared_mastery.py`; `frontend/src/catalogue/mastery.test.ts`;
  `frontend/src/catalogue/draft/draft.test.tsx` (Check).

## Validation Evidence

- `uv run pytest`: 1367 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean. The frontend catalogue fixture regenerated
  (`scripts/dump_catalogue_fixture.py`); the template test names the new sheet.
- Frontend: `lint`, `typecheck`, `test` (919 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean; `npm run e2e`: 179 passed (one keyboard journey
  passed on its retry, and again alone).
- Live check against the offline stack, a draft holding the committed catalogue with CBCM's
  note written through `PUT …/systems/cbcm`: Check listed Customer with "CBCM: Customers not yet
  migrated to Netcracker" and "Netcracker CRM (NC Digital): No note yet"; Publish said "1 kind
  of information has several systems of record without saying which part each masters"; CBCM's
  record read "Its share of Customer". axe (WCAG 2.2 AA) found nothing on the three pages in
  light, dark or at 600px.
