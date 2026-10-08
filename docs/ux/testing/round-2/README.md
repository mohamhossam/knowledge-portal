# Usability test, round 2: the hi-fi prototype

- **Phase:** 6, the kit for **GATE 6**. Run it beside the manual accessibility kit
  (`../a11y-manual.md`).
- **What is tested:** the redesign at high fidelity: the design system ("The Calm Ledger", e& in
  calm mode) applied to the five journeys, over real seeded reads. Round 1 tested structure on
  greyscale wireframes; round 2 tests the same structure **plus** colour, type, density and the
  feel of a long session.
- **Comparability.** The tasks (T1–T11), success criteria, maximum times and metrics are **the
  same as round 1 and the benchmark** (`../round-1/README.md`, `../../research/plan.md` §7). So
  every number lines up row for row:
  - against round 1, if it is ever run;
  - against the baseline benchmark, if it is ever measured.

  Both have so far run in assumption mode (GATES 1a and 3). Round 2 is therefore likely to give
  the **first measured numbers**, and they are compared against the targets in
  `../../research/synthesis.md` §8.
- **New in round 2:**
  - **T12**, a 20-minute review session;
  - **three questions on perceived calm and visual fatigue**, asked straight after it.

## Setup

1. **Start the fake stack.** Use the launch configs `redesign-api` (:8110) and `redesign-web`
   (:5184).
2. **Seed it, freshly for each participant.**
   - Run `uv run python scripts/seed_demo.py --api http://127.0.0.1:8110`.
   - Restarting the API empties it.
   - Reload the prototype after seeding.
3. **Open the prototype.**
   - Go to `http://localhost:5184/knowledge/design-lab/prototype/` in Edge, at 1440×900 or
     1280×800 (record which), browser zoom 100%.
   - In Account, set Density to *Automatic*.
   - Set Theme to the participant's own OS preference (ask them; record it), and keep it all
     session.
   - Use a phone or a 390×844 window with `/explorer?as=reader` for T9.
4. **Explain the lab bar** (the dashed strip at the top): "This is test scaffolding. Please ignore
   it." Set the Scenario only where a task says so. Reset it to *Happy path* between tasks and
   between participants.
5. **Nothing is saved.** Every action is simulated in the browser, and reloading resets it. **Do
   not reload between T1 and T12**, except where a task says so: the Jobs and "seen" state live
   in the page.

**Participants:**

- the same profile as `plan.md` §2: 5 admins, plus 1–2 readers for T9;
- consent and anonymisation follow `plan.md` §3;
- people who took part in round 1, if it is run, may take part again; record it
  (`repeat_participant`), because learning affects time on task.

## Tasks

The IDs, scenarios, criteria and maximum times are copied unchanged from round 1. Read the
scenario aloud, not the label in brackets.

