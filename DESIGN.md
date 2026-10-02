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
---

# Design System: Knowledge portal

## Overview

**Creative North Star: "The Timetable Book"**

The portal is set like a national railway timetable book. Each area of shared knowledge is a numbered table. Its number stands monumental and condensed in a left margin column. The table beside it has an exact column set, and each sourced fact carries a reference mark that leads to a numbered note at the table's foot. The page is near-white neutral stock with black ink. Hierarchy comes from three rule weights and from type weight, never from containers, fills or colour. Two colours are held back, and each has exactly one job.

The density is that of a reference work. Rows are tight (0.5rem block padding) and separated by hairlines. Numbers and dates use tabular, lining figures and sit right-aligned, as in any timetable. The surface is flat: no cards, no shadows for depth, no pills, no gradients. One sticky masthead strip and an index of the tables bind the book, and every screen sits inside that binding.

The interface language is English. Content keeps its own language and direction. Arabic names render in Noto Sans Arabic, in their own direction, beside the English in the same cell. The theme is light only. This is a decision for an office-daylight scene, not an omission.

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
- **Reference Blue** (`reference`): footnote marks, note numbers, the note return links, the next-decision line, body links, the focus ring, the caret. Wherever the reader can follow something to somewhere else.
- **Reference Wash** (`reference-wash`): the lit state of a row, mark or note when its partner is hovered or focused. Also text selection.

### Secondary
- **Disruption Red** (`disruption`): failure only. This means a delayed or failed status (for example "Extraction failed"), a table that could not be read, and a sign-in error.
- **Disruption Wash** (`disruption-wash`): reserved as the wash partner of disruption. It is defined in the tokens but not yet used on a shipped surface.

### Neutral
- **Table Stock** (`stock`): the page and the masthead background. It is a neutral near-white, never cream.
- **Stock Band** (`stock-band`): the scrollbar track. It is the only tonal step off the page.
- **Ink** (`ink`): text, the fill of the primary button, the current-index bar and the index extent rules.
- **Ink 2** (`ink-2`): secondary text. This covers column heads, edition lines, rows in service, notes, the quiet state and Arabic secondary lines.
- **Ink 3** (`ink-3`): rows in the past, disabled controls, the select border and the masthead dot.
- **Heavy Rule** (`rule-heavy`): the rule under the masthead and table heads, the totals label and the notice head, and the double rule above the notes.
- **Rule** (`rule`): the 1px rule between tables, under the index and above "in preparation" text. Also the resting underline of title links.
- **Faint Rule** (`rule-faint`): the hairlines between rows and between totals.

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
- **Title** (680, 1.625rem, line-height 1.1, width 88%): table titles and notice titles. Index entry titles use the same width and weight at body size.
- **Lead** (680, 1.0625rem): the next-decision line and the portal name in the masthead.
- **Body** (400, 0.9375rem, line-height 1.45, width 100%): rows, totals and edition lines. Edition lines are capped at 72ch, notice text at 62ch, note text at 80ch.
- **Label** (500, 0.8125rem, width 72%, letter-spacing 0.01em): column heads and totals labels in ink 2. They use sentence case, never uppercase.
- **Meta** (400 to 500, 0.8125rem): the notes, the masthead's "Valid as of" line, text buttons and the Arabic secondary name line.
- **Mark** (680, 0.6875rem): the superscript reference numeral, in blue.

### Named Rules
**The Weight Is Rank Rule.** A row's importance is set by weight and ink, never by colour or badge. A due row has its name and status in bold (680). A delayed row has its status in bold and in disruption red. A running row is set in ink 2, a row in service in regular ink, a past row in ink 3.

**The One Family Rule.** Contrast comes from Archivo's width and weight axes, not from a second display face. Noto Sans Arabic is a script fallback, not a design voice.

## Layout

