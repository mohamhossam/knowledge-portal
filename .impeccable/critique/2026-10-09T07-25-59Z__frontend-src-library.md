---
target: Library (redesign area 2)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\hp\\Projects\\knowledge-portal\\.claude\\worktrees\\cranky-lehmann-5d989a\\frontend\\src\\library"
timestamp: 2026-10-09T07-25-59Z
slug: frontend-src-library
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score — Library (area 2), run 2 (after the run-1 fixes)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | "Seen" counts any row passed through; the publish panel reports it as "You looked at…" |
| 2 | Match system / real world | 3 | "Requirement proposals citing it"; "Published 2" mixes the tables index; three numbers per passage |
| 3 | User control and freedom | 3 | Unsaved review lives in memory only; "Stay and save" doesn't save |
| 4 | Consistency and standards | 3 | Tab switches focus the h1, not the panel heading; "Ownership" tab vs rail area |
| 5 | Error prevention | 3 | Library-level retry bar offered for a deterministic error |
| 6 | Recognition rather than recall | 3 | Dense keys line; (fixed after this run: Help no longer collapses the desk) |
| 7 | Flexibility and efficiency | 3 | x + reason + Enter stays on the row; no "exclude and next" |
| 8 | Aesthetic and minimalist design | 3 | At 1280×800 the grid starts ~430 px down |
| 9 | Error recovery | 3 | Fix-first, honest copy; raw reader message quoted without plain words |
| 10 | Help and documentation | 3 | Help complete; contact placeholder |
| **Total** | | **30/40** | **Good** |

Deterministic scan: 0 findings (CLI both targets; overlay incl. the desk scrolled with sticky pane and save bar stuck, and the Withdraw panel open).

## Priority issues
- [P1] Help and Jobs drawers docked beside the page broke the split desk — FIXED after this run (drawer overlays on the desk; focus returns to "All shortcuts"; no scroll jump)
- [P1] "Reviewed means seen" is weak (pass-through counts as seen) and drafts aren't kept safe — /impeccable harden (backlog)
- [P2] Too much above the grid at 1280×800 — /impeccable distill (backlog)
- [P2] Focus deviations: tab switch to h1; sticky column head partly covers the row moving up; x+Enter stays; n wrap silent — /impeccable audit (backlog)
- [P2] Retry offered where it can't help (library bar, Your work) — /impeccable clarify (backlog)
- [P3] Terminology (proposals, Published 2, knowledge admin case) — /impeccable clarify (backlog)
