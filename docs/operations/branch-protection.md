# Branch protection on `main`

The last Stage 0 item (review recommendation 18). CI already runs every gate on each pull
request (`.github/workflows/ci.yml`), but nothing stops a merge while one is red, or a push
straight to `main`. Only a repository admin can turn this on, in GitHub's settings; no agent or
workflow in this repository changes it.

## What to set

In **Settings → Rules → Rulesets → New branch ruleset** (or the classic **Branches → Add branch
protection rule**), target the default branch, `main`, and turn on:

- **Require a pull request before merging.** Approvals: 1 if a second person reviews, 0 while
  one person owns the repository, so the rule still forces a pull request and its checks.
- **Require status checks to pass**, with **Require branches to be up to date before merging**,
  and these checks from the `CI` workflow, each by its job name:

  | Check | What it holds |
  |---|---|
  | `quality-gates` | ruff, mypy, lint-imports, pytest with PostgreSQL and the coverage floor, the internal contract's version (AGENTS.md §2.1, §14) |
  | `frontend` | lint (with jsx-a11y), typecheck, the API types, unit tests with axe, build, brand and legacy-CSS lint, budget, `npm audit` |
  | `e2e` | axe on every route in three themes and widths, and the keyboard journeys |
  | `supply-chain` | `pip-audit` of what the image ships and of the OCR extra |
  | `image` | the API image built, scanned and started offline |
  | `web-image`, `web-image-root` | the web image under `/knowledge/` and at the root |

- **Block force pushes**, and **Restrict deletions**.

Leave **Require signed commits** and **Require linear history** off unless the team adopts
them: pull requests here merge with merge commits.

## When it is on

Mark the Stage 0 row in `ROADMAP.md` done. A check renamed or added in `ci.yml` needs the same
change here and in the ruleset, or the ruleset waits for a check that never reports.
