# Changelog

Each release tag `vX.Y.Z` publishes `ghcr.io/mohamhossam/knowledge-api:vX.Y.Z` and
`ghcr.io/mohamhossam/knowledge-web:vX.Y.Z` (`README.md`, "Images and releases").

## Unreleased

### Added

- Route handlers take the use cases they need, never the container (review recommendation
  12). The 21 handlers that read the container directly (the internal API, the change-request
  routes, the draft's readings and the sign-in configuration) take providers from
  `dependencies.py`, and a test fails any handler that takes the container again. Every
  refusal now answers `{code, message, correlation_id}`: the 404 of an internal API that is
  not served, the kernel guard's 401 and 503 for a missing or unreadable service token (its
  body rewritten on the way out; the kernel is unchanged), the route's own second check, and
  FastAPI's unknown path (404) and method (405). They answered `{"detail": ...}` with no
  correlation id; now a refused internal call carries the id its log line has, and
  `X-Request-ID` matches it. Status codes and headers are unchanged. requirement-portal
  should read `message` where it read `detail`.
- The internal contract has a version that means something. `INTERNAL_CONTRACT_VERSION` in
  the package sets it (1.0.0; the file carried FastAPI's default, 0.1.0), and every shape change
  raises it: MAJOR for a breaking change, MINOR for an additive one. A new CI step regenerates
  the contract, fails when the committed file is stale, and compares it with the base branch's
  (`scripts/check_internal_contract.py`). Each change is listed as breaking or additive, and a
  version that does not rise as far as the change needs fails the build.
  `interfaces/api/contract_compat.py` does the sorting. Removed operations, parameters,
  responses, schemas or fields, changed types, new required request input, stricter request
  limits, lost enum values, and response fields that may now be missing or null are breaking.
  Review recommendation 11. Internal contract: version 1.0.0, additive against main.
- The explorer reads the catalogue's taxonomy as data (ADR-0101, Amendment 4, proposed). Its
  response carries the vocabulary terms and curated vocabularies, the capability domains and
  the interface records, without who accepted them. Role terms gain a `rank` (strongest
  first) and top landscape domains a `layout` (`bus`, `above_bus`, `side`). The committed
  catalogue holds the order and layout the frontend hard-coded, and a version without them
  falls back to that. Role and channel-kind terms are matched by their labels, not by an id
  prefix. The explorer names roles by their vocabulary terms, and the Solution Architecture
  document names a linked interface by its record. YAML, JSON and the workbook carry `rank`
  (Vocabulary) and `layout` (LandscapeDomains), both optional. Review recommendation 10.
  Public contract, additive; the internal contract is unchanged.
- Vocabularies are data, on one SKOS base (ADR-0125, proposed). A version holds the
  vocabularies a curator defines beside the seven built-in ones, each covering free-text
  fields: an offering's NFR quality, family, lifecycle and business-rule kind, an activity's
  mode and phase, a portfolio node's level, and a system component's technology. Each of those
  fields gains a term id beside its text, and the vocabulary clean-up proposes links for a
  field once a vocabulary covers it, so a new list needs no deploy. Concepts and terms check
  their shape in one place and both gain `close_match` beside `exact_match`. Every catalogue
  file format carries vocabularies (`schemes`; a Schemes sheet), the new links (`*_term`
  columns, optional) and close matches; the version diff reports a vocabulary as its own
  item. Labels carry no language tag: the portal is English only. Review recommendation 9.
  Public contract: a term's `scheme` is any vocabulary id, no longer one of seven. Internal
  contract, additive.
- Offerings and portfolio nodes retire like systems, and everything outside a version follows
  an id to what names it now. An offering or portfolio node takes `deprecated` and
  `replaced_by` (ADR-0121, amended), checked as a system's are; the offering's editor has a
  "Retired" box and a "Replaced by" choice, and its page and list say "Retired". One resolver
  follows an id through its former ids and its replacements. The organisation catalogue tells
  a product naming a renamed or replaced offering or portfolio node, or a squad seat scoped to
  a replaced concept, where the id went ("this offering is now X (renamed); link that
  instead") rather than that it is gone. Precedents count for the system, offering and
  concepts their old ids name now, and a retired offering is no longer matched by an
  assessment. YAML, JSON and the workbook's Products and Portfolio sheets carry the two
  columns, which are optional. Review recommendation 7. Public and internal contracts,
  additive.
- Journey steps and tracking flows can name the interface record they go through. An
  integration or a tracking flow takes an optional `interface_id`, checked against the
  version: the record must exist and be exposed by a system of the call. The journey editor
  offers the records of the systems a step touches beside the interface text its source
  writes. A dependency derived from a linked step takes the record's kind and direction
  (ADR-0119, amended); an unlinked step whose text names exactly one record is read the same
  way only when the direction agrees. A journey read again keeps a maintainer's links. YAML,
  JSON and the workbook's ActivityIntegrations and TrackingFlows sheets carry `interface_id`,
  an optional column. The committed catalogue is unchanged. Review recommendation 8. Public
  and internal contracts, additive.
- A fact's source line is read once, by one rule. The service reads every source line a
  version's facts write against its source register ("SDD v2.3 · §4.1" names the source
  short-named "SDD v2.3", at "§4.1") and sends those readings with the version as
  `source_references` (source id, the words that name it, and where in it). The catalogue's
  pages, the explorer, its Solution Architecture export and the catalogue lab look a line up
  there instead of matching it themselves: four implementations with three different
  boundary rules are now one (`citations.source_reference`), and the unused
  `governance.named_source` is gone. A conflict's side, which names its source by id, says the
  level directly. A line typed in an editor and not yet saved reads as written until it is.
  Review recommendation 5. Public contract, additive.
- An accepted suggestion keeps where it was read. Its acceptance record (ADR-0120, amended)
  holds the suggestion's first three citations, each with its location and quote, and the
  document version and title when it came from one of the draft's documents, so a fact still
  leads to its passage after a later reading replaces the draft's suggestions. A system's or
  offering's "Accepted from" lists them ("Integration design, §4.1 › Table 2, row 3: “…”"),
  and the heading's one line names where the last one was read. YAML and JSON carry them with
  each acceptance, and the workbook's Acceptances sheet in a `citations` column. Review
  recommendation 6. Public and internal contracts, additive: an acceptance's `citations` list
  defaults to empty.
- A system's capabilities and components say where they come from. Like every other catalogue
  fact, each now carries an optional confidence (confirmed, inferred or gap) and a source, checked
  the same way: a capability's phrases and its concept link are what select a system
  (ADR-0114), and until now they were the only facts with no evidence. The system's page shows a
  Source column for both ("Not stated" when nothing says), its editor takes them row by row, the
  version diff reports a changed confidence or source, and the draft's Check step lists the
  sources they cite that the register lacks. An accepted suggestion keeps what a maintainer said.
  YAML, JSON and the workbook's Capabilities and Components sheets carry `confidence` and
  `source`; the columns are optional, so older workbooks still import. Review recommendation 4.
  Public contract, additive; the internal contract is unchanged.
- Approvals keep what their approver looked at. Publishing from the review desk sends how many
  passages the reviewer looked at, of how many, and how many of the flagged ones, as the publish
  panel already said; the publication keeps it as `coverage`, and a version's publications list
  it ("looked at 3 of 4 passages, 1 of 2 flagged"). "Seen" is kept in the browser per reviewer and
  version, so a closed tab no longer starts the count again. Counts that cannot be (more seen than
  there are) are refused. A version put back on an earlier review keeps none. Closes backlog BG2.
  `POST /library/documents/{id}/versions/{version_id}/approval` takes an optional `coverage`;
  public contract, additive.
- Accepting the ready suggestions goes through its consequence. "Accept the N ready" on the
  Decide step opens a panel that lists what it will accept and says that nothing reaches
  requirement work until the draft is published; a new "Ready to accept" filter lists the whole
  set. The service accepts only the suggestions listed, never one a reading added since:
  `POST /architecture-knowledge/releases/{id}/suggestions/acceptance` takes optional
  `suggestion_ids`. Focus mode sends the suggestions its summary lists under "What follows".
  Public contract, additive.
- A page that fails no longer blanks the portal. A render error, or a page's code gone after an
  update, shows what happened in place of the page, with "Try again" and "Reload the page"; the
  sidebar keeps working, and moving to another page clears it. A failure outside any page shows
  the same on a page of its own.

- Sources a draft cites but doesn't register. A fact cites its source as the source's id or
  short name, then where in it; one whose source the register doesn't hold can't show that
  source's level or title. The Check step lists each such source with how many facts cite it
  and a few of them, and links to the draft's register; it says so when every fact names a
  registered source, and a failed check doesn't hold up the step. Citations that differ only
  in case are one source. The committed catalogue cites five: "Ontology plan" Phases 1, 6 and
  8, "ADR-0123" and "Catalogue curation". `GET /architecture-knowledge/releases/{id}/citations`; public
  contract, additive.

- Stable ids for offerings and journeys (ADR 0124, proposed). An offering or journey can be
  given a new id from its page ("Change the id…"); the old id is kept in `former_ids`, and the
  version's journeys and conflicts follow. Precedents, change requests, suggestions and the
  organisation catalogue that still name the old id find it, and an address with the old id
  opens the page under the new one. Renaming back undoes a rename. The version diff reports
  a rename as one change with `id` first. Every catalogue file carries `former_ids`.
  `POST /architecture-knowledge/releases/{id}/offerings/{offering_id}/rename` and
  `.../journeys/{journey_id}/rename`. Public and internal contracts, additive; requirement-portal
  should adopt `former_ids` (`docs/architecture/requirement-portal-handoff-catalogue.md`).

- Structured fields, part 2: a call's `timing` is `Sync` or `Async`, read in any case and as
  sources write it ("Synchronous", "Sync (callback)"); text that names no timing, or both, is
  refused, with its place in a catalogue file. Tables read from documents keep other wording
  out of the field, and releases, suggestions and change requests stored before load with it
  read again. The journey editor chooses the timing. A plan characteristic carries the `amount`
  and `unit` its value says ("200 Mbps" is 200, Mbps; "5G" is a name, not a measure). A step
  whose point of no return is a bare "yes" says what that means; a "no" or "N/A" is not one.
  Public contract additive but for `timing`; internal contract the same, with `timing` narrowed
  on `POST /internal/change-requests`
  (`docs/architecture/requirement-portal-handoff-catalogue.md`).

- Structured fields for facts the screens read from prose. Offerings carry a `purpose` beside
  the proposition; open questions a `title`; components a `hub` flag (at most one per
  offering); order types a customer `stage` (join, change, support, leave); fallout cases the
  `system_id` they fall out in; flow rules the `channel_id` they are taken for. Every catalogue
  file format reads and writes them, the editors set them, and the lab and explorer read them
  first, parsing the old prose only for a version saved before them. The explorer document
  takes a step's `VALIDATE` role, not its words, as a validation. smb-architecture.yaml moves
  its prose into the fields: the purpose paragraph, 12 question titles, the CPE as hub, the 19
  order types' stages (the lab's stage table of 2026-10-14) and the two fallout cases' systems,
  each named in its own text. Contracts, additive (public and internal: requirement-portal
  should review the new optional fields).

