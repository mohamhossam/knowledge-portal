# 01 · Heuristic review of the current UI (the Timetable Book)

| | |
|---|---|
| Phase | 1, step 1 (expert evidence) |
| Date | 2026-10-08 |
| Method | Impeccable critique, dual-agent: five isolated design reviews (Assessment A, one per surface group) and one isolated detector + browser run (Assessment B). The parent synthesised them. Two claims were re-verified in code. |
| Stack | Offline fake stack, `redesign-api` :8110 + `redesign-web` :5184, seeded with `scripts/seed_demo.py`. No data was changed. |
| Evidence type | **Expert review, not user evidence.** It ranks below anything users report at GATE 1a. |
| Scope limits | Requirement knowledge and historic records were judged as empty states only (user decision, GATE 0). The filled Reminders states were judged from code (the seed has nothing due). Governance and provenance have no seeded data. |

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

## 4. Priority issues

The list below is **cross-cutting first**: these shape the whole redesign. Per-area issues follow.

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

### Home, shell and system states (23/40)

**H-P1 [P1] The home page is a report, not a queue.**
- **What:**
  - Four equal tables, 3,137px tall at 1280.
  - The index alert and the table's next decision rank priorities differently (`derive.ts`
    vs `alertOf`).
  - There is no "mine" view.
  - Table 2 and 3 row names are not links.
- **Fix:** one ranked "your next decisions" block, driven by a single shared priority function,
  with tables collapsed to a line each and zero totals hidden.
- **Command:** distill → layout.

**H-P2 [P2] Reminders cannot be found when nothing is due.**
- **What:** `ReviewsDue` renders nothing at zero (`Shell.tsx:121`), so "nothing is due" is never
  said.
- **Fix:** a permanent shell entry, and one term ("Re-confirmations").
- **Command:** clarify.

**H-P2 [P2] No-access is a dead end for readers.**
- **What:**
  - The primary button sends the reader away ("Go to Requirement AI").
  - The Explorer, the one thing they can use, is an inline link.
  - The page never says who they are signed in as.
  - `knowledge_admin` is shown as code.
- **Command:** clarify.

**H-P2 [P2] The 404 page lists "four tables" and leaves out the Explorer and Reminders.**
- **What:** it also does not echo the address that was asked for.
- **Command:** clarify.

### Library (19/40, Poor: the weakest area)

**L-P1a [P1] A withdrawn document can be re-approved in one click** (re-verified in code; the
reviewer raised it as P0).
- **What:**
  - `approvalBlocker` (`model.ts:259-274`) ignores withdrawn publications.
  - On "Legacy ADSL ordering", "Approve and publish" is enabled. Nothing frames it as a return
    to service, there is no confirmation, and the withdrawal reason is not shown.
  - No approval anywhere states what goes live, how many passages, or who cites the edition it
    replaces.
- **Fix:**
  - show the withdrawal reason above the review;
  - rename the action "Return to service…" and require an inline confirmation with a reason;
  - give every approval an inline consequence summary.
- **Command:** harden.

**L-P1b [P1] Review progress is not tracked, so "nothing published unreviewed" is nominal.**
- **What:**
  - Every block starts as "Kept", and save rules pass without a row ever being opened.
  - There is no "seen" state, no progress count, no "next flagged or changed" and no
    "Unreviewed" filter.
- **Fix:** mark rows as seen on focus or open, show "212 of 800 looked at", add `n`/`p` next
  flagged, and consider requiring that every flagged row is opened before approval.
- **Command:** shape → harden.

**L-P1c [P1] The first viewport is starved.**
- **What:**
  - At 1440×900 the passage table starts at y≈644 and the save bar takes 116px, leaving about
    two rows.
  - At 175% zoom, 40% of the height is sticky chrome.
  - The save bar's fixed `scroll-padding-bottom: 9rem` (`library.css:661`) lets it overlap the
    focused row by 12px once it wraps.
  - In a first edition, "As extracted" and "Reviewed" are identical columns.
