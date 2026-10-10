# Redesign status — knowledge portal, e& calm

| | |
|---|---|
| Integration branch | **`feat/kb-redesign-architecture`** (since 2026-10-09; on `origin`). It contains everything on `feat/kb-redesign` (from `main` @ `b6114b9`), which is no longer merged into. |
| Current phase | **8, re-scoped to the Catalogue only (2026-10-09).** Areas 1 and 2 approved and merged; the catalogue is rebuilt and wired to the API, and has **mock-ups in the chosen direction** (Layered Architecture Poster, calm rules relaxed) awaiting the user's review |
| Last updated | 2026-10-09 |

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
| 8: Build by area | Area 1 **approved 2026-10-08** (GATE 8.1); area 2 **approved 2026-10-09** (GATE 8.2); areas 3–10 to come | `docs/redesign/areas/01-shell-home/`, `docs/redesign/areas/02-library/` (before/after captures, report) |
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
| 2026-10-09 | **GATE 8.2 approved.** Library rebuilt (area 2). Decisions: Return to service re-approves the last published review (no API endpoint, no reason recorded; said in the panel); K2 `lang` is a script heuristic (HYPOTHESIS); `#passage-…` focuses the passage (no path form); **"seen" means a passage stayed current for about 0.6 s** (passing through doesn't count); the desk was made denser before the merge (one-line keys, progress and file note on one row, the location select behind a button). Critique: Library 28 → 30/40, Your work 27/28 → 31/40. | User |
| 2026-10-09 | **Re-scope (user):** Catalogue only; everything else on hold. The catalogue is rebuilt **from scratch**, using only the Business Pro Plus SDD (v2.3) and the SMB architecture reference (v1.0). The old catalogue content, pages and the HTML explorer are not sources. Business Pro Plus first; the model is generic for any telecom product. Curators edit; every signed-in user reads (Explorer, later). Additive backend/API changes approved. | User |
| 2026-10-09 | **Cleanup:** `scripts/seed_demo.py` no longer seeds catalogue content (no sample versions, draft or sample requirements). The backend's built-in "Initial catalogue" (`smb_architecture.yaml`, Requirement AI's matching knowledge) is left until the user decides how to replace it. | User |
| 2026-10-09 | **Integration branch is `feat/kb-redesign-architecture`.** Every finished piece of work merges into it (not `main`, not `feat/kb-redesign`). Pushed to `origin`; `feat/kb-redesign` merged into it (no file changes). | User |
| 2026-10-09 | **The catalogue's first build is judged not good enough visually:** plain dropdowns, diagrams below the fold, tables and boxes instead of visualisation. Cause: the catalogue skipped Phases 3–6 (no wireframes, directions or prototype of its own), the three design plugins were used only as review checklists, and the effort went into the data model and API. | User feedback |
| 2026-10-09 | **The e& calm rules are relaxed for the catalogue** (more colour, richer diagrams, motion allowed), and **mock-ups come before more building**. Conflict order: this is user evidence and outranks the calm rules. If adopted at the gate, DESIGN.md is rewritten from the built world. | User |
| 2026-10-09 | **Catalogue IA:** the Landscape becomes a TAM **hero page** with no product bar (the architecture itself, attractive and visual); each **product page** gets an **Architecture tab** with the same map, its journey's systems highlighted; **Products** becomes a main section (the offering page, customer value included, existed but had no navigation to it). Mock-ups cover four screens: Landscape hero, Product, Product › Architecture, Journey flow. | User |
| 2026-10-09 | **Catalogue palette: e& branding colours in calm mode.** The poster's notation tints (yellow, blue, green, lilac) are replaced by soft tones of the e& family only (beige, red blush, stone, sand, maroon mist, light grey) with a deeper 2px top edge per layer, and an e& maroon integration spine; red stays the one focal accent. No official e& palette was found publicly, so the values derive from the brief's primitives (unverified). | User |
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

## Area 2: approved at GATE 8.2 (Library + Your work remedies + Jobs Retry/Stop)

Built on `feat/kb-redesign-library` (a WIP commit `f06c721` was pushed to `origin` at the user's request
on 2026-10-08 for a cloud handoff) and merged into `feat/kb-redesign` with `--no-ff` after the gate.
Report: `docs/redesign/areas/02-library/README.md`.

| Criterion | Result |
|---|---|
| A1 axe on routes | 34/34 routes pass; the 8 library routes (incl. new `/cited-by`) are in `REDESIGNED` with no allowance; `a11y-baseline.json` is now `{}` |
| A2 component axe | Every new/changed design-system test and the library/desk tests run axe (`checkAxeAfterEach`) |
| A3 focus to h1 | e2e: document tabs; rail links (incl. lazily loaded pages: `AppShell` now focuses the arriving h1 while focus is still on the link pressed) |
| A4 focus return | Consequence panels, Help "All shortcuts", re-confirm, act as admin, leave dialog (unit + e2e 2.3) |
| A5 focus never hidden | Pane scrolls inside its sticky box; table head measured (`--sticky-head`); nothing sticks at 400% zoom; desk drawer overlays (2.4.11 AA holds; see backlog LOW) |
| 2.1 rows / chrome | **15 rows** at 1440×900, 13 at 1280×800 (scrolled); chrome by height **13.3%** (1440×900) and **14.9%** (1280×800); save bar on one line (e2e). On arrival the grid starts at 361 px (was ~430): 10 rows at 1440×900, 8 at 1280×800 |
| 2.2 keyboard-only T2 | Pass (e2e, Playwright project "journeys", on its own uploaded copy) |
| 2.3 withdraw order | Pass (e2e: who cites it, or "unknown, not zero", before the verb) |
| 2.4 search → passage | Pass (e2e: focus on the passage; desk or "Passages in service") |
| 2.5 save then approve | Pass (unit: Approve available after save; unsaved counted against the last save) |
| 2.6 forced colours | Captured: `after-forced-1440-review-desk.jpg` (current row frame, selected rows dashed + checked, pressed filter underlined) |
| B1 brand lint | Pass |
| D1 gates | lint, typecheck, api:check, build green; unit 494 pass, 2 known unrelated (Explorer timezone; tracking load flake, passes alone) |
| D2 budget | **893.45 kB** (−0.81% vs baseline; the library is lazy-loaded) |
| D4 visual | Baselines (win32) for `home` and 8 library routes × 1280/1920 × light/dark; the desk is view-only (200 rows) |
| D5 critique | Library **28 → 30/40**; Your work **27/28 → 31/40** (H7 = 3, H10 = 3 on both); detector 0 findings |

