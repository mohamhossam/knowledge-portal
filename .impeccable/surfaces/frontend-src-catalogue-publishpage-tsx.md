---
version: 1
slug: "frontend-src-catalogue-publishpage-tsx"
primary_target: "frontend/src/catalogue/PublishPage.tsx"
related_targets: ["frontend/src/catalogue/CheckPage.tsx","frontend/src/catalogue/ChangesPage.tsx","frontend/src/catalogue/SystemEditor.tsx"]
---

## Scope

The draft's last catalogue PR (third of three), extending the draft surface of PR 2:
- **Hand edits in place** on the draft's own pages:
  - a system sheet gets Edit, Remove and its dependencies added, changed or removed;
  - Systems gets "Add a system";
  - Domains, Offerings and Journeys get Edit, Add and Remove (reusing PR 2's editors).
- **Sources** (was Suggestions): the documents and suggestions, plus the catalogue file. Download the template or the draft as a file; upload a file, see its differences, then replace the draft's content or keep it.
- **Changes** (`/changes`): every difference from the version in service, counted, then listed by kind.
- **Check** (`/check`):
  - build the draft for matching;
  - the team's sample requirements;
  - each sample mapped with the version in service against this draft, with the evidence this draft cites.
- **Publish** (`/publish`): what publishing changes, whether it is built, what happens to mapped requirements, a reason, and publish (building first when needed).
- **Evidence** (`/evidence/:chunkId`): one cited passage of the draft.

Mode: Operate. Extension of the draft surface (frontend/src/catalogue/SuggestionsPage.tsx brief, form "Changes by system", seed bed88a4e) inside the Timetable Book; no new concept round.

## Audience and job

The architect finishes a draft: corrects what documents got wrong, fills in what they missed, sees exactly what will change, checks that requirement work still maps sensibly, then puts it in service with a reason.

## Content

- Real API data only: the draft, its diff against the version in service, its build job, sample requirements (team-wide, at most 20), compare-impact and preview-impact results, mapping-impact counts, catalogue-file previews.
- No invented checks. Checks are advisory; publishing requires only a current build and a reason.

## Constraints

- `expected_revision` on every edit; any edit unbuilds the draft. Renaming does not.
- A system's removal also removes its connections, in one whole-draft save.
- Compare and preview-impact need a current build and are rate-limited (429).
- Publishing puts the draft in service at once. A 409 names a stale revision or a different embedding profile.
- Replacing from a file replaces systems, connections, both domain trees, offerings and journeys, and keeps documents.

## Direction contract

THESIS: A draft is finished like a timetable going to press. The editor corrects the pages in place, reads the list of changes, checks a few journeys against the new edition, then signs it off with a reason. It refuses the wizard of steps that hides the catalogue behind forms.

OWN-WORLD:
- Inherited: the station pages, governance sections and tables, the change notice, the rank grammar, inline ruled steps (never modals), catalogue forms, the next-decision line.
- New: an edit opens in place on the stock band where the thing is read (a sheet's section, a domain row, an offering page), closing on a heavy rule.
- The Changes table reads like a timetable's list of alterations: kind, what changed, and the fields changed, as words.
- Check sets each sample requirement as a row. In service maps to one set of systems and this draft maps to another, and the difference is said in words ("Now also finds BSCS").

STORY: The architect edits a sheet where they read it. On Changes they see every alteration counted. On Check they build, then run the samples and see which mappings would move, with the passages behind them. On Publish they read the consequence, give a reason, and put the draft in service.

FIRST VIEWPORT:
- **Changes.** The change notice counting added, changed and removed by kind, then the list.
- **Check.** "Built for matching" (the state of the build, and a build action when it is stale), then the samples table with "Compare all".
- **Publish.** The consequence in words, then the build state, the reason field and the action.

SIGNATURE INTERACTION: the comparison row. "Compare" runs one sample. The row then says in words what moves ("Same systems", "Now also finds BSCS", "No longer finds CIM", "Finds nothing now"), and opens in place on the evidence this draft cites for each system it finds.

FORM: Extension of "Changes by system" (seed bed88a4e); the user chose three pages (Changes, Check, Publish), edits in place, and the catalogue file beside the documents as Sources.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Offline, the build and the impact checks run inline on fake embeddings and a fake reasoner. A real model's latency and its 429s are covered by unit tests.