- **Fix:**
  - drop the monument on working pages;
  - collapse the head to one edition line;
  - fold file warnings into a disclosure;
  - show one text column until the text differs;
  - set the padding from the save bar's measured height.
- **Command:** layout + distill + harden.

**L-P2 [P2] Engine jargon reaches users.**
- **What:** "A2=Bundle 001 | B2=SMB", "Worksheet 1!2:2", "table-aware version", "neutral heading
  line positions".
- **Also:** a CSV that failed on its delimiter offers only "Read it again", which will fail the
  same way.
- **Command:** clarify.

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

### Catalogue curation, the draft (25/40)

**D-P1a [P1] Irreversible decisions at keystroke speed, and a bulk set nobody can inspect.**
- **What:**
  - `r` rejects immediately (`SuggestionsPage.tsx:200-201`), and "a decision stays"
    (`SuggestionRow.tsx:202`).
  - The bulk "Accept the 4 ready and the 10 that wait on them" has no preview, and there is no
    "Ready" filter.
  - A bulk accept is recorded exactly like a read decision.
- **Fix:** an undo window or reopen while the draft is in preparation, "Show the 14 it accepts",
  a Ready filter, and `via: bulk` in provenance.
- **Command:** harden.

**D-P1b [P1] AI vs human and provenance are invisible where they matter.**
- **What:**
  - Proposed rows never say a model suggested them, and there is no confidence.
  - Decided rows don't show who decided.
  - Changes and Publish list alterations with no origin: suggestion, hand edit or file.
  - Changes doesn't mention the 18 undecided suggestions.
  - The cited passage highlights a 12-line chunk, not the quoted line.
- **Command:** clarify + shape.

**D-P1c [P1] The draft's sequence is not legible as a sequence.**
- **What:**
  - Sources → Changes → Check → Publish are items 7–10 of an 11-item sub-index, with no order or
    state.
  - The next decision sits at the galley's foot (y≈3187).
  - Sources stacks four jobs: documents, change requests, catalogue file and suggestions.
- **Fix:** a stepped draft workflow with live state per step, the next decision pinned near the
  work, and the catalogue file moved off the review path.
- **Command:** layout.

**D-P2 [P2] Check results vanish, and publish failures aren't explained.**
- **What:**
  - Check results live in `useState` (`CheckPage.tsx:95`) and are gone by Publish.
  - Publish shows no mapping verdict.
  - The 409 on publish, rename and file replace shows raw server text (`PublishPage.tsx:106`,
    `DraftActions.tsx:44`, `CatalogueFile.tsx:105`).
  - "Build, then publish" runs client-side (`useEditing.ts:77-87`), so closing the tab silently
    stops it.
- **Command:** clarify + harden.

**D-P2 [P2] Bidi bug.**
- **What:** `waitsFor` and `changeSentence` join names into plain strings
  (`suggestions.ts:203-217`), so adjacent Arabic names display reversed.
- **Fix:** `<bdi>` per name.
- **Command:** harden.

### Requirement knowledge (26/40) and Squads (25/40)

**S-P1 [P1] The Squads check-in job is buried.**
- **What:**
  - 21 of 26 gaps sit in the closing section.
  - The next decision is at y≈3013, and the first "Give" is 23 Tab stops in.
  - The "26 no squad" count is a non-interactive `role="status"` (`SquadsPage.tsx:87-107`).
  - The Squad select doesn't suggest the squad that runs sibling systems.
  - The contact list ignores squad membership.
- **Fix:** make the gap count a filter, place the next decision under the notice, add a find, and
  default the select from siblings.
- **Command:** layout → onboard.

**R-P2 [P2] The empty corpus asserts health.**
- **What:**
  - "Every requirement is indexed, and no finding stands open." is said over 0 requirements
    (`home/tables.ts:73`).
  - Nothing says the corpus lives in requirement-portal, or whether it answered.
  - Full filter strips render on zero rows.
  - The sub-index jumps 16px between the Overview and the inner pages.
- **Command:** clarify.

