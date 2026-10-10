# Interaction model — knowledge portal

Phase 2 · Define. These are the rules every screen and component follows. Phase 5 turns them
into components with tests, and `/redesign-area` checks each area against them.

**Basis:**
- `../ia/object-model.md` (including the backend gaps BG1–BG7);
- `../ia/navigation.md`;
- `../research/synthesis.md` (themes T1–T11; calm + accessible weighted first);
- PRODUCT.md principles;
- WCAG 2.2 AA.

Items marked **HYPOTHESIS** are design choices that research has not validated.

---

## 1. Focus management

Focus management is the first rule, because it was the most widespread accessibility failure in
the review (theme T3).

| Event | Focus goes to | Also |
|---|---|---|
| Route change | The page `h1` (`tabIndex=-1`) | Scroll to the top unless the URL has a hash. `document.title` is updated *before* focus moves. No extra live-region announcement: the focused `h1` is read. |
| Route change with a hash or a deep link (`/passages/:blockId`) | The target row or section | Scroll it into view, clear of sticky regions (see §1.1) |
| Tab or sub-navigation change within a record | The tab panel's heading | — |
| A panel, drawer or consequence panel opens | Its first field, or its heading if it has no field | The trigger gets `aria-expanded=true` |
| A panel closes (Cancel, Esc, done) | The control that opened it | If that control no longer exists, its row; failing that, the region heading |
| A row decision (keep, exclude, accept, reject) | The **next row that needs a decision** | It never jumps across a group without saying so (polite: "Next: CWOM group") |
| A destructive action completes | The outcome line ("Withdrawn. …") | — |
| Background data refresh | **Never moves focus** | A focused element that disappears hands focus to its nearest surviving ancestor in the list |
| An error after submit | The first invalid field, or the error summary if there are several | — |

### 1.1 Focus is never obscured (WCAG 2.4.11)

- Sticky regions publish their measured block-size as CSS variables, using a `ResizeObserver`.
  The sticky regions are the shell bar, the state line, the bulk bar and the save bar.
- The variables are `--sticky-top` and `--sticky-bottom`.
- Scroll containers use `scroll-padding-block: var(--sticky-top) var(--sticky-bottom)`.
- There are no fixed `9rem`-style guesses.
- A test at 200% and 400% zoom checks that a focused row is fully visible.

### 1.2 Disabled controls

- A control that cannot act *for a reason* stays focusable. It uses `aria-disabled="true"`,
  and its visible reason is tied with `aria-describedby`.
- Native `disabled` is used only when there is no reason worth saying, such as during a
  submit.
- Activating an `aria-disabled` control announces its reason (polite) and does nothing else.

---

## 2. Keyboard map

The keyboard map is designed against WCAG 2.1.4 (character key shortcuts) and against screen
reader conflicts (theme T4).

### 2.1 Three layers

1. **Standard keys work everywhere.** Tab, Shift+Tab, Enter, Space, Esc, arrows in composite
   widgets, Home and End.
2. **Widget keys:** single characters, **active only while focus is inside that widget**.
   - Review grids use `role="grid"`. NVDA and JAWS switch to focus mode inside a grid, so
     single keys reach the page and do not clash with browse-mode quick keys. This satisfies
     WCAG 2.1.4 through "active only on focus".
3. **Global keys** have no single-character bindings. They use a two-key sequence that starts
   with `g` only when focus is **not** in a text field, a grid or a contenteditable. It is
   **off by default** and turned on in Account › Keyboard shortcuts (WCAG 2.1.4: can be turned
   off or remapped). The one exception, **`?` (help)**, follows the same on/off setting.

### 2.2 Bindings

