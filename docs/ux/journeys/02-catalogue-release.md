# Journey 2: Catalogue release

**Persona:** the Architect.

**Goal:** turn architecture documents and the catalogue file into a trustworthy new catalogue
version, and put it in service knowing what changes for requirement work.

**Path:** sources → AI suggestions → changes → check → compare + mapping impact →
publish/activate.

## Current

| Stage | Actions | Thoughts and feelings (inferred) | Pain points | Evidence |
|---|---|---|---|---|
| Start a draft | Versions → "Start a new version" | — | The draft is just another version in the list | [E] |
| Add sources | The Sources page: upload documents, change requests, catalogue file | *Lots on one page.* | Four jobs stacked on one 3,300px page; the file replace sits between documents and suggestions | [E] |
| Reading | "Being read" | *How long?* | No progress, elapsed time or estimate | [E] |
| Decide suggestions | Galley grouped by system; j/k/Enter/a/r/e; bulk "Accept the 4 ready and the 10 that wait on them" | *Confident at first, anxious at speed.* | `r` rejects instantly and for good; the bulk set can't be seen (no Ready filter); proposals are never marked as AI; no confidence shown; the same identity question is asked twice; the next decision sits at the foot (y≈3187); 44 tab stops before the first row | [E][D] |
| Edit by hand | The draft's content pages (Systems…) with Edit | — | Hand edits live in the same 11-item sub-index as the workflow steps | [E] |
| Changes | Diff table by kind | *Is this everything?* | No values shown, only "Changed: where it sits"; no origin; removed rows are the quietest; the 18 undecided suggestions aren't mentioned | [E] |
| Check | Build for matching, compare samples | *Peak:* "Now also finds BSCS" | Results are lost on navigation (`useState`); 429 is handled | [E][D] |
| Publish | A reason, then publish (building first if needed) | *Is it safe?* | The samples' verdict and mapping impact are absent; can publish with 18 undecided needing only a reason; the 409 shows raw text; the build-then-publish loop runs in the browser tab | [E][D] |
| After | The version is in service | — | No recap of what was decided and by whom | [E] |

## Future (HYPOTHESIS)

The **Draft workspace** (Flow with steps). Its state line stays sticky throughout: "Draft
'October integration update' · 18 to decide · Not built · Not checked".

| Step | Actions | Intended experience | Patterns |
|---|---|---|---|
| 1 Sources | Add documents (multi-file), see each one read in the Jobs panel; the catalogue file is a separate card ("Import a catalogue file…" opens its own Compare before Replace) | One job per view | Flow · §6 · §5 |
| 2 Decide | A **Queue**: *Needs you* (exceptions) first, *Waits for…*, then **the ready set as one line**: "14 ready, safe to accept · Show them · Accept 14…". Each row is marked **Suggested** (stated or inferred), with its evidence quote docked. Decisions use the **6 s Undo** (`z`). Identity questions are merged: deciding "Is 'Dynamics CRM' BCRM?" resolves both rows. | Fast and safe; *a slip costs nothing* | Queue · Review desk · §3 · §4 · §9 |
| 3 Changes | **Compare**: counts by kind, then each change with **from → to** and **origin** (Suggestion by … · Hand edit · File); removed rows are visible, with icon and text | *I can see everything that goes in* | Compare · §9 · §10 |
| 4 Check | Build (a job, server-side) → samples → mapping impact: "3 requirements would map differently"; results kept for the session and marked stale if the draft changes | Evidence that carries into Publish | Compare · §11 |
| 5 Publish | The **consequence panel**: changes summary + mapping impact + check verdict + undecided count ("18 suggestions are still undecided; they won't be included") + "The version it replaces can be put back from Versions" + reason → "Publish and put in service" | *Reassured, informed* | §5 · §11 |
| After | An outcome page: "In service since 14:05 · 42 accepted (14 in bulk), 3 edited, 6 rejected, by Amina Owner · View changes" | A clear end | Flow outcome |
| Provenance | From any system in service: "Introduced in … · changed in … by …", then the diff, then the evidence | One step | §10 |

## Opportunities

| Opportunity | Rank |
|---|---|
| O8 Modes visible | 8 |
| O5 Coverage and undo | 5 |
| O7 Provenance and AI marker | 7 |
| O6 Next decision near the work | 6 |

**Backend gaps touched:**

- BG3 (reopen);
- BG4 (bulk marking);
- BG6 (check results);
- BG7 (client-side build-then-publish).
