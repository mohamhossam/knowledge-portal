# Golden set report

Catalogue › Golden set (`/architecture/golden-set`), for knowledge admins. It shows how well the
impact mapper agrees with the catalogue's hand-labelled answer key
(`tests/fixtures/golden/impact_golden_set.json`, scored by `EvaluateImpactMapping`).

## Reading it

- **Scores** come in three groups: did it find the right impact (systems found, systems correct),
  did it judge the change correctly (verdict, offering, concepts), can the output be trusted
  (citations, owner and consumer reach, drafts that apply). Each shows the counts behind it and
  the range it could plausibly have on this few cases (95% Wilson interval), the floor it is held
  to, and what moved since the previous comparable run.
- **Tuning and held out.** Held-out cases are not tuned against, so their score is the honest
  one. It moves a lot: 12 cases, one is about 8 points.
- **Several runs** give a mean and a spread. Use them with a real model.
- **A difference smaller than two cases** (about 3.4 points on 59) is not evidence.
- **Fake model** scores test the harness, not the AI. Real-model floors are empty until set.

## Running one

*Run the evaluation* queues a run: the assessment or today's match, with or without
leave-one-out precedents, 1 to 5 times. A real model asks first and says how many assessments it
makes; the page does not state a cost. Only one run waits or runs at a time.

From a terminal the same scoring runs without storing anything:
`uv run python -m knowledge_portal.interfaces.evaluate --mapper assess --json out.json`.

## Floors

`tests/fixtures/golden/impact_floors.json`: the least each score may be, per provider kind.
`tests/unit/test_golden_runs.py` fails CI if the fake models fall below the fake floors. Set live
floors from real runs, after reading several; do not copy the fake ones.

## Deploying

The API image copies the golden set, the floors and `catalogues/smb-architecture.yaml` into
`/app/evaluation` and sets `EVALUATION_ROOT` to it (`deploy/api/Dockerfile`). A deployment without
them answers 503 `golden_set_unavailable`, and the page says so.
