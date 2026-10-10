# 02 · Visual directions (Phase 4)

| | |
|---|---|
| Phase | 4: Visual direction. Waiting at **GATE 4** (choose A, B, C or a mix) |
| Date | 2026-10-08 |
| Led by | ui-ux-pro-max (directions, fonts, chart guidance). Judged by an Impeccable critique: dual-agent, with 3 isolated design reviews (one per direction) and 1 detector + browser run. |
| Structure | **Fixed.** Every direction is laid over the *same* Phase 3 wireframes, on the same seeded data, so differences are purely visual. That structure is still HYPOTHESIS: GATES 2b and 3 ran in assumption mode. |
| Where to see it live | `http://localhost:5184/knowledge/design-lab/wireframes/` and its lab bar: **Direction** (Wireframe · A · B · C) and **Theme** (Light · Dark). `?direction=a&theme=dark` in the address opens a direction for one tab, so two tabs can be compared side by side. |
| Captures | `docs/redesign/directions/<dir>-<screen>-<theme>@<width>.jpg`: 3 directions × 4 screens × 2 themes × 2 widths = 48. The screens are the review desk (1), suggestion review (2), compare + mapping impact (3) and the mixed Arabic/English table (4). |

## 1. What all three share (fixed by the brief)

### Brand primitives

These are the redesign brief's e& values. They are **unverified against official guidelines**, because none are available (GATE 0).

| Primitive | Value | On white |
|---|---|---|
| `--eand-red` | `#E00800` | 5.00:1 |
| `--eand-maroon` | `#4B0F1E` | 15.15:1 |
| `--eand-grey` | `#636363` | 6.01:1 |
| `--eand-beige` | `#E6E6DC` | 1.26:1 |
| `--eand-white` | `#FFFFFF` | — |

Red on beige is 3.98:1, so it is never used for text. Grey on beige is 4.78:1.

### Semantic tokens (light / dark)

Components read only these. The e& values appear only in the primitive block of
`frontend/src/design-lab/wireframes/directions.css`.

| Token | Light | Dark (warm charcoal) | Role |
|---|---|---|---|
| surface / -1 / -2 / -3 | `#FFFFFF` / `#FBFAF7` / `#F3F2EC` / `#E6E6DC` (beige) | `#1C1917` / `#221E1C` / `#2A2623` / `#35302C` | Page, panes, bands, the proof tint |
| ink / -2 / -3 | `#1F1B1A` / `#4A4542` / `#636363` (e& grey) | `#EDE8E1` / `#C8C1B7` / `#A29B91` | Body, secondary, tertiary (ink-3 only on white or ≥ `#F3F2EC`) |
| rule-soft / rule / rule-strong | `#E4E2DA` / `#CFCCC1` / `#8A8579` | `#36312D` / `#4A443F` / `#857D74` | Hairlines, dividers, control boundaries (≥ 3:1) |
| action (text, links, borders) | `#4B0F1E` (maroon) | `#E3B3BD` | Links, selected text, the primary's border |
| action-fill / on-action-fill | `#4B0F1E` / `#FFFFFF` | `#7A2E3F` / `#F7EEF0` | Primary button fill. Dark uses a deep maroon, not the pastel pink (critique) |
| selected / on-selected | `#F4EAEC` / `#4B0F1E` | `#3A2329` / `#F2D3D9` | Selected row, pressed filter |
| focus | `#4B0F1E` | `#E3B3BD` | 2px ring, 2px offset, 4px surface halo |
| brand-accent | `#E00800` | `#FF4A3D` | Logo and the active-nav marker only |
| danger / bg | `#8C3A1F` / `#F7EAE3` | `#E8A58C` / `#3A2620` | Rust: distinct from brand red and from maroon. Always with an icon |
| warning / bg | `#7A5A00` / `#F6EFD9` | `#E2C27A` / `#33291A` | Ochre |
| success / bg | `#2D6640` / `#E6F0E8` | `#9CCBA9` / `#1F2E24` | Muted green. Not used for consequences such as mapping impact |
| info / bg | `#2B5A6E` / `#E4EEF1` | `#9CC4D4` / `#1D2B31` | Slate teal. Also the **Suggested** (AI) marker, the one cool hue |
| highlight | `#E6E6DC` | `#4A443F` | The quoted evidence line |

### Rules every direction keeps

