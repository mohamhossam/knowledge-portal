# Area 4: Catalogue browsing

**Branch:** `feat/kb-redesign-catalogue-browsing` · **Gate:** GATE 8.4 · **Journeys 2 and 3**
(T6 compare)

## 1. Goal

Rebuild the catalogue pages:

- **Systems:**
  - an index with a find combobox over names, Arabic names, capabilities and connections;
  - a sticky record pane with connections said as sentences.
- **Domains → Areas, Channels, Governance, Offerings (+ record), Journeys (+ record).**
- **Versions:** every version, with **Compare** inside and **Put back in service** through a
  consequence panel.

A replaced version reads on the "proof" tint with a sticky state line, so nobody mistakes it for
the version in service.

## 2. Routes

| Current | Target | Note |
|---|---|---|
| `/architecture`, `/architecture/systems/:id` | same | |
| `/architecture/domains` | `/architecture/areas` | New route; the redirect is in area 10 |
| `/architecture/channels`, `/governance`, `/offerings[/:id]`, `/journeys[/:id]` | same | |
| `/architecture/versions` | same, with Compare | |
| `/architecture/compare` | `/architecture/versions/compare?from=&to=` | New route; the redirect is in area 10 |
| `/architecture/versions/:id` (not a draft) | same, in proof | |

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `catalogue/CataloguePage.tsx` (the head, sub-navigation, state line), `SystemsPage.tsx`, `SystemSheet.tsx` (→ the record pane), `DomainsPage.tsx` (→ Areas), `ChannelsPage.tsx`, `GovernancePage.tsx`, `GovernanceSections.tsx`, `OfferingsPage.tsx`, `JourneysPage.tsx`, `JourneyTimetable.tsx`, `Realisation.tsx`, `Tracking.tsx`, `LifecycleNotes.tsx`, `VersionsPage.tsx`, `ComparePage.tsx` |
| Keep (logic) | `catalogue/catalogue.ts`, `governance.ts`, `offeringSections.ts`, `useCatalogue.ts` |
| Editors | `SystemEditor`, `OfferingEditor`, `JourneyEditor`, `GovernanceEditor`, `LifecycleEditor`, `TrackingEditor`, `DraftEdits`, `ChangeRequests`, `forms.tsx`. These are used by the hand edits inside a draft. They are restyled here with design-system form components; their behaviour is unchanged. |
| Remove (in the merge) | the remaining `styles/catalogue.css` and, if no area uses it any more, `timetable/TimetableTable.tsx` + `styles/timetable.css` |
| Tests | Adapt `pages.test.tsx`, `channels.test.tsx`, `governance.test.tsx`, `lifecycle.test.tsx`, `offeringSections.test.tsx`, `realisation.test.tsx`, `tracking.test.tsx`, `catalogue.test.ts` |

## 4. Prototype reference

- **Prototyped:** Systems (`*-10-system-record`), Versions + Compare (`*-11-versions-compare`),
  and the proof state line (in `pages/Catalogue.tsx`).
- **Not prototyped:** Areas, Channels, Governance, Offerings and Journeys.
  - They follow the same archetypes: Browse + Record on `SplitPane`; DataTable for lists; Facts
    and Section for records.
  - **Impeccable resolves the gaps** (pipeline authority).
  - Show their screenshots at the gate as **new**, not validated.

## 5. Archetype and components

| View | Archetype | Components |
|---|---|---|
| Systems | Browse + Record | `SplitPane`, `Combobox` (`search`), `Section`, `ProvenanceLine` |
| Areas, Channels, Governance | Browse | `DataTable` |
| Offerings and Journeys | Browse + Record | `DataTable`; journey steps as an ordered list (from the Explorer); realisation and tracking as `Section`s |
| Versions | Browse + Compare | `DataTable`, `Select` (from / to), `DiffView` (fields equal on both sides are dropped), `ConsequencePanel` (put back, with a reason) |
| Editors | Form | `TextField`, `TextArea`, `Select`, `Combobox`, `RadioGroup`, `Button unavailableReason`, `ConsequencePanel` for destructive edits |

## 6. States

- No version in service.
- A version without that system.
- No connections, and no capabilities.
- A replaced version (proof).
- A draft in hand-edit mode (a state line back to the steps).
- Compare with no differences.
- Put back while Requirement AI is unreachable (the impact is unknown).
- An Arabic system name: `lang="ar"`, `dir="rtl"`, Noto Sans Arabic, with Arabic leading.

## 7. Interaction

**Find a system:** ↓ ↑ move through matches, Enter opens one, Esc clears.

**Compare:** the from and to versions are kept in the URL.

**Put back in service:** the panel opens from the URL (`?put-back=`), and focus returns to its
row's button when it closes.

## 8. Content

- **Glossary terms:** Catalogue version · In service · Replaced · Put back in service · Area
  (capability and landscape) · Connection (said as a sentence).

## 9. Backlog items

None open in this area. Review findings land in the backlog.

## 10. Acceptance criteria (area-specific)

- **4.1** T6: compare in service ↔ draft is the default, and every change says its kind in words
  (e2e).
- **4.2** A replaced version is never shown without the proof state line (e2e on a replaced
  version).
- **4.3** Find a system by its Arabic name works (unit on `findSystems` + e2e).
- **4.4** The editors keep every current test assertion: behaviour is unchanged, only the look.

## 11. Out of scope

- New catalogue entities.
- Any change to the catalogue file format.

## 12. Risks

- **The largest legacy surface** (catalogue.css is 1,630 lines). Split the build into two
  commits on the area branch, read views then editors, and keep one gate.
- **TimetableTable is shared** with other areas. Remove it only when nothing imports it.
