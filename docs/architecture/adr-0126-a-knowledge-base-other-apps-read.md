# ADR 0126 — A knowledge base other apps read

## Status

Accepted 2026-10-22 by the repository owner ("I want knowledge portal separate, to be used as a
knowledge base for anyone who needs info, not coupled with requirement portal; requirement
portal can also retrieve the data from the knowledge base"). It supersedes ADR-0104 and the
parts of ADR-0099 that bind this portal to requirement-portal. From this ADR on, this repository
numbers its own decisions; the copies of platform ADRs (0077–0104) stay as history.

## Context

ADR-0104 made the two portals deploy and start on their own, but left them tied in both
directions:
- this portal called requirement work's internal API: who cites a document, which citations
  need review, citation counts in the library and on historic requirements, mapped-requirement
  counts per catalogue version, and a whole "Requirement knowledge" workbench of requirement
  work's corpus and findings;
- it served an internal API written for requirement work alone: one caller, named
  `requirements`, under `/internal`, refused at the edge, reachable only on a private network
  shared with requirement work;
- its screens linked into requirement work, and its copy and rules described it as part of the
  requirement platform.

The owner wants the opposite shape: a knowledge base that knows nothing about the apps that
read it.

## Decision

**The knowledge portal is a stand-alone knowledge base. Apps read it; it reads no app.**

- **No calls out.** The adapters onto requirement work, their ports and fakes, the screens and
  routes built only on them, and the settings that configured them are removed. Nothing in this
  portal shows another app's data or links to another app.
- **One API for any app.** What requirement work used — architecture match and assessment,
  library search, retrieval and passages, published evidence, historic requirements, the event
  feed, and the change requests, deliveries and precedents an app may send — is served to any
  registered app under `/apps/v2`, with its own versioned contract,
  `contracts/knowledge-apps.openapi.json` (2.0.0).
- **Each app is named.** An app proves itself with a token the OIDC issuer grants its own
  client for the audience `knowledge-apps` (`APP_CLIENT_IDS`), or with a shared token of its own
  (`APP_TOKENS`). The name it is admitted under is recorded on what it sends; no app is named in
  code.
- **Reachable where the owner chose.** The app API is served through the portal's public
  address, behind app sign-in, as well as on a private network (`deploy/compose.apps.yaml`).
- **The browser screens stay for knowledge admins**, and the explorer for anyone signed in, as
  before. Opening the library to every signed-in reader is a separate decision.

## Consequences

- **Breaking for requirement-portal, once.** Its client moves from `/internal/...` to
  `/apps/v2/...`, its Keycloak client's audience from `knowledge-internal` to `knowledge-apps`,
  and the knowledge portal's operator registers it in `APP_CLIENT_IDS` or `APP_TOKENS` (the old
  `REQUIREMENT_SERVICE_*` settings now fail the boot with the new names). The two must be
  released together.
- **Requirement work loses nothing it read**; this portal loses the screens that showed
  requirement work's data (the requirement workbench, "Cited by", citation counts, mapping
  counts). They belong in requirement-portal, which holds that data.
- **The API is on the internet.** It answers only a signed-in app, and every refusal uses the
  one error shape; operators should keep `APP_TOKENS` to the private network where they can and
  prefer issuer-granted tokens through the public address.
- **Contract changes stay checked.** `scripts/check_app_contract.py` sorts each change as
  breaking or additive against the base, as the internal contract's check did, and finds the
  previous contract under its old name.

## Alternatives considered

- **Just leave the link unconfigured** (ADR-0104 as it stood). Rejected: the code, settings,
  screens and rules still described this portal as half of the requirement platform.
- **Keep the `/internal` paths** so requirement-portal needs no change. Rejected by the owner in
  favour of a public, versioned name now rather than a second break later.
- **Private network only.** Rejected by the owner: apps on other hosts should reach the
  knowledge base through its address, signed in.
