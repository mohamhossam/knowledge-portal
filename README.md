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

> **Status: backend complete (Stage 3); the UI has begun.** The API, worker, schema, data
> import, images and CI are in place. The browser app has its design system ("the Timetable
> Book", `DESIGN.md`), sign-in, the no-access page and the front page; the curation screens
> follow. See `ROADMAP.md`.

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

## Importing the existing knowledge

The library, catalogues and their history move here from a requirements database (one at or
past requirement-portal migration `202610021400`, such as a restored backup). Migrate this
service's database first, then:

```bash
uv run knowledge-portal import --source-database-url postgresql://…/requirements --verify
```

The import writes to `DATABASE_URL` in one transaction, keeps every id, and reads the source in
one snapshot without writing to it. Running it again brings changed rows up to date and adds new
ones. `--verify` compares each table's row count and content checksum and fails on any
difference; `--verify-only` compares without copying. Admins are not imported: the portal
remembers them as they sign in.

## Seeding from the Product Architecture Explorer

The original repository's Product Architecture Explorer kept its architecture in one hand-curated
`model.json`. Here, the explorer reads the published catalogue instead (requirement-portal
ADR-0101), so that model is brought in once, as a catalogue file:

```bash
uv run python scripts/convert_explorer_model.py \
    --model ../smb-ai-requirement-agent/tools/architecture-explorer/src/data/model.json \
    --out explorer-catalogue.json
```

Import the file into a draft from the draft's catalogue-file screen: preview it first, then
import, review and publish. Evidence keeps its confidence and names its source. The script lists
what the catalogue cannot hold yet, such as channels, plans and prices, tracking and source
conflicts. Those arrive with later slices and are never filled in by guesswork.

## The browser app

`frontend/` is the portal's own React + Vite app, served under `/knowledge/`. Its design system
is `DESIGN.md`; product truth is `PRODUCT.md`. With the API running offline on port 8100:

```bash
uv run python -m knowledge_portal.interfaces.api.serve --port 8100   # fake models, sign-in and storage
uv run python scripts/seed_demo.py --api http://127.0.0.1:8100        # optional sample curation work
cd frontend && npm ci && npm run dev                                  # http://localhost:5174/knowledge/
```

The development server proxies `/knowledge-api` to that API. `scripts/seed_demo.py` fills the
in-memory store with clearly labelled sample documents, a draft catalogue release and squads, so
each screen shows every state it must handle. Checks: `npm run lint`, `npm run typecheck`,
`npm test`, `npm run api:check` (the generated API types against
`contracts/knowledge-public.openapi.json`) and `npm run build`.

## Images and releases

One backend image runs every process, chosen by command; see `deploy/api/Dockerfile`. Building
it needs read access to platform-kernel as a BuildKit secret:

```bash
docker build --secret id=kernel_read_token,env=KERNEL_READ_TOKEN -f deploy/api/Dockerfile .
```

The browser app ships as its own image, nginx serving `/knowledge/`
(`docker build -f deploy/web/Dockerfile .`, with `CSP_IDENTITY_ORIGINS` set to the OIDC issuer's
origin for an OIDC deployment).

CI (`.github/workflows/ci.yml`) runs the checks with PostgreSQL, the frontend checks, audits
dependencies, and builds, scans and starts both images. Pushing a tag `vX.Y.Z` that matches
`pyproject.toml` publishes `ghcr.io/mohamhossam/knowledge-api:vX.Y.Z` and
`ghcr.io/mohamhossam/knowledge-web:vX.Y.Z` once CI passes; requirement-portal's deployment pulls
them by tag. CI needs the `KERNEL_READ_TOKEN` repository secret.

## Who uses it

People with the `knowledge_admin` role curate. Anyone else who is signed in can read the
product architecture explorer at `/knowledge/explorer`: for each offering and order type in the
catalogue version in service, the journey, the systems that take part and what the catalogue
does not say yet (requirement-portal ADR-0101). Citations and architecture evidence stay readable
through the read-only viewers in requirement-portal.

## Origin

The library and catalogue code is imported fresh from `smb-ai-requirement-agent@d5cfb57`, which
stays maintained in parallel; see `UPSTREAM.md`.
