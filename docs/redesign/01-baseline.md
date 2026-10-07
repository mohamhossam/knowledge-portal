# 01 · Technical baseline (Phase 0)

- **Taken:** 2026-10-07 on `feat/kb-redesign` = `main` @ `b6114b9`.
- **Machine:** Windows 11, Node via npm, timezone UTC+4.
- **Stack:** the offline fake stack:
  - `LLM_PROVIDER=fake`, `PERSISTENCE_PROVIDER=memory`, `IDENTITY_PROVIDER=fake`,
    `LIBRARY_SCAN_MODE=offline`;
  - launch configs `redesign-api` (:8110) and `redesign-web` (:5184), because :8100 and :5174
    were held by another session;
  - seeded with `scripts/seed_demo.py`.

## Frontend gates

| Command (in `frontend/`) | Result | Time | Notes |
|---|---|---|---|
| `npm run lint` | PASS (exit 0) | 92 s | |
| `npm run typecheck` | PASS (exit 0) | 13 s | |
| `npm test` | **FAIL (exit 1)**: 265 passed, 1 failed, 36 files | 50 s | See below |
| `npm run api:check` | PASS (exit 0) | 10 s | Generated types match `contracts/knowledge-public.openapi.json` |
| `npm run build` | PASS (exit 0) | 17 s | Warns that one chunk is larger than 500 kB |

**The pre-existing test failure is timezone-dependent, not a regression.**

- Test: `src/explorer/ExplorerPage.test.tsx:139`, "reads the offering's plans and prices from the
  product catalog, saying which and when".
- It expects `read at 09:30, 5 Oct 2026` and receives `read at 13:30, 5 Oct 2026`.
- The fixture time is formatted in local time. CI runs in UTC, so it passes there and fails on
  any machine east or west of UTC.
- It is out of scope for the redesign and logged as a separate fix.

Backend gates (`pytest`, `ruff`, `mypy`, `lint-imports`) were not run. The redesign does not
touch `src/`, and the deny list blocks editing it.

## Bundle (production build)

| Asset | Size | gzip |
|---|---|---|
| `index-*.js` (main chunk) | **900.79 kB** | **241.51 kB** |
| `generate-*.js` (lazy chunk) | 43.17 kB | 14.95 kB |
| `index-*.css` | 58.99 kB | 10.88 kB |
| `index.html` | 0.90 kB | 0.47 kB |
| Fonts, Archivo variable wdth (latin, latin-ext, vietnamese; woff2) | 90.10 + 86.24 + 34.46 kB | — |
| Fonts, Noto Sans Arabic 400/600 (woff2 + woff) | 48.84 + 53.26 + 79.08 + 84.98 kB | — |

**Bundle budget for Phase 7:** the main chunk must not grow more than 10% over **900.79 kB**
(ceiling **990.87 kB** minified), measured the same way.

## "Before" screenshots

`docs/redesign/before/` holds full-page JPEG (q80) captures, named `<route>@<width>.jpg`, 106
files and 16 MB in all.

- `capture-log.json` records the route, title, page height, load time and console errors of
  each capture.
- `library-doc2-review` and `library-doc5-review` are clipped to their first 4,000 px. Their full
  heights are in the log.
- Reproduce the captures with `docs/redesign/tools/capture-routes.mjs`.

| Set | Persona | Widths | Captures |
|---|---|---|---|
| Admin routes: home, library + 12 document pages, the document sub-pages, reminders, requirement knowledge ×4, catalogue in service ×11, both versions × 5 sub-pages, compare, explorer, squads ×4, 404 | `fake-owner` | 1280×800, 1920×1080 | 50 routes × 2 |
| Reader routes: explorer, no-access | `fake-observer` | 1280, 1920, 390 | 2 routes × 3 |

**Not captured, because the seed has no data for them:**

- a historic requirement record;
- a catalogue evidence page (no `evidence/` link on the seeded draft's Sources page);
- requirement-knowledge rows (that corpus lives in requirement-portal).

These must be covered in Phase 1 by a seeded state or a fixture.

**Console errors seen:** only the reader persona's expected `403` on the admin probe. No admin
route logged an error.

**Tallest pages** (they show the scrolling cost of review work):

| Page | Height at 1280 |
|---|---|
| "Product eligibility matrix" document review | 17,305 px |
| "Customer care handbook" | 12,958 px |
| Explorer | 3,353 px |
| Draft Sources | 3,312 px |
| Changes of the initial catalogue | 3,314 px |
| Home | 3,137 px |
| Squads › Products | 3,139 px |