- **Red:** at most the logo plus the active-nav marker, plus at most one focal accent per view. Red is never used for status, errors, diffs or counts.
- **Status:** always an icon plus words, never colour alone.
- **Motion:** none on colour. Opacity and transform only, at 200 ms or less, and instant under reduced motion.
- **Surfaces:** flat. There are no gradients and no glass. The one elevation is used on overlays only: the drawers and the listbox.
- **Type:** 14 px minimum.
- **Targets:** at least 24 px by their own size.
- **Arabic:** gets line-height 1.7, a 1.05 em size adjustment (A, B) and an underline offset that clears descenders.

## 2. Contrast matrix (both themes)

Computed with WCAG 2.x relative luminance. Text pairs need 4.5:1; UI boundaries, icons and focus
need 3:1. Script: `contrast.py` (from the session's scratchpad; Phase 5 moves it into the repository
as a test).

| Kind | Foreground | Background | Light (fg / bg → ratio) | Dark (fg / bg → ratio) | Min | Result |
|---|---|---|---|---|---|---|
| text | ink | surface | `#1F1B1A` / `#FFFFFF` → **17.07** | `#EDE8E1` / `#1C1917` → **14.35** | 4.5 | PASS |
| text | ink | surface-1 | `#1F1B1A` / `#FBFAF7` → **16.36** | `#EDE8E1` / `#221E1C` → **13.56** | 4.5 | PASS |
| text | ink | surface-2 | `#1F1B1A` / `#F3F2EC` → **15.22** | `#EDE8E1` / `#2A2623` → **12.31** | 4.5 | PASS |
| text | ink | surface-3 | `#1F1B1A` / `#E6E6DC` → **13.59** | `#EDE8E1` / `#35302C` → **10.7** | 4.5 | PASS |
| text | ink-2 | surface | `#4A4542` / `#FFFFFF` → **9.45** | `#C8C1B7` / `#1C1917` → **9.8** | 4.5 | PASS |
| text | ink-2 | surface-2 | `#4A4542` / `#F3F2EC` → **8.43** | `#C8C1B7` / `#2A2623` → **8.41** | 4.5 | PASS |
| text | ink-2 | surface-3 | `#4A4542` / `#E6E6DC` → **7.53** | `#C8C1B7` / `#35302C` → **7.31** | 4.5 | PASS |
| text | ink-3 | surface | `#636363` / `#FFFFFF` → **6.01** | `#A29B91` / `#1C1917` → **6.36** | 4.5 | PASS |
| text | ink-3 | surface-1 | `#636363` / `#FBFAF7` → **5.76** | `#A29B91` / `#221E1C` → **6.01** | 4.5 | PASS |
| text | ink-3 | surface-2 | `#636363` / `#F3F2EC` → **5.36** | `#A29B91` / `#2A2623` → **5.45** | 4.5 | PASS |
| text | on-action | action | `#FFFFFF` / `#4B0F1E` → **15.15** | `#2A0A12` / `#E3B3BD` → **9.95** | 4.5 | PASS |
| text | on-action | action-hover | `#FFFFFF` / `#6A1A2D` → **11.68** | `#2A0A12` / `#EFC9D0` → **12.11** | 4.5 | PASS |
| text | on-selected | selected | `#4B0F1E` / `#F4EAEC` → **12.86** | `#F2D3D9` / `#3A2329` → **10.39** | 4.5 | PASS |
| text | ink | selected | `#1F1B1A` / `#F4EAEC` → **14.49** | `#EDE8E1` / `#3A2329` → **11.86** | 4.5 | PASS |
| text | link | surface | `#6A1A2D` / `#FFFFFF` → **11.68** | `#E9BEC7` / `#1C1917` → **10.54** | 4.5 | PASS |
| text | link | surface-2 | `#6A1A2D` / `#F3F2EC` → **10.41** | `#E9BEC7` / `#2A2623` → **9.04** | 4.5 | PASS |
| text | danger | danger-bg | `#8C3A1F` / `#F7EAE3` → **6.51** | `#E8A58C` / `#3A2620` → **6.9** | 4.5 | PASS |
| text | danger | surface | `#8C3A1F` / `#FFFFFF` → **7.66** | `#E8A58C` / `#1C1917` → **8.49** | 4.5 | PASS |
| text | warning | warning-bg | `#7A5A00` / `#F6EFD9` → **5.55** | `#E2C27A` / `#33291A` → **8.3** | 4.5 | PASS |
| text | warning | surface | `#7A5A00` / `#FFFFFF` → **6.38** | `#E2C27A` / `#1C1917` → **10.19** | 4.5 | PASS |
| text | success | success-bg | `#2D6640` / `#E6F0E8` → **5.83** | `#9CCBA9` / `#1F2E24` → **7.82** | 4.5 | PASS |
| text | success | surface | `#2D6640` / `#FFFFFF` → **6.8** | `#9CCBA9` / `#1C1917` → **9.6** | 4.5 | PASS |
| text | info | info-bg | `#2B5A6E` / `#E4EEF1` → **6.38** | `#9CC4D4` / `#1D2B31` → **7.81** | 4.5 | PASS |
| text | info | surface | `#2B5A6E` / `#FFFFFF` → **7.53** | `#9CC4D4` / `#1C1917` → **9.38** | 4.5 | PASS |
| ui | rule-strong | surface | `#8A8579` / `#FFFFFF` → **3.68** | `#857D74` / `#1C1917` → **4.32** | 3.0 | PASS |
| ui | rule-strong | surface-2 | `#8A8579` / `#F3F2EC` → **3.28** | `#857D74` / `#2A2623` → **3.7** | 3.0 | PASS |
| ui | focus | surface | `#4B0F1E` / `#FFFFFF` → **15.15** | `#E3B3BD` / `#1C1917` → **9.53** | 3.0 | PASS |
| ui | focus | surface-2 | `#4B0F1E` / `#F3F2EC` → **13.51** | `#E3B3BD` / `#2A2623` → **8.18** | 3.0 | PASS |
| ui | focus | selected | `#4B0F1E` / `#F4EAEC` → **12.86** | `#E3B3BD` / `#3A2329` → **7.88** | 3.0 | PASS |
| ui | action | surface | `#4B0F1E` / `#FFFFFF` → **15.15** | `#E3B3BD` / `#1C1917` → **9.53** | 3.0 | PASS |
| ui | brand | surface | `#E00800` / `#FFFFFF` → **5.0** | `#FF4A3D` / `#1C1917` → **5.25** | 3.0 | PASS |
| ui | brand | surface-2 | `#E00800` / `#F3F2EC` → **4.45** | `#FF4A3D` / `#2A2623` → **4.5** | 3.0 | PASS |
| extra | Text on danger button | | `#FFFFFF` / `#8C3A1F` → **7.66** | `#1C1917` / `#E8A58C` → **8.49** | 4.5 | PASS |
| extra | B rail text on maroon | | `#F7EEF0` / `#4B0F1E` → **13.30** | `#F7EEF0` / `#2F1A1F` → **14.31** | 4.5 | PASS |
| extra | Red marker on B maroon rail (non-text) | | `#E00800` / `#4B0F1E` → **3.03** | `#FF4A3D` / `#2F1A1F` → **4.89** | 3.0 | PASS |
| extra | Red marker on selected tint (A, C) | | `#E00800` / `#F4EAEC` → **4.24** | `#FF4A3D` / `#3A2329` → **4.34** | 3.0 | PASS |
| extra | Logo glyph on red | | `#FFFFFF` / `#E00800` → **5.00** | `#FFFFFF` / `#FF4A3D` → **3.33** | 3.0 | PASS |

