---
target: Library (redesign area 2)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\hp\\Projects\\knowledge-portal\\.claude\\worktrees\\cranky-lehmann-5d989a\\frontend\\src\\library"
timestamp: 2026-10-09T07-14-46Z
slug: frontend-src-library
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score — Library (area 2), run 1

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Progress line scrolls away; no per-row seen mark |
| 2 | Match system / real world | 3 | Raw parser cause copy; "Requirement proposals"; "Activate it…" |
| 3 | User control and freedom | 3 | "All shortcuts" navigates, scrolls to top, focus returns to masthead |
| 4 | Consistency and standards | 2 | 1 vs 2 flagged; n crosses 200-row page, j/End don't; title quote spacing |
| 5 | Error prevention | 3 | "Select 402 passages" one click from filters |
| 6 | Recognition rather than recall | 3 | Seen not visible per row |
| 7 | Flexibility and efficiency | 3 | j/k/End stop at the 200-row page |
| 8 | Aesthetic and minimalist design | 3 | 50% chrome on arrival; 8 rows at 1440×900 before scrolling |
| 9 | Error recovery | 2 | Failed read leads with a futile retry |
| 10 | Help and documentation | 3 | Help says End = last passage (goes to row 200); contact placeholder |
| **Total** | | **28/40** | **Good** |

Design specificity: specific (Calm Ledger: ledger rules, condensed numerals, maroon binding, red only logo/marker, rust/ochre states with icons, warm charcoal dark, split desk).
Deterministic scan: 0 findings (CLI, both targets; browser overlay on 5 pages; positive control fired).

## Priority issues
- [P1] 200-row paging breaks the keyboard and un-renders rows (place lost) — /impeccable harden
- [P1] Place lost around Help and seen status — /impeccable harden, /impeccable clarify
- [P1] Failed reads offer a futile retry and raw parser copy — /impeccable clarify
- [P2] Sticky pane slides under the masthead at the list end (2.4.11) — /impeccable harden
- [P2] Density on arrival (8 rows; Text column 356px) — /impeccable distill

## Persona red flags
- Alex: 200-row wall; no resume-at-next-unseen; seen is per tab; "All shortcuts" loses place.
- Sam: rows un-render under the cursor; pane heading obscured near the end; Help focus return; duplicate selection count; dark checkboxes look disabled.
- Analyst owner (800 passages): no visible seen trail; three "Show next 200"; seen shown at publish but not recorded (BG2); Versions jargon; raw CSV error.

## Minor observations
In-service document shown "Ready for review" while a newer version waits; "Being read 0" chip; labelled cells read as one phrase; search has no highlight/relevance cue; Return to service names no dependants; Ownership listbox shows unfocused.

## Questions to consider
Group 400 same-shaped rows for a sampled check? Why lead with retry for a deterministic error? Should "seen" appear at publish while it isn't recorded?
