# ADR 0119 — One canonical dependency model

## Status

Accepted 2026-10-21 by the owner, implemented in two slices: the dependency itself (points
2 and 3, `docs/slices/dependency-identity.md`) and the derived suggestions (point 1, with
point 4's fallback retirement), which follows.
Proposed 2026-10-19. Implements review finding #7 of the portal review
([report](https://claude.ai/code/artifact/d5147883-5ccd-472f-a57a-6a2464b2fd53));
pairs with the adjacent-systems fallback shipped as the stop-gap (#109).

Settled while implementing point 3: the merge happens whenever a release is built or read,
so a stored release of either shape loads; a suggested dependency that states a kind
means the one of that kind or the pair's unspecified one, one that states none means the
unspecified one or the pair's only one, and a new purpose joins the description rather
than replacing it.

## Context

Three models express "system A talks to system B", and they are never reconciled:

- `SystemRelationship` (`domain/architecture/knowledge.py`): typed and directed, but the
  committed SMB catalogue records none, its identity includes its prose
  (`(source, target, description.casefold())`, so a re-wording diffs as remove+add and the
  same pair may repeat with different wording), and it is the only catalogue fact with no
  `confidence` or `source`.
- `SystemInterface` consumers and relays: 42 in the committed catalogue, curated, carried
  by `ripple.py`.
- `ActivityIntegration` from/to/via on journey activities: 165 in the committed catalogue.

`neighbours.py` walked only relationships, so adjacency was empty on the catalogue that
matters; #109 added a read-side fallback onto interfaces. Nothing derives one model from
another or checks them against each other, so the three drift apart as the catalogue grows.

## Decision

`SystemRelationship` is the one canonical edge for dependency questions (adjacency, impact
breadth). The other two models are *sources* that feed it through review, never silent truth:

1. A draft's build derives relationship **candidates** from the release's interfaces
   (consumer→exposer for APIs; exposer→consumer for events and files) and from journey
   integrations (from→to, via relays), using the existing `CandidateKind.RELATIONSHIP` and
   the standard accept/reject review. A derived candidate cites the interface or activity
   it came from.
2. `SystemRelationship` gains `confidence` and `source`, like every other fact.
3. A relationship's identity becomes `(source, target, kind)`; `description` becomes an
   attribute, so re-wording reports as CHANGED and one pair holds at most one edge per
   kind. One-time migration note: existing snapshots with several same-kind edges per pair
   merge their descriptions on first read; the diff between an old and a new snapshot
   reports those merges once.
4. The #109 read-side fallback stays until relationships exist in the active release, and
   is retired in the release after curators accept the derived edges.

## Consequences

- One answer to "what depends on what", with a human gate before any derived edge becomes
  canonical; interfaces and journeys keep their richer semantics for their own views.
- Deriving candidates adds a build step and curator work proportional to the catalogue's
  interface count (42 today).
- The identity change can surface duplicate same-pair edges in old snapshots as one-time
  diff noise.

## Alternatives Considered

- **Answer adjacency live from interfaces and integrations (no canonical model).**
  Rejected: edges would appear and vanish with no review, the three models would still
  disagree, and every consumer would need its own merge rules.
- **Make interfaces the canonical model and retire relationships.** Rejected: journeys
  express hand-overs interfaces do not, and a interface-less dependency (a batch job, a
  manual step) still needs an edge.
