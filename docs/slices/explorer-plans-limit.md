# Explorer: the plans lookup is rate-limited, and change history is content

## Objective

Record two owner decisions of 2026-10-21 (requirement-portal ADR-0101, Amendment 3) and build
the one that needs code: an explorer reader's plans lookups count against a per-minute budget,
because each can call the external product catalogue. The explorer keeps returning the change
history of the version in service; the rule that said "never history" is corrected instead.

## User Outcome

A reader who opens offerings' plans faster than the limit is told, in the Plans and prices
section, "Too many product catalogue lookups: at most 30 per minute. Try again in 12 seconds.",
with Try again. Other readers, and admins' AI work, are unaffected.

## Business Rules

1. Each `GET /explorer/offerings/{id}/plans` counts one lookup against the signed-in reader's
   own budget, `PROVIDER_RATE_LIMIT_PER_MINUTE` per sliding minute (0 means unlimited).
2. The budget is apart from the AI-call budget of the same person.
3. A request refused before the catalogue could be called (401, 403, 404, 422) is refunded.
4. Past the limit: 429 `provider_rate_limited` with `Retry-After`.
5. `GET /explorer/release` includes the change history of the version in service; never drafts,
   documents, the index, curators or earlier versions.

## Domain

None.

## Application

- `ProviderCallRateLimit` takes the refusal wording; `AI_REFUSAL` (as before) and
  `CATALOG_REFUSAL`.

## Ports

None.

## Adapters

None.

## API

- `limit_catalog_reads` (signed-in, not admin) on the plans route; the container holds
  `catalog_read_rate_limit`. Contract unchanged.

## UI

- None new: Plans and prices already shows the service's message with Try again.

## In Scope / Out of Scope

- In: rules 1 to 5, ADR-0101's copy, `CLAUDE.md`'s service rules, the explorer docstrings and
  journey 5.
- Out: a shared limit across API replicas (counts live in each process, as for AI calls).

## Acceptance Criteria

- A reader over budget gets 429 with `Retry-After` and the catalogue wording; a 404 lookup was
  refunded; another reader and the same person's AI search still succeed.
- The route-authentication test still lists the plans lookup as a reader route.

## Tests

- `tests/unit/test_product_catalog.py::test_a_readers_lookups_are_rate_limited_apart_from_ai_calls`.
- `frontend/src/explorer/ExplorerPage.test.tsx`: the 429 message in Plans and prices.

## Validation Evidence

- `uv run pytest`: 1361 passed, 58 skipped; `ruff check`, `ruff format --check`,
  `mypy src tests`, `lint-imports`: clean; contracts regenerated, unchanged.
- Frontend: `lint`, `typecheck`, `test` (917 passed), `build`: clean. No screen changed, so no
  live check; the end-to-end suite runs with the limit off (`PROVIDER_RATE_LIMIT_PER_MINUTE=0`).
