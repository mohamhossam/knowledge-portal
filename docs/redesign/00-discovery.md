# 00 · Discovery — the knowledge portal as it ships today

Phase 0 of the e& calm redesign epic. Read-only inventory of `main` at `b6114b9` (branch
`feat/kb-redesign`). Observed facts only; nothing here is research evidence about users.

## 1. Route map

Two React trees, chosen by `auth/Gate.tsx`:

- **`App`** is for `knowledge_admin`, inside `app/Shell.tsx`.
- **`ReaderApp`** is for anyone else who is signed in. It shows the explorer only, and every
  other address shows `NoAccess`.

CSS is global. `main.tsx` imports all nine sheets, so "primary CSS" below means the sheet that
owns the route's component blocks. Section 4 explains why nearly every page also pulls rules
from 5–8 other sheets.

| Route (under `/knowledge`) | Page component | Main sub-components | Primary CSS |
|---|---|---|---|
| `/` | `app/HomePage.tsx` | `home/OverviewTable`, `timetable/TimetableTable` | timetable, knowledge, shell |
| `/library` | `library/LibraryPage.tsx` | `LibraryRetry`, `libraryRow` | library |
| `/library/search` | `library/SearchPage.tsx` | — | library |
| `/library/:documentId` (index = review) | `library/DocumentPage.tsx` › `ReviewPage` | `PassageTable`, `useDocument` | library |
| `/library/:documentId/versions` | `library/VersionsPage.tsx` | — | library |
| `/library/:documentId/citations` | `library/CitationsPage.tsx` | — | library |
| `/library/:documentId/ownership` | `library/OwnershipPage.tsx` | `AdminGrant` | library |
| `/reminders` | `reviews/RemindersPage.tsx` | `DocumentReview`, `SystemReview`, `ConfirmReviewForm` | knowledge |
| `/requirement-knowledge` | `requirements/RequirementKnowledgePage.tsx` | `knowledgeHead` | knowledge, timetable |
| `/requirement-knowledge/requirements` | `requirements/CorpusRequirementsPage.tsx` | `CorpusActionForm`, `BulkReindex` | knowledge, library |
| `/requirement-knowledge/findings` | `requirements/CorpusFindingsPage.tsx` | — | knowledge |
| `/requirement-knowledge/historic` | `historic/HistoricListPage.tsx` | `Breakdown` | knowledge |
| `/requirement-knowledge/historic/:historicId` | `historic/HistoricRecordPage.tsx` | `Breakdown` | knowledge, library |
| `/architecture` (index = systems) | `catalogue/CataloguePage.tsx` › `SystemsPage` | `SystemSheet`, `SystemEditor` | catalogue |
| `/architecture/systems/:systemId` | `SystemsPage` | `SystemSheet` | catalogue |
| `/architecture/domains` | `DomainsPage` | `DraftEdits` | catalogue |
| `/architecture/channels` | `ChannelsPage` | — | catalogue |
| `/architecture/governance` | `GovernancePage` | `GovernanceSections`, `GovernanceEditor` | catalogue |
| `/architecture/offerings` · `/:offeringId` | `OfferingsPage` / `OfferingPage` | `OfferingEditor`, `Realisation`, `Tracking`, `LifecycleNotes` | catalogue |
| `/architecture/journeys` · `/:journeyId` | `JourneysPage` / `JourneyPage` | `JourneyTimetable`, `JourneyEditor` | catalogue |
| `/architecture/versions` | `catalogue/VersionsPage.tsx` | `DraftActions` | catalogue |
| `/architecture/compare` | `ComparePage` | `DiffTable` | catalogue |
| `/architecture/versions/:releaseId` (+ every sub-route above) | `CataloguePage` | — | catalogue |
| `…/:releaseId/sources` (`/suggestions` redirects here) | `SuggestionsPage` | `SuggestionRow`, `SuggestionEditor`, `DraftDocuments`, `CatalogueFile`, `ChangeRequests` | catalogue |
| `…/:releaseId/changes` | `ChangesPage` | `DiffTable` | catalogue |
| `…/:releaseId/check` | `CheckPage` | samples | catalogue |
| `…/:releaseId/publish` | `PublishPage` | — | catalogue |
| `…/:releaseId/evidence/:chunkId` | `EvidencePage` | — | catalogue |
| `/explorer` (admin) | `explorer/ExplorerPage.tsx` (`linkSystems`) | `PlansAndPrices`, `DocumentDownload`, `document/*` | explorer, catalogue |
| `/explorer` (reader) | `ReaderApp` › `ReaderShell` › `ExplorerPage` | as above, masthead without the index | explorer, catalogue |
| `/squads` (index = products) | `squads/SquadsPage.tsx` › `ProductsPage` | `OrgEdits` | squads, catalogue |
| `/squads/squads` · `/people` · `/history` | `SquadListPage` · `PeoplePage` · `HistoryPage` | `OrgEdits` | squads, catalogue |
| `/callback`, `/silent-callback` | redirect / null | — | — |
| `*` | `NotFound` in `App.tsx` | — | shell |
| before sign-in / no role | `auth/Gate.tsx` (`Notice`, `NoAccess`, `SignIn`) | — | shell |

