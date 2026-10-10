# Ontology plan, Phase 3 — Assessment service

## Objective

Assess a whole requirement against one pinned release. Read it as facets, link each need to
capability concepts, walk the catalogue from those concepts to the offerings and systems
behind them, and give a product verdict with its evidence (ADR-0114, requirement-portal
ADR-0115). When the requirement is too vague to place, ask questions built from the
catalogue instead of guessing.

## User Outcome

requirement-portal can call `POST /internal/architecture/assess` during requirement analysis
(its Phase 4). The answer says whether the requirement changes an existing offering, adds a
plan, needs a new offering in a family or a new product line. It lists the systems with their
role, change type and the path that found each one, the capability and staffing gaps, and who
owns each impacted capability. For "Add a new device" it gives no verdict and asks which
offering and which capability.

Per-item mapping (`/internal/architecture/match`) is unchanged in what it selects, and now
says why each system is there.

## In Scope

- Facets, concept linking, the graph lane, the concept-filtered passage lane, the verdict rules
  and gaps, the questions, and the owners with staffing gaps.
- A facet reader and a verdict reasoner behind ports, each with a fake and a structured-output
  adapter.
- `POST /internal/architecture/assess`, and optional role, change type and paths on each system
  `match` returns. The internal OpenAPI contract is regenerated; the change is additive.
- The golden set scored through the assessment, with concept recall measured for the first
  time.
- The SMB catalogue's systems linked to the concepts they realise.
- The Phase 0 defect where the system IN was named by the English word "in".

## Out of Scope

- requirement-portal's side: storing the verdict, blocking questions, the product impact card
  (Phase 4).
- The reranker, per-facet budgets and the precedent lane (Phase 5).
- Journey activities, information entities and interfaces in the graph lane (Phase 8). The
  catalogue has no curated activity-to-concept links yet, so journeys select nothing.
- Draft offerings for a new-offering verdict (Phase 9). The proposal names the components and
  portfolio node a draft would start from.

## How a requirement is assessed

```
requirement text ──► 1 facets (reader) ─────────► need · offering · segment · family · channel
                                                  order type · characteristic · excluded · change type
                     2 concepts per need ────────► shortlist: label match + named component + concept index
                                                  the reader picks from the shortlist only
                     3 offering fit + rules ─────► verdict, or none ──► questions (stop)
                     4 graph lane ───────────────► concept → system capability → system          (primary)
                                                  concept → offering → component → responsible system (primary)
                                                  named channel → entry system                     (channel)
                                                  named system                                      (named)
                     5 passage lane ─────────────► candidates' records + passages about each need's concepts
                     6 verdict reasoner ─────────► keeps or corrects the rules' verdict; selects and cites systems
                     7 owners and gaps ──────────► squads, seats and value streams per capability; staffing gaps
```

The rules of thumb (`decide_verdict` in `domain/architecture/verdicts.py`) are deterministic
and come first. The reasoner sees the rules' verdict and reason and may disagree; the answer
keeps both (`verdict` and `rule_verdict`), so a reviewer sees when the model overruled the
rules.

| Rule, in order | Verdict |
|---|---|
| Names no offering and links no capability | none: questions |
| Names a product family the portfolio lacks | new product line |
| Needs a capability no system realises, and names no offering | new product line |
| No offering covers any need | new offering in family |
| The requirement's segment is not the offering's | new offering in family |
| Leaves out a mandatory component ("without SD-WAN") | new offering in family |
| Names no offering, and the closest one does not cover every need | new offering in family |
| Sets a characteristic value no plan has (a speed tier, a commitment, a price tier) | new plan |
| Otherwise | change to the existing offering |

