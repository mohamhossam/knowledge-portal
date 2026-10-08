# Area build plans (Phase 7)

These are one plan per Phase 8 area, in build order. `/redesign-area` builds one area from its
plan, and only from an approved plan. Each area then stops at its own **GATE 8.n**.

**Plan status: proposed (Phase 7, 2026-10-08).** You approve each plan when you invoke
`/redesign-area` for its area. Changes asked for then are written into the plan first.

**What the plans rest on:**

- the hi-fi prototype, `/knowledge/design-lab/prototype`
  (`frontend/src/design-lab/prototype/`), with its captures in
  `docs/ux/testing/round-2/prototype/`;
- the interaction model (`docs/ux/interaction/model.md`, cited as §n);
- the content guide (`docs/ux/content/`);
- the design system (`frontend/src/design/`, `docs/design-system.md`, `DESIGN.md`);
- the backlog (`docs/redesign/backlog.md`).

> **Validation level.** GATES 1a, 2b, 3 and 6 ran in **assumption mode**. The prototype is
> validated by expert review, a cognitive walkthrough and measurement, **not by users**. Every
> user-facing claim in these plans is **HYPOTHESIS**. Where a plan says "validated prototype",
> read "the prototype as approved at GATE 6".

| # | Plan | Routes | Prototype coverage |
|---|---|---|---|
| 1 | [Shell, navigation, job tray, help + Home](01-shell-home.md) | every page's frame; `/` | Full |
| 2 | [Library](02-library.md) | `/library/**` | Full (Documents, Search, record, review desk, withdraw and return) |
| 3 | [Catalogue curation](03-catalogue-curation.md) | `/architecture/versions/:id/**` (drafts) | Full (the 5 steps); hand edits partly |
| 4 | [Catalogue browsing](04-catalogue-browsing.md) | `/architecture/**` (in service and replaced) | Partial (Systems, Versions, Compare); domains, channels, governance, offerings and journeys are not prototyped |
| 5 | [Requirement knowledge](05-requirement-knowledge.md) | `/requirement-knowledge/**` | Empty states only (no seeded corpus offline) |
| 6 | [Reviews and reminders](06-reviews-reminders.md) | `/reminders` → `/re-confirmations` | Full (simulated due items) |
| 7 | [Squads → Ownership](07-ownership.md) | `/squads/**` → `/ownership/**` | Full (Gaps); Browse pages partly |
| 8 | [Explorer](08-explorer.md) | `/explorer` (admin and reader) | Full |
| 9 | [System states](09-system-states.md) | no access, 404, session, offline, errors, empty and loading | Full |
| 10 | [Route redirects](10-route-redirects.md) | the 10 patterns in `docs/ux/ia/route-map.md` | — |

## Acceptance criteria every area inherits

These come from `docs/ux/research/synthesis.md` §8 and the Phase 7 gates. An area plan adds its
own criteria; it never removes these.

**Accessibility (WCAG 2.2 AA):**

- **A1** Playwright + axe (`frontend/e2e/a11y.spec.ts`) adds **no new rule id** to
  `a11y-baseline.json` for the area's routes, and the area's routes are **removed** from the
  baseline (0 serious or critical).
- **A2** Every new or changed design-system component test runs `axe` (vitest-axe) with no
  violations.
- **A3** On every route change, focus lands on the page's h1 (or, for a `#target` address, on
  that target). Covered by an e2e test per route.
- **A4** Every panel, drawer and consequence panel returns focus to its opener when it closes
  (component or e2e test).
- **A5** Focus is never hidden behind a sticky region at 100%, 200% and 400% zoom (2.4.11). The
  scroll padding comes from the measured `--sticky-*` properties, never a fixed guess.
- **A6** Targets are 24×24 CSS px or larger (2.5.8). Status is shown as an icon and words
  (1.4.1). Text and non-text contrast hold in both themes (the token contract).
- **A7** 400% zoom (320 CSS px): one column and no page-level horizontal scroll. Data tables
  may scroll inside their own frame.
- **A8** Single-key shortcuts work only inside a focused grid or with page-wide shortcuts turned
  on (2.1.4); every key is listed in Help (3.2.6).
- **A9** Content of either language takes `dir="auto"` (or `<bdi>` in sentences); the chrome is
  never mirrored. Set `lang` where the language is known (backlog K2).

**Calm and brand:**

- **B1** Brand lint passes (`npm run lint:brand`). There are no raw colours outside the token
  files, and no `--eand-*` outside the semantic layer.
- **B2** Red appears only as the logo, the rail's active marker and at most one focal accent;
  never as status, error, destructive action or a diff's "removed".
- **B3** Motion is 200ms or less, opacity and transform only, and instant under reduced motion.
  There are no gradients, glass or saturated full-bleed fills.
- **B4** Light and dark, comfortable and compact all render (the visual spec covers 1280 and
  1920 × light and dark).

**Behaviour and content:**

- **C1** Copy follows `docs/ux/content/`. It uses glossary terms only, and no engine words
  ("chunk", "extraction", "release").
- **C2** Loading, empty, error, permission-denied and slow-network states exist for every data
  region (§7, §8).
- **C3** A write that has a consequence goes through a consequence panel in place (§5), never a
  modal, with the impact (§11) before the verb.
- **C4** Auth gates, API contracts and backend files are unchanged (`npm run api:check` passes).

**Engineering:**

- **D1** `npm run lint`, `typecheck`, `test`, `api:check` and `build` are green.
- **D2** The bundle budget holds: the main chunk is at most 990.87 kB (`npm run budget`).
- **D3** Legacy CSS the area no longer uses is removed in the area's merge commit, along with
  its selectors from the shared files.
- **D4** The visual spec has screenshots for the area's routes at 1280 and 1920, in light and
  dark (`frontend/e2e/visual.spec.ts`, `REDESIGNED_ROUTES`).
- **D5** The Impeccable critique of the area on the live seeded stack scores **≥ 30/40**, with
  H7 (accelerators) and H10 (help) at 3 or more each.

## The plan template

Each plan has the same sections:

1. Goal
2. Routes
3. Files
4. Prototype reference
5. Archetype and components
6. States
7. Interaction
8. Content
9. Backlog items
10. Acceptance criteria (area-specific)
11. Out of scope
12. Risks
