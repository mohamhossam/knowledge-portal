# ADR 0123 — Co-mastery, the remaining suggestion kinds, and library classification

## Status

Accepted 2026-10-21 by the owner, who decided each point as follows:

1. Co-mastery: as proposed (decision 1).
2. Suggestion kinds: **every** remaining type, not only interfaces. Capability domains,
   portfolio nodes, realisation records, sources and conflicts are suggested too, each
   reviewed like any other suggestion. This replaces decision 2 below; its "Alternatives
   Considered" entry is the owner's choice.
3. Library classification: type and taxonomy topics, **English only, with no language
   field**, since the library takes English documents only. This narrows decision 3.

Implemented in full, in slices: `docs/slices/shared-mastery.md` (1),
`docs/slices/library-classification.md` (3), and for 2 `docs/slices/interface-suggestions.md`,
`docs/slices/tree-suggestions.md`, `docs/slices/realisation-suggestions.md` and
`docs/slices/source-conflict-suggestions.md` (interfaces, capability domains, portfolio nodes,
realisation records, sources and conflicts).

Proposed 2026-10-21. Records the three decisions left from review item O7 of the portal
review ([report](https://claude.ai/code/artifact/d5147883-5ccd-472f-a57a-6a2464b2fd53)).
The code clean-ups from the same item, one way of comparing names and capabilities in their
concept's domain, shipped without an ADR (`docs/slices/model-cleanup.md`). Each decision
below is the owner's to make; each says what is recommended and why.

## Context

1. **Two systems of record for one entity.** The committed catalogue has CBCM and
   Netcracker CRM both mastering Customer (`entity-customer`), while the model says
   "a system masters an entity when it is the system of record for it". Nothing says what
   two masters mean. The impact ripple already follows every master (`ripple.py`), so the
   behaviour is defined, but the meaning is not.
2. **Entities a document cannot suggest.** Systems, components, capabilities,
   constraints, dependencies, landscape domains and placements, offerings, journeys,
   channels, questions, concepts, component links and vocabulary terms each have a
   suggestion kind. Capability domains, interfaces, realisation records (CFS, RFS,
   resources), portfolio nodes, sources and conflicts do not, so they reach a draft only
   through the editor or a catalogue file.
3. **An unclassified library.** A library document carries a title, an owner, versions,
   publications and reviews, but no type, topic or language. So the library cannot be
   faceted by the catalogue's own taxonomy.

## Decision (proposed)

1. **Allow co-mastery, and make each co-master say its share.** An information entity
   may have several systems of record when each says which part it masters: a short note
   per mastered entity, such as "Customers migrated to Netcracker" (an optional
   `mastery_notes` map on the system, keyed by entity id). The draft's Check step lists any
   co-mastered entity whose masters do not each carry a note; it never refuses one. The
   ripple keeps following every master.
2. **Add an interface suggestion kind, and no other.** Integration documents describe
   interfaces more than anything else they say, and since ADR-0119 an accepted interface
   feeds the derived dependencies. The others stay out:
   - Capability domains and portfolio nodes are structure, changed rarely and on purpose.
   - Realisation records come from CFS, RFS and resource inventories, which import whole
     through a catalogue file.
   - Sources and conflicts are the governance record of what a maintainer trusts, so a
     model must not write its own.
3. **Classify library documents by type, language and taxonomy topics**, each optional:
   - a type from a new `library_type` vocabulary (such as SDD, process book, contract);
   - the language, as architecture documents already carry it;
   - topics as concept ids from the business capability scheme, so the facets are the
     catalogue's own concepts.

   Unclassified documents read as before.

## Consequences

- Co-mastery becomes a reviewable statement, not an accident. The committed catalogue's two
  notes (CBCM and Netcracker CRM on Customer) came from the owner on 2026-10-21: customers are
  migrating to NC Digital, NC CRM's customer management is replicated to CBCM until the
  migration ends, and NC CRM is then the only master.
- An interface suggestion kind adds one candidate kind, with its classify, apply, file and
  UI parts, the size of the channel kind (ADR-0101). The other entity types stay curated by
  hand or by file.
- Library classification adds three optional fields and a facet to the library search.
  HYPOTHESIS: curators would filter the library by type and topic. No research says so
  yet, so this decision is the one most worth checking with curators before building.

## Alternatives Considered

- **One master per entity, the other a reader.** Simpler, but wrong for a migration, where
  both systems are of record for different customers. It would also require recurating the
  committed catalogue first.
- **A suggestion kind for every entity type.** Complete, but it hands governance records
  and structural trees to a model, and multiplies review work for entities that rarely
  change.
- **Free-text library tags.** Cheap, but they drift from the taxonomy that this portal
  exists to curate.