## Architecture catalogue (re-scope, 2026-10-09)

Plan: `docs/redesign/plans/03-architecture-catalogue.md` (replaces plans 03 and 04).
Branch: `feat/kb-redesign-architecture`.

**What was done on 2026-10-09** (all on `feat/kb-redesign-architecture`, pushed):

| Commit | What |
|---|---|
| `b67ed65` | The catalogue rebuilt from scratch in the frontend, from the two sources only (WIP, before its gate) |
| `ccbabd6` | Review fixes from vercel-ui-guidelines and ui-ux-pro-max: focus never hidden by the drawer (2.4.11), heading order, filters in the address, undoable portfolio removal, unsaved-changes warning, `translate="no"` on codes |
| `8f18c41` | Backend and API (additive): portfolio with levels as data, plans as named characteristics, business rules, step performers (team or customer), point of no return, integrations with calling, called and intermediate systems, purpose, style and TMF equivalent; system owner, external flag, roadmap, evidence, moved placements. `catalogues/smb-architecture.yaml` is seeded into a draft that is never activated, so requirement mapping keeps the built-in knowledge |
| `86c3c58` | Legacy catalogue code builds the new required fields |
| `8ddf97f` | The screens read the version chosen in the context bar from the API and save portfolio edits to the draft against its revision (a stale save is refused) |
| `5ae12ca` | Calls to a team or back to the channel reach that party's step; catalogue file and fixture regenerated |
| `325b5b0` | The approval day is formatted portably (`%-d` failed on Windows) |
| `789a2bb` | `ruff format` on `journeys.py` |

