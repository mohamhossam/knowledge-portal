# Research plan — knowledge portal redesign (Phase 1)

This is a **research kit, not research results.** Nothing below is a finding. Every question,
task and target is a plan to be run by the user. Results go in `docs/ux/research/raw/`, and the
synthesis happens only after GATE 1a. If the user chooses "assumption mode", derived artefacts
are labelled **HYPOTHESIS**.

## 1. Research questions

| # | Question | Why it matters to the redesign | Method |
|---|---|---|---|
| RQ1 | **Review bursts.** How do curators work through a document of hundreds of passages, or a draft of hundreds of suggestions? In what order, in one sitting or many, and what makes them stop? | Density, keyboard model, bulk actions, progress and resume | Contextual inquiry, interview |
| RQ2 | **Check-ins.** What does a 2–5 minute visit look like? What do people come to check or fix, and how do they know something needs them? | Home, notifications, the shortest path to one change | Interview, top-task survey |
| RQ3 | **Trust in AI suggestions.** When do curators accept a suggestion without reading its evidence? What makes them doubt one? Do they ever bulk-accept, and regret it? | AI vs human marking, evidence placement, bulk safety | Contextual inquiry, interview |
| RQ4 | **Provenance in use.** When does anyone follow a fact back to its passage, document version and release? Who asks for it: the curator, an auditor, a requirement author? | How far "one step away" must reach, and where the trail lives | Interview |
| RQ5 | **Impact decisions.** Before withdrawing a document or publishing a release, what do people need to know? Do they read the dependants and the mapping impact, and what do they do with them? | The impact panel's content and placement | Contextual inquiry, interview |
| RQ6 | **Job failures.** What happens when ingestion, a build or a reading job fails or runs long? Do people wait, leave, retry or ask someone? | The job tray, notifications, retry and cancel, the error model | Interview, benchmark task |
| RQ7 | **Bidi content.** Where does Arabic/English content break: in cells, edits, search, copy-paste, numerals or alignment? | Bidi rules and component specs | Contextual inquiry, interview |
| RQ8 | **Visual fatigue.** After 20–60 minutes of review, what tires people: density, contrast, colour, scrolling, re-finding their place? | The calm palette, density modes, the reading measure | Interview, post-task questions |
| RQ9 | **Hand-offs with requirement-portal.** Where do people move between the two portals: citations, mapping, retain-or-revise? What is lost in the move? | Family fit, cross-links, shared terms | Interview |
| RQ10 | **Explorer readers.** What do non-admin readers come to the Explorer for, from where, and on which device? | Explorer IA and its mobile priority | Short interview (readers) |

## 2. Participants

- **Admins (5–8)**, all holding `knowledge_admin`. Aim for a spread:
  - 2–3 **architects**, who own the architecture and squad catalogues;
  - 2–3 **business analysts**, who upload and review library documents;
  - 1–2 **knowledge owners**, who own policy documents and approve or withdraw them.
- **Explorer readers (2)**: requirement authors or other staff without the admin role.
- **Diversity to seek:**
  - at least 2 participants who regularly curate **Arabic or mixed-language** content;
  - at least 1 heavy-burst curator (release weeks);
  - at least 1 occasional check-in user;
  - at least 1 who uses a screen reader, magnification or keyboard only, if one exists in the
    team. Do not assume one does.

**Screener (one line each):**

1. Role: architect, BA, knowledge owner or other.
2. How often you use the knowledge portal: daily, weekly, monthly or rarely.
3. Your longest single session last month, in minutes.
4. Languages of the content you curate: English, Arabic or both.
5. Do you use assistive technology or keyboard-only navigation? Optional, and never required.
6. Do you also work in requirement-portal? Yes or no.

## 3. Consent and anonymisation

- Read the consent statement aloud and record verbal or written agreement before any
  recording:

  > We are studying how the knowledge portal supports your work so we can redesign it. We will
  > take notes and, with your permission, record the screen and audio. Recordings stay inside
  > the team and are deleted after synthesis. Quotes are anonymised. You can stop at any time
  > or skip any question, and it will not affect your work or your evaluation in any way. We
  > are testing the portal, not you.

- **IDs.** Participants are `P01`…`P08` (admins) and `R01`…`R02` (readers). A role tag is
  allowed (`P03-architect`). Names, emails and team names are never allowed.
- **Real content stays out.** The benchmark runs on the **seeded fake stack**. Contextual
  inquiry on real work keeps notes, but no screenshots of real documents.
- **Redact quotes** that identify a person, system owner or customer.
- **Storage.** Raw notes go in `docs/ux/research/raw/` (anonymised only) and survey exports in
  `raw/survey/`. Recordings stay outside the repository.

## 4. Interview guide (45 min)

