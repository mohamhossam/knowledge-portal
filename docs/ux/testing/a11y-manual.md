# Manual accessibility kit (Phase 6)

- **Phase:** 6, the second half of **GATE 6**, beside the round 2 usability test (`round-2/`).
- **Target:** WCAG 2.2 AA, on the hi-fi prototype at `/knowledge/design-lab/prototype`.
- **What automated checks miss.** Automated checks (vitest component tests now; axe in Phase 7)
  catch roughly a third of WCAG failures. This kit covers the rest by hand:
  - keyboard only;
  - NVDA;
  - zoom and reflow;
  - Windows contrast themes;
  - reduced motion.
- **Who.** One tester runs it, about 2½ hours in all. If possible, add a regular screen-reader
  user for the NVDA part (see "Who should run it").
- **Results:**
  - record them in `a11y-results.csv`;
  - one row per check;
  - **Pass**, **Fail** or **Blocked**;
  - plus a note and a severity for each failure.

Nothing in this kit is a result yet. The "Expected" columns say what the markup is built to do,
which is not the same as having been heard or seen by a tester. Until you run it, every expected
outcome is a **HYPOTHESIS**.

## Setup

1. **Start the fake stack.** Use the launch configs `redesign-api` (:8110) and `redesign-web`
   (:5184).
2. **Seed it.**
   - Run `uv run python scripts/seed_demo.py --api http://127.0.0.1:8110`.
   - Seed again whenever the API restarts, because restarting empties it.
3. **Open the prototype.**
   - Go to `http://localhost:5184/knowledge/design-lab/prototype/` at 1280×800 or larger, browser
     zoom 100%.
   - In the lab bar set Scenario to *Happy path* and Theme to *Light*.
   - In Account set Density to *Automatic*.
4. **Use one browser per run and record which.** We recommend:
   - NVDA with **Firefox** (the pairing most NVDA users have);
   - keyboard, zoom and contrast checks in **Edge** (the managed desktop browser).
5. **NVDA settings.**
   - Use NVDA 2025.x or later, with default settings and the speech viewer on (NVDA menu › Tools
     › Speech viewer), so you can copy what was said.
   - Turn off "Automatic focus mode for focus changes" **only** if a step says so.
6. **The lab bar is scaffolding** (the dashed strip at the top). Skip it in tab-order checks; it
   is not part of the design. Two things are lab artefacts and are not to be reported as product
   failures:
   - the "Same page as a wireframe" link;
   - the striped look of the lab bar.
7. **Every write is simulated and nothing is saved.** Reload to reset.

### Severity

