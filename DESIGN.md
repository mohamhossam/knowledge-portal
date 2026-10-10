---
name: Knowledge portal
description: The requirement platform's curation desk in e& calm, a ruled ledger for reviewed, attributable knowledge.
colors:
  e-and-red: "#e00800"
  e-and-maroon: "#4b0f1e"
  e-and-grey: "#636363"
  e-and-beige: "#e6e6dc"
  page-white: "#ffffff"
  paper: "#fbfaf7"
  sand: "#f3f2ec"
  warm-ink: "#1f1b1a"
  warm-ink-2: "#4a4542"
  hairline: "#e4e2da"
  rule: "#cfccc1"
  rule-strong: "#8a8579"
  maroon-hover: "#6a1a2d"
  maroon-tint: "#f4eaec"
  rust: "#8c3a1f"
  rust-wash: "#f7eae3"
  ochre: "#7a5a00"
  ochre-wash: "#f6efd9"
  sage: "#2d6640"
  sage-wash: "#e6f0e8"
  slate-teal: "#2b5a6e"
  slate-teal-wash: "#e4eef1"
  charcoal: "#1c1917"
  charcoal-1: "#221e1c"
  charcoal-2: "#2a2623"
  charcoal-ink: "#ede8e1"
  dusk-maroon: "#7a2e3f"
  dusk-pink: "#e3b3bd"
  night-masthead: "#4a1b26"
  red-on-dark: "#ff4a3d"
typography:
  display:
    fontFamily: "Archivo Variable, Noto Sans Arabic Variable, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 680
    lineHeight: 1.25
    fontVariation: "'wdth' 92"
  headline:
    fontFamily: "Archivo Variable, Noto Sans Arabic Variable, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 680
    lineHeight: 1.25
    fontVariation: "'wdth' 92"
  title:
    fontFamily: "Archivo Variable, Noto Sans Arabic Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 680
    lineHeight: 1.25
    fontVariation: "'wdth' 92"
  body:
    fontFamily: "Archivo Variable, Noto Sans Arabic Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  reading:
    fontFamily: "Archivo Variable, Noto Sans Arabic Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Archivo Variable, Noto Sans Arabic Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.45
    fontVariation: "'wdth' 87"
  numeral:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    fontFeature: "'tnum' 1, 'lnum' 1"
    fontVariation: "'wdth' 80"
  arabic:
    fontFamily: "Noto Sans Arabic Variable, Archivo Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  none: "0"
  control: "2px"
  overlay: "4px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.e-and-maroon}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.maroon-hover}"
  button-secondary:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  field:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
    height: "32px"
  masthead:
    backgroundColor: "{colors.e-and-maroon}"
    textColor: "{colors.page-white}"
    height: "48px"
  rail-item-current:
    backgroundColor: "{colors.maroon-tint}"
    textColor: "{colors.e-and-maroon}"
    height: "36px"
  suggested-mark:
    backgroundColor: "{colors.slate-teal-wash}"
    textColor: "{colors.slate-teal}"
    rounded: "{rounded.control}"
    padding: "0 8px"
  table-row-compact:
    height: "32px"
    padding: "4px 8px"
  table-row-comfortable:
    height: "44px"
    padding: "8px 12px"
---

# Design System: Knowledge portal

## Overview

**Creative North Star: "The Calm Ledger"**

The portal is a ledger kept by careful people. Every area is a ruled table of decisions, read in
long, quiet sessions and checked in short ones. The page is white paper with warm ink. A heavy
2px rule runs under every table head, section head and consequence panel, and that rule is the
signature. A maroon masthead binds the book: e&'s structural colour, used for the binding, for
actions and for selection, and nowhere else. e& red is a seal, not a signal. It appears on the
logo and on the active area's marker, and never to tell anyone that something is wrong.

Density serves review bursts. On a review desk, rows are 32px with hairline dividers, numbers are
condensed and tabular, and the detail sits in a full-height pane beside the list. Check-in pages
breathe at 44px rows. The surface is flat: depth exists only for things that float (drawers,
listboxes, the one dialog). States speak in rust, ochre, sage and slate-teal, always with an icon
and a word. Arabic and English sit side by side, each in its own direction, without either being
mangled.

This is direction A ("Timetable, evolved") of the 2026-10-08 redesign. Its split-pane review desk
comes from direction C. The previous "Timetable Book" world is archived in
`docs/design-history/timetable-book-DESIGN.md`. Screens built before the redesign keep that look
until their area migrates.

**Key Characteristics:**

- White page, warm near-black ink, beige-derived tints for bands, never cream.
- The 2px ledger rule under every head; hairlines between rows.
- Maroon carries action, selection, focus and the masthead (≈ 7% of a view). Red is ≤ 0.2%: the
  logo and the active marker.
- States are their own low-saturation hues, always with an icon and words.
- Archivo's width axis condenses titles (92%), labels (87%) and numerals (80%). Noto Sans Arabic
  carries Arabic.
