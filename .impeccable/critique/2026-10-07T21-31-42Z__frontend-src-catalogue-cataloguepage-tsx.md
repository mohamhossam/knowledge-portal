---
target: Phase 1 heuristic review — catalogue browsing
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 6
target_identity: "file:C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\catalogue\\CataloguePage.tsx"
target_fingerprint: "sha256:e612ff11f0f5083983092a7abc910aa85cccf0a6affaac521432bd8caa56abbd"
target_path: "C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\catalogue\\CataloguePage.tsx"
timestamp: 2026-10-07T21-31-42Z
slug: frontend-src-catalogue-cataloguepage-tsx
---
Method: dual-agent (5 × Assessment A by surface group · 1 × Assessment B portal-wide). Group: catalogue browsing. Full report: docs/ux/research/01-heuristic-review.md

## 1. Scores

Nielsen's 10 heuristics, each scored 0–4.

| # | Heuristic | Home + shell + states | Library | Catalogue browsing | Explorer (reader) | Catalogue curation | Requirement knowledge | Squads |
|---|---|---|---|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | 3 | 3 | 3 | 2 | 3 |
| 2 | Match with the real world | 2 | 2 | 3 | 2 | 3 | 3 | 3 |
| 3 | User control and freedom | 3 | 2 | 3 | 2 | **1** | 3 | 2 |
| 4 | Consistency and standards | 2 | 2 | 2 | 3 | 3 | 2 | 2 |
| 5 | Error prevention | 3 | **1** | 3 | 2 | 2 | 3 | 3 |
| 6 | Recognition over recall | 2 | 2 | 3 | 3 | 3 | 3 | 3 |
| 7 | Flexibility and efficiency | **1** | 2 | **1** | 2 | 3 | 2 | **1** |
| 8 | Aesthetic and minimalist design | 3 | 2 | 3 | 2 | 3 | 3 | 3 |
| 9 | Error recovery | 3 | 2 | 2 | **1** | 2 | 3 | 3 |
| 10 | Help and documentation | **1** | **1** | 2 | 2 | 2 | 2 | 2 |
| | **Total /40** | **23** | **19** | **25** | **20** | **25** | **26** | **25** |
| | **Band** | Acceptable | **Poor** | Acceptable | Acceptable | Acceptable | Acceptable | Acceptable |

- **Portal mean: 23.3 / 40, Acceptable.**
- **Weakest heuristics across the portal:**
  - H10 Help: mean 1.7. There is no help entry anywhere, so WCAG 3.2.6 "consistent help" is unmet.
  - H7 Accelerators: mean 1.7.
  - H3 Control and undo: mean 2.3.
  - H5 Error prevention in the library.
- **Strongest:** H6 Recognition and H1 Status. Both are carried by the copy.

The detector found nothing in source (§3), so these scores rest on the design reviews.


## 2. Design-specificity verdict

**Every reviewer reached the same verdict on its own: highly specific, and that is now both the
asset and the problem.** The monumental condensed table numbers, the three rule weights,
weight-as-rank, reference marks that light their notes, connections written as sentences and
decisions set on the row they concern could belong to no other product.

But the specificity serves a **metaphor (a railway timetable book) more than the curation
job**:

- "Table 3:", "edition in force", "There is no table at this address" and the monument numerals
  reach every user, including Explorer readers who have no tables.
- The home page reads as a printed report.
- On the review desk, the book's head pushes the work below the fold.

**Keep for the redesign:**

- the information discipline: weight shows rank, the decision sits on its row, and the
  consequence is written as a sentence before the commit;
- the keyboard models already built;
- the bidi care;
- the "follow a connection, lit way back" move.

**Replace:** the costume and the metaphor's vocabulary.

Against the e& calm rules (CLAUDE.md § Redesign epic) the incumbent conflicts on almost every
visible point:

