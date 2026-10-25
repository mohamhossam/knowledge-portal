# ADR 0126 — The service starts with no catalogue

## Status

Accepted 2026-10-25, by the product owner's decision of the same day.

## Context

Every repository seeded itself when it was built: the PostgreSQL adapter inserted and activated
`smb-source-reference-v1` ("Initial catalogue", a small SMB reference shipped as
`infrastructure/architecture/knowledge/smb_architecture.yaml`) when the release table was
empty, and the in-memory adapter could not be built without a release. So the port promised a
version in service at all times.

The seed was not a real release. It had no evidence index and no embedding profile, so three
use cases compared release ids with its literal id to step around the checks every other
release meets: activation skipped the profile check, matching fell back to a deterministic YAML
matcher (`YamlArchitectureKnowledge`), and assessing refused it. Bumping the seed's version
would have silently broken all three.

Nothing in production needs the seed. The catalogue a team uses is one a knowledge maintainer
builds from its sources and publishes; the seed existed so tests and the offline stack had
something in service.

## Decision

1. **Nothing is seeded.** Both repositories start empty. `ArchitectureKnowledgeRepositoryPort.active()`
   returns `None` until a maintainer publishes the first version.
2. **The first draft starts empty.** With nothing in service, `create_draft` starts a version
   with no content and no base. Its review diff lists everything it holds as added, with no
   base release (`CatalogueDiff.base_release_id` is `None`).
3. **Each reader says what nothing in service means to it.**
   - Matching, assessing, confirming system reviews and the sample comparison need a version:
     they raise `NoReleaseInServiceError`, a `KnowledgeConflictError` answered as 409 with the
     code `architecture_catalogue_not_in_service`.
   - The portal's own reads answer null: `GET /architecture-knowledge/releases/active` and
     `GET /explorer/release`. The catalogue and explorer screens show "No catalogue version is
     in service yet".
   - Lists read as empty: system review standings, library document types and topics, the
     organisation catalogue's references (so a squad or product cannot name a system yet), and
     an offering's plans (not found). The mapping report's `active_release_id` is null, and
     every mapping counts as outdated.
4. **The seed's special cases go.** The three id comparisons, the deterministic YAML matcher and
   its wiring are removed. `ResolveArchitectureKnowledge` no longer takes a fallback matcher.
5. **The seed is test data.** The YAML moves to `tests/fixtures/smb_architecture.yaml`, and
   `tests/catalogue_seed.py` puts it in service for tests (`seeded_repository`, `seeded_once`
   for the shared PostgreSQL test database, and `build_container(in_service=...)` for API
   tests). `scripts/seed_demo.py`, which the e2e suite runs, publishes it through the API the
   way a maintainer would before adding its sample work.

## Consequences

- requirement-portal must handle `architecture_catalogue_not_in_service` from
  `/internal/architecture/match` and `/internal/architecture/assess`. Before, those calls failed
  as internal errors on a database with no release. The internal contract's shape is unchanged,
  and its version is raised to 1.1.0 for the new refusal.
- An existing database keeps whatever releases it holds; the seed row is not removed by a
  migration. Starting fresh is a reset of that database.
- The public contract widens: the active release and the explorer's release may be null, and a
  diff's base and the mapping report's active release may be null.
- A test that needs a version in service now says so.

## Alternatives considered

- **Keep the seed and name its id once.** Rejected: it keeps a release that cannot be matched or
  assessed like any other in production, and still needs a special case wherever it is read.
- **Answer 409 from the portal's reads too.** Rejected: "nothing yet" is a normal state for the
  portal's screens, which already render a null active release, not a failure.