| Scope | Key | Action |
|---|---|---|
| Global (when on) | `?` | Open Help › Shortcuts |
| | `g` then `w` · `l` · `c` · `o` · `r` | Go to Your work · Library · Catalogue · Ownership · Requirements |
| | `g` then `j` | Open the Jobs panel |
| | `/` | Focus the page's find or filter field |
| Any panel or drawer | `Esc` | Close and return focus (see §1) |
| Lists and queues (Queue, Browse) | `Tab` | Each item's link is its own tab stop: no roving, no arrow keys (decided at GATE 8.1, 2026-10-08) |
| | `Enter` | Open the item |
| Review grid: passages | `↑` `↓` (also `j` `k`) | Previous or next row |
| | `Enter` | Open the row's detail (docked) |
| | `x` | Exclude, which focuses the reason |
| | `i` | Include |
| | `e` | Edit the text |
| | `o` | Show the original |
| | `n` / `Shift+n` | Next or previous **flagged or unseen** row |
| | `Space` | Select the row (for bulk) |
| | `Shift+↑`/`↓` | Extend the selection |
| | `Ctrl+Enter` | Save the review (when allowed) |
| Review grid: suggestions | `↑` `↓` `j` `k` · `Enter` · `n` | As above; `n` is the next suggestion **that needs you** |
| | `a` | Accept (delayed commit; see §4) |
| | `r` | Reject (delayed commit; see §4) |
| | `e` | Accept with edits |
| | `z` | Undo the last decision, inside its undo window |
| Combobox find | `↓` `↑` | Move through matches |
| | `Enter` | Open the match |
| | `Esc` | Clear |

- **No other single-key bindings exist.**
- **Why queues aren't roving lists (GATE 8.1).** A roving list of links hides every item but one from Tab, and nothing on screen says arrow keys exist. The accessibility reviewers found most actions undiscoverable that way. Arrow-key grids are kept where they pay off: the review desks, which say their keys under the grid.
- The keys line under each grid lists that grid's keys, and is part of Help.
- **Inside text fields, every shortcut is off.**

---

## 3. Selection and bulk actions

- **Where:** review grids (passages, suggestions), Documents, Gaps and Re-confirmations, using a
  checkbox column (a 24px target) plus `Space` and `Shift`-range.
- **The bulk bar appears in place**, sticky at the bottom of the grid region:
  - It says "12 selected · Exclude… · Include · Clear".
  - It contributes to `--sticky-bottom`, so focus is never hidden.
- **A bulk action always shows its set before it commits.** "Exclude 12 passages" opens a
  consequence panel. The panel lists the 12, by location and first words, with one reason field
  that applies to all, and a *Exclude 12* button.
- **System-proposed sets** (for example "Accept the 14 ready") are a *saved selection*. "Show
  the 14" selects and lists them first, and the action follows.
- **Bulk on suggestions** is recorded in the session's Undo stack as one entry. Persisting
  "via bulk" is **backend gap BG4**.

---

## 4. Confirmation vs undo policy

| Action class | Examples | Pattern |
|---|---|---|
| **Local until saved** | Keep, exclude or edit a passage before Save | No confirmation. Undo per row (`i` after `x`, "Restore the extracted text"). The save bar counts unsaved changes. Leaving the page asks first (`beforeunload`, plus an in-app guard). |
| **Final in the API, frequent, low blast radius** | Accept or reject a suggestion | **Delayed commit:** the decision shows at once, and the request is sent after **6 s**. "Rejected 'Dynamics CRM' · Undo (z)" appears in the action area. It is announced politely. Undo inside the window cancels the request. Leaving the page flushes pending decisions first. *(HYPOTHESIS: the 6 s window. BG3: a true reopen needs the backend.)* |
| **Final, consequential** | Publish, Put back in service, Withdraw, Return to service, Delete a draft, Replace the draft from a file, Remove a squad or product, Deactivate a person, Activate a search build, Publish or withdraw a historic requirement | A **consequence panel** in place (§5), with no modal. Its parts, in order: the consequence first, then the named affected items, then a reason where the API takes one, then the explicit verb button ("Withdraw 'XGPON coverage rules'") and a safe default ("Keep it in service"). |
| **Final, trivial** | Rename a draft, change density | Saved on submit, with a confirmation line. No panel. |