An offering "covers" a need when one of its components requires the concept, or a system its
delivery already uses (component responsibilities, journeys, order channels) realises it.
Naming an order type names its offering. When the requirement names the offering, a capability
nothing realises is reported as a gap, never forced onto a system and never turning the
verdict on its own (the review's example).

Speeds are compared with the speeds the plans' tiers are named by, so a 100 Mbps plan is new
although the 200 Mbps plan uploads at 100 Mbps.

## Example

The committed SMB catalogue, fake models (`tests/unit/test_requirement_assessment.py`):

> Let Business Pro Plus customers add a second FortiAP as an add-on from B2B Web. A technician
> visit installs it.

```json
{
  "verdict": "change_existing_offering",
  "rule_verdict": "change_existing_offering",
  "verdict_reason": "The offering covers 2 of the 2 capabilities it needs, and it names the offering.",
  "offering_id": "business-pro-plus",
  "facets": [
    {"kind": "need", "text": "Let Business Pro Plus customers add a second FortiAP …",
     "concepts": [{"concept_id": "cap-wifi-access", "path": "Service › Managed Wi-Fi access points"}]},
    {"kind": "need", "text": "A technician visit installs it",
     "concepts": [{"concept_id": "cap-field-installation"}]},
    {"kind": "offering", "ref_id": "business-pro-plus"},
    {"kind": "channel", "ref_id": "b2b-web"},
    {"kind": "order_type", "ref_id": "business-pro-plus/TECHVISIT"},
    {"kind": "change_type", "ref_id": "modify"}
  ],
  "coverage": [
    {"concept_id": "cap-wifi-access", "composed_by": ["business-pro-plus"],
     "realised_by": ["ecm", "wfms", "cwom"], "covered": true},
    {"concept_id": "cap-field-installation", "composed_by": [], "realised_by": ["wfms"], "covered": true}
  ],
  "systems": [
    {"id": "cwom", "role": "primary", "change_type": "modify",
     "paths": [["need-1", "Managed Wi-Fi access points", "Business Pro Plus", "Access point (FortiAP)", "CWOM"]]},
    {"id": "wfms", "role": "primary", "change_type": "modify",
     "paths": [["need-1", "…", "Access point (FortiAP)", "WFMS"],
               ["need-2", "Field installation and technician work", "WFMS"]]},
    {"id": "b2b-web", "role": "channel", "paths": [["channel-4", "B2B Web", "B2B Web"]]}
  ],
  "proposal": {"summary": "Change Business Pro Plus: …", "components": [{"component_id": "ap"}],
               "journey_ids": ["bpp-techvisit"]},
  "owners": [{"concept_id": "cap-field-installation", "system_id": "wfms",
              "seats": [{"role": "developer", "person_name": "Amal Saeed", "scoped": true}]}],
  "gaps": [{"kind": "staffing", "concept_id": "cap-wifi-access", "system_id": "cwom"}]
}
```

Paths are shown by their labels here; each step also carries its kind and release id. SMB
App, the other self-service channel, is left out because the requirement names B2B Web.

"Add a new device." gives no verdict, no systems, and two questions: "Which offering does
this change, or is it for a new one?" (Business Pro Plus, or a new offering) and "Which
capability does it need?" (concepts the index ranks near the text). The reasoner is never
called.

## Domain

- `domain/architecture/assessment.py`: `ChangeType` (new, modify, configure, retire,
  consume only), `SystemRole` (primary, channel, named, supporting), `FacetKind`, `Facet`,
  `PathStep`, `change_type_in(text)` and `speeds_in(text)`.
- `domain/architecture/impact_graph.py`: `realisers(release, concept)` follows only curated
  links (a system capability's concept, a component's concepts and responsibilities), with
  narrower concepts; plus `composes`, `delivering_systems`, `serves` and `realised_nowhere`.
- `domain/architecture/verdicts.py`: `OfferingFit`, `VerdictCall` and `decide_verdict`.
- `SystemReference` gains optional `role`, `change_type` and `paths`.

## Application Use Cases

- `AssessRequirement` (`application/use_cases/assess_requirement.py`) runs the steps above
  against a published, built release with a readable index. The packaged reference release
  cannot be assessed (409).
- `assessment_lanes.py` holds the lanes: catalogue terms, shortlists, offering fit, the graph
  and passage lanes, and `concept_reach`, which per-item mapping uses to explain the systems
  it already selected (it never selects more).
- `named_systems` matches a label of three characters or fewer only as written or in capitals.
- `AssessedImpact`, a second `ImpactMapperPort`, scores the assessment on the golden set.
  The report gains `false_changes`: new offerings, new lines and vague cases called a change.

## Ports

`application/ports/requirement_assessment.py`:
- `RequirementReaderPort.facets(text, terms)` and `.pick(needs, shortlists)`;
- `VerdictReasonerPort.decide(context)`;
- `RequirementAssessmentPort.assess(query)`;
- the contract values `AssessmentQuery` and `ArchitectureAssessment`, with `LinkedFacet`,
  `ConceptCoverage`, `AssessmentProposal`, `AssessedSystem`, `AssessmentGap`,
  `AssessmentQuestion`, `CapabilityOwners` and `SeatReference`.

## Adapters

- `infrastructure/architecture/requirement_reading.py`:
  - `FakeRequirementReader` reads by words: clauses become needs, "without …" becomes an
    excluded facet, catalogue names become facets, codes in capitals match only in capitals;
    it picks only label and component matches;
  - `StructuredRequirementReader` uses the `knowledge` model and refuses a quote not in the
    requirement, an id not in the lists it was given, an unknown change type, and a pick off a
    need's shortlist.
- `infrastructure/architecture/verdict_reasoning.py`:
  - `FakeVerdictReasoner` keeps the rules' verdict and selects each candidate its own record
    backs;
  - `StructuredVerdictReasoner` refuses an offering or system outside the release, a system
    with no citation, a citation id not in its evidence and a quote not in its passage, and
    trims evidence to the model's input budget as mapping does.
- Both are wired in `composition/llm.py`; the use case in `composition/architecture.py` and the
  container (`requirement_assessment`).

## Catalogue data

`catalogues/smb-architecture.yaml`: each system now lists the capabilities its directory
description states, each linked to the concept it realises (53 capabilities on 46 systems).
Five are marked as having no concept, with the reason: SLA management and network resource
allocation (no concept yet), and single sign-on, the integration bus and the channel backend
(platform services). Before this, no system realised a concept, so a concept reached systems
only through the one offering's components.

**For review.** I wrote these links from the descriptions, not from the golden set, but the
golden set was written from the same catalogue in Phase 0. The live-model run and historic
requirements are the honest check.

## API

`POST /internal/architecture/assess` (service token, like every `/internal` route) takes
`{"text": [...], "declared_systems": [...], "release_id": "..."}` and returns
`ArchitectureAssessment`. `/internal/architecture/match` adds `role`, `change_type` and
`paths` to each system. `contracts/knowledge-internal.openapi.json` is regenerated: one new
path and new schemas, three new optional fields on `SystemReference`, nothing removed or
newly required. The public contract is unchanged.

## UI

None in this slice. The product impact card is requirement-portal's (Phase 4).

## Tests

- `tests/unit/test_requirement_assessment.py` (20 tests):
  - a change verdict with paths, roles, citations found in their passages, owners, a
    staffing gap and the proposal;
  - "Add a new device" returns questions and never calls the reasoner;
  - a capability realised nowhere is a new product line with a gap;
  - a new speed is a new plan, an existing tier is a change, and a left-out mandatory
    component is a new offering;
  - the rules of thumb, change types and speeds;
  - the graph walk by system capability and by component;
  - "in" no longer names IN;
  - `match` explains its systems with role, change type and paths;
  - the reader's and the reasoner's checks;
  - the internal route, its 401 without the token, and its serialised answer.
- `tests/unit/test_mapping_evaluation.py`: the assessment never falls below the Phase 0
  baseline or the Phase 3 scores, every vague case gets questions, and the command scores
  either mapper.
- `tests/unit/test_knowledge_internal_contract.py`: the contract lists the assess path.

## Acceptance Criteria

- `AssessRequirement` with facets, concept linking, graph lane, filtered passages, verdict
  rules, gaps, catalogue-built questions, and owners with staffing gaps. **Met.**
- `match` gains role, change type and path. **Met:** `paths`, as a system can be reached more
  than one way.
- A structured-output reader and verdict reasoner with fakes, keeping today's checks. **Met.**
- `POST /internal/architecture/assess`, optional fields on `match`, OpenAPI snapshot. **Met.**
- The golden set through the harness; contract tests; "add a new device" returns questions.
  **Met.**
- Exit: verdict accuracy and system precision at or above the Readiness targets, never below
  the Phase 0 baseline. **Met against the baseline with the fake models.** The 80% verdict
  gate needs the live run (see Validation Evidence).

## Validation Evidence

Run on 2026-10-10 on `claude/ontology-main-sequence-sart0h`, from main at `d0e841f` (with
Phase 6).

```text
$ LLM_PROVIDER=fake python -m knowledge_portal.interfaces.evaluate          # the assessment
system precision        65.2%
system recall           24.1%
verdict accuracy        67.9%
offering accuracy       85.7%
concept recall          21.0%
citation faithfulness   100.0%
false changes           5
$ LLM_PROVIDER=fake python -m knowledge_portal.interfaces.evaluate --mapper match
system precision        80.0%
system recall           8.6%
verdict accuracy        47.2%
offering accuracy       71.4%
concept recall          not measured
citation faithfulness   100.0%
false changes           5
$ pytest
996 passed, 49 skipped
$ TEST_DATABASE_URL=… pytest tests/integration      # PostgreSQL 16 with pgvector
49 passed
$ ruff check . && ruff format --check . && mypy src tests && lint-imports
All checks passed! · Success: no issues found in 335 source files · Contracts: 10 kept, 0 broken
$ cd frontend && npx tsc -b && npm run lint && npx vitest run && npm run build
Test Files 38 passed (38), Tests 287 passed (287); built
```

| Measure (fake models) | Phase 0 baseline | Phase 3 assessment |
|---|---|---|
| System precision | 59.3% | 65.2% |
| System recall | 8.6% | 24.1% |
| Verdict accuracy | 47.2% | 67.9% |
| Offering accuracy | 71.4% | 85.7% |
| Concept recall | not measured | 21.0% |
| Citation faithfulness | 100% | 100% |

`match` itself rose from 59.3% to 80.0% precision: the "in" fix removed IN from every
requirement that said "in".

What the fake models miss, and why:
- **Concept recall (21%)** is label matching alone: the fake picks only concepts whose label
  is in the words, so "order online" never reaches self-service order capture. The live
  reader picks from the concept index's shortlist too.
- **Five false changes** (G037 to G041): the fake cannot see that "home-based businesses" is
  another segment, or that "on the customer's existing internet line" leaves out the fibre
  component. These are the errors the 80% gate guards against, so they are counted on every
  run.
- **System recall** misses the order-handling systems (RTF, CWOM, CAF) most cases expect: no
  need names order orchestration in words, and journeys select nothing until Phase 8.

**Your step:** run the live baseline for both mappers and record it here before the verdict is
shown to users (`LLM_PROVIDER=openai python -m knowledge_portal.interfaces.evaluate --json
live-assess.json`, then again with `--mapper match`).

## Risks

- **Catalogue links written by the golden set's author** (see Catalogue data).
- **The reasoner may overrule the rules.** Both verdicts are kept, so the override rate the
  rules suffer is visible from the first live run; Phase 5 monitors it in production.
- **Shortlist size and the nearest-concepts rank** are tuned on fake embeddings only. The live
  run's concept recall is where to tune them.
- **Owners are only as good as the squad catalogue** (plan risk, Phase 1b). Today's demo
  organisation has no seats on capabilities, so live answers will report many staffing gaps.
- **Vocabulary term ids are not read yet.** Phase 6 added them, but no SMB value carries one
  until the clean-up suggestions are accepted. The graph lane can then use responsibility
  roles to tell "provisions" from "suggests" (ECM is the most frequent false positive).

## Dropped from this slice

- None.

## Deferred

- Journey activities in the graph lane, once activities are linked to concepts (Phase 8).
- Per-facet evidence budgets and the reranker (Phase 5).
