# Ontology plan, Phase 1 — Capability concepts, backfill and component links

## Objective

Give the catalogue a curated scheme of business capability concepts (ADR-0114). Link every
system capability and every offering component to concepts, or mark it as having none, so that
Phases 2 and 3 can map a requirement to concepts first and only then to systems.

## User Outcome

A knowledge administrator can do three things in a draft:
- propose one concept per distinct capability name and accept the proposals as a safe set;
- ask the AI to suggest concepts for offering components, then decide each link one by one;
- edit concepts and links by hand, in the draft or in the catalogue file (YAML, JSON or Excel).

Every change shows in the draft's change list and in the release comparison.

## In Scope

- The domain: `BusinessCapability`, links on capabilities and components, and their invariants.
- The backfill use case and the link-suggestion use case, with its port, prompt, structured
  adapter and fake.
- Two new suggestion kinds, `concept` and `component_link`, in the existing review flow.
- The diff, the catalogue file formats, the draft API and the OpenAPI contract.
- `catalogues/smb-architecture.yaml`: capability domains, 38 concepts and links for all 9
  components.
- Frontend: regenerated API types only, so the build stays green and the new suggestion kinds
  read as sentences.

## Out of Scope

- The concept screens. The owner chose on 2026-10-10 to build them in redesign plan 03; see
  `docs/redesign/plans/03-capability-concepts.md`.
- Using concepts in mapping: the concept index is Phase 2, and the assessment is Phase 3.

## Domain

`domain/architecture/concepts.py`:
- `BusinessCapability(id, pref_label, alt_labels, definition, broader_id, domain_id,
  exact_match, confidence, source)`, SKOS-style.
  - A top concept names its capability domain; a narrower one inherits it.
  - Its labels must differ from each other.
- `check_concepts` checks the whole scheme:
  - ids are unique, and each label names one concept;
  - every domain and broader concept is known;
  - there are no cycles, and the scheme is at most 3 levels deep.
- Labels compare by letters and digits only (`label_key`), so "Wi-Fi" and "WiFi" are one label.
- `check_link` allows concepts or an `unlinked_reason`, never both, and never the same concept
  twice.
- `concept_id_for` builds ids such as `cap-wifi-access`, never reusing one already taken.

The rest of the domain:
- `knowledge.py`:
  - `ArchitectureKnowledge.business_capabilities`;
  - `KnowledgeCapability.concept_id` and `unlinked_reason`;
  - `concept_path` and `concept_domain`;
  - a link to an unknown concept is refused.
- `products.py`: `OfferingComponent.capability_ids` and `unlinked_reason`.
- `concept_backfill.py`, `propose_concepts`:
  - groups unlinked capabilities by name across systems;
  - turns triggers into other labels when no other concept uses them;
  - links to an existing concept when the name is one of its labels.
- `candidates.py`:
  - the `concept` and `component_link` kinds, and the `needs_concept` match;
  - a concept candidate adds labels and fills empty fields, but never moves a concept already
    placed;
  - accepting a link clears the "none fits" reason;
  - when a product reading replaces an offering, the component links are kept.
- `diff.py`: concept changes, and component link changes (`capability_links`).

## Application Use Cases

`application/use_cases/capability_concepts.py`:
- `ProposeCapabilityConcepts`: the backfill.
  - Its run has reading `concept_backfill`, and its candidates cite the catalogue
    ("Catalogue › BSCS › capability billing").
  - Re-running replaces the undecided proposals.
- `SuggestComponentCapabilities` asks the linking model about every unlinked component.
  - It keeps only concepts that exist and components it asked about.
  - Each answer becomes an **inferred** candidate with the model's reason, so it is never in
    the safe set.
  - A component the model skipped produces a warning.

## Ports

`application/ports/capability_link_suggester.py`: `CapabilityLinkSuggesterPort`,
`LinkableComponent`, `ConceptChoice`, `LinkSuggestion`, `LinkResult` and
`CapabilityLinkingError` (public error code `capability_linking`, a provider failure).
`ExtractionRun.reading` names the run that is neither a document reading nor a catalogue file
reading.

## Adapters

- `infrastructure/llm/prompts/capability_links_prompt.py` (`capability-links-v1`) and
  `infrastructure/llm/capability_links.py`:
  - `StructuredCapabilityLinkSuggester` sends batches within the input budget;
  - `FakeCapabilityLinkSuggester` links a concept when every word of one of its labels is in the
    component's name or description.
- `infrastructure/architecture/catalogue_files.py`:
  - YAML and JSON:
    - `business_capabilities`;
    - a capability's `concept` and `unlinked_reason`;
    - a component's `capabilities` and `unlinked_reason`.
  - Excel:
    - a `Concepts` sheet;
    - `concept_id` and `unlinked_reason` on Capabilities;
    - `capability_ids` (separated by `;`) and `unlinked_reason` on OfferingComponents.

## API

- Release responses carry the new fields.
- `PUT /architecture-knowledge/releases/{id}` takes `business_capabilities`; omitting it keeps
  the draft's own.
- `POST /architecture-knowledge/releases/{id}/concept-proposals` runs the backfill (201).
- `POST /architecture-knowledge/releases/{id}/component-link-suggestions` runs the link
  suggestions (201, under the provider call limit).
