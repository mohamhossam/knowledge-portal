# IA validation kit — tree test and open card sort

Phase 2 · Define. The kit for **GATE 2b**. The tree test validates the proposed navigation in
`navigation.md` with 10 tasks. Run it unmoderated in any tree-testing tool, or moderated with
the text tree below on paper or screen.

- **Participants:** 8–15 admins plus 3–5 readers (for task 10). Use the same anonymisation as
  `../research/plan.md` §3.
- **Duration:** about 10 minutes.

## 1. The tree (labels only, no descriptions, no icons)

```
Your work
  Needs attention
  Decisions waiting on you
  Re-confirmations due
  Gaps
Library
  Documents
    {a document}
      Review
      Versions
      Cited by
      Ownership
  Search passages
Catalogue
  Systems
    {a system}
  Capability and landscape areas
  Offerings
    {an offering}
  Journeys
    {a journey}
  Channels
  Governance
  Versions
    Compare versions
    {a draft}
      1 Sources
      2 Decide
      3 Changes
      4 Check
      5 Publish
    {a replaced version}
Ownership
  Gaps
  Products and systems
  Squads
  People
  History
Requirements
  Overview
  Requirements
  Findings
  Historic requirements
Explorer
Jobs
Help
  Keyboard shortcuts
  Glossary
```

## 2. Tasks

Scenarios use plain words that don't repeat the target label. Present them in random order.
Task 10 is for readers.

| # | Scenario (read to participant) | Correct destination(s) | Tests |
|---|---|---|---|
| 1 | "You have five minutes before a meeting. Where would you see what's waiting for you?" | Your work (any child) | The queue as landing |
| 2 | "A colleague uploaded a pricing policy yesterday and asked you to check what the system read from it before it's used. Where do you go?" | Your work › Decisions waiting on you · Library › Documents › {a document} › Review | Review entry |
| 3 | "Before taking an old document out of use, you want to know which requirements rely on it." | Library › Documents › {a document} › Cited by | "Cited by" label |
| 4 | "Someone says the catalogue's description of the billing system is wrong. Where do you check what it says today?" | Catalogue › Systems › {a system} | In-service catalogue |
| 5 | "An architecture document was processed and the system proposed new systems and links. Where do you accept or reject them?" | Catalogue › Versions › {a draft} › 2 Decide | Draft workspace, "Decide" |
| 6 | "You want to know how requirement mappings would change if the new catalogue goes live." | {a draft} › 4 Check (also 3 Changes or 5 Publish is a partial) | Mapping impact placement |
| 7 | "A system has nobody responsible for it. Where do you fix that?" | Ownership › Gaps · Your work › Gaps | "Ownership", "Gaps" |
| 8 | "A document you own must be confirmed as still correct every six months. Where do you see when it's due?" | Your work › Re-confirmations due | "Re-confirmation" vs review |
| 9 | "Reading a file has been running for a while. Where do you see whether it finished or failed?" | Jobs · (partial: the document under Library) | Jobs utility |
| 10 | (Reader) "You're writing a requirement for business fibre and want to know which systems take part when a customer orders it." | Explorer | Explorer findability for readers |

## 3. Metrics per task

| Metric | Definition | Target (HYPOTHESIS) |
|---|---|---|
| **Success** | Ends on a correct destination | ≥ 80% per task; ≥ 85% overall |
| **Directness** | Reached the destination without backtracking | ≥ 70% |
| **First click** | The first top-level choice was on a correct path | ≥ 80% |
| **Time** | The median, in seconds | Reported, with no target |
| **Confidence** | 1–7 after each task (optional) | ≥ 5 |

**Decision rule:**

- A task under 70% success, or with first-click under 60%, **fails**. The labels or groupings
  on its path are revised and noted in `navigation.md`.
- If 3 or more tasks fail, the area structure itself is revisited before Phase 3.

## 4. Optional open card sort (15–20 min, 6–10 admins)

These cards are object and task labels from `object-model.md`, written neutrally. The
participant groups and names the groups.

- Upload a document
- Review read passages
- Approve a document
- Take a document out of use
- See who cites a document
- Search published text
- Hand a document to a colleague
- A system's description
- Links between systems
- Product offerings
- Order journeys
- Sales channels
- Start a new catalogue version
- Accept or reject proposed changes
- See what a new version changes
- Check impact on requirements
- Publish a catalogue version
- Go back to an earlier catalogue version
- Squads
- People
- Systems with no team
- Change history
- Duplicate or conflicting requirements
- Past requirements from BRDs
- Running and failed background work
- Things due for confirmation
- Keyboard shortcuts

**Analysis.** A similarity matrix (the percentage of participants who placed each pair
together) plus a list of group names. Compare it with the proposed tree: pairs above 60% that
the tree splits are flagged.

## 5. Analysis template

`docs/ux/testing/tree-test-results.csv`, one row per participant × task:

```
participant_id,role,task,success,direct,first_click_path,final_path,time_s,confidence_1to7,notes
```

Summary table (fill in after the run):

| Task | n | Success % | Direct % | First-click % | Median s | Verdict | Change made |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| … | | | | | | | |

In **assumption mode** no numbers are filled in. The IA stays HYPOTHESIS, and its riskiest
labels are listed for round 1 instead:

- "Decide";
- "Re-confirmation";
- "Ownership";
- "Cited by";
- Jobs as a utility.