### Changed

- Dependabot no longer proposes TypeScript 6 or later (`.github/dependabot.yml`):
  openapi-typescript and typescript-eslint, even at their latest, require TypeScript below 6.1,
  so such a bump cannot install. Lift the rule once both accept a newer major.
- CI builds and tests the frontend on Node 26 (`.github/workflows/ci.yml`), the version the web
  image builds with once #115 moves `deploy/web` to `node:26-alpine`.
- The committed catalogue (`catalogues/smb-architecture.yaml`) gives Customer's two masters
  their notes, from the owner's account of the NC Digital migration (ADR-0123): CBCM masters
  Customer only until every customer has moved, receiving NC CRM's customer management by
  replication meanwhile, and NC CRM is then the only master. The Check step of a draft built
  from it no longer lists Customer as missing a note.

### Fixed

- Opening a result a moment after typing in a find box no longer pulls the reader back to the
  list. The box writes `?find=` to the address shortly after typing stops; when Enter opened a
  record first, that late write landed on the list's address and replaced the record. It now
  stays with the page it was typed on. The catalogue's keyboard journey failed about one run
  in twenty on it.

- A catalogue upload the malware scanner gives no verdict on is refused with 503
  `malware_scanner_unavailable`, not 422 `document_extraction`: the scanner being down, or
  the file being larger than it accepts, is an outage to retry, not a fault in the file. This
  covers document uploads and catalogue-file preview and import. A batch upload stops at the
  first such file instead of waiting on the scanner for each one after it; those are refused
  unscanned, and the response still lists every file, with the ones already added. Nothing is
  ever taken unscanned. The screens say what to do, since the service withholds an outage's
  own message. Public contract unchanged.

