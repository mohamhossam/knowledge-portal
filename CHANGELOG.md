# Changelog

Each release tag `vX.Y.Z` publishes `ghcr.io/mohamhossam/knowledge-api:vX.Y.Z` and
`ghcr.io/mohamhossam/knowledge-web:vX.Y.Z` (`README.md`, "Images and releases").

## Unreleased

### Fixed

- Small catalogue leftovers from the edit reviews. A link to a hand-over, a business rule or a
  non-functional requirement opens on that row, not just its tab; a hand-over opens the journey's
  calls as a table, in a channel its step is taken in. A retired portfolio node's successor is
  named by its path, a link to its row. "This draft registers no source yet" is said once, under
  a form's title, not at every row. A conflict offers "Same as the conflict above", and an
  internal tracking status takes a source and how sure it is. Whether a part is always included
  can go back to "Not said". "How sure its source is" stays in its place but is unavailable,
  with the reason, until a source is stated, and a value it holds can still be cleared. Choosing
  another tab or view lets go of a row link, so it is not announced again. No upgrade step.
- Changing a system's dependency no longer drops where it comes from and how sure that is.
- "Keep editing", in the question a changed system or connections edit asks before it is thrown
  away, no longer saves the edit. The question's buttons took the place of Save and Cancel as the
  same elements, so the click that chose to keep editing ended as a press of Save. Keeping on
  editing now goes back to the field it left. Adding or removing a row in a catalogue form keeps
  focus in the form: a new row takes it, and a removed one hands it to the next row or the add
  button. No upgrade step.
- A long requirement no longer fails its assessment in the precedent lane. The lane embedded
  the whole requirement (45,189 characters on 2026-10-28), which the embedding model refuses,
  and the assessment answered 502 ("The embedding service returned unusable output"). It now
  embeds the text cut as a precedent keeps its own (its first 4,000 characters), so the two
  are compared alike; the concepts suggested to a vague requirement use the same text. If
  precedents still cannot be embedded, the assessment goes on without them, and the failure is
  logged without requirement text. ADR-0114 Amendment 4. No upgrade step.
- A quote stitched from separate lines of a requirement no longer fails its assessment.
  Requirement reading refused the whole answer (502, "Requirement reading invented a quote")
  when the model joined real sentences from items that are not next to each other, and
  requirement work showed "Product impact was not assessed". Such a quote now counts when each
  of its lines is in the requirement. A facet whose quote is still not found is set aside and
  the rest of the reading stands; the reader logs counts only. A reading left with no need, or
  a catalogue id or change type outside the lists, still fails. ADR-0114 Amendment 3. No upgrade
  step.
- A requirement's assessment embeds its search texts in batches. Each need's concept shortlist
  and each data, interface or need facet's passage search embedded its text in a call of its
  own, so a requirement with many needs made dozens of embedding requests one after another
  (about 50 at about 1.2 s each on the local stack), and requirement work gave up after its 120 s
  wait with "Product impact not assessed: The knowledge service could not be reached." The needs
  are now embedded in one call and the searched facets in another; the results are the same.
  The evidence index's searches take a query embedded beforehand (`queries`), which is never
  cached, unlike a stored passage. No upgrade step.
