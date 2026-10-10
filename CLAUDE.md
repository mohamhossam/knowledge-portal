# CLAUDE.md

Engineering rules for this repository live in `AGENTS.md` and apply here in full. This file adds
Claude-specific guidance on top of them.

## UI rules

The knowledge portal has **its own design system**, separate from requirement-portal's Working
Paper. Do not copy requirement-portal's tokens, primitives or shell.

- **Source of truth.** Once they exist, `DESIGN.md` and `docs/design-system.md` govern every
  screen. Read them before editing UI.
- **Built for curation work.** That means dense tables, review queues, release comparison, and
  clear provenance for AI-suggested content.
- **Stack.** React + Vite (TypeScript), served under the build's base path: `/knowledge/` unless
  `KNOWLEDGE_BASE_PATH` says otherwise, such as `/` on the portal's own hostname
  (`frontend/basePath.ts`). Never hard-code `/knowledge/` in the app; use `BASE` from
  `src/auth/paths.ts`.
- **Accessibility.** Meet WCAG 2.2 AA:
  - contrast ratios;
  - keyboard reachability and visible focus;
  - focus never obscured;
  - a 24px minimum target size;
  - semantic landmarks and headings;
  - labelled controls;
  - consistent help;
  - respect for `prefers-reduced-motion`.
- **Critique before each pull request.** Run the impeccable critique on each screen against a
  live, seeded page, and fix the findings before the pull request.
- **List files before big edits.** Before a multi-file change, enumerate the files you intend to
  touch and confirm the scope.
- **Build after each change.** `cd frontend && npm run build` must stay green.

## Service rules

- Every public route requires `knowledge_admin`, except the explorer's read routes
  (`/explorer/*`), which any signed-in user may read (requirement-portal ADR-0101). They read the
  version in service only, never drafts, documents or history, and write nothing.
- `/internal/*` routes require a service token (`smb_kernel.http.InternalRouteGuard`), and are
  public API for requirement-portal (`AGENTS.md` §2.1).

## Redesign epic (e& calm)

A complete UX redesign runs on the integration branch `feat/kb-redesign`.

- On this branch, `DESIGN.md` ("The Calm Ledger", direction A) and `docs/design-system.md`
  describe the new design system in `frontend/src/design/`.
- Screens not yet migrated still follow the archived Timetable Book,
  `docs/design-history/timetable-book-DESIGN.md`, until their area is rebuilt (Phase 8).
- On `main`, the Timetable Book `DESIGN.md` still describes what ships.

- **Status first.** `docs/redesign/STATUS.md` holds the phase, decisions, scores, metrics and
  the next exact action. Read it at session start; update it at the end of every phase, and
  before stopping when context runs low. Work stops at every gate until the user approves.
- **Authority.**
  - Impeccable (`/impeccable:impeccable`) leads UX and judges design.
  - ui-ux-pro-max leads visual direction and the design system, only after the UX structure
    is validated. Never use its `ui-styling` skill (shadcn/Tailwind).
  - vercel-ui-guidelines leads code quality (ignore Next-only rules).
- **Conflict order.** User evidence > `PRODUCT.md` > e& calm rules > Impeccable (UX) > the
  approved design system > Vercel (code). On accessibility, apply the stricter rule.
- **e& calm rules (summary).**
  - Colour proportion: about 85–90% calm neutrals (white, beige-derived tints, warm greys),
    8–10% maroon, at most 2% red.
  - Red `#E00800` is a brand accent only: logo, active-nav marker, at most one focal accent
    per view. Never for status, errors, destructive actions, diff "removed" or alerts.
  - Maroon `#4B0F1E` carries primary actions, selection, headings and the focus ring (≥ 3:1,
    never obscured).
  - Semantic colours (danger, warning, success, info) are their own low-saturation tokens,
    always paired with an icon and text.
  - Warm near-black body ink; e& grey only for secondary text on white or on `#F3F2EC` and
    lighter. Never red text on beige.
  - Flat surfaces with soft rules; one subtle elevation, for overlays only. No gradients, glass,
    neon or saturated full-bleed fills.
  - Motion ≤ 200 ms, opacity and transform only, instant under reduced motion.
  - Density stays efficient for review work.
  - Dark mode is warm charcoal.
  - Charts use a muted palette; red is never a data colour.
- **Token layering.** e& values live only in the primitive token layer. Components consume
  semantic tokens. A brand-lint check enforces this once it exists.
- **Fonts are self-hosted only** (`@fontsource` or licensed files, CSP-safe), with Arabic
  coverage.
- **Branching.**
  - Areas are built on `feat/kb-redesign-<area>` (git cannot nest a branch under an existing
    branch name) and merged back with `--no-ff` after their
    gate.
  - `main` stays shippable; one final PR goes into `main`.
  - Never push, rebase or open a PR without asking.
- **`/redesign-area`** (`.claude/skills/redesign-area/`) is the only way to build a production
  area, from an approved plan in `docs/redesign/plans/`. It does not exist before Phase 7.
- **Evidence vs HYPOTHESIS.** Never invent research results, quotes, metrics or users.
  Anything not backed by evidence the user provided is labelled **HYPOTHESIS**.
- **Data.** Use only the offline fake stack and its seeded data (`scripts/seed_demo.py`). In
  this checkout, the launch configurations `redesign-api` (port 8110) and `redesign-web`
  (port 5184) keep this work apart from other sessions' servers.
