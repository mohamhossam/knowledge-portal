# Interfaces suggested from documents

## Objective

The first of the suggestion kinds ADR-0123 adds as the owner decided ("every remaining
type"): interfaces. Integration documents describe APIs, event streams and file feeds more
than anything else; until now a curator typed each into a catalogue file. An accepted
interface also feeds the derived dependencies (ADR-0119). This slice also fixes the
groundwork every new kind needs: accepting a suggestion saved only some of the draft's
collections.

## User Outcome

A curator reads an integration specification into a draft. Decide lists, under Interfaces,
"Adds the interface Order API of Order Hub, consumed by Billing, CRM", citing both places
the document says so; it waits for Order Hub if the draft lacks it, and is accepted like
any suggestion. The interface then carries the suggestion it came from.

## Business Rules

1. An interface suggestion holds a whole interface: its name, the system that exposes it,
   the systems that consume it, how it is called (API, event, file or not said) and what it
   carries. Systems are named as the document names them until the draft resolves them.
2. One per exposing system and name: readings of one interface (one per consumer, as the
   model is asked to give them) are one suggestion, their consumers joined, the first's facts
   kept, every citation kept.
3. It waits for every system it names (`needs_system`) and every interface it relays
   (`needs_interface`).
4. Accepting adds it, or fills an existing interface of the same system and name: consumers,
   terms and relays are added, an unset style or description is filled, nothing set is
   replaced.
5. Accepting records it on the interface (ADR-0120), and every catalogue file carries it.
6. Accepting any suggestion saves every collection it may change: capability domains,
   conflicts, the portfolio, interfaces and realisation records were left out before.

## Domain

- `candidates.py`: `CandidateKind.INTERFACE`, `CandidateMatch.NEEDS_INTERFACE`,
  `CandidateContent.interface`, `_resolved_interface`, `_current_interface`,
  `_with_interface`; classify, apply, missing systems and possible matches.
- `interfaces.py`: `SystemInterface.accepted`, `find_interface_among`, `merge_interfaces`.
- `acceptance.py`: interfaces carry provenance.

## Application

- `catalogue_candidates.py`: its place in accepting order (after dependencies), its names
  resolved against the provisional draft, `_one_interface_each`, and `_accepted` saving every
  collection (rule 6).

## Ports

None.

## Adapters

- The extraction prompt (`catalogue-extraction-v17`, full readings only, as channels):
  `interface` items with `interface_style`; `_interface` builds one per consumer.
- The offline extractor reads `Interface: Name [api] consumed by A, B` under a system.

## API

- `interface` on `CandidateContentSchema`; read-only `accepted` on `SystemInterfaceSchema`.
  Public contract, additive.

## UI

- `suggestions.ts`: the sentence, what it waits for, the Interfaces section, its dependency
  keys and `inWords`; the suggestion editor's fields (name, exposed by, how it is called,
  what it carries; its consumers as the document says).

## In Scope / Out of Scope

- In: rules 1 to 6.
- Out: the other kinds (capability domains, portfolio nodes, realisation records, sources,
  conflicts), each a slice of its own; editing an interface's consumers in the suggestion
  editor (the draft's catalogue file does).

## Acceptance Criteria

- Classify and apply as rules 1 to 4; a missing relay refuses with its name.
- Two model items for one interface become one suggestion with both consumers.
- Through the API, a document with an interface suggests it, accepting all adds it with its
  consumers and its provenance; every file format keeps the provenance.
- Decide shows it under Interfaces with what it waits for; axe finds nothing.

## Tests

- `tests/unit/test_interface_suggestions.py`; `frontend/src/catalogue/suggestions.test.ts`.

## Validation Evidence

- `uv run pytest`: 1369 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean; contracts and the catalogue fixture regenerated.
- Frontend: `lint`, `typecheck`, `test` (919 passed), `api:check`, `build`, `budget`,
  `lint:brand`, `lint:legacy-css`: clean. `npm run e2e`: 177 passed, two keyboard journeys
  failed under local load (catalogue, squads); run alone, the catalogue one passed and the
  squads one failed at the same step it fails on other branches, in pages this slice does not
  touch; CI's e2e is the authority.
- Live check against the offline stack: a document with "Interface: Order API [api] consumed
  by Quokka Ledger", a second reading of it for Wombat Desk and a Status events interface gave
  one Order API suggestion citing both places ("Adds the interface Order API of Order Hub,
  consumed by Quokka Ledger, Wombat Desk", waiting for the three systems) and one Status events
  suggestion; Decide offered "Accept the 3 ready and the 2 that wait on them"; accepted, Order
  Hub's record listed both under Exposes, each recording its suggestion. axe (WCAG 2.2 AA)
  found nothing on Decide, the editor and the record in light, dark or at 600px.
