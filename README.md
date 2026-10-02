# knowledge-portal

The knowledge portal for the requirement platform. Knowledge administrators curate in it the
shared reference library, the architecture catalogue and the squad (organisation) catalogue.
It is a separate service with its own database and UI, served on the platform's host at
`/knowledge/`, with its API at `/knowledge-api/`.

It is one of three repositories:
- [`requirement-portal`](https://github.com/mohamhossam/requirement-portal), which owns the
  requirements service, its UI and the platform deployment. Its platform ADRs are ADR-0098,
  ADR-0099 and ADR-0100;
- this portal;
- [`platform-kernel`](https://github.com/mohamhossam/platform-kernel), which holds the shared
  mechanisms.

> **Status: backend in progress (Stage 3).** The API and worker run offline today; PostgreSQL
> migrations, the data import and the UI follow. See `ROADMAP.md`.

## Run it offline

```bash
uv sync
cp .env.example .env
uv run python -m knowledge_portal.interfaces.api.serve
```

With the defaults it uses in-memory storage, fake models and fake sign-in. `fake-owner` and
`fake-reviewer` are knowledge admins; `fake-observer` is not, so the portal refuses it. Without
`REQUIREMENT_API_BASE_URL`, offline stand-ins answer for requirement work: no requirement cites
anything and nothing is mapped.

## Checks

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy src tests
uv run lint-imports
TEST_DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/knowledge_test uv run pytest --cov=knowledge_portal
```

`TEST_DATABASE_URL` names a disposable PostgreSQL database with pgvector; without it the
PostgreSQL tests skip and the coverage floor is not met. Apply the schema to a real database
with `uv run python -m knowledge_portal.infrastructure.persistence.migrate`
(`PERSISTENCE_PROVIDER=postgres` and `DATABASE_URL`).

The public API's contract is `contracts/knowledge-public.openapi.json`; regenerate it with
`uv run python scripts/dump_openapi.py`. The internal API's contract,
`contracts/knowledge-internal.openapi.json`, is shared with requirement-portal and changes only
together with it.

## Who uses it

Only people with the `knowledge_admin` role. Everyone else reads citations and architecture
evidence through the read-only viewers in requirement-portal.

## Origin

The library and catalogue code is imported fresh from `smb-ai-requirement-agent@d5cfb57`, which
stays maintained in parallel; see `UPSTREAM.md`.
