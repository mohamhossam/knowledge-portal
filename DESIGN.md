---
name: Knowledge portal
description: The requirement platform's curation desk, set as a published timetable book of numbered, ruled, footnoted tables.
colors:
  stock: "#fbfbfa"
  stock-band: "#f1f1ee"
  ink: "#16181d"
  ink-2: "#474c55"
  ink-3: "#686e78"
  rule-heavy: "#16181d"
  rule: "#cfd2d6"
  rule-faint: "#e4e5e7"
  disruption: "#b3122b"
  disruption-wash: "#fbeaec"
  reference: "#1d5ca3"
  reference-wash: "#e6eef8"
typography:
  monument:
    fontFamily: "Archivo Variable, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "clamp(4rem, 3rem + 3vw, 5.75rem)"
    fontWeight: 820
    lineHeight: 0.8
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 62"
  title:
    fontFamily: "Archivo Variable, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 680
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 88"
  lead:
    fontFamily: "Archivo Variable, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 680
  body:
    fontFamily: "Archivo Variable, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum, lnum"
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo Variable, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 72"
  meta:
    fontFamily: "Archivo Variable, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
  mark:
    fontFamily: "Archivo Variable, Noto Sans Arabic, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 680
  arabic:
    fontFamily: "Noto Sans Arabic, Archivo Variable, system-ui, sans-serif"
    fontSize: "inherit"
rounded:
  control: "2px"
spacing:
  s1: "0.25rem"
  s2: "0.5rem"
  s3: "0.75rem"
  s4: "1rem"
  s5: "1.5rem"
  s6: "2rem"
  s7: "3rem"
  s8: "4.5rem"
  margin-column: "7.5rem"
  page-max: "78rem"
  index-track: "15rem"
  gutter: "clamp(1rem, 0.5rem + 2vw, 2.5rem)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
  text-button:
    textColor: "{colors.ink}"
    typography: "{typography.meta}"
    padding: "0 0.25rem"
    height: "1.5rem"
  text-button-disabled:
    textColor: "{colors.ink-3}"
  select-persona:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.meta}"
    height: "1.75rem"
  reference-mark:
    textColor: "{colors.reference}"
    typography: "{typography.mark}"
    padding: "0 0.15em"
  reference-mark-lit:
    backgroundColor: "{colors.reference-wash}"
    textColor: "{colors.reference}"
  table-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.5rem 1rem 0.5rem 0"
  table-row-lit:
    backgroundColor: "{colors.reference-wash}"
  table-row-running:
    textColor: "{colors.ink-2}"
  table-row-past:
    textColor: "{colors.ink-3}"
  status-delayed:
    textColor: "{colors.disruption}"
    typography: "{typography.lead}"
  next-decision:
    textColor: "{colors.reference}"
    typography: "{typography.lead}"
  action-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.25rem"
  action-button-hover:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
  action-button-secondary:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
  action-button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.stock}"
  action-button-disabled:
    backgroundColor: "{colors.stock-band}"
    textColor: "{colors.ink-3}"
  field-input:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.body}"
    padding: "0.25rem 0.5rem"
    height: "2rem"
  field-label:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
  filter:
    textColor: "{colors.ink-2}"
    padding: "0 0.25rem"
    height: "2rem"
  filter-pressed:
    textColor: "{colors.ink}"
  key-cap:
    rounded: "{rounded.control}"
    padding: "0 0.3em"
  edit-mark:
    textColor: "{colors.reference}"
    typography: "{typography.mark}"
    size: "1.5rem"
  passage-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.5rem 1rem 0.5rem 0"
  passage-row-open:
    backgroundColor: "{colors.stock-band}"
  passage-basis:
    textColor: "{colors.ink-2}"
  passage-excluded:
    textColor: "{colors.ink-3}"
  save-bar:
    backgroundColor: "{colors.stock}"
    padding: "0.75rem 0"
  subindex-link:
    textColor: "{colors.ink-2}"
    height: "2.25rem"
  subindex-link-current:
    textColor: "{colors.ink}"
  govsection-title:
    textColor: "{colors.ink}"
    typography: "{typography.lead}"
    padding: "0 0 0.25rem"
  govtable-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.5rem 1rem 0.5rem 0"
  govtable-secondary:
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
  search-field:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.body}"
    padding: "0.25rem 0.5rem"
    height: "2.25rem"
  search-context:
    backgroundColor: "{colors.stock-band}"
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
    padding: "0.5rem 0.75rem"
  toolbar-link:
    textColor: "{colors.reference}"
    height: "2rem"
  sysindex-group-head:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "0 0 0.25rem"
  sysindex-link:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.25rem 0"
    height: "2rem"
  sysindex-link-current:
    textColor: "{colors.ink}"
  sysindex-why:
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
  sheet-title:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
  sheet-fact-label:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    width: "7rem"
  steps-phase-head:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "1rem 0 0.25rem"
  version-detail:
    backgroundColor: "{colors.stock-band}"
    padding: "0.5rem 1rem 1rem"
  galley-head:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "1.5rem 0.5rem 0.5rem"
  galley-tally:
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
  suggestion-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0.5rem"
  suggestion-row-open:
    backgroundColor: "{colors.stock-band}"
  suggestion-row-waits:
    textColor: "{colors.ink-2}"
  suggestion-row-decided:
    textColor: "{colors.ink-3}"
  suggestion-detail-label:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "0 0 0.25rem"
  cited-passage:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink-2}"
    typography: "{typography.meta}"
    padding: "0.5rem 0.75rem"
  form-legend:
    textColor: "{colors.ink}"
    padding: "0 0 0.25rem"
  next-button:
    textColor: "{colors.reference}"
    typography: "{typography.lead}"
  edit-panel:
    backgroundColor: "{colors.stock-band}"
    padding: "0.75rem 1rem 1rem"
  edit-panel-title:
    textColor: "{colors.ink}"
    typography: "{typography.lead}"
  edit-panel-field:
    backgroundColor: "{colors.stock}"
  diff-change-column:
    width: "15rem"
  runs-system-column:
    width: "40%"
  history-when-column:
    width: "11rem"
  build-state:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  build-state-failed:
    textColor: "{colors.disruption}"
  sample-result-column:
    width: "45%"
  sample-row-moved:
    textColor: "{colors.ink}"
  sample-detail:
    backgroundColor: "{colors.stock-band}"
    padding: "0.5rem 1rem 1rem"
---

# Design System: Knowledge portal

## Overview

**Creative North Star: "The Timetable Book"**

The portal is set like a national railway timetable book. Each area of shared knowledge is a numbered table. Its number stands monumental and condensed in a left margin column. The table beside it has an exact column set, and each sourced fact carries a reference mark that leads to a numbered note at the table's foot. The page is near-white neutral stock with black ink. Hierarchy comes from three rule weights and from type weight, never from containers, fills or colour. Two colours are held back, and each has exactly one job.

The density is that of a reference work. Rows are tight (0.5rem block padding) and separated by hairlines. Numbers and dates use tabular, lining figures and sit right-aligned, as in any timetable. The surface is flat: no cards, no shadows for depth, no pills, no gradients. One sticky masthead strip and an index of the tables bind the book, and every screen sits inside that binding.

The architecture catalogue (Table 2) reads like the station pages of the same book: an index of systems held beside one system's sheet, each sheet a run of governance sections, each connection a sentence, each journey a timetable of numbered steps grouped by phase. A draft version adds the book's galley proofs: the documents being read for changes, and every suggested change set in one table under the system it would change, to be accepted or rejected line by line. Before it goes to press, a draft can be corrected by hand where it is read, its list of alterations read against the version in service, its sample requirements checked against it, and then it is published, the consequence stated first.

The squad catalogue (Table 3) is the book's list of who works each line. It is kept current in place, with no versions or drafts: each value stream is a section, each product a sub-table of the systems it rests on and the squad that runs each, and a system with no squad stands as the due row with its decision on the same line. Squads, People and History are plain governance tables under the same head.

The interface language is English. It calls the indexed units of a document "passages", and the units of the table-aware cut "fields"; it never says "chunks". Content keeps its own language and direction. Arabic names render in Noto Sans Arabic, in their own direction, beside the English in the same cell. The theme is light only. This is a decision for an office-daylight scene, not an omission.

**Key Characteristics:**
- Near-white neutral stock (never cream) and black ink; flat, ruled, unboxed.
- One grotesk (Archivo Variable) in several widths: 100% for text, 88% for titles, 72% for labels, 62% for monumental table numbers.
- Weight shows rank. Colour has only two jobs: red for disruption, blue for reference.
- Three rule weights: a 2px heavy rule, a 1px hairline and a 3px double rule.
- Notes are numbered in reading order. A mark and its note light each other.
- Rows never reflow when a state changes. Only the background changes.

## Colors

The palette is table stock and ink, plus two colours with a job each.