`scripts/seed_demo.py` now loads `catalogues/smb-architecture.yaml` into the draft "SMB architecture: Business Pro Plus" (this amends the morning's cleanup note).

**What exists (Business Pro Plus):**

- **Landscape:** the TAM map (7 domains + integration layer, 46 systems), an impact lens (product + order type + channel), a record drawer per system, 8 proposed placements with reasons.
- **Portfolio:** an editable Enterprise › Fixed › SMB › family › offering tree, saved to the draft.
- **Offering** (`/architecture/offerings/business-pro-plus`, reachable only from Portfolio or a journey): purpose, 6 customer values and 6 eligibility points with evidence; plans (prices are a gap); 11 rules; 9 components; an order type × channel matrix (19 order types); impact.
- **Journeys:** New activation (BCRM, B2B Web, SMB App), Up/downgrade, Order tracking (57 integrations in all). Each has a BPMN flow, an integration register, order tracking and a steps table; exports to BPMN 2.0 XML with DI, PlantUML, Mermaid and CSV.
- **Systems**, **Governance** (23 items) and **Versions**.

**Checks (2026-10-09, on `04fd310`):**

- Backend: `pytest`, `ruff check`, `ruff format --check`, `mypy src tests` and `lint-imports` pass on Windows.
- Frontend: lint, brand lint, `api:check`, build and budget pass (entry chunk 662.48 kB, −26% vs baseline).
- Frontend unit tests: **502 pass, 7 fail.** Six are in `src/library/ReviewDesk.test.tsx` and fail alone too (axe violations, a duplicated "Passages of version 1" grid, a hook timeout); the catalogue commits touch no Library or design-system code, so they come from elsewhere and are not yet diagnosed. One is `ExplorerPage.test.tsx` ("reads the offering's plans and prices…"), also not yet diagnosed. Not fixed in this round.

**User review (2026-10-09):** the base is right, but the UI looks like the old one: dropdowns, no visualisation, no innovation. See the decisions table for the cause and the response (calm rules relaxed, mock-ups first, the hero/product IA).

**Visual-direction round:** Impeccable `shape` with a direction roll (seed `b430c650`, operate mode, code-led). Five first-viewport sketches of the Landscape hero (real data, CWOM selected) were put on the decision page; they live in `.impeccable/mocks/decision/`, outside the frontend build. The page closed unanswered, so the choice was asked in chat. **User: "no dark theme, choose what impeccable recommends"** → **Layered Architecture Poster** (impeccable's pick, the only fully light direction). Direction contract: `.impeccable/surfaces/frontend-src-architecture-landscapepage-tsx.md`.

**Mock-ups built (dev-only lab, `/knowledge/design-lab/catalogue`, real seeded Business Pro Plus data, writes nothing):**

1. **Landscape hero:** the TAM poster (layer bands, 46 component boxes, 33 system-to-system links drawn as orthogonal lines), view chips instead of dropdowns, an inspector (busiest systems ranked; a picked system's partners, journeys and evidence), the products built on it as a band below.
2. **Product (Business Pro Plus):** a hero with the value proposition and the bundle drawn as what the customer gets (CPE device at the core, mandatory components, Backup 5G optional), 6 customer values with evidence, plans compared (prices shown as a gap), eligibility, purpose. Tabs: Overview · Plans · Business rules · Components · Journeys · **Architecture**.
3. **Product › Architecture:** journey and channel chips; the same poster with only the journey's systems lit and numbered in the order the order reaches them; a Previous/Next step-through of every call (the current call in e& red with an arrow, its interface, style, TMF equivalent and evidence beside it).
4. **Journey flow:** BPMN swimlanes tinted by each system's layer, numbered steps, zoom, a step panel with its calls; exports to BPMN 2.0, PlantUML, Mermaid and CSV.

Files: `frontend/src/design-lab/catalogue/` (lab, poster model and component, four screens, `lab.css`, 4 tests incl. axe), one dev-only route in `App.tsx`, and a brand-lint exemption for the lab folder (its palette moves into the token layers when the direction is approved). Checks: lint, brand lint, `api:check`, build and budget green (entry chunk 662.50 kB; the lab is absent from `dist`); the lab's 4 tests pass.

**Finish review (impeccable finish reviewer, 2 rounds):** round 1 → *fix* (8 material fixes: bundle as a drawing, no opacity dimming, whole names, no kickers, one red accent, no hero-metric strip, gutter/spine connector routing with reconciled wording, disabled and narrow-screen states). Round 2 verdict: 5 resolved, 3 partial, 2 regressions → *fix*. After round 2, fixed without another review: the covered "PRODUCT" band label, the Fortinet name overflowing its lit box, the phone bundle (a stacked list below 760 px), the phone masthead scrollbar. **Still open:** a selected system's links share the 10 px gutters, so its partners are found by their outline, not by following one line each (needs edge bundling or wider gutters); DESIGN.md not yet rewritten (by design, until the direction is approved).

**Deep review and rebuild (2026-10-09, user: "a lot of space and alignment incorrect"; decide without asking).** Four isolated reviews ran in parallel: impeccable critique (A: design review, B: detector + browser evidence), vercel-ui-guidelines and ui-ux-pro-max. Baseline **21/40** (snapshot `.impeccable/critique/2026-10-09T15-14-21Z__frontend-src-design-lab-catalogue.md`). Root causes found: a global `.product` rule (`styles/squads.css`) pushed the Product band into Customer; a fixed 1050px poster clipped at 1280 and on screen 3; no shared column grid, so columns zig-zagged and bands were 30–70% empty; a button reset (`.cl button { font: inherit }`) overrode every component's type. Fixed in one batch:
- Poster: fluid (measures its column), one 7-column grid shared by every layer, Service and Resource side by side, bands scoped (`cl-band--*`), integration layer in maroon mist; links shown for the selected system (or "All links"), routed through gutters with offsets and white casing, arrows on box edges; each box carries an integration-weight bar; one tab stop with arrow-key movement.
- New **Matrix** view (systems × systems in layer order, maroon ramp by calls); landscape inspector shows integration weight (makes / receives / carries) and, for a selected system, calls · linked · steps · journeys with partner bars.
- Product page on a 12-column grid: header and tabs fixed in place; bundle drawn in HTML as a bus; customer value 2×3; plans as a differences-first table with speed bars and one "price is a gap" row; eligibility beside it.
- Product › Architecture: one numbering (the current call's number on its line), past calls faint, footprint by layer, ← → shortcuts, the call list scrolls inside the aside.
- Journey flow: sticky lane names, a minimap you can click or drive by keyboard, Fit height, one Export menu, an "All steps" list; the page fits the window.
- Shell and a11y: section tabs on every screen, skip link, page titles, AA text everywhere (no faded counts), disabled states, focus rings never clipped, `:where()` base rules.
Checks: lab tests 6/6 (axe), lint, brand lint, typecheck, build, budget green; no horizontal overflow at 1280 or 1440. A fresh critique has not been re-run.

**Product and journey enhancements (2026-10-10, user's five points).**
1. **Hierarchy tab** in the product: the portfolio drawn as a tree, Enterprise (business unit) › Fixed (line of business) › SMB (segment) › Business internet bundles (product family) › Business Pro Plus (offering), branching into its 6 plans, 9 components and 3 journeys; crumbs link to it.
2. **Journey page inside the product** (Journeys tab, compact product header): the BPMN takes the full width and up to 820px of height; the step detail and a wrapping grid of all steps sit underneath (no side scroll); the export menu sits on the tab row.
3. **Plans, Business rules and Components are real tabs:** plan cards (speeds, CPE, access point, Backup 5G, price as a gap) plus the comparison; 11 rules filterable by kind (composition, fulfilment, dependency, lifecycle, billing); components grouped always-included / optional with codes and the systems that deliver them.
4. **Integrations tab per journey:** the call register (from → to, via, interface, style and mode, TM Forum equivalent, purpose, step, evidence), calls by style, and a filter by system.
5. **Overview:** one statement (what the product is for) replaces the description and the separate What it's for; customer value as single phrases; Who can buy it grouped into Who / Where / On what terms / Through which route beside a channel × order-type matrix (19 order types, 6 channels, modelled journeys tagged); plans at a glance.
Checks: lab tests 11/11 (axe), lint, brand lint, typecheck, build, budget green.

**Every order type now has a journey (2026-10-10, from SDD v2.3).** 17 journeys were added to `catalogues/smb-architecture.yaml`, so all 19 Business Pro Plus order types are modelled (20 journeys including order tracking). The new ones are migration, cessation, external shift, dunning, port in, port out, faulty device replacement, renewal and add/delete add-on, plus one journey each for the eight account changes (change internet username, password, domain, sub-domain and number; flexi minute movement; technician visit; modify subscription). Each step, call and rule carries its confidence and SDD section. An inference says what it is read from, and a gap names what the SDD leaves out. The conditions are modelled as decisions:
- **Backup 5G (with or without):** new activation (a check on the GSM sub-order, then base offer 6980 plus the bandwidth offer), migration, cessation (vEDA deactivation plus DeleteOffer for both offers), up/downgrade in four branches (kept: bandwidth offers swapped; added: as in activation; removed: as in cessation; absent: nothing), external shift (runPAM geo-lock reset), dunning (offer 854 at TOSS, removed at reconnect, accounts deleted on CESSNP) and port out. Source: Enhancement 1873844.
- **Contract (with or without commitment):** CPE rate plans per contract period (no contract, 1 year, 2 years), with an exit charge of AED 650 on cessation and on an up/downgrade that removes a CPE still under commitment (US 438909; the commitment test is inferred from the existing rules). Legacy migration keeps the existing contract-reset and exit-charge rules. Renewal moves the account to the non-commitment package at the end of the contract (ADO 420619). Faulty device replacement charges an added device AED 13,200 for a 90G or AED 18,000 for a 120G (US 438912).
- **Other branches:** the pending-order validation matrix as an accept/reject step on every lifecycle order. Cessation while an activation is in progress takes a cancel-first track. External shift splits by EID status (one or two work orders). Port in splits on where UCaaS is provisioned (an NP RFS signal is sent). Faulty device replacement branches into Replace, Add/Delete and Add. Renewal copies attributes only from the old model to the new. The speed booster changes the CPE bandwidth through E2ESO. The up/downgrade device decision follows ECM's UPDOWNGRD suggestion (90G or 120G below 1 Gbps; Enhancement 1871663).
- **Rules R12–R20** cover Backup 5G by order type, the up/downgrade device suggestion, the device-replacement charges, the exit charge, renewal, legacy contract rules, cessation during activation, porting and the FortiPortal organisation's life. **New conflicts F16 and F17:** who loads the basket for dunning (NPS, RTF, or neither, since CWOM keeps its registry), and whether FPC_SITE in the FortiPortal SSO is empty or lists the sites.

Lab: a **journey switcher** replaces the 20-chip row on screens 3 and 4. One button names the journey and its stage, and opens the journeys grouped as Join, Change, Support and Leave. The hierarchy tab no longer reports unmodelled order types. The fixture was regenerated from the seeded draft. Checks: full `pytest` and the catalogue test (it now asserts that every order type has a journey), ruff and mypy on the changed test; lint, brand lint, build and budget green; architecture and lab tests 23/23, including the BPMN layout checks on every journey view.

**Architecture map and catalogue bar (2026-10-10, user's four points).**
1. **Journey flow:** the minimap strip is gone; zoom and Fit height sit on the right above the flow.
2. **Catalogue bar:** the section tabs become one bar. It shows the catalogue's identity (a layers mark, "SMB architecture", draft and revision), then the sections, each with a line icon and a count. The current section is in maroon with an underline; sections that aren't in the mock-ups are muted and say so. The crumbs become a **portfolio path**: each level's kind (business unit, line of business, segment, product family, offering) sits above its name.
3. **Landscape:** the integration weight is removed: no weight bars on the boxes, no ranking panel, and no call or pair counts in the header. The poster is replaced by **`ArchitectureMap`**:
   - Each TAM layer is a numbered block in its calm brand tint, with its scope sentence and its functional groups as columns of system cards (name plus a short purpose).
   - The integration layer is drawn as a bus between Customer and Service.
   - Links are soft curves measured from the cards and drawn under them, only for the selected system or on "Show every link".
   - The side panel is a **layer navigator** at rest; picking a layer brings it forward and the others go quiet. A picked system shows its linked systems grouped by layer. The header counts systems, layers, groups, external systems and journeys.
4. **Product › Architecture** opens on the **whole-product footprint**:
   - Systems are shown in three calm maroon tiers: core (in half the journeys or more), used by some, and carries calls only. Systems the product doesn't use stay quiet but readable.
   - Each card names the system's role for the product. Every layer and the side panel carry a dot meter, one dot per system.
   - A summary row shows 27 of 46 systems reached, 6 core, 8 of 8 layers and 20 journeys. A list of core systems sits in the side panel, and a picked system shows its roles and the journeys behind it.
   - "One journey at a time" keeps the call step-through, now on the new map.

The old `poster.tsx` and its layout and router were removed. Checks: lint, brand lint, typecheck, build and budget are green; architecture and lab tests pass 24/24, with axe, including a new footprint test. There is no horizontal overflow at 375 px or 1440 px.

**Landscape as the TAM wheel (2026-10-10, user: "ignore the current template, more innovation").** The layer-block map on the landscape is replaced by **`TamWheel`**, which draws the TM Forum application map round its integration layer:
- The seven domains are sectors on the rim, in their calm tints, each with a band and a curved name and count. Inside each sector, the functional groups are arcs.
- The 44 rim systems are points on the ring, their names reading outwards. TIBCO and B2B BFF sit at the hub.
- Every system-to-system link is drawn faintly and bundled through the hierarchy (system → group → domain → hub), so the estate's shape reads at a glance.
- Pointing at a system previews its links and shows a hover card (full name, domain › group, purpose). Picking it keeps its bundle in maroon, puts its partners in bold maroon and quietens the rest; the side panel shows its linked systems by domain.
- A domain can be brought forward from its band or from the side panel, which is now a domain navigator listing each domain's systems.
- The view switch is **Wheel | Layers | Matrix** (user: keep the layer view beside the wheel and the matrix for a full presentation). Layers is the TAM layer-block map with "Show every link"; all three share the selection and the domain navigator. Keyboard: one tab stop; the arrow keys move round the wheel, Enter picks, Escape clears.
- On a phone the wheel keeps a readable size and scrolls inside its own frame; the page never scrolls sideways.

eTOM lifecycle columns were considered and rejected, because most systems have no lifecycle-attributed steps. `ArchitectureMap` serves the Layers view and the product's footprint. Checks: tests 25/25 with axe; lint, brand lint, build and budget green.

**Layers first, brand palette, richer layer view (2026-10-10).** The view switch is now **Layers | Wheel | Matrix**, and Layers is the default.

The palette is one calm tonal ramp drawn from the e& palette down the TAM stack: beige (Market & Sales), then rose-beige (Product, now a tone of its own), red blush (Customer), rose-mauve (Service) and maroon mist (Resource). The side layers take warm stone (Engaged Party) and e& grey (Enterprise). The integration layer is the one solid maroon band. The tokens are shared, so the wheel, the journey lanes and the product pages follow the same palette.

The Layers view gains:
- an integration spine down the left joining every layer to the bus;
- a line icon and a number badge per layer, a pill with the system count, and counts on the group headings;
- a monogram tile on each system card, which hides itself in narrow groups so the name stays readable;
- a gentle hover lift.

Headings sit above the link curves on their own tint, so lines never cross words. Footprint tiers carry into the monograms: maroon for core systems and for those a journey lights, mist for used, outlined for carries-only. Fixed a lint error where the tab stop read a ref during render. Checks: tests 25/25 with axe; lint, typecheck and build green.

**Maroon kept for meaning (2026-10-10, user agreed).** The layer tints no longer use maroon. Service is now warm taupe and Resource is sand, alongside beige (Market & Sales), rose-beige (Product), blush (Customer), warm stone (Engaged Party) and e& grey (Enterprise).

The integration layer is a light maroon-mist band with one thin maroon bus line and a ringed spine dot; it is no longer a solid maroon fill. Its cards are white.

Maroon now means one thing only: selection and focus, the product's core and used systems, and a journey's lit systems. Reasons:
- A selected card and its links no longer compete with a maroon band.
- There is no saturated filled area.
- Maroon stays inside the calm budget.

**Portfolio path as a hierarchy rail (2026-10-10).** The path above the product title is now a rail with one node per level, from Catalogue (SMB architecture) through business unit, line of business, segment and product family to the offering.
- Every item has the same two lines: the level kind above, the name below. They share one baseline, which fixes the misaligned last item, and steps are evenly spaced from the page's left edge.
- The rail is in the pale maroon family, as the path to where you are. Ancestor nodes are rings; the current node is filled maroon with a soft halo, and its caption is maroon.
- Links underline on hover only.
- On a phone the rail scrolls inside itself and opens at its end, so the current page shows first.

**The bundle as an anatomy (2026-10-10, user agreed).** "What's in the bundle" no longer has the solid maroon device block or the beige Market & Sales card.
- **Device:** a white card at the heart of the bundle, with a device icon, its models as chips (Fortinet 90G, Fortinet 120G), the ECM model-by-speed rule beneath, and its delivering systems.
- **Components:** grouped by what they do, as capability tiles: Connectivity, Security, In the office, Run and manage, and Resilience. Resilience is optional, dashed and full-width. One correctly drawn spine runs from the device down the gap, with a short rib into each tile.
- **Delivering systems:** shown as the architecture map's monogram tiles in their layer colours, with visually hidden "Delivered by …" text.
- **Grouping:** keyword-based and generic, labelled as this catalogue's reading; anything it can't place goes under "More".
- **Codes:** "Offer and service codes" is a real disclosure with a chevron, a count and a table.
- **Colours:** the card is neutral paper with an ink heading; maroon stays for the primary action.

Also fixed `monogram()`: its backslashes had been lost, so it split names on the letter "s". It now prefers a name's acronym (CSRD, HPSM, BFF) and falls back to up to three initials (CAF, SSP). Checks: tests 25/25 with axe, with new bundle assertions; lint, typecheck and build green.

**"Who can buy it, and how", redesigned (2026-10-10).**
- **Heading:** counts conditions, order types and channels, and shows evidence pills (5 confirmed · 1 inferred).
- **Eligibility:** four question cards (Who, Where, On what terms, Through which route), each with an icon and a sub-question. Every condition sits on a checklist line whose node shows its evidence: filled for confirmed, an ochre ring for inferred, dashed for a gap.
- **Order-type matrix:** rows grouped by the customer's stage (Join, Change, Support, Leave, the same stages as the journey switcher; now shared in `stages.ts`). Channels are grouped by kind (assisted, self-service, systems), each with its monogram tile in its layer colour and the number of order types it takes. Availability dots are calm ink, not maroon.
- **Layout:** the matrix now gets two-thirds of the width, so all six channels show without a sideways scroll.

Checks: tests 25/25 with axe; lint, typecheck and build green.

**Masthead: the Etisalat logo (2026-10-10, user chose option A).** The red e& tile is replaced by Etisalat's official white logo, then a thin divider and "Knowledge portal", aligned with the navigation.
- **Source:** `https://www.eand.ae/content/dam/etisalat/logo/etisalat-logo-ver-white-en-1912x536.svg`, downloaded with the user's approval (7.6 KB). It was checked to contain only an `<svg>` and 9 `<path>` shapes.
- **Where it lives:** `frontend/src/design-lab/catalogue/assets/etisalat-logo-white.svg`, shown 24px tall (115 × 24). It is dev-only, so it isn't in `dist`.
- **Brand rule:** when the direction moves into production, the logo belongs in the primitive brand layer, and the brand team should confirm the asset and its clear space.
- **Also:** the landscape intro now describes all three views, since Layers comes first.

**Two-tier header (2026-10-10).**
- **Mock-up bar removed:** it was a review aid that jumped between the four mock-up screens. The catalogue bar and the product tabs already reach every screen, so it carried no product value.
- **Tier one, the masthead (56px):** content sits on the page's 1440px column, so the logo's left edge lines up with the catalogue bar, the path and the page title (all at 32px). The lockup "Etisalat | Knowledge Portal" is one home link: the logo optically centred, a 24px divider, and the product name "Knowledge Portal" as a proper name, at equal 16px spacing. Navigation sits on the bar's full height with a 3px underline for the current area, and the signed-in person has an initials avatar.
- **Tier two, the catalogue bar:** full width, sticky under the masthead, with its content on the same column and tabs matching its height. The side panels' sticky offset accounts for both tiers. On a phone only the masthead stays pinned.

Checks: tests 25/25 with axe; lint, brand lint, build and budget green; no sideways scroll at 375px or 1440px.

**Landscape hero (2026-10-10).** The title block becomes a hero card on paper.
- **Left:** a maroon eyebrow ("TM Forum application map · SMB"), a 36px title, a one-sentence intro, and chips for the draft status (revision 2) and each source.
- **Right:** the estate's shape. "46 systems across 8 domains, 20 functional groups" sits above one bar split into a segment per domain in its layer colour, sized by its systems. Under the bar: a two-column key, then figures for external systems, journeys, products and open findings.
- **Toolbar:** sits under the hero. The Layers / Wheel / Matrix switch has icons, the search field has a magnifier (36px controls), and the legend has a "Key" label.

Checks: tests 25/25 with axe; lint, brand lint, build and budget green; no sideways scroll at 375px.

**Landscape kept generic (2026-10-10, user).** The landscape shows the architecture only, so it holds for any product and any version.
- **Hero:** the draft and revision chip and the source chips are removed. The figures are now architecture-only: external systems, integration-layer systems and placements proposed.
- **Catalogue bar:** the identity line under "SMB architecture" reads "Architecture catalogue" instead of "Draft · revision 2".
- **Products section:** "Products on this architecture" is removed from the bottom of the landscape. Products are reached from the catalogue bar's Products tab, and versions belong on the Versions section and product pages.

**Built for many products (2026-10-10, user).** All screens were reviewed for single-product assumptions.
- **Products index (`/products`, new):** every offering under its portfolio path (business unit › line of business › segment › family). Each product is a card with its purpose, its plans, components, order types and journeys, and a **reach strip**: one cell per system in map order, filled in its layer colour where the product's journeys reach. The page also has a filter.
- **Journeys index (`/journeys`, new):** a hero with coverage (order types modelled out of offered) and counts per stage, and a **coverage matrix**: order types grouped by stage down the side, products across the top. Each cell is a modelled journey (with its step count), offered but not modelled (dashed ochre), or not offered. Shared journeys such as order tracking sit in an "Across order types" group.
- **Catalogue bar:** Products and Journeys open these indexes instead of the first product and its first journey.
- **Landscape side panel:** a picked system now lists "Used by products" (core or used, with "in n of m journeys"), linking to that product's Architecture tab with the system pre-selected (`?system=`), and its journeys grouped by product.
- **Shared helpers:** `DOMAIN_ORDER`, `systemsInMapOrder()` and `reachOf()` in `posterModel.ts`. Product pages were already scoped to one product.

The fixture has one product; no others were invented. Checks: tests 28/28 with axe (3 new); lint, brand lint, build and budget green.

**Product card, second pass (2026-10-10, user: the multicolour strip had no meaning).**
- **Reach strip replaced:** the 46-cell strip in layer colours is gone. In its place is a **reach ring**: one maroon arc showing the share of the map reached (59%), with "27 of 46 systems" and the number of core systems beside it. The facts sit in a 2 × 2 grid next to the ring.
- **Footprint by layer:** dot meters in maroon, one row per layer in map order with used/total, the same language as the product's Architecture tab. Maroon means the product's footprint, as it does there.
- **Card details:** the purpose is cut to two lines, and the pages are buttons with icons (Overview, Architecture, Journeys).

Checks: tests 28/28 with axe; lint, typecheck and build green.

**Product card, third pass (2026-10-10, user: sold through, who can buy, what is in it).** The card now answers the reader's questions, all read from the catalogue so any product fills it. The footprint detail stays on the product's Architecture tab.
- **Sold through:** the channels of the product's joining order types (new activation, migration, port in), grouped Assisted (BCRM) and Self-service (B2B Web, SMB App), each with its monogram. System-initiated channels such as NPS are left out.
- **Who can buy:** the customer type ("SMB customers", flagged inferred with an ochre ring), then the contract terms one chip each (No contract · 1 year · 2 years), each with its evidence dot.
- **In the bundle:** short component names, each with its capability icon. The device comes first in dark ink and optional parts are dashed.
- **Foot:** one quiet line (6 plans · 19 order types · 20 journeys · 27/46 systems) and the page buttons.
- **Shared module:** the component grouping moved to `capabilities.tsx` (`CAPABILITIES`, `capabilityOf`, `shortComponentName`), so the bundle and the card share it.
- **Fixed:** shell quoting had dropped regex escapes and left backspace characters in source. All were cleaned, and `src` was scanned for control characters.

Checks: tests 28/28 with axe; lint, brand lint, build and budget green.

**Products page on one screen (2026-10-10, user).**
- **Commercial terms (new row on the card):** contract periods are not an eligibility rule, so they moved here. The periods show as one joined track (No contract · 1 year · 2 years), then the exit charge read from the business rules (AED 650, marked "to confirm" because the rule says so), the number of plans, and "Price not stated" as a dashed gap, since no plan states a price.
- **Who can buy:** keeps only the customer type, with its evidence note.
- **Card layout:** horizontal. Identity, size line and page buttons sit on the left; the four rows (Sold through, Who can buy, Commercial terms, In the bundle) on the right, behind a hairline. The card is 241px tall, and several products stack as a list.
- **Family group:** a framed paper group like the hero. Its header is one row: family icon, level label and name, product count, and the portfolio path to the right.
- **Hero:** slim, with four compact tiles and the filter beside the title.

At 1440 × 900 the page height equals the viewport: no scroll. Checks: tests 28/28 with axe (the terms track, exit charge and price gap are asserted); lint, brand lint, build and budget green.

**Products page: catalogue-level only (2026-10-10, user).** The page lists many products across many families, so it carries neither review notes nor one product's counts.
- **Card:** the exit-charge, plans and "Price not stated" chips are gone, as are the "inferred" and "to confirm" tags, the evidence dots and the order-types / journeys / systems line. It answers four things: Sold through, Who can buy, Commercial terms (the contract-period track only) and In the bundle, with its Overview, Architecture and Journeys buttons.
- **Hero:** shows Products, Families and Segments.

Evidence and per-product figures stay on each product's own pages. Checks: tests 28/28 with axe; the page still fits 1440 × 900 without scrolling.

**No counts on tabs (2026-10-10, user).** Counts are removed from every tab: the catalogue bar (Products, Journeys, Systems, Governance), the product's tabs (Plans, Business rules, Components, Journeys) and the journey's Integrations tab. Counts belong to the pages, not the navigation.

**Journey catalogue, revamped (2026-10-10, user: complete revamp for many products and families).** The coverage-matrix page is replaced by `JourneysIndex.tsx`, designed around four questions: which journeys exist in my part of the portfolio, where each sits in the customer lifecycle, what a journey involves before I open it, and how products compare on the same order type.
- **Scope bar:** follows the portfolio hierarchy. Each level (business unit, line of business, segment, product family), then the product, is a small menu with "Any …", so the page narrows from the whole catalogue to one product. It scales to any number of families and products. A coverage summary sits beside it.
- **Lifecycle board:** Join → Change → Support → Leave as a chevron ribbon, and every order type in scope as a tile in its stage (Change takes two inner columns).
  - **Markers:** a tile carries one marker per product in scope: filled for a modelled journey, dashed ochre for offered with no journey yet, hairline for not offered. With a single product it shows the step count instead. Many products become a row of markers, not more columns.
  - **Shared journeys:** journeys that follow any order (order tracking) sit in an "Across the lifecycle" strip.
- **Preview panel:** for the picked order type, product variants appear as tabs when several products offer it.
  - **Journey details:** the journey's summary; steps, decisions, systems and calls; the **route through the systems** (monogram tiles in the order the order reaches them); the channels it arrives through (assisted or self-service); and the **decisions on the way** (gateway diamonds, such as "Backup 5G in the bundle?").
  - **Comparison and actions:** a comparison table when several products have the journey, then "Open the journey flow" and "Integrations". If there's no journey, it says so.
- **Fit:** the page fits 1440 × 900 without scrolling for every journey checked. On a phone each stage heads its own tiles, and there's no sideways scroll.
- **Code changes:** stage definitions come from `stages.ts`. The old journeys matrix and its styles were removed. The page's bottom padding went from 48 to 24px.

Checks: tests 28/28 with axe (new: stages, preview, picking, scope narrowing); lint, typecheck and build green.

**Landscape for presentation, on one screen (2026-10-10, user).** At 1440 × 900, the Layers, Wheel and Matrix views and a selected system all fit without page scroll.
- **Hero:** slim, with a soft warm gradient (ivory → blush mist). The estate bar has a four-column key, and the figures were dropped.
- **`ArchitectureMap compact`:**
  - **Layout:** four bands, with Engaged Party and Enterprise moved into a side column.
  - **Cards:** one-line system cards with a light layer-coloured edge; names wrap to two lines only when needed, and purposes show on hover and in the panel. Scopes are hidden.
  - **Fit:** tighter layer and group spacing, with group names on one line.
- **Colours:** layer bands use soft tonal gradients in each layer's tint. There are no dark fills: a selected system is pale mist with a soft maroon edge, links and the integration bus line use the light maroon tints, and the bus band is pale. The key's swatches match.
- **Side panel:** takes the map's height and scrolls inside itself. The wheel and matrix are capped to the free height.
- **Fix:** the matrix's scroll box is now `position: relative`, so its absolutely positioned screen-reader labels no longer stretch the page.

The product Architecture tab keeps the full card style. Checks: tests 28/28 with axe; lint, brand lint, build and budget green.

**Landscape decluttered (2026-10-10, user approved the mockup).** Mockup images were captured with headless Chrome from a standalone page built on the real fixture, before any code change.
- **Header:** one line, with the title and one sentence on the left. On the right: the view switch (Wheel, Layers, Matrix), a search with a magnifier, and a **Key** menu holding the legend and "Show every link". The estate bar and the always-on legend are gone.
- **Map:** full width. The Domains navigator is removed; a system's details open in a **drawer** over the map's right side only while one is picked. The drawer closes with Close or Escape and holds the system's figures, linked systems as pills, product use and journeys.
- **Chrome stripped:**
  - **Layers:** icon and name only.
  - **Groups:** quiet labels.
  - **Systems:** plain white tiles with no border or edge. Hover shows a soft outline, selection is pale mist with a soft maroon outline, and partners get a light outline.
- **Spacing:** names are larger (12.5px) and there is more space between bands.
- **Fit:** 1440 × 900 without page scroll in every view, with or without the drawer.
- **Design-checker "side-tab" findings, triaged:**
  - Fixed: list and tile edge bars replaced by outlines, fills or a layer dot (footprint rows, core systems, linked groups, journey tiles, journey switcher, map-card tiers); superseded compact-card rules and dead navigator styles removed.
  - False positives: the tree connectors now draw as 2px fills.
  - Remaining match: the matrix column divider, a table separator.

Checks: tests 28/28 with axe; lint, brand lint, build and budget green.

**Landscape fitted to the screen (2026-10-10).**
- **Width:** the page widens to 1760px with 24px gutters. The eyebrow becomes part of the one-line lede, so the title, lede and tools sit on one row.
- **Layout:**
  - Each group holds its systems in at most two rows.
  - Groups share a band's width by the columns they need, or by their name if that is longer, so no label is cut.
  - The two halves of a split band share the width the same way.
  - System names show in full.
  - Engaged Party and Enterprise use two columns.
- **Height:** the map fills the height left under the header. Tiles grow with the spare height, from 28px to 48px, and the type grows a step on large screens, so a big screen no longer leaves an empty strip below the map.
- **Fixes:** the link layer is pinned to the map's own size, so a stale measurement no longer stretches the page. The map also re-measures when its tiles reflow.
- **Fit:** no page scroll at 1280×720, 1366×768, 1536×730, 1440×900, 1920×950 and 1920×1080, in Layers, Wheel and Matrix, with and without the drawer. Below 1100px wide the page scrolls as before.

**Landscape is Layers only; the Matrix moves to a Systems page (2026-10-10, user chose option 1).**
- **Rationale (design judgement, HYPOTHESIS, not user-tested):** the Wheel repeated Layers with harder-to-read labels, and "Show every link" plus the drawer already cover its overview. The Matrix is the only view of every integration at once, but it is an analysis tool rather than a picture of the landscape.
- **Landscape:** the view switch is gone. The header holds the title, lede, search and Key, and "Show every link" is always in the Key.
- **Systems tab:** now live at `/systems`. It shows the integration matrix filling the height under the header, with its own scroll, plus the same search and details drawer.
- **Removed:** `TamWheel.tsx` and its styles.
- **Code:** the search and drawer are shared in `SystemTools.tsx`, and the picked-system and link hooks in `systemHooks.ts`.
- **Fit:** no page scroll at 1280×720, 1366×768, 1536×730 and 1920×950, on either page, with and without the drawer.

**Landscape header band with a layer strip (2026-10-10).** The user approved mockup A, then asked for two changes, listed under Map changes.
- **Header:**
  - The header is now a soft beige band, as wide as the tab bar above it.
  - The first line holds the layers mark, the title, a one-line subtitle, the search and the Key.
  - The second line is a strip of the layers in their own colours. Clicking a layer shows only that layer (`?layer=`); the others go quiet, with names kept at AA contrast. The strip also serves as the colour legend.
- **Map changes:**
  - The integration layer no longer has a line drawn through its platforms.
  - Engaged Party is now a soft sage (`#edf1e9`) and Enterprise a soft mist blue (`#eaeff3`), in place of the two greys.
- **Fit:** on short screens the smallest tile height drops from 28px to 26px. No page scroll at 1280×720, 1366×768, 1536×730, 1440×900, 1920×950 and 1920×1080, at rest, with a system picked and with one layer shown.

**Product header band (2026-10-10).** Every product tab now shares the landscape's soft header band, as wide as the tab bar.
- **Contents, top to bottom:**
  - The hierarchy rail.
  - A product mark, the name and the one statement of what the product is for, with the page's actions on the right.
  - The figures as linked tiles, each opening the tab that holds it: plans, components, order types, journeys and systems. The source sits at the right of the same row.
  - The tabs, as the band's lower edge.
- **Alignment:** the name, statement and figures hang from the name's left edge; the rail, mark and tabs from the page's left edge. The compact header (Journeys and Architecture tabs) keeps the rail, the name and the tabs.
- **Fix:** the overview's route table no longer pushes the page sideways on a phone (its hidden labels now stay inside its scroll frame).

**Product overview aligned; footprint in its own colour (2026-10-10).**
- **Overview, one layout system:** every section is a heading over a rule, its content sits on one kind of panel (paper, hairline border, 12px corners), and panels side by side end level.
- **Overview, rows:**
  1. What's in the bundle (7 columns) next to Customer value (5), whose reasons spread down the panel.
  2. Who can buy it, as four equal condition cards side by side.
  3. How each order type is placed: the channel table at full width.
  4. Plans at a glance.
- **Product Architecture:** the footprint uses a deep teal that no layer, state or brand colour uses. Core systems are solid teal; used is a teal outline; carries calls only is a dashed teal outline; not used is quiet. The meters, legend, core-systems list and the landscape drawer's "Core" chip follow it. Maroon stays for the picked system only.
- **One journey at a time:** systems in the journey use a teal tint.

**Journeys page: one product at a time, opening on Fixed › SMB (2026-10-10).** The user set the rule: order types belong to a product.
- **Scope:**
  - The page opens on Enterprise › Fixed › SMB (`DEFAULT_SCOPE`, matched by name) and that scope's first product.
  - The product level never offers "Any product", so the board always shows every order type of one product with its journey's size, or "No journey yet".
  - "Any …" above the product widens the scope (`scope=all` for the whole portfolio) and keeps a product named.
  - The multi-product markers, the product switcher and the cross-product comparison are gone.
- **Header:** the catalogue's soft band, shared with the Landscape and product pages. It holds the title, a one-line subtitle and how much of the product is modelled, then the scope as one row of chips, each naming its level and its choice.
- **Layout:** the board and preview are paper panels that end level.

**Journeys scope opens with a choice at every level (2026-10-10).** After Fixed › SMB, the default continues through the first child that holds a product (today: Business internet bundles › Business Pro Plus). Every level stays selectable.

**Journeys page fits the screen (2026-10-10).**
- **Fit:** no page scroll and no sideways scroll at 1280×720, 1366×768, 1536×730, 1440×900 and 1920×1080. Below 1100px wide the page stacks and scrolls as before.
- **Panels:** the board and preview take their own height and shrink to the space under the header band when that is less.
- **Board:** more compact (shorter stage ribbon and tiles). Its stage columns can shrink, and stage subtitles wrap to two lines.
- **Preview:** scrolls inside itself, its parts keep their size, and its actions stay pinned at its foot, with scroll padding so focus is never hidden behind them.
- **Small screens:** the preview narrows (320–380px).

**Channels are per order type (2026-10-10, user rule: not every assisted or self-service channel takes every order type).**
- **Audit:** journeys already take their channels from their order type (the adapter), so the flow and architecture channel switches and the overview's order-type × channel table were correct.
- **Journeys page:**
  - An "Ordering channel" menu in the header band (`?channel=`). Order types the channel can't take go quiet (dashed tile, muted name, a "not available" icon), and their accessible name says "not through …".
  - The header reads "N of M through …".
  - The preview always lists the order type's own channels ("Ordered through") and the product's channels it can't be ordered through ("Not through"), even without a journey.
  - The flow links open on the chosen channel when the journey takes it.
- **Product cards:** a selling channel that doesn't take every way to join is dashed, its tooltip and accessible name say which ways it takes ("For New activation and Port in only"), and one note explains the dash.
- **Tests:** two new ones.

**Components tab, Integrations tab and Systems page redesigned (2026-10-10).**
- **Components tab:**
  - "Who delivers what" grid: every component against every system that plays a part, grouped as the overview's bundle (the device at the heart, then the capabilities). Teal marks, hollow for optional parts, and the system's part in the tooltip and accessible name.
  - "Every component": one three-column grid of cards, each labelled with its group, with codes in monospace and the delivering systems as layer-coloured tiles with their part.
- **Integrations tab:**
  - The maroon style bar becomes a slim stacked bar with a legend, on a new calm slate ramp (`--cl-slate-1…4`); "Not stated" is hatched.
  - Sequence view (default): lifelines in the order the journey first reaches each system, every call an arrow in order (a ring where it passes through the integration layer), and the picked call's details beside it with Previous and Next.
  - Table view: the register.
  - A "System" menu replaces the 22 chips. It brings a system's calls forward in the sequence and filters the table.
- **Systems page:**
  - The catalogue's soft header band, with figures: systems linked, linked pairs, calls, the busiest pair and the busiest system.
  - Matrix on the slate ramp (maroon stays for the picked system), columns and layer rows in layer tints, a bar of each system's calls in the row header, and plain diagonal cells. It takes the full width with a fixed 240px name column.
- **Fit:** no page scroll on Systems from 1280×720 up.
- **Tests:** updated for the grid, the sequence and the table filter.

**Components tab: components first (2026-10-10, user request).**
- **Order:** the cards come first, then "Who delivers what" below.
- **Filters:** a toolbar narrows the cards by group (chips with counts) or by delivering system (a menu). The heading says "N of 9 shown", and "Show them all" clears an empty result.
- **Cards:** each shows its group and its status, a three-line description, compact codes, "Delivered by" rows (tile, name, part; the filtered system highlighted in teal), and the source footer. Cards in a row end level.
- **Grid:** a system's column lights up under the pointer. Its heading is a button that narrows the cards and brings them into view, with motion only when reduced motion isn't requested. Rows outside the filter go quiet.
- **Tests:** the test covers both filters.

**Systems page made product-neutral, with a capabilities view (2026-10-10, user approved recommendations 1–5).**
- **Finding:** the page counted journey calls of the one modelled product, so its figures grew with repetition. "196 calls" covered 133 distinct interfaces, and "busiest pair CBCM ↔ RTF 25" was 3 interfaces; `evaluateOrder` alone counted 18 times. The catalogue has no interface list of its own (`relationships` is empty).
- **Measure:** `distinctInterfaces()` (posterModel) keeps each interface once by caller, layer, callee and operation. The shared `useLinkCounts` hook uses it, so the Landscape's links and the drawer are product-neutral too.
- **Matrix:** now directed (the row calls the column), with a cell = distinct interfaces (two hops through the integration layer) and the operations named in the tooltip and hover readout. Row bars show how many systems each system talks to.
- **Figures:** systems linked, distinct interfaces, linked pairs, through the integration layer, most connected (by partners). The busiest pair and busiest system are gone.
- **Source line:** "Read from the modelled journeys, each interface once, whatever uses it. The catalogue has no interface list of its own yet."
- **Product usage:** stays on each product's Architecture tab.
- **Capabilities view (`?view=capabilities`):** systems × kinds of bundle part across every product (`PART_KINDS`, `partKind`, `systemParts` in capabilities.tsx). A teal mark shows the number of components, named in the tooltip and accessible name.
- **Fit:** no page scroll on either view from 1280×720.
- **Next, when the source exists:** feed the catalogue's own interface list from the SDD as the primary source.

**Final polish and a whole-platform check (2026-10-10).**
- **Products index:** wears the shared header band (mark, title, lede, filter; then the figures row), so every catalogue page opens the same way.
- **`lab.css`:** 97 unused rules removed (old hero, estate bar, layer bars, earlier Landscape and header versions), found by a whole-word class sweep of the catalogue sources (1688 → 1587 lines, braces balanced).
- **Whole platform from the catalogue:** its top menu now links the real areas (Your work, Library, Ownership, Requirements, Explorer). In development the real shell's secondary menu links "Catalogue redesign", so the lab is one click from every area.
- **Deployment check, local offline stack:** a fresh API (fake providers, in memory), the demo seed and the web app.
  - 29 platform pages load with seeded content, every API call answering 200: Your work, Library, a document's pages, Re-confirmations, Requirements (4 tabs), the current catalogue (8 pages plus a product and journeys), Explorer, Ownership (4 tabs), the design system and the earlier labs.
  - 17 catalogue-redesign pages render with no error and no sideways overflow.
- **Containers:** `deploy/compose.local.yaml` needs `KERNEL_READ_TOKEN` (private platform-kernel), which only the user holds. The lab is development-only, so a production build wouldn't include it anyway.
- **Tests outside the lab, unrelated to it:**
  - Frontend, run on their own: one failure, a time-zone assumption in `ExplorerPage.test.tsx` (expects 09:30, gets 13:30 on a UTC+4 machine). Under full-suite load, 10–13 tests in library, explorer, historic and the old catalogue editor time out.
  - Backend: `test_knowledge_reviews` fails only in some run orders.

**Next exact action:** the user reviews the four mock-ups. On approval: build them into `frontend/src/architecture/` (replacing the dropdown context bar), move the poster palette into the token layers, rewrite DESIGN.md from the built world (impeccable documenter), then the gate (critique, serious findings fixed, e2e routes in `REDESIGNED`), Explorer read views, and the decision on replacing `smb_architecture.yaml`.
