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

The masthead is sticky (z-index 5) above 45rem and static below it. The index of tables is a four-column grid that becomes two columns of two below 60rem and one column at 45rem. The anchor scroll padding (5rem) keeps a jumped-to note clear of the masthead.

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
- **Index of tables:** four entries: Library, Architecture catalogue, Squad catalogue and Requirement knowledge. Each has a monumental condensed number, a title at 88% width and bold weight, and a meta extent line with its count and a proportional rule. Under it, a meta **state clause** carries the table's most pressing state in its rows' rank styling: medium red for a disruption ("1 draft failed", "2 stopped indexing, 2 overdue"), bold ink for what is due ("3 to decide", "31 with no squad"), nothing when the table is quiet, and red "Could not be read" when it failed. A check-in reads the book from its index without scrolling. **Hover** underlines the title. **Current** adds the inset 3px ink bar. Each entry announces "Table N:", then its count and state after spoken separators.
- **Document sub-index:** a labelled `nav` ("This document") under a document's head: Review · Search versions · Who cites it · Ownership. Each link is a 2.25rem-tall target in medium ink 2 with no underline; **hover** turns it to ink; **current** (`aria-current="page"`) sets it in bold ink with the inset 3px ink bar, above a 1px rule under the whole strip. While the working copy has unsaved changes, Review carries "· N unsaved" in regular weight. On phones the gap tightens to 0.75rem and the links drop to meta size; that override follows the base rule in the cascade. The catalogue uses the same strip, labelled "This catalogue": Systems · Domains · Channels · Offerings · Journeys, then Explorer on the version in service only, then on a draft only Sources · Changes · Check · Publish, then Versions, the last reading "All versions" while another version is being read. Check stays current while a cited passage from it is read. The squad catalogue uses it too, also labelled "This catalogue": Products · Squads · People · History. Table 4 uses it as "This table": Overview · Requirements · Findings; on the overview it sits in the table's toolbar slot.

### Numbered Table (signature)
The portal's only container. Every area screen is built from it.
- **Head:** the monumental number in the margin column, then the title (a link where the full table lives, with a rule-coloured underline that turns to ink on hover), then an ink-2 edition line saying which published state the table runs from.
- **Grid:** a real `<table>` with a visually hidden caption. The first cell of each row is a row header. Column heads are set in the label style above a 2px heavy rule. Rows sit on hairlines with baseline alignment. Numbers and dates use end alignment. A "more" row closes long tables with one ink-2 line ("and 20 more ...").
- **Rank states:** see the Weight Is Rank Rule. Each row's state is set by its rank class. A lit row only takes the reference wash, with an 180ms background transition.
- **Mixed language:** a name cell sets its primary name with `dir="auto"`. The Arabic name sits on a second meta line with `lang="ar" dir="rtl"`, set in ink 2.
- **Totals:** a 34rem-wide definition list under a label with a heavy rule. Each total sits on a hairline, with its value in medium weight and end-aligned.
- **Quiet and failure:** when no row needs anyone, one ink-2 line sits under a heavy rule. If the table could not be read, the line is red, medium-weight text with role="alert", followed by a "Try again" text button.
- **Status detail:** when a disruption takes a row's status, what the status would otherwise have said stays under it as an ink-2 meta line ("1 suggestion to decide"), by the Kept Column Rule.
- **Freshness:** a table says when its body last changed on its edition line, after a middle dot, with what changed where more than one thing can: "· last change 5 Oct 2026, a reading in ‘October update’". Once per table; never a total, and never the fetch time, which the masthead carries.
- **Next decision:** the single action line at the table's foot. It is a blue, bold, lead-size link followed by a 16px arrow. When there is nothing to do, it becomes plain ink-2 text in regular weight. Where the next decision is an action on the same page rather than a place, it is a button set exactly as the link: blue, bold, lead size, a 1px underline offset 0.2em that thickens to 2px on hover, the 16px arrow after it. Where the decision is taken in requirement work, it is the same link with a 16px up-right arrow, and its accessible name says it opens requirement work. A table whose grid holds few short columns (Table 4) keeps the grid to 48rem.