- Flat, with one overlay elevation. Motion is opacity and transform only, at 200 ms or less.

## Colors

A white ledger with warm ink, bound in maroon, sealed in red, with four quiet state hues.

### Primary

- **e& Maroon** (#4b0f1e): the binding. It is used for:
  - the masthead;
  - the primary button's fill;
  - the focus ring;
  - the selected row's bar and text;
  - the current tab's underline;
  - the pressed filter's border.

  Its hover is **Deep Claret** (#6a1a2d), which is also the link colour. Selection washes in
  **Maroon Mist** (#f4eaec).
- **e& Red** (#e00800): the seal. It is used for the logo tile and the 3px marker on the active
  area in the rail. Nothing else.

### Secondary

These are the state hues. Each is low saturation and distinct from both red and maroon, and each
is paired with an icon and a word.

- **Rust** (#8c3a1f, wash #f7eae3): needs attention, failure, blocks approval, danger actions.
- **Ochre** (#7a5a00, wash #f6efd9): held, overdue, out of date.
- **Sage** (#2d6640, wash #e6f0e8): done, in service.
- **Slate Teal** (#2b5a6e, wash #e4eef1): working, and the **Suggested** mark on anything a
  model proposed. It is the one cool hue, so AI provenance stands apart.

### Neutral

- **Page White** (#ffffff): the page and every working surface.
- **Paper** (#fbfaf7) and **Sand** (#f3f2ec): panes, consequence panels, state lines and bands.
- **e& Beige** (#e6e6dc): the proof tint (a catalogue version not in service) and the evidence
  highlight.
- **Warm Ink** (#1f1b1a): body text and the ledger rule.
- **Warm Ink 2** (#4a4542): secondary text, column heads.
- **e& Grey** (#636363): tertiary text, only on white or sand-or-lighter (6.0:1 on white).
- **Hairline** (#e4e2da), **Rule** (#cfccc1), **Strong Rule** (#8a8579): row dividers,
  section frames, control borders (≥ 3:1).

### Dark (warm charcoal)

- **Surfaces:** Charcoal (#1c1917), stepping to #221e1c and #2a2623.
- **Ink:** #ede8e1.
- **Actions:** Dusk Maroon fill (#7a2e3f) with a Dusk Pink (#e3b3bd) border, focus and links.
- **Masthead:** Night Maroon (#4a1b26), so the red seal (#ff4a3d) still reaches 4.27:1.
- **State hues:** lifted to their light washes on dark grounds.

### Named Rules

**The Seal Rule.** Red marks the brand and where you are: the logo, the active area, and at most
one focal accent in a view. It never marks failure, overdue, removal, a count, or a destructive
button. If red is telling someone something is wrong, it is the wrong colour.

**The Binding Rule.** Maroon is structure and intent: the masthead, the one primary action, what
is selected and where focus is. It is never decoration or a background flood.

**The Word-and-Icon Rule.** No state is colour alone. Every status is an icon plus its word, and
severe states are never lighter than routine ones.

## Typography

**Display, body and label:** Archivo Variable (self-hosted, OFL), using its width axis.
**Arabic:** Noto Sans Arabic Variable (self-hosted, OFL).
**Codes:** the platform monospace, for identifiers only.

**Character:** one grotesk in several widths, quietly engineered: condensed where it carries
tables and numbers, full width where it carries prose. Arabic gets its own face and more air,
never squeezed into Latin metrics.

### Hierarchy

- **Display** (680, 2rem, 1.25): the gallery and rare overview figures only.
- **Headline** (680, 1.625rem, 1.25, 92% width): the page's h1.
- **Title** (680, 1.25rem, 1.25, 92% width): section heads under the ledger rule.
- **Body** (400, 0.9375rem, 1.45): the UI.
- **Reading** (400, 1rem, 1.65, ≤ 70ch): passages, evidence and long descriptions.
- **Label** (600, 0.875rem, 87% width): column heads, field labels.
- **Numeral** (500, 0.875rem, 80% width, tabular): counts, dates and figures in tables.
- **Arabic** (400, 1rem, 1.75): any RTL content.

### Named Rules

**The 14px Floor Rule.** No text is smaller than 14px (0.875rem): not a badge, not a key cap,
not a hint.

**The Condensed Numbers Rule.** Numbers in tables are condensed (80% width), tabular and aligned
to the end. Weight never shouts a date.

## Layout

- **The frame:**
  - a sticky 48px masthead;
  - a 13rem rail of five areas, with Explorer apart;
  - the page, capped at 90rem with a fluid gutter (16–40px).
- **Below 1024px:** the rail folds into a wrapping row and drawers become full-height overlays.
- **Phone width:** the Explorer reader works at 390px. Admin screens are desktop-first.
- **Review desk:** the list beside a sticky, full-height detail pane (clamp 22–34rem) from
  1200px. Below that, the pane stacks after the list.
- **Spacing:** a 4px grid (4, 8, 12, 16, 20, 24, 32, 48), with 24px between sections.
- **Density:** comfortable (44px rows, 15px text) or compact (32px rows, 14px text), set per
  person. Automatic is compact on review desks.
- **Sticky regions:** each sticky region (masthead, state line, bulk or save bar) publishes its
  measured height. Scroll padding uses those heights, so a focused row is never hidden.

## Elevation & Depth

Flat by default. Depth comes from rules and tints:

- the ledger rule;
- hairlines;
- Paper and Sand bands;
- the maroon-mist selection.

One shadow exists, for things that genuinely float above the page: drawers, the combobox listbox,
the toggletip, the dialog, and the undo toast.

### Shadow Vocabulary

- **Overlay** (`box-shadow: 0 6px 24px rgb(31 27 26 / 0.12)`; dark `rgb(0 0 0 / 0.45)`):
  floating panels only.

### Named Rules

**The Flat Ledger Rule.** Nothing on the page is raised. Panels, cards and rows separate by rules
and tints, never by shadow.

## Shapes

- **Corners:** almost square. Controls are 2px, overlays 4px, and counts are pills.
- **Frames:** 1px. There is never a thick coloured side border on a panel or callout.
- **Ledger rule:** the one heavy line, 2px, horizontal, under heads and on top of panels.
- **Selection:** a 3px maroon inset bar on the current row.
- **Location:** a 3px red inset bar on the current area.

## Components

### Buttons

- **Shape:** near-square (2px), 32px tall, 24px minimum target.
- **Primary:** maroon fill with white text, for the page's one main action. Its hover is Deep
  Claret.
- **Secondary:** white with a Strong Rule border that turns maroon on hover.
- **Danger:** rust with an icon, the verb and its object ("Withdraw 'XGPON coverage rules'").
- **Quiet and link:** for low-weight actions.
- **Unavailable:** an outline with its reason written beside it; it stays focusable. Never a
  faded fill.
- **Focus:** a 2px maroon ring, offset 2px, with a 4px page-colour halo. White inside the
  masthead.

### Status and Suggested

- **Status:** an icon and a word in the state hue. Needs attention and Held are also set
  semibold.
- **Suggested:** slate teal on its wash, with a lightbulb glyph and "Suggested · stated / inferred,
  not stated in the source". It never uses sparkles or gradients.

### Inputs / Fields

- **Style:** white field, 1px Strong Rule border, 2px corners, 32px tall. Content inputs take
  their own direction.
- **Label and hint:** the label is always visible, with the hint under it.
- **Error:** shown only after an attempt, in rust beside the field, with a 2px border.
- **Combobox:** a floating listbox with the suggested option first and its reason.

### Navigation

- **Rail:** ink text, 36px items, and the current item on Maroon Mist with the red seal marker and
  a semibold label. Counts are neutral pills.
- **Sub-navigation and tabs:** ink on white, with the current item in maroon and a 2px maroon
  underline.

### The Ledger Table (signature)

- **Head:** a sticky head under the 2px ink rule, with condensed labels.
- **Rows:** hairline dividers, 32px or 44px.
- **Row header:** the row's name.
- **Cells:** bidi cells; end-aligned condensed numerals.
- **Selection:** 24px checkboxes.
- **Grid mode:** one tab stop, arrow and j/k navigation, Enter, Space, and Shift-extend.

### Consequence Panel (signature)

- **Placement:** in place, never a modal.
- **Shape:** Paper surface, the ledger rule on top, a 1px frame.
- **Order:** what happens, who it affects, reversibility, reason, then the verb and the safe
  default.
- **Danger tone:** rust title and icon.

### Split Review Desk

The list on white, with a Paper pane beside it behind a single strong rule, full height and
sticky, so the original and the decision sit together.

## Do's and Don'ts

### Do:

- **Do** keep red to the logo and the active area's marker (≤ 1 focal accent per view, ≤ 2% of
  the screen).
- **Do** use maroon for the one primary action, selection, focus and the masthead (about 8–10% of
  a view).
- **Do** pair every state with an icon and a word, in its own hue (rust, ochre, sage, slate
  teal).
- **Do** put the 2px ledger rule under every table head, section head and consequence panel.
- **Do** write numbers in tables condensed, tabular and end-aligned at weight 500.
- **Do** give Arabic its own face, direction and 1.75 leading. Isolate names inside sentences.
- **Do** read only semantic and component tokens in components. e& values live in
  `tokens/primitive.css`.
- **Do** keep every target at least 24px by its own size, and every text at least 14px.

### Don't:

- **Don't** use red for errors, overdue, removed rows, counts, alerts or destructive buttons.
- **Don't** use gradients, glass, glows, neon, or saturated full-bleed fills.
- **Don't** raise panels with shadows. Only floating overlays get the one elevation.
- **Don't** animate colour, or animate for longer than 200 ms. Nothing pulses or loops.
- **Don't** fade a disabled primary. Show the outline and say why.
- **Don't** put a thick coloured border on the side of a panel, card or callout.
- **Don't** mirror the English UI chrome for Arabic content.
