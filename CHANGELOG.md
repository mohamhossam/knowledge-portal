# Changelog

Each release tag `vX.Y.Z` publishes `ghcr.io/mohamhossam/knowledge-api:vX.Y.Z` and
`ghcr.io/mohamhossam/knowledge-web:vX.Y.Z` (`README.md`, "Images and releases").

## Unreleased

### Added

- Decide always says what to do next: answer the questions, accept the ready ones, or settle
  a wait nothing on the page can lift. A name that waiting suggestions need and nothing adds
  can be suggested as a system or made a product offering on the spot
  (`POST /architecture-knowledge/releases/{id}/suggestions/subject`), or what waits for it
  rejected. A new system, or a constraint of a system the draft lacks, can be made a product
  offering from its pane without rejecting and retyping it.
- Offering rules (`offering_rule` suggestions): a rule or limitation of a product offering,
  accepted into the offering's rules.
- A document's reading says how it stands (draft Sources step): the stage it is at (opening
  the file, reading part 3 of 12 with a progress bar, matching names, saving), when it
  started, roughly how long is left, and when the reader has stopped responding. The step
  header says the same in a few words. Catalogue jobs now report `queued_at`, `started_at`,
  `stage`, `progress_done` and `progress_total` (additive; migration `202610120900`).

### Fixed

- Reading a document no longer takes a product, bundle or plan for a system (prompt
  `catalogue-extraction-v13`): its rules are proposed as offering rules, and a "system" named
  like an offering the draft has or the document suggests is left out, with its constraints
  turned into that offering's rules.
