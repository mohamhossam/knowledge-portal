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
---

# Design System: Knowledge portal

## Overview

**Creative North Star: "The Timetable Book"**

The portal is set like a national railway timetable book. Each area of shared knowledge is a numbered table. Its number stands monumental and condensed in a left margin column. The table beside it has an exact column set, and each sourced fact carries a reference mark that leads to a numbered note at the table's foot. The page is near-white neutral stock with black ink. Hierarchy comes from three rule weights and from type weight, never from containers, fills or colour. Two colours are held back, and each has exactly one job.

The density is that of a reference work. Rows are tight (0.5rem block padding) and separated by hairlines. Numbers and dates use tabular, lining figures and sit right-aligned, as in any timetable. The surface is flat: no cards, no shadows for depth, no pills, no gradients. One sticky masthead strip and an index of the tables bind the book, and every screen sits inside that binding.

The architecture catalogue (Table 2) reads like the station pages of the same book: an index of systems held beside one system's sheet, each sheet a run of governance sections, each connection a sentence, each journey a timetable of numbered steps grouped by phase.

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
- **Reference Blue** (`reference`): footnote marks, note numbers, the note return links, the next-decision line, body links (including the toolbar's search link), the focus ring, the caret, and the "e" edit mark on an edited passage. Wherever the reader can follow something to somewhere else.
- **Reference Wash** (`reference-wash`): the lit state of a row, mark or note when its partner is hovered or focused. Also text selection, and the way back on a system sheet: the connection row for the system the reader came from.

### Secondary
- **Disruption Red** (`disruption`): failure only. This means a delayed or failed status (for example "Extraction failed"), a table that could not be read, a sign-in error, a failed processing line, a failed action, and anything blocking: the blocking count in the change notice, a blocking warning on a passage, a blocking file warning.
- **Disruption Wash** (`disruption-wash`): reserved as the wash partner of disruption. It is defined in the tokens but not yet used on a shipped surface.

### Neutral
- **Table Stock** (`stock`): the page and the masthead background. It is a neutral near-white, never cream.
- **Stock Band** (`stock-band`): the only tonal step off the page. It is the scrollbar track, the background of a hovered passage row, the background of the focused/open passage row together with its detail row (the row opens in place on this band, never in a card), the fill of a disabled action button, the surrounding-text block under a search result (padded on the band, never ruled or boxed), and an open catalogue version's row together with its detail row.
- **Ink** (`ink`): text, the working text in a passage row, the fill of the primary and action buttons, the current-index bar, the pressed-filter bar, the current sub-index link and its bar, the current systems index entry and its bar, the catalogue's bold "still mapped with an earlier version" line, the index extent rules, the checkbox accent and the field border on hover.
- **Ink 2** (`ink-2`): secondary text. This covers column heads, edition lines, rows in service, notes, the quiet state, Arabic secondary lines, field labels, the comparison (in service or as extracted) column of the passage table, unpressed filters, the keys line, the save bar's state and reason lines, unselected sub-index links, governance section leads, the secondary lines in a governance table, the text of a search result's surrounding-text block, the systems index's group heads, count and "which name matched" lines, a sheet's fact labels, Arabic line and meta line, the connection phrases, journey phase heads, the count after a section title, the "Its catalogue file:" label and the put-back panel's waits line.
- **Ink 3** (`ink-3`): rows in the past, disabled controls (including the disabled action button's text), the select and field borders, the masthead dot, excluded or removed passages, replaced catalogue versions, an order type no longer offered, and the "Not placed" row of a domain tree.
- **Heavy Rule** (`rule-heavy`): the rule under the masthead and table heads, the totals label and the notice head, and the double rule above the notes. Also the change notice's heading, the top and bottom of the processing line and the withdraw panel, the foot of an open passage's detail row, the top of the save bar, and the line under a governance section title and a governance table's column heads. In the catalogue: under each group head of the systems index, above a sheet's facts list, at the foot of an open version's detail row, and above and below the put-back panel.
- **Rule** (`rule`): the 1px rule between tables, under the index and above "in preparation" text and the "Add a document" section. Also the resting underline of title links, the border of a disabled action button, the outline of `kbd` key caps, the frame of a source preview image, the line under a document's or the catalogue's sub-index, and the line under a journey's phase head.
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
- **Title** (680, 1.625rem, line-height 1.1, width 88%): table titles and notice titles. Index entry titles use the same width and weight at body size. A catalogue sheet's title (a system, an offering, a journey) takes the title style without a margin number.
- **Lead** (680, 1.0625rem): the next-decision line, the portal name in the masthead, the titles of the "Add a document" section and the withdraw panel, and governance section titles (bold, on a heavy rule).
- **Body** (400, 0.9375rem, line-height 1.45, width 100%): rows, totals and edition lines. Edition lines are capped at 72ch, notice text at 62ch, note text at 80ch, governance leads at 72ch and a search result's passage at 64ch. Sub-index links take body size in medium weight (bold when current).
- **Label** (500, 0.8125rem, width 72%, letter-spacing 0.01em): column heads, totals labels, field labels, the change notice heading the passage detail labels ("Edited from", "As extracted"), the governance table's column heads, the legend of a choices group, the systems index's group heads, a sheet's fact labels and a journey's phase heads, in ink 2. They use sentence case, never uppercase.
- **Meta** (400 to 500, 0.8125rem): the notes, the masthead's "Valid as of" line, text buttons, the Arabic secondary name line, the passage table's "Where" column, exclusion reasons and flags, the keys line, the save bar's state and reason lines, the secondary lines in a governance table, a search result's surrounding text, sub-index links on phones, the catalogue's consequence and mapped-earlier lines, the systems index count and its "which name matched" lines, a sheet's meta line, and the connection phrases. Key caps inside the keys line step down to 0.75rem, medium weight.
- **Mark** (680, 0.6875rem): the superscript reference numeral, in blue.

### Named Rules
**The Weight Is Rank Rule.** A row's importance is set by weight and ink, never by colour or badge. A due row has its name and status in bold (680). A delayed row has its status in bold and in disruption red. A running row is set in ink 2, a row in service in regular ink, a past row in ink 3. Catalogue versions follow it: in preparation is due (bold), in service is regular ink, replaced is past.

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

At 45rem and below the catalogue goes to one column: the index loses its own scroll and sits in flow, and a chosen sheet replaces it ("All systems and connections" returns to it). All connections folds To into the From cell as one sentence line. Versions drops its State and disclosure columns and carries both inside the version cell. A sheet's facts stack label over value.

The save bar is sticky to the bottom of the viewport (z-index 4, under the masthead's 5) above 45rem and static on phones. While it is present, the page carries 9rem of `scroll-padding-bottom`, so a passage moved to from the keyboard is never hidden under it.

## Elevation & Depth

The surface is flat. Depth is not used. Rules separate the parts: a 2px heavy rule, a 1px hairline and a 3px double rule. Lit states are a background wash, never a lift; an open passage sits on the stock band, not on a raised card. The only `box-shadow` in the build is an inset 3px ink bar (`inset 0 -3px 0 ink`), under the current index entry, the pressed filter, the current sub-index link and the current systems index entry. It works as a rule, not as a shadow. The sticky save bar is separated from the rows by its heavy rule and its stock background, not by a shadow.

### Named Rules
**The Three Rules Rule.** Separation uses three weights only. A 2px heavy rule sits under the masthead and every table head, totals label, notice head and governance section title. A 1px hairline sits between rows, totals and tables. A 3px double rule sits above the notes. Do not add a fourth weight or a box.

## Shapes

The form is rectilinear. Rules run full width with square ends, and there are no cards or bordered panels. The only radius is 2px, on framed controls: the primary and action buttons, the persona select, field inputs, the file-selector button, and `kbd` key caps. Panels such as the processing line and the withdraw panel are ruled top and bottom, never boxed. Governance sections open on a heavy rule under their title and are never boxed; a choices group is a fieldset with its border and padding removed. The one filled block is a search result's surrounding text: a square stock-band fill with 0.5rem by 0.75rem padding and no rule. A sheet's facts list is a definition list opened by a heavy rule, each fact on a hairline, running the full sheet column. An open version's detail is a square stock-band row closed by a heavy rule. The index extent rule is a 3px ink bar on a fixed 7rem track. Its length is the table's share of the largest table, with a 3% minimum.

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
- **Document sub-index:** a labelled `nav` ("This document") under a document's head: Review · Search versions · Who cites it · Ownership. Each link is a 2.25rem-tall target in medium ink 2 with no underline; **hover** turns it to ink; **current** (`aria-current="page"`) sets it in bold ink with the inset 3px ink bar, above a 1px rule under the whole strip. While the working copy has unsaved changes, Review carries "· N unsaved" in regular weight. On phones the gap tightens to 0.75rem and the links drop to meta size; that override follows the base rule in the cascade. The catalogue uses the same strip, labelled "This catalogue": Systems · Domains · Offerings · Journeys · Versions, the last reading "All versions" while another version is being read.

### Numbered Table (signature)
The portal's only container. Every area screen is built from it.
- **Head:** the monumental number in the margin column, then the title (a link where the full table lives, with a rule-coloured underline that turns to ink on hover), then an ink-2 edition line saying which published state the table runs from.
- **Grid:** a real `<table>` with a visually hidden caption. The first cell of each row is a row header. Column heads are set in the label style above a 2px heavy rule. Rows sit on hairlines with baseline alignment. Numbers and dates use end alignment. A "more" row closes long tables with one ink-2 line ("and 20 more ...").
- **Rank states:** see the Weight Is Rank Rule. Each row's state is set by its rank class. A lit row only takes the reference wash, with an 180ms background transition.
- **Mixed language:** a name cell sets its primary name with `dir="auto"`. The Arabic name sits on a second meta line with `lang="ar" dir="rtl"`, set in ink 2.
- **Totals:** a 34rem-wide definition list under a label with a heavy rule. Each total sits on a hairline, with its value in medium weight and end-aligned.
- **Quiet and failure:** when no row needs anyone, one ink-2 line sits under a heavy rule. If the table could not be read, the line is red, medium-weight text with role="alert", followed by a "Try again" text button.
- **Next decision:** the single action line at the table's foot. It is a blue, bold, lead-size link followed by a 16px arrow. When there is nothing to do, it becomes plain ink-2 text in regular weight.

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
The document page's head set for Table 2: the monumental 2, the title "Architecture catalogue", then an ink-2 edition line that says the version's state first and names it in bold: "In service: 'Name', published by X on date. N systems, N connections."; "Replaced: 'Name', published …; no longer in service."; or "In preparation: 'Name', started by X; not yet published.", the last two followed by a "Read the version in service" link. Under it, a meta line capped at 80ch: on the version in service, a bold ink line only when work is still mapped with an earlier version ("3 requirements still mapped with an earlier version."); on any other version, the consequence ("Publishing it would …" or "Putting it back in service would …", else "Its contents match the version in service."). The platform's own seed actor is named "the platform", never an id.

### Systems Index
A labelled `nav` on its own sticky track (see Layout). A find field ("Find a system", placeholder "Name, alias or phrase") over an ink-2 meta count that answers the find ("2 systems known by 'order'", or "No system is known by 'x'."), announced politely. Systems group under label-style heads on a 2px heavy rule, each head the place path joined by " › ", with "Not placed in the landscape" for the rest. Each entry is a 2rem-tall body link on a hairline, in ink with no underline until hover. While finding, an ink-2 meta line under the name says which name matched (an alias or a phrase). **Current** (`aria-current="page"`) is bold with the inset 3px ink bar.

### System Sheet
- **Head:** a meta trail line (a "Back to X" text button with a 14px left arrow when the sheet was reached by following a connection, then the "All systems and connections" link); the title, focused on arrival from inside the portal; the Arabic name on its own ink-2 line, set right-to-left but aligned under the name; the facts list (Also called, Sits in); the description at 72ch.
- **Sections:** governance sections with h3 titles: What it does (capabilities and the phrases that match them), Depends on and Used by side by side with counts, Owned by, Offerings and journeys, Components, Constraints.
- **Connections:** each row names the other system as a link, with an ink-2 meta phrase that names the sheet's own system ("Gets data from CWOM", "Orchestrates CWOM"); "For what" carries the description. The row for the system the reader came from is lit in the reference wash and announced "(where you came from)".
- **Journey and offering sheets** reuse the head and trail ("All journeys", "All offerings"), with an ink-2 meta line where a system has its Arabic line.

**The Connection Sentence Rule.** A connection reads as a sentence that names both systems. On a sheet the phrase names the sheet's system; in All connections the verb rides under From ("calls the API of", "sends events to"). Never an arrow, a bare kind code or an unnamed "this system".

### All Connections
The Systems page with no system chosen: a governance section with a count lead, then a governance table From (30%) · To (30%) · For what, with the verb as an ink-2 line under From. On phones the To column drops and From carries "verb To" as one secondary line.

### Domain Trees
Two governance tables (Where systems sit; What systems do, by business area). Depth is indent only: outermost domains bold, the second level indented 1rem, deeper levels 2rem. Arabic names and descriptions ride as secondary lines. Systems not placed close the landscape tree in one "Not placed" row, set past (ink 3).

### Journey Timetable
A journey sheet's Steps table: No. (3.5rem, end-aligned) · Step (medium-weight name) · Performed by. Steps group in runs under phase heads in the label style on a 1px rule; a phase that returns after another reads "Back to <phase>". Secondary lines carry "Seen by the customer", the description, supporting systems ("with …") and the mode. "Then …" appears only when a step does not simply continue to the step below ("Then 30 if Covered; 80 if Not covered", "Then rejoins at 40"). Hand-overs follow as a governance table.

### Offerings
A governance table of offerings (code · family · version · lifecycle as a secondary line; Parts and Journeys counts end-aligned). An offering sheet: meta line, proposition, facts (For, Promises), Order types (one not offered is set past), Parts and who is responsible (each role in sentence case naming its system), then Rules and Journeys as hairline lists.

### Versions
A governance table, newest first with the draft on top, ranked by the Weight Is Rank Rule. The version cell holds the name as a link and a contents line (systems · connections · offerings · journeys); the state cell holds the state word, then who, when and the revision as a secondary line. A text-button disclosure with a 14px chevron ("History and files"; "History, files, put back" on a replaced version) opens a detail row in place: row and detail on the stock band, the detail closing on a heavy rule. Inside: "Its catalogue file:" with Excel, YAML and JSON download text buttons; "What happened to it" as a titled history table (When · What, a rationale quoted on a secondary line); and, on a replaced version, the put-back panel. That panel is the withdraw panel's form: the consequence first, a "Why it goes back" reason field, the action button beside a "Keep the version in service" text button that closes it, and an ink-2 meta line saying why it waits, linked by `aria-describedby`. On phones the state and the disclosure ride in the version cell.

### Change Notice
Counts first, like a timetable's list of changes. A heading in the label style over a heavy rule, then a wrapping row of counts closed by a hairline. Each count is a label beside a fixed 4ch end-aligned bold value, so a count growing never moves its neighbours. The blocking count is red, label and value. At 45rem and below the counts stack as a totals list, one hairline per count. An ink-2 meta total line follows.

### Processing Line
The working copy's state on one line, ruled above and below with heavy rules and 0.75rem of block padding. The status is bold ink, red when processing failed (and announced as an alert); text-button actions and an ink-2 meta aside share the line.

### Withdraw Panel
An inline, deliberate step under the document head, never a modal: a 62ch column ruled above and below with heavy rules, a lead title, the consequence in body text, a reason field, and an action button ("Withdraw it") beside a text button to keep it, disabled until a reason is given.

### Save Bar
The review's foot, kept in view. A heavy rule on top over the stock background, 0.75rem block padding. A full-width ink-2 meta state line (the unsaved count in bold ink, or "All changes saved" with the revision), then the inline review summary field, "Save review" and the secondary "Approve and publish", then a full-width ink-2 meta line giving the reason an action waits, linked to the button by `aria-describedby`.

### Notices
Sign-in, no-access and still-opening screens use a 40rem column. Each has a portal line above a heavy rule, a title in the title style, body text capped at 62ch, and actions made of primary buttons and text buttons. Errors are set in red, medium weight.

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
