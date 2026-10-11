# Start Guide

This guide gets the knowledge portal running on your machine: its FastAPI service, its
background workers and its browser app under `/knowledge/`. The portal is where knowledge
admins curate the shared reference library, the architecture catalogue and the squad
catalogue.

It is one of three repositories, and you need only this one to start:

- **knowledge-portal** (this repository): the knowledge service and its browser app.
- [**requirement-portal**](https://github.com/mohamhossam/requirement-portal): requirement work,
  its review UI and the whole-platform Docker deployment. Optional here; section 8 runs it beside
  this portal.
- [**platform-kernel**](https://github.com/mohamhossam/platform-kernel): the shared library
  `smb_kernel`. `uv sync` installs its pinned release for you. Clone it only to change it
  (section 10).

Out of the box everything runs offline: in-memory storage, fake AI models and fake sign-in. You
need no API key, no database and no external account.

## 1. Choose how to run it

| You want to | Use | Section |
|---|---|---|
| See the portal with sample content, offline | API, demo seed and browser app | 3–4 |
| Keep your data across restarts | PostgreSQL | 6 |
| Run the portal in containers, with only Docker installed | `deploy/compose.local.yaml` | 7 |
| Work with requirement work connected | Both portals side by side | 8 |
| Run the whole platform in containers, or deploy it | requirement-portal's Docker stack | requirement-portal `START_GUIDE.md`, sections 2–3 |

## 2. Prerequisites

- Git.
- Python 3.12 or newer.
- [uv](https://docs.astral.sh/uv/getting-started/installation/), which installs the backend
  and runs its commands.
- Node.js 22 or newer, with npm.

Optional, only for the features that need them:

- Docker, for PostgreSQL and the ClamAV malware scanner (section 6), or to run everything in
  containers (section 7).
- An API key or a local OpenAI-compatible model server, for real AI output (section 9).

Confirm the tools are available:

```bash
python3 --version
uv --version
node --version
npm --version
```

Run every command in this guide from the repository root (the folder with `README.md` and
`pyproject.toml`) unless the step says `cd frontend`.

## 3. Start the API

### Step 1: install the backend

```bash
uv sync
```

The first run downloads Python, if uv needs one, and every dependency, including
platform-kernel from GitHub at the version `pyproject.toml` pins.

### Step 2: create `.env`

```bash
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

`.env` is ignored by Git. Never commit it or share its contents. `.env.example` documents every
variable.

Then open `.env` and change one line:

```dotenv
LIBRARY_SCAN_MODE=offline
```

The template sets `clamav`, and without a running ClamAV scanner every library upload fails
with "Malware scanner unavailable". `offline` is a deterministic stand-in for trying the portal,
not malware protection. It works only with in-memory storage and fake sign-in, which are the
template's defaults. Section 6 explains real scanning.

The template's other defaults are what an offline start needs:

| Setting | Value | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `fake` | Deterministic sample AI output, no provider account |
| `PERSISTENCE_PROVIDER` | `memory` | All data lives in the API process and is lost when it stops |
| `IDENTITY_PROVIDER` | `fake` | No sign-in; a persona switch in the browser app |
| `APP_ENV` | `development` | Production checks off |

Do not skip this step. Without `.env`, `LLM_PROVIDER` defaults to `openai`, and the API stops at
startup because `OPENAI_API_KEY` is not set.

### Step 3: start the API on port 8100

```bash
uv run python -m knowledge_portal.interfaces.api.serve --port 8100
```

Always pass `--port 8100`. The command's default port is `8000`, which is requirement-portal's
API port, and the browser app's development server expects this API on `8100`.

Keep this terminal open. The API is ready when it logs
`Uvicorn running on http://127.0.0.1:8100`. Check it from another terminal:

| Address | Purpose |
|---|---|
| `http://127.0.0.1:8100/health` | The API is serving; returns `{"status":"ok"}` |
| `http://127.0.0.1:8100/ready` | Storage and every background worker are healthy; returns `"status":"ready"` |
| `http://127.0.0.1:8100/docs` | Interactive API documentation |

With the default `API_BACKGROUND_WORKERS=true`, this one process also runs the background
workers (document ingestion and catalogue jobs).

### Step 4 (optional): load sample content

With the API running, in a second terminal:

```bash
uv run python scripts/seed_demo.py --api http://127.0.0.1:8100
```

It prints `Seeded sample curation work.` and fills the in-memory store with clearly labelled
sample documents (in service, awaiting review, failed and withdrawn), a published catalogue
version with an offering and its journey, a draft catalogue release with suggestions, and
squads. Every screen then has something to show.

The seed needs the offline settings from step 2: `LLM_PROVIDER=fake`, `IDENTITY_PROVIDER=fake`
and `LIBRARY_SCAN_MODE=offline`. Run it again after each API restart, because a restart empties
the in-memory store. Run it only once per API start: a second run adds its documents again,
then stops with `409 Conflict` because a draft catalogue release already exists.

## 4. Start the browser app

In a third terminal:

```bash
cd frontend
npm ci
npm run dev
```

`npm ci` installs the exact versions in `package-lock.json`. Run it on the first start, and
again after `package-lock.json` changes. Later starts need only `npm run dev`.

Open **`http://localhost:5174/knowledge/`**. The app lives under `/knowledge/`, so
`http://localhost:5174/` is not the app. The development server forwards `/knowledge-api` to the
API on port `8100`; to use another port, set `KNOWLEDGE_API_PORT` before `npm run dev`.

With fake sign-in, the top bar has a **Persona** switch:

| Persona | Id | What they see |
|---|---|---|
| Amina Owner | `fake-owner` | Every curation screen (knowledge admin) |
| Ravi Reviewer | `fake-reviewer` | Every curation screen (knowledge admin), so you can review Amina's work |
| Omar Observer | `fake-observer` | The no-access page for curation; the product architecture explorer at `/knowledge/explorer` only |

The explorer at `http://localhost:5174/knowledge/explorer` shows the catalogue version in
service to any signed-in reader.

## 5. Stop and start again

Press `Ctrl+C` in the API terminal and in the browser app terminal.

To start again later, run step 3, then step 4 if you want sample content, then `npm run dev`.
Run `uv sync` again only after `pyproject.toml` or `uv.lock` changes. `uv run` also brings the
environment up to date by itself.

With `PERSISTENCE_PROVIDER=memory`, stopping the API discards everything. If the browser app
still shows a record that is now "not found", the API restarted and its data was cleared.

## 6. Keep your data: PostgreSQL

The portal needs PostgreSQL with the pgvector extension. Its schema is the portal's own, in its
own database. Start one in Docker on port `5433`, which leaves `5432` free for
requirement-portal's database:

```bash
docker run -d --name knowledge-postgres \
  -e POSTGRES_DB=smb_knowledge -e POSTGRES_USER=knowledge -e POSTGRES_PASSWORD=knowledge_dev \
  -p 127.0.0.1:5433:5432 \
  -v knowledge_postgres_data:/var/lib/postgresql/data \
  pgvector/pgvector:pg17
```

The named volume `knowledge_postgres_data` keeps the data across container restarts. Later,
`docker start knowledge-postgres` starts it again.

Set in `.env`:

```dotenv
PERSISTENCE_PROVIDER=postgres
DATABASE_URL=postgresql://knowledge:knowledge_dev@127.0.0.1:5433/smb_knowledge
```

Apply the schema, then start the API as in section 3:

```bash
uv run python -m knowledge_portal.infrastructure.persistence.migrate
uv run python -m knowledge_portal.interfaces.api.serve --port 8100
```

The migration prints `[migration] PostgreSQL schema is current.` Run it again after pulling new
code, before you start the API. The API never changes the schema itself.

### Real malware scanning

`LIBRARY_SCAN_MODE=offline` is refused with PostgreSQL. Switch back to real scanning and run
ClamAV on the default `127.0.0.1:3310`:

```dotenv
LIBRARY_SCAN_MODE=clamav
```

```bash
docker run -d --name knowledge-clamav -p 127.0.0.1:3310:3310 clamav/clamav:1.5
```

ClamAV loads its signatures for a few minutes after it starts. An upload made before it is ready
fails with "Malware scanner unavailable"; retry it once ClamAV is up. The rest of the portal does
not depend on it.

`scripts/seed_demo.py` works only in offline mode. With PostgreSQL, add content through the
browser app, or import existing knowledge (`README.md`, "Importing the existing knowledge").

### A separate worker process (optional)

To run the API as HTTP only, as the deployment does, set `API_BACKGROUND_WORKERS=false` and start
the workers in their own terminal:

```bash
uv run python -m knowledge_portal.interfaces.worker
```

The worker requires `PERSISTENCE_PROVIDER=postgres`, because it cannot see the API's in-memory
queues.

## 7. Run it all in Docker

`deploy/compose.local.yaml` runs the whole portal in containers, built from this checkout. You
need only Docker: no Python, uv or Node.js. Use it to try the portal as it runs in a deployment,
with durable storage and real malware scanning.

| Container | Purpose |
|---|---|
| `postgres` | PostgreSQL 17 with pgvector; a named volume keeps the data |
| `clamav` | Malware scanner for library uploads |
| `migrate` | Applies the migrations, then exits |
| `api` | The knowledge API (HTTP only) |
| `worker` | Library ingestion and catalogue jobs |
| `web` | The browser app, nginx serving `/knowledge/` |
| `edge` | nginx on `127.0.0.1:8090`: `/knowledge-api/` to `api`, internal routes blocked, everything else to `web` |

This stack is for one machine. A shared deployment is `deploy/compose.production.yaml`, which
runs the released images on their own (`docs/operations/deployment.md`).

### Prerequisites

- Docker Desktop on Windows or macOS, or Docker Engine with the Compose v2 plugin on Linux.
  Confirm with `docker compose version`.
- About 3 GB of memory for Docker, most of it for ClamAV, and about 4 GB of disk space.
- Port `8090` free.
- Internet access to `github.com`: the API image build fetches
  [platform-kernel](https://github.com/mohamhossam/platform-kernel), a public dependency.

### Step 1: create the settings file

```bash
cp .env.example deploy/local.env
```

```powershell
# Windows PowerShell
Copy-Item .env.example deploy/local.env
```

`deploy/local.env` is ignored by Git. Its defaults are fake models and fake sign-in, which need
no account. Leave `LIBRARY_SCAN_MODE` as `clamav`. The compose file sets the storage, database
address and scanner address itself, so the values for those in `deploy/local.env` have no
effect. Set anything else there, such as a real model provider (section 9).

### Step 2: build and start

```bash
docker compose -f deploy/compose.local.yaml up -d --build
```

The first build takes several minutes. `up` starts PostgreSQL and ClamAV, applies the
migrations, then starts the API, the worker, the browser app and the edge. It returns once the
edge is up.

### Step 3: confirm it is running

```bash
docker compose -f deploy/compose.local.yaml ps -a
```

`postgres`, `clamav`, `api`, `web` and `edge` show `(healthy)`, `worker` is `Up`, and `migrate`
has exited with code 0, which is expected.

| Address | Purpose |
|---|---|
| `http://localhost:8090/knowledge/` | The knowledge portal (`http://localhost:8090/` redirects here) |
| `http://localhost:8090/knowledge-api/ready` | The API is ready; returns `"status":"ready"` |
| `http://localhost:8090/knowledge-api/openapi.json` | The API's OpenAPI description. The interactive `/docs` page works only when you run from source (section 3) |

The personas are the same as in section 4. The port is published on `127.0.0.1` only, because
fake sign-in lets anyone who reaches it act as any persona. To use another port, set
`KNOWLEDGE_PORT` before `up`, for example `KNOWLEDGE_PORT=8091`.

On its first start, ClamAV updates its signatures, which can take a few minutes. An upload made
before it is ready fails with "Malware scanner unavailable"; retry it. Without internet access
the update fails, and ClamAV scans with the signatures in its image.

### Everyday commands

```bash
docker compose -f deploy/compose.local.yaml ps -a           # container status
docker compose -f deploy/compose.local.yaml logs -f api     # follow a container's log (also: worker, edge)
docker compose -f deploy/compose.local.yaml stop            # stop; data is kept
docker compose -f deploy/compose.local.yaml up -d           # start again
docker compose -f deploy/compose.local.yaml down            # remove the containers; data is kept
docker compose -f deploy/compose.local.yaml down -v         # remove the containers and delete all data
```

After a `git pull`, rebuild and restart with `up -d --build`.
`migrate` runs again first and applies any new migrations. Data is kept.

After editing `deploy/local.env`, run `up -d` again: the containers are recreated with the new
values.

### Run a released version instead

To run the images a release published to ghcr.io instead of building, name them and skip the
build. The images are public:

```bash
export KNOWLEDGE_API_IMAGE=ghcr.io/mohamhossam/knowledge-api:v0.4.0
export KNOWLEDGE_WEB_IMAGE=ghcr.io/mohamhossam/knowledge-web:v0.4.0
docker compose -f deploy/compose.local.yaml pull api web
docker compose -f deploy/compose.local.yaml up -d --no-build
```

Pass `--no-build` on every `up` while these are set. Otherwise a build replaces the released
image with one from your checkout under the release's name. A release can be older than your
checkout.

## 8. Run beside requirement-portal

On its own, the portal uses offline stand-ins for requirement work: no requirement cites
anything and nothing is mapped. To connect the two services, clone
[requirement-portal](https://github.com/mohamhossam/requirement-portal) next to this repository
and start it with its launcher (its `START_GUIDE.md`, section 4). Its API listens on `8000` and
its review UI on `5173`, so the two portals do not collide.

The services call each other's internal API with two shared tokens, each 32 or more characters.
Generate two:

```bash
openssl rand -hex 32   # token A
openssl rand -hex 32   # token B
```

```powershell
# Windows PowerShell
[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
```

Use the same two values on both sides:

| Setting | knowledge-portal (`.env` here) | requirement-portal (its `.env`) |
|---|---|---|
| Where the other service is | `REQUIREMENT_API_BASE_URL=http://127.0.0.1:8000` | `KNOWLEDGE_API_BASE_URL=http://127.0.0.1:8100` |
| The token requirement work presents | `REQUIREMENT_SERVICE_TOKEN=<token A>` | `REQUIREMENT_SERVICE_TOKEN=<token A>` |
| The token the knowledge service presents | `KNOWLEDGE_SERVICE_TOKEN=<token B>` | `KNOWLEDGE_SERVICE_TOKEN=<token B>` |

Set `REQUIREMENT_API_BASE_URL` and `KNOWLEDGE_SERVICE_TOKEN` together or not at all. Leaving
`REQUIREMENT_SERVICE_TOKEN` empty turns this service's internal API off.

Start this portal's API first, then requirement-portal's launcher; its ready banner names the
knowledge service it reached. Each side keeps working while the other is stopped, and reports it
as unavailable where it needs it.

| Address | What |
|---|---|
| `http://127.0.0.1:5173` | requirement-portal's review UI |
| `http://localhost:5174/knowledge/` | This portal. Open it directly: in development the review UI's **Open knowledge portal** link points at its own server, which does not serve this portal |

With fake sign-in on both sides, Amina Owner and Ravi Reviewer are knowledge admins in both
portals.

To deploy the two side by side, each runs its own stack, and they meet on a private network
(`docs/operations/deployment.md`, "Connect requirement work").

## 9. Use a real AI provider

The fake provider is the right choice for a first run. For real output, set the provider and its
key in `.env`. `.env.example` lists each provider's variables, and the API refuses to start, and
names the missing setting, when one is blank.

```dotenv
LLM_PROVIDER=openai          # or openrouter, local
OPENAI_API_KEY=your-real-key
```

Library search and catalogue evidence need a 768-dimension embedding model. With
`LLM_PROVIDER=local`, set `LOCAL_EMBEDDING_MODEL` as well as `LOCAL_LLM_MODEL`. Changing the
embedding model means building and publishing the architecture catalogue again.

The plans and prices in the explorer come from a product catalog, never from this portal. To see
sample plans offline, set `PRODUCT_CATALOG_PROVIDER=fake`; `README.md` describes a real TMF620
catalog.

## 10. Change platform-kernel locally

`uv sync` installs platform-kernel at the tag `pyproject.toml` pins. To try an unreleased kernel
change, clone platform-kernel next to this repository and install it over the pinned copy:

```bash
uv pip install -e ../platform-kernel
uv run --no-sync python -m knowledge_portal.interfaces.api.serve --port 8100
```

Pass `--no-sync` to every `uv run` while you do this; a plain `uv run` or `uv sync` puts the
pinned release back. Never commit a path to a local kernel. A kernel change reaches this portal
through a tagged kernel release and a pin bump (platform-kernel `README.md`, "Releasing").

## 11. Checks before a pull request

Backend:

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy src tests
uv run lint-imports
uv run pytest
```

The PostgreSQL tests and the coverage floor need `TEST_DATABASE_URL`, a disposable pgvector
database (`README.md`, "Checks").

Browser app:

```bash
cd frontend
npm run lint && npm run typecheck && npm test && npm run api:check && npm run build
```

## 12. Common startup problems

### Running from source

#### "LLM_PROVIDER=openai requires OPENAI_API_KEY to be set"

There is no `.env`, or it does not set a provider. Copy `.env.example` to `.env` (section 3,
step 2), or set `LLM_PROVIDER=fake`.

#### "LIBRARY_SCAN_MODE=offline requires memory persistence and fake identity"

Offline scanning is for in-memory trials only. With PostgreSQL or OIDC, set
`LIBRARY_SCAN_MODE=clamav` and run ClamAV (section 6).

#### Uploads fail with "Malware scanner unavailable"

`LIBRARY_SCAN_MODE=clamav` is set and no scanner answers on `127.0.0.1:3310`. Set
`LIBRARY_SCAN_MODE=offline` for an in-memory trial, or start ClamAV (section 6), give it a few
minutes to load its signatures, and retry the upload.

#### The seed script fails or never finishes

Check that the API is running on the address you passed to `--api`, and that `.env` has the
offline settings from section 3. The seed does not work with PostgreSQL, OIDC or a real
provider. `409 Conflict` means it already ran against this API: restart the API, which empties
the in-memory store, and run it once.

#### "address already in use" for port 8000 or 8100

You started the API without `--port 8100` while requirement-portal runs on `8000`, or an earlier
API is still running. Stop it, and start with `--port 8100`.

#### Vite: "Port 5174 is already in use"

The development server uses only `5174`. Stop the earlier `npm run dev` and run it again.

#### The browser app shows an error or never signs in

Check that `http://127.0.0.1:8100/health` answers. If the API runs on a port other than `8100`,
set `KNOWLEDGE_API_PORT` before `npm run dev`. Open the app at
`http://localhost:5174/knowledge/`, not at `/`.

#### "The worker process requires PERSISTENCE_PROVIDER=postgres"

The separate worker needs PostgreSQL. In memory mode, keep `API_BACKGROUND_WORKERS=true` and run
only the API.

#### "... must be at least 32 characters"

A service token is too short. Generate one as in section 8.

#### `uv sync` cannot download platform-kernel

uv fetches it from `github.com/mohamhossam/platform-kernel` with Git. Check that `git` is
installed and that you can reach and read that repository.

### Docker (section 7)

#### "env file ... deploy/local.env not found"

Copy `.env.example` to `deploy/local.env` (section 7, step 1). A `.env` in the repository root
is not read by the Docker stack.

#### The API image build fails at the `uv sync` step

The build could not fetch platform-kernel from GitHub. Check that the machine can reach
`github.com`, and run `up -d --build` again.

#### `up` stops with "dependency failed to start" or `api` stays unhealthy

Read the API's log: `docker compose -f deploy/compose.local.yaml logs api migrate`. A
configuration error names the setting to fix in `deploy/local.env`; then run `up -d` again.

#### Port 8090 is already in use

Set another port for this terminal, for example `export KNOWLEDGE_PORT=8091`, and run `up -d`
again.

#### Uploads fail with "Malware scanner unavailable" in Docker

ClamAV is still loading or updating its signatures. Wait a few minutes, check
`docker compose -f deploy/compose.local.yaml logs clamav`, and retry the upload. If the
container keeps restarting, give Docker more memory.

#### The build fails while downloading

The build downloads base images and packages from Docker Hub, ghcr.io, Debian, PyPI and npm.
Check your network or corporate proxy settings in Docker, then build again.

## More information

- `README.md`: overview, data import, the explorer seed, images and releases.
- `PRODUCT.md` and `DESIGN.md`: who the portal is for, and its design system.
- `.env.example`: every setting, with its meaning.
- `ROADMAP.md`: delivery status.
- `AGENTS.md`: the engineering rules.
- requirement-portal `START_GUIDE.md`: the whole platform, including the Docker stack and
  deployment.
