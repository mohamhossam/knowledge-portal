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
- **Stack.** React + Vite (TypeScript), served under `base: "/knowledge/"`.
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

- Every public route requires `knowledge_admin`.
- `/internal/*` routes require a service token (`smb_kernel.http.InternalRouteGuard`), and are
  public API for requirement-portal (`AGENTS.md` §2.1).
