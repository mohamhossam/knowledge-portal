# Deployment

The knowledge portal deploys on its own (requirement-portal ADR-0104).
`deploy/compose.production.yaml` is the reference deployment: one host, every process in its own
container, running the images a release published. Requirement work is optional; connect it
when both are deployed.

## What runs

| Container | Purpose |
|---|---|
| `postgres` | PostgreSQL 17 with pgvector, the portal's own database `smb_knowledge` |
| `clamav` | Malware scanner for library uploads |
| `migrate` | Applies the migrations, then exits; the API and worker wait for it |
| `api` | The knowledge API, HTTP only |
| `worker` | Library ingestion and catalogue jobs; scale with `--scale worker=N` |
| `web` | The browser app, nginx serving `/knowledge/` |
| `edge` | The only published port (`KNOWLEDGE_PORT`, default `8090`): `/knowledge/` to `web`, `/knowledge-api/` to `api`, `/knowledge-api/internal` refused |

Put TLS in front of `edge`. The API, worker, database, scanner and metrics ports
(`9464` on `api` and `worker`) stay on the private network.

## First deployment

1. Pick a release. `KNOWLEDGE_IMAGE_TAG` names it, for both images. A release must include
   ADR-0104 to run without requirement work; `v0.1.0` predates it and refuses
   `APP_ENV=production` unless `REQUIREMENT_API_BASE_URL` is set.
2. Create the settings file and fill in every blank:

   ```bash
   cp deploy/production.env.example deploy/production.env
   ```

   `deploy/production.env` is ignored by Git. It holds the sign-in settings, the model provider
   and its key, and requirement work's address and tokens when connected.
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
   open to anyone signed in (requirement-portal ADR-0101).

To upgrade, change `KNOWLEDGE_IMAGE_TAG` and run `up -d` again; `migrate` runs before the new
API and worker start.

## Connect requirement work

The two services call each other's `/internal` routes with two tokens (requirement-portal
ADR-0099). Each portal's edge refuses `/internal`, so the calls travel on a private network,
never through an edge.

| Setting in `production.env` | Value |
|---|---|
| `REQUIREMENT_API_BASE_URL` | requirement work's API on the private network |
| `KNOWLEDGE_SERVICE_TOKEN` | the token this portal presents there; the same value on both sides |
| `REQUIREMENT_SERVICE_TOKEN` | the token requirement work presents here; the same value on both sides |

Each token is 32 or more characters (`openssl rand -hex 32`). Set the address and
`KNOWLEDGE_SERVICE_TOKEN` together or not at all. An empty `REQUIREMENT_SERVICE_TOKEN` turns
this portal's internal API off.

**On one Docker host**, both deployments join one external network. Layer
`deploy/compose.peer.yaml` over the manifest; this portal is then `http://knowledge-api:8000`
on that network, and requirement work is `http://requirement-api:8000`:

```bash
docker network create platform-internal      # once per host
docker compose -f deploy/compose.production.yaml -f deploy/compose.peer.yaml up -d
```

`PEER_NETWORK` names another network. **On separate hosts**, skip the override and set
`REQUIREMENT_API_BASE_URL` to a private address that reaches requirement work's API directly.

Each side keeps working while the other is stopped, and reports it as unavailable where it
needs it.

The released web image links to requirement work at `/` on its own host. Until it takes that
address at start-up, build `web` yourself with
`--build-arg VITE_REQUIREMENT_PORTAL_URL=https://<requirement host>/`, or with an empty value to
leave the links out, and run it in place of the released one.

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

4. Point requirement work's `KNOWLEDGE_API_BASE_URL` and `VITE_KNOWLEDGE_PORTAL_URL` at this
   deployment. requirement-portal's cutover change removes its `knowledge-*` containers;
   keep the old volume until this deployment has run cleanly.

Users sign in again once when the portal moves to a new origin.
