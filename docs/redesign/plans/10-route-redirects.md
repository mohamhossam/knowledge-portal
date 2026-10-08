# Area 10: Route redirects

**Branch:** `feat/kb-redesign-redirects` · **Gate:** GATE 8.10 · **Last.** It runs once every
new route exists.

## 1. Goal

Every current URL keeps resolving. Each changed URL gets a client-side `<Navigate replace>` that
**keeps the query string and the hash**, and a single polite announcement on arrival: "This page
moved to …".

Each redirect has a routing unit test.

## 2. Routes: the 10 patterns (`docs/ux/ia/route-map.md`)

| # | Old | New | Built in area |
|---|---|---|---|
| 1 | `/reminders` | `/re-confirmations` | 6 |
| 2 | `/library/:id/citations` | `/library/:id/cited-by` | 2 |
| 3 | `/architecture/domains` (and `/architecture/versions/:id/domains`) | `…/areas` | 4 |
| 4 | `/architecture/compare?…` | `/architecture/versions/compare?…` | 4 |
| 5 | `/architecture/versions/:id/suggestions` and `…/sources?filter=…` | `…/decide` | 3 |
| 6 | `/architecture/versions/:id/{systems,domains,channels,governance,offerings,journeys}…` (draft) | `…/edit/{systems,areas,…}…` | 3 |
| 7 | `/squads` | `/ownership/products` | 7 |
| 8 | `/squads/squads` | `/ownership/squads` | 7 |
| 9 | `/squads/people` | `/ownership/people` | 7 |
| 10 | `/squads/history` | `/ownership/history` | 7 |

## 3. Files

| Action | Path |
|---|---|
| New | `app/redirects.tsx` (a `Moved` component: a `Navigate` that keeps search and hash and sets the one-shot "moved" message in router state), `app/redirects.test.tsx` (one test per pattern, query and hash kept) |
| Change | `app/App.tsx` (mount the redirects; remove the old routes the areas kept alive during migration), the area-1 shell (reads the "moved" message into the state line or `LiveMessage` once) |

## 4. Prototype reference

None. This is routing only.

## 5. Archetype and components

`LiveMessage` (polite), or the page's `StateLine`.

## 6. States

- A redirect with a query and a hash.
- A redirect to a draft that is no longer a draft (the target's own state handles it).
- A deep link from requirement-portal (`/explorer`, `/library/:id`): **never redirected**.

## 7. Interaction

The announcement is said once per arrival, and never repeated on Back.

## 8. Content

"This page moved to ‹new place›. Update your bookmark."

## 9. Backlog items

None.

## 10. Acceptance criteria (area-specific)

- **10.1** 10 of 10 patterns redirect, with the query and hash kept (unit).
- **10.2** Pattern 7 lands on Products, not Gaps (unit).
- **10.3** `/explorer` and `/library/:id` are untouched (unit).
- **10.4** An e2e smoke follows each old URL on the seeded stack and finds the new page's h1.

## 11. Out of scope

- Server-side (nginx) redirects. The SPA handles them; the web image already serves `index.html`
  for unknown paths.

## 12. Risks

None beyond keeping the old routes alive until this area lands. Each area adds its new route and
leaves its old one working.
