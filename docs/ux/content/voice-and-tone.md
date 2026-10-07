# Voice and tone — knowledge portal

Phase 2 · Define. This guide uses the voice-framework structure from ui-ux-pro-max:brand. It is
constrained by:

- PRODUCT.md (a curation desk; nothing published unreviewed; content keeps its language);
- the e& calm brand commitment;
- `../interaction/model.md` §15 (calm feedback).

**HYPOTHESIS:** this is not tested with users. Round 1 and round 2 check comprehension.

## Position on the spectrums

```
Formal   ――――――●――――――――  Casual        plain and professional; no slang, no legalese
Simple   ――――●――――――――――  Complex       plain words; domain terms only from the glossary
Serious  ――●――――――――――――  Playful       serious about consequences, never grave
Reserved ――●――――――――――――  Expressive    calm; no exclamation marks, no celebration
```

## We are

| Trait | What it means | Do | Don't |
|---|---|---|---|
| **Calm, not alarmed** | We report states, even failures, steadily. Severity comes from the words, icons and position, not from shouting. | "Couldn't read the file. The columns aren't separated by commas." | "Error! Extraction failed!!" · "Uh-oh" |
| **Exact, not technical** | We say precisely what happened and to what, in the curator's words. | "Sheet 'Internal', row 2" · "7 requirements cite it" | "Worksheet 1!2:2" · "A2=Bundle 001 \| B2=SMB" · `knowledge_admin` |
| **Consequence first** | Before any commit, we say what will happen, then who it affects, then the button. | "Requirement work can no longer cite this document. 7 requirements cite it now." | "Are you sure?" |
| **Accountable** | We name people and versions. Provenance is part of the sentence. | "Approved by Amina Owner on 8 Oct · from version 2" | "Approved" · "Updated recently" |
| **Respectful of the reader's time** | One idea per sentence, verb first in actions, no filler. | "Give DCRM to a squad" | "Click here to proceed with assigning a squad to this system" |
| **Honest about the machine** | AI proposes; people decide. We never overstate the model, and never hide it. | "Suggested from 'Integration design', line 7 · inferred, not stated" | "AI-powered insight ✨" · an unmarked suggestion |

## We sound like

- "3 things need you."
- "Nothing else needs you. No re-confirmations are due until 3 Nov."
- "18 suggestions are still undecided. Publishing leaves them out."
- "Reading finished: 'Product eligibility matrix' is ready for review."
- "This link asks for 'nope', which isn't in the catalogue in service. Showing 'Business fibre
  bundle'."

## We don't sound like

- **The timetable metaphor:** "Table 3", "the edition in force", "There is no table at this
  address".
- **Engine words:** "chunk", "fingerprint", "lease", "revision 5", "table-aware version".
- **Marketing:** "Supercharge your curation", "AI magic".
- **Alarm:** "Warning!", "Critical!", or red text with no icon.
- **Blame:** "You entered an invalid value."
- **Hollow reassurance:** "Every requirement is indexed" when there are 0.

## Tone by context

| Context | Tone shift | Example |
|---|---|---|
| Your work (check-in) | Brief, warm-neutral | "3 things need you. Start with: 'Product eligibility matrix' is waiting for your review." |
| Review desk (burst) | Terse, out of the way; status words only | "Seen 212 of 404 · 3 flagged" |
| Consequence panel | Plain, serious, specific | "Publishing puts this version in service at once. 3 requirements would map differently." |
| Job failure | Steady, practical: cause and fix | "Couldn't build the search index. The service timed out. Try again." |
| Empty state | Explanatory, a quiet invitation | "No documents yet. Upload a policy or reference document to review it before requirement work can cite it." |
| Success | Minimal | "Saved." · "Withdrawn." |
| Reader (Explorer) | Plain-language guide; no curation vocabulary | "5 systems take part when a small business orders a new fibre connection on the web." |
| Permission | Factual, with a way forward | "You're signed in as Omar Observer. Curating needs the Knowledge admin role. You can read the product architecture explorer." |

## Sample rewrites (from today's UI)

These are the real strings found in the Phase 1 critique.

| Before | After |
|---|---|
| "There is no table at this address" | "We couldn't find that page" + the address + links to the 5 areas |
| "Knowledge portal: the tables in force" | "Your work" |
| "Edition 'Initial catalogue' in force" | "In service: 'Initial catalogue'" |
| "The last change: save person, by Amina Owner." | "Last change: Amina Owner updated Rana Aziz (inactive) · 21:11" |
| "Every requirement is indexed, and no finding stands open." (at 0) | "No requirements yet. They appear here once Requirement AI holds some." |
| "Build a table-aware version" | "Build a search index for tables" |
| "Systems no product names" | "Systems not in any product" |
| "1 needs attention" (red, lighter than "due") | "1 needs attention" (danger icon + bold) · "18 to decide" (regular) |
| "edit the draft by hand in the next edition of the portal" | Removed (hand edits ship now) |
| "Go to Requirement AI" (primary, for readers) | "Read the product architecture explorer" (primary) · "Requirement AI" (secondary) |
| Raw 409 server text on Publish | "Someone changed this draft while you were here. Reload to see their change; your reason stays." |

## Mechanics

- **Sentence case** everywhere, including buttons, headings and labels.
- **Actions start with a verb and name their object** when it isn't obvious: "Withdraw
  'XGPON coverage rules'". Buttons have no "OK" or "Yes".
- **Numbers:** digits always ("3 things", not "three things"). Thousands separators in the UI
  ("1,204"). Tabular figures in tables.
- **Dates:** "8 Oct" within the current year; "8 Oct 2025" otherwise; times in 24-hour format,
  "14:05". Relative times only under 1 hour ("12 min ago"), with the exact time in the `title`
  and the visible text on focus.
- **Names of content** are quoted in single quotes in sentences, and isolated with `<bdi>`.
- **No exclamation marks, no emoji, no ALL CAPS** (eyebrows stay sentence case).
- **Ellipsis "…"** only on actions that open a further step ("Withdraw…") and on loading text.
- **"You" and "your"** for the curator. People are named. We don't say "the user" or "admin"
  when there is a name to use.
- **Interface language:** English. Content keeps its own language and direction.
