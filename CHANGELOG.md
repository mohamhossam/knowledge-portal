# Changelog

Each release tag `vX.Y.Z` publishes `ghcr.io/mohamhossam/knowledge-api:vX.Y.Z` and
`ghcr.io/mohamhossam/knowledge-web:vX.Y.Z` (`README.md`, "Images and releases").

## Unreleased

## 0.3.0 — 2026-10-10

The ontology and impact plan's knowledge side: capability concepts, a concept-aware index and
a whole-requirement assessment that requirement work can call (requirement-portal ADR-0114 to
ADR-0116).

### Added

- The catalogue model on `main`: the product portfolio, plans and prices, eligibility rules and
  journey roles.
- An evaluation golden set on `catalogues/smb-architecture.yaml` and the evaluation command
  (`python -m knowledge_portal.interfaces.evaluate`), which scores system precision and recall,
  verdict and offering accuracy, concept recall and citation faithfulness (ontology plan,
  Phase 0).
- Capability concepts (ontology plan, Phase 1): a curated scheme of business capabilities in each
  catalogue release, components and system capabilities linked to them, and AI link suggestions
  for curators to accept or reject.
- A concept-aware evidence index (Phase 2): each chunk carries a context header and its links to
  catalogue entities and capability concepts, and a build reports what its links leave out.
- Controlled vocabularies (Phase 6) for eTOM process, channel kind, component kind,
  responsibility role and Open API, with a term id beside each free-text value and a clean-up
  run that maps existing values as suggestions.
- `POST /internal/architecture/assess` (Phase 3): a requirement's facets, the capability
  concepts it needs and which offering covers them, the product verdict, each impacted system
  with its role, change type and path, gaps, owners and staffing gaps, and catalogue-built
  questions when the requirement is too vague. `/internal/architecture/match` answers gain the
  optional `role`, `change_type` and `paths` on each system. Both changes are additive.
- The SMB catalogue's systems list their capabilities, each linked to a concept.
- Each GitHub release carries the internal and public OpenAPI contracts, so requirement work
  can pin the internal one it is built against.
- Import-linter forbids importing requirement work's code (requirement-portal ADR-0104).
- Squad resources (ontology plan, Phase 1b): a squad holds many people on each system, each in
  a role from a controlled list (contact, solution architect, business analyst, developer,
  tester), or an open seat. A migration turns each squad's existing system contacts into
  "contact" seats. Organisation products link to the offerings they sell and to a portfolio
  node, and `GET /organisation/references` flags squads and products naming systems, offerings
  or portfolio nodes the version in service no longer has, products whose systems differ from
  their offerings', and products linked to neither.
- Capability-scoped squad seats (ontology plan, Phase 1b): a seat can cover one capability
  concept its system's capabilities link to rather than the whole system. Asking a system's
  ownership for a capability (`?capability_id=`) lists that capability's seats first, then the
  whole-system seats, and leaves out the system's other capabilities. `GET
  /organisation/references` also flags seats on a capability the system no longer links to,
  and the squad screens show and edit each seat's capability.

### Changed

- The organisation API's squad `systems` (one contact per system) is replaced by `resources`.
- The evidence index profile is `section-v3`. Indexes built as `section-v2` are still read, so
  mapping keeps working after the upgrade, but publishing a release builds a `section-v3` index.

### Removed

- The `knowledge-portal import` command, which copied the knowledge tables out of a
  requirements database. Requirement work no longer keeps them; `v0.2.0` is the last release
  with it.

## 0.2.0 — 2026-10-09

The portal deploys, signs in and starts on its own; requirement work is an optional link
(requirement-portal ADR-0104).

### Added

- Runs in production without requirement work: `REQUIREMENT_API_BASE_URL` may be empty, and the
  existing stand-ins answer in its place. An empty `REQUIREMENT_PORTAL_URL` leaves out every link
  to it ([#49]).
- Its own deployment: `deploy/compose.production.yaml` with `api`, `worker`, `web` and an `edge`
  that is the only published port, documented in `docs/operations/deployment.md` ([#50]).
- Its own sign-in entities in `deploy/keycloak/knowledge-portal.json`: the `knowledge-spa`
  client, the `knowledge-api` audience, and the `knowledge_*` roles and groups, added to the
  shared realm with `deploy/keycloak/apply.py` ([#51]).
- Its own hostname: the browser app's base path is a build setting (`KNOWLEDGE_BASE_PATH`,
  `/knowledge/` in released images), the edge no longer depends on it, and the web image takes
  `REQUIREMENT_PORTAL_URL` and `CSP_IDENTITY_ORIGINS` at start-up ([#52]).
- Per-service credentials: this portal can call requirement work with its own `knowledge-service`
  client (`KNOWLEDGE_SERVICE_CLIENT_ID`/`_SECRET`), and `/internal` admits requirement work's
  `requirement-service` client (`REQUIREMENT_SERVICE_CLIENT_ID`), alongside the shared tokens
  ([#53]).
- Also since 0.1.0: the Product Architecture Explorer (requirement-portal ADR-0101, steps 1 to 7),
  historic requirements (requirement-portal ADR-0102), and where requirement work cites each one
  ([#48]).

### Changed

- platform-kernel 1.1.0.

### Upgrading

- Images before 0.2.0 refuse `APP_ENV=production` unless `REQUIREMENT_API_BASE_URL` is set.
- To move from requirement-portal's deployment, follow "Moving over from requirement-portal's
  deployment" in `docs/operations/deployment.md`.
- Service credentials are optional; to adopt them, follow "Service credentials" there. The shared
  tokens keep working while both portals move over.

## 0.1.0 — 2026-10-03

The first release: the library, the architecture catalogue and the squad catalogue, with their
curation screens, served beside requirement work.

[#48]: https://github.com/mohamhossam/knowledge-portal/pull/48
[#49]: https://github.com/mohamhossam/knowledge-portal/pull/49
[#50]: https://github.com/mohamhossam/knowledge-portal/pull/50
[#51]: https://github.com/mohamhossam/knowledge-portal/pull/51
[#52]: https://github.com/mohamhossam/knowledge-portal/pull/52
[#53]: https://github.com/mohamhossam/knowledge-portal/pull/53