| Severity | Meaning |
|---|---|
| **Blocker** | A task can't be completed with this method (keyboard, NVDA, zoom, contrast theme) |
| **Serious** | Completed only with a workaround, or wrong information given (for example, a state that isn't announced) |
| **Moderate** | Completed, but slowly or confusingly |
| **Minor** | Polish |

Every Blocker and Serious finding gets a WCAG reference.

## Part A: keyboard only (about 50 minutes)

- Put the mouse away; use Tab, Shift+Tab, the arrows, Enter, Space and Esc only.
- Keep page-wide shortcuts **off** (the default) unless a step turns them on.
- **For every step, check four things:**
  1. You can reach the control.
  2. Focus is **visible**: a 2px maroon ring with a light halo, or Windows' own highlight in a
     contrast theme.
  3. Focus is **not hidden** behind the masthead, the sticky state line, the save bar or the
     selection bar (WCAG 2.4.11).
  4. The order makes sense.

### A0. Shell (every page)

| # | Step | Expected |
|---|---|---|
| A0.1 | Load `/`. Press Tab once. | "Skip to content" appears, top-left. |
| A0.2 | Tab again. | "Skip to navigation". |
| A0.3 | Press Enter on "Skip to content". | Focus lands in the page; the next Tab reaches the page's first control, not the rail. |
| A0.4 | From the top, Tab through the masthead. | The order is logo/home → Requirement AI → Jobs → Help → Account. The masthead is the same, in the same order, on every page (WCAG 3.2.3, 3.2.6). |
| A0.5 | Press Enter on Help, then Esc. | The Help panel opens beside the page with focus on its title; Esc closes it and focus returns to Help. |
| A0.6 | Open Account; change Density with the arrows; Tab to the shortcuts checkbox and press Space. | Radios move with the arrows; the "Saved" line updates; the checkbox is 24px with its label clickable. |
| A0.7 | With shortcuts on: press `?`, then `g` `l`, then `/`. Turn shortcuts off and repeat. | On: `?` opens Help, `g l` goes to Library, `/` focuses the find field. Off: nothing happens (WCAG 2.1.4). |
| A0.8 | Follow any rail link. | Focus moves to the new page's h1 (the h1 itself is focused, with no ring drawn on it), and the view starts at the top. |

### A1. Journey 1, library publication (T2, T3, T4)

| # | Step | Expected |
|---|---|---|
| A1.1 | Library: Tab to the filters; press Enter on "Ready for review". | The button is pressed (`aria-pressed`); the table filters; "Clear filters" appears. |
| A1.2 | Tab to the "Document" header and press Enter twice. | The sort toggles ascending and descending, with an arrow. |
| A1.3 | Press Enter on "Upload documents", then Tab to the file control and choose a file. | The upload flow opens in place with focus inside it; the Esc key closes it and focus returns to "Upload documents". |
| A1.4 | Open 'Product eligibility matrix (sample)'. Tab until the passage grid. | **One** tab stop enters the grid, on the current row's "Where" cell. |
| A1.5 | In the grid, press ↓ ↑ j k Home End. | The current row moves; the progress line counts "Seen". |
| A1.6 | Press `n`, then `Shift+n`. | The next, then the previous, flagged or unseen passage. At the end, an announcement says there are none (polite). |
| A1.7 | Press `x`, type a reason, press Enter. | Exclude moves focus to "Why exclude it?"; Enter returns focus to the same row. The row reads struck through, with its state "Excluded". |
| A1.8 | Press `i`. | The row is included again. |
| A1.9 | Press `e`, edit the text, press Esc. | The edit field takes focus; Esc returns to the row. |
| A1.10 | Press Space, then Shift+↓ twice. | Three rows are selected; the selection bar appears at the bottom and **doesn't cover the focused row**. |
| A1.11 | Tab to "Exclude 3…" and press Enter; give a reason; confirm. | The consequence panel opens in place (not a modal) with focus in its reason field; it lists the passages. Esc closes it and returns focus to the row. |
| A1.12 | Press `Ctrl+Enter` with no summary. | The save is refused; the summary field shows its error and takes focus (WCAG 3.3.1). |
| A1.13 | Type a summary and press `Ctrl+Enter`. | "Saved at hh:mm" appears. |
| A1.14 | Tab to "Approve and publish…" before saving, then after. | Before: the button is focusable and its reason is shown beside it; pressing it says why. After: it opens the publish panel. |
| A1.15 | Open 'XGPON coverage rules (sample)'; press Enter on "Withdraw…". | The panel shows who cites the document **before** the confirm button; Esc keeps it in service and focus returns to "Withdraw…". |
| A1.16 | Search passages: type, press Enter, then follow "Open at the passage". | The document opens with **that passage focused** in the grid, not the h1. |

### A2. Journey 2, catalogue release (T5, T6, T7)

| # | Step | Expected |
|---|---|---|
| A2.1 | Versions › the draft 'October integration update (sample)'. Tab to the steps. | The steps are links in order; the current one is marked (`aria-current="step"`). |
| A2.2 | Decide: Tab into the grid; press ↓ ↑. | One tab stop; the evidence pane follows the current row. |
| A2.3 | Press `a` on a row. | It becomes "Accepted, sending in a moment · Undo"; focus moves to the next undecided row; the undo bar appears at the bottom **without taking focus**. |
| A2.4 | Press `z` within 6 seconds. | The decision is undone; the row offers Accept and Reject again. |
| A2.5 | Press `r`, then wait 6 seconds. | The row leaves the list once it is sent. |
| A2.6 | Ready set: press Enter on "Accept 14" before "Show the 14". | It is refused, with the reason said; after "Show the 14", it works. |
| A2.7 | Check: press Enter on "Check now". | Focus moves to the "Mapping impact" title (it doesn't drop to the page); the result reads "Checked at hh:mm". |
| A2.8 | Publish: open the panel; press Enter on the confirm button with no reason. | The error is shown on the reason field and tied to it; focus stays in the panel. |

### A3. Journey 3, ownership (T8)

| # | Step | Expected |
|---|---|---|
| A3.1 | Ownership › Gaps: press Enter on "Give SMB App to a squad…". | The form opens in place with focus on "Squad". |
| A3.2 | Pick a squad and a contact; press Enter on the confirm button. | Focus moves to the **next** gap's button; a polite message says who runs the system now. |
| A3.3 | Open a form, then press Esc. | It closes and focus returns to its own button. |

### A4. Journey 4, quick check-in (T1, T11)

| # | Step | Expected |
|---|---|---|
| A4.1 | Your work: Tab into "Needs attention". | One tab stop per section; ↓ ↑ Home End move between its items. |
| A4.2 | Scenario *Re-confirmations due*: open Re-confirmations, press Enter on "Confirm it is still right". | The item changes to "Confirmed as still right" in place. |

### A5. Journey 5, Explorer (T9)

| # | Step | Expected |
|---|---|---|
| A5.1 | Open `/explorer?as=reader`. | There is no rail, and no "Skip to navigation". |
| A5.2 | Change the offering and the order type with the keyboard. | The answer heading updates; the address keeps the choice. |
| A5.3 | Expand a system line with Enter; expand "More about this offering" with Enter. | Each says whether it is expanded or collapsed. |
| A5.4 | Scenario *Stale Explorer link*. | The state line explains the substitution; the address is rewritten without a new history entry. |

## Part B: NVDA (about 60 minutes)

- Use Firefox with NVDA, starting in browse mode.
- Record what NVDA says (copy it from the speech viewer) in the results sheet.
- The exact wording varies by version and browser. Record whether the **information** is there,
  not exact phrasing.

### B0. Structure

| # | Check | Expected |
|---|---|---|
| B0.1 | Press NVDA+F7 › Landmarks, on any page. | banner, navigation "Areas", main; plus "Prototype lab controls (not part of the design)", a region to ignore. |
| B0.2 | Press NVDA+F7 › Headings. | One h1 (the page title), with h2 sections under it; panels use h2/h3. There are no skipped levels inside the page body. |
| B0.3 | Press `d` to move by landmark. | The masthead, rail and main are reachable. |
| B0.4 | Move to the rail's "Your work". | "Your work, 9 need you, current page" (or similar): the count is said as words, not just "9". |
| B0.5 | Move to Jobs. | "Jobs, 1 active or needing attention, button, collapsed". |
| B0.6 | Navigate any route. | The new h1 is spoken; the document title (tab name) changes to "‹Page› · Knowledge portal". |

### B1. Journey 1 with NVDA

| # | Step | Expected |
|---|---|---|
| B1.1 | Library table: press `t`, then Ctrl+Alt+arrows. | The caption "Documents · 12 shown"; column headers are spoken; the document name is the row header; the sort state is said ("sorted descending"). |
| B1.2 | The Status cells. | Words, never colour alone: "Needs attention", "In service". |
| B1.3 | Review desk: Tab into the grid. | NVDA switches to **focus mode** by itself (a grid). It says the row header ("Sheet 1, not seen") and the position. |
| B1.4 | Press j, then x (in focus mode). | The letters reach the grid; they are **not** taken as NVDA quick keys. After `x`, "Why exclude it?, edit" is spoken with its hint. |
| B1.5 | Space on a row. | The selected state is said; the selection count ("3 passages selected") is spoken politely. |
| B1.6 | The progress line. | "Seen 4 of 404 · 1 flagged…" is readable, and its updates are polite (not interrupting). |
| B1.7 | `Ctrl+Enter` with no summary. | The error is spoken with the field ("Write a review summary before saving"), and focus is in the field. |
| B1.8 | Approve, while unavailable. | "Approve and publish…, button, unavailable" plus the reason (via `aria-describedby`); pressing it speaks the reason. |
| B1.9 | The publish and withdraw panels. | The heading is spoken on open; the counts and reversibility are readable in order before the buttons. |
| B1.10 | The Arabic document 'سياسة التحقق من العنوان (sample)'. | The title is spoken whole, not letter by letter, and the parentheses and quotes are not reordered. **Likely gap:** content carries `dir="auto"` but no `lang`, because the service doesn't record each item's language. So NVDA probably keeps the English voice. Record what happens; if it reads Arabic badly, it becomes a finding for Phase 8 (set `lang` where the language is known, e.g. a document's `language` field). |

### B2. Journey 2 with NVDA

| # | Step | Expected |
|---|---|---|
| B2.1 | Decide grid. | Focus mode; each row's sentence is the row header; the "Suggested · stated in the source" basis is spoken. |
| B2.2 | `a` on a row. | "Accepted: ‹sentence›. Undo with z within 6 seconds." is spoken **politely**, without stealing focus. |
| B2.3 | `z`. | "Undone. '‹sentence›' is back to decide." |
| B2.4 | Evidence pane: navigate to it (NVDA+F7 › Landmarks › "Evidence"). | A complementary landmark named "Evidence"; the quote, then the trail "Where this comes from" as a list. |
| B2.5 | Check and Publish: the impact. | "Mapping impact" heading; the counts as a description list; under the *Requirement AI unreachable* scenario, "The impact is unknown, not zero." |
| B2.6 | Changes. | The diff summary is first ("From … to …: 2 added · 0 changed · 0 removed"); each change says its kind in words ("Added", "Removed"), and a changed field says "changed to". |

### B3. Journeys 3–5 with NVDA

| # | Step | Expected |
|---|---|---|
| B3.1 | Gaps: open and complete a form. | The labels and hints are spoken; "required" is said for Squad; after saving, the polite confirmation is spoken and focus is on the next gap. |
| B3.2 | Your work. | Each section's heading is said with its count; the items are lists. |
| B3.3 | Explorer (reader). | The answer heading leads with the number of systems; each system button says "collapsed"/"expanded". |
| B3.4 | Jobs panel (the *A job fails* scenario, then upload). | The cause and "Try again: Reading ‹file›" are spoken: the button names include the job. |

### B4. Live regions (any page)

| # | Check | Expected |
|---|---|---|
| B4.1 | Trigger three announcements quickly (for example `i`, `i`, `i` on different rows). | Each is spoken; none interrupts the others (polite). |
| B4.2 | Anywhere. | Nothing is assertive except a blocking error inside a field you just used. |

## Part C: zoom and reflow (about 20 minutes)

Use Edge at 1280px window width.

| # | Check | Expected |
|---|---|---|
| C1 | Browser zoom **200%**: walk A1.4–A1.14 (review desk). | No content is lost. The split pane stacks (the passage pane under the list). The save bar and the selection bar stay measured: **the focused row is never hidden under them** (WCAG 2.4.11, 1.4.10). |
| C2 | Zoom **400%** (equal to 320 CSS px): Library, Your work, Ownership, the Explorer. | One column; no horizontal scroll on the page (WCAG 1.4.10). The masthead wraps; the rail becomes a wrapping row above the page. |
| C3 | 400%: the review desk table. | A data table may scroll horizontally **inside its own frame** (allowed for data tables under 1.4.10); the page itself must not. Record whether row headers stay readable. |
| C4 | 400%: the publish consequence panel and the Decide step. | The panel's text, reason field and buttons are all reachable; the undo bar doesn't cover the focused row. |
| C5 | Text spacing (WCAG 1.4.12): apply a text-spacing bookmarklet (line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em). | No clipped or overlapping text in buttons, filters, status words, the steps or the table cells. |
| C6 | Text-only zoom: Edge › Settings › Appearance › Font size "Very large". | Nothing is clipped; the 14px floor scales up. |

## Part D: Windows contrast themes (about 15 minutes)

Use Settings › Accessibility › Contrast themes, with "Night sky", then "Desert", in Edge.

| # | Check | Expected |
|---|---|---|
| D1 | The rail. | The current area has a **visible bar** at its start (system Highlight colour), not just a tint. |
| D2 | Sub-navigation and the record tabs (Review / Versions / Cited by). | The current tab is **underlined** in Highlight. |
| D3 | Review desk: move the current row; select rows. | The current row is **outlined**; the selected rows show their checked checkbox. |
| D4 | Filters. | The pressed filter has a 2px Highlight border and is underlined. |
| D5 | The focus ring on buttons, links, cells and fields. | Visible in every theme. |
| D6 | Status words and icons, the Suggested mark, excluded (struck-through) rows. | All are still distinguishable without colour; the icons are drawn in the text colour. |
| D7 | Combobox (Catalogue › Find a system): type "b", then ↓. | The active option is highlighted (Highlight / HighlightText). |
| D8 | The draft steps. | The current step is underlined. |
| D9 | The evidence highlight (`<mark>`) in Decide. | Drawn with the system Mark colours. |

These forced-colours rules were added in Phase 6, after the first capture showed four states
drawn only by shadows (`frontend/src/design/tokens/index.css`). One screenshot was checked
(`round-2/prototype/forced-03-review-desk.jpg`); a person still has to run the themes.

## Part E: reduced motion (about 5 minutes)

Windows: Settings › Accessibility › Visual effects › Animation effects **off**, then reload.

| # | Check | Expected |
|---|---|---|
| E1 | Expand an Explorer system line. | The chevron turns at once, with no animation. |
| E2 | Open and close Help and Jobs; show the undo bar. | They appear and go at once. |
| E3 | Anywhere. | Nothing moves on its own; no parallax, no autoplay. |
| E4 | With animation effects **on**. | Any motion is opacity or transform only and short (200ms or less); nothing flashes. |

## Part F: forms and errors (cross-journey, about 10 minutes)

| # | Check | Expected |
|---|---|---|
| F1 | Every field you met. | It has a visible label (no placeholder-only labels). Hints are tied by `aria-describedby`. "Required" is shown in words. |
| F2 | Every error you triggered (summary, reason, squad). | It is next to its field, said in words, and doesn't rely on red; the field is `aria-invalid`. |
| F3 | Targets. | Checkboxes, cell links, icon buttons and pagination are at least 24×24 CSS px (WCAG 2.5.8). Use Edge DevTools to measure any that look small. |
| F4 | Bidi. | Arabic text in fields and cells starts at the right; the surrounding chrome is never mirrored. |

## Who should run it

- **Parts A, C, D, E and F:** anyone on the team.
- **Part B:** ideally a daily NVDA user (one person from the admin group, or an external tester),
  with the team member observing.
  - If no daily user is available, a sighted tester with NVDA can run it.
  - Mark the results "tested by a non-native screen-reader user", because their speed and
    strategy differ.
- **JAWS:** optional. The grid pattern is designed to put JAWS in forms mode too; record it if
  you have a licence.

## Known limits of the prototype

These are not product failures. Note them, don't score them.

| Item | Limit |
|---|---|
| O-2 | No "select a whole sheet": select rows (Space, Shift+↓). |
| O-7 | "Accept with edits" isn't built; it announces that. |
| BG2 | "Seen" is kept for this session only; it is shown at approval but not stored. |
| BG6 | Check results are fixed and simulated. |
| Lab | The "Show the original (o)" preview isn't built; it announces where it would open. |
| Lab | Help's contact is a placeholder. |
| Lab | Uploads don't leave the browser; a simulated reading job starts instead. |

## After the run

1. Fill in `a11y-results.csv`, one row per check ID.
2. Every Blocker and Serious finding becomes an issue in the GATE 6 comparison
   (`docs/redesign/STATUS.md`) with its WCAG reference. It is fixed before its area's Phase 8
   gate.
3. The Phase 7 Playwright and axe suite gets a regression test for each finding that automation
   can catch.
