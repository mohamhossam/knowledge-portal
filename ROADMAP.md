# ROADMAP.md — knowledge-portal

## Delivery status — 2026-10-02

| Scope | Status | Remaining |
|---|---|---|
| Stage 0: repository scaffolding (`AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `UPSTREAM.md`) | In progress | CI and branch protection once the GitHub repository exists |
| Stage 3: the service | Scheduled after requirement-portal's untangling (its Stage 2) | Everything below |
| Knowledge Center sub-slices B–E (from requirement-portal's `docs/slices/enhancement-knowledge-center.md`) | Specified; not scheduled | Sequencing after Stage 3 |

## Stage 3 — The service

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
- `knowledge-portal import --source-database-url … --verify` copies the owned tables and blobs,
  preserving ids. `--verify` checks counts and checksums.

### Tests
- Unit and PostgreSQL integration tests.
- Provider tests that the served OpenAPI matches the snapshot.
- Import `--verify` against a seeded restore.
- The frontend build, and an impeccable critique of each screen.
