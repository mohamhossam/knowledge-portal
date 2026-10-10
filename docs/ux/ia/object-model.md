# Object model (OOUX) — knowledge portal

Phase 2 · Define. The objects people curate, as the UI should present them.

**Sources:**
- `contracts/knowledge-public.openapi.json` (schemas named in brackets). The redesign does
  not change this contract.
- PRODUCT.md.
- `docs/ux/research/synthesis.md`.

**Tags:**
- **[contract]** means the field or state exists in the API today.
- **[client]** means the UI can derive it without an API change.
- **[backend gap]** means it needs an API change. Backend changes are outside this epic, so
  these are recorded as dependencies, never assumed.

**Roles:**
- `admin` is `knowledge_admin`.
- `owner` is the document's owner (an admin).
- `maintainer` is `knowledge_maintainer`, which the catalogue uses for confirmations.
- `reader` is any signed-in user; readers reach the Explorer only (ADR-0101).

## 1. The object map

```
Library ───────────────────────────────────────────────────────────────
Document ─has many→ Revision¹ ─made of→ Passage ─cited by→ Citation ←─ Requirement²
   │  owned by Person          ↑ reviewed in Review            (requirement-portal)
   ├─ Publication (approved Revision, in service / withdrawn) ─indexed by→ Index build
   └─ Job (ingestion: scan → extract → ready / failed)

Catalogue ─────────────────────────────────────────────────────────────
Release (draft | published; one is in service)
   ├─ System ─Dependency→ System        ├─ Domain (capability / landscape)
   ├─ Offering ─has→ Journey ─steps→ System    ├─ Channel
   ├─ Source document → Suggestion (AI) ─cites→ Evidence (passage of a source)
   └─ Job (extraction, build index) · Mapping impact (vs requirement work)

Ownership ─────────────────────────────────────────────────────────────
Value stream ─has→ Product ─uses→ System ←runs─ Squad ─has→ Person (contact, scrum master)

Cross-cutting: Review (re-confirmation) · Job · Audit event (provenance)
```

¹ *Revision* is the reviewed state of one uploaded *version* of a document. In the UI,
"version" means an uploaded file and "revision" is never shown. See the glossary.
² A requirement lives in requirement-portal. Here it appears only as a citing reference.

## 2. Objects

Each object lists its attributes, relationships, actions (with who can act) and states.
"Shown as" gives the label the UI uses, in line with the glossary.

### Document [`LibraryDocument`]
- **Shown as:** Document.
- **Attributes:**
  - title (Arabic or English, `dir="auto"`);
  - owner;
  - versions;
  - publications;
  - review fingerprint;
  - "cited by" count [client, from dependencies].
- **Relationships:**
  - has Versions;
  - has Publications (0–1 in service);
  - owned by a Person;
  - cited by Citations;
  - affects Requirements (source impact).
- **Actions:**
  - upload or replace with a new version (admin);
  - review (owner, or an admin acting for the owner);
  - approve and publish (owner);
  - withdraw (owner or admin, reason required);
  - return to service (owner; **new framing** over the existing approve endpoint);
  - transfer ownership (admin);
  - act as admin (grant or end, with an audit trail);
  - re-confirm (owner, when due).
- **States (shown):**
  - *Uploading*;
  - *Being read* (scan or extract);
  - *Ready for review*;
  - *In service*, optionally with a newer version awaiting review;
  - *Withdrawn*;
  - *Failed*: could not be read;
  - *Held*: failed the malware scan (`quarantined`);
  - *Stopped*: cancelled.

  These map from `IngestionStage` and `Publication` [contract].

### Version (uploaded file) [`LibraryVersion`]
- **Attributes:**
  - number;
  - filename;
  - MIME type;
  - size;
  - uploaded by and when;
  - stage;
  - warnings, with severity info, warning or blocking;
  - blocks.
- **Actions:**
  - retry reading;
  - cancel reading;
  - open the original.
- **States:** the `IngestionStage` values: queued, scanning, extracting, ready_for_review,
  failed, quarantined, cancelled.

