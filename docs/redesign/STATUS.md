# Redesign status — knowledge portal, e& calm

| | |
|---|---|
| Integration branch | `feat/kb-redesign`, from `main` @ `b6114b9` |
| Current phase | **8: Build by area.** Area 1 (Shell + Your work) approved and merged; next is area 2 (Library) |
| Last updated | 2026-10-08 |

## Phase log

| Phase | State | Artefacts |
|---|---|---|
| 0: Branch, permissions, discovery, baseline | **Approved 2026-10-08** | `00-discovery.md`, `01-baseline.md`, `before/`, `tools/capture-routes.mjs`, `docs/design-history/timetable-book-DESIGN.md`, CLAUDE.md § Redesign epic |
| 1: Discover | **Approved 2026-10-08** (GATE 1a: assumption mode; GATE 1b approved) | `docs/ux/research/01-heuristic-review.md`, `synthesis.md` (HYPOTHESIS), `product-md-proposal.md`, `docs/ux/research/plan.md`, `docs/ux/testing/benchmark-template.csv`, `docs/ux/research/raw/README.md`, `.impeccable/critique/*` |
| 2: Define | **Approved 2026-10-08** (GATE 2a approved; GATE 2b = assumption mode) | `docs/ux/journeys/` (5 journeys + service blueprint), `docs/ux/ia/` (object model, navigation + archetypes, route map, tree-test kit), `docs/ux/interaction/model.md`, `docs/ux/content/` (voice and tone, microcopy, glossary) |
| 3: Develop (wireframes) | **Approved 2026-10-08** (GATE 3 = assumption mode; round 1 not run) | `frontend/src/design-lab/wireframes/` (dev-only lab), `docs/ux/journeys/cognitive-walkthrough.md`, `docs/ux/testing/round-1/` (kit, data sheet, 10 reference captures) |
| 4: Visual direction | **Approved 2026-10-08**: A + C's split pane; Archivo + Noto Sans Arabic | `docs/redesign/02-directions.md`, `docs/redesign/directions/` (48 captures), `frontend/src/design-lab/wireframes/directions.css`, Direction/Theme switch in the lab |
| 5: Design system | **Approved 2026-10-08** | `frontend/src/design/` (tokens, 28 components, hooks; 159 tests), the dev-only gallery `/knowledge/design-system`, `docs/design-system.md`, new `DESIGN.md` + `.impeccable/design.json` (old sidecar archived) |
| 6: Hi-fi + round 2 | **Approved 2026-10-08** (GATE 6 = assumption mode; round 2 and the manual a11y kit not run) | `frontend/src/design-lab/prototype/` (dev-only `/knowledge/design-lab/prototype`), `docs/ux/testing/a11y-manual.md` + `a11y-results.csv`, `docs/ux/testing/round-2/` (kit, data sheet, 33 captures) |
| 7: Layer 2/3 install | **Done 2026-10-08** | `docs/redesign/plans/` (README + 10 area plans), `.claude/skills/redesign-area/SKILL.md`, vitest-axe in the component tests (`src/test/axe.ts`), `frontend/e2e/` (Playwright + axe ratchet, visual spec), `scripts/brand-lint.mjs`, `scripts/bundle-budget.mjs`, CI `e2e` job |
| 8: Build by area | Area 1 **approved 2026-10-08** (GATE 8.1); areas 2–10 to come | `docs/redesign/areas/01-shell-home/` (before/after captures) |
| 9: Validate and close | Not started | |

## Decisions

