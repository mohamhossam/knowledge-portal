---
version: 1
slug: "frontend-src-squads-squadspage-tsx"
primary_target: "frontend/src/squads/SquadsPage.tsx"
related_targets: ["frontend/src/squads/ProductsPage.tsx"]
---

## Scope

Table 3, the squad catalogue (`/squads`), in one PR:
- **Products** (the default page): each value stream with its lead, then its products. Each product lists its systems, the squad that runs each and that squad's contact for it. A closing section lists the systems in service that no product names. A system with no squad can be given to one in place.
- **Squads**: squads by value stream, with scrum master, systems and contacts. Add, edit, remove.
- **People**: everyone, with the roles each holds. Add, edit, deactivate (only once they hold no role).
- **History**: who changed what, newest first.
- Value streams and products are added, edited and removed from the Products page.

Mode: Operate. The page inherits the Timetable Book world, its edit panels and its catalogue forms.

## Audience and job

Architects keep ownership and the organisation current in equal measure. They give every system in service a squad and a contact, and keep people, value streams, squads and products true as teams change. A gap (a system with no squad) is a decision due.

## Content

- Real API data only: OrganisationResponse (people, value streams, products, squads), the audit (at most 200 events, newest first), and the active architecture release for system names, where each sits, and lapsed links.
- No invented owners or sizes.

## Constraints

- Every save sends the whole record with its revision; a 409 means reload. Ids are chosen by the client (a slug, then -2, -3).
- Optional fields are sent as null, never "".
- People are never deleted. Deactivating someone who still holds a role is refused.
- New system links must be in the active release. Links that lapsed may stay on the record that has them.
- With no active release, product and squad saves fail, so they are blocked with a reason.
- A value stream is removed only when it has no products or squads.
- A system may belong to several squads and several products.

## Direction contract

THESIS: The organisation is read through what it sells, like a timetable's service list: each service, its stops, and the depot that runs it. It refuses the org-chart of cards and the admin grid of tabs.

OWN-WORLD:
- Inherited: numbered table head, sub-index, governance sections and tables, the change notice, rank by weight, in-place edit panels on the stock band, catalogue forms, the next-decision line.
- New: a value stream is a section titled by its name, with its lead on the edition line. Each product is a sub-table of its systems with "Run by" (squad, then contact as a secondary line).
- "No squad" is set in bold as a decision due. A lapsed link is set past, "not in the catalogue in service".
- The closing section, "Systems no product names", uses the same rows, grouped by where each system sits.

STORY: The curator sees how many systems in service have no squad. They walk the value streams and their products, give each unrun system to a squad with a contact, and keep squads, people and products true as teams change. History says who changed what.

FIRST VIEWPORT:
- **Head.** Monumental "3", "Squad catalogue", an edition line of counts (value streams, squads, products, active people, the last change).
- **Change notice.** Systems in service, run by a squad, with no squad, and lapsed links.
- **Sub-index.** Products · Squads · People · History.
- **First value stream section.** Its lead, its first product's systems with who runs each, and "Give it to a squad" on the gaps.

SIGNATURE INTERACTION: giving a system to a squad. On any row without a squad, "Give it to a squad" opens in place: a squad (grouped by value stream) and a contact (active people). Saving turns the row in place from bold "No squad" to the squad and its contact, and the notice's count drops.

FORM: Products, then who runs them. Surface seed c29e25ba, dealt index 6 of my ordered list. Locked by the user.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- A lapsed link cannot be seeded offline (links must be in service when made); it is unit-tested.
