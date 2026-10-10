# Area 9: System states

**Branch:** `feat/kb-redesign-system-states` · **Gate:** GATE 8.9

## 1. Goal

Give every "something is wrong or missing" page and region one consistent archetype, saying:

- what happened;
- why;
- what you can do;
- who you are (where it matters);
- where Help is.

They cover: no access (a signed-in non-admin), 404, session ended, the service unreachable, an
unexpected error (an error boundary), and the shared empty and loading patterns.

## 2. Routes

| Current | Target |
|---|---|
| `*` (`NotFound`: "There is no table at this address") | 404 system state: it echoes the address and lists the areas |
| Denied (from `AuthProvider` 403) | "This portal is for knowledge admins", with the Explorer offered |
| Session expiry (`AuthProvider`) | "Your session has ended", which keeps unsaved decisions on this device |
| Offline | the shell banner (area 1) + a full-page state when the first load fails |
| — | an error boundary at the route level: "Something went wrong on this page", with *Reload* and the error id (no stack) |

## 3. Files

| Action | Path |
|---|---|
| Rewrite | the `NotFound` in `app/App.tsx` (→ `system/NotFound.tsx`); the denied, expired and error views rendered by `auth/AuthProvider.tsx` (the views only; **the auth logic is unchanged**) |
| New | `system/SystemState.tsx` (the archetype, promoted into `frontend/src/design` if it is generic), `system/ErrorBoundary.tsx`, `system/NoAccess.tsx`, `system/SessionEnded.tsx`, `system/Offline.tsx` |
| Change | `app/App.tsx`: wrap the routes in the error boundary |
| Remove (in the merge) | the `.missing*` selectors and others in `styles/shell.css` / `base.css` that only these used |
| Tests | Render each state; every state has an h1, a next step and a Help reach; the boundary catches a thrown render |

## 4. Prototype reference

`/states/{no-access,not-found,session,offline}` (`*-13-not-found`). Code: `pages/States.tsx`.
Empty and loading follow `EmptyState` and `Skeleton` everywhere.

## 5. Archetype and components

System state: `PageHeader` (title + lead), `ActionGroup` (one primary action), `Section` "Where
to go" with the area links, `EmptyState` for regions.

## 6. States

As listed in §1, plus:

- **No access**, for someone who is also not a reader: no Explorer offer.
- **A 404 inside a record** ("We couldn't open this document"): a region-level state, not the
  page.

## 7. Interaction

Focus goes to the state's h1. The primary action is the first stop after it. Session ended keeps
the return path (`safeReturnPath`).

## 8. Content

From `docs/ux/content/microcopy.md` (system states). Never blame the person. No error codes
except a support id.

## 9. Backlog items

None.

## 10. Acceptance criteria (area-specific)

- **9.1** Every state passes axe, has exactly one h1, and has a primary action (e2e for 404 and
  no access; component tests for the rest).
- **9.2** A route that throws renders the boundary, not a blank page (unit).
- **9.3** The auth logic is untouched: the `AuthProvider` tests pass unchanged, apart from
  rendering assertions.

## 11. Out of scope

- Changing the session length or the sign-in flow.

## 12. Risks

- **The no-access view is rendered by the auth layer.** Change only the presentational
  component; keep the 403 → reader path byte-for-byte in logic.
