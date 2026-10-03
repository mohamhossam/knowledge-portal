---
version: 1
slug: "frontend-src-catalogue-suggestionspage-tsx"
primary_target: "frontend/src/catalogue/SuggestionsPage.tsx"
related_targets: ["frontend/src/catalogue/SuggestionRow.tsx","frontend/src/catalogue/DraftDocuments.tsx"]
---

## Scope

The draft catalogue version, fed from documents (the second of three catalogue PRs):
- **Draft lifecycle:** start a new version (Versions page), rename it and remove it (the draft's head).
- **The draft's Suggestions page** (`/architecture/versions/:releaseId/suggestions`), a sub-page under the draft's head beside its Systems, Domains, Offerings and Journeys:
  - its documents: add (upload, then read), remove, reading state with cancel and try again, and reading warnings;
  - every suggestion read from them, decided by keyboard or mouse: accept, accept with edits (every kind, offerings and journeys included, with full editors reused by PR 3), reject; possible matches; accepting the safe ones in bulk.
- Out of this PR: hand edits, the catalogue file, build, impact checks and publish (PR 3).

Mode: Operate. The page inherits the Timetable Book world (DESIGN.md) and the catalogue's station pages (PR 1).

## Audience and job

Architects turn architecture documents into catalogue changes. A document may yield hundreds of suggestions. Most are safe and accepted in bulk; the rest need a person: a name that may mean an existing system, an inferred dependency, a placement or offering that would replace a reviewed one, or a suggestion that must wait for another to be accepted first.

## Content

- Real API data only: the draft release, its documents, extraction jobs and runs (warnings), suggestions with match, basis, citations and possible matches, and the cited passage with its neighbours.
- `match` is recomputed on every read; every decision refetches suggestions.

## Constraints

- `expected_revision` on every decision; decisions run one after another, each with the revision the last returned. 409 means reload.
- Uploading does not start reading: the page asks for it. A document read successfully is not read again.
- "Needs one by one" is derived in the client: inferred, open possible matches, or a placement, offering or journey that would replace an existing one.
- Dependency errors quote raw ids; say them in words beside the row.
- WCAG 2.2 AA; keyboard review must never trap focus or hide the focused row.

## Direction contract

THESIS: A draft's suggestions read like the station pages they would change. Each system gathers what the documents propose for it, new systems first, so a curator decides a whole station at a time. It refuses the flat queue of cards with badges and per-card buttons.

OWN-WORLD:
- Inherited: stock and ink, three rule weights, weight as rank, red only for disruption, blue only for references, governance sections and tables, the sub-index, the change notice, filter strip, keys line and the library's keyboard review.
- New for this surface: one galley grouped under system heads in the title-at-body-size style on a heavy rule. A new system's head reads "New system", in bold. An existing system's head links to its sheet.
- Each row states the change as a sentence ("Adds the component Order API, built with Microservice"), with its state in the rank grammar and its source as a meta line.
- A row opens in place on the stock band: the cited passage with its neighbours, possible matches as a choices group, and the editor.
- Reading warnings are numbered reference marks on a document's row, with notes at the documents table's foot.

STORY: The curator adds a document and watches it be read. They accept what needs no decision in one step. Then they walk the systems from the keyboard: confirm whether a name means an existing system, check inferred dependencies against their passage, correct a name or phrase and accept. Blocked rows say what to accept first.

FIRST VIEWPORT:
- **Draft head.** Monumental "2". Then "In preparation: ‘name’" with rename and remove. Sub-index: Systems · Domains · Offerings · Journeys · Suggestions · All versions.
- **Documents.** A ruled table (document, language, reading state, waiting count) with its notes, then "Add a document".
- **Change notice.** Waiting, ready, needs your decision, waits for another, accepted, rejected. Then "Accept the N ready".
- **Filter strip and keys line,** then the galley's first system group.

SIGNATURE INTERACTION: deciding a station.
- j/k move between rows across groups. Enter opens a row in place with its passage, matches and edit. a accepts; r rejects; e edits, then accepts; Esc closes.
- A group head offers "Accept the N ready here".
- After each decision, rows whose wait is lifted turn ready in place, without reflow. Focus moves to the next waiting row.

FORM: Changes by system. Surface seed bed88a4e, dealt index 2 of my ordered list. Locked by the user.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Offline, extraction runs inline, so "Reading…" and failed reading states are seen only through unit tests and intercepted responses.
- Suggestions from a removed document stay listed; their passage can no longer be shown.
