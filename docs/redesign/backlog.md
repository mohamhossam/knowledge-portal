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
| K4 | On a phone, the masthead's account name wraps to two lines. Use a short account label below 480px. | Low | 1 Shell + Home | Planned |
| K5 | A missing favicon logs a 404 on every page (it predates the redesign). | Low | 1 Shell + Home | Planned |
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
