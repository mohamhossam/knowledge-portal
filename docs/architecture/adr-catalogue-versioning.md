# ADR — Catalogue versioning: document lineage, stable ids, reusable chunk sets, and source review

## Status

Proposed 2026-10-20, after `adr-section-v4-chunking.md`. The number is for the owner to assign.

## Context

The curated catalogue (Case A) lives in one versioned release; uploaded documents (Case B) are
parsed, chunked and embedded into the release's index. Reviewing this design showed:

- A new version of a document was a new, unrelated document: the old version stayed in the
  draft unless removed by hand, and both were then searched, old and new text side by side.
- Nothing said which facts the catalogue took from the old version that the new one no longer
  states.
- An offering or journey renamed in a release appeared as removed plus added; precedents,
  change requests and the organisation catalogue that named the old id silently stopped
  finding it.
- Offerings and journeys were edited only as whole lists, by replacing every one at once.
- Every build re-read, re-parsed and re-chunked every document and copied every chunk row,
  even when only one system changed; each draft build left its index behind.
- When a release changed a system, documents could still describe the old behaviour, and the
  reasoner could quote them.

## Decision

1. **Document lineage.** A document version may replace one the draft holds (`replaces` on
   upload). The new version keeps the document's id (`document_id`) and names the version it
   replaced (`supersedes`), and takes its place: a version holds one version of each document.
   Older releases keep the older version.
2. **What a new version no longer says.** Reading a new version compares what it states with the
   suggestions accepted from every earlier version of the document. A fact still in the draft
   that the new version no longer states is listed on the reading (`no_longer_stated`) for the
   curator to re-confirm, change or remove. Nothing changes on its own.
3. **Stable ids.** Offerings and journeys keep the ids they had before a rename (`former_ids`).
   Renaming (`POST …/offerings/{id}/rename`, `…/journeys/{id}/rename`) moves the version's
   references (journeys, conflicts) to the new id. The diff reports a rename as a change with
   "id" among its fields. Precedents, change requests (`find_offering`) and the organisation
   catalogue's offering ids resolve through former ids. An id names one entity, current or
   former, within a release.
4. **One at a time.** `PUT` and `DELETE …/offerings/{id}` and `…/journeys/{id}` edit one item.
5. **Chunk sets.** A document version's chunks, and the catalogue's record chunks, are a chunk
   set stored once under a key of what they were cut from and how (document version, checksum,
   title, and the index profile: embedding model, tokenizer and index version). A release index
   is its own links plus the sets it reads (its members). A rebuild cuts and embeds only what
   changed; links are always recomputed, since they depend on the catalogue. After a build the
   draft's earlier builds are deleted, then every set no index reads (after a grace period, so a
   build in progress never loses one it has just found).
6. **Source review before publishing** (Check step):
   - *Provenance*: facts whose every source document has left the draft.
   - *Drift*: passages of the draft's documents that name a system, offering or journey the draft
     changes or removes (by the names the version in service uses). A curator can mark a passage
     outdated: it stays in the index and readable by its citations, but is never searched (a
     section-v4 child is left out with its parent). Marks are part of the release and carry to the
     next draft.

## Consequences

- **Win:** old and new text of one document never compete; a dropped fact is surfaced; renames
  keep history working; a build after a small edit re-embeds nothing and re-stores only the
  records; storage stops growing with every draft build; stale passages can be kept out of the
  evidence without deleting the document.
- **Lose:** an index read joins its members (one extra query for the member list); chunk sets
  need collection; marks need a rebuild to take effect; two more tables
  (`architecture_index_members`, `architecture_index_outdated`) and a migration
  (`202610201100_chunk_sets`).
- **Risks:**
  - *A set collected while a build uses it*: prevented by the grace period (60 minutes).
  - *Drift by name only*: a passage that describes a system without naming it is not listed;
    one that names it in passing is. The list is for review, never acted on automatically.
  - *No-longer-stated depends on the reading*: a model that misses a fact in the new version
    lists it as dropped. It is a review item, never a removal.
- **Deferred** (AGENTS.md §19): several drafts at once (change sets with per-entity conflicts at
  publish), until more than one team curates at a time; publishing "proposed" offerings so a
  later requirement matches the pending offering, which needs a product decision.