- Suggestions carry `concept`, `capability_refs` and `concept_ids`.

All of these require `knowledge_admin`. `contracts/knowledge-public.openapi.json` is regenerated.
requirement-portal's internal API is unchanged.

## UI

Deferred to redesign plan 03 (`docs/redesign/plans/03-capability-concepts.md`).

Today's UI only adapts to the new types:
- the new suggestion kinds read as sentences ("Adds the capability concept Billing, linking 1
  capability.", "Links Business Pro Plus › Access point (FortiAP) to …");
- the change list names concept and link changes.

## Business Rules

- A link exists only because a maintainer made it, or accepted a suggestion for it.
- Component links are inferred, so they are decided one by one.
- A capability or component that fits no concept says why (`unlinked_reason`). That counts as
  decided, and the backfill leaves it alone.
- One label names one concept across the whole scheme.

## Tests

- `tests/unit/test_capability_concepts.py` (16):
  - the domain invariants and links;
  - the backfill, including the packaged seed fully linked after acceptance;
  - classification and application of both kinds, and kept links;
  - the diff;
  - the round trip in all three file formats, and located file errors;
  - the committed catalogue: every component linked, every golden-set concept present, every
    concept placed in a domain.
- `tests/unit/test_capability_concepts_api.py` (7):
  - the backfill through the API, with roles, replacement, accept-all, the change list and an
    empty re-run;
  - editing concepts and refusing a label clash;
  - link suggestions accepted one by one;
  - the no-concepts warning;
  - the structured adapter keeping only listed concepts, an unusable answer, and the fake.
- `test_catalogue_files.py`, `test_system_components.py` and
  `test_catalogue_portfolio_and_integrations.py` are adapted to the new sheet, message and
  fields.
- Frontend: fixtures gain the new fields.

## Acceptance Criteria

- `BusinessCapability` with labels, definition, broader concept and outside match, with domains
  as the top levels. **Met.**
- `KnowledgeCapability.concept_id` and `OfferingComponent.capability_ids`. **Met.**
- The release diff covers concepts and links. **Met.**
- The backfill proposes one concept per distinct name, merges duplicates across systems, and
  moves triggers into other labels. **Met.**
- Link suggestions for components, as candidates a maintainer accepts. **Met.**
- The release payload and the catalogue files carry concepts. **Met.**
- The draft endpoints. **Met.** The concept list and link review queue screens are **moved to
  plan 03** by the owner's decision.
- Exit: the SMB fixture is fully backfilled, and every capability and offering component is linked
  or marked unlinked. **Met.**
  - The packaged seed's 31 capabilities are all linked after accepting the backfill (test).
  - The committed SMB catalogue's 9 components are all linked (test).

## Validation Evidence

Run on 2026-10-10 on `ontology-phase-1`, based on Phase 0 (`961a237`).

```text
$ pytest tests/unit/test_capability_concepts.py tests/unit/test_capability_concepts_api.py
30 passed in 2.31s
$ pytest                  # whole suite; PostgreSQL tests skip without TEST_DATABASE_URL
938 passed, 46 skipped in 69.13s
$ ruff check . && ruff format --check .
All checks passed!
351 files already formatted
$ mypy src tests
Success: no issues found in 318 source files
$ lint-imports
Contracts: 10 kept, 0 broken.
$ cd frontend && npx tsc -b && npm run lint && npx vitest run && npm run build
Test Files 38 passed (38), Tests 278 passed (278); built
$ LLM_PROVIDER=fake python -m knowledge_portal.interfaces.evaluate
system precision 59.3% · recall 8.6% · verdict 47.2% · offering 71.4% · concepts not measured
```

The evaluation is unchanged from Phase 0, as expected: `match` does not use concepts yet.

## For review

- **The 9 component links in `catalogues/smb-architecture.yaml` are proposals.** They were written
  from the golden set's concept list and are marked `confidence: inferred`. Please check them in
  this PR:
  - GPON → Fibre broadband access;
  - CPE → Managed CPE and security service provisioning;
  - Firewall → Managed firewall;
  - Self-service portal → Customer self-management portal;
  - SD-WAN → SD-WAN service;
  - Access point → Managed Wi-Fi access points;
  - Static IP → Static IP addressing;
  - Proactive monitoring → Proactive service monitoring;
  - Backup 5G → Mobile backup access.
- `cap-fibre-access` is the one concept added beyond the golden set's 37, since GPON fitted none.
- **The fake suggester's precision.** On the catalogue with its links removed, it gets 5 of 9 right
  alone. It adds a second, wrong concept on firewall, selfservice and backup-5g, and gives cpe the
  wrong one, through "rate plan" in its description. That is acceptable for a fake that only runs
  in tests and offline. The live model's quality is measured in Phase 3.

## Risks

- **Phase 3 recall.** The committed catalogue's 46 systems list no capabilities, so concepts reach
  systems there only through offering components: a component's responsibilities and
  realisation name the systems behind it. Phase 2's index and Phase 3's assessment must follow
  concept → component → responsible systems. Otherwise concept recall cannot lift system recall
  on the golden set.

## Dropped from this slice

- None.

## Deferred

- The concept list and link review screens: redesign plan 03.
- A live-model run of the link suggester on the catalogue: with the Phase 3 live baseline.
