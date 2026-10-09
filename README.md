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

`START_GUIDE.md` walks through every way to start the portal: offline with sample content, with
PostgreSQL, in Docker with `deploy/compose.local.yaml`, and beside requirement-portal. The short
version:

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
what the catalogue cannot hold yet, such as information objects. Those arrive with later
slices and are never filled in by guesswork. The source register (each source's level: L1
canonical, L2 primary, L3 carried forward), the conflicts between sources and each offering's
sources, open questions, architecture decisions and boundaries carry over, and are kept on the
catalogue's Governance page and each offering's sheet.

New content comes from documents uploaded to a draft, as suggestions a person reviews. Under a
document's `## Product: <name>` heading, the table reader reads an offering's realisation
(Component · Layer · Realised as), its NFRs (Quality · Coverage · Statement), the tables and
`**Applies to:**` / `**Not tracked:**` lines under its `### Order tracking` heading, and each
`### Lifecycle: <title>` section as one lifecycle note, its paragraphs, lists and tables in order;
`tests/fixtures/catalogue/synthetic_offering_details.md` shows every shape. The model reads the same
details from prose when its context leaves ample room, and says so when it does not.

Plans and prices are never carried over. The explorer reads them live from the product catalog,
a TM Forum TMF620 Product Catalog Management API, by the offering's code, and caches them for a
few minutes. The knowledge catalogue keeps no copy, and the explorer says which catalog it read
and when. Set `PRODUCT_CATALOG_PROVIDER=tmf620` with `PRODUCT_CATALOG_URL` (the API root, such as
`https://catalog.example/tmf-api/productCatalogManagement/v4`) and `PRODUCT_CATALOG_TOKEN`.
By default an offering's code is looked up as the catalog's `productOffering` id. Where the
catalog keys offerings differently, `PRODUCT_CATALOG_CODE_FIELD` names the field to search on,
and a code that matches two offerings is refused, never guessed. Offline,
`PRODUCT_CATALOG_PROVIDER=fake` reads a sample catalog whose plans say "(sample)"; unset, the
explorer says no product catalog is read.

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

To run both images on one machine, with PostgreSQL, ClamAV and an edge proxy, use
`deploy/compose.local.yaml` (`START_GUIDE.md`, section 7). To deploy the portal, use
`deploy/compose.production.yaml` (`docs/operations/deployment.md`); requirement work is optional
(requirement-portal ADR-0104).

The browser app ships as its own image, nginx serving `/knowledge/`
(`docker build -f deploy/web/Dockerfile .`; `--build-arg KNOWLEDGE_BASE_PATH=/` serves it at the
root of its own hostname). The container's `CSP_IDENTITY_ORIGINS` names the OIDC issuer's origin,
and its `REQUIREMENT_PORTAL_URL` where requirement work is, empty to leave out the links.

CI (`.github/workflows/ci.yml`) runs the checks with PostgreSQL, the frontend checks, audits
dependencies, and builds, scans and starts both images. Pushing a tag `vX.Y.Z` that matches
`pyproject.toml` publishes `ghcr.io/mohamhossam/knowledge-api:vX.Y.Z` and
`ghcr.io/mohamhossam/knowledge-web:vX.Y.Z` once CI passes, and attaches both OpenAPI contracts to the GitHub release; `deploy/compose.production.yaml`
pulls them by tag. CI needs the `KERNEL_READ_TOKEN` repository secret. `CHANGELOG.md` says what
each release changes; add its entry in the pull request that bumps the version.

## Who uses it

People with the `knowledge_admin` role curate. Anyone else who is signed in can read the
product architecture explorer at `/knowledge/explorer`: for each offering and order type in the
catalogue version in service, the journey, the systems that take part and what the catalogue
does not say yet (requirement-portal ADR-0101). Any reader can download a scenario as a Solution
Architecture document (.docx), written in the browser from the same version. requirement-portal sends each
approved backlog here when its final approval is recorded; admins read it into a draft as
suggested questions or dismiss it (requirement-portal ADR-0101, step 7). Citations and architecture evidence stay readable
through the read-only viewers in requirement-portal.

## Origin

The library and catalogue code is imported fresh from `smb-ai-requirement-agent@d5cfb57`, which
stays maintained in parallel; see `UPSTREAM.md`.
