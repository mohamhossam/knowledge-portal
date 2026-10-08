# Redesign status — knowledge portal, e& calm

| | |
|---|---|
| Integration branch | `feat/kb-redesign`, from `main` @ `b6114b9` |
| Current phase | **6: Hi-fi prototype, a11y kit, round 2 kit.** Done; waiting at **GATE 6** |
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
| 6: Hi-fi + round 2 | Done; **GATE 6 open** | `frontend/src/design-lab/prototype/` (dev-only `/knowledge/design-lab/prototype`), `docs/ux/testing/a11y-manual.md` + `a11y-results.csv`, `docs/ux/testing/round-2/` (kit, data sheet, 33 captures) |
| 7: Layer 2/3 install | Not started | |
| 8: Build by area | Not started | |
| 9: Validate and close | Not started | |

## Decisions

| Date | Decision | Source |
|---|---|---|
| 2026-10-07 | The epic runs on `feat/kb-redesign`. Areas run on `feat/kb-redesign/<area>`. | User brief |
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
| Main JS chunk (min) | 900.79 kB | | 900.82 kB (prototype excluded) | | ≤ 990.87 kB |
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

## Known issues before round 2 (from building and measuring, not from users)

| # | Issue | Evidence | Proposed handling |
|---|---|---|---|
| K1 | At 1280×800 the review desk's save bar wraps to two lines, so chrome is 22% (target ≤ 15%). It is one line (14%) at 1440. The wrap is caused by the two "why unavailable" reasons beside the buttons. | Measured, `prototype/` captures | Phase 8 Library: put the reasons under the bar only while the button is unavailable **and** the bar is narrow, or shorten them; re-measure. Never hide the reason (§1.2). |
| K2 | Content has `dir="auto"` but no `lang`, so NVDA probably reads Arabic titles with the English voice. | Markup review; a11y kit B1.10 | Phase 8: set `lang` where the language is known (a document's `language`); confirm with B1.10. |
| K3 | Arabic titles inside English sentences render as `'(sample) …'` because of correct bidi isolation of an RTL title that ends in Latin text. It may still read oddly. | Captures (Your work, Library) | Observe in T3 and Q3; a content fix (the sample suffix) is a seed matter, not the UI. |
| K4 | On a phone, the masthead's account name wraps to two lines. The lab bar takes about 140px (scaffolding only). | `*-16-library-390.jpg` | Phase 8 Shell: a short account label below 480px. |
| K5 | The missing favicon 404 (predates the redesign). | Console | Unchanged; Phase 8 Shell. |

These are inputs to the GATE 6 comparison, alongside what round 2 and the manual a11y kit find.

## Next exact action

At **GATE 6**, the user:

- runs round 2 (`docs/ux/testing/round-2/README.md`) and the manual a11y kit
  (`docs/ux/testing/a11y-manual.md`) on the prototype, and puts the data in `round-2-data.csv`
  and `a11y-results.csv`;
- **or** chooses assumption mode.

Then the agent:

1. compares the results with the baseline (not measured) and the `synthesis.md` §8 targets;
2. lists the remaining issues (K1–K5 plus findings);
3. updates the plans, before any production code (Phase 7).