| Date | Decision | Source |
|---|---|---|
| 2026-10-07 | The epic runs on `feat/kb-redesign`. Areas run on `feat/kb-redesign/<area>`. | User brief |
| 2026-10-08 | **Area branches are `feat/kb-redesign-<area>`**, not `feat/kb-redesign/<area>`: git can't create `refs/heads/feat/kb-redesign/…` while the branch `feat/kb-redesign` exists. The skill text keeps the brief's wording; the plans and CLAUDE.md say the real name. | git |
| 2026-10-07 | `.claude/settings.local.json` is created and git-ignored (`.gitignore`). | User brief |
| 2026-10-07 | The baseline runs on launch configs `redesign-api` :8110 and `redesign-web` :5184. Ports :8100 and :5174 are held by another session's servers. | Port conflict observed |
| 2026-10-07 | "Before" screenshots are JPEG q80, not PNG. The first PNG capture was 30 MB. | Repository weight |
| 2026-10-07 | `DESIGN.md` is archived as a copy. The original stays in place and governs what ships until Phase 5 replaces it. | User brief ("delete nothing"), CLAUDE.md |
| 2026-10-08 | There are no official e& guidelines or font files. Use the brief's primitives (unverified) and self-hosted `@fontsource` fonts with Arabic. | User answer |
| 2026-10-08 | The earlier e& revamp is **superseded in full**: branch `feat/ui-revamp-eand-theme` and the mock-up in `knowledge-portal-design-concept/`. Neither its visuals nor its IA count as evidence. The epic starts from `main` and this brief. The branch and its worktree are left untouched. | User answer |
| 2026-10-08 | **GATE 0 approved.** Screenshots stay in git. The Phase 1 critique covers historic records, catalogue evidence and requirement-knowledge rows as empty states only, with no fixtures. The timezone test is fixed in a separate session. | User |
| 2026-10-08 | **GATE 1a: assumption mode.** No user research will be run now. The synthesis, personas, top tasks and targets are **HYPOTHESIS**, built from expert review and PRODUCT.md. The baseline metrics for success rate, SEQ and SUS stay unmeasured. | User |
| 2026-10-08 | **Priority weighting: calm + accessible first**, ahead of trustworthy review and queue-over-report. It covers red as status, consistent help, focus, screen-reader key collisions and zoom chrome. | User |
| 2026-10-08 | **The Timetable Book's structure is not inherited.** That covers its sentence grammar, in-place rows and decision-on-the-row. The structure starts fresh, and the old grammar is evidence and anti-reference only. PRODUCT.md principles, such as consequence before commit, still bind as requirements; their old *form* does not. | User |
| 2026-10-08 | **GATE 1b approved.** The synthesis and targets (HYPOTHESIS) are accepted, and the three PRODUCT.md additions are applied: Success Signals, a personas link, and the e& calm brand line. | User |
| 2026-10-08 | **IA (HYPOTHESIS):** 5 primary areas (Your work · Library · Catalogue · Ownership · Requirements) plus Explorer; utilities (Jobs, Help, Account) on every page; a draft is a 5-step workspace; current URLs are kept with 10 redirect patterns; `/explorer` and `/library/:id` are unchanged. | Phase 2 proposal |
| 2026-10-08 | **Undo** for suggestion decisions is a client-side delayed commit (6 s, HYPOTHESIS), because the API has no reopen (BG3). Seven backend gaps (BG1–BG7) are recorded as dependencies, never assumed. | Contract constraint |
| 2026-10-08 | **GATE 2a approved; GATE 2b = assumption mode.** The tree test is not run, and the IA stays HYPOTHESIS. Its riskiest labels move into the round-1 tasks: "Decide", "Re-confirmation", "Ownership", "Cited by", and Jobs as a utility. | User |
| 2026-10-08 | **Permissions fix (user-authorised):** the deny rule `Edit(./src/**)` also matched `frontend/src`. It is changed to `Edit(/src/knowledge_portal/**)`, so the backend stays protected and the frontend is editable. | User answer |
| 2026-10-08 | **The wireframe lab** is dev-only at `/knowledge/design-lab/wireframes`. Reads are real and seeded; every write is simulated client-side; a Scenario control forces failure paths. Verified absent from the production bundle (main chunk 900.80 kB vs 900.79 kB baseline; CSS identical). | Phase 3 brief |
| 2026-10-08 | Round 1 adds tasks **T10 (Jobs)** and **T11 (Re-confirmation)** plus a label-comprehension probe, because GATE 2b ran in assumption mode. | Phase 3 |
| 2026-10-08 | **GATE 3: assumption mode.** Round 1 was not run. The wireframe structure goes into visual direction unvalidated by users and stays HYPOTHESIS. Open items O-1 to O-7 carry forward. | User |
| 2026-10-08 | Three directions are laid over the same wireframes: **A** Timetable, evolved (Archivo + Noto Sans Arabic); **B** Quiet desk (Source Sans 3 + Noto Sans Arabic); **C** Bilingual workbench (IBM Plex Sans + Plex Sans Arabic + Plex Mono). The candidate fonts are devDependencies, lab-only until GATE 4. | Phase 4 |
| 2026-10-08 | **Recommendation: A, plus C's split-pane review desk.** The type pairing (Archivo/Noto vs Plex) is left open for the user. | 02-directions.md §6 |
| 2026-10-08 | **GATE 4: the recommendation is adopted.** Direction **A "Timetable, evolved"**, plus **C's split-pane review desk** at ≥ 1200 px. Type pairing: **Archivo Variable + Noto Sans Arabic Variable**, for continuity and the condensed numerals. B and C are not carried forward; Source Sans 3 and the IBM Plex packages are removed in Phase 5. `/impeccable live` was declined. | User ("do as per your recommendation") |
| 2026-10-08 | **Design system: "The Calm Ledger".** Three token layers (primitive, semantic, component), re-declared per theme and density scope. 28 components in 7 families. A 92-check token contract (contrast in both themes, layering, red never a state). The dark masthead is deepened to #4a1b26 so the red logo reaches 4.27:1. | Phase 5 |
| 2026-10-08 | Calm rules override the ui-ux-pro-max defaults: no colour transitions, and an unavailable control is an outline with its reason, never faded. | Conflict order |
| 2026-10-08 | The two tallest document-review captures (13k and 17k px) are clipped to the first 4,000 px. All "before" captures total 16 MB. | Repository weight |
| 2026-10-08 | **GATE 5 approved.** | User |
| 2026-10-08 | **The hi-fi prototype is a second dev-only lab**, `/knowledge/design-lab/prototype`, built only from `frontend/src/design` over the wireframe lab's seeded reads, simulated writes and Scenario switch (the lab's base path moved into its context). The greyscale wireframes stay as the round-1 artefact until Phase 9 removes `/design-lab`. Absent from dist (main chunk 900.82 kB). | Phase 6 |
| 2026-10-08 | **Design-system changes found by building the journeys** (all with tests): `DataTable` `onRowKey` (widget letter keys, grid only, never with modifiers); `StickyFooter`; an `AppShell` `panel` slot for Jobs, Help and Account; `AppShell` focuses a loading page's h1 when it arrives and lets a `#target` page keep its own focus; `Combobox` `search`; `JobTray` and `ProvenanceTrail` take a router `link`; `ImpactPanel` keeps focus on its title while checking; `Suggested` keeps its icon beside its words; forced-colours states for the rail marker, current tab, current row, pressed filter and combobox option (they were drawn by shadows or tints only). | Phase 6 |
| 2026-10-08 | **A wireframe bug, fixed in the prototype only:** after a save, the review desk still said "Save your review before approving", because unsaved changes were counted against the read version rather than the last save. The wireframe lab is left as tested. | Phase 6 |
| 2026-10-08 | **Round 2 T12 uses 'Customer care handbook (sample)'** (800 prose passages). The other documents waiting for review have 1 to 4 passages. | Seed check |
| 2026-10-08 | Round 2 keeps T1–T11, the criteria, the times and the metrics of round 1 and the benchmark unchanged. It adds T12 (a 20-minute review, always last) and three questions (Q1 calm 1–7, Q2 fatigue 1–5 = the plan's scale, Q3 colour read as alarm). | Phase 6 brief |
| 2026-10-08 | **GATE 6: assumption mode.** Round 2 and the manual a11y kit are not run. Every user metric stays **not measured**, never "met". The prototype's UX goes into Phase 7 plans validated by expert review and measurement only, and stays HYPOTHESIS. The kits stay ready for Phase 9 (or any earlier run). | User |
| 2026-10-08 | O-1 to O-7 and K1–K6 move to `docs/redesign/backlog.md`, each with an owner area. | Phase 7 |
| 2026-10-08 | **Area plans** are written from the prototype as approved at GATE 6 (expert-validated only). Each plan is approved when its area is invoked. Areas 4 and 5 are only partly prototyped, and Impeccable resolves those gaps. | Phase 7 |
| 2026-10-08 | **The token clash found while planning** blocks area 1's first commit. Legacy `styles/tokens.css` and the new layer both declare `--focus-ring`, `--gutter`, `--page-max` and `--rule-heavy` (a colour vs a width). The legacy four are renamed `--tt-*` before `./design` is imported app-wide. | Plan 01 |
| 2026-10-08 | **Component a11y:** every test in the design-system component files runs axe on what it rendered (`checkAxeAfterEach`). Contrast is off in jsdom (the token contract covers it) and so is "region" (components are rendered alone). A deliberate `image-alt` probe confirmed the hook fails. | Phase 7 |
| 2026-10-08 | **Route a11y ratchet:** 33 routes of the production build on the seeded fake stack, with tags wcag2a/aa, wcag21a/aa and wcag22aa; serious or critical issues block. Baseline: only `library-review` and `library-document` carry one rule (`aria-conditional-attr`). Redesigned routes get no allowance. Each run checks that the page is signed in (not the boot screen). | Phase 7 |
| 2026-10-08 | **Visual baselines are per platform** (`{platform}` in the snapshot path). Edge on Windows and Chromium on Linux render text differently, so CI's Linux baselines are committed from the CI artefact at each area's gate. | Phase 7 |
| 2026-10-08 | **Brand lint** allows raw colours only in `src/design/tokens/primitive.css` and the legacy `src/styles/tokens.css`; it allows `--eand-*` only in the primitive and semantic layers. The ratchet allows 8 legacy colours, in `src/explorer/document/overview.ts` (the Word export palette). The Phase 3–4 wireframe lab is exempt in full: frozen as tested, removed in Phase 9. | Phase 7 |
| 2026-10-08 | **Bundle budget:** the entry chunk is at most 990.87 kB (900.79 × 1.1), checked from `dist/index.html`. It is 900.83 kB today. | Phase 7 |
| 2026-10-08 | **CI:** every existing step is kept. The frontend job adds the brand lint and the budget. A new `e2e` job runs the API (`uv`, fake env), seeds it, builds, and runs Playwright with Chromium, uploading the report on failure. The pinned `upload-artifact` SHA was checked against tag v4.6.2. | Phase 7 |
| 2026-10-08 | **Area 1, the legacy island.** An unmigrated page renders inside the new shell in `.ds-legacy`. The design system's base element rules skip it (`:where(:not(.ds-legacy *))`, specificity unchanged). The island restores the Timetable Book's body typography and its own scroll padding for pinned bars. On a legacy route the whole frame is light (`data-theme="light"`); dark mode applies on rebuilt routes only until Phase 9. Two reviewers judged a dark frame around a light page worse. | Area 1 reviews |
| 2026-10-08 | **Area 1 IA choices.** "Re-confirmations" sits in the rail's secondary group (plan 06: always reachable). The Gaps backlog is listed with its true number but kept out of the "need you" count, so the count can reach zero (critique P1). Your work's actions are plain tab stops, not a roving list, per the accessibility reviewers (a roving `<ul>` hides most actions from Tab). | Area 1 reviews and critique |
| 2026-10-08 | **Route-change focus for legacy pages.** `AppShell` focuses the design-system h1, or else a legacy page's first h1 (it waits for it to load). Focus a legacy page placed itself, or a `#target`, is kept. | Area 1 |
| 2026-10-08 | **GATE 8.1 approved.** Chrome share is measured by height (6%). The critique stands at 27–28/40, with acting from the queue deferred to area 2 and a re-critique after it. Queues use one tab stop per item (interaction model §2.2 amended). | User |

## Brand source

- **The user's answer (2026-10-08):** neither official e& brand guidelines nor licensed
  typeface files are available.
  - Use the brief's primitive values. Record them as "the redesign brief, unverified against
    official guidelines" in DESIGN.md.
  - Pick a calm, self-hosted `@fontsource` pairing with Arabic coverage.
  - This matches the 2026-10-06 note that there is no e& font licence.
- **Working primitives (the brief's values, unverified against official guidelines):**

  | Primitive | Value |
  |---|---|
  | red | `#E00800` |
  | maroon | `#4B0F1E` |
  | grey | `#636363` |
  | beige | `#E6E6DC` |
  | white | `#FFFFFF` |

## Scores and metrics

| Measure | Baseline | Round 1 | Round 2 | Final | Target |
|---|---|---|---|---|---|
| Main JS chunk (min) | 900.79 kB | | 900.82 kB (prototype excluded) · budget script 900.83 kB (Phase 7) | | ≤ 990.87 kB |
| Main JS chunk (gzip) | 241.51 kB | | | | — |
| CSS (min / gzip) | 58.99 / 10.88 kB | | | | — |
| Frontend tests | 265 pass / 1 fail (TZ) | 280 pass / 2 fail: the TZ failure plus one load-timing flake that varies by run and passes alone; separate task offered | | | all pass |
| Direction critique (A · B · C), applicable max | 20/28 · 23/32 · 17/24 (all ≈ 71–72%, Good), taken before fixes | | | | |
| Maroon / red share (review desk, 1280, light) | A ≈ 6.8% / 0.1% · B ≈ 13% / 0.1% · C ≈ 1% / 0.1% | | | | maroon ~8–10%, red ≤ 2% |
| Impeccable critique /40 (Home · Library · Cat. browse · Explorer · Curation · Req. knowledge · Squads) | 23 · **19** · 25 · 20 · 25 · 26 · 25 (mean 23.3, Acceptable) | | | | |
| Task success / SEQ / SUS | — (Phase 1 benchmark, user-run) | | | | set in Phase 1b |
| Review desk rows visible (compact, 1440×900) | ~2 (heuristic review) | | **15** (prototype, measured) | | ≥ 10 |
| Chrome share of the viewport, review desk (masthead + table head + save bar) | — | | **14%** at 1440×900 · **22%** at 1280×800 (the save bar wraps to two lines) | | ≤ 15% at 1280×800 |
| Design and lab tests | 159 (design 143 + wireframes 16) | | **181 pass, 0 fail**: design 147 (components 55, tokens 92), wireframes 16, prototype 18 | | all pass |
| Perceived calm / fatigue after 20 min | — | | not measured yet (round 2, user-run) | | median fatigue ≤ 2 / 5 |

## Open questions (GATE 0)

Answered on 2026-10-08:

- Brand source: no guidelines and no fonts.
- The prior revamp: superseded in full.

Still open:

1. **Screenshots in git.** 106 JPEGs (16 MB) in `docs/redesign/before/` are committed, and later
   phases add more. Keep them in git, or move them to an ignored folder or an artifact store?
2. **The timezone-dependent test failure:** fix it separately (a task chip has been offered) or
   inside the epic?
3. **Phase 1 critique coverage.** Historic records, catalogue evidence and requirement-knowledge
   rows have no seeded data offline. Critique their empty states only, or add test fixtures?
   Fixtures would be frontend-only, because backend files are out of bounds.

## Open wireframe items (from the cognitive walkthrough)

O-1 to O-7 are listed in `docs/ux/journeys/cognitive-walkthrough.md`. They move to
`docs/redesign/backlog.md` in Phase 7.

## Known stale artefacts

- `.impeccable/surfaces/*.md` still carry Timetable Book direction contracts. They are refreshed
  in Phase 9 (`impeccable document` and surfaces), or per area in Phase 8.
- The missing favicon logs a 404 on every page. This predates the redesign.

## GATE 6 comparison (assumption mode, 2026-10-08)

Round 2 and the manual kit were not run, so this compares the prototype against the targets
(`docs/ux/research/synthesis.md` §8) using only what can be measured without users. There is no
baseline to compare against: the Phase 1 benchmark was not run either.

| Target | Value | Prototype | How measured |
|---|---|---|---|
| Task success, SEQ, SUS, time on task | ≥ 90%, ≥ 5.5, ≥ 75, −30% | **Not measured** | Needs round 2 or the final benchmark |
| Fatigue after 20 min | median ≤ 2 / 5 | **Not measured** | Round 2 T12 + Q2 |
| Red for status, alerts, errors or diff | 0 | **0 seen**; red is at most 0.06% of a view (logo + rail marker) | Pixel share on 8 captures, both themes; review of 33 captures |
| Maroon share | ~8–10% | **4–6%** (K6, read as within the calm intent) | Same pixel method (approximate, JPEG) |
| Status as icon + text | 100% | 100% by construction (`Status` renders both) | Component tests |
| Text contrast | ≥ 4.5:1 / ≥ 3:1, both themes | Met for the 44 token pairs | `tokens.test.ts` |
| Focus after a route change | 100% of routes | Met on the routes walked, including loading pages (fixed in Phase 6) | Browser walk + component test; Playwright in Phase 7 |
| Focus return on panel close | 100% | Met for Help, Jobs, Account, consequence panels and give forms | Component + prototype tests, browser walk |
| Disabled with reason | 0 native `disabled` where a reason exists | Met in the prototype (`Button unavailableReason`) | Code review |
| Consistent help | the same place on every page | Met (masthead utilities, the same 4 parts) | Prototype test |
| Passage review, rows visible | ≥ 10 at 1440×900 | **15** | Measured |
| Chrome share | ≤ 15% | **14%** at 1440 · **22%** at 1280 (K1) | Measured |
| axe serious or critical | 0 | Not yet run | Phase 7 suite |
| Reflow 400%, target size, NVDA key collisions | as specified | **Not measured** (the manual kit wasn't run); built to the spec | The manual kit (kept for Phase 9) |
| Bundle | ≤ 990.87 kB | 900.82 kB | Build |
| axe serious/critical (legacy routes) | ratchet, shrinking to 0 | 2 of 33 routes, 1 rule (`aria-conditional-attr`) | Phase 7 e2e |

**Remaining issues** are O-1 to O-7 and K1–K6, now in `docs/redesign/backlog.md`. Each has an
owner area, and the Phase 7 plans carry them as acceptance criteria.

**Plans updated:** the Phase 7 area plans are written from the prototype as validated by expert
review only. Every user-facing claim in them stays HYPOTHESIS until a benchmark runs.

## Quality gates (Phase 7)

| Gate | Command | Where |
|---|---|---|
| Component a11y | `npm test` (axe after every design-system component test) | `src/test/axe.ts` |
| Route a11y + visual | `npm run build && npm run e2e`, with `E2E_CHANNEL=msedge` locally; refresh the baseline with `A11Y_UPDATE_BASELINE=1 npx playwright test a11y --workers=1` | `frontend/e2e/` |
| Brand | `npm run lint:brand` (`--update` rewrites the legacy list; counts may only fall) | `scripts/brand-lint.mjs` |
| Bundle | `npm run budget`, after a build | `scripts/bundle-budget.mjs` |
| CI | the `frontend` job (+ brand, budget) and the `e2e` job | `.github/workflows/ci.yml` |

**Unit suite:** 445 pass, 2 fail. The two failures are the pre-existing timezone test
(ExplorerPage) and the load flake (tracking, which passes alone). Both are being fixed in
separate sessions.

## Area 1: approved at GATE 8.1 (Shell, navigation, Jobs, Help + Your work)

| Criterion | Result |
|---|---|
| A1 axe on routes | 33/33 pass; `home` with no allowance; the baseline is unchanged (2 legacy routes, 1 rule) |
| A2 component axe | Shell, Your work and panels: axe after every test (Shell.test.tsx) |
| A3 focus to h1 on route change | e2e `shell.spec.ts`: rebuilt and legacy pages |
| A4 focus return | Panels: Esc and close return focus to the button pressed last (unit) |
| 1.1 rail count = queue | Unit (gaps excluded from both, by design) |
| 1.2 skip link first | e2e on every route |
| 1.3 utilities the same on every route | e2e on every route |
| 1.4 chrome ≤ 15% at 1280×800 | **6% of the height.** Pass: the user chose to measure vertically and keep the labelled rail (21% by area) |
| 1.5 legacy pages look unchanged | Captured; the island keeps the old look; the frame is light |
| 1.6 no write on load | Unit |
| D1 lint, types, tests, api:check, build | Green, except the 2 known unrelated unit failures (timezone; tracking load flake) |
| D2 budget | 938.17 kB (+4.15%; limit 990.87) |
| B1 brand lint | Pass |
| D4 visual | `home` 1280/1920 light/dark baselines (win32) |
| D5 critique ≥ 30/40 | **28 → 27 → 27/40** over three independent runs (baseline 23); the ledger queue is built. The user chose a bounded last batch without another re-score; the remaining gap is in the backlog (acting from the queue, area 2) |

## Next exact action

**Phase 8, area 2: Library: IN PROGRESS (handoff to a cloud session, 2026-10-08).**

- **Branch:** `feat/kb-redesign-library`, pushed to `origin`. Its parent commit is `feat/kb-redesign` @ `5727806`: area 1 merged; that branch is local only, so recreate it with `git branch feat/kb-redesign 5727806` if it is needed. The top commit is a **WIP** commit of the whole of area 2 and has **not** passed GATE 8.2. The user asked for it to be committed and pushed so work can continue in the cloud.
- **Done:**
  - Pipeline steps 1–5: craft, harden, clarify, adapt, quieter.
  - The four reviewers ran (step 6).
  - Most CRITICAL/HIGH findings are fixed in this commit:
    - the sticky pane scrolls;
    - nothing sticks at 400% zoom;
    - the sticky table head is measured;
    - live regions stay mounted;
    - the in-app leave guard;
    - the honest Return-to-service copy;
    - no false "Cited by: unknown" fact;
    - Discard through a consequence panel;
    - indexing jobs come from publications;
    - the desk is memoized;
    - the filter and find are in the URL;
    - the current row is always rendered;
    - the Shift+↑/↓ lost update;
    - `<bdi>` names in panels.
- **Resume here:**
  1. **5 unit tests fail after the review fixes**: `cd frontend && npx vitest run src/library`. They are copy and label changes to adapt in the tests:
     - "Discard it…" is now a consequence panel;
     - "Exclude 2 passages…";
     - "requirements you can see cite it now";
     - the activation panel uses CitingNow;
     - requirement links now carry "↗ (opens Requirement AI)".
  2. **Log the MEDIUM/LOW review findings** that aren't fixed in `docs/redesign/backlog.md` (Area 2 rows). Among them:
     - Jobs polls the whole list (needs a lighter endpoint, BG1);
     - upload runs files one at a time;
     - the Back button isn't guarded (no data router);
     - "Flagged" uses the held (shield) icon;
     - the 1280 table is squeezed with Jobs open (now scrolls via container queries; re-check);
     - the reading line has no elapsed time on the record;
     - `DocumentContext` is drilled through `Outlet` rather than a provider;
     - YourWork effect dependencies (area 1).
  3. **Verify:**
     - `npm run lint && npm run typecheck && npm test && npm run api:check && npm run build && npm run budget && npm run lint:brand`
     - then `E2E_CHANNEL=msedge npm run e2e` (drop the channel on Linux).
     - The seeder can time out under load; seed the API on 8130 first, then rerun.
     - Update the visual baselines for the library routes and `home` (its Your work table gained "Next step"): `npx playwright test visual --update-snapshots`.
     - Re-measure 2.1 (it was 14.4% at 1280×800 before the review fixes).
  4. **Re-capture:** `docs/redesign/areas/02-library/after-*.jpg` with `docs/redesign/tools/area-02/after.mjs` (copy it under `frontend/node_modules/.cache/` to run; `KP_API` is the seeded API).
  5. **Critique:** dual `/impeccable:impeccable critique` of the Library on the live seeded stack, and a re-critique of Your work (target ≥ 30/40; it was 27–28).
  6. **Report** in AGENTS.md §20 format, then stop at **GATE 8.2**. After "approved", per the brief: merge into `feat/kb-redesign` with `--no-ff`, remove unused `styles/library.css` selectors, and update STATUS.
- **Measured so far:**
  - Main chunk 888.79 kB (the library is lazy-loaded);
  - a11y 34/34 routes with an empty baseline;
  - 2.2 (T2, keyboard only) passes in e2e;
  - forced colours captured (`after-forced-1440-review-desk.jpg`).
- **Decisions (record them at the gate):**
  - Return to service re-approves the last approved review: the API has no return endpoint and records no reason.
  - K2 `lang` is a script heuristic (HYPOTHESIS), because documents have no language field.
  - `#passage-…` focuses the passage on the desk, or in "Passages in service" on the Overview.
  - The T2 e2e runs last on its own uploaded copy (Playwright project "journeys").
