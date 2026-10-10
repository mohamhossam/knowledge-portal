# Design system — knowledge portal

Direction A, **"Timetable, evolved"**, in e& calm mode, plus the split-pane review desk borrowed
from direction C. Chosen at GATE 4 (2026-10-08). `DESIGN.md` holds the visual language; this file
is the engineer's reference: the token layers, the contrast matrix, the calm rules as enforced, and
every component's API, states, keyboard and accessibility behaviour.

| | |
|---|---|
| Code | `frontend/src/design/`: `tokens/` (primitive, semantic, component), `components/` (seven families), `hooks.ts`, `words.ts` |
| Use | Import `frontend/src/design` once at an app root. Wrap the area in `.ds-root`; `AppShell` does this for you. |
| See it | `http://localhost:5184/knowledge/design-system` (dev only): every component, both themes, both densities |
| Tests | `npx vitest run src/design`: 159 tests covering the token contract, behaviour, keyboard and ARIA |
| Related | `docs/ux/interaction/model.md` (behaviour rules, cited as §n below) · `docs/ux/content/` (voice, microcopy, glossary) · `docs/redesign/02-directions.md` (why A) |
| Status | Foundation (Phase 5). Today's screens still use the legacy `tokens.css` until their area migrates (Phase 8). |

## 1. Calm rules, as enforced

| Rule | How it is held |
|---|---|
| e& values only in primitives | `tokens.test.ts`: there is no raw colour in `semantic.css` or `component.css`, and `--eand-*` is read only by `semantic.css` |
| Red is a brand accent only | `--color-brand-accent` is used by the logo and the rail's active marker. The test checks that no state token equals it. The gallery shows the right and wrong uses. |
| Maroon is for action, selection and focus | `--color-action*`, `--color-selected`, `--color-focus`, plus the masthead (≈ 7% of the view) |
| States are their own hues, always with an icon and words | `Status` renders an icon and its words. Danger is rust, warning ochre, success green and info slate-teal, all distinct from red and maroon. |
| Contrast | Text ≥ 4.5:1 and non-text ≥ 3:1, in both themes, for 44 pairs (matrix below, enforced by the test) |
| Flat | One elevation, for overlays only (`--elevation-overlay`). There are no gradients and no glass. |
| Motion | Opacity and transform only, at 200 ms or less. There are no colour transitions. Under reduced motion everything is instant. |
| 14px floor and 24px targets | The type scale starts at 14px. Checkboxes, cell links, icon buttons and pagination are all at least 24px by their own size. |
| Dark mode is warm charcoal | `[data-theme="dark"]` or the OS preference. Tokens are re-declared on every theme and density scope (see §2). |

**Deviation from ui-ux-pro-max defaults, and why.**

- The design-system skill suggests colour transitions and opacity-dimmed disabled states.
- The calm rules win, because the conflict order puts calm rules above the design system.
- Motion is opacity and transform only.
- An unavailable control is an outline with its reason beside it, never a faded fill (interaction model §1.2).

## 2. Token layers

