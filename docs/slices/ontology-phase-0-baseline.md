# Ontology plan, Phase 0 — Golden set, evaluation harness and baseline

## Objective

Give every later phase of the ontology and impact plan
([plan](https://claude.ai/code/artifact/27b1b1d1-b01b-40d4-9264-1999bc29b2bf)) a number it must
beat: a labelled golden set, a command that scores the impact mapper on it, today's scores, and
the decisions the plan rests on (ADR-0114 to ADR-0116).

## User Outcome

A knowledge administrator, or a developer changing retrieval, a prompt or a model, runs one
command and sees system precision and recall, verdict accuracy, offering accuracy, concept
recall and citation faithfulness for the mapper as configured.

## In Scope

- `tests/fixtures/golden/impact_golden_set.json`: 53 labelled requirements on
  `catalogues/smb-architecture.yaml` (version `smb-architecture-business-pro-plus`).
- The evaluation use case, the golden set file reader, the composition and the command.
- Today's mapper scored with the fake models, kept as a CI floor.
- ADR-0114 (proposed; authored in requirement-portal, copied here), with ADR-0115 and ADR-0116
  in requirement-portal.

## Out of Scope

- Concepts, the concept index and the assessment route (Phases 1 to 3).
- Any change to mapping. One defect found by the baseline is recorded below for Phase 3.

## Domain

`domain/architecture/verdicts.py`: `ProductVerdict` with the four verdicts of the gap review.
A requirement too vague to place has no verdict.

## Application Use Cases

`application/use_cases/mapping_evaluation.py`:
- `EvaluateImpactMapping` maps each case and scores it. A provider that answers unusably
  (`ArchitectureEvidenceError`) fails that case, not the run.
- `MatchedImpact` is today's mapper as requirement-portal calls it (`match`). It gives no verdict;
  its stand-in is the offering the text names (ADR-0097's product context), read as "change to
  that offering", and no verdict when none is named. It returns no concepts, so concept recall
  is "not measured".
- `PublishCatalogueForEvaluation` publishes the catalogue file as its own release, indexed, never
  activated.

## Ports

`ImpactMapperPort` (the mapper under evaluation) and `PublishedEvidencePort` (to check each
cited quote against its passage), both in the use-case module. Phase 3 adds a second
`ImpactMapperPort` for the assessment route.

## Adapters

`infrastructure/architecture/golden_set_file.py` reads the JSON and refuses mislabels: a duplicate
or blank id, an unknown verdict or concept, an offering on a verdict that names none (or none on
one that needs it), a verdict with missing facets, or a case with no verdict that does not say
what is missing.

## API

None. The evaluation is a command, not a route:

```bash
LLM_PROVIDER=fake python -m knowledge_portal.interfaces.evaluate --json run.json
```

It builds its own graph (`interfaces/api/composition/evaluation.py`) with the configured models
and in-memory releases, index and squads, so it never reads or writes the portal's database.
`--golden-set` and `--catalogue` choose other files.

## UI

None. The plan places the scores on the front page's freshness panel in Phase 5 (override and
precedent counts); Phase 0 has no screen.

## Business Rules

- Systems are labelled as the systems a reviewer expects to change, not every system the
  offering's journey passes through.
- Concepts are labelled with the 37 concept ids the file declares. They are the starting list
  for Phase 1's capability scheme.

## Tests

`tests/unit/test_mapping_evaluation.py`: the committed golden set reads, covers every verdict and
names only systems and offerings the catalogue holds; today's mapper never falls below the
baseline; each mislabel is refused; the scores on a hand-made set; a provider failure; the command.

## Acceptance Criteria

- The golden set has at least 50 cases and every verdict. **Met: 53 cases** (28 change, 7 new
  plan, 7 new offering in family, 5 new product line, 6 needing questions).
- The command scores the mapper with fakes in CI and with live models by hand. **Met for fakes;
  the live run needs provider credentials** (see Deferred).
- The baseline is recorded here. **Met for the fake models.**
- The ADRs are accepted by the owner. **Open.**

## Baseline (2026-10-10)

Today's `match`, fake models (`fake-architecture-reasoner-v1`, `fake-architecture-embedding-v2`),
golden set v1:

| Measure | Score | Notes |
|---|---|---|
| System precision | 59.3% | 16 of 27 predicted systems right |
| System recall | 8.6% | 16 of 187 expected systems found |
| Verdict accuracy | 47.2% | 25 of 53; the stand-in only ever says "change" or nothing |
| Offering accuracy | 71.4% | 25 of 35 cases labelled with an offering |
| Concept recall | not measured | `match` returns no concepts |
| Citation faithfulness | 100% | every cited quote is in its passage |

What it shows:
- The fake reasoner selects only systems the text names. Most requirements describe a need
  ("throttle Backup 5G at suspension"), so recall is low. This is the gap ADR-0114 addresses.
- **Defect for Phase 3:** the IN system's id is `in`, and `named_systems` matches ids as whole
  words, so the English word "in" maps IN wrongly in 7 cases. It is a real false positive on the live path
  too. Phase 3's assessment should match ids only where they are not common words, or match names
  and aliases only.
- Every new-plan and new-offering case that names Business Pro Plus is read as "change"; the
  stand-in cannot tell them apart. Phase 3's verdict reasoner is what fixes this.

## Proposed verdict accuracy gate

For the owner to set (plan, Readiness): show the verdict to reviewers in Phase 4 only when, with
the live models on this golden set,
- verdict accuracy is at least **80%**, and
- no new-product-line or new-offering case is called "change to an existing offering", since that
  is the mistake that hides product set-up work.

Until then the verdict is a suggestion and "unknown" is always allowed (ADR-0115).

## Validation Evidence

Run on 2026-10-10 against `main` at `ec007ad` plus this change.

```text
$ LLM_PROVIDER=fake python -m knowledge_portal.interfaces.evaluate
Golden set v1 on smb-architecture-business-pro-plus
Mapper: match (fake-architecture-reasoner-v1); 53 cases, 0 failed

system precision        59.3%
system recall           8.6%
verdict accuracy        47.2%
offering accuracy       71.4%
concept recall          not measured
citation faithfulness   100.0%

$ pytest tests/unit/test_mapping_evaluation.py
20 passed in 1.69s
$ pytest                  # whole suite; PostgreSQL tests skip without TEST_DATABASE_URL
908 passed, 46 skipped in 65.95s
$ ruff check .
All checks passed!
$ ruff format --check .
341 files already formatted
$ mypy src tests
Success: no issues found in 310 source files
$ lint-imports
Contracts: 10 kept, 0 broken.
```

## Dropped from this slice

- **Historic requirements in the golden set.** The plan asked for 50 to 100 labelled historic
  requirements. Neither this container nor the repositories hold any (requirement-portal's
  historic corpus is in its production database). The 53 cases are written from the catalogue's
  own sources (SDD v2.3 and the SMB reference); one comes from the committed backlog export
  fixture. They should be extended with labelled historic requirements, keeping these.

## Deferred

- **The live-model baseline.** Run the command with the production `LLM_PROVIDER` and keys and
  add its scores here; that run, not the fake one, is what the verdict gate is measured against.
- The owner's acceptance of ADR-0114 to ADR-0116 and of the verdict gate above.