**Size.** There are 96 TSX files. The largest route closures (a page and its local imports,
three levels deep) are `OfferingsPage` (3,128 lines), `SuggestionsPage` (3,046), `SystemsPage`
(2,279), `CheckPage` (2,141) and `ProductsPage` (2,078).

## 2. UI patterns mapped to DESIGN.md components

| DESIGN.md component | Where it lives | Notes |
|---|---|---|
| Navigation (masthead + index of tables) | `app/Shell.tsx`, `shell.css` (`masthead`, `index`) | The masthead holds "Valid as of", Refresh, reviews due and the persona switch. The index holds four numbered tables, each with an extent bar and an alert. |
| Numbered Table (signature) | `timetable/TimetableTable.tsx`, `timetable.css` | The home page's per-area tables, with monumental margin numbers. |
| Reference Marks and Notes (signature) | `timetable.css` (`mark`, `note`), `library.css` | Footnote marks, lit in pairs. |
| Passage Table (signature) | `library/PassageTable.tsx`, `library.css` (`passages`, `passage`, `detail`) | Block review: keep, edit or exclude, with an inline detail row and a preview of the original. |
| Save Bar, Withdraw Panel, Processing Line | `library/DocumentPage.tsx` (`savebar`, `withdraw`, `processing`) | The processing line is also used by `HistoricRecordPage`. |
| Governance Section / Governance Table | `govsection`, `govtable` in about 40 files | The workhorse layout of every non-signature list. |
| Filter Strip, Table Toolbar, Keys Line | `filters`, `toolbar` in 7 and 15 files | Filters are not one component: each page re-implements them. |
| Search Results | `library/SearchPage.tsx`, `searchresults` | Also reused in `SuggestionRow` for the cited passage. |
| Catalogue Head, Systems Index, System Sheet, All Connections | `CataloguePage`, `SystemsPage`, `SystemSheet` (`sysindex`, `sheet`, `connections`) | An index held beside one system's sheet. |
| Domain Trees, Journey Timetable, Offerings, Realisation & NFRs, Order tracking, Lifecycle notes, Channels, Governance | catalogue pages (`lifecycle`, `tracking`, `realised`, `nfr`) | |
| Versions, Change Requests, Draft Documents | `VersionsPage`, `ChangeRequests`, `DraftDocuments` (`versions`, `changerequests`, `documents`, `uploads`) | |
| Galley (signature) + Suggestion Row + Suggestions Notice / Bulk Action | `SuggestionsPage`, `SuggestionRow` (`galley`, `suggestion`, `notice-table`) | The AI-suggestion review queue. |
| Catalogue Forms + Edit Panel | `catalogue/forms.tsx`, `DraftEdits`, `squads/OrgEdits` (`form`, `edit-panel`, `field`) | |
| Catalogue File | `CatalogueFile.tsx` | |
| Diff Table (signature) | `catalogue/DiffTable.tsx` | Used by Changes and Compare. Removed rows use ink-3 (grey), not red. |
| Build State Line, Check, Evidence Page, Publish | `CheckPage`, `EvidencePage`, `PublishPage` (`samples`) | |
| Squad Catalogue Head, Products and Who Runs Them (signature), Squads/People/History | `squads/*` (`runs`, `squadlist`, `people`) | |
| Explorer, Solution Architecture Document | `explorer/*`, `explorer/document/*` | |
| Historic Requirements, Review Cycles | `historic/*`, `reviews/*` (`historic`, `review`, `reminders`) | |
| Notices | `auth/Gate.tsx` (`notice`), `shell.css` | |
| Buttons | `action-button` (23 files), `next-button` (5), `text-button` (shared) | There is no Button component; buttons are class conventions. |

