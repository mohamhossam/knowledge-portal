# Research synthesis — knowledge portal redesign

> **HYPOTHESIS: assumption mode (user decision, GATE 1a, 2026-10-08).** No interviews,
> contextual inquiry, survey or benchmark were run. `docs/ux/research/raw/` holds no
> participant data. Everything below is derived from:
>
> - **[E] Expert review:** `01-heuristic-review.md`, five isolated design reviews plus a
>   detector run on the seeded fake stack;
> - **[P] PRODUCT.md:** the team's own statement of users, rhythms and principles;
> - **[D] Discovery:** `docs/redesign/00-discovery.md`, the code and its measurements.
>
> **Evidence counts are counts of expert sources, not of users.** "Flagged by 4/5 reviewers"
> means four of the five isolated reviews raised it independently. No quote here comes from a
> user, and none may be presented as one. When real research arrives, it overrides this file.

## 1. Affinity themes

Ranked by the user's weighting at GATE 1a (**calm + accessible first**), then by breadth.

| # | Theme | Expert evidence | Sources |
|---|---|---|---|
| T1 | **Colour carries alarm, not meaning.** Red `--disruption` marks failure, overdue and blocking in 22 places, with no icon. Urgent is set lighter than routine. Blue carries focus and links. | 5/5 reviewers; 22 code refs | E, D |
| T2 | **No consistent help or shared vocabulary.** There is no help entry or shortcut help, and "review", "search" and "waiting" each carry two meanings. | 5/5 (H10 mean 1.7) | E |
| T3 | **Focus and orientation are lost.** Route changes leave focus on `<body>` and keep the old scroll position. Panels don't take or return focus. Native `disabled` hides its reasons. | 4/5; verified in code | E |
| T4 | **Assistive technology and zoom pay extra.** Single-letter keys on a non-grid table clash with NVDA and JAWS quick keys. Status changes aren't announced. Marks are 10×12px. At 175–200% zoom the chrome takes 30–40% of the viewport. | 4/5 | E |
| T5 | **Review is nominal.** There is no "seen" state or progress. Reject is instant and irreversible. A bulk accept can't be inspected and looks like a read decision. A withdrawn document can be re-approved in one click. | 3/5 (Library, Draft, Home) | E, P |
| T6 | **Provenance stops at the draft.** Published facts and change lists don't say who decided or where a fact came from. AI proposals aren't marked as AI. | 3/5 | E, P |
| T7 | **It is a report, not a queue.** Four equal tables, no "mine" view, next decisions thousands of pixels away. The Squads check-in sits about 3,000px down. | 4/5 | E |
| T8 | **The metaphor costs words and space.** "Table N", "edition in force", the monument column, and an index that compares unlike units. | 5/5 | E |
| T9 | **Few accelerators outside two keyboard islands.** No undo, multi-select, "next flagged", combobox find, or filters in the URL. | 5/5 (H7 mean 1.7) | E |
| T10 | **Versions and modes are ambiguous.** A replaced version looks like the version in service. The draft's steps aren't a sequence. A stale Explorer link silently swaps the scenario. | 3/5 | E |
| T11 | **Bidi is mostly careful, with known breaks.** Arabic names are joined into plain strings, an `dir="auto"` h1 swings right, and find fields lack `dir`. | 3/5 | E, D |

## 2. Ranked pain points (HYPOTHESIS)

