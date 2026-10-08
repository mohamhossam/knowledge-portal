---
target: area 1 shell + Your work (re-score)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\work\\YourWork.tsx"
target_fingerprint: "sha256:604e3824f7ba3267b638696556446a9c279829ca1492cc3999e5049e9ee0a371"
target_path: "C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\work\\YourWork.tsx"
timestamp: 2026-10-08T08-53-37Z
slug: frontend-src-work-yourwork-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent). Re-score after the first critique's fixes.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Honest per-section states; every row shows the same absolute date, nothing says what is new |
| 2 | Match system / real world | 3 | "8 things need you" next to heads of 1/7/0/27 (gaps not counted, said only in Help) |
| 3 | User control and freedom | 3 | Esc/close return focus; nothing can be done in the queue itself |
| 4 | Consistency and standards | 2 | Queue keyboard differs from interaction model §2.2; same failure styled differently in Jobs and Your work; drawers end mid-page |
| 5 | Error prevention | 3 | Unknown never 0; "try reading it again" offered with no control |
| 6 | Recognition rather than recall | 2 | Subject buried mid-sentence; six identical "Review it"; nothing to triage by |
| 7 | Flexibility and efficiency | 2 | No list keys, sort, bulk or review→next; a sentence list where a dense queue is wanted |
| 8 | Aesthetic and minimalist | 3 | Calm, single primary; repeated sentence frame; empty sections at full size |
| 9 | Error recovery | 3 | Specific cause; retry focuses the repaired section |
| 10 | Help and documentation | 3 | Same four parts everywhere; contact unnamed |
| **Total** | | **27/40** | **Acceptable/Good boundary** (previous run 28/40; baseline 23/40) |

Design specificity: shell clearly authored (maroon binding, red seal, ledger rule); the Your work body reads as a generic task list — no ruled table, tabular numerals or provenance.

Deterministic scan: 0 findings in the four source files; live detector 1 finding on /, /?scope=everyone, /?help=shortcuts — `tight-leading` on the one-line primary button label (likely false positive: rule targets wrapping body text).

Priority issues:
- [P1] Decision rows can't be triaged or scanned (subject mid-sentence, same date on every row, CTA far from subject) — layout, clarify
- [P1] Counts contradict (8 vs 1/7/0/27) — clarify
- [P2] Queue keyboard model differs from interaction model §2.2 (one tab stop + arrows); no review→next — harden
- [P2] "try reading it again" with no control; failure styled differently in Jobs vs Your work — polish
- [P2] Flat hierarchy, empty sections and "At a glance" take full bands — distill
- [P3] Masthead and rail wrap at 594–800px; rail 3 rows at 390 — adapt
