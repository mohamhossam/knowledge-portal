# Ontology plan, Phase 6 — Controlled vocabularies

## Objective

Turn the catalogue's free-text taxonomies into small controlled vocabularies curated with the
release: eTOM process, channel kind, component kind, responsibility role and TM Forum Open API.
Each value a source wrote stays as written; beside it, a field gains the id of the term it means,
so Phases 3 and 8 can reason over closed lists instead of spellings.

## User Outcome

A knowledge administrator can, in a draft:
- run a clean-up that suggests the term every existing value means;
- accept the links to existing terms as a safe set;
- decide each value no term names (a flagged value) one by one: add it as a new term, or edit the
  suggestion to merge it into an existing term, which then gains the value as another label;
- edit terms and links by hand, in the draft or in the catalogue file (YAML, JSON or Excel).

Every change shows in the draft's change list and in the release comparison.

## In Scope

- The domain: `VocabularyTerm`, its five schemes, the term ids beside six free-text fields, and
  their invariants.
- The clean-up use case and a new suggestion kind, `vocabulary_term`, in the existing review flow.
- The diff, the catalogue file formats, the draft API and the OpenAPI contract.
- `catalogues/smb-architecture.yaml`: 35 terms seeded from the catalogue's own values.
- Frontend: regenerated API types, and the new suggestion kind read as a sentence in its own
  section of today's suggestion list.

## Out of Scope

- Using terms in mapping: the assessment (Phase 3) and the deeper graph (Phase 8) read them.
- Screens to browse and edit the schemes. The plan's Phase 6 entry names none; like Phase 1's
  concept screens, they belong in the redesign epic if wanted.
- NFR quality, customer segment and lifecycle stage, which the review doc lists beside these
  schemes but the plan's Phase 6 does not.

## Domain

`domain/architecture/vocabularies.py`:
- `VocabularyScheme`: `etom_process`, `channel_kind`, `component_kind`, `responsibility_role`,
  `open_api`.
- `VocabularyTerm(id, scheme, pref_label, alt_labels, notation, definition, broader_id,
  exact_match, confidence, source)`, SKOS-style. `notation` is the code people write, such as
  `TMF622`. Its labels and code must differ from each other.