### Passage [`blocks`, `ReviewedPassage`, `PassageView`]
- **Attributes:**
  - text as extracted;
  - text as reviewed;
  - kind (heading, paragraph, list item, table row, image, worksheet range);
  - location in plain words [client, from `section_path` and `label`];
  - warnings;
  - included or excluded, with the reason.
- **Relationships:**
  - belongs to a Version;
  - published in a Publication;
  - cited by Citations;
  - original preview.
- **Actions** (owner, during review): keep, edit, exclude with a reason, restore the extracted
  text, open the original.
- **States:**
  - *Unseen* or *Seen* [client: local to the reviewer; recording it on approval is a
    **backend gap**];
  - *Kept*, *Edited*, *Excluded*;
  - *Blocks approval* (a blocking warning that is not excluded).

### Review (passage review of a version) [`RevisionRequest`, `ExtractionRevision`]
- **Attributes:**
  - decisions;
  - summary ("what you checked, what you changed");
  - created by and when;
  - acting on behalf.
- **Actions:** save the review; approve and publish.
- **States:**
  - *Not started*;
  - *In progress (unsaved changes)* [client];
  - *Saved*;
  - *Approved*, which becomes a Publication.

### Publication [`Publication`]
- **Attributes:**
  - approved by and when;
  - activated at;
  - chunk count;
  - chunking policy (standard or table-aware);
  - replaces;
  - withdrawn by, when and why;
  - indexing attempts and error.
- **Actions:**
  - build an index (table-aware);
  - preview, activate or discard a build;
  - retry indexing;
  - withdraw.
- **States:**
  - *Indexing*;
  - *In service*;
  - *Indexing failed* (with retry);
  - *Awaiting activation*;
  - *Withdrawn*.

### Index build [`builds`, `IndexState`]
- **Shown as:** "Search build". This replaces "table-aware version", "search version" and
  "index".
- **States:**
  - *Current*;
  - *Waiting*;
  - *Failed*;
  - *Needs rebuilding* (`rebuild_required`).
- **Actions:** preview, activate, discard, retry.

### Citation [`LibraryDependency`, `CitingDependency`]
- **Attributes:**
  - requirement title and id;
  - statement;
  - analysis round;
  - whether it cites the current publication.
- **Actions:** none here (read-only). "Open in Requirement AI" is the hand-off.
  Retain-or-revise is decided in requirement-portal.
- **States:** current, or cites an older edition (`publication_current`).
- **Caveat** (always shown): only requirements the viewer can see.

### Release [`KnowledgeReleaseResponse`]
- **Shown as:**
  - *Catalogue version*;
  - a *Draft* while unpublished;
  - *In service* for the active one.
- **Attributes:**
  - name;
  - status;
  - revision;
  - created by;
  - published by and when;
  - built revision and index profile;
  - change history;
  - its systems, relationships, domains, products, journeys, channels, sources and conflicts.
- **Relationships:**
  - compared with another Release;
  - has Source documents and Suggestions (draft);
  - Mapping impact against requirement work.
- **Actions:**
  - new draft (admin);
  - rename;
  - remove (draft only);
  - edit by hand;
  - read sources;
  - decide suggestions;
  - import or export the catalogue file;
  - build for matching;
  - check samples;
  - publish, which puts it in service (admin, reason required);
  - put an earlier version back in service (admin, reason required);
  - export (Excel, YAML, JSON);
  - compare any two.
- **States:**
  - *Draft*: needs decisions, ready to build, built, or checked [client, derived];
  - *In service*;
  - *Replaced* (published, not active).

### System [`SystemDefinitionSchema`]
- **Attributes:**
  - id;
  - name and Arabic name;
  - aliases;
  - description;
  - capabilities and components;
  - constraints;
  - phrases used for matching;
  - domain placement;
  - owner squad and contact [from Ownership];
  - review standing (current, due soon, overdue).
- **Relationships:**
  - Dependencies (in and out);
  - part of Journeys and Offerings;
  - placed in Domains;
  - run by a Squad.