### Requirement Knowledge (Table 4)
Requirement work's corpus, read over its internal API (requirement-portal ADR-0099, Amendment 1). The portal stores none of it. Three pages share one head: the margin 4, the title, the overview's own counts edition line ("9 requirements, 9 indexed and current"), and the sub-index "This table": Overview · Requirements · Findings. The head and sub-index hold still from page to page. A requirement's title always leads to its Knowledge step in requirement work, where its owners decide, and its accessible name says it opens requirement work.
- **Overview** (`/requirement-knowledge`): the table in counts, with the sub-index in its toolbar slot. Rows appear only when their count is not zero, ranked: the index needing a rebuild, requirements that stopped indexing and findings open over 30 days are disruptions; findings open 7 to 30 days are due ("Awaiting owners"); findings under 7 days and requirements waiting to be indexed are running ("With their owners", "Indexing"). Each row's subject links to the page filtered to what it counts; a reference mark beside a linked subject keeps 0.75rem clear of it. Columns: What stands, Status, and an end-aligned Count of bare tabular numbers. Totals "In the corpus": Requirements, Indexed and current, Of them closed as duplicates, Open findings. Its next decision stays in the portal ("Ask the owners to decide the 2 overdue findings", then "Retry the 1 requirement that stopped indexing", then findings awaiting owners); only a rebuild leads out to requirement work.
- **Requirements** (`/requirement-knowledge/requirements`): a governance section ("Every requirement, by title", with a lead saying who acts) over a governance table. Columns: Requirement (the title, with "Owned by Name" or "No owner" as a kept secondary line), Index, Last screened and Open findings (both end-aligned figures). Rank: stopped indexing is a disruption (bold red status), a requirement with open findings is due (its title and count bold), one closed as a duplicate is past (ink 3). "Current" is the quiet default and never takes the status weight. The filter strip of index states carries the summary's counts, with a visually hidden comma before each count; "Stopped indexing" and "Waiting" are left out at zero unless pressed, and the counts are dropped once another filter narrows the page. Two checks ("With open findings only", "Not screened in 30 days") and a find field ("Find a title") sit with it. An owner's name is a quiet link (inherited colour, rule-coloured underline) that narrows the page to their requirements; the narrowing is said in a line with a "Show every owner's" text button. Every filter lives in the address. A no-match line offers "Show all requirements". "Show more" adds 50 at a time.
- **Findings** (`/requirement-knowledge/findings`): findings in force, the longest-standing first, under a section with a lead that says what an ask sends. Columns: Finding (its kind as the row header, with the judge's one-line rationale beneath, clamped), Between (both requirements, each with its owner beneath), Status ("Overdue" as a disruption, "Awaiting owners" as due, "With their owners" in service, with "Open N days, since date" or "Opened today" beneath) and Last asked (the last ask's date and who asked, "(you)" for the signed-in admin, or "Not yet"). A filter strip of ages carries the summary's counts under the same rules; a Kind select sits at its end.
- **Asking owners:** one verb, "Ask". Under Last asked, a text button names whom it reaches: "Ask Ravi Reviewer and you", "Ask Amina Owner", "No owner to ask". Requirement work notifies each owner once, links each to their Knowledge step, records who asked, and allows one ask a week per finding. What came of an ask is said in its own row, under the button (ink 2, or the medium red failure line with requirement work's reason), and once in a visually hidden status region, so no other row moves. While a finding waits out its week, or neither requirement has an owner, the button stays focusable with `aria-disabled="true"` and its reason ("Asked 2 days ago; again from 11 Oct 2026.") as an ink-2 meta line tied by `aria-describedby`. When the signed-in admin is the finding's only owner, the button gives way to a link, "Decide it yourself".
- **Asking about every overdue finding:** above the table, a next-decision button "Ask the owners of all 2 overdue findings →", counting only findings that can be asked now. It opens, in place, a confirmation between heavy rules that names everyone it reaches and about how many findings each ("Amina Owner (you), about 2 findings"), then an action button "Ask them" and a "Cancel" text button. Focus moves to the confirmation and returns to the button after. Its outcome is a status line: how many were asked, and for each refusal, the pair and requirement work's reason.
- **Retire and reinstate (B3):** on Requirements, each row's owner line ends with its corpus action after a middle dot, "Owned by Ravi Reviewer · Retire from the corpus" (or "Reinstate" on a retired row; a duplicate offers neither). The action is a text button as quiet as the line it sits on (ink 2, a rule-coloured underline), turning to ink on hover, focus and while its form is open; its accessible name adds the title. It opens a form in place, in a row beneath on the stock band closed by a heavy rule: a bold title naming the action and the requirement, an ink-2 lead (capped at 65ch) saying what follows for this requirement ("Its 2 open findings close as “source retired”. Ravi Reviewer is told why.", "It has no open findings.", "You own it, so you are told why.", "It has no owner to tell."), a required "Why" field, then the action button ("Retire it", "Reinstate it") and a "Cancel" text button. Focus moves into the field and the form scrolls into view; Escape or Cancel closes it and returns focus to the row's action. An empty "Why" is said under the field in red, the field takes a red border and keeps focus. While it sends, both buttons stay focusable with `aria-disabled`. Requirement work's refusal takes the red failure line with its own reason, and focus. What came of it is said once for the page, in a status line above the table ("Retired ‘Archive’ from the corpus. 1 finding closed as “source retired”. Ravi Reviewer was told."), and the row acted on is lit in reference wash until the reader's next action. Focus returns to the row's action, or to that line when the row has left the view. A retired row is past (ink 3), its Index reads "Retired", and "Retired by Omar Observer on 7 Oct 2026: reason" is kept as a secondary line. "Retired" joins the filter strip as an exceptional filter with its count; a retired requirement has no index state, so it never counts or filters as Current, Waiting or Stopped. The overview's totals gain "Of them retired".
- **Bulk work (B3):** above the Requirements table, "Retry the 2 requirements that stopped indexing →" is the next-decision button whenever any stopped, and "Reindex the 9 requirements shown" a quiet text button beside it (retired rows are left out; it is not offered when the page already shows only those that stopped). The line stays in place while either opens its confirmation beneath, between heavy rules: a bold title that takes focus, a lead capped at 65ch saying what follows, the action button ("Retry it", "Retry them", "Reindex them") and "Cancel". Escape or Cancel closes it and returns focus to its button. The outcome is a status line ("Retrying 2 requirements. The table updates as each is indexed."), which takes focus when the button it came from has gone. Requirement work does the work in the background.
- **Acting as admin on someone else's document (C):** a knowledge admin who doesn't own a library document sees where it stands, never its content. The library row shows its status ("Awaiting review", "Extraction failed") from the newest version's outline, with its owner's name and no "(you)". The document page shows what is in service, read-only, a "Newest: version 2, uploaded by Amina Owner on 5 Oct 2026. Read; awaiting its owner's review" line, and the owner line "Amina Owner owns this document; only they review or change it. Act as admin on Amina Owner's behalf…". The action is the same quiet text button as B3's row action. It opens a form in place: a bold title, an ink-2 lead capped at 72ch saying what the grant allows and what stays with the owner (uploading versions, building the search index), a required "Why", "Act as admin" and "Cancel". Focus, Escape, the empty-reason message and a refusal behave as in B3's form. While the grant lasts, a reference band sits above the head: a 4px reference rule on the inline start, reference wash, ink text, "**Acting as admin on Amina Owner's behalf** until 17:00 (6 Oct 2026): reason · Stop acting as admin". The owner's view returns under it, without "Upload a new version", the per-version retry and cancel, or the build controls (Search versions says "Building and activating its search versions stay with Amina Owner, its owner."). Commit buttons name whose behalf: "Approve on Amina Owner's behalf", "Withdraw it on Amina Owner's behalf". The Ownership page gains an "Admin record" table, newest first: when, what ("Began acting as admin", "Approved a version", "Handed it over"), by whom, and the reason. A handover by an admin reads "by Ravi Reviewer, as admin on Amina Owner's behalf".
- **Library bulk retry (C):** in the library table's toolbar, "Read the 2 documents that failed again →" (the next-decision button) and "Retry the 1 document whose indexing stopped" (a quiet text button). Each is offered only when its count is above zero, whoever owns the documents. The line, its confirmation, focus and outcome work exactly as B3's bulk work.
- **Cited by (C):** the library table gains a right-aligned "Cited by" column, at priority 3: "3 requirements", "None", or a dash when requirement work could not count. It counts Requirements across the whole portfolio; "Who cites it" still lists only those the reader may see.
- **Several files into a draft (C):** "Add documents" takes up to 20 files at once. With one file the Title field stays. With several it gives way to "3 files chosen; each is titled by its file name.", and the button reads "Add the 3 files and read them". Afterwards a status block lists each file in the order chosen, between hairline rules: the file name, its status ("Added; being read", "Added; not yet read", "Not added" in disruption red), the reason under it in ink 2, and "Read it" for a file the minute's model budget refused. A Word 97–2003 `.doc` is refused with "Open it in Word, save it as .docx, and upload that."
- **Compare two versions (C):** the Versions page links "Compare any two versions"; each version's details link "Compare it with the version in service". The compare page names both versions in its address. It shows From and To selects (each option "summer (in service, published 1 Jul 2026)"), a "Swap" text button between them, then the same alteration notice and table as a draft's Changes page. The same version on both sides says "Choose two different versions."
- **On phones** (under 45rem), by the Kept Column Rule: Requirements folds Index and Last screened into a secondary line under the title; Findings folds Status into the Finding cell and drops the rationale. Status words and figures never break inside a word.

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
The unit of a document's governance pages. A lead-size bold title on a 2px heavy rule (0.25rem under the text), then an ink-2 lead capped at 72ch (bold facts inside it return to ink), then a governance table, a form, or a quiet line. Actions sit in a wrapping row, 0.75rem by 1rem apart: an action button for the commit, text buttons for the rest. Failures use the red failure line with `role="alert"`; empty states use the quiet line under its heavy rule. Inside the catalogue, a quiet line directly under a section title (or its lead) takes no second heavy rule: it sits 0.25rem under the title's own rule. A section title may carry a count after it in regular ink 2 ("Depends on 5"). A section with several tables (Order tracking) names each part with a body-size medium-weight title on a 1px hairline, 1rem above it. A next-decision line may close a section inside a sheet, 0.5rem under its quiet line ("Assign it to a squad in the squad catalogue →").

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
A governance table of offerings (code · family · version · lifecycle as a secondary line; Parts and Journeys counts end-aligned). An offering sheet: meta line, proposition, facts (For, Promises), Order types (one not offered is set past), Parts and who is responsible (each role in sentence case naming its system), Non-functional requirements, then Rules and Journeys as hairline lists.

### Realisation and NFRs
How a part is realised, and what an offering requires of the platform (requirement-portal ADR-0101, step 4).
- **Realised as:** a third column on every Parts table (offering sheet and explorer). One line per thing the part is realised as, in layer order: CFS (what the customer is sold), RFS (what delivers it), Resource (what it runs on). The layer leads each line in the label style (ink 2, meta size, condensed, medium, 4.5rem wide), an `abbr` titled with its long name where it is an acronym; the name follows in ink, in its own direction, and may break after an underscore but never between letters. Each name hangs beside its layer, so a long name never wraps under it. An inferred or gap fact says so on a secondary line; a confirmed one says nothing. A layer its source marks as a gap, and a part with no layer recorded ("Not stated"), are due in bold (the Weight Is Rank Rule). Under the table, one keys line in ink-2 meta says the layers in words ("Realised as: **CFS**, what the customer is sold · **RFS**, what delivers it · **Resource**, what it runs on."), so no one has to hover or recall them. On phones (45rem and narrower) the column folds under the part's responsible systems, behind an ink-2 "Realised as" line, so the table keeps two readable columns and the row header stays the part's name.
- **Non-functional requirements:** a governance section titled with its count, under Parts. When any quality is undefined, a lead says so in bold ("2 qualities are not defined by any source yet."). Then a governance table Quality · Defined · What the sources say; Defined is "Defined", "Partly defined" or "Not defined", never wrapped, and a "Not defined" row is due (bold, the Weight Is Rank Rule). The statement ("Not stated" in ink 2 when there is none) carries its source on a secondary line. On phones the Defined column rides under the quality as a secondary line (the Kept Column Rule). None recorded: the quiet line "No non-functional requirement is recorded."
- **Editing:** in the offering editor each part gains a full-width "Realised as" group of repeating rows (Layer select, Name), each row named by its layer and name ("Remove CFS CFSS_ONPREM_FIREWALL_HE", cut at 40 characters) and the add button by its part ("Add another thing Firewall is realised as"); the offering gains a "Non-functional requirements" group (Quality, Defined select, What the sources say). Repeating rows inside a row take the whole width. A blank name, the same name twice in one layer (both saying which part), a blank quality or the same quality twice holds the edit with a line saying why.
- **Files:** a Realisation sheet (product_id · component_id · layer · name) and an NFRs sheet (product_id · quality · coverage · statement), each with confidence and source; `realisation` on each component and `nfrs` on each product in YAML and JSON.

### Order tracking
How an offering's orders are tracked once placed (requirement-portal ADR-0101, step 4): a governance section "Order tracking": after Non-functional requirements on the offering sheet, and straight after the Hand-overs in the explorer.
- **Lead:** which order types it is specified for ("Specified for New Activation, Migration."; in the explorer, the order being read and how many others: "Specified for New Activation and 5 other order types."), then what the sources say of its scope.
- **Parts**, each under a section-part title: "How each channel tracks its orders" (Channel · Correlation key · Tracked in; the story and the source under the channel, "Reads its status from TIBCO over getRealTimeOrderDetails" and any note under the screen); "What carries the order's progress" (From · To · What it carries, "Logs it itself" when a system logs to itself, "Over <interface>" on a secondary line); "What the customer sees" as milestones numbered in tabular condensed figures, each with the system that raises it; "Internal statuses" as a hairline list in the condensed face, identifiers kept as the source writes them; "When an order falls out" (When · What happens).
- **Due:** a key "Not defined", a screen "Not named", a handling "Not stated", and the value a source marks as a gap (what a flow carries, a milestone, how a fallout is handled) are bold (the Weight Is Rank Rule); a channel row missing its key or screen is a due row. Nothing else is bold.
- **In the explorer** it reads the scenario: the chosen channel's row only, the shared flows plus how that channel's screen reads the order's status (from the system it reads to the screen: "How Online's tracking screen reads the order's status"). For an order type tracking is not specified for, the lead says so as a fact ("Not specified for Cease." and the sources' note), followed only by fallout. Systems that only carry or show tracking join "Systems in this order" as "Takes part in order tracking", their Steps count "—".
- **Phones:** the To column rides under the From system ("To RTF") and the Correlation key under the channel, so names keep their words whole.
- **Editing:** an "Order tracking" group closes the offering editor. Without tracking it offers "Describe how its orders are tracked"; with it, "Specified for" order-type checkboxes, the two notes, and repeating rows for channels (the next undescribed channel first; Correlation key, Tracked in, Reads its status from, Over (interface), Its story, the note), flows, milestones, statuses and fallout, each fact with "How sure its source is", so a curator who settles a gap can say so; then "Remove its order tracking". A channel described twice, a flow without its systems or what it carries, or a milestone or status named twice holds the edit with a line saying why.
- **Files:** Tracking (one row per product), TrackingFlows, TrackingChannels and TrackingEvents (kind milestone, status or fallout) sheets; `tracking` on each product in YAML and JSON.

