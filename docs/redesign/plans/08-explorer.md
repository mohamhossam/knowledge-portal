# Area 8: Explorer

**Branch:** `feat/kb-redesign/explorer` · **Gate:** GATE 8.8 · **Journey 5** (T9)

## 1. Goal

A reader-first product architecture explorer:

- **The answer first:** "N systems take part when a business customer orders ‹offering›
  (‹order type›)", with a folding description per system.
- **Then the journey steps.**
- **Then "More about this offering"**, folded.
- **Download as a document.**

The same page serves admins (full shell, systems linked) and readers (the reduced shell with no
rail, ADR-0101). A stale link is said out loud, and the address is rewritten to what is shown.

## 2. Routes

| Current | Target |
|---|---|
| `/explorer` (admin, `linkSystems`) | same; **unchanged URL** (requirement-portal links to it) |
| `/explorer` (reader, `ReaderApp`) | same, reduced shell |

The query keeps `product` and `order`; the stale-link handling uses `replace`.

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `explorer/ExplorerPage.tsx`, `ReaderApp.tsx` (→ `AppShell reader`), `PlansAndPrices.tsx`, `DocumentDownload.tsx` |
| Keep (logic) | `explorer/scenario.ts`, `plans.ts`, `fixtures.ts`, `document/*` (the Word generation) |
| Remove (in the merge) | `styles/explorer.css` |
| Tests | Adapt `ExplorerPage.test.tsx` (it includes the timezone fix from the separate session; keep it), `scenario.test.ts`, `plans.test.ts` |

## 4. Prototype reference

`/explorer` and `/explorer?as=reader` at 390 (`*-15-explorer-reader-390`). The scenario "Stale
Explorer link". Code: `pages/Explorer.tsx`.

## 5. Archetype and components

Explorer (reader-first):

- `PageHeader` with provenance ("From the catalogue in service … Drafts are never shown here.");
- `StateLine` for a stale link;
- `Select` × 2;
- `Section`;
- disclosure buttons (`aria-expanded`);
- an ordered list for the steps;
- `<details>` for more;
- `Button variant="link"` with an icon for the download.

## 6. States

- No catalogue in service.
- An offering with no journey for that order type.
- A stale product.
- A reader (no rail, no Jobs).
- A download in progress or failed.
- Long and Arabic system names.

## 7. Interaction

Enter toggles a system line. The choices update the answer heading and the address without a
new history entry. At 390 everything is one column.

## 8. Content

Glossary term: Journey. The answer heading is a full sentence. "Not recorded yet" stands for
missing plans, prices and non-functional requirements.

## 9. Backlog items

None.

## 10. Acceptance criteria (area-specific)

- **8.1** T9: the answer list is reachable in at most 3 tab stops from the h1 at 390×844 (e2e,
  mobile viewport).
- **8.2** The reader view has no rail and no "Skip to navigation", and reads only the version in
  service. No draft request is made (e2e: assert on the network requests).
- **8.3** A stale link shows the state line, and the URL is rewritten without a history entry
  (e2e).
- **8.4** The Word download still generates (the existing `document/*` tests pass).

## 11. Out of scope

- The Word document's design: keep the generator as it is.
- The explorer's read API.

## 12. Risks

- **Auth.** `/explorer` must stay open to any signed-in user. Don't move it under an
  admin-only layout route while restructuring `App.tsx`.