| Time | Section | Prompts |
|---|---|---|
| 0–5 | Warm-up and consent | Role, what you curate, how long you've used the portal, how it fits your week. |
| 5–15 | Rhythms (RQ1, RQ2) | "Walk me through the last time you spent a long session in the portal. What triggered it? Where did you start?" "And the last quick visit: what brought you in, and how did you know?" |
| 15–25 | Trust and provenance (RQ3, RQ4) | "Tell me about a suggestion or extracted passage you weren't sure about. What did you look at?" "When did you last need to prove where a fact came from? Who asked?" |
| 25–32 | Consequences and failures (RQ5, RQ6) | "Before you withdrew, replaced or published something last time, what did you check?" "Tell me about a time a job failed or took too long. What did you do?" |
| 32–38 | Language and fatigue (RQ7, RQ8) | "Show me (on seeded data) where Arabic and English content gets awkward." "After a long session, what is tiring about the screen?" |
| 38–43 | Hand-offs (RQ9) | "When do you jump to requirement-portal, or come from it? What do you carry across in your head?" |
| 43–45 | Wrap-up | "If you could change one thing tomorrow, what would it be?" Thanks. |

**Probes:** "What did you expect?" · "Show me." · "What happened next?" · "How often?" ·
"What would have helped?" Do not ask leading questions such as "Would a dark mode help?".

## 5. Contextual-inquiry guide (observe a real review burst, 60–90 min)

1. **Before (5 min).** Ask what they plan to review and what "done" means today. Note their
   setup: screen size, zoom, second monitor, keyboard or mouse habits.
2. **Observe (45–75 min).** They work, you watch, and you interrupt only to ask "what are you
   thinking?" at decision points. Log with timestamps:
   - each decision (keep, edit, exclude, accept, reject), its time and whether evidence was
     opened;
   - **every** scroll-to-find, re-orientation ("where was I?"), switch to another tool or tab,
     and copy-paste;
   - keyboard vs mouse use per action;
   - errors, retries and waits on jobs (how long, and what they did meanwhile);
   - bidi incidents (misordered text, wrong alignment, a broken edit);
   - signs of fatigue: zoom changes, leaning in, breaks, comments.
3. **Debrief (10 min).** Replay 2–3 moments: "Here you scrolled back up. What were you looking
   for?" Ask what they would do differently with more time.

**Observation sheet:** `docs/ux/research/raw/<Pxx>-ci.md`, with one line per event:
`hh:mm · action · object · tool (kbd/mouse) · note`.

## 6. Top-task survey (frequency × importance), ready to send

> **Knowledge portal: what do you do most?** (5 minutes, anonymous)
>
> We're redesigning the knowledge portal. Tell us how often you do each task and how important
> it is when you do. There are no right answers.
>
> **Your role:** ☐ Architect ☐ Business analyst ☐ Knowledge owner ☐ Other: ____
>
> **For each task, choose how often** (Never · A few times a year · Monthly · Weekly · Daily)
> **and how important it is** (1 Not important … 5 Critical):
>
> 1. Upload a new document to the library
> 2. Review the passages extracted from a document (keep, edit, exclude)
> 3. Approve and publish a document's revision
> 4. Withdraw or replace a document, checking who cites it
> 5. Search published passages and copy an exact citation
> 6. Transfer a document to a new owner
> 7. Re-confirm documents or systems due for review
> 8. Read the architecture catalogue in service (a system, its connections, its owner)
> 9. Start a draft catalogue version from architecture documents or a catalogue file
> 10. Accept or reject AI-suggested systems, dependencies, domains, offerings or journeys
> 11. Compare a draft with the version in service, including mapping impact
> 12. Publish a catalogue version or put an earlier one back in service
> 13. Give an unowned system to a squad, or update squads, people and value streams
> 14. Look up requirement knowledge (the requirement corpus, findings, historic requirements)
> 15. Check whether a background job (reading, indexing, building) finished or failed
> 16. Open the product architecture explorer
>
> **Which ONE task above takes you longest, compared with how simple it should be?** ____
>
> **Anything the portal makes harder than it should?** (optional) ____
>
> **Do you curate Arabic or mixed-language content?** ☐ Often ☐ Sometimes ☐ Never

**Analysis.** Score each task as `median frequency rank × median importance`. Plot frequency
against importance. The top-right quadrant is the top-task list, and it drives the benchmark,
the IA and the home page. Report n per role, and never generalise from n < 5.

## 7. Baseline usability benchmark (the current UI)

The benchmark runs on the **fake stack, freshly seeded** before every participant:

```bash
# restart the redesign-api launch config (port 8110), then:
uv run python scripts/seed_demo.py --api http://127.0.0.1:8110
```

Browser at 1280×800 or the participant's own desktop size (record it). The persona is
`fake-owner` (Amina Owner), unless a task says otherwise. Each participant does all tasks;
rotate the order of T2–T7 by participant so learning effects spread. **The same tasks are
rerun in round 1, round 2 and the final benchmark.**

### Tasks

