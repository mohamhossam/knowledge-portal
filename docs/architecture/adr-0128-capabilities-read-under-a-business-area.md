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
   answer to becomes the suggested area's id. Any other name is kept as the document wrote it,
   and no area is added for it. The reading's warnings list each such name with the
   capabilities that named it. The capability is filed under that area only if a maintainer adds
   the area before accepting it. This is how a missing system or channel is already named, as
   written until the draft resolves it.
4. **Acceptance files only an unfiled capability, in an area the draft has.** Accepting a
   capability whose area is in the draft sets `domain_id` on a new capability, or on an existing
   one that has none. An existing capability that already has an area keeps it. When the draft
   does not have the area, for example because its suggestion was not accepted yet, the
   capability is accepted in no business area, and no area is created. Accept-all already
   accepts areas before capabilities, so a reading accepted in one go files its capabilities.
5. **Decide shows where a capability is filed, and what filing it depends on.** This is shown
   wherever the decision is made, but it never blocks accepting:
   - **The suggestion's sentence** names the area before the matching phrases: "Adds the
     capability X, under the business area Y, matched by …". That way a row cut short still
     shows the area.
   - **When the draft lacks the area,** the row's State and the pane's decision say which case
     applies. If a suggestion adds the area, they say "Filed under Y only if that business area
     is accepted first", and the pane offers "Open the business area". If nothing suggests it,
     they say "Y is not in the draft and nothing suggests it: accepted now, this capability goes
     in no business area".
   - **"What waits for what"** draws the capability as waiting on its area's suggestion.
   - **The suggestion editor** has a wide "Business area" select under the capability's name,
     as the system editor has it. Its groups are "Named by the document" and "In the draft".
     When the chosen area is not in the draft, its hint says "Accepted in no business area
     unless this area is in the draft by then".

   These came out of the Impeccable critique of the first version of this change, run against
   a live seeded draft. That version said the condition only at the end of the sentence, where
   the row cut it off, and dropped an unknown area without saying so on Decide.

## Consequences

- The public contract widens: `CandidateContentSchema.capability_domain_id`, optional. This
  change is additive. The internal contract is unchanged.
- Prompt version catalogue-extraction-v23: readings cached under v22 are read again.
- An existing capability that is unfiled is now "updates existing" when a reading names an
  area the draft has for it. If the draft does not have the area, the capability is "already
  present", so it is left out of that reading. Reading the document again once the area is
  accepted files it.
- Accepting a capability before its area leaves it unfiled. Decide says so beforehand, and the
  curator can file the capability later in the system editor.
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
