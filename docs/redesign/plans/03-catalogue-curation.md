# Area 3: Catalogue curation (the draft workspace)

**Branch:** `feat/kb-redesign-catalogue-curation` · **Gate:** GATE 8.3 · **Journey 2** (T5, T6,
T7)

## 1. Goal

A draft becomes a **five-step workspace**: Sources → Decide → Changes → Check → Publish. Its state
line is always in view.

- **Decide:**
  - suggestions that need a person, in a grid beside an evidence pane (the quote, the basis, the
    model, a provenance trail);
  - the safe set as one inspectable line ("Show the N" before "Accept N");
  - a 6-second undo on every decision (BG3).
- **Check:** mapping impact with honest states (not checked, checking, checked at, out of date,
  unknown).
- **Publish:** a consequence panel that carries the impact.
- **Hand edits** stay possible "inside the workspace".

## 2. Routes

| Current | Target | Note |
|---|---|---|
| `/architecture/versions/:id` (draft) | → `…/:id/sources` | Same URL; it redirects to step 1 |
| `…/:id/sources` | step 1 Sources | The Decide content moves out |
| `…/:id/suggestions` (redirects to `sources`) | `…/:id/decide` | New route here; the redirect of the old one is in area 10 |
| `…/:id/changes`, `/check`, `/publish` | steps 3–5 | |
| `…/:id/evidence/:chunkId` | same; it opens in the Decide pane when it comes from Decide | |
| `…/:id/{systems,domains,…}` (draft content) | `…/:id/edit/{systems,areas,…}` | New routes here; the old ones redirect in area 10 |

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `catalogue/SuggestionsPage.tsx` (→ Sources + Decide), `ChangesPage.tsx`, `CheckPage.tsx`, `PublishPage.tsx`, `EvidencePage.tsx`, `SuggestionRow.tsx` (→ grid row), `SuggestionEditor.tsx` (→ "Accept with edits", O-7), `DraftDocuments.tsx`, `DraftActions.tsx`, `CatalogueFile.tsx`, `DiffTable.tsx` (→ `DiffView` adapter, shared with area 4) |
| New | `catalogue/DraftWorkspace.tsx` (the head: state line + `StepNav`), `catalogue/Decide.tsx`, `catalogue/EvidencePane.tsx`, `catalogue/useDecisions.ts` (`useDelayedCommit` over the real decide API), `catalogue/impact.ts` (check results kept for the session and marked stale, BG6). Promote `StepNav` from the prototype's `ui.tsx` into `frontend/src/design` (with tests). |
| Keep (logic) | `catalogue/suggestions.ts`, `drafting.ts`, `editing.ts`, `inbox.ts`, `useDraft.ts`, `useEditing.ts` |
| Remove (in the merge) | the draft-related selectors in `styles/catalogue.css` |
| Tests | Adapt `suggestionsPage.test.tsx`, `curation.test.tsx`, `publish.test.tsx`, `changeRequests.test.tsx`, `drafting.test.ts`. Add: undo inside 6 s calls no API; after 6 s exactly one call; `z` undoes the newest; "Accept N" is unavailable until "Show the N". |

## 4. Prototype reference

- **Routes:** the draft 'October integration update (sample)', steps 1–5.
- **Captures:** `*-06-decide-undo`, `*-07-changes`, `*-08-check`, `*-09-publish-consequence`.
- **Code:** `design-lab/prototype/pages/Draft.tsx` and the `Diff` adapter in `pages/Catalogue.tsx`.

## 5. Archetype and components

Flow with steps (`StepNav`, `StateLine`). For each step:

- **Sources:** a queue of documents (`JobStatus`), and the catalogue file (a danger
  `ConsequencePanel` before replacing).
- **Decide:** a review desk. `SplitPane`; `DataTable` grid (`onRowKey`: a r e z n);
  `DecisionButtons`; `Suggested` with model detail; `EvidenceQuote` (with `quote=`, O-4);
  `ProvenanceTrail` (`link`); `UndoToast`; `LiveMessage`.
- **Changes:** compare, with `DiffView` (counts first, origin per item).
- **Check:** `ImpactPanel`, which keeps focus on its title while checking.
- **Publish:** a checklist of `Status` lines, then `ConsequencePanel` with an `ImpactPanel`
  inside and a required reason.

## 6. States

- **Decide:**
  - every suggestion decided (an empty state with "Review the changes");
  - waiting for another decision ("Waits for …");
  - a possible existing match (the held tone, with words);
  - the inferred basis is said as "inferred, not stated in the source";
  - a 409 on decide: "Someone changed this draft…"; your decisions stay listed.
- **Check:**
  - 429: "Too many checks…" with when to try again;
  - Requirement AI unreachable: "unknown, not zero";
  - out of date after any decision.
- **Publish:**
  - not built: building runs first, with "keep this tab open" (BG7);
  - undecided suggestions are left out, and the panel says so;
  - a failed publish leaves the reason in place.
- **Jobs:** reading, building and checking appear in the area-1 Jobs panel.

## 7. Interaction

**The Decide grid keys:** ↑↓ j k, n (next undecided), a, r, e (accept with edits), z (undo).
After a decision, focus moves to the next undecided row; the undo bar never takes focus.

**Undo:** the 6-second window shows on the row ("sending in a moment · Undo") and in the toast.
`flush` runs on leave (§4).

## 8. Content

- **Glossary terms:** Suggested · stated / inferred · Decide · Mapping impact · Catalogue version ·
  Put back in service.
- **Change sentences:** from `changeSentence()`. They are never engine words.

## 9. Backlog items

O-4 (line-level highlight), O-5 (origin from the release change history), O-7 ("Accept with
edits", **High**).

## 10. Acceptance criteria (area-specific)

- **3.1** Keyboard-only T5 completes: decide the 3 "Needs you", accept the safe set after showing
  it, and undo one mis-key (e2e on the seeded draft).
- **3.2** A decision undone within 6 s never reaches the API. One that isn't undone reaches it
  exactly once (unit, fake timers).
- **3.3** T7: from a suggestion, the evidence pane names the document and location in at most 1
  step (e2e).
- **3.4** The Check and Publish impact shows one of the five honest states, never "0" for
  unknown (unit + e2e under the rp-unreachable stub).
- **3.5** "Accept with edits" saves an edited suggestion and records it as accepted with edits
  (O-7). If the API can't express "with edits", **stop and ask**: no contract change.

## 11. Out of scope

- Storing check results (BG6).
- Server-side build-then-publish (BG7).
- Bulk decisions recorded server-side (BG4).

## 12. Risks

- **The real decide API is final** (BG3). The delayed commit must flush on route change and on
  `beforeunload`. Test the flush path; a lost decision is a critical error.
- Splitting Sources and Decide changes `SuggestionsPage` tests heavily. Keep every behavioural
  assertion.