**Rank = severity × breadth × weighting.** Severity uses P0–P3 from the review. Breadth is
the number of surfaces affected. Weighting is ×1.5 for the calm + accessible cluster (the
user's choice).

| Rank | Pain point | Theme | Severity | Surfaces |
|---|---|---|---|---|
| 1 | Status shown by red colour alone, with an inverted urgency hierarchy | T1 | P1 | all 7 |
| 2 | Focus lost on navigation and panels; disabled reasons unreachable | T3 | P1 | 6 |
| 3 | No consistent help, glossary or shortcut help | T2 | P1 | all 7 |
| 4 | Assistive-technology key collisions, unannounced changes, zoom chrome | T4 | P1 | 4 |
| 5 | Review can be completed without seeing anything; irreversible keystroke reject; uninspectable bulk | T5 | P1 | 3 |
| 6 | "What needs me" has no view; next decisions far from the work | T7 | P1 | 4 |
| 7 | Provenance and AI-vs-human invisible after the draft | T6 | P1 | 3 |
| 8 | Ambiguous version and mode; stale Explorer links | T10 | P1 | 3 |
| 9 | Missing accelerators for bursts | T9 | P1/P2 | 5 |
| 10 | Metaphor vocabulary and chrome cost | T8 | P2 | all 7 |
| 11 | Bidi string-join and alignment breaks | T11 | P2 | 3 |

## 3. Proto-personas (HYPOTHESIS)

These personas are derived from PRODUCT.md roles and the review's persona walk-throughs. They
are not real people. Names are role labels, chosen so they cannot be mistaken for participants.

### P-A "The Architect": catalogue owner

- **Job.** Turns architecture documents into a trustworthy catalogue release. Keeps system
  ownership true.
- **Rhythms.**
  - Bursts around a release: hundreds of suggestions, compare, check, publish.
  - Check-ins: give an unowned system to a squad, fix an owner.
- **Needs.** To see what is AI-proposed versus accepted, and by whom. The consequence (diff and
  mapping impact) beside Publish. To know which version they are reading.
- **Frustrations** (from the review): an irreversible single-key reject; an uninspectable bulk
  accept; draft steps that aren't a sequence; a buried ownership gap.

### P-B "The Analyst": library curator (BA)

- **Job.** Uploads policy and reference documents. Reviews extracted passages (keep, edit or
  exclude) against the original. Gets them approved.
- **Rhythm.** Long review bursts: 300–3,000 passages, often bilingual.
- **Needs.** A dense, calm reading surface. Progress and "where was I". The original beside the
  passage. Keyboard flow that doesn't fight the screen reader.
- **Frustrations** (from the review): about two rows visible; no progress; duplicate columns;
  engine jargon; save-bar overlap at zoom.

### P-C "The Owner": knowledge owner

- **Job.** Answers for specific documents. Approves, withdraws or replaces them, and
  re-confirms them when due.
- **Rhythm.** Mostly 2–5 minute check-ins.
- **Needs.** "What is mine and due", first. The dependants named before withdrawal. A clear
  summary at approval. To be told when nothing is due.
- **Frustrations** (from the review): four equal tables; a reminders entry that vanishes at
  zero; a generic withdrawal consequence; one-click re-approval.

### P-D "The Reader": Explorer, non-admin

- **Job.** A requirement author or other staff member checks which systems an offering's journey
  touches, often arriving from a link in requirement-portal, sometimes on a phone.
- **Needs.** The answer first. Plain words. Systems explained. A notice when a link is stale.
- **Frustrations** (from the review): "Table 2"; curator to-dos shown as alarms; dead acronyms; a
  silent scenario swap.

### Cross-cutting modifier: accessibility needs

Any of P-A to P-D may use a screen reader (NVDA on Windows), work keyboard-only, use 200–400%
zoom or Windows high-contrast mode, or prefer reduced motion. This is not a separate persona: it
is a condition every design must pass. It is weighted first by the user.

## 4. Jobs to be done (HYPOTHESIS)

1. *When a new policy or architecture document lands*, I want to turn it into reviewed,
   attributable knowledge quickly, *so that* requirement work can rely on it. (P-A, P-B)
2. *When I have five minutes*, I want to see only what needs **me** and finish one thing, *so
   that* nothing I own goes stale. (P-C, P-A)
3. *Before I withdraw, replace or publish*, I want to see who and what depends on it, *so that*
   I don't break requirement work silently. (P-C, P-A)
4. *When someone questions a fact*, I want to show where it came from (passage, version,
   release, person), *so that* trust holds. (P-A, P-B, auditors)
5. *During a long review*, I want to keep my place and pace without visual fatigue, *so that*
   my judgement on passage 700 is as good as on passage 7. (P-B, P-A)
6. *When I only read the catalogue*, I want the answer in plain words on any device, *so that* I
   can continue my requirement work. (P-D)

## 5. Opportunity areas

| # | Opportunity | Addresses | Phase |
|---|---|---|---|
| O1 | A **calm status language**: semantic danger, warning, success and info tokens, distinct from brand red, always with an icon and words, and one severity order | T1 | 4–5 |
| O2 | A **consistent help system**: a help entry in the same place on every page, `?` shortcut help, and a glossary with one term per concept | T2, T8 | 2 (content), 5 |
| O3 | A **focus and orientation contract**: focus `#main` or the h1 on route change, a disclosure primitive with focus-in and focus-return, `aria-disabled` with a reason | T3 | 2 (interaction), 5 |
| O4 | An **assistive-technology-safe keyboard model**: grid semantics for review tables, a modifier or application-mode strategy for single keys, announced changes, skip links per region | T4, T9 | 2, 5 |
| O5 | **Review coverage**: a seen/unseen state, progress, next flagged or unseen, an undo window, inspectable bulk actions with `via: bulk` recorded | T5 | 2, 3 |
| O6 | **"Yours first" queue**: one ranked next-decisions list shared by the shell and home, with a "mine" scope | T7 | 2 (IA), 3 |
| O7 | A **provenance trail and AI marker**: on every fact and change, who and where, with AI-proposed visibly distinct from human-approved | T6 | 2 (object model), 5 |
| O8 | **Modes made visible**: a draft workflow as a stepped flow, a distinct surface for non-service versions, stale-link notices | T10 | 2, 3 |
| O9 | **Plain vocabulary and a compact shell**: no metaphor terms, chrome under 15% of the viewport at 1280×800, reflow at 400% | T8, T4 | 2, 4 |
| O10 | **Bidi rules as components**: `<bdi>` per name in joined lists, `dir="auto"` on every input, logical CSS only | T11 | 2, 5 |

## 6. Top tasks (HYPOTHESIS)

These are derived from PRODUCT.md's rhythms and capabilities. The survey was not run, so
frequency × importance is estimated, not measured.

| Rank | Task | Persona | Rhythm | Benchmark task |
|---|---|---|---|---|
| 1 | See what needs me and open the most urgent item | P-C, P-A, P-B | check-in | T1 |
| 2 | Review a document's passages and approve it | P-B | burst | T2, T3 |
| 3 | Decide the AI suggestions in a draft (exceptions, then safe set) | P-A | burst | T5 |
| 4 | Check the consequence before publishing or withdrawing | P-A, P-C | both | T4, T6 |
| 5 | Give an unowned system to a squad | P-A | check-in | T8 |
| 6 | Trace a fact to its source | P-A, P-B | occasional | T7 |
| 7 | Read which systems an order journey touches | P-D | occasional | T9 |

## 7. Baseline metrics

| Metric | Baseline | Status |
|---|---|---|
| Task success, time on task, errors, SEQ, SUS | **Not measured** | The benchmark was not run (assumption mode). The kit stays ready in `plan.md` §7 and can be run any time before Phase 9 to give a real baseline. |
| Expert heuristic score (mean of 7 surfaces) | **23.3 / 40** (Library 19) | Measured [E] |
| Detector findings (static / live) | 0 / 2 real | Measured [E] |
| Chrome share of viewport at 1024×768 | about 30% | Measured [E] |
| Rows visible on passage review, 1440×900 | about 2 | Measured [E] |
| Tab stops before content: shell / catalogue index / draft galley | 9 / 32 / 44 | Measured [E] |
| Red used for status (code refs) | 22 | Measured [D] |
| Main JS bundle | 900.79 kB | Measured [D] |

## 8. UX targets (HYPOTHESIS for user metrics, firm for expert and technical ones)

The user metrics keep the brief's defaults until real research is run. They are **only
checkable** if a benchmark is run in Phase 6 or 9. Otherwise they are reported as "not
measured", never as met.

**User metrics:**

| Target | Value | Checked by |
|---|---|---|
| Task success, top tasks | ≥ 90% | Round 2 / final benchmark (user-run) |
| SEQ per task | ≥ 5.5 | same |
| SUS | ≥ 75 | same |
| Time on task, top tasks 1–5 | −30% vs baseline, **only if** a baseline is measured; otherwise reported as absolute times | same |
| Perceived calm / fatigue after 20 min | median fatigue ≤ 2 / 5 | Round 2 calm questions |

**Calm and accessibility targets (weighted first):**

| Target | Value | Checked by |
|---|---|---|
| Red for status, alerts, errors or diff | **0** uses; red ≤ 1 focal accent + logo/nav per view | Brand lint, critique |
| Status conveyed with icon + text | 100% of status instances | Critique, component tests |
| Text contrast | ≥ 4.5:1; UI boundaries and icons ≥ 3:1; both themes | Contrast matrix, axe |
| Focus after a route change | lands on `#main` or the h1, on 100% of routes | Playwright |
| Focus return on panel close | 100% | Component tests |
| Disabled-with-reason controls | 0 native `disabled` where a reason exists | Lint, tests |
| Consistent help entry | present at the same place on 100% of pages | Playwright |
| axe serious or critical violations | 0 on every redesigned route | Playwright + axe |
| Target size | ≥ 24×24px on 100% of targets (no reliance on the spacing exception for primary controls) | Audit |
| Reflow | no loss at 400% (320 CSS px); chrome ≤ 15% of the viewport at 1280×800 | Manual a11y kit |
| Motion | ≤ 200 ms; none under reduced motion | Code review |
| Screen-reader key collisions | 0 single-key shortcuts that fire in browse mode | NVDA script (Phase 6) |

**Expert and technical targets:**

| Target | Value | Checked by |
|---|---|---|
| Heuristic score | each surface ≥ 30 / 40, mean ≥ 32 / 40; H10 Help ≥ 3 and H7 Accelerators ≥ 3 everywhere | Impeccable critique, Phase 9 |
| Tab stops before primary content | ≤ 3 on every page (skip links) | Playwright |
| Passage review, 1440×900 | ≥ 10 rows visible in compact density | Visual spec |
| Bundle | main chunk ≤ 990.87 kB | Bundle budget |

## 9. What changes when real research arrives

- The theme ranks, personas and top tasks are re-derived from `raw/`, and the evidence counts
  become participant counts.
- Any target that research contradicts changes in STATUS.md, with the reason.
- The structural direction ("replace the grammar too") is re-tested in round 1 if sessions are
  run then.