- `check_vocabulary`: unique ids; each label or code names one term **within its scheme**; a
  broader term is in the same scheme; no cycles; at most 3 levels (eTOM's levels 1 to 3).
- `match_value`: the terms a written value means.
  - An Open API value means one term per TMF code it names ("TMF629 Customer · TMF637 Product
    Inventory" means two), and nothing unless every code has a term.
  - Any other value means the term one of whose labels it is, or, written as a path
    ("Fulfillment · Order Handling"), the term its last part names.
- `term_id_for` builds ids such as `etom-order-handling`, `role-capture` or `api-tmf622`.

`domain/architecture/vocabulary_links.py`:
- The six fields and their schemes:

  | Field | Text | Term id | Scheme |
  |---|---|---|---|
  | `Activity` | `etom` | `etom_id` | eTOM process |
  | `Activity` | `role` | `role_id` | responsibility role |
  | `Channel` | `kind` | `kind_id` | channel kind |
  | `OfferingComponent` | `kind` | `kind_id` | component kind |
  | `ComponentResponsibility` | `role` | `role_id` | responsibility role |
  | `ActivityIntegration` | `tmf_equivalent` | `open_api_ids` (several) | Open API |

- `VocabularyRef` names one place a value is written, with the value as it was read there.
- `check_vocabulary_links`: every linked id is a term of the field's scheme, so a term in use
  cannot be removed. `ArchitectureKnowledge.vocabulary` holds the terms and checks them.
- `with_terms` links places to a term only where the text is still what was read and no term is
  linked yet (an integration takes one more API), so a maintainer's own link always stands.
- `kept_component_terms` and `kept_journey_terms`: when a document reading replaces an offering or
  a journey, a place that still writes the same value keeps its term.

`domain/architecture/vocabulary_cleanup.py`, `propose_terms`:
- one proposal per term the unmapped values mean (linking every place that writes one), in scheme
  order;
- one new-term proposal per distinct value no term names: its last part as the label, under the
  term the part before names; an unknown TMF code keeps its code as the notation.

`candidates.py`:
- the `vocabulary_term` kind: the whole `term` and the `value_refs` it covers;
- like a concept suggestion, accepting adds labels and fills empty fields, but never moves a term
  a person placed;
- **a new term is never accepted in bulk**: that is the flag.

`diff.py`: `vocabulary_term` changes, and `vocabulary_links` on offerings, journeys and channels,
apart from their other fields.

## Application Use Cases

`application/use_cases/vocabulary_cleanup.py`, `CleanUpVocabulary`:
- its run has reading `vocabulary_cleanup`;
- each suggestion cites one line per distinct value: "Catalogue › 97 activities' eTOM process",
  quoting "Fulfillment · Order Handling";
- the run warns how many values match no term, or that nothing is left to map;
- re-running replaces the undecided suggestions.

## Ports

No new port: the clean-up is deterministic and calls no model. `CatalogueReading` gains
`vocabulary_cleanup`; `CatalogueContent` gains `vocabulary`.

## Adapters

`infrastructure/architecture/catalogue_files.py`:
- YAML and JSON:
  - a top-level `vocabulary` list (`id`, `scheme`, `pref_label`, `alt_labels`, `notation`,
    `definition`, `broader`, `exact_match`);
  - `etom_term` and `role_term` on activities, `kind_term` on channels, `type_term` on offering
    components, `role_term` on responsibilities, `open_apis` on integrations.
- Excel: a `Vocabulary` sheet, and the same columns on the Activities, Channels,
  OfferingComponents, Responsibilities and ActivityIntegrations sheets. The new columns are
  optional, so older workbooks still import.

Persistence stores the release and suggestions whole, so it needs no migration.

## API

- Release responses carry `vocabulary` and the id fields.
- `PUT /architecture-knowledge/releases/{id}` takes `vocabulary`; omitting it keeps the draft's
  own.
- `POST /architecture-knowledge/releases/{id}/vocabulary-cleanup` runs the clean-up (201).
- Suggestions carry `term` and `value_refs`.

All of these require `knowledge_admin`. `contracts/knowledge-public.openapi.json` is regenerated.
requirement-portal's internal API is unchanged.

## UI

Today's UI only adapts:
- a vocabulary suggestion reads as a sentence ("Links 97 values to the eTOM process Order
  Handling", "Adds the role SAML, linking 1 value"), in a "Vocabulary terms" section of the
  suggestion list;
- a new term shows as one to decide alone, as the service treats it;
- the change list names vocabulary terms and "vocabulary terms" changes.

## Business Rules

- A value's text is never rewritten; its term sits beside it.
- A link exists only because a maintainer made it, or accepted a suggestion for it.
- A value no term names is flagged: a maintainer decides each new term alone.
- One label or code names one term within a scheme; the same word may name a term in another.
- Activity roles and responsibility roles share one scheme, so "the system that activates" means
  the same in a journey and in an offering.

## Tests

- `tests/unit/test_vocabularies.py` (18):
  - term and scheme invariants, and fields naming only terms of their own scheme;
  - matching paths, labels and TMF codes;
  - the clean-up: existing links, flagged new terms, broader terms from a path;
  - acceptance: linking every place, skipping changed or linked places, merging a new term into an
    existing one by an edit, adding a second API, waiting for a broader term;
  - readings of an offering or journey keeping links;
  - the diff;
  - the round trip in all three file formats, and a located file error;
  - **the committed catalogue: every value mapped or flagged.**
- `tests/unit/test_vocabularies_api.py` (3): the clean-up through the API with roles, accept-all
  leaving the 7 flagged values, a flagged verb merged by an edit; editing terms and refusing a
  clash or an unknown term; an empty draft.
- `test_catalogue_files.py` lists the new sheet.
- Frontend: `suggestions.test.ts` covers the sentences, the decide-alone state and the section.

## Acceptance Criteria

- Concept schemes for eTOM process, channel kind, component kind, responsibility role and Open
  API. **Met.**
- Free-text fields gain a concept id beside the text. **Met**, for all six fields.
- A clean-up candidate run maps existing values for maintainers to accept. **Met.**
- Exit: every value in the SMB fixture mapped or flagged. **Met** (test):
  - 524 of the 533 places the catalogue writes a value map to a seeded term;
  - the other 9 write seven distinct responsibility verbs, each flagged as a new term.

## Validation Evidence

Run on 2026-10-10 on `claude/ontology-phase-6-vocabularies-bdn1hs`, based on main (`57fa255`).

```text
$ pytest tests/unit/test_vocabularies.py tests/unit/test_vocabularies_api.py
21 passed in 2.06s
$ pytest                  # whole suite; PostgreSQL tests skip without TEST_DATABASE_URL
963 passed, 47 skipped in 75.04s
$ ruff check . && ruff format --check .
All checks passed!
358 files already formatted
$ mypy src tests
Success: no issues found in 324 source files
$ lint-imports
Contracts: 10 kept, 0 broken.
$ cd frontend && npx tsc -b && npm run lint && npx vitest run && npm run build && npm run api:check
Test Files 38 passed (38), Tests 282 passed (282); built
$ LLM_PROVIDER=fake python -m knowledge_portal.interfaces.evaluate
system precision 59.3% · recall 8.6% · verdict 47.2% · offering 71.4% · concepts not measured
```

The evaluation is unchanged, as expected: mapping does not read terms yet.

## For review

- **The 35 seeded terms are proposals** (`confidence: inferred`), built from the catalogue's own
  values:
  - eTOM: Fulfillment (Selling, Order Handling, Service Configuration & Activation, Resource
    Provisioning, Supplier/Partner Requisition Management), Assurance (Problem Handling), Billing
    & Revenue Management, and Customer Relationship Management (Customer Interface Management).
    The tree follows the catalogue's "vertical · process" values; in eTOM itself Order Handling
    also sits under CRM, which one broader term cannot say.
  - Channel kinds: Assisted, Self-service, System.
  - Roles: the 12 activity roles. Responsibility verbs became other labels where they plainly
    mean one: Orchestrates, Captures, Activates, Provision(s) under Activate, and Installation
    under Field.
  - Open APIs: TMF620, 621, 622, 629, 632, 637, 641, 679 and 681.
- **Flagged for you:** the responsibility roles SUGGESTS, APPLIES, CREATES, RETURNS, SAML, PASSES
  and ENABLES. Each is a new-term suggestion after the clean-up; merging APPLIES and ENABLES into
  Activate, and SUGGESTS into Catalog, looks right, but it is your call.
- **Component kind is empty:** no component in the SMB catalogue states a kind.
- **No eTOM numbers:** `exact_match` is left empty, since which eTOM version to seed from is still
  an open decision in the plan.

## Risks

- **Scheme ownership.** Someone must own each scheme, or new documents drift back to free text
  that the clean-up flags again and again.

## Dropped from this slice

- None.

## Deferred

- Screens to browse and edit the schemes, if wanted: the redesign epic.
- Reading terms in mapping: Phases 3 and 8.
