# One unit of work — every repository joins the shared transaction

## Objective

Every PostgreSQL repository joins the shared unit of work (`PostgresStore`), so a use case
that touches more than one repository commits once or not at all. Today the library,
historic, actors, admin grants, system reviews, reference index and events repositories take
the store, while the architecture releases, organisation, sample requirements, catalogue
candidates, change requests, precedents, evidence index, jobs and golden runs take the raw
connector: each of their calls is its own transaction, invisible to `transaction()`. Three
flows are therefore not atomic (review finding #4, remediation plan Wave 3).

## User Outcome

- A curator whose "read this change request into a draft" fails midway never finds a draft
  with half its proposals, or an inbox row still unread beside a filled draft.
- Deciding catalogue candidates can no longer leave candidates decided while the draft was
  never saved: the hand-rolled `reopen` compensation is gone, replaced by the transaction.
- An architecture upload that loses its revision race no longer leaves an orphan blob.
- Two replicas starting against an empty database no longer write the seed's activation
  event twice.

## In Scope

- `infrastructure/persistence/`: `postgres_architecture_knowledge.py`,
  `postgres_organisation.py`, `postgres_sample_requirements.py`,
  `postgres_catalogue_candidates.py`, `postgres_change_requests.py`,
  `postgres_precedents.py`, `postgres_evidence_index.py`, `postgres_architecture_jobs.py`,
  `postgres_golden_runs.py` — constructor takes `PostgresStore`; every
  `self._connector.connection()` becomes `self._store.connection()` (which joins the active
  transaction, or opens its own as before).
- `interfaces/api/composition/persistence.py` — pass the store.
- The in-memory counterparts enrol in `InMemoryTransactionManager`, so the fake graph rolls
  back the same way.
- `application/use_cases/change_requests.py` (`ReadChangeRequestIntoDraft.execute`),
  `application/use_cases/catalogue_candidates.py` (`DecideCatalogueCandidate._save`),
  `application/use_cases/architecture_documents.py` (`UploadKnowledgeDocument.execute`) —
  each opens the unit of work; the candidate `reopen` compensation is deleted.
- `postgres_architecture_knowledge.py` seed: the `architecture_release_activated` event is
  written only when this process actually inserted the seed row.

## Out of Scope

- The library/historic paths (already on the store).
- Event payloads, contracts, API shapes: unchanged.
- The private-member test seams deferred from Wave 2 PR 7 are settled here where the files
  are already open.

## Tests

- Postgres integration: each of the three flows, with an induced failure midway, leaves no
  partial state (no half-filled draft, no decided-but-unsaved candidates, no orphan blob).
- Postgres integration: the `LOCK TABLE` in activate/publish still runs inside the shared
  transaction.
- Unit: the in-memory graph rolls the same flows back.

## Validation Evidence

Run locally on the slice's final tree (integration tests run in CI with
`TEST_DATABASE_URL`; they skip locally):

- `uv run pytest` — PASS (unit suite 1219 passed; integration skipped locally,
  including the three new induced-failure tests in
  `tests/integration/test_one_unit_of_work.py`)
- `uv run ruff check .` — All checks passed
- `uv run ruff format --check .` — 440 files already formatted
- `uv run mypy src tests` — Success: no issues found in 374 source files
- `uv run lint-imports` — Contracts: 10 kept, 0 broken
