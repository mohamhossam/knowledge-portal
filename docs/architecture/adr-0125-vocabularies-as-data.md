# ADR 0125 — Vocabularies as data, on one SKOS base

## Status

Proposed 2026-10-22. Implements recommendation 9 of the 22 October portal review
([report](https://claude.ai/artifact/TkWtaZUrpzyUYp1YYvtief)). Builds on ADR-0114's
concepts and the Phase 6 vocabularies (`docs/slices/ontology-phase-6-vocabularies.md`).

## Context

The portal has two kinds of taxonomy and no rule for which goes where. Seven controlled
vocabularies (eTOM process, channel kind, component kind, role, Open API, information entity,
document type) are curated with each version, but the list of vocabularies is a closed enum,
so adding one needs a deploy. As a result NFR quality, offering family and lifecycle stage,
business-rule kind, activity mode and phase, portfolio level and system-component technology
stay free text that curators cannot control.

Business capability concepts and vocabulary terms are the same SKOS shape, checked twice in
two modules with drifting rules, and both have only one outside match (`exact_match`), so a
reference that is close but not the same has nowhere to go.

## Decision

1. **A vocabulary is data.** A version holds `schemes`: vocabularies a curator defines
   (`ConceptScheme`: an id, a name, a definition and the fields it covers). The seven built-in
   vocabularies stay in code, because code reads them (Open API codes, role ranks, document
   types); a curated vocabulary may not take a built-in id or name.
2. **A curated vocabulary covers free-text fields.** The fields it may cover are a closed list,
   because a field must exist in the model to carry a link: an offering's NFR quality, family,
   lifecycle and business-rule kind, an activity's mode and phase, a portfolio node's level,
   and a system component's technology. Each field is covered by one vocabulary at most. Each
   gains a term id beside its text (`quality_id`, `family_id`, `lifecycle_id`, `kind_id`,
   `mode_id`, `phase_id`, `level_id`, `technology_id`), as ADR-0114's fields did, and the
   version refuses a link where no vocabulary covers the field, or to a term of another
   vocabulary.
3. **The clean-up reads those fields.** Once a vocabulary covers a field, the vocabulary
   clean-up proposes its written values as links to existing terms or as new terms, as it does
   for the built-in fields; nothing is linked until a maintainer accepts. A reading keeps the
   links a maintainer made where the text is unchanged.
4. **One SKOS base.** Concepts and terms check their shape in `skos.py`: labels, a broader
   entry in the same scheme, no cycles, a depth cap, and outside matches. Both gain
   `close_match`, the SKOS closeMatch: outside references near enough to read across, apart
   from the one `exact_match`.
5. **No language tags.** The portal is English only (PRODUCT.md, 22 October), so labels carry
   no language tag. The review proposed them for Arabic labels, which the product decision
   ruled out.
6. Every catalogue file format carries the vocabularies (`schemes`; the workbook's Schemes
   sheet), the new links (`*_term` columns) and close matches. A term in a vocabulary the file
   neither builds in nor lists is refused when the file is read. The version diff reports a
   vocabulary as its own item and the new links as `vocabulary_links`.

## Consequences

- A curator adds a vocabulary and its terms through a catalogue file or the draft's API, the
  same way terms are curated today; the portal has no editor for vocabularies or terms yet.
- In the public API a term's `scheme` is any vocabulary id rather than one of seven, and the
  release carries `schemes`. The internal contract only gains the new link fields.
- Concepts and terms stay separate registers: concepts select systems (ADR-0114) and sit in
  capability domains, which terms do not.
- Changing which fields a vocabulary covers can strand links; the version refuses it until
  the links are removed.

## Alternatives considered

- **Merge concepts and terms into one register.** Rejected for now: concepts carry a domain
  and select systems, terms carry a code and a field binding, and every reader of either would
  change at once for no new capability.
- **Let a curated vocabulary cover any field by path.** Rejected: a link needs a typed place
  in the model to be checked, kept on re-reading and carried by the files.
- **Language-tagged labels.** Ruled out by the English-only product decision; adding them
  later is a widening of the label fields.
