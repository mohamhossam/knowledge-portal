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

> **Status: scaffolding (Stage 0).** The service, its UI and the data import arrive in Stage 3 of
> requirement-portal's `docs/slices/enhancement-platform-split.md`.

## Who uses it

Only people with the `knowledge_admin` role. Everyone else reads citations and architecture
evidence through the read-only viewers in requirement-portal.

## Origin

The library and catalogue code is imported fresh from `smb-ai-requirement-agent@d5cfb57`, which
stays maintained in parallel; see `UPSTREAM.md`.