**Result: every pair passes in both themes. Two notes:**

- The red marker on B's maroon rail is 3.03:1, a narrow margin. It is backed by weight and an
  underline.
- The dark logo is 3.33:1. Logotypes are exempt from contrast requirements, but this one is weak.

## 3. The three directions

### A · "Timetable, evolved"

| | |
|---|---|
| **Idea** | Keep the incumbent's table identity, recast in e& calm. A white page, hairline rows, and a 2px ink "ledger" rule under every table head, section head and consequence panel. A maroon masthead binds the book. |
| **Fonts** | **Archivo Variable** (already shipped; the `wdth` axis condenses heads to 87% and numbers to 80%) and **Noto Sans Arabic Variable** (`wdth` + `wght`, at 1.05 em). Both are self-hosted via `@fontsource`, under OFL. |
| **Density** | Compact on review desks: 32px rows, 11 rows at 1440×900. Comfortable elsewhere: 44px. |
| **Shape and effects** | 2px radii. Flat. No fills except the masthead and the selection tint. |
| **Red per screen** | 2 (logo, rail marker). The focal slot is unused. |
| **Maroon share** | **≈ 6.8%** (measured on the review desk at 1280×800), mostly the masthead. Red ≈ 0.1%. |
| **Anti-patterns to avoid** | Monument numerals; bold dates; condensed body text (headings and numbers only); the heavy rule in dark at full ink (it uses ink-2). |
| **Checklist** | ✓ ledger rule on every view · ✓ numbers at weight 500 · ✓ white focus ring in the maroon masthead · ✓ ink-2 heavy rule in dark |

