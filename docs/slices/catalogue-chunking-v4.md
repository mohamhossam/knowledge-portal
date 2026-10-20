# Catalogue chunking, section-v4 — parents to read, children to search

## Objective

Cut catalogue documents so the assessment's short facets match small, single-topic units while
the verdict reasoner still reads whole sections, and recover what the Word reader loses today.
Decision and trade-offs: `docs/architecture/adr-section-v4-chunking.md`.

## User Outcome

- A curator who builds a version with `ARCHITECTURE_INDEX_VERSION=section-v4` gets an index whose
  passages are sections and tables, searched through their paragraphs and rows.
- The evidence page shows the catalogue systems and offerings a passage names, linked to their
  records, and the other places its exact text appears.
- The draft's preview lists the sections that would be read, each once.
- Text inside Word content controls (cover pages, form fields) is read under every version.

## In Scope

- Word reader: content controls, numbering and bullets, list depth, title and caption styles.
- `section_chunking.py`: rules P1–P4 and C1–C6, catalogue record windows by whole lines.
- Index build under section-v4; MENTIONS links; parents never searched; indexes of v2–v4 read by
  any build.
- Passage lane, `/match` evidence and preview read parents; the cap counts per section.
- Document reader opens a section-v4 location (span, sentence range, whole table).
- PostgreSQL migration `202610201000_chunk_parents`; setting `ARCHITECTURE_INDEX_VERSION`.
- Evidence API: `role`, `aliases`, `mentions`; preview: `focus`. Internal contract: the same
  optional fields on `EvidenceChunk` (additive).

## Out of Scope

- Switching the default to section-v4: after the live Golden set comparison.
- Embedded Office parts and figure text in the index; a layout-aware PDF reader; a malware scan
  for catalogue uploads (AGENTS.md §19).
- Versioning, chunk reuse across builds and incremental indexes: the next slice.

## Domain

No domain change: chunking is about evidence, which the application layer owns.

## Application

- `section_chunking.plan_document(segments, count) -> tuple[ParentPlan, ...]`;
  `record_windows`; `first_location`; `span` (moved from `architecture_index`).
- `BuildArchitectureIndex` cuts documents by `plan_document` and records by `record_windows`
  when the index's `version` is section-v4.
- `architecture_evidence.readable(index, index_id, chunks)`; `named_offerings`.
- `index_links.build_links(..., mentions=True)` under section-v4; parents get no concept links.
- `passage_lane`: children ranked, `_preferring` within the first six, parents kept.
- `ManageArchitectureKnowledge.preview` reads parents; `named_in` lists a passage's mentions.

## API

- `GET /architecture-knowledge/releases/{id}/evidence/{chunk_id}`: adds `role`, `aliases`,
  `mentions[] {entity, entity_id, name}`.
- `POST /architecture-knowledge/releases/{id}/preview`: adds `focus`.
- Internal `EvidenceChunk`: adds optional `role`, `parent_id`, `aliases`, `focus`.

## UI

- Evidence page: "Names in the catalogue" with links to each system or offering, and "Same text
  also at". Nothing changes for older indexes or catalogue records.

## Business Rules

- A child's text is an exact slice of its parent's; a quote is checked against the parent.
- A parent is read, never searched, and has no embedding.
- A MENTIONS link never makes a system impacted (ADR-0114).

## Tests

- `tests/unit/test_section_chunking.py`: Word reader facts; slices and bounds; title, numbered
  headings and joined small paragraphs; table parent with caption, columns, rows and note;
  sentence splits overlapping by one; repeated text once with an alias; record windows;
  `first_location`; any version reads any other; a v4 index searches children and reads parents;
  MENTIONS links; the passage lane keeps parents; the document reader opens v4 locations; the
  setting.
- `tests/integration/test_postgres_architecture.py`: parents stored without an embedding and
  never returned by search.
- `frontend/src/catalogue/evidencePage.test.tsx`: mentions and aliases shown, nothing for v3.

## Acceptance Criteria

- Every gate green; section-v3 indexes and their text unchanged (existing tests untouched).
- With section-v4 configured, a build, publish, assessment and preview run end to end.

## Validation Evidence

- Backend: ruff, mypy, import-linter, pytest (unit and PostgreSQL integration with pgvector).
- Frontend: build, eslint, lint:brand, lint:legacy-css, budget, vitest, e2e.
- With the offline fake models the run shows the path only; ranking quality is a HYPOTHESIS
  until the Golden set report compares v3 and v4 with live models.

## For review

- The default stays section-v3. Run the Golden set report with `ARCHITECTURE_INDEX_VERSION` set
  each way (three runs each, live models) before switching.
