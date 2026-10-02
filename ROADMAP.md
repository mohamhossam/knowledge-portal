# ROADMAP.md — knowledge-portal

## Delivery status — 2026-10-02

| Scope | Status | Remaining |
|---|---|---|
| Stage 0: repository scaffolding (`AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `UPSTREAM.md`) | Done; CI arrived with 3.4 | Branch protection on `main`, and the `KERNEL_READ_TOKEN` secret |
| Stage 3: the service | Backend done (3.1 to 3.4) | The owner's source-impact view; then the UI |
| Knowledge Center sub-slices B–E (from requirement-portal's `docs/slices/enhancement-knowledge-center.md`) | Specified; not scheduled | Sequencing after Stage 3 |

## Stage 3 — The service

### Steps
1. **Backend core (done).** The library, catalogue and organisation code is copied from
   requirement-portal `539e174` by import closure, renamed to `knowledge_portal`, and cut loose
   from requirement code:
   - kernel re-exports for actors and extraction output;
   - `RequirementDependentsPort` with an HTTP adapter and a fake. The HTTP adapters for
     dependents, actors and mapping statistics are tested against the pinned
     `contracts/requirement-internal.openapi.json`;
   - its own transaction manager, PostgreSQL store and `knowledge_document_blobs` storage, with
     no requirement checkpoints or in-process relay;
   - layer contracts in `.importlinter`; the unit tests that apply.
2. **API and worker (done).** Settings, composition, the FastAPI app and the worker process:
   - every public route admits `knowledge_admin` only, enforced where the actor is resolved;
   - the actor directory is this service's own: it remembers the admins who sign in, so a
     document is handed over only to someone who can use the portal. The
     `/internal/actors/{id}` read on requirement-portal is no longer needed;
   - `/internal/*` serves requirement work behind `REQUIREMENT_SERVICE_TOKEN`, held to the
     shared `contracts/knowledge-internal.openapi.json`;
   - requirement work is reached through `REQUIREMENT_API_BASE_URL` and
     `KNOWLEDGE_SERVICE_TOKEN`, or offline fakes when unset;
   - the public contract is `contracts/knowledge-public.openapi.json`.
   - Still to come: the document owner's source-impact view
     (`/library/documents/{id}/source-impact`), read over requirement-portal's
     `/internal/references/{id}/impact`.
3. **Schema (done).** One baseline migration, `202610021500_knowledge_baseline.sql`: the 19
   knowledge-owned tables exactly as requirement-portal's migrations leave them at
   `202610021400` (a pg_dump of each matches), with no foreign key leaving them. The
   `migrate` command applies it. PostgreSQL integration tests cover every adapter and the
   whole service; the coverage floor is 89% with `TEST_DATABASE_URL`.
   - For the import in step 4: the audit tables' ids are `GENERATED ALWAYS`, so copying them
     needs `OVERRIDING SYSTEM VALUE` and a sequence reset; `knowledge_events` keeps its `seq`
     values, so requirement work's event cursor stays valid.
4. **Import, image and CI (done).**
   - `knowledge-portal import --source-database-url … [--verify | --verify-only]` copies the 18
     knowledge tables (not `actor_profiles`) in one target transaction from one source
     snapshot. It keeps ids, moves sequences past them, and converges on the source when run
     again. Verification compares row counts and content checksums per table. It was
     checked against a requirement-portal database seeded by that repository's own
     integration tests: every table matched.
   - One backend image (`deploy/api/Dockerfile`) for the API, worker, migrate and import.
     CI builds, scans and starts it; a version tag publishes
     `ghcr.io/mohamhossam/knowledge-api` for requirement-portal's deployment.
   - CI: checks with PostgreSQL, dependency audit, image. Dependabot, and a `.gitattributes`
     that keeps line endings LF.
   - For platform-kernel 1.0.1: `PooledPostgresConnector` names every pool
     `smb-requirement-agent`. The name should be a parameter (mechanisms, never meaning).

The plan is requirement-portal's `docs/slices/enhancement-platform-split.md`, read against
ADR-0099.

### Domain
- The library (documents, submissions, publications), the architecture catalogue (releases,
  systems, domains, components, offerings, journeys, candidates) and the organisation
  catalogue, imported from `smb-ai-requirement-agent@d5cfb57`.
- No change to their business rules.

### Application
- Library review and publication, catalogue curation and release activation, organisation
  administration, and reference search.
- `knowledge_admin` authorization on every public use case.
- A `knowledge_events` outbox row in the same transaction as each of these: publish, withdraw,
  supersede, and release activation.

### Ports
- The existing library, catalogue and organisation repository ports.
- New ports for what this service reads from requirement-portal: dependents, mapping statistics
  and the actor directory.

### Adapters
- PostgreSQL adapters for its own database, with baseline migrations.
- HTTP adapters to requirement-portal on `smb_kernel.http.InternalHttpClient`, each with a
  deterministic fake.
- Kernel scanning, extraction and model transports.

### API
- Public routes:
  - `/library/*`, `/architecture-knowledge/*`, `/organisation/*`, `/knowledge/search`.
- Internal routes, for requirement-portal:
  - `/internal/architecture/match`
  - `/internal/library/search`
  - `/internal/library/documents/{id}`
  - `/internal/events`
- An OpenAPI snapshot published with each release.

### UI
- A new design system, with its own `DESIGN.md`, tokens and primitives.
- Screens:
  - library and governance;
  - catalogue browser and editors;
  - squad catalogue;
  - architecture evidence;
  - a "no access" page for anyone without `knowledge_admin`.

### Data import
- Done in step 4 above.

### Tests
- Unit and PostgreSQL integration tests.
- Provider tests that the served OpenAPI matches the snapshot.
- Import `--verify` against a seeded restore.
- The frontend build, and an impeccable critique of each screen.