### B · "Quiet desk"

| | |
|---|---|
| **Idea** | A soft beige canvas (`#F3F2EC`) under white panels, one panel level deep. A solid maroon navigation rail with white text, maroon page titles, and a comfortable rhythm. |
| **Fonts** | **Source Sans 3 Variable** and **Noto Sans Arabic Variable** (1.05 em). A humanist, quiet pairing. Self-hosted, OFL. |
| **Density** | Comfortable by default: 48px rows, 16px text. Compact on review desks: 36px rows, 10 rows at 1440×900. |
| **Shape and effects** | 8px panels, 6px buttons, 1px rules. Flat. |
| **Red per screen** | 2 (logo, rail marker). The marker sits on the maroon ground (3.03:1) with weight and an underline. |
| **Maroon share** | **≈ 13% at 1280×800** (the rail alone ≈ 12%) and ≈ 9–10% at 1920. **Over the 8–10% budget at laptop widths.** |
| **Anti-patterns to avoid** | Card-in-card nesting (fixed: one level); a maroon page title in dark (it uses ink); a white focus ring outside the rail. |
| **Checklist** | ✓ canvas restored (it had been lost to selector specificity) · ✓ white focus ring on the rail · ✓ dark panels one surface step above the canvas · ⚠ the maroon budget at ≤ 1440 |

### C · "Bilingual workbench"

| | |
|---|---|
| **Idea** | A worksheet, not a book. **IBM Plex Sans Variable** with its designed bilingual partner **IBM Plex Sans Arabic** (400/500/600), and **IBM Plex Mono** only for data: dates, counts and key caps. Square corners, vertical cell rules on one shared track set, and a full-height split pane beside the list from 1200px. |
| **Density** | Compact: 36px rows, 14px text. 12 rows at 1440×900, 8 at 1280×800. The detail pane is always in view from 1200px. |
| **Shape and effects** | Square. Flat. Surface-1 panes with a single strong rule between them. |
| **Red per screen** | 2 (logo, rail marker). |
| **Maroon share** | **≈ 1%**: the most restrained, and **under the 8–10% brand budget**. It reads as the least "e&". |
| **Anti-patterns to avoid** | Mono as costume (it is limited to data); the "technical" worksheet look reaching Explorer readers (they need a comfortable variant); vertical rules without shared tracks (fixed). |
| **Checklist** | ✓ real split pane (it had floated at 158px) · ✓ shared column tracks · ✓ ellipsis restored · ✓ Plex Arabic 500 shipped · ✓ 15px section heads · ⚠ brand presence |

## 4. Critique results (Impeccable, dual-agent)

| | A | B | C |
|---|---|---|---|
| Heuristic score (applicable) | 20 / 28 (71%) | 23 / 32 (72%) | 17 / 24 (71%) |
| Band | Good | Good (low) | Good (low) |
| Reviewer's verdict | *With changes:* make the ledger rule consistent across every view and stop bolding numbers | *With changes:* un-solidify the rail and restore the canvas | *With changes:* actually build the edge-to-edge split |
| Red misuse | none | none | none |
| Measured red share | ≈ 0.1% | ≈ 0.1% | ≈ 0.1% |

**Detector (Assessment B):**

- **Static scan:** `impeccable detect` on `frontend/src/design-lab` (20 files) found **0 findings**.
- **Live scan:** 16 injections across directions and themes. The only real defect was **dark-mode text inputs rendering white (1.2:1)** in all three directions, now **fixed**.
- **False positives:**
  - the striped lab bar (scaffolding);
  - the passage-cell ellipsis (intentional; the full text is in the detail pane);
  - the dark logo (a logotype, so exempt).

The scores were taken *before* the fixes below. They are close, so the choice is about fit, not
quality.

### Fixed after the critique

These were applied to all directions and re-verified by measurement:

- **P0, all directions:** dark inputs were white. They now use the surface token.
- **P0, B:** the focus ring was invisible on the maroon rail. It is now white there.
- **P1, all directions:**
  - targets were 20px; they are now 24px;
  - type was 13px; it is now 14px;
  - the mapping impact showed in success green; it now reads "Checked · 3 requirements would map
    differently";
  - the dark primary was a loud pastel pink; it is now a deep maroon fill;
  - colour transitions were removed;
  - a disabled primary is now an outline;
  - the evidence highlight is beige.
