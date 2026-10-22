# ROADMAP.md — knowledge-portal

What is open, then what each stage delivered in a line. The full record of how each stage was
built is archived in `docs/history/roadmap-to-v0.7.0.md`; each release is in `CHANGELOG.md`.

## Open — 2026-10-22

| Scope | Open item |
|---|---|
| Stage 0: repository scaffolding | Branch protection on `main`, set by the repository owner in GitHub's settings (`docs/operations/branch-protection.md` says what to require) |
| The 2026-10-22 portal review ([report](https://claude.ai/artifact/TkWtaZUrpzyUYp1YYvtief)) | Recommendations 1 to 18 are in [#144](https://github.com/mohamhossam/knowledge-portal/pull/144). The English-only clean-up is in it too. Left: the impeccable critique of the screens #144 changed |
| Ontology and impact plan (ADR-0114 to ADR-0116) | The live-model baseline and the 80% verdict gate for both mappers; the concept screens and coverage line (redesign plan 03); requirement-portal keeping, showing and sending the drafted offering (Phase 9) |
| The Product Architecture Explorer (requirement-portal ADR-0101) | Live-model extraction checks, and a live TMF620 catalog |
| Knowledge Center (ADR-0099 Amendment 1, ADR-0102) | The Azure DevOps edition, for the REST adapter (historic requirements run on the fake connector until then); prior art stays off in production until requirement-portal's judge is evaluated |
| Independent portals (requirement-portal ADR-0104) | Whether releases serve at the root, then the cutover with requirement-portal, and Phases 6 and 7 |
| Customer's two masters (ADR-0123) | When the NC Digital migration ends, CBCM stops mastering Customer, and its note and NC CRM's go |

## Delivered

| Scope | Delivered |
|---|---|
| Stage 0: repository scaffolding | `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `UPSTREAM.md`; CI arrived with Stage 3, step 4 |
| Stage 3: the service | The backend, its schema, import, images and CI; the design system, front page and curation screens for the library, the architecture catalogue and the squads ([#11](https://github.com/mohamhossam/knowledge-portal/pull/11)–[#18](https://github.com/mohamhossam/knowledge-portal/pull/18); v0.1.0) |
| The Product Architecture Explorer, steps 1 to 7 | 2026-10-05 ([#22](https://github.com/mohamhossam/knowledge-portal/pull/22)–[#36](https://github.com/mohamhossam/knowledge-portal/pull/36)) |
| Knowledge Center, sub-slices A′ to E2b | 2026-10-07 ([#40](https://github.com/mohamhossam/knowledge-portal/pull/40)–[#48](https://github.com/mohamhossam/knowledge-portal/pull/48)) |
| Independent portals, Phases 2 to 5 | 2026-10-09 ([#49](https://github.com/mohamhossam/knowledge-portal/pull/49)–[#53](https://github.com/mohamhossam/knowledge-portal/pull/53); v0.2.0) |
| Ontology and impact plan, Phases 0 to 9 | 2026-10-10 and 11 (v0.3.0 to v0.6.0); each phase's slice is in `docs/slices/ontology-phase-*.md` |
| Post-v0.6.0 curation work | 2026-10-21 (v0.7.0) |
