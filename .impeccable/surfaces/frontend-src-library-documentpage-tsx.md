---
version: 1
slug: "frontend-src-library-documentpage-tsx"
primary_target: "frontend/src/library/DocumentPage.tsx"
related_targets: ["frontend/src/library/LibraryPage.tsx"]
---

## Scope

Two related screens:
- **The library table** (`/library`): every visible document, with add-a-document.
- **One document's page** (`/library/:documentId`): its status, its versions, and the review of every extracted passage, then approval, withdrawal, a replacement upload, and retry or cancel of processing.

Mode: Operate. The page inherits the Timetable Book world (DESIGN.md).

## Audience and job

The document's owner, an analyst or knowledge owner, reviews what extraction read before it reaches requirement work. Part of the job is deciding what to include or exclude, with a reason. Part is correcting text against the original. A document may have thousands of passages, so the review must be keyboard-driven and filterable.

Other admins see only what is in service, read-only.

## Content

- Real API data only: the document view, its versions and blocks, warnings, revisions and publications.
- The original preview for each block.
- No invented counts.

## Constraints

- **Save rules.** Every block must be decided. An excluded passage needs a reason. Text may not be blank.
- **Approval rules.** Approval is refused while blocking warnings are unresolved, and needs the latest saved revision and its fingerprint.
- **Concurrency.** `expected_version` on every mutation; 409 means reload.
- **Visibility.** Only the owner may act.
- WCAG 2.2 AA, including "focus not obscured" despite the sticky save bar.

## Direction contract

THESIS: A review reads like a timetable's change notice. What is in service sits on one side, the working revision on the other. The changes between them are counted first, then shown row by row. It refuses the form-per-passage editor, where every passage is a card of inputs.

OWN-WORLD:
- Inherited from DESIGN.md: stock and ink, three rule weights, weight as rank, red only for disruption, blue only for references.
- New for this surface: aligned two-column passage rows. The left column, in service, is set in ink-2. The right column, the working text, is set in ink.
- An excluded passage is set in ink-3 with its reason beneath. An edited passage carries a reference mark to its extraction.
- A blocking warning puts the passage's status in red.
- The focused row opens in place, in a stock-band background, to show the source image and the controls. No cards, no modals.

STORY: The owner sees how far the working copy has moved from what requirement work cites. They work through the flagged and changed passages from the keyboard, and save a revision. They approve it only when nothing blocks. Withdrawal is one deliberate action with a reason.

FIRST VIEWPORT:
- **Head.** Monumental "1" in the margin column. The document title as h1. Then the edition line: "In service: version 2, approved by … on …", or "Not yet in service" for a first upload. Header actions in ink text buttons: upload a new version, download original, withdraw.
- **Change notice.** A ruled table counting passages: edited, excluded, new since the edition, removed since the edition, and flagged (blocking in red).
- **Filter strip.** All, changed, flagged, excluded, removed, plus a find field.
- **Passage table.** Aligned rows below. The column heads read "In service · version 2" against "Working copy · version 3". For a first upload they read "As extracted" against "Reviewed".
- **Save bar.** Sticky at the foot: unsaved count, review summary, save; then approve.

SIGNATURE INTERACTION: keyboard review.
- j and k (or the arrow keys) move the focused row. The row opens in place: its source image, warnings, and the extraction it was edited from.
- x excludes and asks for the reason. i includes. e edits the text. o shows the original. Esc closes.
- The change notice counts update as you go, in place, with no reflow.

FORM: Edition against working copy. Surface seed ef09fd1e, dealt index 7 of my ordered list. Locked by the user.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- **Matching passages across versions.** Passages of an old version are matched to the new version's blocks by `content_fingerprint`, then by section path and label. Anything unmatched is new or removed. This is presentation only; the API is unchanged.
- **Out of this PR:** builds, ownership, dependencies, source impact and search.
