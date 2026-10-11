# Journey 1: Library publication

**Persona:** the Analyst (reviews passages) and the Owner (approves and withdraws).

**Goal:** turn an uploaded policy into reviewed, published passages that requirement work can
cite. Later, withdraw or replace it with its dependants in view.

**Path:** upload → scan → review blocks → approve → index preview → activate → withdraw or
replace.

## Current

| Stage | Actions | Thoughts and feelings (inferred) | Pain points | Evidence |
|---|---|---|---|---|
| Upload | "Add a document" section at the foot of Library; choose a file | *Where does it go now?* | The upload sits below the table, and nothing says how long reading will take | [E] |
| Scan and read | Wait; the row shows its stage; the processing line is on the document page | *Is it stuck?* | No elapsed time, and no portal-wide place for jobs; "Being read" only | [E][D] |
| Failed reading | "Extraction failed" in red, then "Read it again" | *Alarm.* | Red is used as status; a retry won't fix a delimiter error; the real fix (upload a new version) is elsewhere | [E] |
| Review blocks | Passage table: j/k, x/i/e/o; filters; the original preview | *This is long… where was I?* | About 2 rows visible at 1440×900; every row starts as "Kept"; no seen state or progress; duplicate columns in a first edition; engine locations ("Worksheet 1!2:2"); single keys clash with screen readers | [E] |
| Exclude a hidden sheet | Exclude row by row, each with a reason | *Tedious.* | No bulk exclude, and no "next flagged" | [E] |
| Save the review | The sticky save bar, with a summary field | — | The save bar overlaps the focused row at 175% zoom; the placeholder contrast is 4.4:1 | [E] |
| Approve and publish | One click | *Did it work? What went live?* | No consequence summary (what goes live, who cites the edition it replaces); no peak moment | [E] |
| Index preview and activate | "Search versions" tab, "Build a table-aware version", activate | *What's a table-aware version?* | Jargon; also offered on a Markdown file with no tables | [E] |
| Withdraw | The withdraw panel, with a reason | *Who will this break?* | The consequence is generic, with no count; focus is lost on open and on close | [E] |
| Re-publish a withdrawn document | "Approve and publish" is enabled | *(nothing; easy to do by accident)* | One-click return to service, with no framing or reason | [E][D] |
| Replace | Upload a new version from the head | — | Approving a replacement shows no dependants | [E] |

## Future (HYPOTHESIS)

| Stage | Actions | Intended experience | Patterns |
|---|---|---|---|
| Upload | The **Upload drawer** from Documents: drop files, see the scan, the reading and the elapsed time, then "Open the review" | One place, and a clear next step | Flow · Jobs §6 |
| Scan and read | The state shows at the row and in the **Jobs panel**; you can leave the page | *I can do something else.* | §6 |
| Failed reading | "Needs attention: couldn't read the CSV (columns not separated by commas). **Upload a new version** · Try reading again". Danger tone with an icon. | The cause and the fix together | §6, §7 |
| Review | The **Review desk**: a compact head; progress ("0 of 404 seen · 3 flagged"); a grid with the detail docked beside it at 1440 or wider; one text column until the text differs; locations in words ("Sheet 'Internal', row 2") | *I always know how far I am.* | Review desk · §2 · §12 |
| Exclude a hidden sheet | Select the sheet's rows (a group select by location), "Exclude 4…", see the 4 listed, give one reason | Bulk, but inspectable | §3 |
| Next flagged | `n` goes to the next flagged or unseen row | The burst keeps its rhythm | §2 |
| Save | `Ctrl+Enter`; the save bar grows only when there are problems; measured padding | Focus is never hidden | §1.1 |
| Approve and publish | The **consequence panel**: "Publishing makes 400 passages citable · replaces version 1, which 7 requirements cite · you looked at 404 of 404 (3 flagged opened)" | A peak with reassurance | §5 · §11 |
| Search build | "Search build: better results for tables. Preview → Activate", offered only when the file has tables | No jargon | glossary |
| Withdraw | The consequence panel: "7 requirements cite it (named) · they will be asked to retain or revise in Requirement AI · you can return it to service later" | The consequence before the commit | §5 · §11 |
| Return to service | "Return to service…", which shows the withdrawal (who, when, why) and asks for a reason | It is never accidental | §5 |
| Replace | Upload a new version, review it (only the differences are highlighted), then approve with its dependants shown | | §11 |

## Opportunities

These map to the synthesis.

| Opportunity | Rank |
|---|---|
| O5 Review coverage | 5 |
| O3 Focus contract | 2 |
| O1 Calm status | 1 |
| O4 Assistive-technology-safe keys | 4 |
| O9 Compact chrome | 10 |

**Backend gaps touched:** BG2 (coverage is not stored at approval).