### Lifecycle notes
What happens to an offering over its life, as its sources tell it (requirement-portal ADR-0101, step 4): up/downgrade matrices, renewals, cessation, add-ons. A governance section "Lifecycle notes" (with its count) after Order tracking, on the offering sheet and in the explorer.
- **An index first.** Each note is an `article` whose section-part title (body size, medium, on a hairline) is itself the disclosure button: a 16px chevron, then the title, `aria-expanded` on the button and the content in place beneath it. Closed, a note shows its ink-2 meta line (its kind; "For Up / Downgrade, Renewal" or "For every order type", left out in the explorer; "Only in B2B Digital"; how sure its source is and the source) and what it holds ("Holds a table of 18 rows, a paragraph."), so a long list reads as an index. A lone note opens by itself. Above the list, one text button opens or closes every note ("Open every note" / "Close every note").
- **Open,** a note gives its summary and its content as the source sets it out: paragraphs and lists capped at 72ch, and governance tables whose first cell is the row header and whose source caption sits under the table in ink-2 meta, inside the `caption`. A table is named by its own heading or "table 2 of 2", so each can be told apart.
- **A carry-over** from another source than the note's is due until someone re-verifies it (the Weight Is Rank Rule): its heading over its first part is bold, in meta size ("v8.2 Master-Definition carry-over (not in SDD — re-verify)"), then "Carried over from another source: to re-verify before anyone relies on it." and how sure its source is in ink 2. Closed, its note says so in bold under what it holds ("Carries over content to re-verify."), and the explorer lists it in "What the catalogue does not say yet" ("Lifecycle note 'Renewal' carries over content from another source, to re-verify."). A one-column source table is read as a list under its head.
- **Phones** (45rem and narrower): a source table never scrolls sideways. Its column heads leave the screen (still read), and each row stacks under its row header with every value led by its column head in ink-2 meta ("To: B.Pro+ (w/o 5G)"); explicit table roles keep the stacked rows a table to a screen reader.
- **In the explorer** the title reads "Lifecycle notes for New Activation" and lists only the notes that concern the order type and the channel being read (a note naming no order type or channel concerns every one), then one ink-2 line: "2 more notes concern other order types or channels." None: "No lifecycle note concerns New Activation." A note itself is not a gap; only content it carries over to re-verify joins "What the catalogue does not say yet".
- **Editing:** a "Lifecycle notes" group in the offering editor, each note named by its title on its own heavy rule ("Note Cessation"): Title, "Kind, as the source groups it", How sure its source is, Source, Summary, "For order types (none means all)" and "Only in channels", their checkboxes set in 13rem columns, then "What it says" as repeating parts: Kind of part (Paragraph, List, Table), Its own heading, "Carried over from another source; to re-verify", and the content: the text; items one per line; or column heads separated by "|", rows one per line with cells separated by "|", and a caption. What is typed is kept exactly as typed and trimmed only when sent. A new note's id comes from its title. A note without a title, a note that says nothing, an empty paragraph or list, a table without heads or with a row wider than its heads holds the edit with a line saying why. The offering's own "Lifecycle status" field is named apart from its notes.
- **Files:** a LifecycleNotes sheet (product_id · note_id · title · kind · summary · order_types · channels) and a LifecycleBlocks sheet of each note's parts in order (kind text, list then one item row per item, table with its heads in cell_1… then one row row per table row); `lifecycle_notes` on each product in YAML and JSON.

