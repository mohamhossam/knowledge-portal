---
version: 1
slug: "frontend-src-catalogue-cataloguepage-tsx"
primary_target: "frontend/src/catalogue/CataloguePage.tsx"
related_targets: ["frontend/src/catalogue/SystemSheet.tsx","frontend/src/catalogue/VersionsPage.tsx"]
---

## Scope

The architecture catalogue, read-only, first of three catalogue PRs:
- **The version in service** (`/architecture`): the systems index and all connections; a system's sheet (`/architecture/systems/:systemId`); then Domains, Offerings (with one offering's page), Journeys (with one journey's page) on the catalogue's sub-index.
- **Versions** (`/architecture/versions`): every version, downloads, its history, and putting a published version back in service with a reason. Any version reads the same way at `/architecture/versions/:releaseId/…`, with its changes against the version in service.
- Out of this PR: the draft (documents and suggestions in PR 2; hand edits, the catalogue file, build, impact checks and publish in PR 3).

Mode: Operate. The page inherits the Timetable Book world (DESIGN.md).

## Audience and job

Architects and curators check what requirement work maps against today: what a system is called, what it does and by which phrases it is matched, what it depends on and what depends on it, who owns it, and where it plays a part in an offering or a journey. Occasionally they roll back to an earlier version. Usually 30 to 40 systems, a few dozen to a hundred and more connections, a handful of offerings and journeys.

## Content

- Real API data only: the release payload (systems, relationships, both domain trees, offerings, journeys), the release list and audit, changes against the version in service, mapping-impact counts and system ownership from the squad catalogue.
- No invented counts, owners or provenance. Catalogue facts carry no per-fact source in a published release, so they take no reference marks.

## Constraints

- `rationale` is required to put a version back in service; a different embedding profile is refused (409).
- Only one version is in service; publishing a draft also puts it in service (PR 3).
- Names and aliases may be Arabic or English, side by side.
- WCAG 2.2 AA; columns drop by priority; never sideways scrolling.

## Direction contract

THESIS: A catalogue reads like a timetable's station pages. Every system has its own sheet, and its connections read both ways, like a station's departures and arrivals. It refuses the dashboard of tabs, toggles and tiles over one workbench.

OWN-WORLD:
- Inherited from DESIGN.md: stock and ink, three rule weights, weight as rank, red only for disruption, blue only for references, numbered tables, governance sections and tables, the sub-index.
- New for this surface: a ruled systems index in the table column's left track, grouped under landscape-domain heads in the label style, the current system in bold ink with the inset ink bar. Beside it, the sheet: the system's name in title style, its Arabic name and aliases beneath, then ruled sections.
- Connections are two governance tables side by side, "Depends on" and "Used by". Each row names the other system as a link, then how (calls its API, sends events, sends data, orchestrates) and for what.

STORY: The curator finds a system by any name it is known by, reads what it does and the phrases requirement work matches, follows a connection to the next system and back, sees who owns it and which offerings and journeys rely on it. On Versions they see which version is in service, compare an older one, and put it back with a reason.

FIRST VIEWPORT:
- **Head.** Monumental "2". Title "Architecture catalogue". The edition line: "In service: ‘name’, published by … on …: N systems, M connections." A bold line when requirement work mapped with an older version.
- **Sub-index.** Systems · Domains · Offerings · Journeys · Versions.
- **Systems page.** Left track: the find field, then the index grouped by where systems sit. Right: with no system chosen, "All connections", a governance table of every dependency (from, how, to, for what); with a system chosen, its sheet.
- On phones the index sits above the connections; a chosen sheet replaces the index, with "All systems" to return.

SIGNATURE INTERACTION: following a connection. Choosing a system in "Depends on" or "Used by" moves the sheet to that system, keeps its index entry in view, and lights the connection back to where you came from in reference wash. "Back" retraces the route. The find field matches names, aliases, Arabic names, components, capabilities and matching phrases, and says which one matched.

FORM: System sheets. Surface seed d7c023f0, dealt index 3 of my ordered list. Locked by the user.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- The seed's baseline catalogue has no landscape domains, components, Arabic names, offerings or journeys. The demo seed publishes a richer sample version through the API so those states can be critiqued.
- Putting a version back in service names its consequence for requirement work from mapping-impact counts; those are zero offline.
