# Service blueprint — knowledge portal

Phase 2 · Define. This blueprint shows the front stage (what the curator sees), the back stage
(jobs, extraction, the AI model) and the requirement-portal touchpoints for the two burst
journeys, plus the cross-cutting check-in.

**Sources:**

- the contract;
- `src/knowledge_portal/infrastructure/requirement_client.py` (outbound calls);
- AGENTS.md §2.1 (inbound `/internal/*`).

Future front-stage lines are **HYPOTHESIS**.

## Lanes

| Lane | Description |
|---|---|
| **Evidence** | What the person sees: the screens and states |
| **Front stage** | Curator actions in the UI |
| **Line of interaction** | — |
| **Back stage: this portal** | API, jobs (`/jobs/{id}`, retry, cancel), extraction, malware scan, index builds, the AI model (fake offline) |
| **Line of internal interaction** | — |
| **Support: requirement-portal** | Over internal APIs (ADR-0099) |
| **Failure points** | ⚠ marks where it fails today and the designed recovery |

## A. Library publication

| | Upload | Scan + read | Review | Approve | Search build | Withdraw / replace |
|---|---|---|---|---|---|---|
| **Evidence** (future) | Upload drawer; the Jobs badge | Row and state line: Working → Done; the Jobs panel | Review desk with progress | Consequence panel → outcome line | "Search build" preview → Activate | Consequence panel with "Cited by N" |
| **Front stage** | Drop files | Wait or leave | Keep, edit or exclude; bulk; save | Approve with a summary | Preview, activate or discard | A reason, then confirm |
| **Back stage** | `POST /library/ingestions` | Scan (`scanning`; `quarantined` on malware), then extract (`extracting` → `ready_for_review`) | `POST …/versions/{v}/review` (revision with `expected_version`) | `POST …/approval`, which creates a Publication, then indexing | `POST …/builds`, `GET …/builds/preview`, `…/activation` | `POST …/withdrawal`; new version via `ingestions` |
| **requirement-portal** | — | — | — | Published passages become citable through `/internal/*` search and citation | The index serves its search | `GET /internal/references/{doc}/dependents` and `/impact` (who cites it); **retain-or-revise is decided in requirement-portal** |
| **Failure points** | ⚠ Over-limit or unsupported type: the refusal is stated per file | ⚠ `failed` (parse), `quarantined`, a stale lease: Needs attention with the cause and fix; retry or cancel | ⚠ 409 stale version: a modal choice that keeps unsaved decisions | ⚠ Indexing failed: retry from the state line and the Jobs panel | ⚠ The build fails: discard and retry | ⚠ requirement-portal unreachable: "Couldn't read who cites it", **and Withdraw still states that the count is unknown** (never "0") |

## B. Catalogue release

| | New draft | Sources | Decide | Hand edit | Changes | Check | Publish |
|---|---|---|---|---|---|---|---|
| **Evidence** (future) | Flow → workspace | Step 1 with reading state | Step 2 Queue, Suggested marks, Undo | Edit pages in the workspace | Step 3 Compare with origin | Step 4 build + samples + impact | Step 5 consequence panel → outcome recap |
| **Front stage** | Name it | Add documents, import a file | Accept, reject, edit; bulk ready set | Edit systems, areas, offerings, journeys | Read | Build; compare samples | A reason → publish |
| **Back stage** | `POST /releases` | `POST …/documents[/batch]`; extraction job (`ArchitectureJobKind.extraction`) by the **AI model** (`model`, `prompt_version`), producing Suggestions with `citations` | `POST …/suggestions/{id}/decision` (final), `…/acceptance` (bulk), `…/rejection` | `PUT …/releases/{id}`, `…/systems/{sid}` | `GET …/changes` | `POST …/build` (index job); `POST …/compare-impact`, `…/preview-impact`; sample requirements | `POST …/publish` (built first; **client-orchestrated**, BG7) → active |
| **requirement-portal** | — | Change requests arrive from requirement work (`ChangeOrigin: requirement-ai`, `explorer`) | — | — | — | `GET /internal/architecture-mapping/stats`, which feeds the mapping impact (`outdated_requirements`, …) | Mapping now runs against the new version in service; earlier mappings show as outdated there |
| **Failure points** | ⚠ A draft already exists (409): offer to open it | ⚠ Reading failed or slow: Jobs panel, retry or cancel | ⚠ 409 revision conflict: reload, keep the decision list. ⚠ A mis-key: the 6 s Undo | ⚠ 409 | ⚠ Undecided suggestions: say they are not included | ⚠ 429: countdown. ⚠ Build failed: retry | ⚠ The tab closes mid build-then-publish: "Keep this tab open"; the Jobs panel shows its state. ⚠ A different embedding profile (409): explained in words |

## C. Check-in and re-confirmation (cross-cutting)

| | Arrive | Act | Re-confirm |
|---|---|---|---|
| **Evidence** | Your work (Mine) | The target page, focus on the h1 or row | Re-confirmations Queue |
| **Back stage** | `GET /reviews/reminders`, documents, releases, organisation, jobs (derived; BG1) | — | `POST /architecture-knowledge/systems/reviews`; `POST /library/documents/{id}/review` |
| **requirement-portal** | `/internal/knowledge/corpus/summary` and `findings` (Requirements counts) | Links out to Requirement AI for requirement items | — |
| **Failure points** | ⚠ One area fails to load: a section-level message; the rest of the queue works. ⚠ Nothing due: say so | — | ⚠ A bulk confirmation needs a note, and names its items |

## Roles across the blueprint

| Role | Where they act |
|---|---|
| **Analyst** | A: upload and review |
| **Owner** | A: approve, withdraw, return to service, re-confirm |
| **Architect** | B: everything; ownership |
| **Admin acting for an owner** | A: "act as admin", with an audit trail |
| **Maintainer** | C: re-confirm systems |
| **Reader** | Explorer only, version in service |
| **requirement-portal** | A machine actor through `/internal/*` (both directions) |
