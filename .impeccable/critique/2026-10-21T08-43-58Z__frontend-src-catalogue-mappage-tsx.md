---
target: changed catalogue/explorer screens (map, system links, offering plans/rules, information, editor fields)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/knowledge-portal/frontend/src/catalogue/MapPage.tsx"
target_fingerprint: "sha256:4264fd7470879fb0b75ebc4755b585d8dd36ea486107de32fb9f1537bcd1b03f"
target_path: /home/user/knowledge-portal/frontend/src/catalogue/MapPage.tsx
timestamp: 2026-10-21T08-43-58Z
slug: frontend-src-catalogue-mappage-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

Scope: catalogue map "How systems connect", system record Depends on / Used by, offering Plans tab, Business rules, portfolio line, explorer "Information it handles", new editor fields. Live seeded app with the SMB catalogue in service.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | "Show as table" toggle label never changes |
| 2 | Match system / real world | 3 | "Stated" used for two meanings |
| 3 | User control and freedom | 2 | Derived links: no action, no route to their source |
| 4 | Consistency and standards | 2 | Id fonts differ; "Edit the rules" next to Business rules edits Other rules |
| 5 | Error prevention | 2 | Hub checkbox silently clears another part's hub |
| 6 | Recognition rather than recall | 2 | "Known from" not linked |
| 7 | Flexibility and efficiency | 2 | 55-row table, no filter/sort; ?tab=plans lands above a tall diagram |
| 8 | Aesthetic and minimalist design | 2 | Map tangle; repeated plan source note; "How" column wraps |
| 9 | Error recovery | 2 | Not exercised (HYPOTHESIS) |
| 10 | Help and documentation | 3 | Question-title hint does not fit questions |
| Total | | 23/40 | Acceptable |

Detector: 0 findings over 12 files (exit 0). Overlay (CSP bypassed in test browser only): stragglers on cwom + governance (outside new sections), line-length x4 on explorer prose, edge-flush on swimlane names (false positive). axe: 0 violations on 6 pages. No text under 14px, no table overflow at 1280.

Priority issues:
- [P1] "Known from" names sources but cannot be opened; derived rows in a draft have no action. Fix: link interface/journey names in linkBasis; "Change it in its interface / journey" in the edit column.
- [P1] Sticky Save bar obscures focused fields in section editors (WCAG 2.4.11). Fix: scroll-padding-bottom = bar height on the editor scroll container.
- [P1] Hub checkbox acts as a radio and clears another part silently. Fix: one "The device it is built on" select/radio group at the top of the parts editor.
- [P2] "Stated" double meaning: legend "how it depends is not stated" vs curator-stated. Fix: legend "the kind of dependency isn't known".
- [P2] Plans table buries numbers: repeated source note, wrapping values, no tabular numerals. Fix: shared source once under caption, nowrap + numeral token, unit in header where uniform.

Minor: duplicate "Business internet bundles" in offering head; "Edit the rules" label; question-title field too narrow; "Depends on" sub-line repeats heading; F-id hint "OQ-01"; explorer prose lines 91–162 chars.
