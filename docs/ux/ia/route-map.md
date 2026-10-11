# Route map — current → proposed, with redirects

> **HYPOTHESIS.** This depends on the IA in `navigation.md` and is validated by the tree test.

**Rules:**
- Every current URL resolves. A changed URL gets a client-side `<Navigate replace>` that
  **keeps the query string and hash**. This is built in Phase 8, area 10.
- A changed URL is announced once on arrival with "This page moved to …". The announcement is
  polite and sits in the state line.
- `/explorer` and `/library/:id` are **not changed**: requirement-portal and readers link to
  them.
- Auth gates do not change. Every admin route stays behind `knowledge_admin`. `/explorer` stays
  open to any signed-in user (ADR-0101). API paths are untouched.

| Current route | Proposed route | Change | Archetype | Redirect |
|---|---|---|---|---|
| `/` (four tables) | `/` **Your work** | Content replaced: a ranked queue | Queue | — |
| — | `/?scope=everyone` | New scope | Queue | — |
| `/reminders` | `/re-confirmations` | Renamed | Queue | `/reminders` → `/re-confirmations` |
| `/library` | `/library` | Filters and sort in the URL | Browse | — |
| `/library/search` | `/library/search?q=…` | The query is kept in the URL | Browse | — |
| `/library/:id` | `/library/:id` (Review tab when a version awaits review, else Overview) | Same URL | Review desk / Record | — |
| `/library/:id/versions` | `/library/:id/versions` | Same | Record | — |
| `/library/:id/citations` | `/library/:id/cited-by` | Renamed to match its label | Record | `/citations` → `/cited-by` |
| `/library/:id/ownership` | `/library/:id/ownership` | Same | Record | — |
| — | `/library/:id/passages/:blockId` | **New:** a deep link to a passage (search results land here) | Review desk | — |
| `/architecture` | `/architecture` (Systems in service) | Same | Browse + Record | — |
| `/architecture/systems/:id` | same | Same | Record | — |
| `/architecture/domains` | `/architecture/areas` | Renamed (capability and landscape areas) | Browse | `/domains` → `/areas` |
| `/architecture/channels` · `/governance` · `/offerings[/:id]` · `/journeys[/:id]` | same | Same | Browse / Record | — |
| `/architecture/versions` | `/architecture/versions` | Same, with Compare inside | Browse + Compare | — |
| `/architecture/compare` | `/architecture/versions/compare?from=…&to=…` | Moved under Versions | Compare | `/architecture/compare` → new (params kept) |
| `/architecture/versions/:id` (draft) | `/architecture/versions/:id` → **Draft workspace**, step = Sources | Same URL, new layout | Flow (steps) | — |
| `…/:id/sources` | `…/:id/sources` | Step 1 | Flow step | — |
| `…/:id/suggestions` (already redirects) | `…/:id/decide` | Step 2 split out of Sources | Queue / Review desk | `/suggestions` and the `?filter=` part of `/sources` → `/decide` |
| `…/:id/changes` | `…/:id/changes` | Step 3 | Compare | — |
| `…/:id/check` | `…/:id/check` | Step 4 | Compare | — |
| `…/:id/publish` | `…/:id/publish` | Step 5 | Flow step | — |
| `…/:id/evidence/:chunkId` | same | Same; opens in the detail pane when it comes from Decide | Record | — |
| `…/:id/{systems,domains,…}` (draft content) | `…/:id/edit/{systems,areas,…}` | Hand edits sit inside the workspace | Record | old → `/edit/…` |
| `/architecture/versions/:id` (published, not in service) | same | Same; distinct tint and state line | Record | — |
| `/explorer` | `/explorer` | **Unchanged URL**; reader-first layout | Explorer | — |
| `/squads` | `/ownership` (Gaps) | Renamed area; new default | Queue | `/squads` → `/ownership/products` (keeps the old default page) |
| `/squads/squads` · `/people` · `/history` | `/ownership/squads` · `/people` · `/history` | Renamed | Browse | each old → new |
| — | `/ownership/gaps` | **New** default | Queue | — |
| `/requirement-knowledge[/…]` | same | Same URLs; label "Requirements" | Browse / Queue | — |
| — | `/help` · `/help/shortcuts` · `/help/glossary` | **New:** a full-page version of the Help panel | Record | — |
| `/callback`, `/silent-callback` | same | Unchanged | — | — |
| `*` | 404 System state | Echoes the address; lists the 5 areas | System state | — |

**Redirect count:** 10 patterns (`/reminders`, `/citations`, `/domains`, `/compare`,
`/suggestions`, the draft content pages, and 4 under `/squads`). Each is covered by a routing
unit test in Phase 8, area 10.