| ID | Task (read to participant) | Success criteria | Max time |
|---|---|---|---|
| **T1 Check-in** | "You've got five minutes. Find out what needs you in the portal today, and open the most urgent item." | Opens a due or overdue item: a reminder, a document awaiting their review, or the overdue re-confirmation. Saying out loud what needs them counts as partial success. | 3 min |
| **T2 Review a document** | "*Product eligibility matrix (sample)* is waiting for your review. Exclude anything that should not be published, giving a reason, and get the document approved." | Every block decided; the hidden-sheet "Floor price is not for publication" block excluded, with a reason; approval recorded. This tests the dense burst: about 400 rows. | 10 min |
| **T3 Bilingual review** | "Review *سياسة التحقق من العنوان (sample)* and check that its text matches the original source." | Opens the passage and the original preview, confirms the text matches, and decides it. The Arabic renders in reading order throughout, which the observer records. | 5 min |
| **T4 Withdraw with consequence** | "Someone asks you to withdraw *XGPON coverage rules (sample)*. Before you do, find out what depends on it, then decide." | States the dependants (citations, or "none") **before** acting. Withdrawing is not required: deciding not to, with the reason, also counts. | 5 min |
| **T5 Suggestions burst** | "Turn the draft *October integration update (sample)* into a release you'd trust: deal with every suggestion that needs a person, and accept the safe ones." | No pending suggestions; every non-safe one decided individually; the participant can say what at least one accepted suggestion was based on (its evidence). | 10 min |
| **T6 Consequence before publish** | "Before publishing that draft, tell me what will change for requirement work." | Names the change count and the mapping impact, or states "not built or checked yet" and builds or checks. Finds Changes and Check without help. | 5 min |
| **T7 Provenance** | "Pick one system the draft adds or changes. Show me which document and passage that came from." | Reaches the evidence passage and names its document. | 3 min |
| **T8 Ownership check-in** | "*SMB App* has no owning squad. Give it to the Sales squad, with Layla as contact." Check it is still unowned after seeding; if not, use any system shown with no squad. | The system has an owning squad and a contact. | 3 min |
| **T9 Explorer (readers only, persona `fake-observer`)** | "Which systems take part when a business customer orders the fibre bundle?" | Names the journey's systems from the Explorer. | 3 min |

**T1–T8 are the core set (admins). T9 is for Explorer readers only.** The max times add up to
44 minutes, so plan a 60–75 minute session. Keep 6–8 tasks per session. If time is short, drop T3 or T7, and record which tasks were dropped.

### Metrics, recorded per task in the data sheet

- **Success:** 1 = complete and unaided; 0.5 = complete with one hint, or partial per the
  criteria; 0 = failed, gave up or timed out.
- **Time on task:** seconds from "go" to the participant saying "done", or the time-out. Report
  the geometric mean for successful attempts.
- **Errors:** the count of wrong-path clicks, wrong decisions, and actions that had to be
  undone. A separate count of **critical errors**: data a participant published, withdrew or
  accepted that they did not intend.
- **Hints:** count, and what was said.
- **SEQ** (Single Ease Question) after each task: "Overall, how difficult or easy was this
  task?" from 1 (very difficult) to 7 (very easy).
- **SUS** at session end: the standard 10-item System Usability Scale, 1–5. Score it
  (×2.5 → 0–100) per participant, then report the mean.
- **Observer notes:** bidi incidents, fatigue signs, keyboard vs mouse use, quotes (anonymised).

### Moderator script

1. **Intro (2 min).** "Thanks for helping. We're testing the portal, not you. Please think
   aloud: say what you're looking for and what you expect. I can't help during a task, but I'll
   answer everything afterwards. There's sample data only, so nothing you do affects real work.
   Okay to record the screen?"
2. **Setup.**
   - The persona is already signed in, on the home page, with the window at the recorded size.
   - Hand over each task on a card, in the participant's rotated order.
3. **Per task.**
   - Read the card, say "go when you're ready" and start the timer.
   - Stay silent, apart from "what are you thinking?" if they fall silent for more than 20
     seconds.
   - Give a hint only after 60 s of being stuck. Record the hint.
   - Stop at max time.
   - Ask the SEQ, then one follow-up: "What was hardest?"
   - Return to the home page before the next task. Do not reseed mid-session.
4. **After the tasks.** Give the SUS form. Then three open questions:
   - "What was most frustrating?"
   - "What worked well?"
   - "After this session, how tired do your eyes or head feel, from 1 (not at all) to 5
     (very)?"

   The tiredness question is a baseline for the later calm and fatigue questions.
5. **Close.** Thank them and stop the recording.

### Data sheet

`docs/ux/testing/benchmark-template.csv` has one row per participant × task. SUS and the
session-level answers go on the row with `task_id = SESSION`.

## 8. Deliverables back to the redesign (after GATE 1a)

Put these in `docs/ux/research/raw/`:

- interview notes (`Pxx-interview.md`);
- contextual-inquiry logs (`Pxx-ci.md`);
- the survey export (`survey/…csv`);
- completed benchmark sheets (`benchmark-baseline.csv`).

The synthesis (`synthesis.md`) is written from these files only.
