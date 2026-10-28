# ADR 0129 — Precedents are compared by the needs they were read with

## Status

Proposed 2026-10-28, for the product owner's review in the pull request that adds it. It
changes how ADR-0114 Amendment 1's precedent lane compares requirements, and needs a
requirement-portal change to take effect (below).

## Context

The precedent lane (ADR-0114 Amendment 1) finds the decided requirements nearest the one being
assessed by embedding each requirement's text. A precedent keeps the first `TEXT_LIMIT` (4,000)
characters of its requirement; since ADR-0114 Amendment 4 the lane cuts its query the same way.
For a long requirement, that compares the opening 4,000 characters of each: on 2026-10-28 one
requirement was 45,189 characters across 292 items, so the comparison saw under a tenth of it,
and mostly its preamble.

The assessment's reader already reads the whole requirement as need facets: short search phrases,
one per distinct need, at most 24 (`MAX_FACETS`). They are what the assessment's concept and
passage lanes search with. They are a better summary to compare by than any prefix of the text.

A precedent must be compared with the same text on both sides. The two sides are the precedent
`RecordPrecedent` keeps and the query the lane builds, so both must have the needs, and one
function must build the text from them.

knowledge-portal does not keep the assessments it answers, so it cannot look up, when a decision
arrives, the needs it read that requirement with. requirement-portal keeps each assessment as
its analysis' product impact and is what sends the decision. It has the assessment's facets in
the answer (`AssessedFacet`, with `kind` and `text`), but keeps only the capability concepts the
needs reached (`ProductImpact.needs`, as `CapabilityNeed`), not the need phrases.

## Decision

1. **A precedent may carry its needs.** `POST /internal/architecture/precedents` takes an
   optional `needs` (at most 24 phrases of at most 1,000 characters): the need facets of the
   assessment the decision was on. It is additive: internal contract 1.2.0. `Precedent` keeps
   them (`needs`, empty for one sent without them).
2. **One function builds the text compared.** `needs_text(needs)` gives the same text whatever
   the reader's order, case or spacing: each need with its spacing made single and lowercased,
   once, in alphabetical order, one per line, cut at `TEXT_LIMIT`. `RecordPrecedent` embeds a
   precedent with needs by it, and the lane embeds the assessment's own need facets by it.
3. **Two text versions never share a vector space.** A precedent compared by its needs is kept
   under `"<embedding model>#needs-v1"` (`needs_space`); one compared by its text stays under the
   embedding model's name alone, as every precedent was before. The store already separated
   vectors by that key (`nearest` filters on it), so no migration is needed, and a later text
   version only needs a new suffix.
4. **The lane prefers needs, and never mixes.** It embeds the assessment's needs text and its
   cut text in one call. It searches the needs space first; only when that space holds no other
   decided precedent does it search the text space instead. Each assessment's precedents are
   ranked within one space. A requirement read without needs is compared by its text.
5. **Existing precedents are kept as they are.** Their vectors stay in the text space, and are
   not re-derived: the needs they were assessed with were never kept, and reading their stored
   4,000 characters again would give different needs from the ones assessed. They keep serving
   the lane until the first precedent with needs arrives, and keep counting in the summaries
   after. A decision made again on an analysis replaces its precedent, with needs if
   requirement-portal sends them.

## requirement-portal change (not in this ADR's pull request)

For the lane to compare by needs, requirement-portal must send them:

- Keep the assessment's need phrases with the product impact: from the assessment answer's
  `facets`, the `text` of each whose `kind` is `need`, in the answer's order (for example a
  `need_texts: tuple[str, ...]` on `ProductImpact`, empty for impacts recorded before it).
- Send them in `precedent_handoff` as `"needs"` (at most 24, each at most 1,000 characters).
  It is safe to send before this ships: a knowledge service at 1.1.0 ignores a field it does
  not know (`PrecedentBody` does not forbid extra fields), and keeps the precedent by its text.

Until then, every precedent is recorded in the text space and the lane behaves as under
ADR-0114 Amendment 4.

## Consequences

- Two requirements that need the same things are found alike even when their documents open
  differently, and the whole of a long requirement counts, not its first 4,000 characters.
- Each assessment embeds two short texts for the lane instead of one, in one call.
- Once the first precedent with needs is kept, precedents without needs are no longer lent as
  examples, though they still count in monitoring. With few precedents kept so far, this was
  judged better than ranking two text versions together.
- The golden set's leave-one-out run seeds precedents without needs, so it still measures the
  text space; measuring the needs space means seeding from the reader's needs.

## Alternatives considered

- **knowledge-portal keeps the needs of every assessment it answers**, by requirement version,
  and looks them up when the decision arrives: rejected for now, as it adds a store of
  assessments this service does not otherwise keep, keyed by versions it is not told.
- **Read the precedent's stored text again for its needs:** rejected; the needs would differ from
  those assessed, and every decision would cost a model call.
- **Embed needs and text into the same space:** rejected; similarities of two text versions are
  not comparable.
