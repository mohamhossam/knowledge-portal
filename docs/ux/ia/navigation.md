# Information architecture — navigation model and page archetypes

Phase 2 · Define.

> **HYPOTHESIS.** No user research has been run (assumption mode), so nothing here is
> validated yet. The tree test in `tree-test.md` validates it at GATE 2b, or the IA stays
> labelled a hypothesis.

**Inputs:**
- `object-model.md`;
- `../research/synthesis.md` (top tasks, themes T2, T7, T8, T10);
- `../research/01-heuristic-review.md`.

**Decisions it honours:**
- the Timetable Book's structure is not inherited (GATE 1a);
- calm and accessible is weighted first;
- PRODUCT.md access rules: admins see everything, readers see the Explorer only.

## 1. Principles

1. **Work first, catalogue second.** The landing page answers "what needs me" (top task 1),
   not "what exists".
2. **Organise by object, not by metaphor.** The four areas are named for what they hold:
   Library, Catalogue, Ownership, Requirements. No numbers, no "tables", no "editions".
3. **One place per concept.** Re-confirmations, jobs and help each have exactly one home, and
   it is always reachable (WCAG 3.2.3 and 3.2.6).
4. **Modes are visible.** A draft and a version that is not in service read as different
   places, with their own state line and step navigation.
5. **At most 5 primary destinations** (working-memory rule). Utilities sit apart from them.
6. **Stable URLs.** Every current URL keeps working: redirect, never 404. requirement-portal
   and bookmarks link in.

## 2. Global navigation (admin)

```
┌ Shell ─────────────────────────────────────────────────────────────────────────────┐
│ [e& logo] Knowledge portal · Requirement AI ↗           [Jobs ◔ 2] [? Help] [Amina ▾] │
├──────────────┬──────────────────────────────────────────────────────────────────────┤
│ ▌Your work  6│  Page                                                                │
│  Library     │                                                                      │
│  Catalogue   │                                                                      │
│  Ownership   │                                                                      │
│  Requirements│                                                                      │
│ ──────────── │                                                                      │
│  Explorer ↗  │                                                                      │
└──────────────┴──────────────────────────────────────────────────────────────────────┘
```

- **Primary navigation:** a vertical rail of 5 entries, with labels always visible (never
  icon-only).
  - The rail collapses to labels plus icons at 1280 px or narrower. Below 1024 px it becomes a
    top bar menu.
  - The active entry carries the **red active marker**: the only brand-red element in the
    chrome besides the logo.
  - The count beside an entry is the number of items needing *you* in that area: a neutral
    badge, never red.
- **Utilities** sit in the top bar, in the same order on every page:
  - **Jobs:** a panel of the running jobs, those needing attention and those finished recently.
  - **Help:** a panel with help for this page, keyboard shortcuts, the glossary and how to
    contact the knowledge team.
  - **Account:** your name, the persona switch offline, sign-out, and a density setting.
  - A link back to **Requirement AI**.
- **Explorer** sits in the rail under a separator because it is a different, read-only view. It
  opens inside the portal; ↗ means "another view", not "leaves the site".
- **Skip links,** first in the tab order:
  - "Skip to content";
  - "Skip to navigation";
  - on pages with an index plus a detail: "Skip to the list" and "Skip to the details".

  Target: at most 3 tab stops before the primary content.

## 3. Area structure (second level)

The second level uses **in-page tabs** (`role="tablist"` is used only when the panels share one
URL). Otherwise it is a sub-navigation `nav` with `aria-current`.

### Your work (`/`): Queue

One ranked list of next decisions, shared by every area's priority function. Its scope switch
is **Mine** (default) or **Everyone's**.

Sections, in priority order (severity → due date → age):

1. **Needs attention:** failed jobs, items held by the malware scan, blocked approvals.
2. **Decisions waiting on you:** documents to review, suggestions to decide, approvals.
3. **Re-confirmations due:** documents and systems, either overdue or due soon.
4. **Gaps:** systems with no squad, sources without an owner.
5. **Quiet:** "Nothing else needs you."

Area summaries come last: one line each with a link, never four equal tables.

The Re-confirmations view at `/re-confirmations` is a filtered Queue. It is always reachable from
Your work, and the page says "Nothing is due" when that is the case.

### Library (`/library`)

| Sub-page | Archetype | Notes |
|---|---|---|
| Documents | Browse | Filters: status (Ready for review · In service · Being read · Needs attention · Withdrawn), owner (Mine · Everyone), language. Sort by any column. |
| Search passages (`/library/search`) | Browse | The query lives in the URL. Results open **at the passage**. |
| Document (`/library/:id`) | Record | Tabs: **Review** (when a version awaits review) or **Overview** · **Versions** · **Cited by** · **Ownership** |
| Upload | Flow | A drawer from Documents: file → scan → reading → open the review |

### Catalogue (`/architecture`)

The catalogue is in two clearly separate modes.

**A. Version in service** (read and confirm).

| Sub-page | Archetype |
|---|---|
| Systems: index + system detail | Browse + Record |
| Capability and landscape areas | Browse |
| Offerings: + an offering | Browse + Record |
| Journeys: + a journey | Browse + Record |
| Channels | Browse |
| Governance | Record |
| Versions: all versions, compare any two, put one back | Browse + Compare |

**B. Draft workspace** (`/architecture/versions/:draftId`).

- A **stepped flow** with live state per step:
  - **1 Sources** (documents and the catalogue file) → **2 Decide** (suggestions: exceptions
    first, then the ready set) → **3 Changes** (vs in service, with origin) → **4 Check**
    (build plus samples plus mapping impact) → **5 Publish**.
