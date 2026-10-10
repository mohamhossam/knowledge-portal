# Usability test, round 1: low-fidelity wireframes

- **Phase:** 3, step 3, the kit for **GATE 3**.
- **What is tested:** the *structure and behaviour* of the redesign (IA, interaction model,
  content) on greyscale wireframes. Colour, type and brand are deliberately absent.
- **The tasks and metrics are the same as the baseline benchmark** (`../../research/plan.md`
  §7), so results compare round to round. The baseline itself was not measured (assumption mode).
  Round 1 therefore gives the first real numbers, and the later rounds compare against it.

## Setup

1. Start the fake stack: the launch configs `redesign-api` (:8110) and `redesign-web` (:5184).
2. Seed it: `uv run python scripts/seed_demo.py --api http://127.0.0.1:8110`, freshly for each
   participant. Restarting the API empties it.
3. Open `http://localhost:5184/knowledge/design-lab/wireframes/` in a desktop browser at
   1280×800 or larger, then Account › Density *Automatic*. For T9, use a phone or 390×844 with
   `/explorer?as=reader`.
4. **Explain the lab bar** (the striped strip at the top): "This is test scaffolding. Please
   ignore it." Set the Scenario only where a task says so. Reset to *Happy path* between
   participants.
5. **Nothing is saved.** Every action is simulated in the browser, and reloading resets it.

Participants are the same profile as `plan.md` §2: 5 admins, plus 1–2 readers for T9.
Consent and anonymisation follow `plan.md` §3.

## Tasks

The IDs are the same as the benchmark. Read the scenario aloud, not the label in brackets.

| ID | Scenario (read aloud) | Success criteria | Max | Labels probed |
|---|---|---|---|---|
| **T1 Check-in** | "You have five minutes. Find out what needs you today and open the most urgent item." | Opens the top "Needs attention" item, or names it and opens the first decision. | 3 min | Your work, Needs attention |
| **T2 Review a document** | "'Product eligibility matrix (sample)' is waiting for your review. Exclude anything that should not be published, giving a reason, and get it approved." | Excludes the hidden-sheet rows with a reason; saves; opens *Approve and publish…*; confirms. | 10 min | Review, Seen, Flagged |
| **T3 Bilingual review** | "Review 'سياسة التحقق من العنوان (sample)'. Check the text matches the original." | Opens the passage, uses *Show the original*, decides. The observer notes any bidi problem. | 5 min | — |
| **T4 Withdraw with consequence** | "Someone asks you to withdraw 'XGPON coverage rules (sample)'. Before you do, find out what depends on it, then decide." | Says the dependants, or "none", before confirming. Not withdrawing (with a reason) also counts. Repeat with the Scenario *Requirement AI unreachable*: says the count is unknown. | 5 min | **Cited by**, Withdraw |
| **T5 Suggestions burst** | "Turn the draft 'October integration update' into a version you'd trust: deal with every suggestion that needs a person, and accept the safe ones." | Decides the three "Needs you"; uses *Show the 14* before *Accept 14*; can say what one decision was based on. Bonus: uses Undo after a deliberate mis-key. | 10 min | **Decide**, Suggested, Undo |
| **T6 Consequence before publish** | "Before publishing that draft, tell me what will change for requirement work." | Reaches Check or Publish and states the mapping impact or "not checked". | 5 min | Check, Changes |
| **T7 Provenance** | "Pick one change the draft makes. Show me which document and passage it came from." | Opens a suggestion's evidence and names the document. | 3 min | Suggested, evidence |
| **T8 Ownership check-in** | "A system has nobody responsible for it. Fix that." | Finds Ownership › Gaps; gives one system a squad and a contact. | 3 min | **Ownership**, Gaps |
| **T9 Explorer (reader)** | "Which systems take part when a business customer orders the fibre bundle?" | Names the systems in the answer list. | 3 min | Explorer |
| **T10 Jobs (new)** | "Upload a document, then go on with something else. How would you know it finished, or failed?" (Then set the Scenario to *A job fails* and upload again.) | Finds **Jobs** and reads the state; on failure, finds the cause and *Try again*. | 4 min | **Jobs** |
| **T11 Re-confirmation (new)** | (Set the Scenario to *Re-confirmations due*.) "Is anything of yours due to be confirmed as still correct? Confirm one." | Finds it in Your work or Re-confirmations and confirms it. | 3 min | **Re-confirmation** |

- T10 and T11 are added in round 1 because GATE 2b was run in assumption mode. They cover the
  labels a tree test would have validated. They have no baseline.
- **Time:** about 54 minutes of tasks. Plan 75 minutes per session, and drop T3 or T7 if time is
  short (record which).

## Label comprehension (after the tasks, 3 minutes)

Point at each label and ask: "What would you expect to find here?" Then score it:

- **2:** matches the intent;
- **1:** partly;
- **0:** wrong.

The labels:

- Your work
- Decide
- Re-confirmation
- Ownership
- Cited by
- Jobs
- Suggested
- Seen
- In service

## Metrics

These are the same as the benchmark.

- **Success:** 1, 0.5 or 0.
- **Time on task:** in seconds.
- **Errors:** including critical errors. A critical error is something accepted, rejected,
  withdrawn or published unintentionally, even though it is simulated.
- **Hints:** the count.
- **SEQ:** 1–7 after each task.
- **SUS:** at the end.
- **Fatigue:** 1–5 at the end.
- **Plus:** keyboard share (an observer estimate: mostly keyboard, mixed, or mostly mouse), bidi
  incidents, and the label scores.

## Moderator script

This is the same as the benchmark (`plan.md` §7), with three changes:

- In the intro, add: "These are rough sketches. Ignore the grey looks; we're testing where
  things are and how they work."
- After T5, ask: "Did you notice you could undo a decision? Would you rely on it?"
- After T10, ask: "Where would you expect to see background work?"

## Data

- **Data sheet:** `round-1-data.csv`, the benchmark's columns plus `labels_*`.
- **Raw notes:** `raw/Pxx-round1.md`, anonymised.
- **Synthesis** (by the agent, after GATE 3): issues scored as severity × frequency, what changed
  in the wireframes, and comparisons per task. Comparisons with the baseline only appear if one
  was measured.

## Reference screenshots

`wireframes/` holds 10 captures of the wireframes as tested (2026-10-08):

1. Your work
2. Library documents
3. Review desk (1440)
4. Draft › Decide (1440)
5. Draft › Changes
6. System record
7. Versions and compare
8. Ownership › Gaps
9. Explorer, reader view, 390
10. Not found

## Known limits of the wireframes

These are open items from `../../journeys/cognitive-walkthrough.md`.

| Item | Limit |
|---|---|
| O-2 | No "select a whole sheet". Participants select rows. |
| O-3 | Table rows read "A4=… \| B4=…". If participants stumble on it, note it; it is not their failure. |
| O-6 | No suggested squad for systems that belong to no product. |
| O-7 | "Accept with edits" isn't built. Avoid steering participants to it. |
