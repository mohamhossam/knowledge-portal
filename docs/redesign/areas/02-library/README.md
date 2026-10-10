# Area 2: Library — report at GATE 8.2 (approved 2026-10-09)

Plan: `docs/redesign/plans/02-library.md`. Branch: `feat/kb-redesign-library`.

## Implemented

- **Documents** (`/library`): state in words and icons, the filters, owner, find and sort in the URL, In service / Cited by / Owner / Last upload, the stopped work across owners retried through a consequence panel, upload as a flow in place (titles per file, scan → read states, leave at any time), and empty, error, permission and narrow states.
- **Search passages** (`/library/search?q=`): the query in the URL, quotes with their language, places in words, the surrounding text, "Open at the passage".
- **The record** (`/library/:id`): status, owner, version and provenance; re-confirmation; act as admin; the review desk while a review waits, else the Overview with "Passages in service"; Versions (files, published, search index for tables with activate and discard panels, how search will see the saved review); **Cited by** (`/cited-by`, `/citations` kept until area 10); Ownership (hand over through a consequence panel, history, admin record).
- **Review desk**: progress and per-row "seen" (a passage counts once it stays current for ~0.6 s, decided at the gate; tab only, BG2); a denser head (one-line keys, progress and file note on one row, the location select behind a button); passage grid beside a sticky, scrolling pane; j/k, Home/End across the 200-row pages, n (flagged not seen first, then not seen: O-1), x + reason + Enter, i, e, o, Space and Shift+↑↓; bulk exclude with one reason; select a whole sheet (O-2); worksheet rows as labelled cells (O-3); one-line save bar (K1); Ctrl+Enter anywhere; publish through a consequence panel (citable → replaces → coverage → reversibility); a leave guard (tab close and in-app links).
- **Withdraw / Return to service** through consequence panels; return re-approves the last published review (no API endpoint; said in the panel).
- **Your work**: the failed-read row offers "Upload a new version" then "Try reading again" (and "Try indexing again"); **Jobs**: Try reading again / Stop with attempts, indexing jobs from publications, Stopped, done in the last 30 minutes of this tab, polite announcements.
- **Design system**: `Facts`, `Lines`, `KeysHint` promoted; `useStickySize` registry (tallest per variable, 0 when not sticky, table head measured); split pane scrolls in its sticky box; nothing sticks at 400% zoom; container queries on the page; live regions always mounted; `ConsequencePanel` takes ReactNode labels, focuses a missing reason, says its failure politely; `DataTable` total row count and one-change Shift+arrow selection; `JobTray` retry label; drawers don't scroll the page when focused.

## Architecture

- Frontend only. No auth gate, API contract or backend file changed (`npm run api:check` passes).
- The library's pages load as one lazy chunk (preloaded after the first paint): the entry chunk is 893.45 kB, below the 900.79 kB baseline.
- `TimetableTable` stays (Home and the catalogue use it). `styles/library.css` selectors are removed in the merge commit.

## Validation

| Command | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | 495 pass, 2 fail (known, unrelated: ExplorerPage timezone; a load-sensitive catalogue editor test, passes alone) |
| `npm run api:check` | PASS |
| `npm run build` | PASS |
| `npm run budget` | PASS (893.49 kB; limit 990.87) |
| `npm run lint:brand` | PASS |
| `E2E_CHANNEL=msedge npm run e2e` | 79/79 pass (incl. 2.1–2.4, the keyboard journey, axe on 34 routes); the search screenshot masks its results (the offline engine orders ties differently per seed) |
| Critique (dual-agent) | Library 28 → **30/40**; Your work 27/28 → **31/40**; detector 0 findings |

## Captures

`before-*.jpg` are the legacy pages; `after-{light,dark}-{1280,1440,1920}-*.jpg` the rebuilt states (library, upload, search, review desk, excluded, bulk, with Help, in service, withdraw, withdrawn/return, needs attention, versions, cited by, ownership, Your work, Jobs); `after-forced-1440-review-desk.jpg` is criterion 2.6.

## Deferred / open

See `docs/redesign/backlog.md` (Area 2 rows). The decisions to confirm at the gate are in `STATUS.md`.