- Accessibility and reading fixes from the catalogue's design review. A focused field in a
  workbench record pane, which scrolls on its own, now stays clear of a pinned editor foot
  as it does in the page (WCAG 2.4.11). The masthead's sign-out and a search field's clear
  button are 24px targets (WCAG 2.5.8). A diagram's "Show as table" button now says
  "Show as drawing" once the table shows, instead of a pressed state. Lead and caption text
  keeps to 62 characters a line, as Archivo's wide figures run long. The device an offering
  is built on is one choice above its parts, so choosing one no longer silently clears
  another part's box. Closing a journey's edit or remove panel gives focus back to its
  button, as an offering's already did. A question's title field takes the full width.

- Every word a diagram node shows is in its accessible name, in order (WCAG 2.5.3 Label in
  Name, which axe 4.14 checks): a node's label wraps onto as many lines as it needs and is
  never cut, the layout growing every node to hold it; its detail and state line still ends in
  "…" past two lines, now cut between words; and its drawn lines are spaced apart in the
  markup, so their words no longer run together. The squads bench's seat button reads "Edit
  seats of {squad}", its visible "Edit seats" first. `docs/design-system.md` says so.

## 0.7.0 — 2026-10-21

Reading a document now suggests every kind of catalogue entry a curator decides on: interfaces,
capability domains, portfolio nodes, realisation records, sources and conflicts join the
earlier kinds, each recording where it came from once accepted (ADR-0123). Systems that share
mastery of an entity carry a note on the part each owns; library documents carry a type and
topics, in English; the explorer keeps a version's change history and rate-limits plans
lookups (ADR-0101 Amendment 3). Uses platform-kernel v1.3.1 and Pillow 13.

### Added

- Sources and conflicts suggested from documents (ADR-0123,
  `docs/slices/source-conflict-suggestions.md`), the last of the suggestion kinds the owner
  asked for: reading a document now suggests the sources it names or is (title, the name it is
  cited by, version, and level, L3 unless the document states one) and the conflicts it reports
  between two sources (both statements, where each is said, the offerings affected). A source
  fills an existing one's gaps and never changes its level; a conflict waits for its two
  sources (new `needs_source`) and the offerings it affects (`needs_offering`), keeps the sides
  first recorded, and is always decided one by one, never accepted in bulk. Both record where
  they came from once accepted (`accepted` on sources and conflicts, kept by every catalogue
  file format). Decide lists them under Sources and Conflicts between sources. Public contract,
  additive; prompt `catalogue-extraction-v20`.

