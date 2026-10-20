# Catalogue versioning — lineage, stable ids, reusable chunk sets, source review

## Objective

Make document versions, catalogue renames and rebuilds behave as one versioned whole, and show
a curator where the catalogue and its sources disagree before publishing. Decision:
`docs/architecture/adr-catalogue-versioning.md`.

## User Outcome

- A curator uploads a new version of a document from Sources ("New version…"); it takes the old
  version's place and is read. Its reading lists what the catalogue took from earlier versions
  that it no longer says, and the document shows the versions before it.
- Renaming an offering or journey keeps its old id; its page says "Formerly …"; the diff says
  the id changed.
- Check lists facts whose sources left the version, and passages about what the draft changes,
  each of which can be marked outdated.
- Rebuilding after an edit no longer re-reads documents or re-embeds anything unchanged.

## In Scope

Document lineage; no-longer-stated facts; `former_ids`, rename and single-item edit endpoints,
renames in the diff, former-id resolution in precedents, change requests and the organisation
catalogue; former ids in YAML, JSON and the workbook; chunk sets, index members, pruning and
collection; outdated passages; provenance and drift; the UI above.

## Out of Scope

Several drafts at once; publishing proposed offerings (both in AGENTS.md §19).

## Domain

- `KnowledgeDocumentVersion.document_id`, `.supersedes`, `.lineage`.
- `ProductOffering.former_ids`, `Journey.former_ids`; `identity.py`: `check_former_ids`,
  `current_id`, `renamed_offering`, `renamed_journey`; `find_offering` reads former ids.
- `ArchitectureKnowledge.outdated_passages` (`OutdatedPassage`).
- Diff: renames as changes with "id".
- `candidates.fact_key`, `fact_label`.

## Application

- `UploadKnowledgeDocument.execute(..., replaces=)`.
- `ManageArchitectureKnowledge`: `upsert_offering`, `remove_offering`, `upsert_journey`,
  `remove_journey`, `rename_offering`, `rename_journey`, `mark_outdated`, `known_versions`,
  `earlier_versions`; discarding a draft prunes and collects.
- `ProposeCatalogueChanges`: `no_longer_stated` on the run.
- `BuildArchitectureIndex`: record and document chunk sets, outdated chunks, prune and collect.
- `ReviewSources`: `provenance`, `drift`.

## Ports

- `ArchitectureEvidenceIndexPort`: `store(..., members, outdated)`, `chunk_set`, `store_set`,
  `prune`, `collect`, `passages`.
- `CatalogueCandidateRepositoryPort`: `accepted`, `accepted_from`.

## API

Additive: `replaces` on document upload; `document_id`, `supersedes` on document versions;
`former_ids` on offerings and journeys (public and internal contracts); `outdated_passages` on
releases; `no_longer_stated` on extraction runs; `PUT`/`DELETE …/offerings/{id}`,
`…/journeys/{id}`; `POST …/rename` for each; `GET …/provenance`, `GET …/drift`,
`PUT …/outdated-passages`.

## UI

Sources: "New version…", earlier versions, "No longer said in this version". Check: "Facts
whose sources left this version", "Passages about what this draft changes" with "Mark it
outdated". Offering and journey pages: "Formerly …".

## Tests

`tests/unit/test_index_versioning.py`, `test_entity_identity.py`, `test_source_review.py`;
PostgreSQL: shared sets, prune and collect, outdated passages; frontend: new version, no longer
said, provenance and drift.

## Acceptance Criteria

Every gate green; existing indexes read as before; the contracts change additively.
