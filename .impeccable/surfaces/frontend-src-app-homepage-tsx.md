---
version: 1
slug: "frontend-src-app-homepage-tsx"
primary_target: "frontend/src/app/HomePage.tsx"
related_targets: ["frontend/src/app/Shell.tsx"]
---

## Scope

The portal home at `/knowledge/`, plus the shell every later screen inherits (masthead, table index, account). Mode: Operate.

## Audience and job

Knowledge admins: architects, business analysts and knowledge owners. They come in two rhythms. In a short check-in they see what needs them and go there. Before a heavy session they get an overview of the library, the architecture catalogue, the squad catalogue and requirement work's corpus, with each one's current state and when it last changed.

## Content

All content is real data from the public API: library documents and their version stages and publications, the active and draft catalogue releases with pending suggestions, and squads, value streams, products and people, including systems with no owning squad. No metrics, testimonials or invented claims.

## Constraints

- English interface. Content may be Arabic, English or both (`dir="auto"`, `name_ar`).
- WCAG 2.2 AA.
- No AI-hype styling: suggestions read as proposals.
- Must not look like requirement-portal's Working Paper.

## Direction contract

THESIS: The shared knowledge is a published timetable. Each area is a numbered table, with an exact column set and a footnote mark on every fact that leads to its source. It refuses the admin-console default of summary cards and coloured badges over a sidebar.

OWN-WORLD: Near-white neutral table stock (never cream) and black ink. Ruled tables carry three rule weights: a heavy rule under the table head, hairlines between rows, and a double rule above the foot. One grotesk with tabular figures sets everything; its condensed width gives monumental table numbers. Weight carries rank: due rows are bold, in-service rows regular, past rows grey. Red appears only for disruption (failed or quarantined). Blue appears only for references: footnote marks and next-decision links. There are no cards, shadows, pills or gradients.

STORY: The admin sees at once what is in service and what is due, delayed or withdrawn in each table, and trusts it, because every published fact names who approved it and when. They follow one next-decision line to act.

FIRST VIEWPORT:
- **Masthead:** a thin strip with "Requirement AI · Knowledge portal" and "Valid as of" plus the fetch time and a refresh control. The account sits at the right.
- **Table index:** below the masthead. Four numbered entries, each with a proportional extent rule and a state clause naming its table's most pressing state.
- **Table 1, Library:** fills the rest. A monumental condensed "1" in the left margin column, the title, and the edition line. Then due and delayed rows, an in-service summary row, footnotes, and the next-decision line as the primary action.
- **Tables 2, 3 and 4** follow on scroll. Table 4 is requirement work's corpus, in counts, its next decision leading out to requirement work.

SIGNATURE INTERACTION: Following a reference. Focusing or hovering a footnote mark lights its note at the table foot, and the note lights its mark back. Activating the mark jumps to the note, and a return mark jumps back. Rows never reflow when a state changes; cells change in place.

FORM: The Timetable Book (national railway timetable books), candidate 6 of my ordered list. Seed key 97035e5c.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Dark theme: not for this first build. The scene is office daylight; it may be revisited.
- Destinations for the next-decision lines exist only as "in preparation" tables until the library, catalogue and squad screens land.
