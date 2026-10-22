# Deployment

The knowledge portal is a stand-alone knowledge base (ADR-0126): people curate and read it in the
browser, and other apps read it through its app API. It calls no other app.
`deploy/compose.production.yaml` is the reference deployment: one host, every process in its own
container, running the images a release published.

## What runs

| Container | Purpose |
|---|---|
| `postgres` | PostgreSQL 17 with pgvector, the portal's own database `smb_knowledge` |
| `clamav` | Malware scanner for library and catalogue uploads |
| `migrate` | Applies the migrations, then exits; the API and worker wait for it |
| `api` | The knowledge API, HTTP only |
| `worker` | Library ingestion and catalogue jobs; scale with `--scale worker=N` |
| `web` | The browser app, nginx serving its base path (`/knowledge/` in released images) |
| `edge` | The only published port (`KNOWLEDGE_PORT`, default `8090`): `/knowledge-api/` to `api` (the app API at `/knowledge-api/apps/v2`), every other path to `web` |

Put TLS in front of `edge`. The API, worker, database, scanner and metrics ports
(`9464` on `api` and `worker`) stay on the private network.

Uploads are never taken unscanned. When `clamav` gives no verdict, because it is down or the
file is larger than its `StreamMaxLength`, a catalogue upload is refused with 503
`malware_scanner_unavailable`; restore the scanner or raise its limit, then upload again.

## First deployment

1. Pick a release, `v0.2.0` or later (`CHANGELOG.md`). `KNOWLEDGE_IMAGE_TAG` names it, for both
   images. `v0.1.0` predates ADR-0104 and refuses `APP_ENV=production` unless
   `REQUIREMENT_API_BASE_URL` is set.
2. Create the settings file and fill in every blank:

   ```bash
   cp deploy/production.env.example deploy/production.env
   ```

   `deploy/production.env` is ignored by Git. It holds the sign-in settings, the model provider
   and its key, and the apps registered to read the knowledge base.
3. Choose the database password and start:

   ```bash
   export KNOWLEDGE_IMAGE_TAG=vX.Y.Z
   export KNOWLEDGE_POSTGRES_PASSWORD=$(openssl rand -hex 24)   # keep it; the volume needs it
   export CSP_IDENTITY_ORIGINS=https://login.example.com          # the OIDC issuer's origin
   docker compose -f deploy/compose.production.yaml up -d
   ```

   Model profiles come from `config/` in this repository, mounted read-only at `/app/config`.
   Set `LLM_CONFIG_PATH=/app/config/llm.yaml` in `production.env` to use them, or point
   `KNOWLEDGE_LLM_CONFIG_DIR` at another directory.
4. Open `https://<host>/knowledge/`. Curation needs the `knowledge_admin` role; the explorer is
   open to anyone signed in (ADR-0101).

To upgrade, change `KNOWLEDGE_IMAGE_TAG` and run `up -d` again; `migrate` runs before the new
API and worker start.

## Sign-in

The portal signs people in through an OIDC issuer: a Keycloak realm of its own, or one it shares
with other apps so people keep one account. Its own entities live in this repository
(`deploy/keycloak/knowledge-portal.json`):

- the public browser client `knowledge-spa`, with PKCE, which puts the audience `knowledge-api`
  and the realm roles (claim `roles`) into its tokens;
- the roles `knowledge_admin` (opens the portal and curates it), `knowledge_reader` and
  `knowledge_maintainer` (the architecture and squad catalogues);
- the groups `knowledge-admins`, `knowledge-readers` and `knowledge-maintainers`, which grant them.

Add them to the realm once, with a Keycloak administrator's account:

```bash
export KEYCLOAK_URL=https://login.example.com KEYCLOAK_REALM=platform
export KEYCLOAK_ADMIN=... KEYCLOAK_ADMIN_PASSWORD=...
export KNOWLEDGE_APP_ORIGIN=https://knowledge.example.com    # where people open the portal
python deploy/keycloak/apply.py --dry-run                     # shows what it would add
python deploy/keycloak/apply.py
```

Entities that already exist, such as those an earlier realm import created, are kept;
`--overwrite` replaces them, for example after the portal moves to another origin. A realm that
still holds the `knowledge-service` client from before ADR-0126 can drop it: the portal no
longer calls any app. Then set `OIDC_ISSUER_URL` to the realm (`https://login.example.com/realms/platform`) in
`production.env`, and `CSP_IDENTITY_ORIGINS` to the issuer's origin. Put people in
`knowledge-admins` to let them in.

A separate realm works the same way: create it, and run the script with its name.

## Register an app

Any app may read the knowledge base through its app API, `/apps/v2` (ADR-0126): architecture
match and assessment, library search, retrieval and cited passages, published evidence, historic
requirements and the event feed, and it may send change requests, closed Epics and verdict
decisions. `contracts/knowledge-apps.openapi.json`, published with each release, is the
contract. An app reaches it through the portal's address, `https://<host>/knowledge-api/apps/v2`,
or, on the same Docker host, on a private network (below).

Each app is registered under a name, and is admitted only with its own credential. What it
sends, such as a change request, keeps that name. With no app registered the app API is not
served: every `/apps` path answers 404.

