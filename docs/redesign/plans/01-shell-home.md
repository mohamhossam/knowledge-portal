# Area 1: Shell, navigation, job tray, help + Home

**Branch:** `feat/kb-redesign/shell-home` · **Gate:** GATE 8.1 · **Order:** first. Every later
area renders inside this shell.

## 1. Goal

Replace the Timetable Book binding (the masthead strip plus the "index of tables") with the
design system's `AppShell`:

- skip links;
- the maroon masthead with the same three utilities on every page (Jobs, Help, Account);
- a five-area rail plus Explorer;
- a shared "need you" count.

Replace the four-table front page with **Your work**: one ranked queue of next decisions, Mine or
Everyone's (IA §3, interaction model §15).

Unmigrated pages keep working inside the new shell, with their legacy CSS, until their own area
is built.

## 2. Routes

| Current | Target | Note |
|---|---|---|
| (frame of every page) | `AppShell` | The utilities are in the same order everywhere (WCAG 3.2.3, 3.2.6) |
| `/` (four tables) | `/` **Your work**, plus `?scope=everyone` | Content replaced |
| — | `?help=shortcuts` on any page | Opens Help at its shortcuts section |

`/help`, `/help/shortcuts` and `/help/glossary` (the full-page Help in the route map) are **out
of scope** here. They are proposed for area 9 if the critique asks for them; the panel is enough
for 3.2.6.

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `frontend/src/app/Shell.tsx` (→ `AppShell` + `MastheadButton` + side panels), `frontend/src/app/HomePage.tsx` (→ Your work) |
| New | `frontend/src/work/queue.ts` (the priority function moved from `design-lab/wireframes/queue.ts`, with tests), `frontend/src/work/YourWork.tsx`, `frontend/src/shell/JobsPanel.tsx`, `frontend/src/shell/HelpPanel.tsx`, `frontend/src/shell/AccountPanel.tsx`, `frontend/src/shell/help.ts` (from `design-lab/wireframes/help.ts`), `frontend/src/shell/useJobs.ts` (derived jobs, BG1), `frontend/src/shell/preferences.ts` (density and shortcuts, saved in `localStorage` with try/catch), `frontend/src/shell/useGlobalShortcuts.ts` |
| Change | `frontend/src/main.tsx`: import `./design` (fonts + tokens) **after** the legacy CSS. `frontend/src/styles/tokens.css`: rename the clashing legacy properties first (see Risks). |
| Remove (in the merge) | `frontend/src/home/OverviewTable.tsx`, `home/tables.ts`, `home/useOverview.ts`, `home/format.ts` (if unused), `home/derive.ts` (if `queue.ts` replaces it; keep it if another area reads it), and the `.index*` and `.masthead*` selectors in `styles/shell.css` |
| Tests | `work/queue.test.ts` (ordering, Mine and Everyone's, the rail count equals the queue count), `shell/*.test.tsx` (utilities on every page, focus in and out of panels, shortcuts off by default) |

## 4. Prototype reference

- **Routes:** `/knowledge/design-lab/prototype/`, plus the shell on every prototype page.
- **Captures:** `round-2/prototype/{light,dark}-01-your-work.jpg`, `*-14-jobs-panel.jpg`,
  `*-16-library-390.jpg`.
- **Code:** `design-lab/prototype/Shell.tsx`, `pages/YourWork.tsx`; and the lab's `queue.ts`,
  `help.ts` and `hooks.ts` (`useGlobalShortcuts`).

## 5. Archetype and components

| Region | Archetype | Components |
|---|---|---|
| Shell | Frame | `AppShell` (`link` = a router link, `panel` slot, `banner` for offline), `MastheadButton`, `Drawer`, `JobTray`, `HelpContent`, `ShortcutHelp`, `RadioGroup`, `Checkbox`, `LiveMessage` |
| Your work | Queue | `PageHeader`, `FilterStrip` (Mine / Everyone's), `Section` with counts, roving lists (`rovingKeyDown`), `EmptyState`, `Skeleton`, `Status` |

## 6. States

- **Loading:** a skeleton of six rows; the h1 is focused when it arrives (`AppShell` waits for it).
- **Empty (Mine):** "Nothing else needs you." with a way to see everyone's work. Each empty
  section says why in one line.
- **Error:**
  - one section's source fails: that section says "Couldn't read …" with *Try again*, and the
    others still render;
  - all of them fail: the system state from area 9.
- **Offline:** the shell's banner ("The portal can't reach its service. Your unsaved work stays
  here."), polite.
- **Jobs:**
  - the six words (Waiting, Working, Done, Needs attention, Stopped, Held);
  - ordered by need;
  - each job shows its object, its timing, its cause and its fix;
  - retry and stop are named for the job they act on.
- **Not an admin:** the reader shell (no rail). The 403 path is unchanged.
- **Long or bidi names:** queue sentences wrap; names are isolated with `<bdi>`.

## 7. Interaction

**Focus:**

- On a route change, focus goes to the h1 (or to a `#target`).
- Panels are non-modal, beside the page:
  - Esc closes a panel and returns focus to its opener;
  - one panel shows at a time.

**Page-wide shortcuts** (`g w/l/c/o/r`, `g j`, `?`, `/`):

- off by default;
- never inside fields or grids;
- the switch lives in Account and in Help (2.1.4).

**Density:** *Automatic* means compact on review desks and comfortable elsewhere. The setting
is per person.

## 8. Content

- **Labels:**
  - Your work · Library · Catalogue · Ownership · Requirements · Explorer · Jobs · Help;
  - Account (the person's name).
- **Queue sentences:** the patterns in `pages/YourWork.tsx` `words()`; they are checked against
  `content/microcopy.md`.
- **Help:** the four parts in order: this page, shortcuts, terms, ask the knowledge team. The
  contact stays a placeholder until the team supplies one; record it as an open question at the
  gate.

## 9. Backlog items

K3 (watch), K4 (a short account label below 480px), K5 (add a favicon in the e& set:
`frontend/public/favicon.svg`; ask the user for the asset, otherwise use a neutral mark).

## 10. Acceptance criteria (area-specific)

- **1.1** The rail's "Your work" count and the queue's total match on every seeded scenario (a
  unit test on `queue.ts`).
- **1.2** At most 3 tab stops before the primary content on every page: skip link → … (e2e).
- **1.3** Jobs, Help and Account are in the same place, in the same order, on every route,
  including unmigrated pages (e2e over all routes).
- **1.4** The chrome (masthead and rail) is at most 15% of a 1280×800 view on a non-desk page.
- **1.5** Unmigrated pages look unchanged inside the new shell, apart from the frame: their
  visual diff is limited to the frame region (a screenshot review at the gate).
- **1.6** The prototype's Your work tests carry over: no write is called on load.

## 11. Out of scope

- The full-page Help routes.
- A real job-list API (BG1: derived only).
- Any change to sign-in or OIDC.

## 12. Risks

- **The tokens clash (blocking, first commit of the area).**
  - Legacy `styles/tokens.css` and the new token layer both declare `--focus-ring`, `--gutter`,
    `--page-max` and `--rule-heavy` on `:root`.
  - Legacy `--rule-heavy` is a **colour**; the new one is a **width**.
  - **Fix:** before importing `./design` app-wide, rename the four legacy properties to `--tt-*`
    in `styles/*.css`. Every reference is in the legacy CSS, so this is a mechanical
    find-and-replace. Verify with a screenshot diff of three legacy pages.
- **`base.css`** sets global `*`, `html` and `body` rules. `.ds-root` sets its own typography;
  check that nothing leaks into the masthead.
- **Two scroll-padding systems** (legacy and the measured `--sticky-*`) must not stack: keep the
  design system's.
