# Redesign backlog

This is the one list of open redesign work that isn't yet in an area plan. Each item has an
owner area (the Phase 8 area that closes it) and the place it came from. The `/redesign-area`
pipeline reads this file before building an area (step "Read first"), and logs its MEDIUM and LOW
review findings here (step 7).

- **Severity:** **High**, **Medium** or **Low**, using the reviewers' scale.
- **State:** **Open**, **Planned** (named in an area plan), **Done** (with the commit), or
  **Blocked** (waiting on a backend gap).

## From the cognitive walkthrough (Phase 3)

| ID | Item | Severity | Area | State |
|---|---|---|---|---|
| O-1 | `n` behaves like `j` when nothing has been seen. Make it "next flagged first, then unseen". | Medium | 2 Library | Planned |
| O-2 | No "select a whole sheet". Offer select-by-location ("Select Sheet 2", 4 rows) in the review desk. | Medium | 2 Library | Planned |
| O-3 | Table-row passages show the extractor's raw form "A4=… \| B4=…". Render them as labelled cells (an evidence or passage block). | Medium | 2 Library | Planned |
| O-4 | The evidence quote marks the whole citation; the API gives `quote`, so highlight the line only (`EvidenceQuote quote=`). | Low | 3 Catalogue curation | Planned |
| O-5 | The origin of a change is a heuristic in the lab; it needs `change_history` per item. | Medium | 3 Catalogue curation | Planned (uses the release change history the API already returns; confirm in the plan) |
| O-6 | No suggested squad for systems in no product. The prototype says "No squad runs a related system yet"; keep that. | Low | 7 Squads | Planned |
| O-7 | "Accept with edits" is not built (it announces only). | High | 3 Catalogue curation | Planned |

## From building and measuring the prototype (Phase 6)