- Realisation records suggested from documents (ADR-0123,
  `docs/slices/realisation-suggestions.md`): reading a document now suggests the customer-facing
  services, resource-facing services and resources it names (layer, the system that delivers or
  holds it, and what realises it one layer down). One per record, its readings merged; it waits
  for the systems it names (`needs_system`) and for the lower-layer records that realise it (new
  `needs_realisation`), fills an existing record's names, systems and gaps without replacing its
  layer or anything set, and records where it came from once accepted (`accepted` on realisation
  records, kept by every catalogue file format). Accepting all takes resources, then RFSs, then
  CFSs. Decide lists them under Realisations. Public contract, additive; prompt
  `catalogue-extraction-v19`.

- Business areas and portfolio places suggested from documents (ADR-0123,
  `docs/slices/tree-suggestions.md`): reading a document now suggests the capability domains
  ("business areas") and portfolio nodes it describes, each with the node it sits inside,
  and a portfolio node with its level in the document's own words. One per tree and name, its
  readings merged; each waits for its parent (`needs_domain`, new `needs_portfolio_node`),
  fills an existing node's gaps and never replaces its level or anything set, and records
  where it came from once accepted (ADR-0120): `accepted` on capability domains and portfolio
  nodes, kept by every catalogue file format. Decide lists them under Business areas and
  Portfolio. Accepting all now repeats while it makes progress, so a node three levels down
  is accepted in one go once the nodes above it are. Public contract, additive; prompt
  `catalogue-extraction-v18`.

- Interfaces suggested from documents (ADR-0123, `docs/slices/interface-suggestions.md`):
  reading a document now suggests the APIs, event streams and file feeds it describes, each
  with the system that exposes it and those that consume it. One per system and name, its
  readings merged; it waits for the systems it names and the interfaces it relays, fills an
  existing interface's gaps and never overrides it, and records where it came from once
  accepted (ADR-0120). Decide lists them under Interfaces. An accepted suggestion of any kind
  now always reaches the draft: capability domains, conflicts, the portfolio, interfaces and
  realisation records were left out of what accepting saved. Public contract, additive;
  prompt `catalogue-extraction-v17`.

- Library documents have a type and topics (ADR-0123, `docs/slices/library-classification.md`):
  the owner sets what kind of document it is (a document-type term of the catalogue in service,
  such as Solution design or Contract) and the business capabilities it is about, on its page
  or its type at upload. The library list filters by type and topic, and the summary and the
  document page say both. English only. `GET /library/classification-options`,
  `PUT /library/documents/{id}/classification`, and an optional `document_type` on upload;
  public contract, additive. The catalogue gains a `document_type` vocabulary with eight terms.

- Data with more than one owner (ADR-0123, `docs/slices/shared-mastery.md`): several systems
  may be the system of record for one information entity when each says which part it
  masters, in a `mastery_notes` list on the system (API, YAML and JSON, and a new MasteryNotes
  workbook sheet). A note names an entity its system masters, once. The system record shows
  each note; the draft's Check step lists the shared entities and the owners with no note yet,
  and Publish names them as worth a look without holding publishing. Public contract, additive.

- Explorer plans lookups are rate-limited (requirement-portal ADR-0101, Amendment 3,
  `docs/slices/explorer-plans-limit.md`): each reader's lookups of an offering's plans count
  against their own per-minute budget (`PROVIDER_RATE_LIMIT_PER_MINUTE`), apart from admins' AI
  calls; past it they are told "Too many product catalogue lookups" with when to try again
  (429, `Retry-After`). The explorer keeps the version's change history: the owner decided it is
  content, and the rule now says so.

- Names compared one way (`docs/slices/model-cleanup.md`): two systems, two components of
  one system or two sibling domains may no longer differ only in punctuation ("Wi-Fi Hub"
  and "WiFi hub"), as concepts and terms already may not; one system still keeps such
  spellings of its own name. A capability linked to a concept sits in that concept's
  domain or in none. The committed catalogue holds to both. ADR-0123 proposes the item's
  three open decisions: co-mastery, an interface suggestion kind, library classification.