| Calm rule | Today | Where |
|---|---|---|
| Red only as a brand accent, never status | Red `--disruption` marks failure, overdue and blocking in 22 places, plus the index's "1 needs attention" | `library.css` ×9, `knowledge.css` ×7, `shell.css` ×3, `catalogue.css` ×2, `timetable.css` ×1 |
| Semantic colour always with an icon and text | Red text only; no icons | Same places |
| Maroon for actions, selection and focus | Blue `--reference` for links, focus ring and lit wash; black ink primary buttons | `tokens.css`, `base.css:64` |
| Surfaces from beige-derived tints | Neutral `#fbfbfa` by rule ("Stock Not Cream") | `tokens.css`, DESIGN.md |
| Motion ≤ 200 ms | `.index__rule` transitions for 400 ms | `shell.css:199` |
| Warm-charcoal dark mode | Light only (a recorded decision) | DESIGN.md |
| Fonts self-hosted, calm, with Arabic | Archivo (wdth axis) + Noto Sans Arabic. These are self-hosted, but the 13px labels at 72% condensed width strain at low vision. | `tokens.css` |


## 3. Detector and browser evidence (Assessment B)

- **Static scan:** `impeccable detect --json frontend/src` (96 TSX + 9 CSS) gives **exit 0, 0
  findings**. It was proven to be live with a throwaway canary file, which raised findings.
  Nothing is suppressed, and there is no config.
- **Live scan:** detect.js was injected on 6 pages at 1280×800. No CSP block was seen on the
  Vite dev server.

**Real findings from the live scan:**

| Rule | Where | Detail | Fix |
|---|---|---|---|
| `low-contrast` | The save-bar summary field placeholder | 4.4:1 (`#757575` on `#fbfbfa`). No `::placeholder` colour is set anywhere. | A token-driven placeholder colour |
| `line-length` | `.govsection__lead` (`library.css:779`, used by about 8 catalogue pages) | `72ch` in narrow Archivo comes to about 97 characters per line | Cap at about 60ch |

**False positives:**

- `em-dash-overuse` on the library: the dashes are empty-cell placeholders, not prose.
- `first-viewport-column-overflow` on passage review: this is the intended long queue. The
  empty 120px margin column it exposes is a real layout cost, covered under L-P1b below.

**Where the detector and the reviewers agree:** both found nothing structurally broken in the
code, such as raw colours, gradients or glass. The incumbent's problems are about job fit,
colour semantics, focus management and help, and a pattern detector cannot see those. The
detector added the placeholder contrast failure, which no reviewer caught.


## Priority issues

### Cross-cutting (portal-wide)

**X1 [P1] Red carries status, and urgency is set lighter than routine.**
- **What:**
  - The `--disruption` red marks failure, overdue and blocking (22 refs) with no icon.
  - `index__alert--delayed` is weight 500 while `--due` is 680, so in greyscale "1 needs
    attention" reads *weaker* than "18 to decide".
  - A blocking passage says "Kept" in ink-2 with "Blocking warning" in red beneath it.
- **Why it matters:** it breaks the e& calm rules, carries meaning by colour alone, and leaves
  the hierarchy upside down.
- **Fix:**
  - semantic `--color-danger` and `--color-warning` tokens, distinct from brand red and always
    with an icon and words;
  - a single status vocabulary in which severe is never lighter than due;
  - a maroon focus ring.
- **Command:** colorize → quieter.

**X2 [P1] No consistent help, no shortcut help, and no glossary anywhere.**
- **What:** help is section leads and footnotes only. The keys line exists on Library review and
  catalogue Sources only. Terms collide:
  - "review" means passage review and also re-confirmation;
  - "Search" means the Search page and also the "Search versions" tab;
  - "Waiting" means undecided and also "Waits for another".
- **Why it matters:** WCAG 3.2.6 and PRODUCT.md's "consistent help" are unmet, and both
  first-timers and occasional check-in users pay for it.
- **Fix:** a help entry at the same place on every page, `?` shortcut help, and a glossary with
  one term per concept.