- **P1, B:** the beige canvas was lost to specificity and is restored. Card nesting is flattened to
  one level. The rail is narrower (11.5rem).
- **P1, C:**
  - the split pane is real (full height, sticky);
  - the grid uses shared tracks;
  - the ellipsis works again;
  - the select column fits its checkbox;
  - Plex Arabic 500 is shipped.
- **P2, A:**
  - the ledger rule now covers sections, queues and consequence panels;
  - numbers are at weight 500;
  - a maroon masthead was added;
  - the heavy rule uses ink-2 in dark.

### Still open (all directions, for Phase 5)

- An RTL title aligns to its *cell's* start only if the cell, not just the link, gets
  `dir="auto"`. That becomes a DataTable spec rule.
- The dark logo is 3.33:1 (exempt).
- The success-versus-consequence wording needs a rule in the content guide.
- O-1 to O-7 from the cognitive walkthrough remain open.

## 5. Chart and data-visualisation palette

This is ui-ux-pro-max chart guidance, held to the calm rules. **Red is never a data colour.**

**Categorical** (muted). Light values are shown with their contrast on white; dark values with their
contrast on charcoal. All are at least 4.5:1, so they work as text labels as well as marks.

| Series | Light | Dark |
|---|---|---|
| 1 Slate teal | `#2B5A6E` (7.53) | `#8FB8C9` (8.22) |
| 2 Olive | `#5E6B2E` (5.80) | `#B3BF86` (8.92) |
| 3 Ochre | `#8A6A1F` (5.05) | `#D9BC79` (9.51) |
| 4 Plum grey | `#6B5566` (6.74) | `#C3ADBE` (8.36) |
| 5 Umber | `#7A4A2A` (7.39) | `#D6A588` (7.99) |
| 6 Stone | `#6E6A60` (5.39) | `#B8B3A8` (8.37) |

**Sequential** (maroon to beige): `#4B0F1E` → `#7A3F4C` → `#A6747C` → `#CBA9AB` → `#E6E6DC`.
The two lightest steps are below 3:1 on white, so they are fills only, labelled directly.

**Rules:**

- At most 6 series, then group the rest as "Other".
- Label directly; avoid legends where possible.
- Pair colour with a pattern or shape when series touch.
- Keep a table view for every chart.
- Charts are rare in this product: counts, impact and coverage.

## 6. Recommendation

**Recommended: A, "Timetable, evolved", with one borrowing from C, the split-pane review desk at ≥ 1200 px.**

Why A:

- **It fits the evidence weighting: calm and accessible first.**
  - A had the fewest calm-rule tensions in critique.
  - After the fixes it sits closest to the brand proportion: maroon ≈ 7% from one structural
    element (the masthead), red ≈ 0.1%.
  - Its 32px ledger rows give the densest scannable review desk (11 rows at 1440).
- **It is the most product-specific of the three.** The ledger rule is an ownable signature, and
  the condensed numerals carry tabular data well. Keeping Archivo also eases change for current
  users, which matters because the structure is replaced wholesale (GATE 1a) and the usability
  rounds were not run.
- **Family fit:** a white page with one maroon band is the lightest touch beside Requirement AI's
  separate system. This is not verified, because requirement-portal isn't available on this
  machine.

Why borrow C's split pane: it is the one structural visual idea the critiques valued most for the
Analyst's burst ("the original beside the passage"). It drops into A without changing A's
identity: the pane becomes a surface-1 pane with A's 2px ledger rule.

Why not B:

- Its rail breaks the maroon budget at laptop widths (≈ 13%).
- It is the heaviest chrome for long sessions.
- Its comfortable rhythm is already available in every direction through the **density setting**
  (Account › Density).

Why not C wholesale: it is the most restrained (≈ 1% maroon) and reads least like e&. Its
worksheet look also needs a separate, softer variant for Explorer readers.

**Open choice inside the recommendation:** the type pairing. Archivo + Noto Sans Arabic gives
continuity and condensed numerals. IBM Plex Sans + Plex Sans Arabic is the stronger bilingual
match, because the faces were designed together. Both are self-hosted under OFL. If Arabic-heavy
content is expected to grow, choose Plex.

### Variant comparison (`/impeccable live`)

The lab's Direction and Theme switch is the side-by-side comparison. Address parameters let each
browser tab hold a different direction. `/impeccable live` (pick an element, iterate alternatives)
can be run at GATE 4 on any element you want to compare more finely. It needs you at the browser,
so it has not been run unattended.