- The content pages (Systems … Journeys) are reachable as "Edit the draft by hand" within the
  workspace.
- **State line,** always visible and sticky: "Draft 'October integration update' · 18 to
  decide · Not built · Not checked".

**C. A published version that is not in service** (`/architecture/versions/:id`).

- Read-only pages, the same as A, on a distinct calm surface tint.
- A sticky state line: "You're reading a replaced version · Read the version in service · Put
  it back…".

### Ownership (`/ownership`)

| Sub-page | Archetype | Notes |
|---|---|---|
| **Gaps** (default) | Queue | Systems with no squad, systems with no contact, inactive contacts |
| Products and systems | Browse | Value streams → products → systems → squad |
| Squads | Browse | |
| People | Browse | |
| History | Browse | Each event links to its subject |

### Requirements (`/requirement-knowledge`)

| Sub-page | Archetype | Notes |
|---|---|---|
| Overview | Browse | Its empty state says "Requirement work holds no requirements yet. They come from Requirement AI ↗" |
| Requirements | Browse | |
| Findings | Queue | Possible duplicates and contradictions |
| Historic requirements | Browse + Record + Flow | The import is a Flow |

### Explorer (`/explorer`)

Its own light, **reader-first** layout, the same for admins and readers:

- **Choose** an offering, order type and channel.
- **Answer first:** the systems in this order, each expandable to one line of description.
- **Then the journey.**
- **Then** offering details, folded into "More about this offering".

Readers get a reduced shell: logo, product name, Help, Account and "Requirement AI". There is no
rail.

## 4. Page archetypes

Every route maps to one archetype. Each archetype has a fixed layout contract, so pages of one
kind behave alike (WCAG 3.2.3 consistent navigation, H4 consistency).

| Archetype | Purpose | Layout contract | Required regions | Examples |
|---|---|---|---|---|
| **Queue** | Work through items that need a decision, ranked | Head (title, scope switch, count) → ranked list grouped by severity → each item has one primary action. Keyboard: next and previous item, open, act. | Status summary (live, polite) · list · empty state saying "nothing needs you" | Your work, Re-confirmations, Gaps, Findings, Draft › Decide |
| **Record** | Read, and act on, one object | Head (name, state, owner, primary action, secondary actions in a menu) → tabs → body. A provenance line under the head. The consequence panel opens in place, beside the action. | State line · provenance line · tabs · consequence panel slot | Document, System, Offering, Journey, Historic requirement |
| **Review desk** (a Record variant) | Dense decision-making over many rows | Compact head (one line) → filter strip plus progress → grid (`role="grid"`) with a sticky header → a detail pane docked beside the grid (≥ 1440) or below the row (< 1440) → a bulk bar and a save bar, both sticky with measured padding | Progress ("212 of 800 seen") · grid · detail · save bar | Document › Review, Draft › Decide |
| **Compare** | See what changes between two states before committing | Two-state header ("In service" → "This draft") → counts by kind → a diff list with from → to values and origin → the impact panel → the commit action last | Counts · diff · impact · action | Draft › Changes, Draft › Check, Versions › Compare, Put back |
| **Browse** | Find and open objects | Head → filter strip (state in the URL) → table or list (sortable, density-aware) → pagination | Filter strip · results count (live) · table · pagination | Documents, Search, Systems index, Squads, People |
| **Flow** | Multi-step creation or import | A stepper with the step state → one step per view → Back always available → a summary before commit → the outcome with the next step | Stepper · step body · summary · outcome | Upload, New draft, Historic import, Publish |
| **Settings** | Preferences | A single column of labelled controls, saved on change with a confirmation line | — | Account › Density, Keyboard shortcuts on/off |
| **System state** | Sign-in, no access, not found, offline, error | A centred calm panel with what happened, why, and what you can do (one primary action), plus your identity and Help | — | No access, 404, Session ended, API unreachable |

## 5. Conflicting labels found (resolved in the glossary)

| Today's labels | Concept | Proposed single term |
|---|---|---|
| "Table 1/2/3/4", "the tables" | An area of the portal | Library · Catalogue · Ownership · Requirements |
| "Review" (passage review) **and** "Reviews: 2 overdue" / "Due for review" (re-confirmation) | Two different jobs | **Review** (passages, suggestions) · **Re-confirmation** (still right?) |
| "Search" page **and** "Search versions" tab | Passage search vs index builds | **Search passages** · **Search builds** |
| "Waiting" (undecided filter) **and** "Waits for another" | Undecided vs blocked by a dependency | **To decide** · **Waits for …** |
| "Edition", "edition in force", "version in service", "release", "catalogue version" | The active catalogue | **Catalogue version**, **in service** |
| "Edition" (library) vs "version" vs "revision" | A document's published state vs uploaded file vs saved review | **Version** (uploaded file) · **In service** (the published one) · "revision" is not shown |
| "Suggestions" vs "Sources" (same page; `/suggestions` redirects) | Documents read for changes, and what they proposed | **Sources** (step 1) · **Decide** (step 2) |
| "Passage" vs "chunk" vs "field" | The indexed unit | **Passage** (always) |
| "Squad catalogue" vs "Squads" | The ownership area | **Ownership** (area) · **Squad** (object) |
| "Put back in service" vs "activate" | Make an earlier version active | **Put back in service** |
| "Approve and publish" on a withdrawn document | Re-publishing | **Return to service** |
