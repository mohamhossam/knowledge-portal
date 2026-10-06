# Slice plan — Explorer readability

**Status:** Proposed 2026-10-06, not yet on `ROADMAP.md`. Approve, trim or reorder before any
slice starts (`AGENTS.md` §3).

## Why

The explorer (`/knowledge/explorer`, requirement-portal ADR-0101) now carries everything the
original Product Architecture Explorer showed for a scenario, and more: steps by phase,
hand-overs, tracking, parts and their realisation, decisions and gaps. It was checked locally on
2026-10-06 with the original `model.json` (Business Pro Plus, Office Presence) imported.

It reads well as a record but poorly as an overview. The scenario is one sheet of 14 governance
sections in a single scroll, with nothing above the first section that summarises it. The
original page got four things right that the explorer lacks:

1. A summary before the detail (14 order journeys · 5 entry channels · 26 runtime systems;
   confirmed 531 · inferred 99 · gaps 8).
2. Order types grouped by stage of the customer lifecycle: Acquire, Change, Exit, Assure.
3. A way to compare the channels of one order type (shared steps against channel-specific steps).
4. The landscape with the product's systems lit and the rest faded.

This plan brings those **ideas** across in this portal's own design system. It does not bring
the original's **look**. `DESIGN.md` forbids cards, pills, badges, gradients and shadows;
separation comes from the three rule weights, and depth from indentation. Each slice below says
which existing pattern it reuses, so no new visual vocabulary is invented.

## Scope at a glance

| Slice | What the reader gets | Layers touched | Size |
|---|---|---|---|
| A1 | Scenario at a glance, and a sub-index to jump through the sheet | Frontend only | S |
| A2 | Sections that fold, so the sheet reads as an index | Frontend only | S |
| A3 | Compare the channels of one order type | Frontend only | M |
| A4 | Where the scenario lands in the landscape | Frontend only | M |
| A5 | An offerings index when no offering is chosen yet | Frontend only | S |
| B1 | Order types grouped by lifecycle stage | Domain → file format → converter → API → UI | M |

Part A needs no new data: every slice computes from `ExplorerRelease`, which
`GET /explorer/release` already returns. Part B adds one optional field. The data the catalogue
cannot hold yet (Part C) is listed at the end for the roadmap, not planned here.

Suggested order: **A1 → A2 → A5 → A3 → A4 → B1**. A1 and A2 give the most relief for the least
work. A3 and A4 are independent of each other. B1 is the only slice that changes the public
contract.

---

## Part A — Presentation, no new data

### A1 — Scenario at a glance, and its sub-index

**Reader need.** Before reading 37 steps, know how big the scenario is, how sure the catalogue is
of it, and jump straight to the part needed.

**UI** (`frontend/src/explorer/ExplorerPage.tsx`, `ScenarioSheet` head):
- After the sheet's meta lines and before the conflicts note, add a **facts list**: the sheet's
  definition list on a heavy rule (System Sheet pattern). Each fact is a figure with its
  label: steps (and how many only some channels take), systems taking part, parts, channels this
  order type is offered through, and how sure the catalogue is: "Confirmed 31 · Inferred 4 · Gap
  6". The counts use tabular figures. Gaps are due, in bold (Weight Is Rank Rule), and link to
  "What the catalogue does not say yet".
- Add a **"This scenario" sub-index**: the Navigation sub-index strip, already used as "This
  document" and "This catalogue". It links to each section present, with its count where the
  section has one: Systems 21 · Steps 37 · Hand-overs 4 · Tracking · Lifecycle 10 · Parts 20 ·
  NFRs 13 · Plans · Decisions 3 · Questions 11 · Gaps. A section that is absent gets no link.
- Each section gets `scroll-margin-top` equal to the sticky masthead's height, so a jump never
  hides the heading under the masthead (WCAG 2.2 "Focus Not Obscured").

**Computation** (`frontend/src/explorer/scenario.ts`): add `glance(scenario)`. It counts the
confidence of every fact the scenario reads (steps, flow rules, hand-overs, parts, realisation,
NFRs, tracking, lifecycle notes). Facts with no confidence recorded are counted as "not stated",
never as confirmed.

**Tests:** `scenario.test.ts` covers the counts, including "not stated". `ExplorerPage.test.tsx`
checks that the sub-index links only to the sections present and that each link moves focus to
its heading.

**`DESIGN.md`:** add the facts list and the sub-index to the Explorer entry.

