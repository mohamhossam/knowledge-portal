# ADR 0128 — A capability read under a business area is filed there

## Status

Proposed 2026-10-27, for the product owner's review in the pull request that adds it.

## Context

Business areas (capability domains, ADR-0089) are a shallow tree a system capability points
into through `domain_id`. The Landscape tab draws "What systems do, by business area": one
column per area, and a column "In no business area" for the rest. ADR-0123 made areas a
suggestion kind (`capability_domain`), so the reader proposes them from documents.

The reader proposed areas and capabilities as unrelated items. A capability suggestion had no
field for its area, and accepting one never set `domain_id`. Only a curator could file a
capability, by hand in the system editor's "Business area" select or through a workbook import.
On the local stack's in-service version (testManual), 323 capabilities sat in no business area
while the reading had suggested 5 areas, each from one heading ("Order Types", "Exit Charge
Management", "Faulty Device Replacement", "Speed Booster Management", "Feasibility checking for
DI/DPI orders"). These counts come from the session that asked for this change; this ADR did
not count them again.

## Decision

1. **A capability suggestion may name its business area.** `CandidateContent` gains
   `capability_domain_id`, which only a capability may hold. It names the area by id or, when
   only one area has the name, by name.
2. **The reader names an area only where the document does.** The prompt
   (catalogue-extraction-v23) asks for the capability's area (`domain`, a field the answer schema
   already had for placements) only when the document places the capability under a heading, a
   column or a row that names the business area it belongs to. Otherwise `domain` stays null.
   The reader never guesses an area, and never gives a system, team or landscape domain as one.
   The full prompts also say that a capability read under a `capability_domain` names it by the
   same name. The lean prompt (ADR-0096) leaves the rule out. It proposes no areas, and an 8k
   context with half kept for the answer has no room left for the rule.
3. **The reading resolves the name, and never adds an area for it.** A name the draft's areas
   answer to becomes that area's id. Otherwise, a name the same reading's area suggestions
   answer to becomes the suggested area's id. Any other name is dropped: the capability is
   suggested in no business area, and the reading's warnings list the names it dropped.
4. **Acceptance files only an unfiled capability, in an area the draft has.** Accepting a
   capability whose area is in the draft sets `domain_id` on a new capability, or on an existing
   one that has none. An existing capability that already has an area keeps it. When the draft
   does not have the area, for example because its suggestion was not accepted yet, the
   capability is accepted in no business area, and no area is created. Accept-all already
   accepts areas before capabilities, so a reading accepted in one go files its capabilities.
5. **The suggestion says where it files the capability.** A capability suggestion that names
   an area reads "…, filed under the business area X". When the draft does not have X yet, it
   adds "if that area is accepted first". The suggestion editor has a "Business area" select,
   like the system editor's, to change or clear the area before accepting.

## Consequences

- The public contract widens: `CandidateContentSchema.capability_domain_id`, optional. This
  change is additive. The internal contract is unchanged.
- Prompt version catalogue-extraction-v23: readings cached under v22 are read again.
- An existing capability that is unfiled is now "updates existing" when a reading names an
  area the draft has for it. If the draft does not have the area, the capability is "already
  present", so it is left out of that reading. Reading the document again once the area is
  accepted files it.
- Accepting a capability before its area leaves it unfiled. The curator can file it later in
  the system editor.
- **HYPOTHESIS:** gpt-5.1 under catalogue-extraction-v23 fills `domain` for capabilities read
  under area headings like testManual's. This needs a reading of those documents to confirm.

## Alternatives considered

- **Make the area a dependency (`needs_domain`), as a component is.** Rejected. A capability
  would wait for its area, and rejecting the area would leave the capability waiting forever,
  although the capability is worth more than the area it is filed in.
- **Create the area when the capability is accepted.** Rejected. It would create areas that
  nobody reviewed, from names the document may only mention in passing.
- **Let the model infer an area from what the capability does.** Rejected. It invents
  structure, and the catalogue holds only what documents state.
