# Area 5: Requirement knowledge

**Branch:** `feat/kb-redesign/requirement-knowledge` · **Gate:** GATE 8.5 · **Journey:** none of
the five. It is the "Requirements" rail area.

## 1. Goal

Rebuild the requirement-knowledge pages:

- **Overview**;
- **Requirements** (Browse);
- **Findings** (a queue of possible duplicates and contradictions);
- **Historic requirements** (Browse + Record, with the Azure DevOps breakdown).

Use the design system, keep the current URLs, and label the area "Requirements" in the rail.

Health claims ("all indexed") appear only when there is something to count. Filter strips hide
at zero.

## 2. Routes

| Current | Target |
|---|---|
| `/requirement-knowledge` | same (Overview) |
| `/requirement-knowledge/requirements` | same |
| `/requirement-knowledge/findings` | same |
| `/requirement-knowledge/historic`, `/historic/:id` | same |

There are no URL changes, so this area needs no redirects.

## 3. Files

| Action | Path |
|---|---|
| Rewrite | `requirements/RequirementKnowledgePage.tsx`, `CorpusRequirementsPage.tsx`, `CorpusFindingsPage.tsx`, `knowledgeHead.tsx` (→ `PageHeader` + `SubNav`), `BulkReindex.tsx` (→ a job + a consequence panel), `CorpusActionForm.tsx`; `historic/HistoricListPage.tsx`, `HistoricRecordPage.tsx`, `Breakdown.tsx` (→ `DataTable` + `DiffView`-style change lists) |
| Keep (logic) | `requirements/knowledge.ts`, `historic/historic.ts` |
| Remove (in the merge) | `styles/knowledge.css` |
| Tests | Adapt `requirementKnowledge.test.tsx` and `historic.test.tsx` |

## 4. Prototype reference

**Empty states only** (`pages/States.tsx` `RequirementsEmpty`). Offline, the seed has no
requirement corpus and no historic records: Phase 0 recorded that these screens can be critiqued
as empty states only (GATE 0).

- **The populated views are not prototyped.** Build them from the archetypes:
  - Browse: `DataTable` + `FilterStrip`;
  - Queue: findings, one decision each;
  - Record: a historic requirement with a breakdown table and change lists.
- **Impeccable resolves the gaps.**
- **Populated states** are verified with **frontend-only test fixtures** in component tests
  (backend files are out of bounds). The e2e covers the empty states on the seeded stack.

## 5. Archetype and components

| View | Archetype | Components |
|---|---|---|
| Overview | Record | `PageHeader`, `Facts`, `EmptyState` |
| Requirements | Browse | `FilterStrip` (hidden at zero), `DataTable`, `Pagination` |
| Findings | Queue | `Section`s per kind; each finding with the two requirements as quotes, and decide buttons with a reason (`ConsequencePanel` where the API takes one) |
| Historic list | Browse | `DataTable`, `Upload` ("Import BRDs…" as a flow) |
| Historic record | Record | `PageHeader`, `SubNav` or `Tabs`, `DataTable` (breakdown), change lists, external links to Azure DevOps (`ProvenanceLine`) |
| Bulk reindex | Consequence + Job | `ConsequencePanel`, `JobStatus` in Jobs |

## 6. States

- **Empty:** the three copy lines already prototyped.
- **Loading.**
- **Requirement AI unreachable:** a section-level error; the counts are unknown, not zero.
- **Reindex:** working, failed (with cause and retry) and done.
- **Long and mixed-language titles**, and BRD names in Arabic.

## 7. Interaction

- **Findings:** roving through the list; one tab stop per section.
- **Requirements:** the filters and pagination are kept in the URL.

## 8. Content

The label is "Requirements" in the rail and "Requirement knowledge" in the page title (it keeps
the current document title for continuity). Glossary terms: Requirement · Finding · Historic
requirement · Reindex.

## 9. Backlog items

None.

## 10. Acceptance criteria (area-specific)

- **5.1** No health claim renders when its count is 0 (unit).
- **5.2** The populated fixtures for Requirements, Findings and the historic record pass `axe`
  in component tests (vitest-axe) and render in both themes (a visual test with fixtures in the
  component suite, or a gallery entry).
- **5.3** The empty states on the seeded stack match the prototype copy (e2e).

## 11. Out of scope

- Any change to how requirement-portal supplies the corpus.

## 12. Risks

- **Low evidence:** there is no seeded data and no prototype for the populated views. Flag this
  at GATE 8.5, and offer an Impeccable critique with fixtures.