### Channels
The catalogue's Channels page (sub-index: Systems · Domains · Channels · …): a governance table Channel · Orders enter through · Can be ordered through it. The channel cell carries its kind and confidence, then its description, on secondary lines; the entry system is a link to its sheet ("No system is named" in ink 2 otherwise); each offering that can be ordered through the channel is a link, its order types on one secondary line joined by " · ". On a draft, "Edit the channels" opens an edit panel of repeating rows (Name, Kind, Orders enter through, What it is). Saving waits, with a line saying why, while a removed channel is still named by an order type or a journey step ("Still named: Shop (Business Pro: New Activation). Take the channel off those first."). On an offering sheet the Order types table gains an "Ordered through" column ("Not stated" in ink 2). In the offering and journey editors, channels are checkbox groups: "Ordered through" on each order type, "Happens in (none means every channel)" on each step, and "Performed by the channel's entry system" on a step, which takes the place of its Performed by choice.

### Governance
Where the catalogue's knowledge comes from, and where its sources disagree (requirement-portal ADR-0101, step 5). A Governance page (sub-index: Systems · Domains · Channels · Governance · Offerings · …) holds two governance sections, the first taking the 1rem first-section padding.
- **Sources:** a lead says the levels in words ("L1 the canonical landscape, L2 a primary source for its scope, L3 a baseline carried forward."); then a governance table Source · Level · What it is the authority for, canonical first. The source cell holds its title, then short name · version · file on a secondary line. The level is an `abbr` (bold, condensed) titled with its long meaning, followed by its word ("**L2** Primary"). Authority, then "Covers …" and "Cannot tell: …" as secondary lines. A source not supplied, its content carried forward unread, is a due row with a bold "Not supplied: carried forward unread" (the Weight Is Rank Rule).
- **Conflicts between sources:** a lead says the catalogue never picks one; then a governance table Conflict · What each source says · Decision needed, every row due (bold title and bold decision). Columns hold 28%, 42% and 30% of the table. The conflict cell leads with its id in the label style, then what differs, then one secondary line per offering it affects, the offering a link: "Affects Business Pro Plus: Up / Downgrade, raises OQ-01", "Affects Office Presence, every order type". Each side is a definition, the two parted by a hairline: where it is said in ink-2 meta ("BPP SDD (L2) §11.1.3"), then the statement. Under the decision, "Meanwhile: …" and how sure its source is.
- **Phones** (45rem and narrower): both tables stack like a lifecycle note's, each value led by its column head in ink-2 meta; explicit table roles keep them tables to a screen reader.
- **Editing:** on a draft, "Edit the sources" and "Edit the conflicts" each open an edit panel in place of their section, one at a time, taking focus on its title and giving it back on close. Sources are repeating rows named on their own heavy rule (Title, Short name as facts cite it, Id made from the short name when empty, Level, Version, File, "Supplied for this review", What it is the authority for, What it covers, What it cannot tell); a source an offering or a conflict still names cannot go ("Still named: SMB Ref (the offering Business Pro Plus). Take the source off those first."). Conflicts are repeating rows (Title, Id, How sure its sources are; "One source says" and "Another says", each Source · Where it says so · What it says; What differs; What the catalogue does meanwhile; The decision it needs; and "What it affects" as rows of Offering, The question it raises and order-type checkboxes).
- **Levels** are always said the same way, the tag straight after the cited name: "BPP SDD (L2) §10", "v8.2 (L3, not supplied) OrderEvaluate".
- **On an offering sheet**, after Lifecycle notes: "Decisions needed" (its conflicts, as above without the Affects line, with "See every conflict between sources"), shown only when it has any, each decision closed by "Raises the question OQ-01" when it raises one; "Open questions" (a hairline list on a 7rem id column: the id in the label style, the question, "Meanwhile: …", how sure its source is), listing only the questions no decision raises, its lead counting the rest ("1 more is raised by the decisions needed, and named with them."); "Architecture decisions" (id, title in medium weight, what was decided); "Sources and boundaries" (each source on a 9rem level column, "· its primary source", a source not supplied with a bold "Not supplied" due line; then "What its sources cover" and "No longer uses: …"). Each of the last three has its own section edit. A question a conflict still raises cannot go ("The conflict Up / Downgrade channel scope raises the question OQ-01; change the conflict first.").
- **A fact's source** that begins with a registered source's id or short name says its level after the cited name: "BPP SDD (L2) §10", "v8.2 (L3, not supplied) OrderEvaluate". A reference the source left as a dash is no reference. Unregistered text is shown as written.
- **Files:** Sources, Conflicts, ConflictScopes, Questions, Decisions and Boundaries sheets, and sources and primary_source on Products; `sources` and `conflicts` at the top and the offering's governance on each product in YAML and JSON.
- **Change history** (step 7): a third section, a governance table Change request · Applied · What it changed. The request cell leads with its id in the label style, then its title in medium weight, then where it came from ("From Requirement AI, asked by Layla Haddad · High priority · wanted by 31 Jan 2027", or "Drafted in the original explorer"), the approval it carries ("REQ-2026-0412, revision 3, approved by Layla Haddad on 3 Oct 2026") and "Why: …" on secondary lines. Applied gives the day and "to" the offering. What it changed lists its items, each led by its feature in the label style, an item that needs an architect's review or a decision in bold with that said in brackets, and "Not mapped: …" lines in bold. It is read-only: history is written by accepting from a change request or by a catalogue file. Empty, a quiet "No change request has been applied to this version."
- **Open questions** asked for some order types only say so on a secondary line ("Asked for New Activation"); their editor has an "Asked for the order types (none means the whole offering)" checkbox group, where an order type a change request named that the offering lacks stays ticked as "Change plan (not one of its order types)" so it can be unticked.