The page is a single column up to 78rem wide, with fluid gutters (clamp(1rem, 0.5rem + 2vw, 2.5rem)). Each numbered table is a two-column grid: a 7.5rem margin column holds the right-aligned table number, then a 1.5rem gap, then the table head and body. A table has 3rem of padding above and 2rem below, and a 1px rule separates it from the next. Text blocks that sit beside a table (the "in preparation" note, the missing-page text) indent by the margin column plus its gap, so they align with the table body.

The spacing scale has eight steps: 0.25, 0.5, 0.75, 1, 1.5, 2, 3 and 4.5rem. Inside a table, the grid sits 1rem below the head, the totals and notes sit 1.5rem below the rows, and the next-decision line sits 1.5rem below the notes. Totals are capped at 34rem wide.

The masthead is sticky (z-index 5) above 45rem and static below it. The index of tables is a three-column grid that becomes one column at 45rem. The anchor scroll padding (5rem) keeps a jumped-to note clear of the masthead.

Columns drop by priority, so the table never scrolls sideways. Priority 3 columns hide below 60rem and priority 2 columns below 45rem. At 45rem and below, the margin column collapses and the number stacks above the title.

## Elevation & Depth

The surface is flat. Depth is not used. Rules separate the parts: a 2px heavy rule, a 1px hairline and a 3px double rule. Lit states are a background wash, never a lift. The only `box-shadow` in the build is an inset 3px ink bar under the current index entry (`inset 0 -3px 0 ink`). It works as a rule, not as a shadow.

### Named Rules
**The Three Rules Rule.** Separation uses three weights only. A 2px heavy rule sits under the masthead and every table head, totals label and notice head. A 1px hairline sits between rows, totals and tables. A 3px double rule sits above the notes. Do not add a fourth weight or a box.

## Shapes

The form is rectilinear. Rules run full width with square ends, and there are no cards or bordered panels. The only radius is 2px, on the two framed controls (the primary notice button and the persona select). The index extent rule is a 3px ink bar on a fixed 7rem track. Its length is the table's share of the largest table, with a 3% minimum.

## Components

### Buttons
- **Primary (notice action):** solid ink with stock text, a 2px ink border, a 2px radius, a 2.5rem minimum height, 1rem horizontal padding and bold (680) text. **Hover** swaps to stock with ink text. It appears only on notice screens (sign-in, no access).
- **Text button:** a control that reads as a word in the line. It has no border or fill, ink meta text in medium weight, a 1px underline offset 0.2em, a 1.5rem minimum height for the target, and an optional 14px icon before its label. **Hover** thickens the underline to 2px. **Disabled** is set in ink 3 with no underline. The refresh icon spins at 900ms linear while busy.
- **Focus:** every focusable element shows a 2px solid reference-blue outline offset by 2px.

### Inputs / Fields
- **Persona select:** a 1px ink-3 border, a 2px radius, a stock background with an inline chevron, meta text and a 1.75rem minimum height. **Hover** darkens the border to ink.

### Navigation
- **Masthead:** a strip with "Requirement AI · Knowledge portal" set at 72% width. The portal name is in bold lead, the parent product in ink 2. Next come "Valid as of" with a medium-weight time and a refresh text button, then the account at the right. A 2px heavy rule sits underneath.
- **Index of tables:** three entries. Each has a monumental condensed number, a title at 88% width and bold weight, and a meta extent line with its count and a proportional rule. **Hover** underlines the title. **Current** adds the inset 3px ink bar. Each entry announces "Table N:" to screen readers.

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

### Notices
Sign-in, no-access and still-opening screens use a 40rem column. Each has a portal line above a heavy rule, a title in the title style, body text capped at 62ch, and actions made of primary buttons and text buttons. Errors are set in red, medium weight.

## Do's and Don'ts

### Do:
- **Do** put every area in a numbered table: a monumental number in the 7.5rem margin column, a title, an edition line, a ruled grid, notes and one next-decision line.
- **Do** show a row's rank by weight and ink: bold for due, red and bold status for delayed, ink 2 for running, ink 3 for past.
- **Do** give every sourced fact a reference mark, and number the notes in reading order.
- **Do** keep lit states to a background wash (`reference-wash`), so rows and cells never reflow or change size.
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