A modal dialog is used **only** for: unsaved changes on leaving, session expiry, and a
blocking conflict (409) that needs a choice.

---

## 5. Destructive and consequential pattern (consequence panel)

- **Placement:** inline, directly below or beside the action, inside the same region. Never a
  modal. The page stays readable around it.
- **Order:**
  1. **What happens.** One sentence in the present tense, e.g. "Requirement work can no longer
     cite this document."
  2. **Who and what it affects:** counts first ("7 requirements cite it"), then the named list.
     The caveat "Only requirements you can see" is always shown.
  3. **What you can do later:** reversibility ("You can return it to service later from this
     page" / "This cannot be undone").
  4. **Reason** (when the API takes one): required, with a hint saying who reads it.
  5. **Actions:** the verb button with its object ("Withdraw 'X'"), then the safe default.
- **Styling:**
  - The action uses the **danger semantic token** with an icon. It is **never brand red**.
  - The panel itself is calm: the surface tint, a 1 px rule, and a heading with the danger icon. There is no thick coloured side border (craft floor).
- **Keyboard:** focus moves to the first field. `Esc` and the safe default both close and
  return focus.
- **Return to service:** a withdrawn document's approval becomes "Return to service…" with this
  panel, and it shows the withdrawal's who, when and why.

---

## 6. Job model

Jobs are long-running work: reading, scanning, indexing, building, comparing and BRD reading.

### Display states

One vocabulary across every API enum:

| Shown | Maps from | Icon | Tone |
|---|---|---|---|
| **Waiting** | queued | clock | neutral |
| **Working** | running, scanning, extracting | loader icon (static under reduced motion) | info |
| **Done** | succeeded, ready_for_review, read, current | check | success (quiet) |
| **Needs attention** | failed, indexing failed | alert triangle | danger |
| **Stopped** | cancelled | square | neutral |
| **Held** | quarantined (the malware scan) | shield | warning |

### Where progress lives

1. **At the object.** The state appears in the record's state line and in the row's status
   cell. It is always there, with retry and cancel beside it.
2. **The Jobs panel** in the shell. It lists the running jobs, those needing attention and
   those finished in the last 30 minutes. It is derived from the objects plus the jobs this
   session started (**BG1**: there is no list endpoint). It shows:
   - each job's object;
   - its kind;
   - the elapsed time;
   - its attempts;
   - retry and cancel.
3. **The shell badge** on Jobs counts running jobs plus those needing attention. It is neutral,
   and counts never colour the badge red.

### Notifications

- **Completion:** a polite live-region message, at most one per job: "Reading finished:
  'Product eligibility matrix' is ready for review."
- **Failure:** a polite message plus the Jobs badge. **No `role="alert"` for background work.**
  It is not urgent to the task at hand (calm feedback), so it is never assertive.
- **No toasts that steal focus.**
- **Long jobs:** after 60 s, the state line shows "Still working (1 min 20 s). You can leave
  this page; it continues." This applies only where the job is server-side.
- **Client-orchestrated jobs** (build then publish, **BG7**) say "Keep this tab open until it
  finishes."

### Failure

- Every failure states three things: **what failed, why** (in plain words from
  `error_category` or `error`, never raw), and **what to do**. What to do is "Try again", or the
  specific fix, e.g. "Upload a new version with commas between columns", when retrying can't
  help.

---

## 7. Error model

| Level | Shown where | Pattern |
|---|---|---|
| Field | Under the field, tied by `aria-describedby`, `aria-invalid` | "Give a reason: requirement owners see it." Shown on blur or submit, never while typing. |
| Form | An error summary at the top of the form, with links to the fields, focused on submit | Lists each problem |
| Action | An outcome line below the action button, polite | "Couldn't save: the server didn't answer. Your changes are kept. Try again." |
| Section read | Inside the section that failed to load; the rest of the page works | "Couldn't read who cites this document. Try again." |
| **Conflict (409)** | A modal choice | "Someone changed this draft while you were working. **Reload** (your unsaved decisions stay listed) · **Review their change**". Never raw server text. |
| Permission (403) | System state or inline | Says who you are signed in as and which role is needed, in words: "Knowledge admin", never `knowledge_admin` |
| Rate limit (429) | Inline | "Too many checks in a minute. Try again in 30 s." Includes a countdown, which is not live-announced every second. |
| Offline or API unreachable | One banner in the shell (the only one), polite | "The portal can't reach its service. Your unsaved work stays here. Retrying…". It replaces many per-section alerts (the review saw four `role="alert"` firing at once). |
| Stale link | A notice in the state line | "This link asks for 'nope', which the version in service doesn't have. Showing 'Business fibre bundle'." The URL is rewritten with `replace`. |

**Copy rules:** see `../content/microcopy.md`. No error codes, no "Something went wrong", no
blame.

---

## 8. Empty and loading patterns

- **Loading.**
  - Under 300 ms: show nothing.
  - 300 ms to 2 s: **skeleton rows** that match the final layout. Only the background tint is
    used, there is **no shimmer animation** (calm, reduced motion), and the region has
    `aria-busy`.
  - Over 2 s: a text line, "Reading the catalogue…".
  - The page frame (shell, head) never waits for data.
- **Empty states** say three things:
  1. **What this is.**
  2. **Why it is empty.**
  3. **What to do or where the data comes from.**

  Example: "No requirements yet. Requirement work keeps them; they appear here once Requirement
  AI holds some. Open Requirement AI ↗".

  - Filters and toolbars **hide** when the total is zero. They stay when a filter produced zero
    results, with "Clear filters".
  - A "nothing needs you" state is a positive, quiet confirmation, never an absence.
  - Health claims ("all indexed") are made **only when the count is above 0**.

---

## 9. AI-suggested vs human-approved marking

| State | Mark | Detail one step away |
|---|---|---|
| **Suggested** (proposed) | A text badge, "Suggested", in the neutral info tone, with a small outline `lightbulb` icon (never sparkles) and the basis: "stated" or "inferred". Inferred is labelled in words: "Inferred, not stated in the source". | Model, prompt version, rationale, citations |
| **Accepted** | "Accepted by Amina Owner · 8 Oct". "edited" is added if it was changed before acceptance. | Who, when, from which suggestion and which evidence |
| **Accepted in this session in bulk** | "Accepted with 13 others" | Session only (BG4) |
| **Rejected** | "Rejected by …", muted, with a strikethrough on the change sentence (text, not only colour) | The same |
| **Hand edit** | "Edited by hand by …" | Who and when (release `change_history`) |
| **From the catalogue file** | "From the catalogue file" | The file name, and who imported it |

- AI is **never** shown with gradients, sparkles or glow (no AI hype).
- "Suggested" must be readable without colour.
- Every list of changes (Changes, Publish) shows the **origin** column: Suggestion · Hand edit ·
  Catalogue file.

---

## 10. Provenance pattern

- **The provenance line** sits under every Record head:
  - "In service since 7 Oct · approved by Amina Owner · from version 2 (policy.pdf)";
  - or "Introduced in 'Initial catalogue' · last changed in 'September landscape' by Ravi
    Reviewer".
- **The provenance trail** is a drawer or detail section. It runs Fact → Evidence passage (the
  quoted line highlighted, not the whole chunk) → Document and version → Catalogue version →
  Decided by and when. Each hop is a link. Built from contract data:
  - suggestions: `citations`, `decided_by`;
  - releases: `change_history`, `published_by`;
  - publications: `approved_by`.
- **Published catalogue facts** have no per-fact passage in the API. Their provenance is **per
  version**: introduced in, and changed in, with a link to that diff. This is stated honestly,
  never faked.

---

## 11. Impact-preview pattern

- **The impact panel** sits **beside** the commit action. It reuses the consequence panel
  layout.
  - **Library:** "Cited by N requirements" (from the dependencies endpoint), each with its
    current or older edition. The caveat is always shown.
  - **Catalogue:** the change counts by kind; the mapping impact, "N requirements, M features
    would map differently" (`outdated_*`); and the sample check verdicts.
- **States:**
  - *Not checked*, which shows "Check now";
  - *Checking…* (a job);
  - *Checked at 14:02*;
  - *Out of date: the draft changed since*. This is derived from `revision` (BG6: kept for the
    session).
- Publishing an **unchecked or out-of-date** draft is allowed, but the panel says so first, in
  words. It does not block.

---

## 12. Density modes

| Mode | Row block-size | Body text | Used by default on |
|---|---|---|---|
| **Comfortable** | 44 px | 15 px | Your work, Record pages, Explorer, check-in pages |
| **Compact** | 32 px | 14 px | Review desks and dense Browse tables |

- **Hit targets:** every target is at least 24×24 px in both modes, by its own size. The spacing
  exception is not relied on.
- **The user setting** (Account › Density: Automatic · Comfortable · Compact) is stored per
  user in `localStorage`. *Automatic* applies the defaults above.
- **What density changes:** padding and row height only. Font size never drops below 14 px.

---

## 13. Bidi rules

1. **The UI chrome is English and LTR,** and is never mirrored.
2. **Every element showing content** (names, titles, passages, cells, inputs, textareas, find
   fields) gets `dir="auto"`. Known-Arabic fields (`name_ar`) get `lang="ar" dir="rtl"`.
3. **Every interpolated name** in a sentence is wrapped in `<bdi>`. This fixes the
   `suggestions.ts` join bug: "Waits for the systems <bdi>A</bdi>, <bdi>B</bdi>".
4. **Alignment** follows each cell's own direction, so an RTL cell aligns to its own start.
   Headings with RTL titles keep the **head layout** LTR: the title box has `dir="auto"`, but
   the row layout does not swing.
5. **Numerals:**
   - The UI uses Western digits with `font-variant-numeric: tabular-nums` in tables.
   - Content keeps its own digits.
   - Dates and counts are never rendered inside Arabic strings by the UI.
6. **Logical CSS properties only** (`margin-inline`, `inset-inline`, `text-align: start`). A
   lint rule rejects physical properties in new CSS.
7. **Arabic text** uses the Arabic face (Phase 4 picks it), with a line-height of at least 1.6
   for passages.

---

## 14. Help pattern (consistent help, WCAG 3.2.6)

- **Help** sits at the same place in the shell on every page, including system-state pages and
  the reader's Explorer. It opens a side panel (a drawer) with:
  1. **This page:** two or three lines on what it's for, and the task's steps.
  2. **Keyboard shortcuts** for this page's widgets, plus the global ones, and the on/off
     setting.
  3. **Glossary:** the terms on this page, linking to `/help/glossary`.
  4. **Ask the knowledge team:** a contact (to be configured; this is a placeholder until the
     user supplies one).
- **The keys line** under each grid summarises that grid's keys and links to Help › Shortcuts.
- **Inline help** (a term with a dotted underline, or a `?` button) explains a term in place,
  using a toggletip opened by click or Enter, never by hover alone.

---

## 15. Calm feedback

- **Routine success is quiet.** A single outcome line ("Saved.") plus a polite announcement. No
  colour flood and no toast, except the decision Undo.
- **No colour for routine states.** "Waiting" and "Working" are neutral or info. Only "Needs
  attention" uses the danger tone, and always with an icon and words.
- **Severity order is visual, consistent and colour-independent:** Needs attention > Due >
  Routine. Each is distinct in icon, weight and position. **Never lighter for the more severe.**
- **Counts are neutral badges.** Red never appears on counts, badges, alerts or diffs.
- **Motion:**
  - Only opacity and transform, at 200 ms or less.
  - Under `prefers-reduced-motion` it is instant.
  - Nothing loops or pulses, including the progress ring, which is static when motion is
    reduced.
- **One live region per purpose:** the shell's polite status line, plus each Queue's or grid's
  status line. No chattering labels, so a Refresh button doesn't re-announce itself.