| ID | Scenario (read aloud) | Success criteria | Max | Labels probed |
|---|---|---|---|---|
| **T1 Check-in** | "You have five minutes. Find out what needs you today and open the most urgent item." | Opens the top "Needs attention" item, or names it and opens the first decision. | 3 min | Your work, Needs attention |
| **T2 Review a document** | "'Product eligibility matrix (sample)' is waiting for your review. Exclude anything that should not be published, giving a reason, and get it approved." | Excludes the hidden-sheet rows with a reason; saves; opens *Approve and publish…*; confirms. | 10 min | Review, Seen, Flagged |
| **T3 Bilingual review** | "Review 'سياسة التحقق من العنوان (sample)'. Check the text matches the original." | Opens the passage, uses *Show the original*, decides. The observer notes any bidi problem. | 5 min | — |
| **T4 Withdraw with consequence** | "Someone asks you to withdraw 'XGPON coverage rules (sample)'. Before you do, find out what depends on it, then decide." | Says the dependants, or "none", before confirming. Not withdrawing (with a reason) also counts. Repeat with the Scenario *Requirement AI unreachable*: says the count is unknown. | 5 min | **Cited by**, Withdraw |
| **T5 Suggestions burst** | "Turn the draft 'October integration update' into a version you'd trust: deal with every suggestion that needs a person, and accept the safe ones." | Decides the three "Needs you"; uses *Show the N* before *Accept N*; can say what one decision was based on. Bonus: uses Undo after a deliberate mis-key. | 10 min | **Decide**, Suggested, Undo |
| **T6 Consequence before publish** | "Before publishing that draft, tell me what will change for requirement work." | Reaches Check or Publish and states the mapping impact or "not checked". | 5 min | Check, Changes |
| **T7 Provenance** | "Pick one change the draft makes. Show me which document and passage it came from." | Opens a suggestion's evidence and names the document. | 3 min | Suggested, evidence |
| **T8 Ownership check-in** | "A system has nobody responsible for it. Fix that." | Finds Ownership › Gaps; gives one system a squad and a contact. | 3 min | **Ownership**, Gaps |
| **T9 Explorer (reader)** | "Which systems take part when a business customer orders the fibre bundle?" | Names the systems in the answer list. | 3 min | Explorer |
| **T10 Jobs** | "Upload a document, then go on with something else. How would you know it finished, or failed?" (Then set the Scenario to *A job fails* and upload again.) | Finds **Jobs** and reads the state; on failure, finds the cause and *Try again*. | 4 min | **Jobs** |
| **T11 Re-confirmation** | (Set the Scenario to *Re-confirmations due*.) "Is anything of yours due to be confirmed as still correct? Confirm one." | Finds it in Your work or Re-confirmations and confirms it. | 3 min | **Re-confirmation** |
| **T12 Sustained review (new)** | (Reload and reseed first, so the document starts unreviewed.) "Review 'Customer care handbook (sample)' the way you would on a normal working day. Exclude anything that shouldn't be published, with a reason. I'll stop you after 20 minutes; you don't need to finish." | Not pass or fail. Record what was reviewed (the desk's "Seen n of N" and the counts) and the observer's fatigue signs. | **20 min**, fixed | — |

**Order and time.**

- T1–T11 take about 54 minutes. Rotate T2–T8 between participants as in round 1. T12 always
  comes **last**, so every participant reaches it at a similar level of tiredness.
- With T12 and the questions, plan **100 minutes** per session, including a 5-minute break
  **before** T12 (not inside it).
- If time is short, drop T3 or T7 (record which). Never shorten T12.

**T12 notes.**

- It uses a different document from T2 on purpose.
  - The participant hasn't already seen its passages, and the eligibility matrix is learned by
    then.
  - The handbook is 800 passages of prose. It is checked against the current seed (2026-10-08);
    the other documents waiting for review have 1 to 4 passages, too few for 20 minutes.
- If the seed changes, use the longest "Ready for review" document of prose, and record which.
- Don't help or hint during T12 unless the participant is stuck for 60 seconds. Every hint is
  recorded as in the other tasks.
- **Observe without interrupting**, and record a timestamp for each fatigue sign:
  - zoom or density changes;
  - leaning in or rubbing the eyes;
  - looking away for more than 5 seconds;
  - re-finding their place (scrolling back up, re-reading the progress line);
  - sighs or comments.

## Calm and fatigue questions (straight after T12, before SUS, about 4 minutes)

Ask them in this order, reading them aloud, and record the answers word for word.

- **Q1 is new.**
- **Q2 is the plan's tiredness question.** It keeps the same 1–5 scale, so it compares with the
  benchmark's session-end answer and with the target (median ≤ 2).
- **Q3 checks the brand rule** (red is never status) from the user's side.

| # | Question (read aloud) | Answer format | Column |
|---|---|---|---|
| **Q1 Perceived calm** | "During that review, how calm or busy did the screen feel?" Then: "What, if anything, kept pulling your attention?" | 1 = very busy, 7 = very calm; then free text | `calm_1to7`, `calm_pull` |
| **Q2 Visual fatigue** | "Right now, how tired do your eyes or head feel?" Then show the card: *density · contrast · colour · scrolling · finding my place · text size · something else*. "Which of these, if any, tired you most? Pick up to two." | 1 = not at all, 5 = very; up to two factors | `fatigue_after_review_1to5`, `fatigue_factors` |
| **Q3 Colour and alarm** | "Did any colour on the screen make you think something was wrong or urgent when it wasn't, or miss something that was?" If yes: "Show me where." | yes / no; where | `colour_alarm_yn`, `colour_alarm_where` |

Then give the SUS form and the round 1 closing questions (most frustrating, what worked well),
then the label probe.

## Label comprehension (after SUS, 3 minutes)

These are the same labels and scoring as round 1:

- **2:** matches the intent;
- **1:** partly;
- **0:** wrong.

The labels: Your work, Decide, Re-confirmation, Ownership, Cited by, Jobs, Suggested, Seen,
In service.

## Metrics

**From the benchmark and round 1, unchanged:**

- success (1, 0.5 or 0);
- time on task in seconds;
- errors and critical errors;
- hints;
- SEQ 1–7 after each task (not after T12);
- SUS 0–100;
- keyboard share;
- bidi incidents;
- label scores.

**New:**

| Metric | Where | How |
|---|---|---|
| `t12_seen` | the T12 row | The desk's "Seen n" at 20:00, with N |
| `t12_excluded` | the T12 row | The Excluded count at 20:00 |
| `t12_saved` | the T12 row | Whether they saved at least once (y/n) |
| `t12_fatigue_signs` | the T12 row | Observer timestamps and kinds, for example `07:40 zoom; 14:10 lost place` |
| `t12_density_changes` | the T12 row | Count; note the direction (to compact or comfortable) |
| `calm_1to7`, `calm_pull` | the SESSION row | Q1 |
| `fatigue_after_review_1to5`, `fatigue_factors` | the SESSION row | Q2 |
| `colour_alarm_yn`, `colour_alarm_where` | the SESSION row | Q3 |
| `theme`, `repeat_participant` | every row | Setup (the viewport goes in `screen_size`, as in round 1) |

**How round 2 is read against the targets** (`synthesis.md` §8):

| Target | Value | Round 2 measure |
|---|---|---|
| Task success, top tasks | ≥ 90% | the mean of `success` over T1, T2, T4, T5, T8 |
| SEQ per task | ≥ 5.5 | the median SEQ per task |
| SUS | ≥ 75 | the mean SUS |
| Perceived calm and fatigue after 20 min | median fatigue ≤ 2 / 5 | the median `fatigue_after_review_1to5`; `calm_1to7` is reported beside it (no target set, HYPOTHESIS: median ≥ 5) |
| Red never read as status | 0 | any `colour_alarm_yn = yes` that points at red is a finding against the brand rule |
| Time on task | −30% vs baseline **only if** a baseline exists | otherwise reported as absolute times (geometric mean, successful attempts) |

With 5 participants, report every number with its n and range, never as a percentage alone. A
single failure on a top task is reported as "4/5", not "80%".

## Moderator script

This is the same as the benchmark and round 1, with these changes:

- **Intro:** replace the round 1 line with "This is a working prototype with sample data. It looks
  close to finished, but everything is simulated and nothing is saved, so please work as you
  normally would."
- **After T5:** "Did you notice you could undo a decision? Would you rely on it?" (as in round 1).
- **After T10:** "Where would you expect to see background work?" (as in round 1).
- **Before T12:** take the 5-minute break, reseed and reload, then say: "This last one is longer.
  Work at your normal pace; I'll stay quiet and stop you at 20 minutes."
- **At 20:00:** "Thank you, please stop there." Note "Seen n of N" before anything changes on
  screen, then ask Q1–Q3 straight away, before the SUS form.

## Data

- **Data sheet:** `round-2-data.csv`.
  - It has the round 1 columns, in the same order, followed by the new ones.
  - There is one row per participant × task, plus a `SESSION` row.
- **Raw notes:** `raw/Pxx-round2.md`, anonymised (see `raw/README.md`).
- **Reference screens:** `prototype/` holds 33 captures of the prototype as tested (2026-10-08):
  - the five journeys in light and dark at 1440×900;
  - the reader Explorer and the Library at 390;
  - one Windows-contrast-theme capture of the review desk.
- **Synthesis** (by the agent, at GATE 6):
  - per-task tables against the targets above;
  - issues scored as severity × frequency;
  - what the calm and fatigue answers say, quoted and counted;
  - a list of what changes in the Phase 7 plans.

## Known limits of the prototype

These are carried from round 1 where still true. Don't steer participants into them; if they
reach one, note it, don't count it as their failure.

| Item | Limit |
|---|---|
| O-2 | No "select a whole sheet": participants select rows (Space, Shift+↓). |
| O-3 | Table rows read "A4=… \| B4=…", the extractor's own text. |
| O-6 | No suggested squad for systems that belong to no product (the panel says so). |
| O-7 | "Accept with edits" isn't built; it says so. |
| Lab | "Show the original (o)" announces where it would open; it shows no preview. |
| Lab | The impact numbers in Check are fixed and simulated (BG6). |
| Lab | At 1280×800 the review desk's save bar takes two lines (it is one at 1440). Note any comment about space. |