| Layer | File | Holds | May read |
|---|---|---|---|
| Primitive | `tokens/primitive.css` | e& primitives (the brief's values, unverified), derived neutrals, charcoal, maroon family, state hues, chart palettes, type, space, radius, motion, layers | — |
| Semantic | `tokens/semantic.css` | What a value is *for*: surfaces, ink, rules, action, selected, focus, brand accent, masthead, states, highlight, proof, charts; type roles; density; reduced motion | primitives |
| Component | `tokens/component.css` | Per-component knobs: button, field, focus ring, masthead and rail, table, badge, suggested, panel, state line, split pane, overlays, toast, skeleton, quote | semantic |

**Scoping rule.** A custom property's `var()` resolves *where it is declared*. That is why:

- component tokens, and semantic tokens derived from other semantic tokens, are declared on
  `:root, [data-theme], [data-density]`;
- so a dark or compact subtree re-resolves them.

The gallery found the bug that this rule prevents: light panels inside dark mode.

**Themes and density.**

- `data-theme="light" | "dark"` can sit on `<html>` or on any container. Without it, the OS
  preference decides.
- `data-density="comfortable" | "compact"` changes row height (44px or 32px), cell padding and
  table text (15px or 14px).

## 3. Contrast matrix

This is generated from the shipped token CSS. The same pairs are asserted in `tokens.test.ts`.

| Kind | Foreground on background | Light | Dark | Needs |
|---|---|---|---|---|
| Text | `ink` on `surface` | #1f1b1a / #ffffff → **17.07** | #ede8e1 / #1c1917 → **14.35** | 4.5 ✓ |
| Text | `ink` on `surface-1` | #1f1b1a / #fbfaf7 → **16.36** | #ede8e1 / #221e1c → **13.56** | 4.5 ✓ |
| Text | `ink` on `surface-2` | #1f1b1a / #f3f2ec → **15.22** | #ede8e1 / #2a2623 → **12.31** | 4.5 ✓ |
| Text | `ink` on `surface-3` | #1f1b1a / #e6e6dc → **13.59** | #ede8e1 / #35302c → **10.70** | 4.5 ✓ |
| Text | `ink-2` on `surface` | #4a4542 / #ffffff → **9.45** | #c8c1b7 / #1c1917 → **9.80** | 4.5 ✓ |
| Text | `ink-2` on `surface-2` | #4a4542 / #f3f2ec → **8.43** | #c8c1b7 / #2a2623 → **8.41** | 4.5 ✓ |
| Text | `ink-2` on `surface-3` | #4a4542 / #e6e6dc → **7.53** | #c8c1b7 / #35302c → **7.31** | 4.5 ✓ |
| Text | `ink-3` on `surface` | #636363 / #ffffff → **6.01** | #a29b91 / #1c1917 → **6.36** | 4.5 ✓ |
| Text | `ink-3` on `surface-1` | #636363 / #fbfaf7 → **5.76** | #a29b91 / #221e1c → **6.01** | 4.5 ✓ |
| Text | `ink-3` on `surface-2` | #636363 / #f3f2ec → **5.36** | #a29b91 / #2a2623 → **5.45** | 4.5 ✓ |
| Text | `on-action-fill` on `action-fill` | #ffffff / #4b0f1e → **15.15** | #f7eef0 / #7a2e3f → **8.05** | 4.5 ✓ |
| Text | `on-action-fill` on `action-fill-hover` | #ffffff / #6a1a2d → **11.68** | #f7eef0 / #8c4152 → **6.16** | 4.5 ✓ |
| Text | `on-selected` on `selected` | #4b0f1e / #f4eaec → **12.86** | #f2d3d9 / #3a2329 → **10.39** | 4.5 ✓ |
| Text | `ink` on `selected` | #1f1b1a / #f4eaec → **14.49** | #ede8e1 / #3a2329 → **11.86** | 4.5 ✓ |
| Text | `link` on `surface` | #6a1a2d / #ffffff → **11.68** | #e9bec7 / #1c1917 → **10.54** | 4.5 ✓ |
| Text | `link` on `surface-2` | #6a1a2d / #f3f2ec → **10.41** | #e9bec7 / #2a2623 → **9.04** | 4.5 ✓ |
| Text | `action` on `surface` | #4b0f1e / #ffffff → **15.15** | #e3b3bd / #1c1917 → **9.53** | 4.5 ✓ |
| Text | `on-masthead` on `masthead` | #ffffff / #4b0f1e → **15.15** | #f7eef0 / #4a1b26 → **12.50** | 4.5 ✓ |
| Text | `on-danger` on `danger` | #ffffff / #8c3a1f → **7.66** | #1c1917 / #e8a58c → **8.49** | 4.5 ✓ |
| Text | `danger` on `danger-bg` | #8c3a1f / #f7eae3 → **6.51** | #e8a58c / #3a2620 → **6.90** | 4.5 ✓ |
| Text | `danger` on `surface` | #8c3a1f / #ffffff → **7.66** | #e8a58c / #1c1917 → **8.49** | 4.5 ✓ |
| Text | `warning` on `warning-bg` | #7a5a00 / #f6efd9 → **5.55** | #e2c27a / #33291a → **8.30** | 4.5 ✓ |
| Text | `warning` on `surface` | #7a5a00 / #ffffff → **6.38** | #e2c27a / #1c1917 → **10.19** | 4.5 ✓ |
| Text | `success` on `success-bg` | #2d6640 / #e6f0e8 → **5.83** | #9ccba9 / #1f2e24 → **7.82** | 4.5 ✓ |
| Text | `success` on `surface` | #2d6640 / #ffffff → **6.80** | #9ccba9 / #1c1917 → **9.60** | 4.5 ✓ |
| Text | `info` on `info-bg` | #2b5a6e / #e4eef1 → **6.38** | #9cc4d4 / #1d2b31 → **7.81** | 4.5 ✓ |
| Text | `info` on `surface` | #2b5a6e / #ffffff → **7.53** | #9cc4d4 / #1c1917 → **9.38** | 4.5 ✓ |
| Text | `ink` on `highlight` | #1f1b1a / #e6e6dc → **13.59** | #ede8e1 / #4a443f → **7.87** | 4.5 ✓ |
| Text | `ink` on `proof` | #1f1b1a / #e6e6dc → **13.59** | #ede8e1 / #35302c → **10.70** | 4.5 ✓ |
| Non-text | `rule-strong` on `surface` | #8a8579 / #ffffff → **3.68** | #857d74 / #1c1917 → **4.32** | 3.0 ✓ |
| Non-text | `rule-strong` on `surface-2` | #8a8579 / #f3f2ec → **3.28** | #857d74 / #2a2623 → **3.70** | 3.0 ✓ |
| Non-text | `focus` on `surface` | #4b0f1e / #ffffff → **15.15** | #e3b3bd / #1c1917 → **9.53** | 3.0 ✓ |
| Non-text | `focus` on `surface-2` | #4b0f1e / #f3f2ec → **13.51** | #e3b3bd / #2a2623 → **8.18** | 3.0 ✓ |
| Non-text | `focus` on `selected` | #4b0f1e / #f4eaec → **12.86** | #e3b3bd / #3a2329 → **7.88** | 3.0 ✓ |
| Non-text | `brand-accent` on `surface` | #e00800 / #ffffff → **5.00** | #ff4a3d / #1c1917 → **5.25** | 3.0 ✓ |
| Non-text | `brand-accent` on `selected` | #e00800 / #f4eaec → **4.24** | #ff4a3d / #3a2329 → **4.34** | 3.0 ✓ |
| Non-text | `brand-accent` on `masthead` | #e00800 / #4b0f1e → **3.03** | #ff4a3d / #4a1b26 → **4.27** | 3.0 ✓ |
| Non-text | `rule-heavy` on `surface` | #1f1b1a / #ffffff → **17.07** | #c8c1b7 / #1c1917 → **9.80** | 3.0 ✓ |
| Non-text | `chart-1` on `surface` | #2b5a6e / #ffffff → **7.53** | #8fb8c9 / #1c1917 → **8.22** | 3.0 ✓ |
| Non-text | `chart-2` on `surface` | #5e6b2e / #ffffff → **5.80** | #b3bf86 / #1c1917 → **8.92** | 3.0 ✓ |
| Non-text | `chart-3` on `surface` | #8a6a1f / #ffffff → **5.05** | #d9bc79 / #1c1917 → **9.51** | 3.0 ✓ |
| Non-text | `chart-4` on `surface` | #6b5566 / #ffffff → **6.74** | #c3adbe / #1c1917 → **8.36** | 3.0 ✓ |
| Non-text | `chart-5` on `surface` | #7a4a2a / #ffffff → **7.39** | #d6a588 / #1c1917 → **7.99** | 3.0 ✓ |
| Non-text | `chart-6` on `surface` | #6e6a60 / #ffffff → **5.39** | #b8b3a8 / #1c1917 → **8.37** | 3.0 ✓ |


Notes:

- The dark masthead (`#4a1b26`) was deepened from the action fill because red on it measured 2.75:1.
  It is now 4.27:1, a finding from the token test.
- The two lightest sequential chart steps are fills only, labelled directly.

## 4. Components

These are composition-first. Props carry data, children carry content, and a router's link
component is passed in (`link`), so the system stays router-agnostic (vercel-composition-patterns).

### Shell and page (`components/layout.tsx`)

- **`AppShell`**
  - **What it does:**
    - skip links ("Skip to content", "Skip to navigation");
    - the maroon masthead: logo slot, product, outbound "Requirement AI" link, `utilities`;
    - the rail: `navigation` and `secondaryNavigation` items with `current` and `count`;
    - an optional shell `banner`.
  - **Reader variant:** `reader` drops the rail.
  - **Behaviour:** when `locationKey` changes, it scrolls to the top and focuses `#ds-page-title`
    (§1). The masthead publishes `--sticky-top`.
  - **ARIA:** `banner`, `navigation "Areas"`, `main`. The current item has
    `aria-current="page"` and the red marker.
- **`MastheadButton`:** Jobs, Help or Account, with a text label, an icon and an optional count
  (`aria-expanded`).
- **`PageHeader`:** the h1 has `tabindex=-1` and the document title is set first. It has slots for
  `lead`, `meta` (status, owner), `provenance` and `actions`; `children` take tabs or a state line.
- **`StateLine`:** `plain` or `proof` (a replaced version, on the beige tint). It is sticky,
  `role="status"`, and publishes `--sticky-state`.
- **`ProvenanceLine`, `Breadcrumbs`:** the last crumb is `aria-current="page"`.
- **`SubNav`:** navigation that changes the URL (`aria-current`).
- **`Tabs`:** ARIA tabs for the same URL. ← → move between tabs, Home/End jump, there is one tab
  stop, and focus follows the selection.
- **`Toolbar`:** `role="toolbar"`, roving with ← →.
- **`SplitPane`:** the list beside a sticky, full-height detail pane from 1200px, stacked below
  that. The pane is a labelled `complementary` region.
- **`Pagination`:** `aria-current` on the current page; every page button is named "Page n".
- **`Section`:** the ledger rule and an h2 with an optional count; a labelled `region`.

### Actions and status (`actions.tsx`, `feedback.tsx`)

- **`Button`**
  - **Variants:** `secondary` (default), `primary` (the page's one main action), `danger` (rust,
    with an icon), `quiet`, `link`.
  - **`unavailableReason`:** sets `aria-disabled`, keeps the button focusable, shows the reason
    beside it, and announces the reason on press (§1.2).
  - **`busy`:** sets `aria-busy` and ignores presses.
- **`ActionGroup`:** a labelled group.
- **`Status`:** one of six tones (neutral, working, done, attention, held, stopped). It always
  shows an icon and words. Severe tones carry weight, so they never look lighter than routine ones.
- **`Badge`:** a neutral count, named for screen readers ("6 need you").
- **`Suggested`:** the AI mark (§9), "Suggested · stated in the source" or "… inferred, not stated
  in the source", plus optional detail. It reads without colour.
- **`EmptyState`:** what this is, why it is empty, and what to do (§8).
- **`Skeleton`:** a tint only with no shimmer; `role="status"` and `aria-busy`.
- **`UndoToast`:** the only toast, used for the delayed-commit window (§4). It is polite and never
  takes focus.
- **`JobStatus`, `JobTray`:** jobs ordered by need. Each shows its object, timing, cause and fix,
  with retry and stop named for their job (§6).
- **`LiveMessage`:** one polite live region.

### Forms (`forms.tsx`)

- **`Field`:** a render prop wires the label, hint and error (`aria-describedby`,
  `aria-invalid`, `aria-required`). Errors show only when given.
- **`TextField`, `TextArea`:** both `dir="auto"`. **`Select`.**
- **`Checkbox`:** a 24px box whose label is part of the target. **`RadioGroup`:** a fieldset with a
  legend.
- **`Combobox`:** type to filter. ↓ ↑ move via `aria-activedescendant`, Enter picks, Esc closes
  then clears. An optional `suggested` option comes first with its reason. Options are bidi
  isolated.
- **`Upload`:** a labelled file control; each file shows its scan and read state
  (`JobStatus`).

### Data and review (`data.tsx`)

- **`FilterStrip`:** pressed buttons with counts, an optional find field (`data-find` for the `/`
  shortcut), and "Clear filters".
- **`DataTable`:** the ledger table.
  - **Always:** a caption; a sticky head under the heavy rule; `aria-sort` on sortable columns; a
    row-header column; `bidi` cells (`dir="auto"`); `numeric` columns (condensed, tabular,
    end-aligned); 24px selection checkboxes; an empty text; density-aware rows.
  - **With `onActivate`, it becomes a keyboard grid with one tab stop:**
    - ↑ ↓ (and j k) move between rows;
    - Home and End jump to the ends;
    - Enter opens a row;
    - Space selects;
    - Shift+↑/↓ extends the selection.

    Grid mode works with NVDA and JAWS, which switch to focus mode inside a grid (§2.1).
- **`DecisionButtons`:**
  - **Passage:** include, exclude, edit.
  - **Suggestion:** accept, reject, accept with edits.
  - The group is named for its row, and each button has `aria-keyshortcuts`. Once decided, the
    buttons are replaced by the decided state.
- **`BulkActionBar`:** appears only with a selection. It says the count, is sticky and measured
  (`--sticky-bottom`), and has "Clear selection".
- **`DiffView`:** counts first; then each change shows its kind as an icon and a word, from → to
  values ("changed to" for screen readers), and its origin. Removed items keep full weight, and
  red is never used.

### Compare, impact and provenance (`evidence.tsx`)

- **`ConsequencePanel`**
  - **Order:** what happens → who and what it affects → reversibility → a reason (when the API
    takes one) → the verb button and the safe default (§5).
  - **Focus:** moves in on appearance; Esc is the safe default.
  - **`tone="danger"`:** rust, with an icon.
  - **Shape:** the ledger rule on top and a 1px frame; never a thick side border.
- **`ImpactPanel`:** five states: not checked, checking, checked at, out of date (stale), and
  unknown. Unknown says "unknown, not zero". The panel shows counts first, named items, then the
  caveat (§11).
- **`ProvenanceTrail`:** an ordered list of hops (fact → evidence → document version → catalogue
  version → decided by), in a labelled nav (§10).
- **`EvidenceQuote`:** the passage with only the quoted line highlighted (beige), in its own
  direction, with the source underneath.

### Overlays and help (`overlays.tsx`)

- **`Dialog`:** a native modal `<dialog>`, used **only** for leave-with-unsaved, session expiry, or
  a 409 that needs a choice (§4). Focus moves to its first button and returns to the opener;
  Esc closes it.
- **`Drawer`:** a non-modal side panel (Help, Jobs, Account, upload). Esc closes it. Pair it with
  `useDisclosure` for focus in and back.
- **`Toggletip`:** opened by press, never by hover alone. It is announced politely and closed with
  Esc (§14).
- **`ShortcutHelp`:** the widget's keys plus the page-wide keys, with the on/off switch that WCAG
  2.1.4 requires.
- **`HelpContent`:** the four parts of consistent help, always in order: this page, shortcuts,
  terms, ask the knowledge team (WCAG 3.2.6).

### Hooks (`hooks.ts`)

| Hook | What it does |
|---|---|
| `useFocusAfterRender` | Focus after commit. Not `requestAnimationFrame`, which stops in background tabs. |
| `useStickySize` | A sticky region publishes `--sticky-top`, `--sticky-state` or `--sticky-bottom`, so scroll padding keeps focus clear (§1.1) |
| `useDisclosure` | Focus in on open, back to the opener (or a fallback) on close |
| `useDelayedCommit` | Show a decision now, send it after 6s, `undo`, `flush` on leave (§4; BG3) |
| `rovingKeyDown` | One tab stop with arrow keys for lists and toolbars |

## 5. Bidi in components

- **Direction:** every content-bearing input and cell can take its own direction (`dir="auto"`).
- **Names in sentences:** isolated with `<bdi>`.
- **RTL text:** gets Noto Sans Arabic at line-height 1.75, with an underline offset that clears
  descenders.
- **The UI chrome is never mirrored.**
- **Cell alignment:** an RTL table cell aligns to its own start. The cell itself carries
  `dir="auto"`, not just the link inside it.

## 6. Accessible-name rule (found by the tests)

Screen readers and the testing library trim whitespace at the edges of inline elements. So:

- **Never** start or end a visually hidden span with a space.
- **Do** put the separating space outside the span, or name the control with one
  `aria-label` / one hidden phrase.

`Badge`, `Pagination`, the outbound link, section counts and the diff all follow this.
