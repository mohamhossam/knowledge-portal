# ROADMAP.md — knowledge-portal

## Delivery status — 2026-10-10

| Scope | Status | Remaining |
|---|---|---|
| Stage 0: repository scaffolding (`AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `UPSTREAM.md`) | Done; CI arrived with 3.4 | Branch protection on `main` |
| Stage 3: the service | Done: the backend (3.1 to 3.4, and the owner's source-impact view), the UI foundation and front page, and the curation screens for the library, the architecture catalogue and the squads ([#11](https://github.com/mohamhossam/knowledge-portal/pull/11)–[#18](https://github.com/mohamhossam/knowledge-portal/pull/18)) | — |
| The Product Architecture Explorer (requirement-portal ADR-0101, steps 1–7) | Done 2026-10-05: the explorer on the version in service for anyone signed in, channels, plans and prices (TMF620), realisation, NFRs, tracking and lifecycle notes, source levels and conflicts, the Solution Architecture `.docx`, and change requests from Requirement AI ([#22](https://github.com/mohamhossam/knowledge-portal/pull/22)–[#36](https://github.com/mohamhossam/knowledge-portal/pull/36); `UPSTREAM.md` names each) | Live-model extraction checks, and a live TMF620 catalog |
| Knowledge Center (requirement-portal's `docs/slices/enhancement-knowledge-center.md`, ADR-0099 Amendment 1, ADR-0102) | **Done 2026-10-07.** Re-planned 2026-10-06 so each sub-slice is built where its data lives; A was mostly delivered by the split, and F (catalogue suggestions) early. **Here:** A′, the front page's Table 4 (freshness, catalogue failures, Requirement-corpus health) ([#40](https://github.com/mohamhossam/knowledge-portal/pull/40)); B2, the Requirements and Findings pages with nudges ([#42](https://github.com/mohamhossam/knowledge-portal/pull/42)); B3, retire, reinstate and bulk reindex ([#43](https://github.com/mohamhossam/knowledge-portal/pull/43)); C, library and catalogue curation ([#44](https://github.com/mohamhossam/knowledge-portal/pull/44)); D, review cycles and the portal's own reminders ([#45](https://github.com/mohamhossam/knowledge-portal/pull/45)); E1, historic BRDs with their Azure DevOps lineage ([#46](https://github.com/mohamhossam/knowledge-portal/pull/46)); E2a, the light historic event and paged content read ([#47](https://github.com/mohamhossam/knowledge-portal/pull/47)), and E2b, "Cited by" ([#48](https://github.com/mohamhossam/knowledge-portal/pull/48)). **In requirement-portal:** B1, the data and rules for A′, B2 and B3, citation counts, and E2's historic corpus and prior art (its #39–#47) | The ADO edition, for the REST adapter (E runs on the fake connector until then); prior art is off in production until requirement-portal's judge is evaluated |
| Independent portals with optional links (requirement-portal ADR-0104 and `docs/slices/enhancement-independent-portals.md`) | **Scheduled 2026-10-09.** Phase 2, running in production without requirement work, is done ([#49](https://github.com/mohamhossam/knowledge-portal/pull/49)). Phase 3, this portal's own deployment (`deploy/compose.production.yaml`, `docs/operations/deployment.md`), is done ([#50](https://github.com/mohamhossam/knowledge-portal/pull/50)). Phase 4: the sign-in client, audience and roles are defined here (`deploy/keycloak/`, [#51](https://github.com/mohamhossam/knowledge-portal/pull/51)), and each portal can hold only its own service credential (platform-kernel 1.1.0, the `knowledge-service` client, [#53](https://github.com/mohamhossam/knowledge-portal/pull/53)); requirement work records this portal's writes against the service. Phase 5 is done ([#52](https://github.com/mohamhossam/knowledge-portal/pull/52)): the base path is a build setting (`KNOWLEDGE_BASE_PATH`), the edge is independent of it, and the web image takes requirement work's address at start-up | Release `v0.2.0` (`CHANGELOG.md`), whether releases serve at the root, then the cutover with requirement-portal and Phases 6 and 7 |
| Ontology and impact plan ([plan](https://claude.ai/code/artifact/27b1b1d1-b01b-40d4-9264-1999bc29b2bf), ADR-0114 to ADR-0116, `docs/slices/ontology-phase-0-baseline.md`, `docs/slices/ontology-phase-1-concepts.md`) | **Phase 1 in review 2026-10-10:** a curated scheme of business capability concepts, the backfill and AI component-link suggestions as reviewable suggestions, the draft API and file formats, and every SMB component linked; its screens are in redesign plan 03 (`docs/redesign/plans/03-capability-concepts.md`). **Phase 0 in review 2026-10-10:** a 53-case golden set on `catalogues/smb-architecture.yaml`, the evaluation command (`python -m knowledge_portal.interfaces.evaluate`), today's mapper scored with the fake models, and the three ADRs accepted with an 80% verdict accuracy gate | The live-model baseline; the concept screens (plan 03); Phases 2 to 9

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
   - The document owner's source-impact view, `/library/documents/{id}/source-impact`.
     It checks ownership on the live library, then reads requirement-portal's
     `/internal/references/{id}/impact`. It is read-only: requirement members record the
     retain-or-revise decisions in requirement-portal.
3. **Schema (done).** One baseline migration, `202610021500_knowledge_baseline.sql`: the 19
   knowledge-owned tables exactly as requirement-portal's migrations leave them at
   `202610021400` (a pg_dump of each matches), with no foreign key leaving them. The
   `migrate` command applies it. PostgreSQL integration tests cover every adapter and the
   whole service; the coverage floor is 89% with `TEST_DATABASE_URL`.
   - For the import in step 4: the audit tables' ids are `GENERATED ALWAYS`, so copying them
     needs `OVERRIDING SYSTEM VALUE` and a sequence reset; `knowledge_events` keeps its `seq`
     values, so requirement work's event cursor stays valid.
4. **Import, image and CI (done).**
   - `knowledge-portal import --source-database-url … [--verify | --verify-only]` (until v0.2.0) copies the 18
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
   - Kernel 1.0.2 (2026-10-03) takes the pool name from the application; the pool is
     named `knowledge-portal`.
   - Kernel 1.0.1 (2026-10-03) raised PyJWT to 2.15.1 for that day's advisories; v0.1.0 ships on it.

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
- **Done: the design system and the front page.** "The Timetable Book" (`DESIGN.md`):
  - numbered tables with reference marks and notes;
  - rank carried by weight;
  - red only for disruption, blue only for references.

  Also done:
  - sign-in (offline personas, or the platform's OIDC client `knowledge-spa`);
  - the "no access" page for anyone without `knowledge_admin`;
  - the front page, an overview of all three tables with what needs a curator;
  - stable addresses for `/library`, `/architecture` and `/squads`;
  - the `knowledge-web` image.
- **Done: the library's review.**
  - The library table, with "add a document".
  - Each document's page, laid out "edition against working copy":
    - a change notice counting what moved since the edition in service;
    - aligned passage rows with keyboard review (j/k, Enter, x, i, e, o, Esc), filters and find;
    - windowed rendering for thousands of passages;
    - the original's preview;
    - save, approve and publish;
    - withdrawal, a new version, and retry or cancel of processing.
- **Done: library governance and search.**
  - Each document has sub-pages, Review, Search versions, Who cites it and Ownership; unsaved review work survives moving between them.
  - Search versions: every publication, table-aware builds (preview, build, activate with acknowledgement, discard), retrying stopped indexing, and a preview of what an approval indexes.
  - Who cites it: proposals citing the document, and source impact (read-only).
  - Ownership: handing over to another admin, with its history.
  - `/library/search` searches every passage in service, with exact citations and their surrounding text.
- **Done: reading the architecture catalogue** (the first of three catalogue pull requests).
  - The version in service as station pages: an index of systems grouped by where each sits,
    with a find field that matches names, aliases, Arabic names, components, capabilities and
    matching phrases, beside every connection or one system's sheet.
  - A system's sheet: what it does and the phrases that match it, what it depends on and what
    uses it (following a connection lights the way back), its owners from the squad catalogue,
    the offerings and journey steps it plays a part in, its components and constraints.
  - Domains (the landscape and the business areas), offerings, and journeys read as timetables.
  - Versions: every version with its history and catalogue files, and putting a replaced version
    back in service with a reason, after saying what it would change. Any version reads the same
    way, with its changes against the version in service.
- **Done: the draft from documents** (the second of three catalogue pull requests).
  - Starting, renaming and removing the one draft; the draft reads like any version, with a
    Suggestions page under its head.
  - Its documents: added and read, reading state with cancel and read again, removal, and the
    readings' warnings as numbered notes.
  - Every suggestion gathered under the system it would change, new systems first, keeping its
    place while deciding; decided by keyboard (j/k, Enter, a, r, e, Esc) or pointer, one after
    another on the revision the last returned.
  - Possible matches chosen in place, inferred links checked against their cited passage, waits
    said in the documents' names; accepting the ready ones and what they lift in one step.
  - Editing before accepting, for every kind: systems, components, capabilities and their
    phrases, constraints, dependencies, domains and placements, and whole offerings and journeys
    (editors the hand edits will reuse).
- **Done: finishing a draft** (the last of three catalogue pull requests).
  - Hand edits in place on the draft's own pages: a system's sheet (edit, remove with its
    connections, add/change/remove its dependencies), "Add a system", both domain trees, and
    whole offerings and journeys.
  - Sources: documents and suggestions beside the catalogue file (the template, the draft as
    Excel/YAML/JSON, and a file brought back shown as its differences before it replaces anything).
  - Changes: every difference from the version in service, counted, then listed by kind, with
    connections said as sentences.
  - Check: the build for matching, the team's sample requirements compared between the version in
    service and the draft ("Now also finds Order Hub"), with the evidence the draft cites.
  - Publish: the consequence in words, a reason, and publishing (building first when needed).
- **Done: the squad catalogue** (Table 3), read through what the organisation sells.
  - Products: each value stream with its lead and products, each product's systems and the squad
    that runs each with its contact; then the systems no product names, by where they sit.
  - Ownership counted against the version in service, and a system given to a squad in place.
  - Squads (by value stream, with scrum master and contacts), People (roles, and inactive only
    once they hold none) and History; every record edited in place with its revision.

### Data import
- Done in step 4 above.

### Tests
- Unit and PostgreSQL integration tests.
- Provider tests that the served OpenAPI matches the snapshot.
- Import `--verify` against a seeded restore.
- The frontend build, and an impeccable critique of each screen.