- One canonical dependency model, part 2 (ADR-0119, `docs/slices/derived-dependencies.md`):
  a draft's Sources step suggests every dependency its interfaces and journeys already say
  (an API's consumer calls it; an event's or a file's system sends to its consumers; a
  journey's hand-over, through an integration layer as two), one per two systems and kind,
  each citing the interfaces and journey steps that say it. They are decided on Decide like
  any other suggestion; suggesting again leaves out what the draft holds or a curator
  rejected. `POST /architecture-knowledge/releases/{id}/derived-dependencies`; public
  contract, additive. Decide names the draft's own catalogue as a suggestion's source,
  rather than a missing document, for every reading of it.

- One canonical dependency model, part 1 (ADR-0119, `docs/slices/dependency-identity.md`): a
  dependency is identified by its two systems and its kind, so rewording what it is for is a
  change to it and two systems can depend on each other in two ways at once. Dependencies
  gain `confidence` and `source` like every other fact, in the API and every catalogue file
  (optional Relationships columns). A version stored before reads with same-kind dependencies
  between one pair joined. A connection's change says how the systems were linked even once
  removed, and names what changed in words. Public contract, additive.

- Retiring without deleting (ADR-0121, `docs/slices/lifecycle-deprecation.md`): a system, a
  concept or a vocabulary term can be retired and name the one that replaces it. It stays in
  every version and reads everywhere, drawn struck through with the word Retired, and the
  draft's changes name it; no requirement maps to it, no assessment or suggestion reaches it,
  and a reference to it forwards to its successor. A squad seated on a replaced system is
  pointed at the successor. The system sheet's editor retires a system; catalogue files carry
  `deprecated` and `replaced_by` (optional workbook columns on Systems, Concepts and
  Vocabulary). Public contract, additive: the two fields on systems, concepts and terms, and
  `replaced_systems` on the organisation's reference flags.

- Provenance survives acceptance (ADR-0120, `docs/slices/provenance-survives-acceptance.md`):
  accepting a suggestion records on what it produced which suggestion it was, the model and
  prompt version behind it, and who accepted it when. The system and concept records show it
  beside their source, the offering and journey records in a line under their name; the
  explorer does not. A page edit adds and removes none; a catalogue file carries them in a new
  `acceptances` table (an `Acceptances` sheet in the workbook) and an import adds them. The diff
  ignores them. Public contract, additive: a read-only `accepted` list on systems, components,
  capabilities, dependencies, landscape domains, offerings, journeys, channels, concepts and
  terms. The internal contract gains the same list on an offering draft's offering and journey
  (always empty): requirement-portal should review it.

- The Golden set report (Catalogue › Golden set): run the impact mapper over the catalogue's
  golden set in the background, keep each run, and read it: scores in three groups with the counts
  and range behind each and the floor it is held to, a verdict table, every case at a glance,
  the systems it misses and raises most, every case's expected and predicted answer, and
  comparison with another run. 12 of the 59 cases are held out of tuning (`split: held_out`), and
  a run may repeat 1 to 5 times for a mean and spread. Public contract, additive: `GET
  /evaluation/golden-set`, `GET` and `POST /evaluation/golden-runs`, `GET
  /evaluation/golden-runs/{run_id}`, and the `golden_run` value of `ArchitectureJobKind`. New
  setting `EVALUATION_ROOT`; the API image now carries the golden set, its floors and the
  catalogue. Migration `202610190900_golden_runs`. See `docs/operations/golden-set-report.md`.

- The catalogue says three things it left to prose and naming before, additively in both
  contracts. An order type's `delivery_drop` ("P2 / P3"), set in the catalogue file
  (YAML, JSON, or the workbook's new `OrderTypes` column); `catalogues/smb-architecture.yaml`
  moves its 19 "Delivered in drop …" sentences there. A landscape domain's `cross_cutting`
  (TAM's enterprise domain and the integration layer), in the file and the workbook's
  `LandscapeDomains` sheet, and named in a version diff. Each activity's `main_track`,
  derived from its track on the way out and ignored on the way in. The catalogue lab reads
  them, and reads the old prose only for a version saved before them. The internal contract
  gains `delivery_drop` and `main_track`: requirement-portal should review it.

- Each journey's flow per channel, read-only beside `edges`: `channel_edges` (for each
  channel its steps name, the flow that channel sees: its own steps and the shared ones) and
  `shared_edges` (what a channel no step names sees). A rule counts in a view only when both
  its ends are in it, a parallel track rejoins only where the view has the step, and a loop
  stays a `loop` edge. Derived like `edges`, ignored on the way in; both contracts gain the
  two fields (additive). In the domain: `Activity.seen_in`, `journey_edges(journey,
  channel)`, `shared_journey_edges` and `journey_channels`.
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
- A web image can carry the catalogue redesign lab: built with `VITE_CATALOGUE_LAB=true`
  (`deploy/web/Dockerfile`), the lab and its "Catalogue" link are in the production build, as
  under the dev server. Published images leave it out, as before (the argument defaults to
  `false`).
- The catalogue redesign lab reads the catalogue version in service from the API, with a
  loading, error and nothing-in-service state. Its "Data" switch turns to the bundled
  Business Pro Plus sample and back, to compare the two; the sample says so under the bar and
  loads only when chosen. `VITE_CATALOGUE_SOURCE=sample` makes the sample the default.
  Governance and Versions open the portal's catalogue pages.
- An address under the catalogue redesign lab that no page has says "Page not found", with
  the lab's sections and the way back to the landscape. The lab's switches
  (`VITE_CATALOGUE_LAB`, `VITE_CATALOGUE_SOURCE`) and its address are read in one place,
  `frontend/src/app/features.ts`, which also holds the lab's loader: where the lab is off,
  as in a published image, its code is still left out of the bundle.
- The catalogue lab's bundled sample (`frontend/src/catalogue/model/fixtures/smb-release.json`)
  is generated from `catalogues/smb-architecture.yaml` through the API's read schema by
  `scripts/dump_catalogue_fixture.py`, so it carries what the API sends: the vocabulary,
  role ids, interfaces, realisations and the per-channel flows. A backend test fails when it
  is stale (`--check`). The frontend reads it through one checked loader
  (`catalogue/model/sample.ts`) instead of casting it.
- Seed tooling for the full catalogue: `scripts/seed_full_catalogue.py` imports
  `catalogues/smb-architecture.yaml` into a running offline API as a maintainer would (draft,
  file import, build, publish), and `seed_demo.py --full-catalogue` puts it in service after
  the sample version, before the sample draft. The sample squads are now seeded before the
  draft, while the sample version whose systems they own is in service. Both scripts share
  `scripts/_catalogue_seed.py`: the personas, the full catalogue's file and name, one wait
  that stops on a failed read or after 120 s, and the service's refusal (409, such as a
  draft already in progress) reported in one line instead of a traceback.

### Changed

- platform-kernel v1.3.1 (was v1.1.0): it allows Pillow 13, so only the docling family still
  needs the `[tool.uv]` Pillow override. Behaviour changes it brings (kernel CHANGELOG 1.2.0):
  migrations serialise on an advisory lock and wait at most 10 s for each lock, so a migration
  stuck behind live traffic fails and leaves the database as it was instead of queueing every
  later query; OIDC tokens get 60 s of clock leeway; signing keys reload without blocking other
  requests; and the client for requirement-portal has a circuit breaker, failing at once for
  30 s after five unavailable calls in a row. Tracing (1.3.0) stays off. No upgrade step.

### Fixed

- The catalogue's view model (adapter, model, conventions, vocabulary, flow layout, exports and the
  bundled sample) moves from a new top-level `frontend/src/architecture/` to
  `frontend/src/catalogue/model/`, a sub-area of the catalogue module like `draft/` and `journey/`,
  so the branch keeps main's module structure. Only import paths change.
