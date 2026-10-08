# Area 2: Library

**Branch:** `feat/kb-redesign/library` · **Gate:** GATE 8.2 · **Journey 1** (T2, T3, T4, T10)

## 1. Goal

Build the library to the prototype:

- **Documents:** Browse, with the filters and sort in the URL, and upload as a flow opened in
  place.
- **Search passages:** the query in the URL; a result opens at its passage.
- **The document record:** with the **review desk** as its main tab while a version waits for
  review.
  - Progress and "seen".
  - A passage grid beside a sticky passage pane.
  - Bulk exclude, with one reason.
  - A one-line save bar.
  - Approve and publish through a consequence panel that shows the coverage and the dependants.
- **Withdraw** and **return to service** through consequence panels, with who cites the
  document shown first (§5, §11).

## 2. Routes

| Current | Target | Note |
|---|---|---|
| `/library` | `/library?status=&owner=&sort=&dir=` | The filters and sort are in the URL |
| `/library/search` | `/library/search?q=` | |
| `/library/:id` (index = ReviewPage) | `/library/:id`: Review while a version waits, else Overview | Same URL |
| `/library/:id/versions`, `/ownership` | same | |
| `/library/:id/citations` | `/library/:id/cited-by` | The redirect is built in area 10; this area adds the new route and keeps the old one working until then |
| — | `/library/:id#passage-:blockId` | The desk opens at that passage, focused (the prototype behaviour) |

The route map also proposes `/library/:id/passages/:blockId`. **Decide at the gate:** the hash
form is built and works; a path form only adds a route.

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `library/LibraryPage.tsx`, `SearchPage.tsx`, `DocumentPage.tsx` (record + desk), `VersionsPage.tsx`, `CitationsPage.tsx` (→ Cited by), `OwnershipPage.tsx`, `PassageTable.tsx` (→ `DataTable` grid + pane), `LibraryRetry.tsx`, `AdminGrant.tsx` |
| Keep (logic) | `library/model.ts`, `publications.ts`, `searchContext.ts`, `documentContext.ts`, `useDocument.ts` |
| New | `library/ReviewDesk.tsx`, `library/StandingPanel.tsx` (withdraw / return), `library/UploadFlow.tsx`, `library/docState.ts` (from `design-lab/wireframes/data.ts` `docState` + `DOC_TONE`) |
| Remove (in the merge) | `styles/library.css` selectors the new pages no longer use (most of the file); `timetable/TimetableTable.tsx` only if no other area uses it (check; area 4 probably does) |
| Tests | Keep and adapt `PassageTable.test.tsx`, `curation.test.tsx`, `governance.test.tsx`. Add desk keyboard tests: j/k, n, x then reason then Enter, Space + Shift, Ctrl+Enter save, and unsaved counted against the last save. |

## 4. Prototype reference

- **Routes:** `/library`, `/library/search?q=…`, `/library/:id` on 'Product eligibility matrix
  (sample)' (the desk), and 'XGPON coverage rules (sample)' (withdraw).
- **Captures:** `*-02-library`, `*-03-review-desk`, `*-04-review-desk-excluded`,
  `*-05-withdraw-consequence`, `*-16-library-390`, `forced-03-review-desk`.
- **Code:** `design-lab/prototype/pages/Library.tsx` and `Document.tsx`.

## 5. Archetype and components

| View | Archetype | Components |
|---|---|---|
| Documents | Browse | `PageHeader`, `FilterStrip` (counts, Clear), `Select` (Owner), `DataTable` (sortable, row header, bidi, numeric), `Status`, `EmptyState`, `Skeleton`, `Upload` |
| Search | Browse | `TextField` (`data-find`), `Button`, quote figures (`ds-quote`), `EmptyState` |
| Record | Record | `PageHeader` (meta, provenance, actions), `SubNav`, `Facts` (promote from the prototype into the design system if a second area needs it) |
| Review desk | Review desk | `FilterStrip` (with find), a keys hint, `SplitPane`, `DataTable` grid (`onRowKey`, selection), `TextArea` / `TextField`, `BulkActionBar`, `ConsequencePanel`, `StickyFooter`, `Button unavailableReason` |
| Withdraw / return | Consequence | `ConsequencePanel` (`tone="danger"` for withdraw), `Status` for "unknown, not zero" |