### Explorer
The product architecture explorer reads the catalogue version in service, one offering, one of its order types and one of its channels at a time. It sits under Table 2's monumental number with the title "Product architecture explorer" and an edition line that names the version in service in bold. Labelled selects follow, side by side (wrapping on phones, each at least 13rem): Offering; Order type, whose options say "(no journey yet)" or "(not offered)" after the name; and Channel, the channels the order type can be ordered through, whose options say "(no entry system)" when none is named. Channel appears only when the order type names channels; otherwise every step is read together. The choice lives in the address (`?product=…&order=…&channel=…`), so a scenario can be linked. The scenario is a sheet, read for the chosen channel: its steps are those of that channel and those every channel shares, and a step performed by the channel's entry system is performed by that channel's system. Its title "Offering: Order type, through Channel", a meta line naming the journey that fulfils it and its confidence ("No journey fulfils it yet" otherwise), the proposition, and a meta line naming the sources it is read from with their levels, the primary one first ("Read from BPP SDD (L2, primary), SMB Ref (L1)"). When its sources contradict each other for this order type, a bold note follows the head, before anything else ("2 decisions are open for New Activation: Up / Downgrade channel scope · Commitment model. Its sources contradict each other there, and the catalogue never picks one."), each title a link down to its row in "Decisions needed for <order type>", which follows Plans and prices with what each conflict raises. Then these governance sections, in order: Systems in this order (System · Its part in this order · Steps, in the order the journey's steps first name them, then the systems named only for a part; the part is a sentence such as "Performs steps 3 and 5", with "Supports …" and each "Role for Part" on secondary lines), the journey's Steps and Hand-overs exactly as on a journey sheet, Order tracking for this order type and channel (how the order is followed once it runs, so it reads straight after the hand-overs), Lifecycle notes for this order type and channel, Parts and who is responsible in this order (only the responsibilities that hold for this order type, with how each part is realised), Non-functional requirements as on an offering sheet, Plans and prices, Decisions needed for the order type, Open questions (only those no conflict raises; a question another order type's conflict raises is left to that order type), Architecture decisions and Sources and boundaries as on an offering sheet, and What the catalogue does not say yet. Plans and prices are read live from the product catalog by the offering's code, never from the catalogue: an ink-2 lead names the catalog, the code and the moment it was read ("read at 09:30, 5 Oct 2026"), says the knowledge catalogue keeps no copy, and lists the terms it is sold with; then a governance table Price · Falls due · Amount, one run per plan under a plan head row in the phase style (the plan's description, lifecycle and terms on secondary lines), amounts end-aligned in the catalog's own currency code ("AED 2,740.00") and never wrapped. While it reads, a quiet "Reading the product catalog…"; when no catalog is read, a quiet line saying so; an offering with no code, or a code the catalog does not hold, is a due line in bold (the Weight Is Rank Rule); a catalog that cannot be read is the red failure line with "Try again", and the rest of the sheet stands. The last section leads with one sentence naming what the catalogue cannot hold yet (information objects) and lists each gap as a due line in bold (the Weight Is Rank Rule): an order type with no channel recorded, steps with no system, steps given to a channel entry system the channel does not name, parts with no responsible system, parts whose realisation is not recorded, no NFR recorded or qualities no source defines, no order tracking recorded, a channel whose tracking, screen or correlation key is not described, tracking facts marked as gaps, lifecycle notes carrying over content to re-verify, conflicts between its sources that need a decision ("2 conflicts between its sources need a decision before New Activation can be relied on."), facts marked as gaps. Nothing is filled in that the version does not hold.

Under the scenario's head, after the "Read from" line, a text button with a 14px download icon on the text column's edge, "Download the Solution Architecture (.docx)", is followed by an ink-2 meta line that says what it writes ("A Word document of this scenario in eighteen sections, for architecture review; what the catalogue does not hold is marked as a gap."), beside it when the line has room and under it otherwise, linked by `aria-describedby`. See Solution Architecture Document.

Admins read it inside the binding and can follow a system, the offering or the journey into the catalogue. Anyone else signed in reads it in a reader's binding: the masthead with "Reading only: curating is for knowledge admins." and the account, no index of tables, and system names as text rather than links (requirement-portal ADR-0101).

