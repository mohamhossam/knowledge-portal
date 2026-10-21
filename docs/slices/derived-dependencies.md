# One canonical dependency model, part 2: dependencies the catalogue already says

## Objective

The second of two slices implementing ADR-0119 (point 1): the dependencies a draft's
interfaces and journey integrations already imply become suggestions, reviewed like any
other, so `SystemRelationship` can become the one answer to "what depends on what" with a
person deciding each edge.

## User Outcome

On a draft's Sources step a maintainer chooses "Suggest dependencies". The committed SMB
catalogue (42 interfaces, 165 journey integrations, no dependency recorded) yields 52
suggestions, such as "B2B Web calls the API of CBCM — CRM GW API", each citing the
interfaces and journey steps that say it. On Decide each reads "From the draft's
catalogue" with those places, and is accepted, edited or rejected as usual; an accepted one
records that it came from `dependency-derivation`. Suggesting again offers only what is
still undecided.

## Business Rules

1. An interface's consumer depends on its system: an API's consumer (or an unspecified
   style's) calls it; an event's or a file's system sends to its consumers.
2. A journey integration depends from its calling system to its called one: as the
   integration names them, else the systems that perform its activities. Through an
   integration layer it is two dependencies, calling → layer and layer → called. Its kind
   comes from how the source says it is made: an event or message sends events; a file
   transfers data; an API, request or callback calls an API; anything else says nothing.
3. Only two different catalogued systems in service; a retired one is left out (ADR-0121).
4. One suggestion per source, target and kind. A saying of no kind joins the pair's
   stated kind when there is exactly one (ADR-0119 point 3's rule).
5. Its description joins the distinct purposes said, interfaces first, at most five; it
   cites at most ten places, and its rationale counts every interface and journey step.
6. A suggestion is inferred, never stated, and becomes a dependency only when accepted.
   A new reading replaces the undecided suggestions of the last, and leaves out what the
   draft holds already and what a curator rejected before, saying how many of each.

## Domain

- `derived_dependencies.py`: `interface_dependency`, `written_kind`, `derive_dependencies`
  returning `DerivedDependency` with its `DependencyEvidence`.
- `neighbours.py`: the adjacency fallback uses `interface_dependency`, so both read an
  interface the same way.

## Application

- `SuggestDerivedDependencies` (`use_cases/derived_dependencies.py`): a reading of the
  draft's own catalogue, `CatalogueReading.DERIVED_DEPENDENCIES`, under the reader
  `dependency-derivation` and version `dependency-derivation-v1`.

## Ports

None new; `CatalogueReading` gains `derived_dependencies`.

## Adapters

None.

## API

- `POST /architecture-knowledge/releases/{release_id}/derived-dependencies`: maintainers
  only; returns the reading's run. Public contract, additive.

## UI

- Sources: a "Dependencies from interfaces and journeys" section with "Suggest
  dependencies" (then "Suggest them again"), its last reading's count, what is waiting, and
  what it noted.
- Decide: a suggestion from any reading of the draft's own catalogue names that as its
  source ("From the draft's catalogue", the place without a document title, no passage to
  open) instead of "A document no longer in the draft", says it was "Inferred from the
  draft's catalogue" rather than "not stated in the document", and the summary counts "the
  draft's catalogue" beside documents and change requests. The Sources step counts each
  such reading as a source.

## In Scope / Out of Scope

- In: everything above.
- Out: retiring the adjacent-systems fallback (ADR-0119 point 4), which waits until
  curators accept derived dependencies into a release in service; accepting them into the
  committed catalogue, which is curation; a button for the other catalogue readings
  (ADR-0114's), which keep their API.

## Acceptance Criteria

- The committed catalogue gives an API consumer's call, an event's direction, a relayed
  journey step as two hops, and an unsaid kind joined to the pair's stated one.
- A retired system takes part in no suggestion.
- Through the API: a reviewer is refused; a maintainer's reading suggests one per derived
  dependency, inferred, cited and explained; accepting one adds the dependency with its
  acceptance recorded; a new reading leaves out the accepted and the rejected one.
- Sources starts the reading and says what came of it; Decide cites the catalogue's place;
  axe finds nothing in light, dark and narrow.

## Tests

- `tests/unit/test_derived_dependencies.py`.
- `frontend/src/catalogue/draft/draft.test.tsx`: the Sources section and the Decide source.

## Validation Evidence

- `uv run pytest`: 1354 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean.
- Frontend: `lint`, `typecheck`, `test` (916 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean; `npm run e2e`: 179 passed.
- Live check against the offline stack, a draft holding the committed catalogue:
  - "Suggest dependencies" said "52 dependencies suggested; decide them on Decide." and the
    section then read "52 suggestions on its last reading · 52 waiting".
  - Decide read "52 suggestions from the draft's catalogue"; the pane for B2B Web's showed
    "Calls the API of CBCM", "From the draft's catalogue", the interface's description, its
    place "Catalogue › interface CRM GW API of CBCM" and "Said by 1 interface of this
    catalogue."
  - The check prompted three fixes: the Sources step said "No source yet", each row and pane
    said "Inferred, not stated in the document", and an edited one offered "Accept as the
    document said".
  - axe (WCAG 2.2 AA) found no violation on Sources or Decide in light, dark or at 600px.
    Scrolled down, Sources reports the step links' target size, because the fixed top bar
    covers them as they scroll under it; unscrolled it is clean, and the frame is not
    changed here.