- A citation of a passage the model was not given no longer fails a requirement's assessment or
  an architecture match. Weighing the verdict refused the whole answer (502, "Weighing the
  verdict invented a citation id"), and requirement work showed "Product impact was not
  assessed"; architecture reasoning did the same ("Architecture reasoning invented a citation
  id"). Such a citation is now dropped. A system left with no checked citation is set aside and
  named in the uncertainty ("the passage it cited was not one supplied"); the verdict and the
  other systems stand. An invented system or offering, or a system with no citation, still
  fails. ADR-0114 Amendment 2. No upgrade step.
- One misquoted system no longer fails an architecture match. Architecture reasoning refused the
  whole selection (502, "Architecture reasoning invented a quoted passage") when any quote was
  not found word for word in its passage, and requirement work's feature generation failed with
  "The service could not complete the request" after three attempts. The match now finds quotes
  the way the verdict does (re-spacing and straightened quotation marks and dashes still match,
  and the passage's own words are kept); a system none of whose quotes is found is set aside and
  named in the match's uncertainty. The two steps share one quote finder. No upgrade step.
- One misquoted system no longer fails a requirement's assessment. Weighing the verdict
  refused the whole answer (502, "Weighing the verdict invented a quote") when any quote was
  not found word for word in the passage it cited, and requirement work showed "Product impact
  was not assessed". A quote now still matches when the model re-spaced it or straightened its
  quotation marks or dashes, and the passage's own words are kept. A system none of whose
  quotes is found is set aside and named in the assessment's uncertainty; the verdict and the
  other systems stand. No upgrade step.

### Changed

- One architecture catalogue: the catalogue redesign lab's views move into `/architecture`, on
  the design system and in both themes, and the lab is removed (with `VITE_CATALOGUE_LAB`,
  `VITE_CATALOGUE_SOURCE` and its sample switch). The Landscape tab draws where systems sit as
  the layered map, every system shown (one not placed in the landscape is listed under it), and what
  systems do by business area as the capability map, each with its table one press away. An
  offering gains Plans, Footprint and Rules (its business rules), a portfolio line and a
  "Delivered by" filter. A journey gains a process flow and a call register, and exports BPMN,
  PlantUML, Mermaid and the register as CSV. The Systems tab reads its systems as records, who
  calls whom (from the modelled journeys or the systems' own records) or what they deliver; the Map tab goes (`/map` opens who calls whom). Provenance
  opens what it names: a quote its passage, re-read from the stored document; a source line its
  Governance record; a source its document when the version holds it. The architecture
  diagrams' colours get warm-charcoal values.
- "Accepted from" leads with who accepted a suggestion and when, then which reader suggested it
  ("the catalogue reader"); the model and prompt version sit one step away, under "Model and
  prompt". The footprint's pine is documented in `DESIGN.md` as its one diagram hue.
- Every offering, listed and side by side, in one order: a family of two or more under its own
  name, the families of one offering together under "Other families" (each row naming its own),
  then those with no family stated. The side-by-side table gains a Family column and a "What it
  holds" filter (`?holds=components` or `empty`), marks an inferred offering as Suggested, and no
  longer repeats the intro.
- When no capability is filed under a business area, the Landscape says so (the areas the
  version names, how many capabilities its systems record, and where one is filed) instead of
  drawing empty areas beside one long column of the rest.
- A capability read under a business area is filed there (ADR-0128).
  - **Reading.** The reader (catalogue-extraction-v23) gives a capability's area only where the
    document places it under a heading, column or row naming one, and never guesses. The lean
    reading for small contexts gives none.
  - **Resolving the name.** The reading resolves the name to an area the draft has, or one the
    same reading suggests. Any other name is kept as written, never added as an area, and the
    reading's warnings list it with the capabilities that named it.
  - **Accepting.** Accepting files the capability under its area when the draft has the area
    and the capability has none. A capability already filed keeps its area. That way the
    Landscape's "What systems do, by business area" fills in from documents.
  - **Decide.** The sentence names the area. When the draft lacks the area, the row and the
    pane say whether filing waits on the area being accepted ("Open the business area") or
    whether nothing suggests it. "What waits for what" draws the link. The suggestion editor
    has a "Business area" select with a hint.
  - Suggestion content gains `capability_domain_id`. Public contract, additive.
- The service starts with no architecture catalogue (ADR-0126). It no longer seeds
  `smb-source-reference-v1` into an empty database; a knowledge maintainer publishes the first
  version, and the first draft starts empty, its review listing everything as added. Until a
  version is in service, `/internal/architecture/match` and `/internal/architecture/assess`
  answer 409 with the code `architecture_catalogue_not_in_service` (internal contract 1.1.0;
  requirement-portal should show that state rather than an error).
  `GET /architecture-knowledge/releases/active` and `GET /explorer/release` answer null, and
  the explorer says no version is in service yet. A diff's `base_release_id` and the mapping
  report's `active_release_id` may be null. Public contract, widened. The seed's special cases
  are gone: activation checks every release's embedding profile, and the deterministic YAML
  matcher that answered for the seed is removed. The reference YAML is test data now
  (`tests/fixtures/smb_architecture.yaml`); `scripts/seed_demo.py` publishes it through the API
  first. An existing database keeps its releases: starting fresh means resetting it.
- Decide, when only dead ends are left (common in a first version), says so plainly: what is
  accepted, that publishing leaves the rest out, and "Go on to the changes". Every missing thing
  is one table, opened on request. A missing system can be named as one the draft already has:
  `POST /architecture-knowledge/releases/{id}/suggestions/subject` takes the kind `existing` with
  `existing_system_id`, adds the name to that system's aliases, so every suggestion that names it
  (and later readings) finds the system, and rejects the suggestion to add it as a new system.
  Public contract, additive.
- CFSS and RFSS keep their own rules (ADR-0127). A realisation record that is a customer or
  resource facing service specification holds `rules`; the suggestion kind `specification_rule`
  adds one, and the reader (catalogue-extraction-v22) files a rule said of a CFSS or RFSS there,
  never as an offering's. Rules already waiting as an offering's are settled with the subject
  kind `specification` and `specification_id`: on Decide, "It is the CFSS in the draft" replaces
  "Suggest the offering" for such a name. Rules travel in the API, the YAML file, the workbook
  (a `rules` column) and the version diff. The interface says CFSS and RFSS; the stored layer
  values stay `cfs` and `rfs`. Public contract, additive.
- Every missing thing on Decide has an answer, and says why it is missing in plain words. An
  order type a journey needs is added to its offering or said to be one it has; a channel is
  suggested or said to be one the draft has; a CFSS or RFSS rules wait for is suggested or said
  to be one the draft has; a record named upside down (a CFSS as what realises an RFSS) is
  accepted without that link. The subject endpoint takes the kinds `order_type`,
  `existing_order_type`, `channel`, `existing_channel` and `new_specification` (with
  `existing_id` and `layer`). Journeys now wait for their offering's order type on the page as
  they do in the service, and "A new system" counts suggestions that name the system only in
  journey steps. Public contract, additive.

### Added

- What the catalogue's edits hold is shown where it is read. A system's record says each
  capability's business area, and what each interface is and where it comes from, in columns of
  their own. An offering says why a customer buys it, which part is the device it is built on,
  what each part is in its own column, what each system's role in a part is, the stage of each
  order type, what each plan is, and the system an order falls out in. The portfolio and the
  realisation records say what each node and record covers and where it comes from, "Not stated"
  when nothing says, and what replaces a retired node. A row is headed by its name alone, and a
  description reads as prose, three lines at most in a dense table. No upgrade step.
- The last facts the catalogue shows but could not be changed by hand are edited where they are
  read. An offering already in the draft is retired, with what replaces it, from its own "what it
  is" edit; before, only a new one could be. A non-functional requirement, each channel's
  tracking, flow, milestone and fallout case of the order tracking, each part of a lifecycle note,
  and each channel say their source and how sure it is, and a conflict where it is recorded. A
  journey's branch takes an arrow label, shown when it has no condition, and a system says, under
  where it sits, where a source places it instead (the draft's places offered) and why it sits
  here, both or neither, each said at its field and counted as a change. In every row, the source
  and how sure it is now sit last and together, with what the source saves as below them. The
  Channels page says each channel's source. No upgrade step.
- Quicker editing in the catalogue. A landscape domain added in an edit can hold another before
  either is saved, both saved by the ids their names give them, and an unnamed one is told apart
  in the list of places by its row. In a list of rows, a row that names no source offers, just
  after its Source, the source of the row above and how sure it is, in one press that keeps focus
  in the row. The Vocabulary tab's filter only filters the list: a term open beside it stays, and
  the list says which vocabulary it is in. A written value waiting to be linked opens at its own
  step of a journey, in the steps table, or its own part of an offering: the row is brought into
  view once, marked as the place linked to and in focus, and the address then lets go of it, so
  choosing another view never pulls focus back; a step or part no longer there is said. A
  hand-over's opens the journey's integrations, and an NFR's or a rule's its offering's tab. No
  upgrade step.
- A fact's source is chosen from the draft's source register, grouped by level with the
  canonical sources first, and where in it is typed beside it, in every catalogue edit that asks
  for one: systems, their capabilities and components, journeys, steps and hand-overs, offerings
  and what they are for and promise, their plans, rules and lifecycle notes, concepts,
  vocabulary terms and realisation records. It is saved as the one line the service reads back
  to that source ("SDD v2.3 · §4.1"), said under the field as it will be saved, so it opens as a
  link to the source's record; a line opens on the source the service read it as. A document the
  register does not hold can still be cited as written, marked as not in the register, and the
  register opens on Governance in a new tab so the edit stays open, from there or from a draft
  that registers no source yet. The source now comes before how sure it is in every edit, and a
  conflict's sides pick from the same grouped register, with "Where in it". Any link out of an
  edit with changes asks before leaving, one inside the edit too. No upgrade step.
- The Vocabulary tab says, on a draft, which values the catalogue writes as text wait to be
  linked to a term, as the vocabulary clean-up proposed them. The overview counts the written
  values waiting in each vocabulary, and each term in the list says how many wait for it. A
  vocabulary's page says, in written values, how many wait to be linked to its terms and how many
  new terms are proposed for the rest, when the clean-up last read the draft, and what it does;
  it runs the clean-up, asking first when proposals still wait (reading again replaces them), and
  opens Decide on that vocabulary's proposals alone. A term's record lists each place that writes
  it as text, each a link, with the value written there, and opens Decide on its own proposals.
  Removing a term says when the clean-up proposes linking values to it, and what to do; a
  proposal list that could not be read is said, never shown as nothing waiting. Decide shows only
  a vocabulary's or a term's proposals when opened so, until cleared. No upgrade step.
- A Vocabulary tab reads and edits the catalogue's controlled vocabulary. Every vocabulary of
  the version, the seven built in (eTOM process, channel kind, component kind, role, Open API,
  information entity and document type) and any a curator defined, is listed with its terms in
  reading order beside the chosen term's record: its labels and code, what it means, its broader
  and narrower terms, its outside matches, its source, and what uses it, each a link. A document
  type is also read against the library, so the documents of that type show. On a draft, a term
  is added, edited, retired with what replaces it, or removed once nothing uses it, retiring
  being offered instead; the roles are ordered strongest first, saving every rank; and a
  curator's own vocabulary is added, renamed or removed once empty, with the free-text fields it
  covers, each covered by one vocabulary at most and kept while its terms are linked through it.
  The service's rules are said at the field once Save has been tried, and a new term or
  vocabulary asks before what was filled in is thrown away. A concept's edit, like a term's, now
  takes focus when it opens, and adding one is headed at the record's level. No upgrade step.
- Who an offering is for and what it promises have an edit of their own on the offering's "Who it is
  for" tab, out of the long "what it is" form. Each is a row with its name, what it means,
  its source and how sure that source is, so where each comes from is kept and can be changed by
  hand; before, the form wrote them as lines of "name — description" and left their sources as
  they were. Several are pasted at once, one a line with " — " before what it means; a confirmed
  one whose source is not named is said at its field; and one left without a name is said under
  its field once Save has been tried. The tab says each one's source. Rows named on their own rule
  across the catalogue's edits now sit quieter under their group's legend, and a hint a group
  shares is said once for it. No upgrade step.
- "Edit where systems sit" (and "Edit the business areas") edits the tree as an outline: the top
  domains in their order, each one's sub-domains indented under it in theirs. A domain moves past
  its neighbour with everything inside it, a sub-domain put at the top lands after its old
  parent, removing a domain moves what was inside it up a level, and each row closes to its name
  and a line of what it holds. Each landscape top domain also says its place on the map (among
  the layers, the bus, the layer the bus runs under, or a side layer) and whether it runs across
  the others. The edit starts from the map as it is drawn, so a version that left the standard
  domains to be known by their ids keeps them where they are when one place changes, and "How the
  map will read it" says the layers, the side layers, what runs across and any place two domains
  claim before saving. The service's rules are said at the field once Save has been tried: a
  parent that is not itself or inside it, three levels at most, sibling names unique, one bus and
  one layer above it, only with a bus, and a place only on a top domain. "Inside" never offers a
  domain itself or what is inside it, and closing the edit hands focus back to its button. No
  upgrade step.
- A journey's edit covers everything its views show. Each step says who performs it as one
  choice (a system, the channel's entry system, a team or party, or not said, never two), its role
  from the vocabulary's roles, its eTOM place, what it does and produces, its point of no return,
  its track and its source. Each hand-over names its calling, called and through systems, what it
  is for, its style, its TM Forum equivalent and its source, and the journey its own source. Like
  the other edits, it asks before a change is thrown away, says each problem under its field once
  Save has been tried, and the record's buttons give way while it is open. Supporting systems are
  added with an explicit Add, and a suggested journey is sent trimmed, with nothing said where a
  choice was left empty. Steps and hand-overs open from their titles, each closed to a line of
  what it holds, so the one to correct is found at once; a row with a problem opens when Save is
  tried. Switching who performs a step and back keeps the system or team written, and one chosen
  but left empty is said rather than saved as not said. What has changed, and each problem, names
  the step or hand-over. A hand-over reads by its steps' names, and an empty calling or called
  system says whose performer stands in. No upgrade step.
- The portfolio and the realisation records are read and edited on the Offerings page, beside
  the list of offerings. "Edit the portfolio" holds each node's name, level, where it sits, what
  it covers and whether it is retired; "Edit the realisation records" each record's layer, name,
  other names, the systems that deliver it, the records one layer down that realise it, its
  specification rules, what it is and its source. The service's rules are checked before saving:
  names once among siblings and once per layer, no node inside itself, a record realised only by
  layers below it, and nothing taken away, or a record moved to another layer, while an offering,
  a part or another record still names it. A node or record still named cannot be removed: its
  Remove says what names it (and, for a node, to retire it instead). Switching a record to a
  resource says what saving lets go of, and a node counts the offerings in the nodes inside it.
- An offering's forms and the two registers say each problem under the field it is at (a part's
  name, an order type's code, a characteristic, what a business rule says, a quality, a record's
  layer, and more) once Save has been tried, not before anything is done; the verb points there
  and pressing it takes focus to the field. The concept form does the same. "Edit the parts" can
  link several parts at once: one concept to the parts ticked, and what parts are realised as to
  the one record of their layer that goes by the same name, each pair listed and ticked before it
  is linked (a name two records share is left to choose on the part). Each link says what it did,
  and focus stays there. No upgrade step.
- More of an offering's sheet is edited where it is read. Each part is linked to the concepts it
  means, or says why no concept fits (requirement work maps to a part through its concepts), and
  each thing a part is realised as is linked to the realisation record it means, in its own layer,
  with how sure its source is. The Plans tab has "Edit the plans" (each plan's name, what it is,
  its characteristics with their values, and its source) and the Rules tab "Edit the business
  rules" (each rule's id, numbered when left empty, what it governs, what it says and its source).
  "Edit what it is" places the offering in the portfolio, each node named by its path. The
  service's rules are checked before saving: a link to concepts or a reason, never both; plan
  names and business rule ids each once; every characteristic with its name and value, once per
  plan; a realisation linked only to a record of its own layer. Part rows carry their names, and
  the free-text rules' edit reads "Edit the other rules". No upgrade step.
- An offering's section edits ask before Cancel, Escape, a link elsewhere or closing the tab
  throws a change away, as the system and concept edits do. Ticking "No concept fits it" keeps
  the part's concepts until it is saved (unticking brings them back) and says saving lets them go;
  a realisation's record stays through a layer change and is said to be of another layer until it
  is relinked or let go; a layer with no records says so.
- Choosing in a pick-several field (a part's concepts, an interface's users and what it carries,
  the interfaces a system uses) adds nothing until "Add" is pressed: arrowing through a closed
  select picked every option it passed.
- Concepts are edited, added and removed on their own screen; before, they came only from
  accepted suggestions and catalogue files. "Edit this concept" holds its preferred and other
  labels, what it means, its broader concept or capability domain, its outside and near matches,
  its source, and whether it is retired and what replaces it; the systems and offering parts that
  realise it stay in view. The service's rules are checked before saving: each label names one
  concept, no concept sits under itself, at most three levels under a capability domain (broader
  concepts that would go deeper are not offered), a domain only on a top concept (kept while one
  is tried under another), and no move that would leave a linked capability outside its
  concept's capability domain. A problem is said under the field it is at. "Add a concept" sits
  beside the list, and a concept is removed only when nothing names it: until then the removal
  links to each thing that does and offers "Retire it instead". The list and the record now put a
  concept under another in its top concept's capability domain (it was listed under "No
  capability domain"), each top concept followed by those under it; the record says where the
  domain comes from and lists a concept's near matches. No upgrade step.
- A changed edit in the catalogue (a system, its connections or interfaces, a concept) is no
  longer thrown away by a link elsewhere on the page: the panel asks first ("Leave, and discard
  your changes to …?") and then follows it, and closing the tab warns. While an edit or a removal
  is open, the record's own Edit and Remove buttons give way to it, so switching between them
  cannot drop changes either. Hints and errors in wide form fields keep to a readable measure.
- A system's edit form now covers everything else its record shows about the system itself: whether
  it is outside the operator, the owner its source names, its roadmap, its own source and how sure
  that source is, the concept each capability realises (or why none fits), and the information it
  masters and reads, with its share of each entity it masters. Choosing a concept puts the
  capability in that concept's business area, and each kind of information is mastered, read or
  neither (one choice per row), as the service requires. The form is grouped (the system, where
  its facts come from, what lies ahead), names each capability and component row, and says what
  still names a system when it is retired. Beside Save it lists what the edit has changed, and
  Cancel or Escape asks before throwing a changed edit away; closing gives focus back to "Edit
  this system". While the system is edited, the parts of the record the form does not hold (its
  context map, interfaces, dependencies, owners, offerings and journeys) stay in view, read only
  until the edit is saved or cancelled. The record also says when a system is run outside the
  operator, and a concept chip that wraps keeps its padding. No upgrade step.
- A system's connections are edited where its "In context" map draws them. "Edit the connections"
  opens both columns as rows, what it depends on and what depends on it (the system, how, and
  what for), and saves them together, so a connection is no longer edited only from the system
  that depends. It can be open beside the system's own edit. A kept connection keeps its place and
  its provenance; ADR-0119's one dependency of each kind between two systems is checked before
  saving. The panel follows the map (what depends on it first, under the map's own column names,
  in its order), and the map draws the edit before it is saved: each new, changed or removed
  connection marked in words. Opening it closes a single change or removal open in the tables
  below. No upgrade step.
- A system's interfaces are edited by hand where its record reads them; before, they came only
  from accepted suggestions and catalogue files. "Edit the interfaces" holds what it exposes (each
  interface's name, style, users, the information it carries, what it is for and its source) and
  the interfaces of other systems it uses, where using one makes it one of that interface's users.
  The service's rules are checked before saving: a name per interface of a system, never its own
  user, and no interface dropped while a journey's hand-over, an offering's order tracking or
  another interface still goes through it. What the panel does not show (an interface's Open API
  terms and relays) is kept. No upgrade step.
- The Check step lists what nothing in the draft links to (review recommendation 17):
  capabilities with no concept and no "none fits" reason, systems outside the landscape,
  interfaces no system consumes and no journey step or tracking flow goes through, and terms
  nothing names (a term counts as used when a narrower one is; document types, which the
  library uses, are left out). Retired items are not listed. Each item opens its system's
  page where it has one. The publish checklist counts them as worth a look; publishing is
  not held for them. `GET /architecture-knowledge/releases/{id}/coverage` serves the list
  to knowledge admins. The committed catalogue has none. Public contract, additive.
- Accessibility is checked at every layer (review recommendation 15). ESLint runs the
  jsx-a11y rules (`eslint-plugin-jsx-a11y-x`, the fork that supports ESLint 10) on every
  component, tuned so scroll regions may take focus and only pointer handlers count as
  interaction; each remaining exception carries its reason. Every component test file that
  renders runs axe after each test (26 more files). The Playwright axe suite now also covers the
  governance source record, a replaced version and its system, an evidence passage, a corpus
  requirement and finding, a historic requirement (the records the offline stack cannot hold
  are mocked for that page alone, `e2e/mocks.ts`), and the reader's explorer, the "for
  knowledge admins" page, the sign-in page and the collapsed sidebar. A route whose seeded
  record is missing now fails instead of skipping.
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

- `ROADMAP.md` says what is open, then what each stage delivered in a line (review
  recommendation 18). The full delivery record moved, unchanged, to
  `docs/history/roadmap-to-v0.7.0.md`. `docs/ux/ia/route-map.md` is marked superseded by
  `frontend/src/app/App.tsx`, with which of its routes were adopted, which were not, and which
  the app serves that it never listed. `docs/operations/branch-protection.md` says what to
  require on `main`; turning it on is the repository owner's step in GitHub's settings.
- Offerings and journeys a reading would take for one another are refused (review
  recommendation 17). No two offerings may share an id, code or name, compared ignoring case
  and punctuation as the suggestion matcher reads them; the message names the offering that
  already has it. No two journeys may share a name for the same offering, or when one names
  no offering. Systems, concepts and terms were already unique by label. The committed
  catalogue has no such pair.
- `opentelemetry-api` 1.45.0 → 1.45.1 for CVE-2026-114603, which the supply-chain gate
  reported.
- The five largest modules are split by concern (review recommendation 16); behaviour, the
  API and both contracts are unchanged.
  - `catalogue_files.py` (4,357 lines) is a package by format: field readers, YAML/JSON
    reading and writing, offerings, workbook sheets, workbook reading and writing. The
    workbook's 321-, 302- and 249-line functions read or write one sheet per function.
  - `candidates.classify` (257 lines) and `apply_candidate` (164) pick one handler per
    suggestion kind from a table, checked at import to cover every kind.
  - `Settings.from_env` (293 lines) reads one section per function, and `validate_settings`
    (270) runs one check per concern in the same order. When values in two sections are
    malformed at once, the first one reported can differ; each message is unchanged.
  - The review desk (840 lines) is composed from its parts in `library/review/`: the desk's
    state hook, the seen hook, the pane, the save bar, the panels and the grid.
  - `suggestions.ts` (1,120 lines) is a folder by concern: state, keys, lexicon, sentences,
    waits, dependencies, groups, readings and files.
  - One reader for untyped JSON, `infrastructure/json_reading.py`, replaces the private
    `_text` helpers of the requirement client, the product catalogue, the catalogue
    extraction, the library golden set, the PostgreSQL values and the catalogue files.
    `_integer` for stored integers now refuses true and false, which those columns never hold.
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

- The critique's low findings (`docs/ux/critique-2026-10-22.md`): a page head's facts no
  longer leave a dot at the start of a line or after a clipped fact (narrow, the gap separates
  them; wide, a fact that no longer fits leaves whole, with its dot); list-and-record pages end
  at the screen's foot instead of 8 to 32px below it; and an empty state straight under a page
  head (the failure screen, a page that couldn't read its data) no longer draws a second rule
  or sits indented from the title.
- The review desk, the draft's Decide desk and the catalogue's benches no longer stretch the
  page under themselves. Their rows' visually hidden labels escaped the list's scroll, making
  the page thousands of pixels tall, so focusing into the pane (opening the publish panel)
  scrolled the whole window. The split and bench lists and panes now contain what they hold;
  `e2e/layout.spec.ts` keeps each page about one screen tall. Found by the critique of #144's
  screens (`docs/ux/critique-2026-10-22.md`), which also made the Check step's orphans a dense
  table after the samples, and has the accept panel say where two look-alike suggestions were
  read.
- An architecture catalogue workbook whose Tracking sheet has a column named `flows`,
  `channels`, `milestones`, `statuses` or `fallout` imports again. The column's cell replaced
  the list the TrackingFlows, TrackingChannels and TrackingEvents sheets add to, and the import
  failed with a 500. Like any other column the workbook doesn't define, it is now ignored;
  those entries still come from their own sheets. The other sheets already set their lists
  after a row's cells, so none had the same fault. Public contract unchanged.

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

### Removed

- What the portal kept for Arabic, now that it is English only (PRODUCT.md):
  - the Arabic name (`name_ar`) of systems, components, capability domains and landscape
    domains: from the catalogue, its suggestions and diff, the matching, reasoning and
    extraction prompts (catalogue extraction is now `catalogue-extraction-v21`), the index
    text, YAML, JSON and the workbook (no `name_ar` column in the template), the API and the
    screens that showed or edited it;
  - an architecture document's language (`en`, `ar` or `mixed`), from the upload routes, the
    document and its response; and the library passage's derived `language`, always "en"
    since the library refuses Arabic;
  - the Noto Sans Arabic typeface, its tokens (`--family-arabic`, `--font-arabic`,
    `--leading-arabic`) and the Arabic and right-to-left type rules, which takes the built
    fonts from 644 KB to 211 KB; and the gallery's Arabic sample;
  - the Arabic rules in CLAUDE.md, DESIGN.md and the design-system, interaction and object
    model documents.

  Old data still loads: a catalogue file, workbook, stored version, stored suggestion or
  library chunk that carries `name_ar` or `language` has the value ignored, and an older
  client sending either is not refused. Kept on purpose: the library's refusal of Arabic text,
  search's Arabic folding in the citation contract with requirement work (ADR-0099), and every
  `dir="auto"` and `<bdi>`, which still isolate a name's own punctuation. The catalogue does not
  refuse Arabic letters. Neither field was in the internal contract.
- Guessing a text's language (review recommendation 15). The portal reads English only
  (`PRODUCT.md`), so passages, quotes, search hits and table cells no longer carry a `lang`
  guessed from their letters or from the document's language. `contentLang`, `langOf`,
  `isArabic`, `isLatin` and `documentLang` go. Adding a document no longer asks "Written in";
  it is sent as English. The empty-search hints no longer suggest searching in another
  language. The API still accepts `ar` and `mixed`, and the Arabic names (`name_ar`) keep their
  `lang="ar"` until they are retired.
- The design system's unused components, and what the docs said about them (review
  recommendation 14). `ImpactPanel`, `ProvenanceTrail`, `DiffView`, `StateLine`,
  `DecisionButtons`, `UndoToast`, `Toolbar`, `Pagination`, `Toggletip` and the
  `useDelayedCommit` hook were used by no screen, only by their tests and the dev gallery, yet
  `docs/design-system.md` presented four of them as how impact, provenance, diffs and a
  replaced version are shown. They go, with their styles, their component tokens, the
  proof tint and `--sticky-state`, which nothing else used. The design-system document now
  describes the patterns the screens use (ConsequencePanel, "Accepted from", the Suggested
  mark, EvidenceQuote, the catalogue's change table, the header's "Replaced" status), and
  DESIGN.md, the interaction model, the object model, the microcopy and backlog BG3 say that
  the 6-second undo was never built: a decision is sent at once. The production bundle is
  unchanged, as none of it shipped.

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