### Solution Architecture Document
The explorer's scenario as a Word document, written in the browser from the version on screen (requirement-portal ADR-0101, step 6); nothing is sent to the service but the plans read, which reuse the page's own read. Any reader can take it.
- **The button:** while it writes, the label reads "Writing the document…" in ink 3 without its underline, with `aria-disabled` (so it keeps focus) and a polite status; it writes in under a second. A failure is the red failure line with `role="alert"` ("The document could not be written: why") and "Try again"; the retry gives focus back to the download. The generator is a chunk of its own, loaded on the first download.
- **Structure:** the original explorer's: a cover titled "Offering: Solution Architecture" (no eyebrow; offering, order type, channel, catalogue version and when it was published, generated when, status), Document Control (source documents by level with the unsupplied ones due, confidence, assumptions, boundaries, and the change history of the offering as the original listed it: Change request · Applied · Request · What it changed, or "No change request has been applied to this offering."), a contents field, then eighteen numbered sections, from Executive Summary to Traceability Matrix, with one design section for each system that takes part. A section whose top-level table or figure is wide (the overview, realisation, hand-overs, the end-to-end journey, traceability) is set landscape. A section that is only a gap to say (9, 12, 14) runs on from the one before, and so does the section after it, rather than leaving a page nearly empty; a table of up to eight rows keeps to one page. The status is one line everywhere, cover, Document Control and footer: "DRAFT: generated from the catalogue; not approved until the architecture authority reviews it." Section 1.4 says the stages and tracking chain in one sentence; section 2 holds their table. Each system's section leaves out what is recorded for the offering as a whole (business objects, security, NFRs; said once in the section's lead) and rows with nothing to say. 16 lists what the catalogue does not say in ink, then "Facts marked in their sources as a gap" (Fact · Section · Source), conflicts and open questions. 17 says which steps belong to other channels and are left out, and drops a condition that only splits the journey by channel.
- **Gaps:** a section the catalogue cannot hold yet (information objects, security attributes, deployment, TM Forum alignment) says "The catalogue does not hold … yet, so this is a gap; nothing is filled in." A missing fact inside a table reads "Not recorded (gap)", "None named (gap)" or "No system (gap)"; steps no system performs are "2 steps: no system (gap)" in every table and the figure. "—" means only "does not apply"; a column no source fills (hand-over timing, correlation) is left out and said once under the table.
- **Look:** the Timetable Book in Word: Arial (Word has no Archivo) in ink on white, a 1.5pt ink rule under each section title and over each table head, hairline row rules and no verticals, row names on the stock band. Rank is weight; red is kept for a gap (bold red on the disruption wash), a decision needed is bold ink, and inferred facts are ink 2. Roles and kinds are said in words ("Fulfilment for Broadband", "Connectivity"), never as codes. Captions are 8.5pt italic ink 2 with space above. Callouts carry a heavy left rule: red for gaps, ink for decisions needed, ink 3 for content carried over. Arabic lines are set right to left.
- **Sources:** every fact's confidence and source in one cell on a column of at least 14%: the confidence, then its citation on the next line, "Confirmed / BPP SDD (L2) §11.2", with the level as on screen and the section's title after "›" left out. Source documents are listed by level.
- **Overview figure:** set across a landscape page so its text prints at 8pt or more, no taller than the page leaves room for: the journey's stages left to right (each name in its own case on up to two lines on the band; a system's name on up to three), a box per system that performs a step, a dashed red box for steps no system performs, and the order's tracking chain beneath; drawn as SVG and rasterised at twice its size, with alt text listing each stage and its systems. A browser that cannot draw it still gets the document.
- **File name:** "Business_Pro_Plus_New_Activation_B2B_Digital_Solution_Architecture.docx", as the original named it.

### Versions
A governance table, newest first with the draft on top, ranked by the Weight Is Rank Rule. The version cell holds the name as a link and a contents line (systems · connections · offerings · journeys); the state cell holds the state word, then who, when and the revision as a secondary line. A text-button disclosure with a 14px chevron ("History and files"; "History, files, put back" on a replaced version) opens a detail row in place: row and detail on the stock band, the detail closing on a heavy rule. Inside: "Its catalogue file:" with Excel, YAML and JSON download text buttons; "What happened to it" as a titled history table (When · What, a rationale quoted on a secondary line); and, on a replaced version, the put-back panel. That panel is the withdraw panel's form: the consequence first, a "Why it goes back" reason field, the action button beside a "Keep the version in service" text button that closes it, and an ink-2 meta line saying why it waits, linked by `aria-describedby`. On phones the state and the disclosure ride in the version cell.

Under the table, the one draft is offered as a next-decision link: "Carry on with 'Name' →", into its sources. With no draft, a "Start a new version" form in the add-document shape takes its place: lead title over a 1px rule, an ink-2 lead saying a draft starts as a copy of the version in service, a Name field with an example placeholder, and "Start it" with its waits line.

### Change Requests
Approved backlogs Requirement AI sends when a breakdown's final approval is recorded (requirement-portal ADR-0101, step 7). Nothing in them reaches the catalogue until someone accepts it.
- **On Versions**, after the versions and the draft link: a governance section "Change requests from Requirement AI" with the number waiting after its title ("2 waiting"), a lead saying where they come from and what reading one does, then a governance table Change request · From Requirement AI · State, newest first, stacking on phones like the governance tables. The request cell: its id in the label style, its title in medium weight, then "3 approved features for Business Pro Plus · received 3 Oct 2026". From: the approval it carries ("REQ-2026-0412, revision 3, approved by Layla Haddad on 3 Oct 2026") over its features, each led by its id in the label style. State, ranked by the Weight Is Rank Rule: a waiting one is due ("Waiting", bold) with "Read it into 'November'" (the draft in progress) or "Read it into a new draft", and "Dismiss it"; a read one says "Read into 'November'" with who and when and "Its suggestions →" (settled in that draft, so it is not dismissed), or "Read it again" and "Dismiss it" when that draft is no longer in preparation; a dismissed one is past, with who, when and why. While reading, the row's action says "Reading…", and a failure shows in that row. Reading opens the draft's Sources page with a status notice ("CR-… is read into 'November': 3 suggested questions below.", or "into a new draft named after it"). The number waiting also follows the Versions link of the catalogue's sub-index ("Versions · 2 waiting"), so a request is seen from every catalogue page.
- **Dismissing** opens in place: "Why it is dismissed" (focused), an ink-2 line that a dismissal stays, then "Dismiss it" in bold (waiting on a reason: ink 3, no underline, described by "Give a reason first.") and "Keep it"; Escape keeps it. Closing the form hands focus back to the row's "Dismiss it", and a dismissal to the row.
- **On a draft's Sources page**, after its documents: a "Change requests" section listing those read into it in a governance table (Change request · Reading · Waiting) that stacks on phones, with "N suggestions on its last reading", what the reading could not match as ink-2 lines (each its own sentence: "FT-3: the offering 'Office Presence' is not in the draft; its question waits for it."), and "Read it again". What a reading said of one feature is said again on that feature's suggestion, as ink-2 lines under its state and in its "From the change request" detail, so it is read where it is decided. The suggestions' total says where they came from: "12 suggestions from 2 documents and 1 change request."
- **Accepting** a question from a change request registers the change request as an L2 source of the offering, its approval as its authority, and records it in the change history (see Governance).

### Draft Documents
The first section of a draft's Sources page: a governance table Document · Reading · Waiting (an end-aligned count of waiting suggestions).
- **Document cell:** the title in its own direction, then a left-to-right secondary line: filename, language ("English", "Arabic", "English and Arabic") and who added it.
- **Reading cell:** the state in words: "Not read yet", "Waiting to be read" and "Being read" (running), "Read", "Reading cancelled", "Reading failed: why" (delayed, bold red). The reading's warnings ride as numbered reference marks on the state, with numbered notes under the double rule, in reading order across the documents, said in English counts ("7 table rows were read directly", never "row(s)"). A read document adds "N suggestions on its last reading" as a secondary line.
- **Row actions:** a wrapping line of text buttons under the state, 0.25rem by 1rem apart: "Read it", "Cancel the reading", "Read it again", "Remove it". Remove confirms inline on the same line: an ink-2 consequence ("Its waiting suggestions stay listed, without their passages."), a bold "Remove it from the draft" and "Keep it".
- **Adding:** with no documents yet, the "Add a document" form stands open: an ink-2 lead naming the accepted files, then File, Title (filled from the filename) and Written in on the form grid, then "Add it and read it" with its 16px upload icon and waits line. Once documents exist it collapses to one "Add another document" text button (14px upload icon); after an add, the status notice sits beside it.