## 6. States

- **Documents:** loading, empty ("No documents yet." + Upload), no matches (Clear filters), and a
  failed read per document ("Needs attention" with its cause and *Upload a new version*).
- **Document states:**
  - Being read (Working);
  - Ready for review;
  - In service;
  - Withdrawn (Stopped);
  - Needs attention;
  - Held (the malware scan).
- **Desk:**
  - more than 200 passages: "Show the next 200 of N";
  - nothing matches the filter;
  - blocking warnings ("N block approval", and Approve unavailable with its reason);
  - a save conflict, 409 ("Someone changed this review while you were working…"; your
    decisions stay);
  - a failed save.
- **Requirement AI unreachable:** "The count is unknown, not zero" in Cited by and in withdraw.
- **Upload:**
  - Waiting → Working (scan, read) → Done;
  - Held, with why;
  - Needs attention, with the fix;
  - the flow can be left at any time, and Jobs shows the progress.

## 7. Interaction

The desk's keys (inside its grid only):

| Key | Does |
|---|---|
| ↑ ↓ / j k | Move |
| Home / End | First / last |
| n / Shift+n | Next or previous flagged or unseen |
| x / i | Exclude (focus moves to the reason) / include |
| e | Edit |
| o | Show the original |
| Space, Shift+↑/↓ | Select |
| Ctrl+Enter | Save, anywhere in the desk |

Enter in the reason field returns focus to the row; Esc leaves the edit field.

"Seen" is per reviewer, for this session only (BG2), and is shown at approval.

## 8. Content

- **Glossary terms:**
  - Passage;
  - Flagged;
  - Blocks approval;
  - Seen;
  - In service;
  - Cited by;
  - Withdraw;
  - Return to service.
- **Locations in words:** "Sheet 1, row 2", never "Worksheet 1!2:2".
- **The publish panel** follows this order: what becomes citable, then what it replaces and who
  cites that, then the coverage, then reversibility.

## 9. Backlog items

- **O-1:** `n` goes to the next flagged passage first, then the next unseen.
- **O-2:** select by location ("Select Sheet 2").
- **O-3:** table rows as labelled cells, not "A4=… | B4=…".
- **K1:** at 1280×800, the save bar on one line; re-measure.
- **K2:** set `lang` from the document's `language`.

## 10. Acceptance criteria (area-specific)

- **2.1** At least 10 passage rows are visible at 1440×900 in compact density, and the chrome is
  at most 15% of the view at **both** 1440×900 and 1280×800 (the measure script from Phase 6,
  ported to e2e).
- **2.2** Keyboard-only T2 completes: exclude the hidden-sheet rows with a reason, save, approve
  and confirm (e2e).
- **2.3** Withdraw shows the dependants count, or "unknown, not zero", **before** the confirm
  button in reading order (e2e on the a11y tree).
- **2.4** A search result opens the desk with that passage focused (e2e).
- **2.5** After a save, Approve becomes available, and unsaved changes are counted against the
  last save (unit).
- **2.6** In forced colours, the current row, the selected rows and the pressed filters are all
  distinguishable (a screenshot at the gate).

## 11. Out of scope

- Search builds and table-aware indexing beyond relabelling: keep the current behaviour, renamed
  "Search build" per the glossary.
- Storing coverage (BG2).

## 12. Risks

- **`PassageTable` tests encode the old grammar** (decision on the row). Adapt them to the new
  behaviour, but don't delete coverage: each old assertion maps to a new one or is recorded as
  intentionally dropped.
- **Large documents (800 passages):** keep 200 rows rendered at a time. The DataTable rows are
  plain; check scroll performance at 1920.
