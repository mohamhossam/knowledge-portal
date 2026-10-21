# Library classification: a document's type and topics

## Objective

Implement ADR-0123 decision 3 as the owner narrowed it: a library document can say what kind
of document it is and which business capabilities it is about, from the catalogue's own
terms, so the library can be filtered by the catalogue's taxonomy. English only; no language
field, since the library takes English documents only.

## User Outcome

The owner of "Order Hub design" opens its "Type and topics" tab, picks "Solution design",
adds the topics "Order capture" and "Billing", and saves. The library
list's Type and Topic filters now offer them, and the document's summary says both. Uploading
a batch can give it a type straight away.

## Business Rules

1. `LibraryDocument.document_type`: the id of a `document_type` term of the catalogue in
   service, or none. `topics`: ids of business capability concepts in service, at most 20,
   none blank or repeated.
2. Only the document's owner sets them; each change takes the version the owner saw.
3. A value is accepted only while the catalogue in service offers it, in service and with an
   English label. A document keeps an id the catalogue later drops; it reads as "no longer in
   the catalogue" and is offered no more.
4. Classification is metadata: it does not change what requirement work may cite, and is not
   part of the event requirement-portal reads (`citable_state`).

## Domain

- `library.py`: the two fields, their invariants, `classified`.
- `vocabularies.py`: `VocabularyScheme.DOCUMENT_TYPE` (`doctype-` ids).

## Application

- `DocumentLibrary.classify` (owner only) and `submit(document_type=)`; `LibraryView` carries
  both fields.
- `LibraryClassification` (`use_cases/library_classification.py`): the options from the
  catalogue in service, and the check of rule 3.

## Ports

None new; it reads `ArchitectureKnowledgeRepositoryPort.active()`.

## Adapters

- Stored documents are JSON: the new fields default to none.
- Both catalogues (`catalogues/smb-architecture.yaml` and the packaged seed) gain eight
  document-type terms: Solution design, High-level design, Process book, Product
  specification, Contract, Policy, Guide, Other. This is curation, `confidence: inferred`.

## API

- `GET /library/classification-options`, `PUT /library/documents/{id}/classification`
  (`expected_version`, `document_type`, `topics`), and an optional `document_type` form field
  on `POST /library/ingestions`. Public contract, additive; the internal contract is
  unchanged.

## UI

- `frontend/src/library/classification.tsx` (options, labels, facts),
  `ClassificationForm.tsx` and `ClassificationPage.tsx`: the document's own "Type and
  topics" tab (`/library/{id}/about`), with a Type select and an "Add a topic" combobox, each
  topic removable; another admin reads them there. It is a tab of its own because the
  document's main page turns into the review desk when reading ends, which took a form on the
  Overview away mid-edit (found in the live check).
- Reading moves a document's version on its own, so a save refused as stale is tried again
  over the new version when the type and topics are still what the form opened with; when
  someone changed them meanwhile, the form says so instead.
- The Overview and the list's summary say the type and topics.
- The library list: Type and Topic filters in the address (`type`, `topic`), offered once a
  document has one; the summary says both. Upload: an optional type for the files added.

## In Scope / Out of Scope

- In: rules 1 to 4.
- Out: topics at upload (set on the document's page); search by type or topic over passages;
  a language field (the owner ruled it out).

## Acceptance Criteria

- The options are the catalogue's document types and concepts in service, sorted; a retired
  concept is not offered; an unknown type or topic is refused with 422.
- Upload with a type keeps it; the owner changes it with the version they saw; a stale
  version is refused (409), another person is refused (403).
- The list filters by type and topic; the summary and the page say both; axe finds nothing in
  light, dark and narrow.

## Tests

- `tests/unit/test_library_classification.py`; `frontend/src/library/classification.test.tsx`.

## Validation Evidence

- `uv run pytest`: 1364 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean; contracts and the catalogue fixture regenerated.
- Frontend: `lint`, `typecheck`, `test` (921 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean; `npm run e2e`: 182 passed, the new `library-about`
  route's axe checks among them.
- Live check against the offline stack with the committed catalogue published (8 types, 38
  topics): a file uploaded as Policy; on its Type and topics tab "Assisted order capture" and
  "Billing and charging" added and saved while its reading finished (one 409 from the moved
  version, saved again over it); the list filtered by Policy offered both topics and its
  summary said "Type: Policy" and "Topics: Assisted order capture, Billing and charging". axe
  (WCAG 2.2 AA) found nothing on the upload form, the tab and the list in light, dark or at
  600px. The first look put the form on the Overview, where the review desk replaced it when
  reading ended, and refused the save as stale; both are fixed as above.
