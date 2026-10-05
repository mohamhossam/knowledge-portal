# UPSTREAM.md

This repository is imported fresh, with no history, from
[`mohamhossam/smb-ai-requirement-agent`](https://github.com/mohamhossam/smb-ai-requirement-agent)
(requirement-portal ADR-0098). The original stays maintained and deployed in parallel.

## Synced to

| Field | Value |
|---|---|
| Original commit | `d5cfb57` |
| Imported | 2026-10-02. The library and catalogue code was copied from requirement-portal `539e174`, which is `d5cfb57` after requirement-portal's Stage 2 untangling |

## How to port a fix

1. List the original commits after "Synced to" that touch the library, the architecture
   catalogue or the organisation catalogue:
   `git -C ../smb-ai-requirement-agent log --oneline d5cfb57..origin/main`.
2. Port each one in its own pull request, titled `port: <original subject> (<original sha>)`.
3. Add a row below. Move "Synced to" forward only when every commit up to the new point has a
   row.

## Ported changes

These rows decide the 14 commits on the original's `smb-product-flow-architecture` branch (the Product Architecture Explorer, requirement-portal ADR-0101), which are not on its `main` yet. Every one is now ported or skipped. "Synced to" stays `d5cfb57` until they land there.

| Original commit | Decision | Pull request |
|---|---|---|
| `02992a2` enterprise solution-architecture explorer with DOCX generation | Ported, re-implemented on the catalogue (requirement-portal ADR-0101): the seed `scripts/convert_explorer_model.py`, the explorer on the version in service, its catalogue slices 2–7, and the `.docx` | [#22](https://github.com/mohamhossam/knowledge-portal/pull/22), [#23](https://github.com/mohamhossam/knowledge-portal/pull/23), [#24](https://github.com/mohamhossam/knowledge-portal/pull/24), [#25](https://github.com/mohamhossam/knowledge-portal/pull/25), [#26](https://github.com/mohamhossam/knowledge-portal/pull/26), [#27](https://github.com/mohamhossam/knowledge-portal/pull/27), [#28](https://github.com/mohamhossam/knowledge-portal/pull/28), [#29](https://github.com/mohamhossam/knowledge-portal/pull/29), [#30](https://github.com/mohamhossam/knowledge-portal/pull/30), [#32](https://github.com/mohamhossam/knowledge-portal/pull/32), [#34](https://github.com/mohamhossam/knowledge-portal/pull/34), [#35](https://github.com/mohamhossam/knowledge-portal/pull/35), [#36](https://github.com/mohamhossam/knowledge-portal/pull/36) |
| `7199861` public MVP tab, solution-flow hero, calm theme | Skip: the static file, its sandbox, public access and theme are not carried over | — |
| `ca4a802` impacted-architecture first tab, leaner tab set | Ported as design input: after the offering's head, the explorer leads with the systems the scenario touches (slice 1) | [#23](https://github.com/mohamhossam/knowledge-portal/pull/23) |
| `1d71fec` Architecture explorer in the left sidebar | Skip: requirement-portal's sidebar | — |
| `9411896` calm borders instead of side-tab accents | Skip: styling of the static file; this portal has its own design system | — |
| `e755684` business change requests, phase 1 | Ported with phase 2: a change request waits in an inbox and is read into a draft as suggestions (slice 7) | [#36](https://github.com/mohamhossam/knowledge-portal/pull/36) |
| `e629c77` dark-theme text on brand | Skip: styling of the static file; this portal has its own design system | — |
| `8833e34` brand dot instead of a side stripe | Skip: styling of the static file; this portal has its own design system | — |
| `dde1451` change requests from Requirement AI, phase 2 | Ported: requirement-portal sends the approved backlog (schema 1.x) on its final approval; it waits in an inbox until an admin reads it into a draft, where each approved feature is a suggested question (slice 7) | [#36](https://github.com/mohamhossam/knowledge-portal/pull/36) |
| `acc1b3a` CR-20261004-Business_Pro_Plus applied to the model | Ported as data: the explorer-model converter carries it into the version's change history (slice 7) | [#36](https://github.com/mohamhossam/knowledge-portal/pull/36) |
| `e7b05f3` product profile page | Ported onto the offering sheet and the explorer's offering view (slices 2–5) | [#23](https://github.com/mohamhossam/knowledge-portal/pull/23), [#24](https://github.com/mohamhossam/knowledge-portal/pull/24), [#26](https://github.com/mohamhossam/knowledge-portal/pull/26), [#27](https://github.com/mohamhossam/knowledge-portal/pull/27), [#28](https://github.com/mohamhossam/knowledge-portal/pull/28), [#29](https://github.com/mohamhossam/knowledge-portal/pull/29), [#32](https://github.com/mohamhossam/knowledge-portal/pull/32), [#34](https://github.com/mohamhossam/knowledge-portal/pull/34) |
| `8f19708` visual product page | Ported onto the offering sheet and the explorer's offering view (slices 2–5) | [#23](https://github.com/mohamhossam/knowledge-portal/pull/23), [#24](https://github.com/mohamhossam/knowledge-portal/pull/24), [#26](https://github.com/mohamhossam/knowledge-portal/pull/26), [#27](https://github.com/mohamhossam/knowledge-portal/pull/27), [#28](https://github.com/mohamhossam/knowledge-portal/pull/28), [#29](https://github.com/mohamhossam/knowledge-portal/pull/29), [#32](https://github.com/mohamhossam/knowledge-portal/pull/32), [#34](https://github.com/mohamhossam/knowledge-portal/pull/34) |
| `94b35aa` one scroll, not two; lifecycle board for journeys | Ported: the explorer sets the journey's steps by phase, on one scroll (slice 1); frame sizing is not needed | [#23](https://github.com/mohamhossam/knowledge-portal/pull/23) |
| `a1c19b3` product header and offering hero | Ported: the offering's head on its sheet and in the explorer (slice 1) | [#23](https://github.com/mohamhossam/knowledge-portal/pull/23) |