- The catalogue lab reads from the version what it used to write in. The catalogue's name is the
  version's name up to any colon (the live catalogue reads "Business Pro Plus (SDD v2.3)", the
  sample "SMB architecture"). A plan's price gap names the product's primary source ("SDD v2.3").
  The layers keep one order everywhere, the version's own, with the integration bus placed by a
  named rule under the customer layer (`catalogue/model/conventions.ts`). The map's rows follow
  from that order and each layer's width, which replaces `DOMAIN_ORDER`, `ROWS` and the magic
  99. On the Systems page, the integrations matrix now lists the integration layer after
  Customer, as the map does. The journeys page opens on the deepest portfolio node every
  product shares, not on "Fixed › SMB" by name. The order-type stages stay a business rule in
  code, now tested.
  - New unit tests for the lab's pure helpers (`labUtil`, `posterModel`, `journeyScope`,
    `stages`, the name helpers). The lab test reads its counts from the fixture.
- The catalogue lab's styles are built on the design system, in light only. Each `--cl-*`
  colour is now a semantic token (`design/tokens`). The ones it lacked are new primitive and
  semantic tokens, with no dark values yet: layer tints and inks, footprint, intensity,
  amounts, and quiet text on the action fill. Their contrast is checked in the token test.
  - The brand lint no longer exempts the lab, and the lab has no raw colours left.
  - Focus and the current system are maroon. Red marks only the traced call: its line,
    arrowhead and number.
  - The gradients are flat tints. Only hatching that marks a state is kept.
  - Colour changes are instant. The motion left is opacity and transform, at 200 ms or less.
  - Smooth scrolling respects reduced motion.
  - The portal shell has a `fullBleed` prop, which replaces the lab's `.ds-main:has(...)`
    override. The lab sticks under the shell's measured `--sticky-top`, not a fixed 56px.
  - 74 duplicate rules are folded into their first rule, and the dead masthead CSS is gone.
    Computed styles stay identical on 19 lab pages at 3 widths, apart from the changes above.
- The catalogue lab's largest modules are split along their seams, with no change on any
  page or in the model: the journey's calls (`IntegrationRegister.tsx`, out of the 709-line
  `JourneyFlow.tsx`), the product's Components tab (`ProductComponents.tsx`) and who can buy
  it (`WhoCanBuy.tsx`), the journeys page's scope menu (`JourneyFilters.tsx`) and opening
  scope (`journeyScope.ts`). The product's Architecture tab is two views (`ProductMap`,
  `ProductJourneyMap`), each computing only its own state. `fromRelease` reads as one line per
  part of the version (`sourcesOf`, `domainsOf`, `systemsOf`, `offeringOf`, `journeysOf`,
  `findingsOf`…) and `journeyView` as what it decides, with `stepsOf` and `callsInView`. The
  journey flow's sizes, margins and text placement are named constants. The model the lab
  builds is byte for byte the same, and 17 lab pages read the same.