- **Command:** clarify + onboard.

**X3 [P1] Focus is lost on route changes and in-place panels.**
- **What:**
  - **Route changes:** `Shell.tsx` has no location effect. Following a link leaves focus on
    `<body>` and keeps the old scroll position. Measured live: from scrollY 2439 the new page
    opened at 535.
  - **Panels:** the Withdraw panel (`DocumentPage.tsx:221-233, 349`) and the Squads/People
    Edit/Remove panels (`PeoplePage.tsx:77`, `SquadListPage.tsx:59-64`) neither take focus on
    open nor return it on close.
  - **Disabled-with-reason controls:** they use native `disabled`, so the reason is unreachable
    by keyboard or screen reader. This contradicts DESIGN.md's own `aria-disabled` rule. Seen
    at `PublishPage.tsx:108`, `SuggestionRow.tsx:290`, `CheckPage.tsx:145`,
    `DraftActions.tsx:46,78,140`, `DraftEdits.tsx:72` and `DocumentPage.tsx:513-530`. The last
    one also has a dangling `aria-describedby`.
- **Why it matters:** WCAG 2.4.3 and 4.1.2. Sam loses their place on every navigation.
- **Fix:**
  - on a route change, reset scroll and focus `#main` or the page's h1;
  - one disclosure-panel primitive with focus-in and focus-return;
  - `aria-disabled` with a visible reason everywhere.
- **Command:** harden.

**X4 [P1] There is no accelerator layer beyond two keyboard islands.**
- **What:**
  - j/k/x/i/e/o work on passage review and j/k/Enter/a/r/e on Sources, but only while a row has
    focus.
  - The shell puts 9 Tab stops before content on every page, and the catalogue index puts 32
    before the sheet, with no skip.
  - "Find a system" ignores Enter and the arrow keys.
  - There is no "next flagged", "next unreviewed" or "next that needs me".
  - There is no bulk exclude and no multi-select.
  - Search queries are not kept in the URL.
  - Single-letter keys on a non-grid `<tr>` collide with NVDA and JAWS browse-mode quick keys.
- **Why it matters:** the review-burst rhythm (PRODUCT.md principle 4).
- **Fix:** a portal-wide keyboard map with grid semantics, skip links per region, combobox find,
  next-item keys, bulk selection and filters held in the URL.
- **Command:** harden → shape (interaction model, Phase 2).

**X5 [P2] The metaphor's vocabulary and chrome cost space and meaning.**
- **What:**
  - "Table N", "edition in force" and "There is no table at this address" appear throughout.
  - The monument column takes about 120–150px on every page, including Search and the review
    desk.
  - At 1024×768 the chrome stack takes about 30% of the viewport before content.
  - At 200% zoom, content starts below the fold.
  - The index's extent bars compare unlike units (12 documents, 31 systems, 3 squads) and draw
    3% for zero.
- **Fix:** plain nouns; a compact shell; drop or rebase the cross-table bars.
- **Command:** clarify + distill + layout.


### Catalogue browsing and Explorer (25/40 · Explorer 20/40)

**C-P1a [P1] The version being read is ambiguous.**
- **What:**
  - Any `/architecture/versions/:id` page looks like the version in service apart from one
    edition sentence (`CataloguePage.tsx:106-124`).
  - The shell index keeps showing the in-service counts.
- **Fix:** a persistent version-state line with a calm distinct surface tint for any version not
  in service, and the put-back action placed beside its consequence.
- **Command:** clarify.

**C-P1b [P1] Provenance is not one step away on the read path.**
- **What:** published facts carry no source, and no "introduced in / changed in which version, by
  whom". Governance sources are empty in the seed.
- **Fix:** a provenance-trail pattern built from what exists: per-entity version history linking
  to the diff and, where a draft had one, the evidence passage.
- **Command:** shape.