**With the app's own client at the issuer (preferred, and the one to use through the public
address).** The knowledge base then holds no secret of the app's.

1. At the issuer, give the app a confidential client with a service account, no browser flows,
   and an audience mapper that adds `knowledge-apps` to its access tokens. In Keycloak: client
   authentication on, standard flow and direct access grants off, service accounts on, and a
   mapper of type "Audience" with included custom audience `knowledge-apps`.
2. Add the client id to `APP_CLIENT_IDS` in `production.env`, comma-separated with any others,
   and keep `OIDC_ISSUER_URL` set to that issuer (HTTPS). The app is named after its client id.
3. The app asks the issuer for a token with the client-credentials grant and sends it as
   `Authorization: Bearer <token>`. Tokens are renewed before they expire; if the issuer cannot
   be reached, the app API answers 503 to a token it cannot check.

**With a shared token.** Add `name=token` to `APP_TOKENS`, comma-separated with any others; each
token is 32 or more characters (`openssl rand -hex 32`) and belongs to one app. Prefer this on a
private network only: anyone holding the token is that app.

Names are lower-case letters, digits, `.`, `_` and `-`. An app may hold both while it moves from
a token to its client; it is admitted with either.

**On one Docker host**, an app can call the API without going through the edge. Layer
`deploy/compose.apps.yaml` over the manifest; the app joins the same external network and calls
`http://knowledge-api:8000/apps/v2`:

```bash
docker network create knowledge-apps      # once per host
docker compose -f deploy/compose.production.yaml -f deploy/compose.apps.yaml up -d
```

`KNOWLEDGE_APPS_NETWORK` names another network.

### Upgrading from the internal API (contract 1.x)

Before ADR-0126 the same operations were requirement work's alone, under `/internal`, and this
portal also called requirement work. The app API is contract 2.0.0, a breaking change released
with requirement-portal:

| Before | Now |
|---|---|
| `/internal/...` (refused at the edge) | `/apps/v2/...` (through the edge, or the private network) |
| `REQUIREMENT_SERVICE_TOKEN=<token>` | `APP_TOKENS=requirements=<token>` (any name) |
| `REQUIREMENT_SERVICE_CLIENT_ID=requirement-service` | `APP_CLIENT_IDS=requirement-service` |
| audience `knowledge-internal` on requirement work's client | audience `knowledge-apps` |
| `REQUIREMENT_API_BASE_URL`, `KNOWLEDGE_SERVICE_TOKEN`, `KNOWLEDGE_SERVICE_CLIENT_ID`/`_SECRET` | removed: the portal calls no app |
| `REQUIREMENT_PORTAL_URL` on `web` | removed: the portal links to no app |
| `deploy/compose.peer.yaml`, network `platform-internal` | `deploy/compose.apps.yaml`, network `knowledge-apps` |

The API refuses to start while any removed setting is still set, and names its replacement, so
an upgrade cannot silently lose an app.

## Its own hostname

Give the portal its own hostname, such as `knowledge.example.com`, by pointing it at `edge`
(through TLS). Released images serve the app under `/knowledge/`, and `web` sends `/` there, so
people open `https://knowledge.example.com/knowledge/`.

To serve it at the root instead, build the web image for it and name that image:

```bash
docker build -f deploy/web/Dockerfile --build-arg KNOWLEDGE_BASE_PATH=/ -t knowledge-web:root .
export KNOWLEDGE_WEB_IMAGE=knowledge-web:root
docker compose -f deploy/compose.production.yaml up -d web
```

The API stays at `/knowledge-api/` either way. Keep sign-in in step: run
`deploy/keycloak/apply.py --overwrite` with `KNOWLEDGE_APP_PATH=` (empty for the root) so the
client's redirect URIs match, and tell the apps that read it the new address.

## Moving over from requirement-portal's deployment

Before ADR-0104, requirement-portal's `deploy/compose.production.yaml` (project
`requirement-platform`) ran this portal as `knowledge-*` containers. To move its data to this
deployment:

1. In the requirement-portal checkout, stop the old knowledge containers so nothing writes
   during the copy, then dump the old database:

   ```bash
   docker compose -f deploy/compose.production.yaml stop knowledge-api knowledge-worker knowledge-web
   docker compose -f deploy/compose.production.yaml exec -T knowledge-postgres \
     pg_dump -U knowledge -d smb_knowledge -Fc > knowledge.dump
   ```

2. Copy `knowledge.dump` to this checkout, on the new host if it is another one.

3. Start only this deployment's database, restore into it, then start the rest:

   ```bash
   docker compose -f deploy/compose.production.yaml up -d postgres
   docker compose -f deploy/compose.production.yaml exec -T postgres \
     pg_restore -U knowledge -d smb_knowledge --no-owner --exit-on-error < knowledge.dump
   docker compose -f deploy/compose.production.yaml up -d
   ```

4. Point requirement work at this deployment's app API (see "Register an app").
   requirement-portal's cutover change removes its `knowledge-*` containers; keep the old
   volume until this deployment has run cleanly.

Users sign in again once when the portal moves to a new origin.
