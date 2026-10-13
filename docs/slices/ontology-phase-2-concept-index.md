# Ontology plan, Phase 2 — Concept-aware evidence index

## Objective

Make every evidence index know what each chunk is about. A chunk starts with a header naming
whose record it is. It is linked to the catalogue entities its record belongs to, and to the
capability concepts it speaks of. The index keeps the release's concept scheme, so Phase 3 can
match a requirement to concepts and search only the evidence about them (ADR-0114).

## User Outcome

A knowledge administrator builds a draft as before. Afterwards they can read how far the links
reach: how many chunks name no concept, and which concepts nothing in the evidence speaks of.
Requirement mapping works as before. Phase 3 gets the concept lanes it needs.

## In Scope

- A context header on every window of a catalogue record.
- Chunk–entity links, exact for catalogue records.
- Chunk–concept links: exact for catalogue records, a label match plus an embedding check for
  everything else.
- The concept index, the queries on it, and the coverage counts.
- The migration, both index adapters, and an endpoint for the coverage.

## Out of Scope

- Using the links in mapping: the assessment is Phase 3.
- Entity links for document passages that name a system. Today's `named_systems` finds those at
  query time; Phase 3 decides whether the index should hold them.
- A screen for the coverage. It belongs in plan 03's Check step (noted in
  `docs/redesign/plans/03-capability-concepts.md`).

## How a build links its chunks

```
catalogue record ─┬─ header: "Catalogue offering: Business Pro Plus · capabilities: SD-WAN service; …"
                  ├─ entities: record (the offering) + names (systems in its components' responsibilities)
                  └─ concepts: catalogue basis, score 1.0 (its components' capability_ids)

journey record ───┬─ header: "Catalogue journey: New activation"
                  ├─ entities: record (the journey) + names (its offering, every step's systems)
                  └─ concepts: label basis, as for a passage

document passage ─┬─ header: "title / heading path" (unchanged)
                  └─ concepts: a label of the concept is in the text AND the concept is among the
                               passage's 3 nearest concepts by embedding; score = similarity
```

The embedding check is a rank, not a similarity threshold, so it means the same for every
embedding model. For example, a security passage that says "the billing team is told" names
Billing. Firewall, static IP and site security are its 3 nearest concepts, so it is not linked to
Billing (test `test_a_passage_links_to_a_concept_it_names_and_is_about`).

## Domain

`domain/architecture/concepts.py`: `labels_in(text, concepts)`, the concepts with a label in the
text as whole words. Labels compare as `label_key` does, so "WiFi" finds "Wi-Fi", but "billings"
does not find "billing".

## Application Use Cases

- `application/use_cases/index_links.py` builds the links:
  - `concept_scheme` holds each concept's labels, path ("Service › Managed Wi-Fi access points")
    and definition, as searched and embedded;
  - `record_concepts` gives a record's exact concepts;
  - `build_links` builds every chunk's entity and concept links;
  - `texts_to_embed` lists what the embedding check needs.
- `BuildArchitectureIndex`:
  - adds the header to each catalogue window;
  - embeds the check's texts through the index's cache, so `store` does not embed them again;
  - stores the chunks, then the links.
- `ManageArchitectureKnowledge.index_coverage` reads the coverage of a release's last build.

## Ports

`ArchitectureEvidenceIndexPort` gains:
- `reads(profile)`;
- `vectors(texts)`;
- `link(index_id, links)`, plus `links(index_id, chunk_ids)`;
- `match_concepts(index_id, query, limit)`;
- `concept_chunks(index_id, query, concept_ids, limit)`;
- `coverage(index_id)`.

The new types are `LinkedEntity`, `EntityRole`, `ChunkEntityLink`, `ConceptBasis`,
`ChunkConceptLink`, `IndexedConcept`, `IndexLinks`, `ConceptMatch` and `IndexCoverage`.

## Adapters

- **Migration** `202610102000_concept_index.sql`:
  - three new tables: `architecture_chunk_entities`, `architecture_chunk_concepts` and
    `architecture_concepts` (labels, path, a `simple` text-search vector and an embedding);
  - `architecture_knowledge_indexes.linked_at`, which records that an index has links;
  - links cascade with their chunks and index, so discarding a draft removes them.
- **`PostgresEvidenceIndex`** writes and reads them.
  - `match_concepts` fuses any-word text search with vector search, by reciprocal rank as chunk
    retrieval does.
  - `concept_chunks` runs the same search over the linked chunks only.
- **`InMemoryEvidenceIndex`** does the same in memory.

