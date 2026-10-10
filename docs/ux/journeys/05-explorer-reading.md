# Journey 5: Explorer reading

**Persona:** the Reader (a requirement author or other staff, not an admin), often arriving
from a link in requirement-portal, sometimes on a phone.

**Goal:** find out which systems take part when a customer orders an offering through a
channel, in plain words.

**Constraint (ADR-0101):** the reader sees the version in service only. Never drafts,
documents or history. Never any write.

## Current

| Stage | Actions | Thoughts and feelings (inferred) | Pain points | Evidence |
|---|---|---|---|---|
| Arrive from a link | `/explorer?product=…&order=…` | *Is this the right thing?* | A monumental "2", "Table 2:" and "Reading only: curating is for knowledge admins" | [E] |
| Stale link | `?product=nope` | *(unaware)* | Silently shows Business fibre bundle / New connection; the URL is unchanged (`scenario.ts:101-110`) | [E][D] |
| Choose | Offering, order type and channel selects | — | The default scenario isn't written to the URL | [E] |
| Read the answer | Scroll to "Systems in this order" | *Where's the answer?* | At 390 px it starts below the fold; the download sits above the answer | [E] |
| Understand systems | Read CWOM, RTF, eVEDA | *What are these?* | Dead text: no description, no link | [E] |
| Read the rest | 13 sections | *Lots of "not recorded".* | About 6 are empty; curator to-dos are in bold, read as alarms | [E] |
| Leave | The Requirement AI link | — | The no-access page (for other routes) sends readers away as its primary action | [E] |

## Future (HYPOTHESIS)

| Stage | Actions | Intended experience | Patterns |
|---|---|---|---|
| Arrive | A reader shell (logo, Help, account, Requirement AI); title "Product architecture explorer"; a one-line "what this shows" | Plain and light | Explorer layout |
| Stale link | A notice in the state line: "This link asks for 'nope', which isn't in the catalogue in service. Showing 'Business fibre bundle'." The URL is rewritten. | Trust | §7 |
| Choose | The three choices sit in one row (stacked at 390); the URL always reflects them | Shareable | — |
| Answer first | "**5 systems** take part when a small business orders a new fibre connection on the web": each system is expandable to one line of description and its capability (version in service) | The answer above the fold at 390 | §8 |
| Journey | The steps, by phase | — | — |
| More | "More about this offering" (folded): plans, rules and components; empty sections fold into "Not recorded yet: …" as one quiet line | No false alarms | §8 |
| Download | Secondary, at the end: "Download as a document" | — | — |

## Opportunities

| Opportunity | Rank |
|---|---|
| O9 Plain vocabulary | 10 |
| O8 Stale-link notice | 8 |

**Explorer targets:**

- T9 success of 90% or more;
- the answer is visible without scrolling at 390×844.