| ID | Item | Severity | Area | State |
|---|---|---|---|---|
| K1 | At 1280×800 the review desk's save bar wraps to two lines (chrome 22%, target ≤ 15%), because the "why unavailable" reasons sit beside the buttons. Never hide the reason (§1.2); shorten it, or move it under the bar only when narrow. Re-measure. | Medium | 2 Library | Planned |
| K2 | Content has `dir="auto"` but no `lang`, so NVDA probably reads Arabic with the English voice. Set `lang` where the language is known (a document's `language`). | Medium | 2 Library, 3 Catalogue curation | Planned |
| K3 | Arabic titles ending in Latin text ("… (sample)") render `'(sample) …'` inside English sentences. The bidi is correct; the reading may still be odd. Watch it in the critique and in any user test. | Low | 1 Shell + Home | Open |
| K4 | On a phone, the masthead's account name wraps to two lines. Use a short account label below 480px. | Low | 1 Shell + Home | Done (area 1: one line, truncated, full name in `title` and the accessible name) |
| K5 | A missing favicon logs a 404 on every page (it predates the redesign). | Low | 1 Shell + Home | Done (area 1: a neutral ledger mark; swap for the e& asset when supplied) |
| K6 | The maroon share is about 4–6% of a view, under the calm rule's "about 8–10%"; red is at most 0.06%. This is read as within the calm intent (a ceiling, not a quota). Don't add maroon to hit a number; revisit only if the critique finds actions or selection hard to spot. | Low | all | Open |

## Backend gaps (dependencies, never built by the redesign)

From `docs/ux/journeys/service-blueprint.md`. The UI works around them as described there. Each
is **Blocked** until the service changes, and then it becomes a follow-up item.

| ID | Gap | UI workaround today |
|---|---|---|
| BG1 | No job-list endpoint | Jobs derived from documents plus this session's jobs |
| BG2 | Approval doesn't record coverage ("seen") | Coverage is shown at approval, but not stored |
| BG3 | No reopen of decisions | A 6-second delayed commit with undo |
| BG4 | Bulk marking is not recorded | Known in this session only |
| BG5 | The organisation audit has no field diff | History lists events without "what changed" |
| BG6 | Check results are not stored | Kept for the session, marked stale on change |
| BG7 | Build-then-publish is orchestrated by the client | "Keep this tab open until it finishes" |

## From area reviews (Phase 8)

Filled in by `/redesign-area` step 7 (MEDIUM and LOW findings), one row per finding:
`file:line — severity — finding — fix`.

| Area | Finding | Severity | State |
|---|---|---|---|
| Area 1 | `frontend/src/work/YourWork.tsx` — MEDIUM — critique: a ruled ledger-table queue with triage facts per row | Medium | Done (area 1: version, file type, replaces, size, flags, waiting; urgency sort) |
| Area 1 | `frontend/src/work/YourWork.tsx` — HIGH (critique P1) — the failed-read remedy is told but not offered: add "Try reading again" and "Upload a new version" on the row, and Retry beside Upload in Jobs (model §6); one wording on every surface (the legacy Library still says "Read the 1 document that failed again") | High | Planned (area 2: the library owns retry and upload) |
| Area 1 | `frontend/src/work/` — MEDIUM — no sort or filter in the queue; re-confirmation rows open the generic `/reminders` instead of the item; no "new since your last visit" | Medium | Planned (area 6 for re-confirmation links; the rest open) |
| Area 1 | `frontend/src/design/components/layout.css` — LOW — between about 594 and 800px the masthead's product, outbound link and account name wrap to two lines each | Low | Open |
| Area 1 | `frontend/src/design/components/overlays.tsx` — LOW — ShortcutHelp shows "g w / l / c / o / r" in one `<kbd>` (read as one key) and names each group twice (section label + h4) | Low | Open |
| Area 1 | critique — re-scored three times (28, 27, 27/40; baseline 23). The 30/40 target is open: the remaining points are acting from the queue (area 2), consistency with legacy pages (Phase 8 progress) and the items above. Re-critique Your work after area 2 | Medium | Open |
| Area 1 | `frontend/src/app/App.tsx:3-37` — MEDIUM — every route page is imported eagerly, so all legacy pages ship in the one main chunk (937.54 kB, +4.1%, inside budget) — lazy-load route groups behind Suspense in the shell's content slot | Medium | Open (Phase 9 or the last area that touches App.tsx) |
| Area 1 | `frontend/src/shell/useJobs.ts` — MEDIUM — Jobs has no retry or stop, no attempt count, no "Done in the last 30 min", no Stopped, no indexing jobs (model §6.2). Retry and cancel exist in the API; the library owns those mutations | Medium | Planned (area 2) |
| Area 1 | `frontend/src/app/Shell.tsx` — MEDIUM — the offline banner follows `navigator.onLine` only; an unreachable API while online isn't detected. The copy now says "You're offline" (accurate to the signal) | Medium | Planned (area 9, system states) |
| Area 1 | `frontend/src/shell/preferences.ts:37` — LOW — each `useSyncExternalStore` adds its own storage listener and reads localStorage per render — one module listener and a cached value | Low | Open |
| Area 1 | `frontend/src/app/Shell.tsx:25` — LOW — `useOnline` copies `navigator.onLine` through an effect — `useSyncExternalStore` or TanStack's `onlineManager` | Low | Open |
| Area 1 | `frontend/src/main.tsx:9-11` — LOW — two Noto Sans Arabic families load (static for the legacy pages, variable for the design system), and Archivo is imported twice — point the legacy faces at the variable family and drop the static imports | Low | Planned (Phase 9) |
| Area 1 | `frontend/src/design/components/layout.tsx:157` — LOW — masthead utilities set `aria-expanded` without `aria-controls` — give the drawer an id and pass it | Low | Open |
| Area 1 | `frontend/src/design/tokens/component.css:55` — LOW — the text placeholder logo is 3.33:1 in dark mode (white on #ff4a3d) — replace with the official e& logo asset when supplied | Low | Blocked (asset) |
| Area 1 | `frontend/src/app/Shell.tsx:116` — LOW — the Jobs and "need you" badges appear after the documents load, so the masthead buttons widen — reserve the badge width | Low | Open |
| Area 1 | `frontend/src/styles/catalogue.css:5` — LOW — the legacy catalogue index sticks at a fixed 3.5rem, the new masthead is measured (3rem) — `top: var(--sticky-top)` when area 4 rebuilds it | Low | Planned (area 4) |
| Area 1 | `frontend/src/shell/panels.tsx` — LOW — Help's "Ask the knowledge team" names no real contact yet (WCAG 3.2.6 intent) — the team supplies a channel or address | Low | Open question for the user |
| Area 1 | `frontend/e2e/global-setup.ts` — LOW — under heavy local load the seeder's 30 s HTTP timeout was hit twice during `seed_governance` (httpx.ReadTimeout on a fresh stack); passes on a rerun and on an idle machine — watch it in CI; if it flakes there, make the seeder's wait loop tolerate a timeout | Low | Open |
