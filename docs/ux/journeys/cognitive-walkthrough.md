# Cognitive walkthrough of the wireframes (Phase 3, step 2)

| | |
|---|---|
| Method | A cognitive walkthrough of each future-state journey in the wireframe lab (`/knowledge/design-lab/wireframes`), on the seeded fake stack, at 1440×900 (Explorer also 390×844). |
| Who did it | The redesign agent, as an expert walkthrough. **No participants were involved.** Findings are expert evidence, not user evidence (assumption mode). |
| How | Each step was driven live: keyboard-only where the journey is a burst, with focus and state read back from the DOM. |

At every step there are four questions:

- **Q1 Goal:** will the user try to achieve this effect?
- **Q2 Notice:** will they see that the action is available?
- **Q3 Associate:** will they connect the action with the effect?
- **Q4 Feedback:** will they see that progress was made?

"Fixed" means changed in the wireframes before round 1. "Open" goes into the round-1 tasks or the backlog.

## Journey 1: Library publication (the eligibility matrix, 404 passages)

| Step | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|
| Your work → "'Product eligibility matrix' is waiting for your review" → Review it | ✓ | ✓ | ✓ | ✓ | Route change focuses the h1 (verified). |
| Move through passages (`j`, `↓`) | ✓ | ✓ keys line | ✓ | ✓ "Seen N of 404" updates | Verified: `j`×3 → row 3. |
| Jump to what matters (`n`) | ✓ | ~ | ✓ | ✓ | Verified: `n` goes to the next flagged or unseen row. **Open (O-1):** when nothing has been seen yet, `n` behaves like `j`. Consider "next flagged first, then unseen". |
| Exclude with a reason (`x`, type, Enter) | ✓ | ✓ | ✓ | ✓ | Verified: `x` focuses the reason; Enter returns focus to the row; "1 unsaved". |
| Bulk-exclude the hidden sheet | ✓ | ~ | ✓ | ✓ | Select with Space or Shift+arrow → "Exclude N…" lists the set and takes one reason. **Open (O-2):** selecting a whole sheet by location ("select Sheet 2") isn't offered yet. |
| Read a table-row passage | ✓ | ✓ | ✗ | — | **Open (O-3):** table rows show the extractor's raw form, "A4=Bundle 003 \| B4=Enterprise". The content is real, but it should render as labelled cells. This feeds the component spec (Evidence/passage block). |
| Focus never hidden | — | — | — | ✓ | Verified: the focused row sat at 594–616 px, between the sticky top (114 px) and the save bar (838 px). |
| Save → Approve and publish | ✓ | ✓ | ✓ | ✓ | Approval states what it needs ("Save your review before approving.") and stays focusable (`aria-disabled`). The consequence panel shows the passages made citable, who cites the replaced version, and coverage. |
| Withdraw / Return to service (*Legacy ADSL ordering*) | ✓ | ✓ | ✓ | ✓ | Return to service shows the withdrawal's reason and requires a new one. Under *Requirement AI unreachable*, the count reads "unknown, not zero". |

## Journey 2: Catalogue release (*October integration update*)

| Step | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|
| Find the draft | ✓ | ✓ | ✓ | ✓ | Your work: "3 suggestions need a decision in the draft…". |
| Know where you are | ✓ | ✓ | ✓ | ✓ | The sticky state line reads "18 suggestions undecided (3 need you) · Not built · Not checked"; steps carry their state. |
| Decide (`a`, `r`) with Undo (`z`) | ✓ | ✓ | ✓ | ✓ | Verified: `r` → the row shows "Rejected · Undo (z)" plus an undo bar; `z` restores it. **Fixed:** focus now advances to the next row (it stayed on the pending row). **Fixed:** the undo bar no longer wraps a sentence in quotes. |
| Read why it was suggested | ✓ | ✓ docked pane | ✓ | — | Basis, possible match, the quoted line and the model show. **Open (O-4):** the quote marks the whole citation; the API gives `quote`, so line-level highlight is possible. |
| Accept the ready set | ✓ | ✓ | ✗ → ✓ | ✓ | **Fixed:** "Accept 14" was usable without seeing the 14. It now waits for "Show the 14" (interaction model §3) and says why. |
| Changes, with origin | ✓ | ✓ | ✓ | ✓ | Undecided suggestions are said to be left out. Origin is a heuristic in the lab. **Open (O-5):** it needs `change_history` per item. |
| Check (build, samples) | ✓ | ✓ | ✓ | ✓ | Under *Too many checks (429)* it fails in words. The result turns "out of date" after a later decision. |
| Publish | ✓ | ✓ | ✓ | ✓ | The consequence panel lists impact, undecided, built, and put-back. "Keep this tab open" shows when it is not built (BG7). |
| **Grid layout** | — | ✗ → ✓ | — | — | **Fixed:** the Decide rows overlapped (the Suggested mark ran into the sentence) because they reused the 4-column passage template. They now have their own 3-column template (verified: no overlap). |