### Suggestions Notice and Bulk Action
The Suggestions section opens with the change notice resting on the section title's heavy rule, with no heading of its own: Waiting, Ready, Needs your decision, Waits for another, Accepted, Rejected; "Already in the draft" appears only when non-zero. An ink-2 total line follows ("18 suggestions from 2 documents."). Then one action button worded as exactly what it takes: "Accept the 4 ready and the 10 that wait on them" (or "Accept the 4 ready"; disabled as "Nothing to accept without a decision"). The second count is derived transitively: the waiting suggestions whose wait an accepted one would lift, again and again. Beside it, an ink-2 line gives the order and what stays for a person ("Domains first, then systems, then what hangs on them. Matches, inferred links and replacements stay for you."). Then the filter strip (Waiting · Needs your decision · Waits for another · Decided · All, Waiting pressed at first, Find at the end) and the keys line: j/k move, Enter open, a accept, r reject, e edit then accept, Esc stop editing, then close.

### Galley (signature)
One governance table of suggestions (Change · State), grouped in runs under system heads; never one table per system.
- **Group order:** new systems first, then the systems the draft has, then the sections Landscape domains, Channels, Offerings and Journeys, alphabetical within each. A channel suggestion reads "Adds the channel Business Web, its orders entering through Order Portal" ("Adds what the document says about the channel …" when it fills an existing one, never overriding what is set); it waits for its entry system, and an offering or journey waits for the channels it names ("Waits for the channels Business Web, Sales Agent"). Editing a channel suggestion uses the Channels page's fields. An offering suggestion says what it holds beyond its parts ("Adds the offering Office Connect, with realisation for 2 parts, 3 NFRs, order tracking and 2 lifecycle notes"; "…with the document's version, which includes …" when it replaces one), and waits for the systems and channels its parts, order types, order tracking and lifecycle notes name. An offering or journey waiting for systems names them, and the channels it also lacks, in the documents' names ("Waits for the systems Flow Engine, Order Portal, and the channel Business Web"; past four names, "and 3 more"), and its decision line says "Accept those first" when more than one is named. Its open detail adds "What it holds" under the cited passage: a definition list on hairlines, label in ink 2 beside the text (stacked at 45rem and below), one line each for realisation, NFRs, order tracking and lifecycle notes; a note carrying content to re-verify adds a due line in bold ink. In its editor, a channel or system the document named that the draft does not have yet shows as written, "Business Web (not in the draft yet)", ticked or chosen, never as "Choose a channel". A suggestion editor's actions rest on the foot of the view while the form scrolls, on the band above a heavy rule, at every width, since a whole offering runs many screens. A group keeps the place it first took in the session, so a new system accepted into the draft does not jump.
- **Group head:** 1.5rem above, a heavy rule under it. The name in bold at title width: "New system · Name" with "New system" bold and the dot regular; an existing system as its sheet link; a section by its name. Then the ink-2 meta tally ("9 waiting", plus "· 3 of 9 shown" when filtered). Under it, text buttons: "Accept the N ready here" when N is at least 1, "Reject the N waiting here" when N is more than 1. Reject confirms inline in meta: "Reject all N? A rejection stays." with a bold "Yes, reject them" and "Keep them".
- **Foot:** the next-decision button, worded as the question it asks ("Decide whether 'Dynamics CRM' is a system the draft already has →", "Check the inferred link: …", "Decide whether to replace what the draft has: …"). With none, an ink-2 line ("Nothing needs your decision; 14 suggestions still wait.", "Every suggestion is decided.").
- **Focus:** one roving row in the tab order, its stop the change sentence's disclosure button (see Suggestion Row). After a decision, focus goes to the next waiting suggestion; if the decided row leaves the view, focus takes the row now standing where it stood. A row that remounts when its group changes gets focus back unless the curator moved it on purpose. Decisions are announced in a polite live region.

**The Kept Place Rule.** Deciding never moves the work. Groups keep their first-seen place for the session, rows never reflow on a state change, and focus lands where the next decision is, never back at the top.

### Suggestion Row
- **Change cell (row header):** the change as one sentence ("Adds the component Order API, built with Microservice", "Depends on CWOM") held in a disclosure button: `aria-expanded`, `aria-controls` naming the detail row while open, and `aria-describedby` naming the State cell. The button has no frame or fill and reads as the sentence; its focus draws the row's ring. A plain table's row never carries `aria-expanded`. Then secondary ink-2 meta lines: "For: …" on a dependency, then the source, left to right: the document title isolated, its place, and "· read from a table" when the table reader produced it.
- **State cell:** the state word in the rank grammar (see the Weight Is Rank Rule; "Accepted with edits" when edited), then the reason as a secondary line: why it needs you ("'Dynamics CRM' may be a system the draft already has") or what it waits for ("Waits for the system Order Hub"). A suggestion with edits kept adds "Edited, not accepted yet".
- **Open:** Enter or a click opens the row in place on the stock band, its detail row closing on a heavy rule. Hover takes the band too; the focused row shows the blue outline inset by 2px. Opening brings the detail into view and keeps the row in view above it, 2rem clear of the window's foot.
- **From a change request** (step 7): the row's source line reads "CR-20261003-Business_Pro_Plus · Feature FT-1 · from Requirement AI", and the open row's label is "From the change request": the feature's name and outcome in curly quotes, the change request and feature in ink-2 meta, then the approval it carries ("Requirement AI requirement REQ-2026-0412, revision 3, approved by … Epic EP-1: …"), with no passage to show. A suggested question reads "Asks of Business Pro Plus (New Activation): …" ("Rewords the question it asks of …" when the draft asks it differently) and sits in a "Questions for offerings" group after Offerings; it waits for "the offering Office Presence" or for "Business Pro Plus's order type Change plan". Its editor chooses the offering ("… (not in the draft yet)" as written), then the question's fields as an offering's.
- **From the document:** a label on a 1px rule, the quote in curly quotes, then an ink-2 meta line with the document and place and a "Show the passage" (or "Show the image") text button. The passage opens as the search result's context block, on stock, one place per line, the cited place in ink at medium weight. An inferred link adds "Why it was inferred" with its rationale.
- **Decision:** a label on a 1px rule ("Decision"; once decided, "Accepted by X" with the day and "A decision stays"). Possible matches come first as a choices group ("Is 'X' a system the draft already has?": "Yes, it is **Name** · reason", "No, it is a new system"). Then "Accept" (action button, 16px check), "Edit, then accept" and "Reject" (text buttons, 14px icons), and the waits line linked by `aria-describedby` ("Say first whether the name means a system the draft has.", "Waits for the system X. Accept that first, or edit this to name what the draft has.").
- **Kept edits:** edits made in the editor and not accepted are kept while the page stays open, whether editing stops or the row closes; only accepting, rejecting or "Drop the edits" ends them. With edits kept, a meta line opens the decision, above its buttons: "You have edits not accepted yet. They are kept while this page stays open." with a "Drop the edits" text button. Accept then reads "Accept as the document said", "Edit, then accept" reads "Back to your edits", and `a` opens the row instead of accepting. Leaving an open row with kept edits says "Closed. Your edits are kept while this page stays open." in the live region; dropping says "Your edits are dropped." and leaves focus on the edit button.