## Index profile

The profile moves from `…:section-v2` to `…:section-v3`, because catalogue chunk texts change.
Indexes built under `section-v2` stay readable (`reads`): the release in service keeps mapping
and can be put back in service. Such an index has no links, and its coverage reads
"not linked". Publishing still needs the current profile, so a draft built before the upgrade
is rebuilt once before it is published.

## API

`GET /architecture-knowledge/releases/{id}/index-coverage` (`knowledge_admin`) returns:
- `linked`;
- `chunks` and `chunks_without_concept`;
- `concepts`, and `concepts_without_chunk` with each concept's label.

`linked` is false before a build, or for an index built before links. The OpenAPI contract is
regenerated. requirement-portal's internal API is unchanged.

## UI

None in this slice. The coverage line belongs in plan 03's Check step.

## Tests

- `tests/unit/test_concept_index.py` (10 tests):
  - label matching;
  - the header on each window;
  - exact entity and concept links;
  - a passage's label link, and one refused by the embedding check;
  - the coverage counts;
  - concept matching and the concept-filtered search;
  - a release with no concepts;
  - an index from before links, and the readable previous profile;
  - publishing needs a rebuild, while activation keeps an old release;
  - the coverage endpoint, including its 403 for a reader.
- `tests/integration/test_postgres_concept_index.py` (2 tests):
  - the committed SMB catalogue built into pgvector holds the same links and coverage as in
    memory;
  - concept matching and concept-filtered search in PostgreSQL;
  - discarding the draft removes the links;
  - an index without links.
- Adapted:
  - `test_architecture_knowledge.py`, `test_journeys.py` and `test_product_offerings.py`, for
    the header and the profile;
  - `test_baseline_schema.py`, for the three tables.

## Acceptance Criteria

- `architecture_index.py` adds the context header, records chunk–entity links (exact for
  catalogue records) and chunk–concept links (label match plus embedding check for passages),
  and builds the concept index. **Met.**
- The index profile moves to a new version, so old indexes stay comparable. **Met, and old
  indexes stay readable** (see Index profile).
- One migration for the three tables, written and read by `postgres_evidence_index.py`. **Met.**
- Tests: header text, link scoring, rebuild idempotency, PostgreSQL integration. **Met.**
  - Rebuild idempotency: chunk ids and link sets are deterministic, so two builds of the same
    catalogue produce the same links. The PostgreSQL test compares two such builds.
- Exit: a published release re-indexes with links; unlinked chunk and concept counts are
  reported. **Met** (the coverage endpoint).

## Validation Evidence

Run on 2026-10-10 on `claude/ontology-main-sequence-sart0h`, from main at `57fa255`.

The committed SMB catalogue, with fake models and no documents:
- 80 chunks, 33 of which name no concept;
- 36 catalogue links and 52 label links;
- 18 of the 38 concepts appear in no chunk, such as collections, field installation and trouble
  ticketing. The catalogue has no journey or record that speaks of them yet. Uploading the
  source documents should close most of the gap.

```text
$ pytest tests/unit/test_concept_index.py
10 passed
$ TEST_DATABASE_URL=… pytest tests/integration      # local PostgreSQL 16 with pgvector
49 passed in 8.45s
$ pytest                  # whole suite; PostgreSQL tests skip without TEST_DATABASE_URL
952 passed, 49 skipped in 72.63s
$ ruff check . && ruff format --check .
All checks passed!
$ mypy src tests
Success: no issues found in 321 source files
$ lint-imports
Contracts: 10 kept, 0 broken.
$ cd frontend && npx tsc -b && npm run lint && npx vitest run && npm run build
Test Files 38 passed (38), Tests 280 passed (280); built
$ LLM_PROVIDER=fake python -m knowledge_portal.interfaces.evaluate
system precision 59.3% · recall 8.6% · verdict 47.2% · offering 71.4% · concepts not measured
```

The evaluation is unchanged from Phase 0, as expected: mapping does not use the links until
Phase 3.

## Risks

- **The nearest-concepts rank (3) is tuned on fake embeddings only.** A live model may need 2
  or 5. Phase 3's golden-set run is where to set it, through concept recall.
- **Label matching on short labels** ("IoT", "KYC") can still be wrong when the embedding check
  agrees by chance. Curators see it as a link with its score; the concept scheme's labels are
  the lever.

## Dropped from this slice

- None.

## Deferred

- Entity links for passages that name a system: Phase 3.
- The coverage on screen: plan 03's Check step.