### Primary
- **Reference Blue** (`reference`): footnote marks, note numbers, the note return links, the next-decision line, body links (including the toolbar's search link), the focus ring, the caret, the "e" edit mark on an edited passage, the galley's next-decision button, the name of an existing system in a galley group head (a link to its sheet), a changed system's name in the diff table, the system name over an open sample's evidence and the "The passage" links under it. Wherever the reader can follow something to somewhere else.
- **Reference Wash** (`reference-wash`): the lit state of a row, mark or note when its partner is hovered or focused. Also text selection, and the way back on a system sheet: the connection row for the system the reader came from. In the squad catalogue, the row of a system just given to a squad, lit until the reader's next action.

### Secondary
- **Disruption Red** (`disruption`): failure only. This means a delayed or failed status (for example "Extraction failed", or a draft document's "Reading failed: why"), a table that could not be read, a sign-in error, a failed processing line, a failed action (including an edit's failure line, the 409 line "The draft changed while you edited …", and the squad catalogue's "The squad catalogue changed while you edited …"), a failed build ("The build failed", bold), a sample that could not be compared, and anything blocking: the blocking count in the change notice, a blocking warning on a passage, a blocking file warning.
- **Disruption Wash** (`disruption-wash`): reserved as the wash partner of disruption. It is defined in the tokens but not yet used on a shipped surface.

### Neutral
- **Table Stock** (`stock`): the page and the masthead background. It is a neutral near-white, never cream. Inside an open suggestion, which already sits on the band, the cited passage block takes the stock instead, so it reads as the document's own page. Inside an edit panel, which sits on the band, field inputs keep the stock, so they read as places to write.
- **Stock Band** (`stock-band`): the only tonal step off the page. It is the scrollbar track, the background of a hovered passage row, the background of the focused/open passage row together with its detail row (the row opens in place on this band, never in a card), the fill of a disabled action button, the surrounding-text block under a search result (padded on the band, never ruled or boxed), an open catalogue version's row together with its detail row, a hovered or open suggestion row together with its detail row, an open edit panel, and an open sample row together with its evidence row.
- **Ink** (`ink`): text, the working text in a passage row, the fill of the primary and action buttons, the current-index bar, the pressed-filter bar, the current sub-index link and its bar, the current systems index entry and its bar, the catalogue's bold "still mapped with an earlier version" line, a suggestion that needs your decision (sentence and state in bold), the bold "New system" in a galley group head, the bold legend of a repeating form group, the bold status of the build state line, a sample whose mapping would move (requirement and verdict in bold), the bold verdict of a tried requirement, a system with no squad (its name and the bold "No squad"), the bold lead's name in a value stream's "Led by" line, the index extent rules, the checkbox accent and the field border on hover.
- **Ink 2** (`ink-2`): secondary text. This covers column heads, edition lines, rows in service, notes, the quiet state, Arabic secondary lines, field labels, the comparison (in service or as extracted) column of the passage table, unpressed filters, the keys line, the save bar's state and reason lines, unselected sub-index links, governance section leads, the secondary lines in a governance table, the text of a search result's surrounding-text block, the systems index's group heads, count and "which name matched" lines, a sheet's fact labels, Arabic line and meta line, the connection phrases, journey phase heads, the count after a section title, the "Its catalogue file:" label and the put-back panel's waits line. In a draft: a document reading in progress ("Waiting to be read", "Being read"), a suggestion that waits for another or is already in the draft, a galley group head's tally, an open suggestion's "From the document" and "Decision" labels, form hints, and the waits lines under the draft's forms, decisions, edit panels, the samples and the publish action. In Changes and Check: the diff table's kind heads and their counts, a changed item's fields in words, a connection's "For what:" line, the build state's detail after its status, a sample's "In service: … · This draft: …" line, and "Not compared yet". In the squad catalogue: the "Led by" line, a product's description, a system's place, a squad's "Contact:" and "Scrum master:" lines, a person's team and email, the roles line on phones, "No role" and "No system yet", who made a change in History, and the waits line under a person who still holds a role.
- **Ink 3** (`ink-3`): rows in the past, disabled controls (including the disabled action button's text), the select and field borders, the masthead dot, excluded or removed passages, replaced catalogue versions, decided (accepted or rejected) suggestions, an order type no longer offered, the "Not placed" row of a domain tree, and a removed row in the diff table. In the squad catalogue: a system no longer in the catalogue in service (in a product's table and in a squad's list) and an inactive person.
- **Heavy Rule** (`rule-heavy`): the rule under the masthead and table heads, the totals label and the notice head, and the double rule above the notes. Also the change notice's heading, the top and bottom of the processing line and the withdraw panel, the foot of an open passage's detail row, the top of the save bar, and the line under a governance section title and a governance table's column heads. In the catalogue: under each group head of the systems index, above a sheet's facts list, at the foot of an open version's detail row, and above and below the put-back panel. In a draft: above and below the rename and remove steps, under each galley group head, at the foot of an open suggestion's detail row, and under a repeating form group's legend. Closing an edit panel and an open sample's evidence row; above and below the catalogue file's preview. In the squad catalogue: under each value stream's title, under the runs table's column heads, and under each place head of "Systems no product names".
- **Rule** (`rule`): the 1px rule between tables, under the index and above "in preparation" text and the "Add a document" section. Also the resting underline of title links, the border of a disabled action button, the outline of `kbd` key caps, the frame of a source preview image, the line under a document's or the catalogue's sub-index, the line under a journey's phase head and under a value stream's head in the Squads table, the line under each label of an open suggestion's detail, the foot of each row of a repeating form group, the legend of a group nested inside a row, the line under each kind's head in the diff table, and the line under each system label of an open sample's evidence.
- **Faint Rule** (`rule-faint`): the hairlines between rows and between totals, under the change notice's counts, between passage rows, between governance table rows, between systems index entries, between a sheet's facts, and between the items of a sheet's constraint, rule and journey lists.

### Named Rules
**The Two Jobs Rule.** Colour has exactly two jobs. Red marks a disruption. Blue marks a reference, meaning something you can follow, plus focus. No other hue appears, and neither colour ever decorates or ranks.

**The Stock Not Cream Rule.** The page is neutral near-white (`stock`). Never warm it toward paper or cream.

## Typography

**Display Font:** Archivo Variable, set on the `wdth` axis (with Noto Sans Arabic, system-ui, sans-serif)
**Body Font:** Archivo Variable (the same family)
**Arabic Font:** Noto Sans Arabic, weights 400 and 600, for any `lang="ar"` or `dir="rtl"` content

**Character:** One self-hosted grotesk does all the work, as in a timetable book. Its width axis gives a monumental condensed numeral and a compact label from the same face as the body text. Figures are tabular and lining throughout (`font-variant-numeric: tabular-nums lining-nums`). Font synthesis is off.

### Hierarchy
- **Monument** (820, clamp(4rem, 3rem + 3vw, 5.75rem), line-height 0.8, width 62%): the table number in the margin column. It is aria-hidden; the heading carries "Table N:" for screen readers. At 45rem and below it drops to 3.25rem and sits above the title. Index numbers use the same width and weight at 2.25rem (1.75rem on phones).
- **Title** (680, 1.625rem, line-height 1.1, width 88%): table titles and notice titles. Index entry titles use the same width and weight at body size. A catalogue sheet's title (a system, an offering, a journey) takes the title style without a margin number. A galley group head's name takes the title width and weight at body size.
- **Lead** (680, 1.0625rem): the next-decision line, the portal name in the masthead, the titles of the "Add a document" section, the withdraw panel, an edit panel and the catalogue file's preview, and governance section titles (bold, on a heavy rule), including a value stream's name in the squad catalogue.
- **Body** (400, 0.9375rem, line-height 1.45, width 100%): rows, totals and edition lines. Edition lines are capped at 72ch, notice text at 62ch, note text at 80ch, governance leads at 72ch and a search result's passage at 64ch. Sub-index links take body size in medium weight (bold when current). A product in the squad catalogue is a sub-head one step under its value stream's lead title: body size, bold (680), no rule of its own; its description in ink 2 at 72ch.
- **Label** (500, 0.8125rem, width 72%, letter-spacing 0.01em): column heads, totals labels, field labels, the change notice heading the passage detail labels ("Edited from", "As extracted"), the governance table's column heads, the legend of a choices group, the systems index's group heads, a sheet's fact labels, a journey's phase heads, an open suggestion's "From the document", "Decision" and "Edit, then accept" labels, the diff table's What and Change heads and its kind heads, the system label over an open sample's evidence (a blue link there), the change notice title "Who runs the systems in service", the place heads of "Systems no product names" and the value stream heads of the Squads table, in ink 2 unless a link. They use sentence case, never uppercase.
- **Meta** (400 to 500, 0.8125rem): the notes, the masthead's "Valid as of" line, text buttons, the Arabic secondary name line, the passage table's "Where" column, exclusion reasons and flags, the keys line, the save bar's state and reason lines, the secondary lines in a governance table, a search result's surrounding text, sub-index links on phones, the catalogue's consequence and mapped-earlier lines, the systems index count and its "which name matched" lines, a sheet's meta line, the connection phrases, a galley group head's tally and inline confirm, form hints, the waits line under a decision, a draft form or an edit panel, the diff table's and the samples table's secondary lines, the "The draft as it stands:" label beside the catalogue file downloads, the squad catalogue head's "Last change:" line, and the squad catalogue's secondary lines (place, contact, scrum master, team and email, who changed). Key caps inside the keys line step down to 0.75rem, medium weight.
- **Mark** (680, 0.6875rem): the superscript reference numeral, in blue.

### Named Rules
**The Weight Is Rank Rule.** A row's importance is set by weight and ink, never by colour or badge. A due row has its name and status in bold (680). A delayed row has its status in bold and in disruption red. A running row is set in ink 2, a row in service in regular ink, a past row in ink 3. Catalogue versions follow it: in preparation is due (bold), in service is regular ink, replaced is past. Suggestions follow it: "Needs your decision" is due (sentence and state bold), "Ready" is regular ink, "Waits for another" and "Already in the draft" are running (ink 2), and accepted or rejected suggestions are past. A draft document's reading follows it too: waiting or being read is running, a failed reading is delayed. A build's state line sets its status bold, and red when the build failed. A sample whose mapping would move is due (bold); one that keeps its systems is regular ink. The squad catalogue follows it: a system in service with no squad is due (name and "No squad" bold), a system run by a squad is regular ink, and a system no longer in the catalogue in service and an inactive person are past. A list of alterations is not a queue: "Added", "Changed" and "Removed" are all regular weight, and only a removed row drops to past.

**The Sentence Case Rule.** A value a source shouts ("FULFILS") is set in sentence case ("Fulfils") on screen. Labels, heads and group heads are sentence case too; nothing is uppercased for rank.

**The One Family Rule.** Contrast comes from Archivo's width and weight axes, not from a second display face. Noto Sans Arabic is a script fallback, not a design voice.

## Layout

The page is a single column up to 78rem wide, with fluid gutters (clamp(1rem, 0.5rem + 2vw, 2.5rem)). Each numbered table is a two-column grid: a 7.5rem margin column holds the right-aligned table number, then a 1.5rem gap, then the table head and body. A table has 3rem of padding above and 2rem below, and a 1px rule separates it from the next. Text blocks that sit beside a table (the "in preparation" note, the missing-page text) indent by the margin column plus its gap, so they align with the table body.

The spacing scale has eight steps: 0.25, 0.5, 0.75, 1, 1.5, 2, 3 and 4.5rem. Inside a table, the grid sits 1rem below the head, the totals and notes sit 1.5rem below the rows, and the next-decision line sits 1.5rem below the notes. Totals are capped at 34rem wide.

The masthead is sticky (z-index 5) above 45rem and static below it. The index of tables is a three-column grid that becomes one column at 45rem. The anchor scroll padding (5rem) keeps a jumped-to note clear of the masthead.

Columns drop by priority, so the table never scrolls sideways. Priority 3 columns hide below 60rem and priority 2 columns below 45rem. At 45rem and below, the margin column collapses and the number stacks above the title.

A document's page uses the same margin grid (7.5rem margin column, 1.5rem gap), with 2rem of padding above, 1.5rem below and 1rem between its parts. The head spans both columns; everything under it (processing line, withdraw panel, change notice, filter strip, keys line, passage table, save bar) sits in the table column. The "Add a document" section under the library table indents by the margin column plus its gap, caps at 44rem and loses the indent at 45rem. A table's toolbar slot (the find field) sits 1rem under the head, with 0.75rem by 1.5rem gaps.

The passage table is a fixed-layout grid: No. (3.5rem), Where (13rem; 14rem when reading a published edition), comparison text and working text sharing the rest, Status (10rem; 7rem below 60rem). An open passage's detail sets source and decision side by side, and stacks them below 60rem.

A document's own pages (Review, Search versions, Who cites it, Ownership) share its head. The sub-index sits 0.75rem under the head on a 1px rule, its links 1.5rem apart (0.75rem on phones). Each page is a run of governance sections: 1rem of padding above each, 0.75rem between a section's parts, leads capped at 72ch, forms at 44rem. A governance table runs the full table column; its place column is fixed at 14rem. The search page is a numbered table whose body opens with the search bar 1rem under the head: a field growing from a 28rem basis with the action beside it, wrapping beneath it on phones.

**The Kept Column Rule.** In a governance table, a secondary fact (a version's cut and passage count, a handover's reason or who performed it, a citation's place or version, a field's label) rides as a secondary ink-2 meta line inside a kept column, never in a column of its own. Columns still drop by priority on phones, and these facts stay with the row.

The catalogue shares the document page's head (monumental 2, title, edition lines, sub-index). The Systems page under it is a two-column grid: a 15rem systems index, a 2rem gap, then the sheet or All connections. The index is sticky under the masthead (3.5rem) and scrolls on its own track (the viewport's height less the masthead and 1rem; overscroll is contained). When a connection is followed, the index scrolls itself to keep the new current entry in view, after the sheet's heading has come into view. A page's first governance section takes 1rem of top padding so it sits level with the index's find field. On a sheet, Depends on and Used by stand side by side (2rem gap) above 80rem and stack below it. Sheet text (description, facts, list items) is capped at 72ch; a sheet's facts list runs a 7rem label column beside the value and spans the full sheet column. Inside an open version, tables cap at 62rem and the put-back panel at 62ch.

A draft's Sources page has no index. It runs three governance sections across the catalogue column, Documents, Catalogue file and then Suggestions, the first taking the 1rem first-section padding. The "Add a document" form under the documents loses the library's margin indent and 44rem cap and sits 1rem under the notes. The galley's State column is 15rem (9rem at 45rem and below), and every galley cell, head and detail keeps a 0.5rem inline gutter, so the band has a margin and the focus ring clears the first glyph. An open suggestion sets its source (1fr) beside its decision (1.25fr) with a 1.5rem gap, stacking below 60rem; quotes and the rationale cap at 64ch. Editor fields sit on a wrapping grid of columns at least 13rem wide, 0.75rem by 1rem apart, bottom-aligned; text areas and lines fields span the whole row. A draft's inline steps (rename, remove) sit 0.75rem under the head's actions, in the head's text column.

An edit panel opens 0.75rem under the control that opened it: under a sheet's head (while a system or an offering is edited its sections step aside, so the panel is the sheet), under a section's table, or in the sheet column when adding a system. Inside it, 0.75rem by 1rem padding (1rem at the foot), 0.75rem between its parts, its lead capped at 62ch, its actions a wrapping row 0.75rem by 1rem apart. A row's own text buttons (Change, Remove; Compare, The evidence) wrap 0.25rem under its text, 0.25rem by 1rem apart. Changes, Check, Publish and Evidence are runs of governance sections across the catalogue column, without an index. The diff table's Change column is 15rem; the samples table's result column is 45%; both give way to the content at 45rem and below. An open sample's evidence lists cap at 72ch, 0.75rem between systems and 0.5rem between quotes. "Try a requirement" sits 1.5rem under the samples. On Publish the consequence paragraphs stack 0.5rem apart at 72ch, and the reason field caps at 44rem with its input full width. The catalogue file's preview takes the withdraw panel's rules but runs the full catalogue column, so its diff table is not cut to 62ch. An evidence passage keeps its line breaks, capped at 72ch.

The squad catalogue shares the same head and sub-index, with no systems index: its pages are runs of governance sections across the table column, the first taking the 1rem first-section padding. The change notice sits 0.75rem under the "Last change:" line, above the sub-index. A product opens 1rem under what precedes it, its parts 0.25rem apart; its runs table sits 0.25rem under its actions, the System column at 40% (giving way to the content at 45rem and below). "Give it to a squad" sits 0.75rem after "No squad" on the same line, so a gap stays one row high. Squads stacked in a Run by cell, and systems in a squad's Runs list, sit 0.25rem apart. An edit opened from a row takes a detail row under it, with the row and the panel on one band: the panel drops its own top margin and the detail cell its rule, keeping 0.5rem below. History's When column is 11rem (auto on phones), end-aligned with 1.5rem before the What column. The product editor's systems checklist runs columns at least 14rem wide, 1rem apart. On phones the People table drops its Roles column and the roles ride as a secondary line under the person.

At 45rem and below the catalogue goes to one column: the index loses its own scroll and sits in flow, and a chosen sheet replaces it ("All systems and connections" returns to it). All connections folds To into the From cell as one sentence line. Versions drops its State and disclosure columns and carries both inside the version cell. A sheet's facts stack label over value.

The save bar is sticky to the bottom of the viewport (z-index 4, under the masthead's 5) above 45rem and static on phones. While it is present, the page carries 9rem of `scroll-padding-bottom`, so a passage moved to from the keyboard is never hidden under it.

## Elevation & Depth

The surface is flat. Depth is not used. Rules separate the parts: a 2px heavy rule, a 1px hairline and a 3px double rule. Lit states are a background wash, never a lift; an open passage sits on the stock band, not on a raised card. The only `box-shadow` in the build is an inset 3px ink bar (`inset 0 -3px 0 ink`), under the current index entry, the pressed filter, the current sub-index link and the current systems index entry. It works as a rule, not as a shadow. The sticky save bar is separated from the rows by its heavy rule and its stock background, not by a shadow.

### Named Rules
**The Three Rules Rule.** Separation uses three weights only. A 2px heavy rule sits under the masthead and every table head, totals label, notice head and governance section title. A 1px hairline sits between rows, totals and tables. A 3px double rule sits above the notes. Do not add a fourth weight or a box.

## Shapes

The form is rectilinear. Rules run full width with square ends, and there are no cards or bordered panels. The only radius is 2px, on framed controls: the primary and action buttons, the persona select, field inputs, the file-selector button, and `kbd` key caps. Panels such as the processing line and the withdraw panel are ruled top and bottom, never boxed. Governance sections open on a heavy rule under their title and are never boxed; a choices group is a fieldset with its border and padding removed. The one filled block is a search result's surrounding text: a square stock-band fill with 0.5rem by 0.75rem padding and no rule. A sheet's facts list is a definition list opened by a heavy rule, each fact on a hairline, running the full sheet column. An open version's detail is a square stock-band row closed by a heavy rule. A repeating form group is a fieldset with its border removed, opened by its bold legend on a heavy rule; each row in it is a borderless fieldset closed by a 1px rule, never a box. An open suggestion's detail is a square stock-band row closed by a heavy rule, its cited passage a square stock block. An edit panel is a square stock-band block closed by a heavy rule at its foot only; it opens from the line above it, so it takes no top rule. An open sample's evidence is a square stock-band row closed by a heavy rule. The index extent rule is a 3px ink bar on a fixed 7rem track. Its length is the table's share of the largest table, with a 3% minimum.

## Components

### Buttons
- **Primary (notice action):** solid ink with stock text, a 2px ink border, a 2px radius, a 2.5rem minimum height, 1rem horizontal padding and bold (680) text. **Hover** swaps to stock with ink text. It appears only on notice screens (sign-in, no access).
- **Action button:** the commit action outside notice screens ("Save review", "Approve and publish", "Withdraw it", "Upload for review"). Solid ink with stock text, a 2px ink border, a 2px radius, a 2.25rem minimum height, 1rem horizontal padding, bold (680) text and an optional 16px icon. **Hover** swaps to stock with ink text. **Secondary** ("Approve and publish") is the inverse, stock with ink text and the ink border, and hovers to solid ink. **Disabled** takes a rule-coloured border, a stock-band fill, ink-3 text and a not-allowed cursor; the save bar says why it waits.
- **Text button:** a control that reads as a word in the line. It has no border or fill, ink meta text in medium weight, a 1px underline offset 0.2em, a 1.5rem minimum height for the target, and an optional 14px icon before its label. **Hover** thickens the underline to 2px. **Disabled** is set in ink 3 with no underline. The refresh icon spins at 900ms linear while busy.
- **Focus:** every focusable element shows a 2px solid reference-blue outline offset by 2px.

### Inputs / Fields
- **Persona select:** a 1px ink-3 border, a 2px radius, a stock background with an inline chevron, meta text and a 1.75rem minimum height. **Hover** darkens the border to ink.
- **Field:** a label in the label style, 0.25rem above a framed input: 1px ink-3 border, 2px radius, stock background, body text, 0.25rem by 0.5rem padding, a 2rem minimum height. **Hover** darkens the border to ink. Textareas inherit the body face and resize vertically only. The inline variant sets the label beside the input (the find fields, the review summary).
- **Find field:** a search input in the field style with a visible label ("Find", "Find in passages"), set in a table's toolbar slot or at the end of the filter strip.
- **Checkbox:** a 1.125rem box with the ink accent colour, beside a medium-weight label, in a 1.5rem-tall target.
- **Search bar:** a `role="search"` form: a labelled field ("What are you looking for?") and the action button ("Search", with a 16px icon) at one 2.25rem height, aligned on their bottom edge. The field grows; on phones the button wraps beneath it.
- **Choices:** a group of radio rows in the checkbox style inside a fieldset with no border or padding; its legend takes the label style, unpadded, 0.25rem above the first row. A row may carry an ink-2 secondary after its name (an email).
- **File input:** a field framed with 0.25rem padding; its file-selector button is a 1.75rem-tall framed control with a 1px ink border, a 2px radius, stock fill and medium text, swapping to solid ink on hover.

### Filter Strip
Words with counts, not chips. Each filter is a 2rem-tall text control in medium ink 2 with its count in regular weight beside it, inside a labelled group. **Hover** turns it to ink. **Pressed** (`aria-pressed="true"`) sets it in bold ink with the inset 3px ink bar the current index entry uses. The find field sits at the strip's end.

### Keys Line
One ink-2 meta line under the filter strip naming the review keys. Each key is a `kbd` cap: 0.75rem medium text in the body face, 0 0.3em padding, a 1px rule-coloured outline and the 2px radius.

### Navigation
- **Masthead:** a strip with "Requirement AI · Knowledge portal" set at 72% width. The portal name is in bold lead, the parent product in ink 2. Next come "Valid as of" with a medium-weight time and a refresh text button, then the account at the right. A 2px heavy rule sits underneath.
- **Index of tables:** three entries. Each has a monumental condensed number, a title at 88% width and bold weight, and a meta extent line with its count and a proportional rule. **Hover** underlines the title. **Current** adds the inset 3px ink bar. Each entry announces "Table N:" to screen readers.
- **Document sub-index:** a labelled `nav` ("This document") under a document's head: Review · Search versions · Who cites it · Ownership. Each link is a 2.25rem-tall target in medium ink 2 with no underline; **hover** turns it to ink; **current** (`aria-current="page"`) sets it in bold ink with the inset 3px ink bar, above a 1px rule under the whole strip. While the working copy has unsaved changes, Review carries "· N unsaved" in regular weight. On phones the gap tightens to 0.75rem and the links drop to meta size; that override follows the base rule in the cascade. The catalogue uses the same strip, labelled "This catalogue": Systems · Domains · Channels · Offerings · Journeys, then Explorer on the version in service only, then on a draft only Sources · Changes · Check · Publish, then Versions, the last reading "All versions" while another version is being read. Check stays current while a cited passage from it is read. The squad catalogue uses it too, also labelled "This catalogue": Products · Squads · People · History.

### Numbered Table (signature)
The portal's only container. Every area screen is built from it.
- **Head:** the monumental number in the margin column, then the title (a link where the full table lives, with a rule-coloured underline that turns to ink on hover), then an ink-2 edition line saying which published state the table runs from.
- **Grid:** a real `<table>` with a visually hidden caption. The first cell of each row is a row header. Column heads are set in the label style above a 2px heavy rule. Rows sit on hairlines with baseline alignment. Numbers and dates use end alignment. A "more" row closes long tables with one ink-2 line ("and 20 more ...").
- **Rank states:** see the Weight Is Rank Rule. Each row's state is set by its rank class. A lit row only takes the reference wash, with an 180ms background transition.
- **Mixed language:** a name cell sets its primary name with `dir="auto"`. The Arabic name sits on a second meta line with `lang="ar" dir="rtl"`, set in ink 2.
- **Totals:** a 34rem-wide definition list under a label with a heavy rule. Each total sits on a hairline, with its value in medium weight and end-aligned.
- **Quiet and failure:** when no row needs anyone, one ink-2 line sits under a heavy rule. If the table could not be read, the line is red, medium-weight text with role="alert", followed by a "Try again" text button.
- **Next decision:** the single action line at the table's foot. It is a blue, bold, lead-size link followed by a 16px arrow. When there is nothing to do, it becomes plain ink-2 text in regular weight. Where the next decision is an action on the same page rather than a place, it is a button set exactly as the link: blue, bold, lead size, a 1px underline offset 0.2em that thickens to 2px on hover, the 16px arrow after it.

### Reference Marks and Notes (signature)
- **Mark:** a superscript blue numeral (0.6875rem, 680) with no underline and line-height 0, so it never opens up the row. It is labelled "Note T.N" for screen readers. **Hover/focus** lights the mark and its note with the reference wash.
- **Notes:** an ordered list under a 3px double heavy rule, in ink-2 meta text. Each note has a 1.75rem end-aligned blue number column and text capped at 80ch. A 24px return link (a 14px corner-up icon) jumps back to the mark. Hovering or focusing a note lights its mark and row.
- **Order:** notes are numbered in reading order, 1 to n per table, by first appearance. The mark shows the same number as its note.
- **Edit mark:** an edited passage carries a blue letter "e" in the mark style beside its bold "Edited" status. It is a real button with a 24px (1.5rem) minimum target, labelled "Show what passage N was edited from", and it opens its passage in place to show "Edited from". It has no note at the table foot.

**The Edit Mark Exception.** The edit mark is the one scoped exception to the reference-mark grammar: a letter, not a number, and it opens its passage in place instead of leading to a numbered note. A review holds thousands of passages, and numbered notes for every edit would bury the table's foot. Use it only for an edit to a passage; every sourced fact still takes a numbered mark and note.

### Passage Table (signature)
The review's grid: what requirement work cites, set against the working copy, row by row.
- **Columns:** No. (end-aligned), Where (ink-2 meta), the comparison text in ink 2 (headed "In service · version N", or "As extracted"), the working text in ink (headed "Working copy · version N", or "Reviewed"), and Status. Column heads are in the label style over a heavy rule; rows sit on hairlines, top-aligned, and long words wrap anywhere.
- **Rank:** edited and new statuses are bold; unchanged status is ink 2; an excluded passage's working text and status are ink 3 with "Excluded: reason" beneath in ink-2 meta; a removed passage is ink 3 throughout. A blocking warning sets its flag line in bold red.
- **Clamp and open:** text is clamped to four lines until the row opens. Hovering a row, and the focused/open row with its detail row, take the stock band. The focused row shows the blue focus outline inset by 2px. The detail row closes on a heavy rule and sets source (edited-from or as-extracted text, warnings, the original preview framed in a 1px rule, up to 28rem tall) beside the decision controls.

### Table Toolbar
The slot under a table's head. Besides the find field it holds a **notice** (a full-width medium-weight line with `role="status"`, such as the result of an upload) and a **toolbar link** (a reference-blue body link in medium weight with a 14px icon before it and a 2rem minimum target, such as "Search inside the documents").

### Governance Section
The unit of a document's governance pages. A lead-size bold title on a 2px heavy rule (0.25rem under the text), then an ink-2 lead capped at 72ch (bold facts inside it return to ink), then a governance table, a form, or a quiet line. Actions sit in a wrapping row, 0.75rem by 1rem apart: an action button for the commit, text buttons for the rest. Failures use the red failure line with `role="alert"`; empty states use the quiet line under its heavy rule. Inside the catalogue, a quiet line directly under a section title (or its lead) takes no second heavy rule: it sits 0.25rem under the title's own rule. A section title may carry a count after it in regular ink 2 ("Depends on 5"). A next-decision line may close a section inside a sheet, 0.5rem under its quiet line ("Assign it to a squad in the squad catalogue →").

### Governance Table
The numbered table's grid, set inside a governance section without its margin number.
- **Grid:** a real `<table>` with a visually hidden caption. Column heads in the label style over a 2px heavy rule; rows on hairlines, top-aligned, 0.5rem by 1rem padding; long words wrap anywhere. Numbers end-align.
- **Secondary lines:** see the Kept Column Rule. Each secondary fact is its own block line in ink-2 meta under the primary value of a kept column.
- **Rank:** the Weight Is Rank Rule applies: a due row (built and awaiting activation, a citation to reconcile) in bold, a stuck row's status bold red, a past row (replaced, withdrawn, no longer in use) in ink 3.
- **Clamp:** quoted requirement or passage text is clamped to four lines.
- **Place column:** where a row is a passage or field, its place is the row header, fixed at 14rem in ink-2 meta, with the field label as its secondary line.

### Search Results
A governance table of exact passages, best first, under a one-line ink-2 count ("7 passages from 5 documents, best first."). The passage is the row header, capped at 64ch, in its own direction. A text button on its own line under the passage ("Show the surrounding text (N places)") opens the surrounding text in place, as a stock-band block in meta: one place per line in a two-column grid (place in ink-3 on a 6rem track, its text in ink-2), the cited place in ink at medium weight, and no Markdown heading markers. It appears only when the context reaches beyond the passage's own place. The second column is the document title as a body link, with the version and its place ("version 1 · Heading › Line 2", plus a field label if any) on a left-to-right secondary line with the title isolated (`<bdi>`). Below 45rem that column drops and the same line rides under the passage.

**The Passages Rule.** On screen the indexed units of a document are "passages", and the units of the table-aware cut are "fields". The cut itself reads "Passages" or "Table-aware". The word "chunk" belongs to code, never to a label, heading, count or caption.

### Catalogue Head
The document page's head set for Table 2: the monumental 2, the title "Architecture catalogue", then an ink-2 edition line that says the version's state first and names it in bold: "In service: 'Name', published by X on date. N systems, N connections."; "Replaced: 'Name', published …; no longer in service."; or "In preparation: 'Name', started by X; not yet published.", the last two followed by a "Read the version in service" link. Under it, a meta line capped at 80ch: on the version in service, a bold ink line only when work is still mapped with an earlier version ("3 requirements still mapped with an earlier version."); on any other version, the consequence ("Publishing it would …" or "Putting it back in service would …", else "Its contents match the version in service."), its kinds counted in the One Kind Order. The platform's own seed actor is named "the platform", never an id.

On a draft, a row of text buttons follows: "Rename it" and "Remove this draft", each with `aria-expanded`, each opening an inline step under the head in the withdraw panel's shape (lead title, heavy rules above and below, 62ch). Rename holds a Name field, "Rename it" beside "Keep the name", and a waits line ("Give the version a name.", "The name is unchanged."). Remove states what goes and what does not ("The version in service does not change, and requirement work never saw the draft."), then an acknowledgement checkbox ("I understand the draft and its decisions cannot be brought back."); "Remove the draft" waits on it ("Confirm above first.") beside "Keep it". Once removed, Versions opens with a status notice naming what was removed.

### Systems Index
A labelled `nav` on its own sticky track (see Layout). A find field ("Find a system", placeholder "Name, alias or phrase") over an ink-2 meta count that answers the find ("2 systems known by 'order'", or "No system is known by 'x'."), announced politely. Systems group under label-style heads on a 2px heavy rule, each head the place path joined by " › ", with "Not placed in the landscape" for the rest. Each entry is a 2rem-tall body link on a hairline, in ink with no underline until hover. While finding, an ink-2 meta line under the name says which name matched (an alias or a phrase). **Current** (`aria-current="page"`) is bold with the inset 3px ink bar.

### System Sheet
- **Head:** a meta trail line (a "Back to X" text button with a 14px left arrow when the sheet was reached by following a connection, then the "All systems and connections" link); the title, focused on arrival from inside the portal; the Arabic name on its own ink-2 line, set right-to-left but aligned under the name; the facts list (Also called, Sits in); the description at 72ch.
- **Sections:** governance sections with h3 titles: What it does (capabilities and the phrases that match them), Depends on and Used by side by side with counts, Owned by, Offerings and journeys, Components, Constraints.
- **Connections:** each row names the other system as a link, with an ink-2 meta phrase that names the sheet's own system ("Gets data from CWOM", "Orchestrates CWOM"); "For what" carries the description. The row for the system the reader came from is lit in the reference wash and announced "(where you came from)".
- **Journey and offering sheets** reuse the head and trail ("All journeys", "All offerings"), with an ink-2 meta line where a system has its Arabic line.

**The Connection Sentence Rule.** A connection reads as a sentence that names both systems. On a sheet the phrase names the sheet's system; in All connections the verb rides under From ("calls the API of", "sends events to"); in a diff the sentence says the change ("now sends events to", "no longer depends on"), with "For what:" on its own line. Never an arrow, a bare kind code or an unnamed "this system".

### All Connections
The Systems page with no system chosen: a governance section with a count lead, then a governance table From (30%) · To (30%) · For what, with the verb as an ink-2 line under From. On phones the To column drops and From carries "verb To" as one secondary line.

### Domain Trees
Two governance tables (Where systems sit; What systems do, by business area). Depth is indent only: outermost domains bold, the second level indented 1rem, deeper levels 2rem. Arabic names and descriptions ride as secondary lines. Systems not placed close the landscape tree in one "Not placed" row, set past (ink 3).

### Journey Timetable
A journey sheet's Steps table: No. (3.5rem, end-aligned) · Step (medium-weight name) · Performed by. Steps group in runs under phase heads in the label style on a 1px rule; a phase that returns after another reads "Back to <phase>". Secondary lines carry "Seen by the customer", "Only in <channels>" when a step happens in some channels only, the description, supporting systems ("with …") and the mode. A step performed by the channel's entry system reads "The channel's entry system" under Performed by; in the explorer, which reads one channel, it names that system, with "The entry system of <channel>" on a secondary line (or "The entry system of <channel>, not named" in ink 2). "Then …" appears only when a step does not simply continue to the step below ("Then 30 if Covered; 80 if Not covered", "Then rejoins at 40"). Hand-overs follow as a governance table.

### Offerings
A governance table of offerings (code · family · version · lifecycle as a secondary line; Parts and Journeys counts end-aligned). An offering sheet: meta line, proposition, facts (For, Promises), Order types (one not offered is set past), Parts and who is responsible (each role in sentence case naming its system), then Rules and Journeys as hairline lists.

### Channels
The catalogue's Channels page (sub-index: Systems · Domains · Channels · …): a governance table Channel · Orders enter through · Can be ordered through it. The channel cell carries its kind and confidence, then its description, on secondary lines; the entry system is a link to its sheet ("No system is named" in ink 2 otherwise); each offering that can be ordered through the channel is a link, its order types on one secondary line joined by " · ". On a draft, "Edit the channels" opens an edit panel of repeating rows (Name, Kind, Orders enter through, What it is). Saving waits, with a line saying why, while a removed channel is still named by an order type or a journey step ("Still named: Shop (Business Pro: New Activation). Take the channel off those first."). On an offering sheet the Order types table gains an "Ordered through" column ("Not stated" in ink 2). In the offering and journey editors, channels are checkbox groups: "Ordered through" on each order type, "Happens in (none means every channel)" on each step, and "Performed by the channel's entry system" on a step, which takes the place of its Performed by choice.

### Explorer
The product architecture explorer reads the catalogue version in service, one offering, one of its order types and one of its channels at a time. It sits under Table 2's monumental number with the title "Product architecture explorer" and an edition line that names the version in service in bold. Labelled selects follow, side by side (wrapping on phones, each at least 13rem): Offering; Order type, whose options say "(no journey yet)" or "(not offered)" after the name; and Channel, the channels the order type can be ordered through, whose options say "(no entry system)" when none is named. Channel appears only when the order type names channels; otherwise every step is read together. The choice lives in the address (`?product=…&order=…&channel=…`), so a scenario can be linked. The scenario is a sheet, read for the chosen channel: its steps are those of that channel and those every channel shares, and a step performed by the channel's entry system is performed by that channel's system. Its title "Offering: Order type, through Channel", a meta line naming the journey that fulfils it and its confidence ("No journey fulfils it yet" otherwise), and the proposition. Then five governance sections: Systems in this order (System · Its part in this order · Steps, in the order the journey's steps first name them, then the systems named only for a part; the part is a sentence such as "Performs steps 3 and 5", with "Supports …" and each "Role for Part" on secondary lines), the journey's Steps and Hand-overs exactly as on a journey sheet, Parts and who is responsible in this order (only the responsibilities that hold for this order type), Plans and prices, and What the catalogue does not say yet. Plans and prices are read live from the product catalog by the offering's code, never from the catalogue: an ink-2 lead names the catalog, the code and the moment it was read ("read at 09:30, 5 Oct 2026"), says the knowledge catalogue keeps no copy, and lists the terms it is sold with; then a governance table Price · Falls due · Amount, one run per plan under a plan head row in the phase style (the plan's description, lifecycle and terms on secondary lines), amounts end-aligned in the catalog's own currency code ("AED 2,740.00") and never wrapped. While it reads, a quiet "Reading the product catalog…"; when no catalog is read, a quiet line saying so; an offering with no code, or a code the catalog does not hold, is a due line in bold (the Weight Is Rank Rule); a catalog that cannot be read is the red failure line with "Try again", and the rest of the sheet stands. The last section leads with one sentence naming what the catalogue cannot hold yet (order tracking, NFRs) and lists each gap as a due line in bold (the Weight Is Rank Rule): an order type with no channel recorded, steps with no system, steps given to a channel entry system the channel does not name, parts with no responsible system, facts marked as gaps. Nothing is filled in that the version does not hold.

Admins read it inside the binding and can follow a system, the offering or the journey into the catalogue. Anyone else signed in reads it in a reader's binding: the masthead with "Reading only: curating is for knowledge admins." and the account, no index of tables, and system names as text rather than links (requirement-portal ADR-0101).

### Versions
A governance table, newest first with the draft on top, ranked by the Weight Is Rank Rule. The version cell holds the name as a link and a contents line (systems · connections · offerings · journeys); the state cell holds the state word, then who, when and the revision as a secondary line. A text-button disclosure with a 14px chevron ("History and files"; "History, files, put back" on a replaced version) opens a detail row in place: row and detail on the stock band, the detail closing on a heavy rule. Inside: "Its catalogue file:" with Excel, YAML and JSON download text buttons; "What happened to it" as a titled history table (When · What, a rationale quoted on a secondary line); and, on a replaced version, the put-back panel. That panel is the withdraw panel's form: the consequence first, a "Why it goes back" reason field, the action button beside a "Keep the version in service" text button that closes it, and an ink-2 meta line saying why it waits, linked by `aria-describedby`. On phones the state and the disclosure ride in the version cell.

Under the table, the one draft is offered as a next-decision link: "Carry on with 'Name' →", into its sources. With no draft, a "Start a new version" form in the add-document shape takes its place: lead title over a 1px rule, an ink-2 lead saying a draft starts as a copy of the version in service, a Name field with an example placeholder, and "Start it" with its waits line.

### Draft Documents
The first section of a draft's Sources page: a governance table Document · Reading · Waiting (an end-aligned count of waiting suggestions).
- **Document cell:** the title in its own direction, then a left-to-right secondary line: filename, language ("English", "Arabic", "English and Arabic") and who added it.
- **Reading cell:** the state in words: "Not read yet", "Waiting to be read" and "Being read" (running), "Read", "Reading cancelled", "Reading failed: why" (delayed, bold red). The reading's warnings ride as numbered reference marks on the state, with numbered notes under the double rule, in reading order across the documents, said in English counts ("7 table rows were read directly", never "row(s)"). A read document adds "N suggestions on its last reading" as a secondary line.
- **Row actions:** a wrapping line of text buttons under the state, 0.25rem by 1rem apart: "Read it", "Cancel the reading", "Read it again", "Remove it". Remove confirms inline on the same line: an ink-2 consequence ("Its waiting suggestions stay listed, without their passages."), a bold "Remove it from the draft" and "Keep it".
- **Adding:** with no documents yet, the "Add a document" form stands open: an ink-2 lead naming the accepted files, then File, Title (filled from the filename) and Written in on the form grid, then "Add it and read it" with its 16px upload icon and waits line. Once documents exist it collapses to one "Add another document" text button (14px upload icon); after an add, the status notice sits beside it.

### Suggestions Notice and Bulk Action
The Suggestions section opens with the change notice resting on the section title's heavy rule, with no heading of its own: Waiting, Ready, Needs your decision, Waits for another, Accepted, Rejected; "Already in the draft" appears only when non-zero. An ink-2 total line follows ("18 suggestions from 2 documents."). Then one action button worded as exactly what it takes: "Accept the 4 ready and the 10 that wait on them" (or "Accept the 4 ready"; disabled as "Nothing to accept without a decision"). The second count is derived transitively: the waiting suggestions whose wait an accepted one would lift, again and again. Beside it, an ink-2 line gives the order and what stays for a person ("Domains first, then systems, then what hangs on them. Matches, inferred links and replacements stay for you."). Then the filter strip (Waiting · Needs your decision · Waits for another · Decided · All, Waiting pressed at first, Find at the end) and the keys line: j/k move, Enter open, a accept, r reject, e edit then accept, Esc close.

### Galley (signature)
One governance table of suggestions (Change · State), grouped in runs under system heads; never one table per system.
- **Group order:** new systems first, then the systems the draft has, then the sections Landscape domains, Offerings and Journeys, alphabetical within each. A group keeps the place it first took in the session, so a new system accepted into the draft does not jump.
- **Group head:** 1.5rem above, a heavy rule under it. The name in bold at title width: "New system · Name" with "New system" bold and the dot regular; an existing system as its sheet link; a section by its name. Then the ink-2 meta tally ("9 waiting", plus "· 3 of 9 shown" when filtered). Under it, text buttons: "Accept the N ready here" when N is at least 1, "Reject the N waiting here" when N is more than 1. Reject confirms inline in meta: "Reject all N? A rejection stays." with a bold "Yes, reject them" and "Keep them".
- **Foot:** the next-decision button, worded as the question it asks ("Decide whether 'Dynamics CRM' is a system the draft already has →", "Check the inferred link: …", "Decide whether to replace what the draft has: …"). With none, an ink-2 line ("Nothing needs your decision; 14 suggestions still wait.", "Every suggestion is decided.").
- **Focus:** one roving row in the tab order. After a decision, focus goes to the next waiting suggestion; if the decided row leaves the view, focus takes the row now standing where it stood. A row that remounts when its group changes gets focus back unless the curator moved it on purpose. Decisions are announced in a polite live region.

**The Kept Place Rule.** Deciding never moves the work. Groups keep their first-seen place for the session, rows never reflow on a state change, and focus lands where the next decision is, never back at the top.

### Suggestion Row
- **Change cell (row header):** the change as one sentence ("Adds the component Order API, built with Microservice", "Depends on CWOM"), then secondary ink-2 meta lines: "For: …" on a dependency, then the source, left to right: the document title isolated, its place, and "· read from a table" when the table reader produced it.
- **State cell:** the state word in the rank grammar (see the Weight Is Rank Rule; "Accepted with edits" when edited), then the reason as a secondary line: why it needs you ("'Dynamics CRM' may be a system the draft already has") or what it waits for ("Waits for the system Order Hub").
- **Open:** Enter or a click opens the row in place on the stock band, its detail row closing on a heavy rule. Hover takes the band too; the focused row shows the blue outline inset by 2px.
- **From the document:** a label on a 1px rule, the quote in curly quotes, then an ink-2 meta line with the document and place and a "Show the passage" (or "Show the image") text button. The passage opens as the search result's context block, on stock, one place per line, the cited place in ink at medium weight. An inferred link adds "Why it was inferred" with its rationale.
- **Decision:** a label on a 1px rule ("Decision"; once decided, "Accepted by X" with the day and "A decision stays"). Possible matches come first as a choices group ("Is 'X' a system the draft already has?": "Yes, it is **Name** · reason", "No, it is a new system"). Then "Accept" (action button, 16px check), "Edit, then accept" and "Reject" (text buttons, 14px icons), and the waits line linked by `aria-describedby` ("Say first whether the name means a system the draft has.", "Waits for the system X. Accept that first, or edit this to name what the draft has.").

### Catalogue Forms
The editor opens in the decision column under an "Edit, then accept" label, never in a modal.
- **Fields:** the world's field style on the form grid: text fields, text areas, selects at a 2rem minimum, checkboxes. A lines field edits a list one item per line, its hint saying so ("One per line.", or fuller, such as "One phrase per line. Requirement work maps a requirement here when it uses one.").
- **Grouped select:** a select may set its options in runs under `optgroup` labels, in the order given (squads under their value streams).
- **System select:** the draft's systems by name; a name the document used that the draft lacks stays choosable as "Name (not in the draft yet)"; "No system named" where none is allowed.
- **Repeating rows:** a ruled fieldset per group (Order types, Parts, Steps, Branches, Hand-overs), each row with its own "Remove …" text button (14px cross) and one "Add a <one>" or "Add another <one>" (14px plus) at the foot; "None yet." when empty.
- **Actions:** "Accept as edited" (action button) beside "Stop editing", with the reason it waits ("Every step needs a number and a name."). Escape stops editing.
- **System editor:** Name, Arabic name (right to left) and Sits in on the form grid ("Not placed in the landscape" first); Also called (one per line) and What it is; What it does as repeating rows (Capability, Business area, Delivered by the component, Matched by, one phrase per line); Components as repeating rows (Component, Arabic name, Built with, Also called, What it does); Constraints one per line. The galley and the edit panel share the same editors.

### Edit Panel
A hand edit opens in place where the thing is read, never in a modal or a card: a stock-band block closing on a heavy rule (see Shapes), its fields on the stock.
- **Title:** a lead-size bold h3 naming the act ("Edit CWOM", "Add a system", "Add a dependency of CWOM", "Edit where systems sit", "Edit the samples").
- **Body:** the editor's fields on the form grid; a removal's consequence as a lead at 62ch instead ("Its 3 connections go with it. Requirement work keeps mapping to it until the draft is published.").
- **Actions:** the action button worded as what it does ("Save the system", "Add the dependency", "Remove it from the draft"; "Saving…" while busy) beside a "Cancel" text button. Under them, the ink-2 meta waits line linked by `aria-describedby`, naming what to do first ("Choose the system it depends on.", "It is named by the offering <name>; edit those first.", "<domain> still holds systems; move them first.").
- **Failure:** the red failure line with `role="alert"` above the actions. A conflict (409) says what happened and what to do: "The draft changed while you edited (someone else, or a document's reading). Reload the page; your edit was not saved." Each catalogue words its own conflict; the squad catalogue's reads "The squad catalogue changed while you edited (someone else saved first). Reload the page; your edit was not saved."
- **Keys:** Escape cancels. Submitting does nothing while the action waits.
- **Removal:** the same panel with no fields: the title "Remove <name>" (or "Remove the dependency of A on B"), the consequence lead where there is one, and the action "Remove it from the draft" ("Remove it" for one dependency). A removed system or offering leaves its sheet for its index; a removed system's index says so in a status notice.

### Where Edits Are Offered
In the architecture catalogue, on a draft only; a published version shows no edit controls. The squad catalogue is kept current in place and offers its edits on every page. Each offer is a text button worded as its act, carrying `aria-expanded` where it toggles a panel.
- **A system sheet:** "Edit this system" and "Remove this system" in the head's action row. Depends on alone carries edits: "Add a dependency" under its table, and per-row "Change" and "Remove" under the For-what text, each naming the other system for screen readers. A dependency on this system is edited from the other system's sheet.
- **The systems index:** "Add a system" (14px plus) under the find field; a new system opens on its own sheet once saved.
- **Domains:** each tree edited whole ("Edit where systems sit", "Edit the business areas"), the panel taking the table's place; each domain a repeating row of Name, Arabic name, Inside ("At the top" first) and What it covers.
- **Offerings and journeys:** "Add an offering" / "Add a journey" on the list; "Edit this offering" and "Remove this offering" (and the journey's) in a sheet's head, editing the whole item.

### Catalogue File
A governance section on the Sources page. The lead says what a file replaces and what stays (documents and their suggestions). Then one wrapping row of download text buttons with 14px download icons: "The empty template", then the meta label "The draft as it stands:" and Excel · YAML · JSON. Under it, a search-bar-shaped form: the file field ("A catalogue file (Excel, YAML or JSON)") beside the secondary action button "Show what it would change" (16px icon; "Reading it…" while busy). Nothing is replaced unseen: the preview opens under the form in the withdraw panel's shape at full column width, titled "What '<file>' would change in the draft", holding the diff table, then "Replace the draft's content with the file" (action button, disabled when nothing differs) beside "Keep the draft as it is". After a replacement a status notice says the draft now holds what the file says.

### Diff Table (signature)
A version's list of alterations, read like a timetable's: counts first, then each kind's changes.
- **Counts:** the change notice's grid (Added · Changed · Removed), then an ink-2 total line naming each kind's count in the One Kind Order ("2 systems, 3 connections, 1 offering.").
- **Grid:** a governance table What · Change (15rem). Each kind is its own tbody, opened by a label-style head on a 1px rule with its count after it in regular ink 2, the journey phase head's form. Within a kind: added, then changed, then removed, alphabetical within each.
- **Change cell:** "Added", "Changed" or "Removed" in regular weight; a changed item's fields follow as a secondary line in words ("Arabic name and where it sits"), never field keys.
- **What cell:** a system that still exists is a link to its sheet; a removed row is past (ink 3). A connection reads as a sentence naming both systems and how ("Order Hub calls the API of CWOM", "now sends events to", "no longer depends on"), with "For what: …" on a secondary line. The service's arrow label never reaches the screen.
- **Empty:** the quiet line "Nothing differs."
- **Where:** the Changes page ("Changes from the version in service"), closing on the next-decision line "Check the samples against this draft →"; and inside the catalogue file's preview.

**The One Kind Order Rule.** Changes are counted and listed in one order everywhere: systems, capabilities, components, connections, landscape domains, business areas, offerings, journeys, documents. The head's consequence line, the diff table's total line and its groups all follow it, so a count read in one place is found in the same place in the next.

### Build State Line
One line that says how far the draft's build for matching has got: the status in bold ("Built for matching", "Being built", "Edited since it was built", "Not built yet."), then its detail in regular ink 2 ("at revision 5.", "at revision 4; the draft is at revision 5."). "The build failed" is bold red with its cause, announced as an alert; otherwise the line is a polite status. Its action follows on its own row: "Build it" or "Build it again" (action button), or a "Build it again" text button with a 14px rotate icon after a failure. Publish repeats the line with a "Check the samples" link.

### Check
The matching index section (lead, build state line, its action), then Sample requirements.
- **Samples:** "Compare all N" (action button; "Comparing 2 of 4…" while running) beside "Edit the samples" or "Add samples", which opens an edit panel with one lines field ("One requirement per line, at most 20."). Until the draft is built, an ink-2 waits line says to build first.
- **Tally:** once any is compared, a medium-weight status notice: "All compared: 2 mappings would move." or "1 of 4 compared: no mapping would move."
- **Samples table:** Requirement (row header, clamped to four lines) · With this draft (45%). The verdict is said in words in the status slot ("Same systems", "Now also finds Order Hub", "No longer finds X", "Finds no system now"), then "In service: … · This draft: …" as a secondary line, and any uncertainty on another. A row whose mapping moves is due: requirement and verdict bold. A failed comparison is bold red ("The model is busy; try again in a minute."). Under it, text buttons "Compare" / "Compare again" ("Comparing…") and "The evidence" with a 14px chevron and `aria-expanded`.
- **Evidence:** opens in place: the row and an evidence row on the stock band, closing on a heavy rule. Each system the draft would map to sits under its name as a label-style link on a 1px rule, then its cited quotes in curly quotes, each cut to 280 characters so the quote marks always close, each followed by a "The passage" link to the Evidence page; "No passage is cited for it." where none is.
- **Try a requirement:** a search bar 1.5rem under the samples, labelled "Try a requirement without saving it", with "Compare it"; its answer is one status line under it, the verdict bold and the systems in regular ink.
- **Next decision:** once built, "Publish '<name>' →" closes the page.

### Evidence Page
One governance section, "A cited passage": an ink-2 lead naming its source left to right (the document title isolated, then its place; or "From the catalogue's own entry for <system>" as a link), then the passage in body text keeping its line breaks, at 72ch, and a "Back to the checks" link.

### Publish
One governance section titled "Publish '<name>'", a form. The consequence comes first, as paragraphs: that publishing puts it in service at once, what it would change against the version in service (with "See every change"), how many requirements will show as mapped with an earlier version (the count bold), and how many suggestions wait undecided and are left out (the count bold, with "Decide them first"). Then the build state line, then the reason field ("What did you check?"), then one action button: "Publish it" when built, "Build it, then publish" when not ("Building, then publishing…", "Publishing…"), with its ink-2 waits line ("Say what you checked; it is kept in the version's history.", "The draft is being built; publish once it is done."). Once published, the page leaves for the catalogue in service, where a status notice says "'<name>' is in service."

### Squad Catalogue Head
The document page's head set for Table 3: the monumental 3, the title "Squad catalogue", then an ink-2 edition line of counts ("Kept current in place: 2 value streams, 3 squads, 3 products, 2 active people."), then a meta "Last change:" line naming the change in words, who made it and the day. Under it, on every page and above the sub-index, the change notice in its own form, a polite status (`role="status"`, labelled "Ownership of the systems in service"): the label-style title "Who runs the systems in service" on its heavy rule, the counts Systems in service · Run by a squad · No squad, then "Links no longer in service" only when it is not zero, then the ink-2 total line ("26 of 31 systems in service have no squad.", or "Every one of the 31 systems in service has a squad."). With no architecture version in service the notice gives way to one ink-2 line saying ownership cannot be counted yet.

### Products and Who Runs Them (signature)
The Products page reads the organisation through what it sells.
- **Value stream:** a governance section, its name the lead-size bold title on a heavy rule; then the ink-2 lead "Led by **Name** · 1 squad · 1 product" (the squad count a link to Squads; "**No lead named**" where none is); then the actions "Add a product", "Edit the value stream", "Remove it". "Add a value stream" opens the page.
- **Product:** a body-size bold sub-head, its description in ink 2 at 72ch, its row actions ("Edit the product", "Remove it"), then its runs table; "It names no system yet." where it names none.
- **Runs table:** a governance table System | Run by. The system is the row header, a link to its sheet, with its place path (joined by " › ") as a secondary line. Each squad that runs it is a link with "Contact: Name" (or "No contact named") as its secondary line. A system nobody runs is due: name bold and a bold "No squad", with the text button "Give it to a squad" on the same line. A system no longer in the catalogue in service is past, its name not a link, with "Not in the catalogue in service" as its secondary line.
- **Systems no product names:** the closing governance section, one runs table grouped in tbodies by place, each place a label-style head on a heavy rule (the systems index's form), "Not placed in the landscape" last; the place line drops from the rows. Quiet line: "Every system in service is named by a product."
- **Next decision:** the next-decision button ("Give DCRM to a squad →") opens the first gap in reading order; with none, the ink-2 line "Every system in service is run by a squad."

### Giving a System to a Squad
The catalogue's most common decision, made in place. The edit panel ("Give <system> to a squad") opens in a detail row under the system's row, row and panel on the one band, and is scrolled to the middle of the view with focus on the Squad select. Squads are grouped by value stream, leaving out those that already run it; a "Contact for it" select follows. "Give it to the squad" waits on "Choose the squad that runs it." Closing, by saving or cancelling, returns focus to the system's link; a row just given is lit in the reference wash until the reader's next action.

### Squads, People and History
- **Squads:** one governance table Squad | Runs, grouped in tbodies by value stream under label-style heads on a 1px rule (the journey phase head's form). The squad cell carries "Scrum master: Name" (or "No scrum master named") as a secondary line and its "Edit" and "Remove" text buttons. Runs lists each system as a link with " · contact" in ink 2 ("no contact named" where none); a system no longer in service is ink 3, "(not in the catalogue in service)".
- **People:** a governance section with "Add a person" and an inline "Find a person" field, then Person | Roles. Active people come first; an inactive person is past, the secondary line opening "Inactive". The secondary line gives team and email; an email breaks only after its @. Roles are said in words ("Leads Retail; Scrum master of Sales squad; Contact for 2 systems"), "No role" in ink 2. On phones the Roles column drops and the same words ride as a secondary line.
- **History:** a governance table When | What, newest first. When is the row header: time and day ("14:25, 3 Oct 2026"), unbroken, end-aligned, tabular. What says the change in words, with "by Name" on a secondary line. To anyone but a maintainer, the red line "The history is shown to maintainers of the catalogue."

### Squad Catalogue Edits
Edit panels in the world's form: on the Products page under the section or product they edit; on Squads and People in a detail row under the row, on the band. Titles name the act ("Add a value stream", "Edit Retail", "Add a product", "Add a squad", "Edit Rana Aziz", "Remove Sales squad"); actions say what they do ("Save the squad", "Add the person", "Remove it"). Value stream: Name, Led by. Product: Name, Value stream, What it is, then "Systems it rests on (N chosen)" as a find field over a checklist. Squad: Name, Value stream, Scrum master, then "Systems it runs" as repeating rows of System and "Contact for it". Person: Name, Email, Team and, when editing, "Active: can lead, be a scrum master or a contact". A person who holds a role cannot be made inactive: the checkbox is disabled and an ink-2 waits line under it, linked by `aria-describedby`, says why ("Rana Aziz still holds a role; hand it to someone else before marking them inactive."). A person select keeps a current holder who is no longer active as "<id> (no longer active)". Removal states its consequence ("Its systems stay in the catalogue; only the product goes.", "One system it runs has no other squad and will show as without one."); a value stream that still holds products or squads waits ("Move or remove this value stream's products and squads first.").

### Change Notice
Counts first, like a timetable's list of changes. A heading in the label style over a heavy rule, then a wrapping row of counts closed by a hairline. Each count is a label beside a fixed 4ch end-aligned bold value, so a count growing never moves its neighbours. The blocking count is red, label and value. At 45rem and below the counts stack as a totals list, one hairline per count. An ink-2 meta total line follows.

### Processing Line
The working copy's state on one line, ruled above and below with heavy rules and 0.75rem of block padding. The status is bold ink, red when processing failed (and announced as an alert); text-button actions and an ink-2 meta aside share the line.

### Withdraw Panel
An inline, deliberate step under the document head, never a modal: a 62ch column ruled above and below with heavy rules, a lead title, the consequence in body text, a reason field, and an action button ("Withdraw it") beside a text button to keep it, disabled until a reason is given.

### Save Bar
The review's foot, kept in view. A heavy rule on top over the stock background, 0.75rem block padding. A full-width ink-2 meta state line (the unsaved count in bold ink, or "All changes saved" with the revision), then the inline review summary field, "Save review" and the secondary "Approve and publish", then a full-width ink-2 meta line giving the reason an action waits, linked to the button by `aria-describedby`.

### Notices
Sign-in, no-access and still-opening screens use a 40rem column. The no-access screen points a signed-in reader to the product architecture explorer, and the sign-in screen says that anyone signed in can read it. Each has a portal line above a heavy rule, a title in the title style, body text capped at 62ch, and actions made of primary buttons and text buttons. Errors are set in red, medium weight.

## Do's and Don'ts

### Do:
- **Do** put every area in a numbered table: a monumental number in the 7.5rem margin column, a title, an edition line, a ruled grid, notes and one next-decision line.
- **Do** show a row's rank by weight and ink: bold for due, red and bold status for delayed, ink 2 for running, ink 3 for past.
- **Do** give every sourced fact a reference mark, and number the notes in reading order.
- **Do** keep lit states to a background wash (`reference-wash`), so rows and cells never reflow or change size.
- **Do** open a focused passage in place on the stock band (`stock-band`), with its detail row closing on a heavy rule.
- **Do** keep deliberate steps such as withdrawal inline and ruled under the head.
- **Do** say why a disabled action waits, in a line linked to it.
- **Do** put a governance table's secondary facts on a secondary ink-2 meta line in a kept column, so phones keep them when columns drop.
- **Do** mark the current page of a document's sub-index in bold ink with the inset 3px ink bar, and show the unsaved count on Review.
- **Do** read a connection as a sentence that names both systems; on a sheet, name the sheet's own system in the phrase.
- **Do** light the row a reader came from in the reference wash, and offer the way back as a "Back to X" text button.
- **Do** group an index or a timetable under label-style heads: a heavy rule under a systems index place, a 1px rule under a journey phase, and "Back to <phase>" when a phase returns.
- **Do** write "Then …" only when a step does not simply continue to the next.
- **Do** state what putting a catalogue version in service would change before asking for the reason.
- **Do** set shouted source values in sentence case, and name the platform's seed actor "the platform".
- **Do** say "passages" for indexed units and "fields" for the table-aware cut.
- **Do** use tabular, lining figures, and end-align numbers and dates.
- **Do** let content keep its own direction: `dir="auto"` on names, `lang="ar" dir="rtl"` on Arabic secondary lines, set in Noto Sans Arabic.
- **Do** keep targets at least 24px (text buttons 1.5rem, return links 1.5rem) and show the 2px blue focus outline on everything focusable.
- **Do** set a draft's suggestions in one galley under system heads, and keep each group's first-seen place for the session.
- **Do** say a suggestion's change as a sentence, with its source and reason on secondary ink-2 lines.
- **Do** word a bulk action as exactly what it takes ("Accept the 4 ready and the 10 that wait on them"), and leave matches, inferred links and replacements to a person.
- **Do** confirm a group rejection inline in its head, and a destructive draft step with an acknowledgement checkbox.
- **Do** word the next decision as the question it asks.
- **Do** move focus after a decision to the next waiting suggestion, or to where the decided row stood.
- **Do** edit a list one item per line, and keep a name the draft lacks choosable as "(not in the draft yet)".
- **Do** open a hand edit in place where the thing is read: on the stock band under what opened it, closing on a heavy rule, its fields on the stock, Escape to cancel, and a waits line that names what to do first.
- **Do** say a conflict in words and what to do about it ("Reload the page; your edit was not saved.").
- **Do** edit a system's dependencies on its own sheet; a dependency on it is edited from the other system's sheet.
- **Do** show what a catalogue file would change before it replaces anything, with Replace and Keep side by side.
- **Do** count and list changes in the One Kind Order, and say a changed item's fields in words.
- **Do** say a sample's verdict in words ("Now also finds Order Hub"), with both mappings on a secondary line, and set a sample whose mapping moves in bold.
- **Do** cut a quoted passage at 280 characters so its closing quote mark is always shown.
- **Do** state what publishing would change, and whether it builds first, before asking for the reason.
- **Do** set a due decision on the row it concerns: "Give it to a squad" rides on the line of the bold "No squad".
- **Do** hand focus back to what an in-place panel was about when it closes, and light a row just changed in the reference wash until the reader's next action.
- **Do** group a long choice of squads under their value streams (`optgroup`), and leave out the ones that already apply.
- **Do** disable a control that cannot be used yet and say why under it ("still holds a role; hand it to someone else before marking them inactive").
- **Do** say roles in words ("Leads Retail; Scrum master of Sales squad; Contact for 2 systems"), and break an email only after its @.
- **Do** word a conflict for the catalogue it happens in ("The squad catalogue changed while you edited …").
- **Do** honour `prefers-reduced-motion`. All transitions and animations collapse to 0.01ms.

### Don't:
- **Don't** use colour for anything except disruption (red) and reference or focus (blue).
- **Don't** add cards, panels, elevation shadows, pills, badges or gradients. Separation comes from the three rule weights.
- **Don't** warm the stock toward cream or paper.
- **Don't** add a second display typeface. Width and weight on Archivo carry the contrast.
- **Don't** add a dark theme without a new decision. Light only is the chosen office-daylight scene.
- **Don't** scroll tables sideways. Drop columns by priority instead.
- **Don't** open a modal or a card to edit or withdraw. Rows open in place; steps open inline.
- **Don't** extend the letter edit mark beyond edited passages. Sourced facts keep numbered marks and notes.
- **Don't** give a secondary fact (a cut, a count, a reason, a place) its own column.
- **Don't** say "chunks" on screen.
- **Don't** rule a quiet line twice. Directly under a section title it rests on the title's heavy rule.
- **Don't** show a connection as an arrow or a bare kind code.
- **Don't** offer a group action for nothing or for one: "Accept the N ready here" needs one ready, "Reject the N waiting here" needs two waiting.
- **Don't** show a zero count for an exceptional state; "Already in the draft" and "Links no longer in service" appear only when they have members.
- **Don't** box a repeating form row or an editor. Rows are ruled fieldsets, and editing happens in the open row.
- **Don't** set "Added", "Changed" or "Removed" in bold; a list of alterations is not a queue.
- **Don't** offer an edit control on a published version of the architecture catalogue. The squad catalogue has no versions; it is edited in place.
- **Don't** put a decision a row needs anywhere but on that row; a gap is one row high.
- **Don't** let the service's "source → target" label reach the screen; a changed connection is a sentence.
