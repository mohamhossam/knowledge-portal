---
target: area 1 shell + Your work (ledger queue)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\work\\YourWork.tsx"
target_fingerprint: "sha256:ddb1e98c337c8aaa997c569bb12caf11da32b25c726c65b2241f497f90858dfa"
target_path: "C:\\Users\\hp\\Projects\\knowledge-portal\\frontend\\src\\work\\YourWork.tsx"
timestamp: 2026-10-08T09-19-21Z
slug: frontend-src-work-yourwork-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent). Re-score after the ledger-queue rebuild.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Strong states; no "as of" on the queue |
| 2 | Match system / real world | 3 | "Standing backlog", "Also clear", "Size" read as system-speak |
| 3 | User control and freedom | 3 | Scope in URL, Esc returns focus |
| 4 | Consistency and standards | 2 | One failure, three remedies on three surfaces; "Document"/"Item", "Since"/"Waiting" drift; legacy island look |
| 5 | Error prevention | 3 | Read-only page |
| 6 | Recognition rather than recall | 3 | Remedy is prose to carry to another page; shortcut keys in one <kbd> |
| 7 | Flexibility and efficiency | 2 | No acting from the queue; no sort/filter; re-confirmations land on a generic page |
| 8 | Aesthetic and minimalist | 3 | Calm Ledger applied well; "none" ×6, a column of "today" |
| 9 | Error recovery | 2 | Plain cause, but neither remedy can be done here; Jobs lacks Retry |
| 10 | Help and documentation | 3 | Same four parts everywhere; contact unnamed |
| **Total** | | **27/40** | Acceptable/Good boundary (runs: 28, 27, 27; baseline 23) |

Design specificity: ~80% specific — clearly the Calm Ledger (ruled sections, condensed numerals, maroon binding, red only as seal). Previous runs' P1s (sentence rows, contradicting counts) no longer raised.

Deterministic scan: 0 findings in five source files; live detector: `edge-flush-cards` on the Decisions table wrapper (false positive: a scroll container, cells inset 12px).

Priority issues:
- [P1] Failed-read remedy told but not offered; three wordings across Your work, Jobs and the legacy Library — clarify, harden
- [P2] Dark-to-light switch on legacy routes includes the rail — polish
- [P2] Overflowing table wrap can't be scrolled by keyboard at narrow widths (WCAG 2.1.1) — adapt
- [P2] "Most urgent first" sorts by age only; dates only in a tooltip — clarify
- [P3] Masthead wraps at 800px; "none" ×6; one <kbd> per key — polish
