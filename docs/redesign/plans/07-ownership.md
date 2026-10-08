# Area 7: Squads → Ownership

**Branch:** `feat/kb-redesign-ownership` · **Gate:** GATE 8.7 · **Journey 3** (T8)

## 1. Goal

The squad catalogue becomes **Ownership**, led by **Gaps**: every system in service with no
squad or no contact, one decision each, then the next.

Each give form opens in place, with:

- a **suggested squad** (one that already runs systems of the same product), or a plain "No
  squad runs a related system yet" (O-6);
- contacts from that squad listed first.

After the save, focus moves to the next gap. Products and systems, Squads, People and History
follow as Browse pages.

## 2. Routes

| Current | Target | Note |
|---|---|---|
| `/squads` (Products) | `/ownership` (Gaps); `/ownership/products` | New routes here; the redirects are in area 10 |
| `/squads/squads` · `/people` · `/history` | `/ownership/squads` · `/people` · `/history` | the same |

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `squads/SquadsPage.tsx` (→ `OwnershipPage.tsx`: the head + `SubNav`), `ProductsPage.tsx`, `SquadListPage.tsx`, `PeoplePage.tsx`, `HistoryPage.tsx`, `OrgEdits.tsx` (→ forms on design-system components) |
| New | `squads/GapsPage.tsx`, `squads/GivePanel.tsx`, `squads/gaps.ts` (from `design-lab/wireframes/data.ts` `gaps` + `suggestedSquad`, with tests) |
| Keep (logic) | `squads/organisation.ts`, `useOrganisation.ts` |
| Change | `app/App.tsx`: the `ownership/*` routes. The rail entry becomes "Ownership" (area 1 already shows it; it points at `/ownership` from this area on). |
| Remove (in the merge) | `styles/squads.css` |
| Tests | Adapt `squads.test.tsx` and `organisation.test.ts`. Add: gaps ordering; the suggested squad; focus moves to the next gap after a save. |

## 4. Prototype reference

`/ownership` (`*-12-ownership-give`), `/ownership/{products,squads,people,history}`. Code:
`pages/Ownership.tsx`.

## 5. Archetype and components

| View | Archetype | Components |
|---|---|---|
| Gaps | Queue | `Section` with a count, the queue list, the give form (`.proto-panel`, promoted to a design-system `InlinePanel` if area 2 also uses one), `Select` with a hint, `Button busy` |
| Products and systems | Browse | `Section` per value stream, lists |
| Squads, People | Browse | `DataTable` |
| History | Browse | an event list; "what changed" waits on BG5 |

## 6. States

- No gaps.
- A gap with no product, so no suggestion (O-6).
- An inactive person (`Status stopped`, "Inactive").
- A save conflict.
- The service unreachable.
- Long and Arabic squad or system names.

## 7. Interaction

Esc closes a give form and returns focus to its button. After a save, focus goes to the next
gap, or the previous one, or the h1 when none are left. The confirmation is announced politely.

## 8. Content

Glossary terms: Ownership · Gap · Squad · Contact. The confirmation reads "‹system› is run by
‹squad›."

## 9. Backlog items

O-6 (keep the no-suggestion copy).

## 10. Acceptance criteria (area-specific)

- **7.1** T8 completes by keyboard in at most 3 interactions after the form opens (e2e).
- **7.2** The rail count and Your work's "Gaps" match the Gaps page (unit on `gaps.ts`).
- **7.3** The org-edit forms keep their current behaviour assertions.

## 11. Out of scope

- A field-level history diff (BG5).

## 12. Risks

- **The old `/squads` landing page** (Products) moves under `/ownership/products`. The redirect
  in area 10 must send `/squads` there, not to Gaps, so bookmarks keep their meaning.