- **Actions:**
  - edit, add or remove (draft only);
  - re-confirm (maintainer);
  - give to a squad (Ownership).
- **States:** in this version, added, changed or removed (vs in service); confirmed, due or
  overdue.

### Dependency [`SystemRelationshipSchema`]
- **Shown as:** "Connection".
- **Attributes:**
  - from and to system;
  - kind (calls the API of, publishes events to, transfers data to, orchestrates,
    unspecified);
  - "for what".
- **Shown direction rule:** always shown as a sentence read from the current system, e.g.
  "CWOM sends events to BSCS".
- **Actions:** add, change or remove (draft).

### Domain [`CapabilityDomainSchema`, `LandscapeDomainSchema`]
- **Shown as:** Capability area (capability) and Landscape area (landscape).
- **Attributes:** name and Arabic name; parent; placed systems.
- **Actions:** add, edit, remove, and place a system (draft).

### Offering [`ProductOfferingSchema`]
- **Shown as:** Offering.
- **Attributes:**
  - name and family;
  - proposition;
  - rules;
  - order types (enabled or not);
  - components, with realisation (CFS, RFS, resource);
  - NFRs (defined, partial or missing);
  - values and audiences;
  - plans and prices (from the product catalog, read-only).
- **Relationships:** has Journeys; uses Systems; sold through Channels.
- **Actions:** edit (draft); read plans (all).

### Journey [`JourneySchema`]
- **Attributes:**
  - name;
  - offering;
  - order type;
  - channel;
  - phases and steps (system, action, rule: decision, loop or parallel);
  - order tracking milestones.
- **Actions:** edit (draft); read (all, including in the Explorer).

### Channel
- **Attributes:** name; assisted or digital; the journeys that run through it.
- **Actions:** edit (draft).

### Source document (catalogue) [`KnowledgeDocumentVersionResponse`]
- **Attributes:** title; language; file; uploaded by; reading state.
- **Actions:** add; remove; read; cancel or retry reading.
- **States:** the `ArchitectureJobStatus` values: queued, running, succeeded, failed, cancelled.

### Suggestion [`CatalogueSuggestionResponse`]
- **Shown as:** Suggestion, always marked **Suggested** until a person decides.
- **Attributes:**
  - kind (system, component, capability, constraint, connection, landscape area, placement,
    offering, journey, channel, question);
  - content;
  - match (new, updates existing, already present, needs a system or a component, …);
  - basis (*stated* or *inferred*);
  - rationale;
  - citations;
  - model and prompt version;
  - possible matches;
  - decided by and when;
  - edited [contract].
- **Actions** (admin): accept; accept with edits; reject; bulk-accept the ready set; reject a
  group.
- **States:**
  - *Suggested* (proposed): needs you, waits for another, or ready;
  - *Accepted* (maybe *edited*);
  - *Rejected*.

  Decisions are final in the API.
- **Undo:** the UI offers a **client-side delayed commit with an Undo window** [client]. A
  true reopen is a **backend gap**. "Accepted in bulk" is known only in the session; recording
  it is a **backend gap**.

### Evidence [`DocumentEvidenceBlock`, `SuggestionView`]
- **Attributes:** passage text; quoted line; location; document and version; neighbours.
- **Actions:** open in context.
- **States:** none (read-only).

### Mapping impact [`MappingImpactResponse`, `ImpactComparisonResponse`]
- **Attributes:**
  - requirements, features and stories mapped;
  - those that would become outdated;
  - per-sample "in use vs this version".
- **Actions:**
  - preview impact (draft vs in service);
  - check samples;
  - compare any two versions.
- **States:**
  - *Not checked*;
  - *Checked*: kept for the session [client], since results are not stored by the API;
  - *Stale*: the draft changed since the check [client, via `revision`].

### Squad [`SquadSchema`]
- **Attributes:**
  - name;
  - value stream;
  - scrum master;
  - systems run, each with a contact.
