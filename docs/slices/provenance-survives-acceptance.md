# Provenance survives acceptance

## Objective

Implement ADR-0120: an accepted suggestion stays recorded on the catalogue facts it produced,
so "what generated this and who approved it" answers from a release alone (AGENTS.md §7.14),
after the per-release candidate table has moved on, and through export and import.

## User Outcome

A curator reading a system or a concept sees, beside its source, each suggestion that produced
it: the model and prompt version that suggested it, who accepted it and when, newest first. An
offering or a journey says the same in one line under its name. A record written by hand shows
nothing extra. The explorer, which any signed-in user reads, shows content only.

## Business Rules

1. Accepting a suggestion appends one `AcceptedFrom(candidate_id, model, prompt_version,
   decided_by, decided_at)` to its **subject**, the entity of its own kind: a system (for
   system, placement and constraint suggestions), a component, a capability, a dependency, a
   landscape domain, an offering (for offering, offering-rule, question and component-link
   suggestions), a journey, a channel, a concept or a vocabulary term.
2. Only a subject the acceptance created or changed is stamped: a suggestion that added
   nothing contributed nothing.
3. Nothing removes an entry. An entity replaced whole (an offering or a journey accepted as a
   whole) keeps what it held. An edit made on a page sends none and so adds none; an imported
   catalogue file adds the entries it recorded that the draft did not hold, so an exported
   history survives the trip.
4. An entry is not a reviewable change: the diff ignores it.
5. The API accepts no entries from a client: the field is read-only.
6. The explorer response carries none (ADR-0101 keeps it to content).

## Domain

- `provenance.py`: the `AcceptedFrom` value object (a leaf module, so every entity can import
  it; ADR-0120 placed it in `candidates.py`, which would make a cycle).
- `accepted: tuple[AcceptedFrom, ...] = ()` on `SystemDefinition`, `SystemComponent`,
  `KnowledgeCapability`, `SystemRelationship`, `LandscapeDomain`, `ProductOffering`, `Journey`,
  `Channel`, `BusinessCapability` and `VocabularyTerm`.
- `acceptance.py`: one visitor over every entity that carries provenance, keyed by kind and
  identity, and on it `with_acceptance` (rule 1–3), `with_provenance_kept` (rule 3 for edits),
  `without_acceptances` (rule 6), `recorded_acceptances` and `with_recorded_acceptances` (files).
- `diff.py`: whole-value comparisons strip provenance first (rule 4).

## Application

- `DecideCatalogueCandidate._applied` (one acceptance and accept-all, from a document or a
  change request) stamps the subject.
- `ManageArchitectureKnowledge.update` (every hand edit and file import) keeps provenance.

## Ports

None new.

## Adapters

- Stored releases: the pydantic adapter serialises the new field; a stored release from before
  it reads with none recorded.
- Catalogue files: one `acceptances` table, one row per entry naming its entity by kind and key:
  a top-level list in YAML and JSON, an `Acceptances` sheet in the workbook (the key a JSON list).
  The entries themselves stay as people write them. A file without the table reads as none
  recorded; a row naming nothing in the file is ignored.

## API

- `AcceptedFromSchema` and a read-only `accepted` list on the ten entity schemas, in
  `contracts/knowledge-public.openapi.json` (additive).
- `contracts/knowledge-internal.openapi.json` gains the same field on the offering and journey
  inside an offering draft (additive; always empty, since a draft is drafted, not accepted).
  requirement-portal should review it.

## UI

- `AcceptedFrom` (`frontend/src/catalogue/AcceptedFrom.tsx`): an "Accepted from" row in the
  facts of the system and concept records, and a one-line summary in the meta of the offering
  and journey records. Plain text in the record's own type: the teal Suggested mark means a
  suggestion still waiting, which these are not.
- A record from an API that predates the field reads as none recorded (`accepted.ts`), since
  the web and API images deploy separately.
- Components, capabilities, dependencies, channels, landscape domains and terms carry
  provenance in the API and files; they have no record view of their own to show it in yet.

## In Scope / Out of Scope

- In: everything above.
- Out: field-level provenance (rejected in ADR-0120); provenance in the explorer (rule 6);
  record views for the entities that have none.

## Acceptance Criteria

- Accepting a suggestion records it on its subject, with the model, prompt version, accepting
  maintainer and time, through one decision and through accept-all.
- A merge appends in order; an offering replaced whole keeps its earlier entries; a no-op
  acceptance records nothing; only the subject is stamped.
- A page edit neither adds nor removes entries; a file import adds the file's and removes none.
- Every catalogue file format round-trips every entry; older files and stored releases load.
- The diff reports nothing for a provenance-only difference.
- The explorer response carries no entry.
- The system, concept, offering and journey records show them; axe finds nothing in light,
  dark and narrow.

## Tests

- `tests/unit/test_provenance_survives_acceptance.py`: the rules above, the three file
  formats, stored releases, the explorer.
- `tests/unit/test_catalogue_suggestions.py`, `test_catalogue_matching.py`: the API's accepted
  dependency carries its record.
- `frontend/src/catalogue/acceptedFrom.test.tsx`: none, one, many newest first, the summary,
  and an older API.

## Validation Evidence

- `uv run pytest`: 1299 passed, 55 skipped (PostgreSQL tests skip without
  `TEST_DATABASE_URL`).
- `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy src tests`,
  `uv run lint-imports`: clean.
- Frontend: `npm run lint`, `typecheck`, `test` (911 passed), `api:check`, `build`,
  `lint:brand`, `lint:legacy-css`, `budget`: clean; `npm run e2e`: 179 passed.
- Live check against the offline stack: a draft imported from a YAML file recording two
  acceptances on BCRM and one on CWOM showed them on the BCRM record, newest first, with the
  accepting maintainer's name; axe (WCAG 2.2 AA tags) found no violation in light, dark or at
  600px. That check also found a defect, now fixed and tested: an import into a draft already
  holding the entity dropped the file's entries (rule 3's union).