- The catalogue lab's modules no longer import one another in circles (11 cycles, all through
  the lab's router and the product page): the chrome every page shares (section bar, data
  switch, sample notice, evidence tag, path) is in `labChrome.tsx`, and the product parts
  other pages show (header, plans, "not in this version") in `productParts.tsx`. A test
  (`importCycles.test.ts`) fails on any new cycle. Repeated helpers are one each: `LabIcon`,
  `SystemMonogram` (8 copies), `pathTo` (now safe against a node that is its own ancestor)
  and `useDismissableDetails`, which gives the Landscape's Key menu Escape to close, like the
  others. The product's Architecture tab keeps the picked system in the address
  (`?system=`), so a reload or a shared link keeps it, and the journey's Integrations tab
  starts again at the first call when the journey or channel changes, instead of keeping a
  position in another list. The lab's 14 pages read the same before and after.
- The catalogue lab's business rules each live in one place (`design-lab/catalogue/catalogueRules.ts`),
  where copies had drifted apart: a bundle's hub device (a whole-word "CPE" match, and no hub
  rather than the first part when nothing matches), a channel kind's name (the vocabulary's
  label, so the product page says "System" like the journeys page, not "Systems"), which
  question an eligibility point answers (the product card now uses the product page's
  grouping), the contract periods, when a system is core to a product, and whether plans
  state a price (the Plans tab no longer says "Monthly price: Gap" when a plan names one). The
  product's architecture reuses `reachOf` instead of its own copy.
- A step's role that the catalogue lab doesn't know (a code beyond its twelve, such as a new
  `PAYMENT`) is no longer dropped: the step keeps it, it is named from the version's
  vocabulary (`responsibility_role` terms, by `role_id` or `role-<code>`), or as written when
  no term names it, and the impact lens ranks it after the known roles. The lab's words for
  the twelve known roles are unchanged and now live in one place (`words.ts`, long and short
  forms), not in the model and again in the architecture map; the strongest-role order stays
  a rule in code (`ROLE_RANK`, `byRank`). `catalogue/model/vocabulary.ts` reads the role terms.
- A journey with a way back (a loop such as "Correct & resubmit", or any arrow that closes a
  cycle) no longer loses its steps in the catalogue lab's flow: the layout assumed no loops,
  so the steps of a cycle and everything after them were dropped from the drawing and the BPMN
  export. The way back is now left out of the ordering, so every step is placed, and is drawn
  dashed from under the later step, along a band under the lanes, up into the earlier one; the
  BPMN export carries it with its waypoints. No real journey loops today, and their drawings
  are unchanged.
- The lab draws the flow the service derives (`channel_edges`, `shared_edges`, `edges`)
  instead of its own copy of the rules: the two matched in all 46 views of the Business Pro
  Plus catalogue (20 journeys, each channel), so the copy is gone.
- A journey's flow in the catalogue lab no longer ends in a BPMN error end event, which only
  a subprocess's boundary event can catch and these flows have none. The last step of a
  side track (New activation's "Order returned for correction") is drawn as a step, like a
  rejected order's, and is followed by a plain end; in the flow it is now a numbered step
  with its own details, in the BPMN export a task, and in the impact lens one of its
  system's steps.
- A journey opened in the catalogue lab through a channel it isn't offered through (an old
  link, or a channel that no longer sells its order type) says so: "… isn't offered through
  “X”; it is shown through Y instead.", on the journey's flow and on the product's
  Architecture tab, one journey at a time. Before, the lab silently showed the first channel.
- The catalogue lab's view model no longer carries the API's release. `fromRelease` maps
  each journey's activities, flow (`edges`, `channel_edges`, `shared_edges`) and calls once,
  and `journeyView`, `journeyViews` and `impactOf` read only the model. The prose the service
  has no field for yet (the delivery drop, a proposition's summary and purpose, a question's
  title, the band domains, the main and error-end tracks) is parsed in one tested place,
  `frontend/src/catalogue/model/conventions.ts`. The model carries kinds (a lane is a system, a
  team or the ordering channel; events, gateways, hand-overs, unstated styles and timings),
  and the lab's `words.ts` names them; a call's id is the same in every channel's view, and
  its timing is read in any case. Nothing else on screen changes: every journey × channel
  view, its layout and exports, the impact lens and the systems' links matched the previous
  model, and the lab's pages matched pixel for pixel.
- Sending Decide's answers no longer hides failures. Adding the systems the answers need,
  and accepting what is ready, pass over only the service's "already done" refusals: the
  draft has the system (422 `invalid_architecture_knowledge`), nothing waits for it any more
  (404 `catalogue_suggestion_not_found`), or the draft moved on (409). Any other failure, or
  a failed re-read of the suggestions, stops the send and is shown. The send is
  `catalogue/draft/sendAnswers.ts`, tested on its own. A suggestion that needs only
  systems, an offering among them, no longer says it waits once they are added first; one
  that also needs a channel, offering or domain still does.

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
- A workbook's rows are read under their column names when a sheet has a header row ("Seq.: 1
  | Description: CPE platform selection | System: OM"), with a title row above the header ("WF-1
  Order fulfillment | ...") as their heading; merged cells hold their value once.
