# ADR 0124 — Stable ids for offerings and journeys

## Status

Proposed 2026-10-21. Taken from the catalogue versioning work on `Knowledge_Hub_V1`
(PR #126), without the document versions and chunk sets it was built with.

## Context

An offering's or journey's id is how everything outside a version names it: a precedent
decided in requirement work, an incoming change request, the organisation catalogue's
products, a bookmark. Changing an id meant removing the entity and adding it again, as
ADR 0121's context records, so everything that named the old id lost it. ADR 0121 gives
systems, concepts and terms `replaced_by` for retiring one thing in favour of another; an
offering or journey that is only renamed is still the same thing and should not be retired.

## Decision

1. `ProductOffering` and `Journey` gain `former_ids`: the ids they had before a rename,
   each once, never the current id.
2. Within a version, an id names one offering, current or former, and one journey; the
   version refuses anything else.
3. Renaming is its own edit (`POST .../offerings/{id}/rename`, `.../journeys/{id}/rename`).
   It moves every reference in the version to the new id (a journey's offering, a
   conflict's scope) and keeps the old id. Renaming back to an earlier id takes it out of
   the former ids, so a rename can be undone.
4. What names an offering from outside the version resolves a former id to the current
   one: precedents, the organisation catalogue's products in an assessment, change requests
   and suggestions (`find_offering`), and the catalogue's own pages, which redirect.
5. The version diff reports a rename as one change with `id` among its fields, not a
   removal and an addition.
6. Every catalogue file format carries `former_ids`, so a file round trip keeps them.

## Consequences

- requirement-portal should resolve an offering or journey id it stored through
  `former_ids` before treating it as gone
  (`docs/architecture/requirement-portal-handoff-catalogue.md`).
- Former ids are kept for good; a version may not reuse one for a different entity. An id
  given up by mistake is reclaimed by renaming back.
- Systems, concepts and terms keep ADR 0121's model; renaming them is not covered here.

## Alternatives considered

- **Retire and replace (ADR 0121) for offerings and journeys.** It would keep two entities
  where there is one, and every reader would follow `replaced_by` to reach what was only
  renamed.
- **Opaque, never-changing ids with a separate display key.** Cleaner, but every stored
  reference, file format and address would change at once.
