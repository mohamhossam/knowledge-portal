---
target: area 1 shell + Your work
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\work\\YourWork.tsx"
target_fingerprint: "sha256:604e3824f7ba3267b638696556446a9c279829ca1492cc3999e5049e9ee0a371"
target_path: "C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\work\\YourWork.tsx"
timestamp: 2026-10-08T07-38-44Z
slug: frontend-src-work-yourwork-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

Target: area 1 — app shell (masthead, rail, Jobs/Help/Account panels) and Your work, live seeded stack. Scored BEFORE the post-critique fixes listed at the end.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Shared priority function, per-section skeleton/failure; no freshness or age per item |
| 2 | Match system / real world | 3 | Plain domain words; "Gaps 1" stood for 27 systems |
| 3 | User control and freedom | 3 | Non-modal panels, Esc returns focus, scope and help in the URL |
| 4 | Consistency and standards | 2 | Help listed arrow keys the list lacks; "Open the document" vs Jobs' "Upload a new version"; legacy island look |
| 5 | Error prevention | 3 | Unknown never shown as 0 |
| 6 | Recognition rather than recall | 3 | Actions named with their subject; names buried mid-sentence |
| 7 | Flexibility and efficiency | 2 | Shortcuts opt-in; no ordering by age; no chaining |
| 8 | Aesthetic and minimalist | 3 | Calm; repeated phrasing; actions far from text at wide screens |
| 9 | Error recovery | 3 | "Couldn't read X. Try again" with focus return |
| 10 | Help and documentation | 3 | Same place on every page, page-aware, deep-linkable; contact a placeholder |
| **Total** | | **28/40** | **Good** (baseline Home 23/40; target ≥ 30) |

Design specificity: half-authored — voice, ledger rule, maroon binding and red discipline are the product's own; the frame (masthead + rail + sentence rows) is category-generic; home lacks the ledger table, condensed numerals and AI provenance mark.

Deterministic scan: 0 findings in Shell.tsx, YourWork.tsx, panels.tsx, layout.tsx; live detector on /, /library, /?help=shortcuts: "No anti-patterns found".

Priority issues:
- [P1] Everyone's scope said "waiting for your review" for colleagues' documents — FIXED (owner named, section title scope-aware).
- [P1] No basis for triage — PARTLY FIXED (reviews oldest first, "since {date}"); a ledger-table queue with size/flags/impact is open.
- [P1] "Need you" count inflated by the gaps backlog — FIXED (gaps listed with their true number, kept out of the count).
- [P2] Help claimed arrow keys the list doesn't have — FIXED (claim removed; every action is a tab stop per the a11y reviewers).
- [P2] Wide-screen eye travel; failed-read action label — FIXED (queue measure 72rem; action reads "Upload a new version").

Persona red flags: Alex — shortcuts opt-in, no sort/chain; Sam — list label duplicated its section (fixed), scope toggle not announced; Curator — no "since you last looked".
