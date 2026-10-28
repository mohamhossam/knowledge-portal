# ADR 0129 — Precedents are compared by the needs they were assessed with

## Status

Proposed 2026-10-28, for the product owner's review in the pull request that adds it. It
changes how ADR-0114 Amendment 1's precedent lane compares requirements. It needs no
requirement-portal change and leaves the internal contract as it is (1.1.0).

## Context

The precedent lane (ADR-0114 Amendment 1) finds the decided requirements nearest the one being
assessed by embedding each requirement's text. A precedent keeps the first `TEXT_LIMIT` (4,000)
characters of its requirement; since ADR-0114 Amendment 4 the lane cuts its query the same way.
For a long requirement, that compares the opening 4,000 characters of each: on 2026-10-28 one
requirement was 45,189 characters across 292 items, so the comparison saw under a tenth of it,
and mostly its preamble.

The assessment's reader already reads the whole requirement as need facets: short search phrases,
one per distinct need, at most 24 (`MAX_FACETS`). They are what the assessment's concept and
passage lanes search with, and a better summary to compare by than any prefix of the text.

A precedent must be compared with the same text on both sides: the precedent `RecordPrecedent`
keeps and the query the lane builds. A first design had requirement-portal send the needs with
each decision. It was dropped: requirement-portal pins the internal contract of the knowledge
release its CI runs against (ADR-0099), and no release has the field, so its pull request failed
CI. The needs are this service's own reading, so it keeps them itself.

## Decision

1. **A successful assessment keeps its needs.** When `AssessRequirement.assess` answers for a
   `requirement_id`, it keeps the need facets' text, in the reader's order and at most 24, with
   the release and reader model it was assessed on (`AssessedNeeds`). They replace any kept for
   that requirement. They are kept only once the whole assessment succeeds: an assessment that
   fails after reading keeps nothing (see the matching rule below).
2. **A decided precedent is compared by them.** `RecordPrecedent` looks up the needs kept for
   the decision's `requirement_id`. When they exist, were assessed on the release the decision
   names, and are not empty, the precedent keeps them (`Precedent.needs`) and is embedded by
   `needs_text(needs)`. Otherwise it is embedded by its text, as before.
3. **One function builds the text compared.** `needs_text(needs)` gives the same text whatever
   the reader's order, case or spacing: each need with its spacing made single and lowercased,
   once, in alphabetical order, one per line, cut at `TEXT_LIMIT`. The lane embeds the
   assessment's own need facets by it.
4. **Two text versions never share a vector space.** A precedent compared by its needs is kept
   under `"<embedding model>#needs-v1"` (`needs_space`); one compared by its text stays under the
   embedding model's name alone, as every precedent was before. The store already separates
   vectors by that key (`nearest` filters on it), and a later text version only needs a new
   suffix.
5. **The lane prefers needs, and never mixes.** It embeds the assessment's needs text and its
   cut text in one call. It searches the needs space first; only when that space holds no other
   decided precedent does it search the text space instead. Each assessment's precedents are
   ranked within one space. A requirement read without needs is compared by its text.
6. **Existing precedents are kept as they are.** Their vectors stay in the text space and are
   not re-derived: the needs they were assessed with were never kept, and reading their stored
   4,000 characters again would give different needs. They keep serving the lane until the first
   precedent with needs arrives, and keep counting in the summaries after. A later decision on
   an analysis replaces its precedent, with needs once its requirement has been assessed since.

## The matching rule: the latest successful assessment

A decision names its requirement and release, not the assessment it was made on, and this
service does not keep assessments. The rule is therefore: **a decision is compared by the needs
of the latest successful assessment of its requirement, on the release it names.** It holds
because of how requirement-portal records product impact (`AssessProductImpact`,
`_round_impact`):

- A Requirement Owner decides the product impact of the analysis's current round.
- Each round asks for an assessment. When it succeeds, the round's impact is that answer; when it
  fails (`UNAVAILABLE`), the round keeps the previous round's impact.
- So the impact decided on is that of the last round whose assessment succeeded, which is the
  latest assessment this service answered successfully for that requirement, and the one whose
  needs are kept.

If a newer assessment lands between the impact being shown and the decision, the decision is on
the newer round, whose impact carries an earlier decision only when its suggestion is unchanged
(`ProductImpact.carried_from`). The needs kept are the newer assessment's, which is the round
decided on.

**Where the rule can miss.** requirement-portal also keeps the previous impact when this service
answered but requirement-portal could not use the answer (`Product impact unusable`), or gave up
waiting while this service went on to answer (its assessment timeout). Then the needs kept are
one assessment newer than the impact decided on. A release change between them is caught (the
needs are not used); a change within one release is not. Both are failures requirement-portal
reports, and the needs are still the same requirement's, read once more.

## Storage

`architecture_requirement_needs`: one row per `requirement_id` with the needs (`jsonb`), the
release and reader model they were read with, and when (`assessed_at`). It lives behind the
precedent store (`PrecedentStorePort.keep_needs`, `assessed_needs`), since only precedents read
it. Like precedents, it is requirement text kept here from requirement work's own calls,
replaced by the next assessment and never pruned; knowledge admins never read it (ADR-0114
Amendment 1).

## Consequences

- Two requirements that need the same things are found alike even when their documents open
  differently, and the whole of a long requirement counts, not its first 4,000 characters.
- Every successful assessment for a requirement writes one row; the assessment was read-only
  before.
- Each assessment embeds two short texts for the lane instead of one, in one call.
- Once the first precedent with needs is kept, precedents without needs are no longer lent as
  examples, though they still count in monitoring. With few precedents kept so far, this was
  judged better than ranking two text versions together.
- The golden set's leave-one-out run seeds its precedents before assessing, so they have no
  needs and it still measures the text space.

## Alternatives considered

- **requirement-portal sends the needs with each decision:** built first, then dropped (see
  Context): it changes the contract requirement-portal pins, and the needs are this service's
  own reading anyway.
- **Keep every assessment's needs, by analysis version:** rejected; the assessment is not told
  the analysis version, only the requirement.
- **Read the precedent's stored text again for its needs:** rejected; the needs would differ from
  those assessed, and every decision would cost a model call.
- **Embed needs and text into the same space:** rejected; similarities of two text versions are
  not comparable.