**S-P2 [P2] Destructive steps are under-described, and History is not provenance.**
- **What:**
  - Removing a squad counts the orphaned systems but doesn't name them.
  - "Remove it" looks like "Save" (`edit-panel--remove` has no CSS).
  - History says only "Saved the person X", with no field diff and no link.
- **Command:** clarify + harden.

## 5. What the Timetable Book does well

1. **Consequence before commit, in words.** Put-back states its consequence first: 30 systems,
   which domains, offerings and journeys go, and the mapping impact, with a reason required.
   Other examples:
   - Withdraw requires a reason.
   - People can't be deactivated while they hold a role, and the page says why.
   - Retiring a requirement says which findings close.
   - The catalogue file shows its diff before Replace.
   - Removing a draft needs an acknowledgement.
2. **Changes and connections as sentences, with honest bulk labels.**
   - "Gets events from CWOM".
   - "Accept the 4 ready and the 10 that wait on them".
   - "Waits for the system Order Hub".
   - Next decisions written as verb + count + destination.
3. **Decisions sit on the row they concern, and open in place.**
   - "No squad · Give it to a squad" sits on one line; focus goes to the field, the row lights
     after the save, and focus returns to the row.
   - A passage's detail row opens in place on the band.
   - Following a connection lights the way back ("Back to CWOM", the return row lit).
4. **Real keyboard models where they exist.**
   - Roving tabindex (one tabbable row of 200).
   - `x` focuses the reason field.
   - Esc layering returns focus correctly on Sources and passage review.
   - Paging past 200 rows on `j`.
5. **Careful bidi and structure.**
   - 274 `dir` attributes.
   - `lang="ar" dir="rtl"` on Arabic lines.
   - `<bdi>` in search results.
   - Labelled navs, real tables with captions and row headers, and a skip link.
   - 80px scroll-padding under the sticky masthead.
   - No horizontal scroll at 375.
   - Reduced motion honoured.
6. **Colour discipline in code.** There is no raw colour outside the token file, and every text
   token passes AA. This makes the migration to semantic tokens mechanical.

## 6. Where the Timetable Book fails users

1. **It optimises for reading a book, not for working a queue.** The home page is a report, the
   review desk shows two rows, and "what needs *me*" has no view (H-P1, L-P1c, S-P1).
2. **Review is nominal.** Nothing records that a passage was looked at. A bulk accept looks
   like a read decision. A withdrawn document can be republished with one click (L-P1a,
   L-P1b, D-P1a).
3. **Provenance stops at the draft.** Published facts and change lists don't say where they
   came from or who decided. Nothing marks AI proposals as such (C-P1b, D-P1b).
4. **There is no help and few accelerators outside two islands**, and the islands' single-letter
   keys collide with screen-reader quick keys (X2, X4).
5. **Focus management fails between pages and around panels** (X3).
6. **Its colours break the e& calm brand.** Red is status, blue is focus and links, neutral
   stock is not beige, and there is no dark mode (X1).
7. **The metaphor leaks into the language and the space.** "Table 3" and "edition in force"
   reach users, and the monument column and chrome cost up to 30–40% of the viewport (X5).

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

## 8. Minor observations

- **Copy and states:**
  - Stale copy (`DraftDocuments.tsx:141`): "edit the draft by hand in the next edition of the
    portal". Hand edits already ship.
  - Library counts disagree across views: 12 documents in the index, 5 in service, 7 rows.
  - History shows 12 rows at the same minute, with no seconds or grouping.
  - The 13px change-notice title is too weak for the page's key summary.
- **Missing features and placement:**
  - The library table has no status filter or sort.
  - A search result opens the document head, not the passage.
  - Compare selects cut names off ("in service, 7 Oct 202").
  - "Remove this draft" sits beside "Rename it" at equal weight on every draft page.
- **Structure and mark-up:**
  - Two heavy rules stack with an empty band between them on the empty Reminders page.
  - The Reminders head keeps an empty 7.5rem margin column.
  - "Find a title" and "Find a person" lack `dir="auto"`.
- **Detector findings (§3):**
  - placeholder contrast 4.4:1;
  - `.govsection__lead` at about 97 characters per line.

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