### A2 — Sections that fold

**Reader need.** Read the sheet as an index first, then open only what is needed.

**UI:** apply the Lifecycle notes pattern to the explorer's governance sections. The section
title becomes the disclosure button: a 16px chevron, `aria-expanded`, and the content in place
underneath. When closed, an ink-2 meta line says what the section holds ("21 systems, 3 of them
only in tracking"; "13 qualities, 7 not defined by any source").
- **Open by default:** Systems in this order, Steps, and What the catalogue does not say yet.
- **Closed by default:** the rest.
- One text button above the sheet: "Open every section" / "Close every section".
- Following a sub-index link (A1) or a `#section` address opens that section.
- Opening and closing honours `prefers-reduced-motion`; there is no animation besides the
  chevron.
- Print and the `.docx` are unaffected: the document is written from data, not from the page.

**Tests:** default open state, keyboard toggling, open-all, and that a deep link opens its
section.

**Open question:** should what is open persist per reader? The proposal is to keep it in the
address only, like the scenario itself, so a shared link opens the same sections.

### A3 — Compare channels

**Reader need.** The original's "Compare channels": which steps differ between B2B Digital, SMB
App and BCRM for one order type, without switching the Channel select three times.

**UI:** a governance section "How the channels differ for New Activation". It appears only when
the order type names two or more channels, and sits after the systems section.
- **Lead:** "25 steps are shared by every channel; 9 belong to some channels only. Care and
  System-initiated are not offered for New Activation." The last sentence uses each channel's
  "not supported" reason where the catalogue holds one; see C3.
- **Table:** Step · one column per channel. It shows only the channel-specific steps, in journey
  order and under their phase heads, as in the Journey Timetable. A cell names who performs the
  step in that channel, or is "—" when the channel skips it. A channel's entry system reads as
  that system's name.
- **Phones:** columns drop by priority, as in every table. At 45rem and below, each step lists
  "In B2B Digital: B2B Web · In SMB App: SMB App" as secondary lines, so the table never scrolls
  sideways.

**Computation:** `scenario.ts` gets `channelDifferences(release, offering, orderType)`, using the
same channel filtering `pickScenario` uses for one channel.

**Tests:** shared and specific steps for the fixture journey; an order type with one channel shows
no section.

### A4 — Where the scenario lands in the landscape

**Reader need.** The original's Architecture landscape: across the landscape domains, which
systems this scenario touches, which the offering uses elsewhere, and which it does not use.

**UI:** a governance section "Where it lands", after Compare channels. It reuses the Domain Trees
pattern: depth by indentation, outermost domains in bold.
- Each domain row ends with "4 of 8 used" in tabular figures.
- Under each domain, its systems follow on one line each:
  - in ink, medium weight, when this scenario uses the system;
  - in ink 2 with "elsewhere in Business Pro Plus" when only other order types or channels of
    the offering use it;
  - set past (ink 3) when the offering does not use it.
- A text-button disclosure "Show only the systems it uses" hides the past rows.
- The same section goes on the **offering sheet** as "Where Business Pro Plus lands". There it
  shows the offering's whole footprint, with no scenario.
- There is no picture and no colour coding. This keeps it readable to a screen reader and in
  high-contrast mode.

**Computation:** systems are placed by `landscape_domain`, which is already on every system. The
footprint is the union of the systems involved in every journey and responsibility of the
offering.

**Tests:** placement, the three states, and the "not placed in the landscape" group.

**Open question:** does the TM Forum Functional Framework / eTOM alignment the original showed
belong here? Steps already carry an `etom` label, so a column "eTOM process" on the Steps table
is a smaller, more honest step than a framework diagram. Decide before A4 starts.

### A5 — The offerings index

**Reader need.** Today `/explorer` silently opens the first offering. With more than a couple of
offerings, a reader needs to see what there is to choose from: the original's product cards.

**UI:** when the address names no product, the explorer shows a numbered table (Numbered Table
pattern) of the offerings in service. The columns are Offering (name, with the family and
proposition's first sentence as secondary lines) · Order types · Channels · Systems · Gaps, with
gaps due in bold. Each name links to `?product=…`, and the explorer reads its first order type
and first channel, as it does today. With a single offering, the index is skipped.

**Tests:** index shown with two or more offerings; skipped with one; links keep the scenario in
the address.

---

## Part B — One additive field

### B1 — Order types grouped by lifecycle stage

**Reader need.** Order types read as a lifecycle: Acquire (New Activation, Migrations,
Port-In), Change (Up/Downgrade, Shift of Site, Add-ons, Account SR, Renewal), Exit (Cancel,
Cessation, Port-Out, Dunning) and Assure (Device Replacement). Business Pro Plus has 14 order
types; a flat select of 14 is hard to scan.

**Where the data is:** the original `model.json` holds it as each order type's `group`.
`scripts/convert_explorer_model.py` drops it today.

| Layer | Change |
|---|---|
| Domain (`domain/architecture/products.py`) | `OrderType.stage: OrderStage \| None`, with a `StrEnum` of `acquire`, `change`, `exit`, `assure`. Optional, since older versions have none. |
| Catalogue file | Add an optional `stage` on order types to the JSON, YAML and Excel formats. Read and write it in every format, and include it in the catalogue diff ("Moves New Activation to Acquire"). |
| Converter | Map the model's `group` to `stage`. An unknown value is reported, never guessed. |
| Persistence | None: order types are stored inside the release payload. Confirm this during the slice. |
| API | Add `stage` to the order-type schema. Regenerate `contracts/knowledge-public.openapi.json` and the frontend types (`npm run api:generate`, `api:check`). This is **additive**. Check that `contracts/knowledge-internal.openapi.json` is unaffected; if it is affected, it changes only with requirement-portal. |
| Offering editor | A Stage select on each order-type row ("Not stated" first). |
| UI | The Order type select groups its options under `<optgroup>` per stage, in lifecycle order, with "Other" last for order types that have no stage. The offering sheet's Order types table groups its rows under phase-style heads. A5's index can count order types per stage. |
| `.docx` | No change, unless architecture review asks for it. |

**Tests:** domain round-trip; each file format reads and writes `stage`; the diff; the converter
mapping and how it reports unknown values; the editor; the select's groups.

**Contract note:** the field is optional and additive, so requirement-portal needs no
coordinated release (`AGENTS.md` §2.1).

### Not in Part B: design-time systems

The original marks some systems "Design-time only" (Automation Portal (BFM)), and some as
product overlays. The catalogue already says much of this through part responsibilities: the
explorer reads "Automation Portal (BFM): Responsible for a part; no step names it · Design time
for Broadband (GPON) speed profile". A4 can show that as its own state: "design time only for
this offering". Decide after A4 whether a dedicated field is still needed.

---

## Part C — Data the catalogue cannot hold yet

These are the items `scripts/convert_explorer_model.py` reports as "not carried over yet" for
the original model. Each one needs domain, file-format, converter, API and UI work, and possibly
an amendment to requirement-portal ADR-0101. Each needs its own slice entry in `ROADMAP.md`;
they are listed here only so that nothing is lost.

| # | Not held yet | Count in the original model | Note |
|---|---|---|---|
| C1 | System owners | 26 | The squad catalogue already records which squad runs a system. Decide whether owners come from there, not from the model, before modelling them twice. |
| C2 | System integration notes | 39 | Free text per system; could ride on the System Sheet. |
| C3 | Notes on channel support | 67 | The reason a channel is "not supported" for an order type. A3's lead uses it once it exists. |
| C4 | Capability-library entries | 18 | Overlaps with system capabilities; reconcile first. |
| C5 | Information objects | 2 | Already named in the explorer's gaps section as not held. |
| C6 | Scenario impacts of an applied change request | 1 | Change history exists; the per-scenario impact does not. |
| C7 | API links to a party not in the catalogue | 1 | Needs an "external party" kind, or a decision to drop it. |

Plans, prices, charges and commitments are **not** gaps. They are read live from the product
catalog (TMF620) by the offering's code, by decision (requirement-portal ADR-0101).

## For every slice

- Read `DESIGN.md`'s Explorer entry first, and update it in the same pull request.
- WCAG 2.2 AA: keyboard reachability, visible focus that is never obscured by the sticky
  masthead, a 24px minimum target size, labelled controls, and `prefers-reduced-motion`.
- Run the impeccable critique on the explorer against a live, seeded page before the pull request
  (`CLAUDE.md`). Seed with `scripts/seed_demo.py`, and also check against an import of the
  original model, which is far larger than the samples.
- `cd frontend && npm run lint && npm run typecheck && npm test && npm run build`. For B1, also
  run the backend gates (`ruff`, `mypy`, `lint-imports`, `pytest` with PostgreSQL) and
  `npm run api:check`.
