# Handoff to requirement-portal: the knowledge base's app API (ADR-0126)

The knowledge portal is now a stand-alone knowledge base that apps read. requirement-portal
keeps everything it read before, under new names, and the knowledge portal stops calling it.
The app contract is 2.0.0, a breaking change: the two must be released together.

## What requirement-portal must change

- **Paths.** Every `/internal/...` operation it calls is now `/apps/v2/...`, with the same
  method, parameters and bodies. The contract is `contracts/knowledge-apps.openapi.json`
  (published with each knowledge-portal release); it replaces `knowledge-internal.openapi.json`.
- **Where.** It may call the knowledge base through its public address,
  `https://<knowledge host>/knowledge-api/apps/v2`, or on the same host's private network as
  `http://knowledge-api:8000/apps/v2` (network `knowledge-apps`, was `platform-internal`).
- **Credential.** Its Keycloak client (`requirement-service`) must carry the audience
  `knowledge-apps` (was `knowledge-internal`). The knowledge portal's operator registers it with
  `APP_CLIENT_IDS=requirement-service`, or registers a shared token with
  `APP_TOKENS=requirements=<token>` (was `REQUIREMENT_SERVICE_TOKEN`). The name it is registered
  under is the name its change requests and closed Epics keep.
- **Refusals** answer `{code, message, correlation_id}` (unchanged since contract 1.0.0); read
  `message`, not `detail`.

## What requirement-portal may drop

The knowledge portal no longer calls requirement work, so these operations of
requirement-portal's internal API have no caller from it (check for other callers first):

- `GET /internal/references/{document_id}/dependents` and `/impact`;
- `GET /internal/references/citation-counts`;
- `GET /internal/architecture-mapping/stats`;
- `/internal/knowledge/...`: the requirement corpus (summary, rows, findings, nudge, retire,
  reinstate, reindex) and historic-requirement citation counts and citations.

Its `knowledge-service` audience mapper (`requirement-internal`) and the knowledge portal's
`knowledge-service` client are no longer used either. The screens that showed this data in the
knowledge portal (the requirement workbench, "Cited by", citation and mapping counts) are gone;
if requirement authors still need them, they belong in requirement-portal, which holds the data.

## What reads differently

- A change request's source in the catalogue reads "Change request from <app name>: …"; its
  trace reads "Requirement REQ-…, revision n, approved by …" (was "Requirement AI requirement
  …"). New entries in a version's change history have the origin `app`; older ones keep
  `requirement-ai`.
- A closed Epic removed later is withdrawn only by the app that sent it.