## Journey 3: Ownership change

| Step | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|
| Find gaps | ✓ | ✓ | ✓ | ✓ | Ownership opens on Gaps: "27 systems in service have no squad or no contact." |
| Give a system to a squad | ✓ | ✓ | ✓ | ✓ | Verified: the panel focuses Squad; with no squad chosen it says "Choose a squad." and keeps focus there; after a save the count goes to 26 and **focus moves to the next gap**. |
| Suggested squad | ✓ | ~ | ✓ | — | Works when the system belongs to a product. **Open (O-6):** for systems in no product (e.g. *SMB App*) there is no hint at all. Say "No squad runs related systems" rather than show nothing. |

## Journey 4: Quick check-in

| Step | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|
| Arrive | ✓ | ✓ | ✓ | ✓ | "9 things need you", in sections by severity. |
| Trust the count | ✓ | ✓ | ✗ → ✓ | ✓ | **Fixed:** the rail said 12 and the queue said 9. The rail counted raw `ready_for_review` stages, which include published documents. Both now read one shared priority function (`queue.ts`); verified 9 = 9. |
| Nothing due | ✓ | ✓ | ✓ | ✓ | "No re-confirmations are due." is said in the section and on Re-confirmations ("Nothing is due."). The *Re-confirmations due* scenario adds simulated items, marked "Simulated". |
| Return after acting | ✓ | ✓ | ✓ | ✓ | The rail entry for "Your work" stays one step away; route focus works. |

## Journey 5: Explorer reading (reader, 390 px)

| Step | Q1 | Q2 | Q3 | Q4 | Notes |
|---|---|---|---|---|---|
| Arrive (reduced shell) | ✓ | ✓ | ✓ | — | No rail, Help present. |
| Stale link `?product=nope` | ✓ | ✓ | ✓ | ✓ | The notice names what was asked for and what is shown. **Fixed:** the URL is now rewritten with `replace` (verified: `product=business-fibre`). |
| Answer first | ✓ | ✓ | ✓ | — | Verified: the answer heading sits at y=635 of 844 at 390 px, even under the lab bar. No sideways scroll. |
| Understand a system | ✓ | ✓ | ✓ | ✓ | Each system expands to its description and capability. |

## Cross-cutting

| Finding | Status |
|---|---|
| Focus calls used `requestAnimationFrame`, which doesn't run in background or hidden tabs. Row focus failed in the hidden browser pane. | **Fixed:** a `useFocusAfterRender` effect replaces all 9 calls; re-verified. |
| Quotes inside `<bdi>` put the quote mark on the wrong side for Arabic titles. | **Fixed:** quotes now sit outside the isolate (`'<bdi>title</bdi>'`), in 15 places. |
| `--wf-sticky-top` was written by both the shell and the page state lines. | **Fixed:** split into `--wf-sticky-top` and `--wf-sticky-state`; the document's scroll padding sums them. |
| "Accept with edits" (`e`) only announces in the lab. | **Open (O-7):** the full editor arrives at hi-fi (Phase 6). The wireframe's job is the flow, and the round-1 tasks avoid it. |

## Open items carried forward

O-1 … O-7 go to `docs/redesign/backlog.md` when it exists (Phase 7). Until then they stay here
and in STATUS.md. Round 1 tests the labels the tree test would have (GATE 2b, assumption mode):

- "Decide";
- "Re-confirmation";
- "Ownership";
- "Cited by";
- Jobs as a utility.