### Catalogue Forms
The editor opens in the decision column under an "Edit, then accept" label, never in a modal.
- **Fields:** the world's field style on the form grid: text fields, text areas, selects at a 2rem minimum, checkboxes. A lines field edits a list one item per line, its hint saying so ("One per line.", or fuller, such as "One phrase per line. Requirement work maps a requirement here when it uses one.").
- **Grouped select:** a select may set its options in runs under `optgroup` labels, in the order given (squads under their value streams).
- **System select:** the draft's systems by name; a name the document used that the draft lacks stays choosable as "Name (not in the draft yet)"; "No system named" where none is allowed.
- **Repeating rows:** a ruled fieldset per group (Order types, Parts, Steps, Branches, Hand-overs), each row with its own "Remove …" text button (14px cross) and one "Add a <one>" or "Add another <one>" (14px plus) at the foot; "None yet." when empty.
- **Actions:** "Accept as edited" (action button) beside "Stop editing", with the reason it waits ("Every step needs a number and a name."). Escape anywhere in the open suggestion stops editing.
- **Focus:** opening the editor puts focus on its "Edit, then accept" title (focusable by script only), so the next Tab enters its fields; stopping returns focus to the button that opened it.
- **System editor:** Name, Arabic name (right to left) and Sits in on the form grid ("Not placed in the landscape" first); Also called (one per line) and What it is; What it does as repeating rows (Capability, Business area, Delivered by the component, Matched by, one phrase per line); Components as repeating rows (Component, Arabic name, Built with, Also called, What it does); Constraints one per line. The galley and the edit panel share the same editors.

### Edit Panel
A hand edit opens in place where the thing is read, never in a modal or a card: a stock-band block closing on a heavy rule (see Shapes), its fields on the stock.
- **Title:** a lead-size bold h3 naming the act ("Edit CWOM", "Add a system", "Add a dependency of CWOM", "Edit where systems sit", "Edit the samples").
- **Body:** the editor's fields on the form grid; a removal's consequence as a lead at 62ch instead ("Its 3 connections go with it. Requirement work keeps mapping to it until the draft is published.").
- **Actions:** the action button worded as what it does ("Save the system", "Add the dependency", "Remove it from the draft"; "Saving…" while busy) beside a "Cancel" text button. Under them, the ink-2 meta waits line linked by `aria-describedby`, naming what to do first ("Choose the system it depends on.", "It is named by the offering <name>; edit those first.", "<domain> still holds systems; move them first.").
- **Failure:** the red failure line with `role="alert"` above the actions. A conflict (409) says what happened and what to do: "The draft changed while you edited (someone else, or a document's reading). Reload the page; your edit was not saved." Each catalogue words its own conflict; the squad catalogue's reads "The squad catalogue changed while you edited (someone else saved first). Reload the page; your edit was not saved."
- **Foot:** the actions and the waits line rest on the foot of the view while a long panel scrolls (an offering's parts or order tracking run several screens): on the band, above a heavy rule, at every width.
- **Keys:** Escape cancels. Submitting does nothing while the action waits. A panel that replaces the button that opened it (an offering's section, adding an offering, removing it) takes focus on its title when it opens, and closing it gives focus back to that button.
- **Removal:** the same panel with no fields: the title "Remove <name>" (or "Remove the dependency of A on B"), the consequence lead where there is one, and the action "Remove it from the draft" ("Remove it" for one dependency). A removed system or offering leaves its sheet for its index; a removed system's index says so in a status notice.

### Where Edits Are Offered
In the architecture catalogue, on a draft only; a published version shows no edit controls. The squad catalogue is kept current in place and offers its edits on every page. Each offer is a text button worded as its act, carrying `aria-expanded` where it toggles a panel.
- **A system sheet:** "Edit this system" and "Remove this system" in the head's action row. Depends on alone carries edits: "Add a dependency" under its table, and per-row "Change" and "Remove" under the For-what text, each naming the other system for screen readers. A dependency on this system is edited from the other system's sheet.
- **The systems index:** "Add a system" (14px plus) under the find field; a new system opens on its own sheet once saved.
- **Governance:** "Edit the sources" and "Edit the conflicts", each register edited whole in place of its table.
- **Domains:** each tree edited whole ("Edit where systems sit", "Edit the business areas"), the panel taking the table's place; each domain a repeating row of Name, Arabic name, Inside ("At the top" first) and What it covers.
- **Offerings:** "Add an offering" on the list asks only for what it is (name, facts, what it offers, who it is for, its promises); its sheet then takes each section on its own. On a sheet, "Edit what it is" and "Remove this offering" sit in the head's action row, and every other section offers its own edit in a `govsection__actions` row under its title: "Edit the order types", "Edit the parts", "Edit the non-functional requirements", "Edit the order tracking", "Edit the lifecycle notes", "Edit the open questions", "Edit the architecture decisions", "Edit the sources and boundaries", "Edit the rules". One section is edited at a time: its edit panel takes the section's place (the facts panel opens under the head), titled "Edit the order types of <offering>" and saving with "Save the order types", while the rest of the sheet stays readable and offers no edit until it closes; an ink-2 lead under the panel title says so ("The other sections can be edited once this one is saved or cancelled."). Lifecycle notes set their edit and "Open every note" in one actions row, the edit first. The panel takes focus on its title when it opens, and closing it, by saving or cancelling, gives focus back to the section's edit. The rest of the offering is sent unchanged with the section. An order type its parts, tracking, notes or journeys still name cannot be dropped or recoded: the waits line names the first ("The lifecycle note Cessation still names the order type ‘CEASE’, which the offering no longer has; change it there first.", "The journey X is for the order type ‘NEW’; edit that journey first."). A suggested offering is still reviewed and edited whole.
- **Journeys:** "Add a journey" on the list; "Edit this journey" and "Remove this journey" in a sheet's head, editing the whole item.

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