- A draft's page head no longer widens the page past a 1280px window.
- Architecture documents are read within the operator's `DOCUMENT_*` extraction limits (PDF
  pages, extracted characters, spreadsheet cells, image pixels, XML nodes), as library
  documents are. They were held to the library defaults, so a large DOCX was refused ("more
  than 250000 XML nodes") whatever `DOCUMENT_MAX_XML_NODES` said.
- A long document is read whole. A reading stopped after 1,200 passages, about a tenth of a
  long Word specification; it now covers up to 1,000,000 characters and says where it stopped
  if a document runs past that.
- A Word table row is one passage, its cells under their column names ("System: CWOM |
  Change: …"), as a spreadsheet row is. A cell per passage split each row apart, so a quote
  across cells failed its check and the suggestion was dropped. Older citations of a cell still
  open its row.
- A Word document's figures (diagrams, journeys, sequence charts) are read by a vision model,
  each once, under the headings they sit in, and cited as "image N"; decorative images are
  left out. A model that cannot read images says how many figures went unread.
- A requirements or feasibility table, or a row naming several systems, is no longer read as
  a system inventory (table reader `catalogue-tables-v7`).
- One suggestion per system, component, capability, constraint and dependency: a long document
  mentioned CWOM in 37 places and offered it 37 times. Readings of the same thing merge, every
  citation kept with its own quote; the table reader's or the first stated reading leads.
- A model's answer is checked item by item: one item over a limit (eleven evidence numbers, a
  key left out) no longer loses the whole call. The schema the model is shown now lists every
  field, a "description" or "title" field included; they were stripped from it while
  validation still required them.
- A quote is found despite curly quotes, dashes and ellipses, across two neighbouring passages,
  or in another passage of the call, and is cited where it is; a citation pairs each place with
  the quote found there. Warnings now say how many suggestions were left out because their
  quote was not found, and how many were incomplete, by kind.
- A Word table's merged cells keep their value in each row and their columns aligned.
- An offering's plans, tiers and child POs are read as its plans, each with its stated facts,
  not as offerings of their own, and the suggestion lists them. Accepting a reading that names
  no plans keeps the offering's plans, business rules and portfolio place.
- A channel an offering's order types name ("Applicable Channels: BCRM, B2B, SMB App") is
  suggested as a channel when nothing else suggests it, entering through the system of that
  name; the offering no longer waits for channels nobody can accept.
- Journeys are read from a system's part in an order type too, and a reading says so when a
  document mentions journeys but none was read (prompt `catalogue-extraction-v14`).
- Office files a Word document embeds (Word, PowerPoint, Excel) are read with it, under the
  headings they sit at, cited as "embedded N, slide 3"; legacy OLE objects are counted, not
  read. Embedded files are not yet added to the evidence index, nor are their figures read.
- An embedded workbook is read without its hidden sheets: an SDD's workflow books each hid a
  sheet filled down to row 1,048,576 that refused the whole book.
- A stated dependency the model gave no description is kept, described by its kind ("Calls the
  API of CRMGW"); the reading had left out 104. One with no target is left out rather than
  linked to a system called "item".
- Embedded Word documents and decks are read before embedded workbooks, and a workbook's
  sheet already read word for word in an earlier embedded workbook is left out, with a count:
  five versions of one workflow book had spent the reading's budget. How a document is cut
  into passages is now part of its reading profile (`document-reading-v2`), so a change to it
  reads a document again.

## 0.6.0 — 2026-10-11

Phase 9: a new-offering verdict comes with a drafted offering and journey, which come back
with the approved backlog as suggestions. requirement-portal's export schema 1.6 needs this
release.

### Added

- New-offering drafts (ontology plan, Phase 9): for a `new_offering_in_family` or
  `new_product_line` verdict, `POST /internal/architecture/assess` answers with
  `proposal.draft`, an offering and the journey that fulfils it, drafted from the nearest
  offering by fixed rules: its components that deliver a needed concept, a reused or new
  component for each other one (with an open question when nothing realises it), and its
  journey for the order named, with a step for each added component. The approved-backlog
  export (schema 1.6) brings the draft back as `product_impact.draft`; the inbox says what was
  drafted, and reading it suggests the offering and the journey, each reviewed alone. The
  golden-set evaluation scores how many drafts apply cleanly (`drafts_applied`).

## 0.5.0 — 2026-10-11

Phase 7: what a closed Epic delivered comes back as a catalogue change, and the front page
shows how often the predicted systems were delivered. requirement-portal's Epic-closed hook
needs this release.

### Added

- What a closed Epic delivered (ontology plan, Phase 7): `POST
  /internal/change-requests/deliveries` keeps each closed Epic once as a catalogue change in
  the change-request inbox, with the Features delivered and not, the systems predicted and the
  catalogue changes the decided product impact implies; a removed Epic withdraws one still
  waiting, and a later closure replaces it. Reading one suggests a capability linked to its
  concept on each delivered system, and asks the offering which component delivers it. The
  inbox shows what each delivered and how it compares with the prediction, and the front page
  shows, per edition, the delivered systems predicted and the predicted systems not
  delivered (`GET /architecture-knowledge/deliveries/summary`).

### Fixed

- Accepting a capability suggestion for a capability already in the draft dropped its concept
  link and its "no concept fits" reason; it now keeps both.

## 0.4.0 — 2026-10-11

Phase 8's data, interfaces and realisation records, and Phase 5's retrieval quality: verdicts
decided in requirement work come back as precedents (requirement-portal ADR-0114 to ADR-0116).
requirement-portal's sending side needs this release.

### Added

- Data and interfaces (ontology plan, Phase 8): information entities as a sixth vocabulary,
  the entities each system masters or reads, and the interfaces systems expose, consume and
  relay, in the catalogue, the draft API and every file format. A requirement assessment names
  a data or interface change's owners and consumers, with the path to each; the internal
  contract gains the `owner` and `consumer` roles, the `entity` and `interface` path kinds and
  the `interface` facet.
- CFS, RFS and resource records (ontology plan, Phase 8): what a component is realised as
  becomes a record with the systems that deliver it and what realises it one layer down,
  in the catalogue, the draft API and every file format. A component's realisation links to
  its record, and an assessment's paths walk through the records; the internal contract
  gains the `realisation` path kind.
- Retrieval quality and monitoring (ontology plan, Phase 5):
  - an assessment's passages are reranked per facet and kept within budgets per facet, per
    document and in all; the reranker is lexical by default, or a cross-encoder over HTTP
    (`RERANKER_PROVIDER=http`, Text Embeddings Inference or a `/rerank` API);
  - `POST /internal/architecture/precedents` receives each verdict a Requirement Owner
    accepted, overrode or left unknown; the next assessment shows the nearest decided
    requirements to the reasoner as worked examples, and offers the systems two of them
    agree on as supporting candidates;
  - `POST /internal/architecture/assess` takes the optional `requirement_id`, and answers with
    `precedents` and `reranker_model`. All three changes are additive;
  - `GET /architecture-knowledge/precedents/summary` and the front page show, per release,
    how many suggested verdicts reviewers decided and overrode, and for which concepts;
  - the evaluation command's `--precedents loo` scores the precedent lane with every other
    golden case kept as an accepted verdict.

### Changed

- The assessment's prompt version is `requirement-assessment-v3`.
- A migration adds the `architecture_precedents` table.

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
