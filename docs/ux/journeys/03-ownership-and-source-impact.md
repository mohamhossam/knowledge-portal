# Journey 3: Ownership change and source impact

**Personas:**

- **The Architect**, for system ownership.
- **The Owner and admins**, for document ownership and source impact.

**Goals:**

- Give every system in service a squad and a contact.
- Hand a document to a new owner.
- Understand which requirements a source change affects.

## Current

| Stage | Actions | Thoughts and feelings (inferred) | Pain points | Evidence |
|---|---|---|---|---|
| Notice a gap | Home Table 3 ("26 systems have no squad"), or the Squads notice | *How many? Which?* | The count isn't clickable; gaps sit about 3,000px down Products, and the first "Give" is 23 tab stops in | [E] |
| Give a system to a squad | "Give it to a squad" → select the squad and contact → save | *Which squad runs the neighbours?* | No suggested squad; the contact list ignores squad membership; 27 identical links make a wall | [E] |
| Confirm | The row lights; focus returns to the row | *Satisfying.* | History only says "Saved the squad Care squad" | [E] |
| Remove a squad | Edit panel → Remove | *What breaks?* | "One system has no other squad" isn't named; Remove looks like Save; focus is lost on Cancel | [E] |
| Transfer a document | Document → Ownership → choose a person → transfer | — | Unbounded radio list; history exists | [E] |
| Source impact | Document → Citations ("Who cites it") | *Is this complete?* | Covers only "requirements you can see" (correct), but the withdraw consequence doesn't reuse the count | [E][P] |

## Future (HYPOTHESIS)

| Stage | Actions | Intended experience | Patterns |
|---|---|---|---|
| Notice a gap | **Your work** › Gaps: "26 systems have no squad · Next: DCRM" → **Ownership › Gaps** (the default page) | One step from anywhere | Queue · Success signal "Yours first" |
| Give | In-place panel: Squad is a **combobox** with a **suggested squad** ("Sales squad runs 2 other systems in 'Partner channel'"); Contact is filtered to that squad's people, then everyone | One decision, with context | Queue · combobox · §1 |
| Next gap | After saving, focus moves to the next gap: "25 left" | Rhythm | §1 |
| Remove a squad | **Consequence panel**: "DCRM and BCRM will have no squad · Layla stops being their contact" → Remove (danger token + icon) | Named consequences | §5 |
| History | Each event links to its subject; the text says what changed when the API allows (BG5) | Provenance, honestly | §10 |
| Transfer a document | A person **combobox** with search; consequence: "Ravi will answer for its re-confirmations and reviews" | — | §5 |
| Source impact | **Cited by** tab: count + list with current/older edition + caveat; the same count feeds the Withdraw and Replace panels | Consistent numbers | §11 |

## Opportunities

| Opportunity | Rank |
|---|---|
| O6 Yours first | 6 |
| O3 Focus | 2 |
| O7 Provenance | 7 |

**Backend gap touched:** BG5 (organisation audit diff).
