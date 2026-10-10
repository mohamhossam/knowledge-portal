---
name: redesign-area
description: Implement one knowledge-portal area from its validated plan with Impeccable, Pro Max and Vercel guidelines under the approved e& calm design system. Use only when explicitly invoked.
argument-hint: <area name + routes/files>
disable-model-invocation: true
---
Implement: $ARGUMENTS

Preconditions — stop if missing: PRODUCT.md, new DESIGN.md, docs/design-system.md, docs/ux/interaction/
model.md, docs/ux/content/, an approved plan in docs/redesign/plans/, clean tree on
feat/kb-redesign/<area> created from feat/kb-redesign.
Read first: the plan, its validated prototype in /design-lab, matching findings in docs/ux/testing and
docs/redesign/backlog.md, decisions in STATUS.md. Before editing, LIST every file you will touch and
confirm scope with me (CLAUDE.md).

Authority: the validated prototype and interaction model define the UX; Impeccable resolves gaps; only
design-system components and semantic tokens (never e& primitives directly); Pro Max may PROPOSE new
specs/tokens (needs my approval); Vercel skills win on code. Never change auth gates (knowledge_admin;
Explorer read-only), API contracts or backend files.

Pipeline — in order, never skip:
1. /impeccable:impeccable craft the area to match the validated prototype using design-system
   components; charts → ui-ux-pro-max chart guidance with the calm chart palette.
2. /impeccable:impeccable harden — long and mixed Arabic/English strings, empty/missing data, API errors,
   job failure/retry/cancel, permission denied, slow network.
3. /impeccable:impeccable clarify — copy per docs/ux/content; glossary terms only; calm tone.
4. /impeccable:impeccable adapt — 1280/1440/1920 (Explorer also 390); keyboard map and focus
   management per the interaction model; focus never obscured.
5. /impeccable:impeccable quieter if any view breaks the calm rules.
6. FOUR read-only reviewers in parallel (one message), each `file:line — severity — finding — fix`:
   a. vercel-react-best-practices + vercel-composition-patterns (TanStack Query, re-renders, bundle)
   b. web-design-guidelines
   c. UX + brand conformance: matches prototype, interaction model, content guide and glossary;
      semantic tokens only (no raw values, no direct e& primitives); dark/density parity; bidi;
      e& calm rules (red only as brand accent ≤ 1 focal use + logo/nav, never for status; proportion
      rule; no gradients/glass/saturated fills; motion ≤ 200 ms)
   d. ui-ux-pro-max pre-delivery checklist (contrast, focus, reduced motion, 24px targets, SVG icons)
7. Fix all CRITICAL/HIGH; log MEDIUM/LOW in docs/redesign/backlog.md.
8. Verify: npm run lint, typecheck, test, api:check, build; component axe tests; Playwright a11y and
   visual specs for this area on the seeded stack; bundle budget; acceptance criteria from the plan.
9. /impeccable:impeccable critique the area on the live seeded stack (CLAUDE.md); fix findings.
10. Report in AGENTS.md §20 format with before/after screenshots. Do NOT commit — wait.
