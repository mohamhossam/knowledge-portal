---
target: catalogue mock-ups
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 4
target_identity: "file:C:\\Users\\hp\\Projects\\knowledge-portal\\.claude\\worktrees\\silly-dijkstra-0722d4\\frontend\\src\\design-lab\\catalogue"
timestamp: 2026-10-09T15-14-21Z
slug: frontend-src-design-lab-catalogue
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent), plus vercel-ui-guidelines and ui-ux-pro-max reviewers.

## Design health (Nielsen)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Current call not scrolled into the list; document title stuck on "Opening the knowledge portal" |
| 2 | Match with the real world | 3 | Two numbering systems on the journey footprint (system order vs call order) |
| 3 | User control and freedom | 2 | No fit/pan on the flow; lane labels scroll away |
| 4 | Consistency and standards | 2 | Link chips vs button chips; tab sets change per screen; disabled tabs look live |
| 5 | Error prevention | 3 | Find needs an exact name |
| 6 | Recognition rather than recall | 2 | Unexplained box counts; unlabelled lanes when scrolled |
| 7 | Flexibility and efficiency | 1 | 46 sequential tab stops; no step shortcuts; no filters |
| 8 | Aesthetic and minimalist design | 2 | Dead regions on every screen; faint link mesh; 9-item legend |
| 9 | Error recovery | 2 | One-line empty states |
| 10 | Help and documentation | 2 | Provenance strong; encodings unexplained |
| **Total** | | **21/40** | Acceptable |

## Priority issues
- [P0] Poster fixed at 1050px overflows its column (clipped on screen 3 at 1440, screens 1 and 3 at 1280).
- [P0] Global `.product` rule (styles/squads.css) shifts the Product band 16px into Customer.
- [P1] Link mesh unreadable at rest; routes share gutters, cross labels, vanish over the maroon spine.
- [P1] Dead space: product hero (309px), journey canvas (95% empty), half-empty bands, short inspectors.
- [P1] Journey flow: staircase canvas, lane labels not sticky, page double-scrolls.
- [P1] Two numbering systems on Product › Architecture.
- [P2] Layer tints indistinguishable; legend redundant. Product page reads as a datasheet. Navigation inconsistent; title not set.

## Detector
CLI: 4 `border-accent-on-rounded`, all false positives (tab underlines, CSS corner triangles). Live: band-count `small` at 0.75 opacity 3.9–4.4:1 (×5); lede line length ~95ch; poster flush/clipped on screen 3.
