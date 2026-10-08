# Area 6: Reviews and reminders → Re-confirmations

**Branch:** `feat/kb-redesign/re-confirmations` · **Gate:** GATE 8.6 · **Journey 4** (T11)

## 1. Goal

"Due for review" becomes **Re-confirmations**: a filtered queue of documents and systems to
confirm as still right, by their due date. It is always reachable, and says plainly when nothing
is due.

Confirming happens in place. Where the API takes a note, or acts on someone's behalf, it goes
through a short consequence panel. The same items feed the "Re-confirmations due" section of Your
work (area 1).

## 2. Routes

| Current | Target | Note |
|---|---|---|
| `/reminders` | `/re-confirmations` | New route here; the redirect of the old one is in area 10 |

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `reviews/RemindersPage.tsx` (→ `ReConfirmations.tsx`), `DocumentReview.tsx`, `SystemReview.tsx`, `ConfirmReviewForm.tsx` (→ `ConsequencePanel` or an inline confirm) |
| Keep (logic) | `reviews/review.ts`, `useReviews.ts` |
| Change | `frontend/src/app/App.tsx`: add `re-confirmations` |
| Remove (in the merge) | the reminder selectors in `styles/library.css` / `catalogue.css` |
| Tests | Adapt `reviews.test.tsx` |

## 4. Prototype reference

`/re-confirmations` with the scenario "Re-confirmations due" (the seed has none due; the
simulated items are marked "Simulated"). Code: `pages/YourWork.tsx` `ReConfirmations`.

## 5. Archetype and components

Queue: `PageHeader`, a roving list (`rovingKeyDown`), `Button` per item (named with the item),
`Status tone="done"` on confirmation, `ConsequencePanel` for "on behalf of" with a required note,
`EmptyState`.

## 6. States

- Nothing due.
- Overdue vs due soon, in words and order, never colour.
- Confirming (busy).
- Confirmed (next due in N months).
- A failure (409, or the service unreachable).
- On behalf of another owner (the note is required).

## 7. Interaction

Each item has one tab stop, and ↓ ↑ move between items. After a confirmation, focus moves to the
next item's button, or to the h1 when none are left.

## 8. Content

Glossary term: Re-confirmation ("Confirming a document or system is still right, when due").
"Due for review" is retired as a label.

## 9. Backlog items

None.

## 10. Acceptance criteria (area-specific)

- **6.1** T11 completes from Your work and from the rail (e2e with a fixture, because the seed
  has nothing due; or a seeded due item if one becomes available).
- **6.2** "Overdue" is said in words and ranks first. No red.
- **6.3** The Your work section and this page list the same items (unit on the shared source).

## 11. Out of scope

- Changing the review intervals.

## 12. Risks

- **Nothing is due in the seed.** E2e needs a route-level fixture (Playwright `page.route` on
  the reminders read). Reads only; no writes to the stack.