- A workflow table (a numbered step, a description or activity, and a system column) is read
  as a journey without the model, one per titled workflow: an SDD's provisioning book gives
  ten (table reader `catalogue-tables-v8`).
- A reading covers up to 2,000,000 characters, enough for a long SDD with its embedded
  documents, decks and workflow books.
- One workflow read twice is one journey: the same WF number ("WF-3-B", "WF-3B"), one name the
  start of the other, and most of the shorter one's steps shared, as embedded versions of one
  workflow book and a model's reading of its table give it. Other workflows of the same number
  stay apart.
- A step's combined system name ("OM-E2ESO") nothing answers to is matched part by part, when
  its parts are short like acronyms: the systems found perform and support the step
  (`document-reading-v3`).
- A workflow table's title is found when it spans several cells, or is a coded row ("WF-3 |
  Migration of Legacy product ... | Oder Type : Migrate") whose stages reuse the header above;
  their stages were filed under the workflow before (`document-reading-v4`).
- A workflow's stages stay open to the model, which reads the flows their remarks state
  ("WFMS will send to OM and OM will send to NEC"); they were marked read, and those
  dependencies were left out (`catalogue-tables-v9`).
- A reading with room proposes every system the document names, including one named only in a
  dependency or a remark, and not a team named in a System column; every offering, including
  one an order migrates from or to; and a process described step by step in prose as a journey
  (prompt `catalogue-extraction-v15`). An Opus 5.5 reading of the same SDD found these gaps.
- A reading is no longer asked to propose every system name it meets (prompt
  `catalogue-extraction-v16`): a small model then proposed tickets, phases and features (ADO,
  P4, TOSS) as systems, and fewer capabilities.
- A model provider's refusal (no credit, a rejected key, an unknown model) ends a reading at
  once with that reason (`model_payment`, `model_authentication`, `model_configuration`); one
  arriving as a plain HTTP status (OpenRouter's 402) was asked again for each of 300 parts.
- A catalogue reading sends several parts of a document to the model at once
  (`CATALOGUE_READING_CONCURRENCY`, 1-16, default 4) and puts what they give back in document
  order, so the reading is the same however the calls finish. A call waits mostly on the model
  writing its answer: a long SDD read on GPT 5.1 one part at a time was set to take an hour.
- A passage a document repeats word for word is read once and cited at every copy: a long SDD
  copies whole blocks under each impacted system, and 3,341 copies (28% of its text) were read
  again. Spreadsheet rows, and what sits under a "Product:" or "Journey:" heading, are always
  read where they are (`document-reading-v5`).
- Contents, lists of figures and tables, revision and version history, sign-off and
  distribution tables, and pasted JSON or XML payloads are left out of a reading, with a count.
- A system name spelled almost like a draft system ("FortiGaurd", "ESESO") is asked about in
  review as a possible match: "Spelled almost like FortiGuard: confirm it is the same system".
  The check runs against the draft as it is, so a variant of a system accepted later is asked
  about too; a confirmed one becomes an alias that later readings resolve. A different version
  number ("FortiManager 7.4") or a name under five letters is never asked about. It is asked
  once, on the system's own suggestion; asked on every capability naming it, one name was
  asked about 71 times.
- Decide waits for a system only when the service cannot find it by id, name, alias or the
  words of its name: a suggestion now carries `missing_systems` (additive), and the page reads
  waits from it. Matched by id alone, 24 suggestions kept waiting for "OM-E2ESO" after a person
  had answered that it is ESESO.
- A waiting name no suggestion spells out reads as an acronym where it looks like one ("OM
  E2ESO", "RTF"), not "Om E2eso"; cards in "what waits for what" say what each waits for.
- A question asked on its own names the system it is about ("NPS sends data to RTF", not
  "Sends data to RTF", which fourteen links shared); accepting says what it adds and what it
  then waits for; an inferred link is said to be inferred once.
- A workflow stage's performer is read whole ("E2ESO-ASAP ENG/UCAAS"), as a workflow book
  writes it, and a cell reading only "System", "N/A" or "TBD" names no performer: cut at "/"
  before any system was known, it named systems nothing suggested and kept 35 journeys
  waiting (`catalogue-tables-v10`).
- A dependency from or to a group ("Channels", "Digital Channels", "the fulfilment systems")
  is left out (`document-reading-v6`).
- A system that only a stated dependency names is suggested once, cited where it is named:
  an interface table's eleven "vCPE DO" rows waited for a system nothing suggested. A
  placeholder ("Unknown", "N/A") or an offering's name is not suggested; an inferred link
  suggests nothing (`document-reading-v7`).
- An item about no system is left out as incomplete, not given a system called "item".
- Accepting a link in Decide's focus mode adds the systems it needs first, and says so
  ("Accept the link, adding the system Generic AP PO"): a system nothing suggests is suggested
  and accepted, and one already suggested is accepted, before the link. Promised to "wait" for a
  system nothing added, the service refused every such answer and the same questions came back.
- Workflow titles are compared whatever separates their parts ("—", "|", ":" or " - "), so a
  model's "WF-3A Order fulfillment | ..." merges with the reader's "WF-3A Order fulfillment —".

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