**C-P1c [P1] A stale Explorer link silently shows a different scenario.**
- **What:** `pickScenario` (`explorer/scenario.ts:101-110`) falls back to the first offering,
  order type and channel with no notice, and leaves the URL unchanged.
- **Why it matters:** a requirement author arriving from requirement-portal reads the wrong
  systems as the answer.
- **Fix:** a notice plus `replace` of the URL.
- **Command:** harden.

**C-P2 [P2] The reader's Explorer is not lighter.**
- **What:**
  - It keeps the monument "2" and "Table 2:".
  - It has 13 sections, about 6 of them "No … recorded".
  - The download sits above the answer.
  - Curator to-dos are set in bold.
  - System names are dead text.
  - At 390, "Systems in this order" starts below the fold.
- **Command:** distill → adapt.

**C-P2 [P2] Diffs name fields without values.**
- **What:** "Changed · where it sits" gives no from → to. Removed rows are ink-3, so the most
  consequential rows are the quietest.
- **Also:** the hidden caption "Depends on: CWOM" is heard with the opposite meaning.
- **Command:** clarify.


## 7. Persona red flags (consolidated)

- **Alex, the power user:**
  - No undo on `r`.
  - No multi-select or bulk exclude.
  - No "next flagged" or "next that needs me".
  - Keys work only while a row has focus.
  - Enter does nothing in Find.
  - 9–44 Tab stops before the work.
  - Search queries are lost on Back.
  - The editor's system selects are native lists of 30+ with no search.
- **Sam, screen reader, keyboard-only or zoom:**
  - Focus drops to `<body>` after navigation and panels.
  - Disabled-with-reason controls are skipped, so the reason is never heard.
  - Single-letter keys clash with NVDA and JAWS browse-mode keys.
  - A row's changed status is not announced.
  - Reference marks are 10×12px.
  - 13px condensed labels.
  - Four `role="alert"` regions fire at once if the API is down.
  - A refresh-label live region that chatters.
  - At 175–200% zoom, the chrome pushes content off-screen.
- **Knowledge owner on a 300-passage bilingual policy:**
  - No progress marker.
  - Duplicate columns.
  - The original preview is often "unavailable" for slides and plain text.
  - An Arabic `dir="auto"` h1 swings right, away from the head.
  - No summary of what goes live at approval.
- **Architect turning a long document into a release on a deadline:**
  - "Being read" shows no progress or estimate.
  - The same identity question is asked twice (as a new system, then as a dependency).
  - The next decision is thousands of pixels away.
  - Publishing with 18 undecided needs only a reason.
  - The build runs in the browser tab.
- **Architect on a 2-minute ownership check-in:**
  - The gap count isn't clickable.
  - About 3,000px of scrolling to reach the gaps.
  - No suggested squad.
  - History confirms nothing.
- **Requirement author reading the Explorer:**
  - "Table 2" and "curating is for knowledge admins" greet them.
  - Unexplained, unlinkable acronyms.
  - A stale link silently swaps the offering.
  - Curator to-dos read as alarms.


## 9. Questions this raises for Phases 1b–2

1. Should home be "yours first, then everyone's", with a single ranked next-decisions queue
   shared by the shell, instead of four equal tables?
2. What does "approved by its owner" certify if no passage has to be seen? Should approval
   record coverage, such as "looked at 212 of 800, opened all 3 flagged"?
3. Is "a decision stays" a product principle or a backend convenience? Would a short undo
   window make curators both faster and safer?
4. Should the draft be a mode with its own stepped workflow, and should reading a non-service
   version happen in a visibly different "proof" surface?
5. If published releases can never carry per-fact passages, is provenance per version (who
   introduced or changed this, when and why)? If so, should the sheet lead with that?
6. Is the Explorer a different product for a different audience? It could be systems first,
   with no table vocabulary, and "unknown" instead of to-dos.

These are **hypotheses for research**, not decisions. They feed the interview guide (RQ1–RQ5
and RQ10 in `plan.md`) and the Phase 2 interaction model.