- **Actions** (admin): add; edit; remove, which names the systems left without a squad [client].

### Person [`PersonSchema`]
- **Attributes:** name; email; team; active.
- **Roles held [client]:** value stream lead, scrum master, system contact.
- **Actions:** add; edit; deactivate (blocked while holding a role, with the reason).

### Value stream [`ValueStreamSchema`] and Product [`ProductSchema`]
- **Value stream:** name and lead.
- **Product:** name; description; systems; value stream.
- **Actions:** add, edit and remove. Removal is blocked while a value stream has content; a
  removed product's systems move to "Not in any product" [client wording].

### Review (re-confirmation) [`Reminder`, `ReviewState`]
- **Shown as:** Re-confirmation. This is never called "review", which stays for passage review
  and suggestion review.
- **Attributes:** subject (document or system); standing (current, due soon, overdue); due date.
- **Actions:** confirm it is still right (owner or maintainer, with a note). Bulk confirmation
  within one group needs a note and names the items.

### Job [`ArchitectureJobResponse`, `IngestionStage`, `RunStatus`, `BrdStage`]
- **Attributes:**
  - kind (reading, indexing, building, comparing impact, reading a BRD);
  - subject;
  - attempts;
  - error category;
  - started by.
- **Actions:** retry; cancel (where the API offers it).
- **States (shown):**
  - *Waiting*;
  - *Working*;
  - *Done*;
  - *Needs attention* (failed);
  - *Stopped* (cancelled);
  - *Held* (quarantined).
- **Constraint:** there is **no job-list endpoint**. The Jobs panel derives jobs from documents,
  release extractions, builds and historic runs, plus the jobs this session started [client]. A
  global list is a **backend gap**.

### Audit event [`KnowledgeAuditEventResponse`, `OrganisationAuditEventResponse`, `change_history`]
- **Attributes:** action; actor; time; rationale and revision (catalogue).
- **Gap:** the organisation audit has no field-level before → after. That is a **backend gap**.
  The UI links each event to its subject instead [client].

### Requirement corpus, Finding, Historic requirement
- **Requirement (corpus).** Attributes: title; state (active or retired); index state. Actions:
  retire and reinstate (with a reason); reindex.
- **Finding.** A possible duplicate or contradiction, with its age. Action: ask the owner (once
  a week).
- **Historic requirement.** States: draft, published, withdrawn. It has BRDs, a breakdown into
  work items, and citations. Actions: import, read a BRD, refresh, publish, withdraw
  (irreversible, named citations).
- **Data source:** requirement-portal. When it holds nothing, the empty state says so and links
  out.

## 3. Who can act: summary

| Object | reader | admin | owner (its own) | maintainer |
|---|---|---|---|---|
| Document, Passage, Review | — | read, upload, transfer, act-as-admin | review, approve, withdraw, return to service, re-confirm | — |
| Release, Suggestion | Explorer: the release in service only | everything on drafts; publish; put back | — | — |
| System | Explorer: read | edit (draft) | — | re-confirm |
| Squad, Person, Value stream, Product | — | everything | — | — |
| Requirement corpus, Historic | — | per the existing screens | — | — |
| Job | — | retry and cancel where offered | — | — |

## 4. Backend gaps found (dependencies, outside this epic)

| # | Gap | Workaround in the UI |
|---|---|---|
| BG1 | No job-list endpoint | The Jobs panel is derived from the objects plus this session's jobs |
| BG2 | Approval does not record review coverage (seen passages) | "Seen" is kept locally for the reviewer; approval shows coverage, but does not store it |
| BG3 | Suggestion decisions cannot be reopened | Client-side delayed commit with an Undo window |
| BG4 | Bulk acceptance is not marked in provenance | Shown during the session only |
| BG5 | The organisation audit has no field diff | Events link to their subject |
| BG6 | Check results are not stored | Kept for the session, and marked stale when the draft's revision changes |
| BG7 | "Build, then publish" is orchestrated by the client | Stays as is; the UI states that the tab must stay open, and shows progress in the Jobs panel |