**Patterns the redesign brief needs that do not exist as components today:**

- dialog;
- drawer or side panel;
- toast;
- combobox;
- tooltip;
- job tray;
- keyboard-shortcut help;
- consistent help entry;
- skeletons;
- pagination component;
- AI-suggested marker (today it is copy, not a reusable mark);
- provenance trail;
- impact panel;
- bulk action bar.

All interaction is in-place (rows open on the band), which is a deliberate Timetable Book rule.

## 3. `.impeccable/` summary

- **`design.json`** (schema 2, generated 2026-10-03) describes the Timetable Book.
  - Colours: 12 colours with tonal ramps.
  - Typography: a monument/title/lead/body/meta/mark scale in Archivo Variable at widths 100,
    88, 72 and 62.
  - Rules: three weights.
  - It is the machine form of DESIGN.md.
- **`surfaces/`** holds six surface briefs, each with Scope / Audience and job / Content /
  Constraints / Direction contract:
  - home + shell (Operate mode; thesis "a published timetable … refuses summary cards and
    coloured badges over a sidebar");
  - catalogue read (PR 1);
  - suggestions/galley (PR 2);
  - publish/check/changes (PR 3);
  - library document review;
  - squads.

  The recurring audience statements are useful input to Phase 1 proto-personas. They are
  written by the team, so they are **not** user evidence:
  - "two rhythms: check-in and heavy session";
  - "a document may have thousands of passages, so keyboard-driven and filterable";
  - "a document may yield hundreds of suggestions; most are safe and accepted in bulk".

## 4. CSS architecture

- **Files.** Nine global sheets, 4,389 lines:

  | Sheet | Lines |
  |---|---|
  | catalogue | 1,630 |
  | library | 1,020 |
  | knowledge | 702 |
  | shell | 372 |
  | timetable | 309 |
  | squads | 127 |
  | base | 118 |
  | tokens | 61 |
  | explorer | 50 |

  BEM-like naming, 103 blocks, no CSS modules, no layers.
- **Tokens** (`tokens.css`, 61 lines). One flat layer:
  - 12 colours;
  - type faces and widths;
  - a 6-step size ramp and 4 weights;
  - an 8-step spacing scale (`--s1`–`--s8`);
  - layout widths, the focus ring and one easing.

  There are no primitive/semantic tiers, no dark theme ("light only" is a recorded decision) and
  no density modes.
- **Colour discipline is already good.** Outside `tokens.css` there are 0 raw hex values, 0
  rgb/hsl and 0 `color-mix`. There is 1 inline `style={{}}` (the index extent bar) and 0 raw hex
  in TSX.
- **Hard-coded sizes.** Outside tokens there are 98 `px` and 157 `rem`/`em` literals. Most are
  borders (1, 2 and 3px rules) and one-off widths.
- **Direction-unsafe properties.** There are 402 physical declarations (`margin-left`, `left:`,
  `width`, `height`, `text-align: left`, …) against 74 logical ones. `width` and `height` are
  counted as physical. This matters for bidi.
- **Cross-coupling.** 28 blocks are defined in more than one sheet:
  - `timetable` and `status` in 5 sheets each;
  - `field`, `govtable`, `row`, `text-button` and `cell` in 4;
  - `form`, `secondary` and `subindex` in 3.

  This is why every page depends on almost every sheet, and why an area-by-area migration needs
  the shared blocks extracted first (Area 1, the shell).
- **Motion.**
  - 6 transitions and 1 animation (the refresh spinner).
  - A global `prefers-reduced-motion` override in `base.css`.
- **Elevation and shape.**
  - 4 `box-shadow` (focus/inset uses).
  - 6 `border-radius`.
- **Responsive.** 24 `@media (max-width…)` queries, desktop first.
- **Fonts.**
  - Self-hosted through `@fontsource-variable/archivo` (wdth axis) and
    `@fontsource/noto-sans-arabic` 400/600.
  - CSP-safe, with no remote font origin.
- **Accessibility hooks already present.**
  - 274 `dir`/`dir="auto"` attributes in TSX.
  - 101 live regions (`aria-live`, `role="status"`, `role="alert"`).
  - 21 keyboard handlers.
  - A skip link.
  - `main` is focusable.

## 5. Current uses of red (must move to semantic tokens)

`--disruption: #b3122b` (+ `--disruption-wash`, defined but unused) carries **failure,
overdue and blocking**. That is the use the e& calm rules forbid for brand red. Under the new
system these become `--color-danger` (failure or blocking) and `--color-warning` (overdue or
due), each with an icon and text.

There are 22 references outside `tokens.css`:

| Sheet | Refs | What they mark |
|---|---|---|
| `library.css` | 9 (237, 242, 263, 330, 349, 541, 585, 594, 853) | Failed extraction or processing, a blocking warning on a passage, a blocking file warning, a failed action line. |
| `knowledge.css` | 7 (95, 172, 264, 338, 389, 449, 487) | Overdue re-confirmation (reminders group head, row, masthead count), a failed corpus action, a 2 border-colour uses. |
| `shell.css` | 3 (213, 283, 339) | The index's "could not be read" alert, the masthead overdue clause, the notice error. |
| `catalogue.css` | 2 (909, 1582) | A failed build or reading, the 409 "draft changed" line. |
| `timetable.css` | 1 (110) | The row status "delayed" or "disruption". |

TSX comments name the rule ("Red is only for a disruption", `TimetableTable.tsx:11`;
`CorpusRequirementsPage.tsx:281`).

**Blue `--reference: #1d5ca3`** is the second colour. It is used for links, footnote marks, lit
rows and **the focus ring**. The new rules move the focus ring to maroon, and links need a
calm decision of their own (maroon ink or underlined ink), because e& has no blue.

## 6. requirement-portal: brand-level cues only

The requirement-portal repository is **not checked out on this machine**, so only in-repo cues
were used:

- product name "Requirement AI";
- the masthead's first link goes back to it (`REQUIREMENT_APP_URL`);
- one OIDC sign-in, client `knowledge-spa`;
- served on the same host (`/` vs `/knowledge/`);
- `PRODUCT.md` asks for "one family, distinct design systems".

Its Working Paper tokens, primitives and shell stay off-limits. Family fit in the Phase 4
critique can therefore only be judged on these cues, unless the user shares requirement-portal
screenshots.

## 7. Prior design work outside this branch

> **Resolved at GATE 0 (2026-10-08): superseded in full.** The user decided that the earlier
> concept and its branch are neither visual nor IA evidence for this epic. The epic starts from
> `main` and the brief. The branch and its worktree are left untouched. The record below is kept
> only for context.

1. **`C:\Users\hp\Projects\knowledge-portal-design-concept\`** is an agreed e& concept from
   2026-10-06/07, never committed. It holds:
   - the clickable mock-up `architecture-navigator.html`;
   - 16 screens;
   - a README of decisions.

   Several of its decisions **conflict with the calm-mode rules** of this epic:
   - wine *gradient* bands with *glass* metric cards;
   - wine-to-blush red ramps for lifecycle and milestone colours;
   - red call-lines in journey swimlanes;
   - red "impact" edges.

   Its IA decisions are **user evidence** (they were agreed with the product owner) and rank
   above PRODUCT.md:
   - the Architecture TAM map as landing;
   - Products › Journeys inside the product;
   - the product hierarchy;
   - no lines between stacks;
   - Inter + Noto Sans Arabic + JetBrains Mono, with no e& font licence.
2. **Branch `feat/ui-revamp-eand-theme`** is checked out in worktree
   `.claude/worktrees/great-haibt-f45a73`. It is 13 commits ahead of `main` (last commit today,
   21:04): 118 files, +18,352 / −2,747, **including backend and test changes** (product
   portfolio, reference catalogue). It is a parallel build of that concept.
   - This epic branches from `main` and does not contain it.
   - Its API server occupies port 8100, and a web server occupies 5174. This epic's baseline
     therefore ran on 8110/5184 (launch configs `redesign-api`/`redesign-web`).

## 8. Seed

`scripts/seed_demo.py` (offline only) was run against the fresh in-memory API. It adds:

- sample documents in service, awaiting review, failed and withdrawn;
- a published catalogue version with an offering and its journey;
- a draft release with suggestions;
- squads.

Requirement knowledge stays empty offline (its data lives in requirement-portal), so those
screens show empty states only.
